import { HttpError, fail, json } from './http';
import { isEligible, rankRows, readVersions } from './leaderboards';
import { validateNickname, verifyTurnstile } from './security';
import type { BoardRow, Env, HubState, RunSession } from './types';

declare const WebSocketPair: new () => { 0: WebSocket; 1: WebSocket };
type HibernatableSocket = WebSocket & {
  serializeAttachment(value: { lastSyncAt: number; ipKey: string }): void;
  deserializeAttachment(): { lastSyncAt?: number; ipKey?: string } | null;
};
const SYNC_COOLDOWN_MS = 5000;
const MAX_ACTIVE_SOCKETS_PER_IP = 20;

interface ClaimBody {
  runId: string;
  playerId: string;
  nickname: string;
  turnstileToken?: string;
}

export class LeaderboardHub {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private state: HubState, private env: Env) {}

  fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const task = this.queue.then(() => {
      if (path === '/connect') return this.connect(request);
      if (path === '/claim' && request.method === 'POST') return this.claim(request);
      return json({ error: 'NOT_FOUND' }, 404);
    }).catch(fail);
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  private async connect(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      throw new HttpError(426, 'WEBSOCKET_REQUIRED');
    }
    const ipKey = request.headers.get('X-Edge-Client-IP') || 'unknown';
    const activeForIp = this.state.getWebSockets().filter(socket =>
      socket.readyState === WebSocket.OPEN &&
      ((socket as HibernatableSocket).deserializeAttachment()?.ipKey || 'unknown') === ipKey
    ).length;
    if (activeForIp >= MAX_ACTIVE_SOCKETS_PER_IP) {
      throw new HttpError(429, 'TOO_MANY_WEBSOCKETS');
    }
    const revisions = await readVersions(this.env.DB);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as HibernatableSocket;
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ lastSyncAt: Date.now(), ipKey });
    server.send(JSON.stringify({ type: 'leaderboard.sync', ...revisions }));
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if ((typeof message === 'string' && message.length > 32) ||
        (message instanceof ArrayBuffer && message.byteLength > 32)) {
      socket.close(1009, 'Message too large');
      return;
    }
    if (typeof message !== 'string') {
      socket.close(1003, 'Text messages only');
      return;
    }
    if (message !== 'sync') {
      socket.close(1008, 'Unsupported message');
      return;
    }
    const connected = socket as HibernatableSocket;
    const attachment = connected.deserializeAttachment() || { ipKey: 'unknown' };
    const previous = attachment.lastSyncAt || 0;
    const now = Date.now();
    if (now - previous < SYNC_COOLDOWN_MS) return;
    connected.serializeAttachment({ lastSyncAt: now, ipKey: attachment.ipKey || 'unknown' });
    const revisions = await readVersions(this.env.DB);
    socket.send(JSON.stringify({ type: 'leaderboard.sync', ...revisions }));
  }

  private broadcast(gameId: string, version: number, globalVersion: number): void {
    const event = JSON.stringify({ type: 'leaderboard.updated', gameId, version, globalVersion });
    for (const socket of this.state.getWebSockets()) {
      try { socket.send(event); } catch { /* Disconnected clients reconcile on reconnect. */ }
    }
  }

  private async claim(request: Request): Promise<Response> {
    const body = await request.json() as ClaimBody;
    if (!body || typeof body.runId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.runId) ||
        typeof body.playerId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.playerId)) {
      throw new HttpError(400, 'INVALID_CLAIM');
    }
    const nickname = validateNickname(body.nickname);
    const run = await this.env.DB.prepare('SELECT * FROM run_sessions WHERE run_id = ?')
      .bind(body.runId).first<RunSession>();
    if (!run) throw new HttpError(404, 'RUN_NOT_FOUND');
    if (run.player_id !== body.playerId) throw new HttpError(403, 'RUN_OWNER_MISMATCH');
    if (run.status === 'CLAIMED') {
      return json({ accepted: true, rank: run.claim_rank, finalScore: run.verified_final_score, boardVersion: run.claim_board_version });
    }
    if (run.status !== 'VERIFIED' || run.eligible_to_claim !== 1 || !run.verified_at ||
        Date.now() > run.verified_at + 120_000) {
      throw new HttpError(409, 'NOT_ELIGIBLE');
    }
    const verified = await this.env.DB.prepare('SELECT raw_score, final_score, start_level FROM verified_runs WHERE run_id = ?')
      .bind(body.runId).first<{ raw_score: number; final_score: number; start_level: number }>();
    if (!verified || verified.final_score !== run.verified_final_score || verified.final_score <= 0) {
      throw new HttpError(409, 'NOT_ELIGIBLE');
    }
    const result = await this.env.DB.prepare('SELECT * FROM leaderboard_entries WHERE game_id = ? ORDER BY final_score DESC, achieved_at ASC, entry_id ASC LIMIT 10')
      .bind(run.game_id).all<BoardRow>();
    if (!isEligible(result.results, run.player_id, verified.final_score)) {
      throw new HttpError(409, 'NOT_ELIGIBLE');
    }
    await verifyTurnstile(
      body.turnstileToken,
      this.env.TURNSTILE_SECRET,
      request.headers.get('X-Original-Host') || '',
      request.headers.get('X-Client-IP') || '',
    );
    const now = Date.now();
    const entryId = crypto.randomUUID();
    const candidate = {
      entry_id: entryId,
      game_id: run.game_id,
      player_id: run.player_id,
      run_id: run.run_id,
      nickname,
      raw_score: verified.raw_score,
      start_level: verified.start_level,
      final_score: verified.final_score,
      achieved_at: now,
    };
    const after = rankRows([...result.results.filter(row => row.player_id !== run.player_id), candidate]);
    const rank = after.findIndex(row => row.entry_id === entryId) + 1;
    if (rank < 1 || rank > 10) throw new HttpError(409, 'NOT_ELIGIBLE');
    const revisions = await readVersions(this.env.DB);
    const boardVersion = revisions.versions[run.game_id] + 1;
    const globalVersion = revisions.globalVersion + 1;
    await this.env.DB.batch([
      this.env.DB.prepare('DELETE FROM leaderboard_entries WHERE game_id = ? AND player_id = ?')
        .bind(run.game_id, run.player_id),
      this.env.DB.prepare(`INSERT INTO leaderboard_entries
        (entry_id, game_id, player_id, run_id, nickname, raw_score, start_level, final_score, achieved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(entryId, run.game_id, run.player_id, run.run_id, nickname, verified.raw_score,
          verified.start_level, verified.final_score, now),
      this.env.DB.prepare(`DELETE FROM leaderboard_entries WHERE game_id = ? AND entry_id NOT IN
        (SELECT entry_id FROM leaderboard_entries WHERE game_id = ?
         ORDER BY final_score DESC, achieved_at ASC, entry_id ASC LIMIT 10)`)
        .bind(run.game_id, run.game_id),
      this.env.DB.prepare(`UPDATE run_sessions SET status = 'CLAIMED', claimed_at = ?, claim_rank = ?,
        claim_board_version = ? WHERE run_id = ? AND status = 'VERIFIED'`)
        .bind(now, rank, boardVersion, run.run_id),
      this.env.DB.prepare('UPDATE leaderboard_versions SET version = version + 1 WHERE game_id = ?')
        .bind(run.game_id),
      this.env.DB.prepare('UPDATE leaderboard_meta SET global_version = global_version + 1 WHERE singleton = 1'),
    ]);
    this.broadcast(run.game_id, boardVersion, globalVersion);
    return json({ accepted: true, rank, finalScore: verified.final_score, boardVersion });
  }
}
