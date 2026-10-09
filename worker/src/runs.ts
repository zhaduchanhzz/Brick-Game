import { GAME_IDS } from '../../src/engine/registry.js';
import { RULES_VERSION, TICK_RATE, MAX_TICKS, MAX_EVENTS, SUPPORTED_RANKED_GAMES, verifyReplay } from '../../src/engine/replay.js';
import { HttpError, json, readJson } from './http';
import { isEligible, validGameId } from './leaderboards';
import { applyRateLimit, newVisitor, readVisitor, requireSessionSecret, validateNickname } from './security';
import type { BoardRow, Env, RunSession } from './types';

const RUN_TTL_MS = 11 * 60_000;
const TICK_GRACE_MS = 3_000;
const MAX_BODY_BYTES = 256 * 1024;
const runPattern = /^[0-9a-f-]{36}$/;

function objectWithKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(value, key));
}

function requireRunId(runId: string): void {
  if (!runPattern.test(runId)) throw new HttpError(400, 'INVALID_RUN_ID');
}

function finishedResponse(session: RunSession): Response {
  return json({
    verified: true,
    rawScore: session.verified_raw_score,
    startLevel: session.start_level,
    finalScore: session.verified_final_score,
    eligibleToClaim: session.eligible_to_claim === 1,
  });
}

export async function startRun(request: Request, env: Env): Promise<Response> {
  const secret = requireSessionSecret(env);
  const oldVisitor = await readVisitor(request, secret);
  await applyRateLimit(env.START_LIMIT, request, oldVisitor);
  const body = await readJson(request, 4096);
  if (!objectWithKeys(body, ['gameId', 'startLevel', 'startSpeed']) || !validGameId(body.gameId) ||
      !(SUPPORTED_RANKED_GAMES as readonly string[]).includes(body.gameId) ||
      !Number.isInteger(body.startLevel) || (body.startLevel as number) < 1 || (body.startLevel as number) > 10 ||
      !Number.isInteger(body.startSpeed) || (body.startSpeed as number) < 1 || (body.startSpeed as number) > 6) {
    throw new HttpError(400, 'INVALID_RUN');
  }
  const visitor = oldVisitor ? { id: oldVisitor, cookie: null } : await newVisitor(request, secret);
  const runId = crypto.randomUUID();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  const now = Date.now();
  const expiresAt = now + RUN_TTL_MS;
  await env.DB.prepare(`INSERT INTO run_sessions
    (run_id, player_id, game_id, start_level, start_speed, seed, rules_version, status, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'STARTED', ?, ?)`)
    .bind(runId, visitor.id, body.gameId, body.startLevel as number, body.startSpeed as number, seed, RULES_VERSION, now, expiresAt).run();
  return json({ runId, seed, rulesVersion: RULES_VERSION, tickRate: TICK_RATE,
      startSpeed: body.startSpeed, expiresAt: new Date(expiresAt).toISOString() },
    201, visitor.cookie ? { 'Set-Cookie': visitor.cookie } : undefined);
}

function validateFinish(body: unknown, elapsedMs: number): { rulesVersion: number; totalTicks: number; events: { tick: number; action: string }[] } {
  if (!objectWithKeys(body, ['rulesVersion', 'totalTicks', 'actions']) ||
      body.rulesVersion !== RULES_VERSION || !Number.isInteger(body.totalTicks) ||
      (body.totalTicks as number) < 1 || (body.totalTicks as number) > MAX_TICKS ||
      !Array.isArray(body.actions) || body.actions.length > MAX_EVENTS) {
    throw new HttpError(400, 'INVALID_REPLAY_SCHEMA');
  }
  const totalTicks = body.totalTicks as number;
  const maxElapsedTicks = Math.floor((elapsedMs + TICK_GRACE_MS) * TICK_RATE / 1000);
  if (totalTicks > maxElapsedTicks) throw new HttpError(422, 'INVALID_REPLAY');
  let previousTick = 0;
  const events: { tick: number; action: string }[] = [];
  for (const event of body.actions) {
    if (!objectWithKeys(event, ['tick', 'action']) || !Number.isInteger(event.tick) ||
        (event.tick as number) <= previousTick || (event.tick as number) > totalTicks ||
        typeof event.action !== 'string' || event.action.length > 32) {
      throw new HttpError(400, 'INVALID_REPLAY_SCHEMA');
    }
    previousTick = event.tick as number;
    events.push({ tick: previousTick, action: event.action });
  }
  return { rulesVersion: RULES_VERSION, totalTicks, events };
}

export async function finishRun(request: Request, env: Env, runId: string): Promise<Response> {
  requireRunId(runId);
  const secret = requireSessionSecret(env);
  const visitor = await readVisitor(request, secret);
  if (!visitor) throw new HttpError(401, 'VISITOR_REQUIRED');
  await applyRateLimit(env.FINISH_LIMIT, request, visitor);
  const session = await env.DB.prepare('SELECT * FROM run_sessions WHERE run_id = ?').bind(runId).first<RunSession>();
  if (!session) throw new HttpError(404, 'RUN_NOT_FOUND');
  if (session.player_id !== visitor) throw new HttpError(403, 'RUN_OWNER_MISMATCH');
  if (session.status === 'VERIFIED' || session.status === 'CLAIMED') return finishedResponse(session);
  if (session.status !== 'STARTED') throw new HttpError(409, 'INVALID_RUN_STATE');
  const now = Date.now();
  if (now > session.expires_at) throw new HttpError(409, 'RUN_EXPIRED');
  if (!validGameId(session.game_id) || !(GAME_IDS as readonly string[]).includes(session.game_id) ||
      !(SUPPORTED_RANKED_GAMES as readonly string[]).includes(session.game_id) || session.rules_version !== RULES_VERSION) {
    throw new HttpError(409, 'RULES_VERSION_UNAVAILABLE');
  }
  const body = await readJson(request, MAX_BODY_BYTES);
  const log = validateFinish(body, now - session.created_at);
  let result: { terminal: boolean; rawScore: number };
  try {
    result = verifyReplay({
      gameId: session.game_id,
      seed: session.seed,
      startLevel: session.start_level,
      startSpeed: session.start_speed,
      totalTicks: log.totalTicks,
      events: log.events,
    });
  } catch (error) {
    console.warn('Replay rejected', { runId, reason: error instanceof Error ? error.message : 'unknown' });
    throw new HttpError(422, 'INVALID_REPLAY');
  }
  if (!result?.terminal || !Number.isSafeInteger(result.rawScore) || result.rawScore < 0 ||
      !Number.isSafeInteger(result.rawScore * session.start_level)) {
    throw new HttpError(422, 'INVALID_REPLAY');
  }
  const finalScore = result.rawScore * session.start_level;
  const boardRows = await env.DB.prepare('SELECT * FROM leaderboard_entries WHERE game_id = ? ORDER BY final_score DESC, achieved_at ASC, entry_id ASC LIMIT 10')
    .bind(session.game_id).all<BoardRow>();
  const eligible = isEligible(boardRows.results, visitor, finalScore);
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO verified_runs
        (run_id, player_id, game_id, start_level, raw_score, final_score, rules_version, verified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(runId, visitor, session.game_id, session.start_level, result.rawScore, finalScore, RULES_VERSION, now),
      env.DB.prepare(`UPDATE run_sessions SET status = 'VERIFIED', verified_at = ?,
        verified_raw_score = ?, verified_final_score = ?, eligible_to_claim = ?
        WHERE run_id = ? AND status = 'STARTED'`)
        .bind(now, result.rawScore, finalScore, eligible ? 1 : 0, runId),
    ]);
  } catch (error) {
    const updated = await env.DB.prepare('SELECT * FROM run_sessions WHERE run_id = ?').bind(runId).first<RunSession>();
    if (updated && updated.player_id === visitor && (updated.status === 'VERIFIED' || updated.status === 'CLAIMED')) {
      return finishedResponse(updated);
    }
    throw error;
  }
  return json({ verified: true, rawScore: result.rawScore, startLevel: session.start_level, finalScore, eligibleToClaim: eligible });
}

export async function claimRun(request: Request, env: Env, runId: string): Promise<Response> {
  requireRunId(runId);
  const secret = requireSessionSecret(env);
  const visitor = await readVisitor(request, secret);
  if (!visitor) throw new HttpError(401, 'VISITOR_REQUIRED');
  await applyRateLimit(env.CLAIM_LIMIT, request, visitor);
  const body = await readJson(request, 4096);
  if (!objectWithKeys(body, ['nickname']) && !objectWithKeys(body, ['nickname', 'turnstileToken'])) {
    throw new HttpError(400, 'INVALID_CLAIM');
  }
  const nickname = validateNickname(body.nickname);
  const turnstileToken = body.turnstileToken;
  if (turnstileToken !== undefined && typeof turnstileToken !== 'string') throw new HttpError(400, 'INVALID_CLAIM');
  const hub = env.LEADERBOARD_HUB.get(env.LEADERBOARD_HUB.idFromName('leaderboards'));
  const internalRequest = new Request('https://leaderboard-hub.internal/claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Original-Host': new URL(request.url).hostname,
      'X-Client-IP': request.headers.get('CF-Connecting-IP') || '',
    },
    body: JSON.stringify({ runId, playerId: visitor, nickname, turnstileToken }),
  });
  return hub.fetch(internalRequest);
}
