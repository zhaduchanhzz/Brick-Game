import { fail, HttpError, json, assertOrigin } from './http';
import { readLeaderboards } from './leaderboards';
import { startRun, finishRun, claimRun } from './runs';
import { applyRateLimit } from './security';
import { cleanupOldRuns } from './retention';
import type { Env } from './types';

export { LeaderboardHub } from './LeaderboardHub';

const runRoute = /^\/api\/runs\/([0-9a-f-]+)\/(finish|claim)$/;

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/api/health' && request.method === 'GET') {
    return json({ ok: true, ranked: env.ENABLE_RANKED === 'true' });
  }
  if (path === '/api/leaderboards' && request.method === 'GET') {
    const gameId = url.searchParams.get('gameId');
    if (Array.from(url.searchParams.keys()).some(key => key !== 'gameId') || url.searchParams.getAll('gameId').length > 1) {
      throw new HttpError(400, 'INVALID_QUERY');
    }
    return json(await readLeaderboards(env.DB, gameId === null ? undefined : gameId));
  }
  if (path === '/ws/leaderboards') {
    if (env.ENABLE_LEADERBOARD_WS !== 'true') throw new HttpError(503, 'WEBSOCKET_UNAVAILABLE');
    if (request.method !== 'GET') throw new HttpError(405, 'METHOD_NOT_ALLOWED');
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426, 'WEBSOCKET_REQUIRED');
    await applyRateLimit(env.WS_LIMIT, request, null);
    const hub = env.LEADERBOARD_HUB.get(env.LEADERBOARD_HUB.idFromName('leaderboards'));
    // Cloudflare sets CF-Connecting-IP at the edge. Never forward caller-supplied
    // X-Forwarded-For or X-Edge-* headers into the Durable Object.
    const edgeIp = request.headers.get('CF-Connecting-IP');
    const ipKey = edgeIp && /^[0-9a-fA-F:.]{3,45}$/.test(edgeIp) ? edgeIp.toLowerCase() : 'unknown';
    return hub.fetch(new Request('https://leaderboard-hub.internal/connect', {
      headers: { Upgrade: 'websocket', 'X-Edge-Client-IP': ipKey },
    }));
  }
  if (path.startsWith('/api/runs')) {
    if (env.ENABLE_RANKED !== 'true') throw new HttpError(503, 'RANKED_UNAVAILABLE');
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED');
    assertOrigin(request);
    if (path === '/api/runs') return startRun(request, env);
    const match = runRoute.exec(path);
    if (!match) throw new HttpError(404, 'NOT_FOUND');
    return match[2] === 'finish' ? finishRun(request, env, match[1]) : claimRun(request, env, match[1]);
  }
  if (path.startsWith('/api/') || path.startsWith('/ws/')) throw new HttpError(404, 'NOT_FOUND');
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try { return await handle(request, env); } catch (error) { return fail(error); }
  },
  async scheduled(controller: { scheduledTime: number }, env: Env): Promise<void> {
    const result = await cleanupOldRuns(env.DB, controller.scheduledTime);
    console.log('Run retention cleanup', result);
  },
};
