import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
const config = path.join(root, 'wrangler.test.jsonc');
const secret = 'local-integration-secret-with-more-than-32-characters';

function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], { cwd: root, env });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(`wrangler ${args[0]} failed (${code}): ${output.slice(-3000)}`)));
  });
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function makeRun(gameId, score, playerId = randomUUID(), claimed = false) {
  return { gameId, score, playerId, runId: randomUUID(), entryId: claimed ? randomUUID() : null };
}

function seedStatements(run, time, rank = 0) {
  const claimed = !!run.entryId;
  const columns = `(run_id, player_id, game_id, start_level, start_speed, seed, rules_version,
    status, created_at, expires_at, verified_at, verified_raw_score, verified_final_score,
    eligible_to_claim, claimed_at, claim_rank, claim_board_version)`;
  const session = `INSERT INTO run_sessions ${columns} VALUES (
    ${sqlText(run.runId)}, ${sqlText(run.playerId)}, ${sqlText(run.gameId)}, 1, 1, 1, 1,
    ${sqlText(claimed ? 'CLAIMED' : 'VERIFIED')}, ${time - 1000}, ${time + 600000}, ${time},
    ${run.score}, ${run.score}, 1, ${claimed ? time : 'NULL'}, ${claimed ? rank : 'NULL'},
    ${claimed ? 0 : 'NULL'});`;
  const verified = `INSERT INTO verified_runs
    (run_id, player_id, game_id, start_level, raw_score, final_score, rules_version, verified_at)
    VALUES (${sqlText(run.runId)}, ${sqlText(run.playerId)}, ${sqlText(run.gameId)}, 1,
    ${run.score}, ${run.score}, 1, ${time});`;
  const entry = claimed ? `INSERT INTO leaderboard_entries
    (entry_id, game_id, player_id, run_id, nickname, raw_score, start_level, final_score, achieved_at)
    VALUES (${sqlText(run.entryId)}, ${sqlText(run.gameId)}, ${sqlText(run.playerId)},
    ${sqlText(run.runId)}, ${sqlText(`OLD_${rank}`)}, ${run.score}, 1, ${run.score}, ${time + rank});` : '';
  return `${session}\n${verified}\n${entry}`;
}

function cookieFor(playerId) {
  const mac = createHmac('sha256', secret).update(playerId).digest('base64url');
  return `brick_visitor=${playerId}.${mac}`;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function rawWebSocketStatus(port, extraHeader = '') {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let data = '';
    socket.once('error', reject);
    socket.on('data', chunk => {
      data += chunk.toString('utf8');
      const firstLine = data.split('\r\n')[0];
      const match = /^HTTP\/1\.1 (\d{3}) /.exec(firstLine);
      if (match) {
        socket.destroy();
        resolve(Number(match[1]));
      }
    });
    socket.on('connect', () => socket.write(
      `GET /ws/leaderboards HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
      `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n` +
      `${extraHeader}\r\n`
    ));
  });
}

async function queryCount(stateDir, env, sql) {
  const output = await runCli(['d1', 'execute', 'brick-game-test-db', '--local', '--json',
    '--config', config, '--persist-to', stateDir, '--command', sql], env);
  const match = /"remaining"\s*:\s*(\d+)/.exec(output);
  if (!match) throw new Error(`Could not read D1 query output: ${output.slice(-1500)}`);
  return Number(match[1]);
}

async function waitForServer(origin, child, getLogs) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited: ${getLogs().slice(-3000)}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch { /* Server is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`wrangler dev did not start: ${getLogs().slice(-3000)}`);
}

test('Worker D1, Durable Object claims, and WebSocket integration', { timeout: 120000 }, async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'brick-worker-test-'));
  const env = { ...process.env, WRANGLER_LOG_PATH: path.join(stateDir, 'wrangler.log'), WRANGLER_SEND_METRICS: 'false' };
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  let dev;
  let socket;
  let logs = '';
  try {
    await runCli(['d1', 'migrations', 'apply', 'brick-game-test-db', '--local', '--config', config, '--persist-to', stateDir], env);
    const now = Date.now();
    const oldAt = now - 91 * 24 * 60 * 60 * 1000;
    const contenders = Array.from({ length: 100 }, (_, index) => makeRun('tank', index + 11));
    const tieResidents = Array.from({ length: 10 }, (_, index) => makeRun('tetris', 100, randomUUID(), true));
    const tieVisitor = makeRun('tetris', 100);
    const improvement = makeRun('tank', 111, contenders[99].playerId);
    const oldHistory = makeRun('racing', 55);
    const all = [...contenders, ...tieResidents, tieVisitor, improvement, oldHistory];
    for (let index = 0; index < all.length; index += 15) {
      const statements = all.slice(index, index + 15).map((run, offset) =>
        seedStatements(run, tieResidents.includes(run) || run === oldHistory ? oldAt : now, index + offset + 1)
      ).join('\n');
      await runCli(['d1', 'execute', 'brick-game-test-db', '--local', '--config', config,
        '--persist-to', stateDir, '--command', statements], env);
    }
    for (const prefix of ['a', 'b']) {
      await runCli(['d1', 'execute', 'brick-game-test-db', '--local', '--config', config,
        '--persist-to', stateDir, '--command', `WITH RECURSIVE seq(n) AS (
          SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 550
        ) INSERT INTO run_sessions
          (run_id, player_id, game_id, start_level, start_speed, seed, rules_version,
           status, created_at, expires_at)
        SELECT 'stale-${prefix}-' || n, 'stale-player', 'snake', 1, 1, 1, 1,
          'STARTED', ${oldAt}, ${oldAt + 600000} FROM seq;`], env);
    }
    // A player who started under v2 must still be able to finish after v3 deploys.
    const legacyRun = { runId: randomUUID(), playerId: randomUUID(), seed: 12345 };
    await runCli(['d1', 'execute', 'brick-game-test-db', '--local', '--config', config,
      '--persist-to', stateDir, '--command', `INSERT INTO run_sessions
      (run_id, player_id, game_id, start_level, start_speed, seed, rules_version,
       status, created_at, expires_at)
      VALUES (${sqlText(legacyRun.runId)}, ${sqlText(legacyRun.playerId)}, 'snake',
        1, 6, ${legacyRun.seed}, 2, 'STARTED', ${now}, ${now + 660000});`], env);
    dev = spawn(process.execPath, [wrangler, 'dev', '--config', config, '--persist-to', stateDir,
      '--port', String(port), '--var', `SESSION_SECRET:${secret}`, '--test-scheduled',
      '--show-interactive-dev-session', 'false'],
      { cwd: root, env });
    dev.stdout.on('data', chunk => { logs += chunk; });
    dev.stderr.on('data', chunk => { logs += chunk; });
    await waitForServer(origin, dev, () => logs);

    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.deepEqual(health, { ok: true, ranked: true });
    const initial = await (await fetch(`${origin}/api/leaderboards`)).json();
    assert.equal(Object.keys(initial.games).length, 6);
    assert.equal(initial.games.tetris.entries.length, 10);
    assert.equal(initial.games.tank.entries.length, 0);
    assert.equal((await fetch(`${origin}/api/leaderboards?gameId=unknown`)).status, 400);
    assert.equal((await fetch(`${origin}/api/leaderboards?gameId=`)).status, 400);
    const defaultLocaleError = await fetch(`${origin}/api/leaderboards?gameId=unknown`);
    assert.equal(defaultLocaleError.headers.get('Content-Language'), 'vi');
    assert.deepEqual(await defaultLocaleError.json(), {
      error: 'INVALID_GAME_ID', message: 'Trò chơi không hợp lệ.',
    });
    const englishError = await fetch(`${origin}/api/leaderboards?gameId=unknown`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.8,vi;q=0.5' },
    });
    assert.equal(englishError.headers.get('Content-Language'), 'en');
    assert.deepEqual(await englishError.json(), {
      error: 'INVALID_GAME_ID', message: 'Invalid game.',
    });
    assert.match(englishError.headers.get('Vary'), /Accept-Language/);
    const chineseError = await fetch(`${origin}/api/leaderboards?gameId=unknown`, {
      headers: { 'Accept-Language': 'en; q=0.5, zh-CN; q=0.9' },
    });
    assert.equal(chineseError.headers.get('Content-Language'), 'zh-CN');
    assert.deepEqual(await chineseError.json(), {
      error: 'INVALID_GAME_ID', message: '游戏无效。',
    });
    const overrideError = await fetch(`${origin}/api/leaderboards?gameId=unknown`, {
      headers: { 'Accept-Language': 'en-US', 'X-Game-Locale': 'vi' },
    });
    assert.equal(overrideError.headers.get('Content-Language'), 'vi');
    assert.equal((await overrideError.json()).error, 'INVALID_GAME_ID');

    const messages = [];
    socket = new WebSocket(`${origin.replace('http:', 'ws:')}/ws/leaderboards`);
    socket.addEventListener('message', event => messages.push(JSON.parse(event.data)));
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    const syncDeadline = Date.now() + 2000;
    while (!messages.length && Date.now() < syncDeadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(messages[0]?.type, 'leaderboard.sync');
    assert.equal(messages[0]?.versions.tetris, 0);
    socket.send('sync');
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(messages.length, 1, 'sync flood should not trigger another D1-backed event');
    const extraSockets = [];
    for (let index = 0; index < 19; index++) {
      const viewer = new WebSocket(`${origin.replace('http:', 'ws:')}/ws/leaderboards`);
      await new Promise((resolve, reject) => {
        viewer.addEventListener('open', resolve, { once: true });
        viewer.addEventListener('error', reject, { once: true });
      });
      extraSockets.push(viewer);
    }
    assert.equal(await rawWebSocketStatus(port, 'X-Edge-Client-IP: forged-other-ip\r\n'), 429);
    extraSockets[0].close();
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(await rawWebSocketStatus(port), 101);
    for (const viewer of extraSockets) viewer.close();

    async function post(pathname, body, cookie, extraHeaders = {}) {
      return fetch(`${origin}${pathname}`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
        body: JSON.stringify(body),
      });
    }
    const badStart = await post('/api/runs', { gameId: 'snake', startLevel: 1, startSpeed: 1, score: 9999999 });
    assert.equal(badStart.status, 400);
    assert.equal((await post('/api/runs', { gameId: 'snake', startLevel: 1, startSpeed: 7 })).status, 400);
    assert.equal((await fetch(`${origin}/api/runs`, { method: 'POST',
      headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: 'snake', startLevel: 1, startSpeed: 1 }),
    })).status, 403);
    const start = await post('/api/runs', { gameId: 'snake', startLevel: 5, startSpeed: 4 });
    assert.equal(start.status, 201);
    const started = await start.json();
    assert.equal(started.startSpeed, 4);
    assert.match(start.headers.get('Set-Cookie'), /HttpOnly/);
    const cookie = start.headers.get('Set-Cookie').split(';')[0];
    assert.equal((await post(`/api/runs/${started.runId}/finish`,
      { rulesVersion: started.rulesVersion - 1, totalTicks: 1, actions: [] }, cookie)).status, 400);
    const forgedFinish = await post(`/api/runs/${started.runId}/finish`,
      { rulesVersion: started.rulesVersion, totalTicks: 1, actions: [], score: 9999999 }, cookie);
    assert.equal(forgedFinish.status, 400);
    assert.equal((await post(`/api/runs/${started.runId}/finish`,
      { rulesVersion: started.rulesVersion, totalTicks: 1, actions: [], gameId: 'tank', startLevel: 10 }, cookie)).status, 400);
    const earlyFinish = await post(`/api/runs/${started.runId}/finish`,
      { rulesVersion: started.rulesVersion, totalTicks: 1, actions: [] }, cookie);
    assert.equal(earlyFinish.status, 422);

    // Produce a terminal trace from the exact shared engine code, then send it
    // concurrently to prove the Worker stores one server-computed result.
    const engineBundle = await build({
      entryPoints: [path.join(root, 'src/engine/replay.js')],
      bundle: true,
      platform: 'neutral',
      format: 'esm',
      write: false,
    });
    const engineUrl = `data:text/javascript;base64,${Buffer.from(engineBundle.outputFiles[0].contents).toString('base64')}`;
    const engine = await import(engineUrl);
    let legacyState = engine.createInitialState('snake', legacyRun.seed, 1, 6, 2);
    while (!legacyState.terminal && legacyState.tick < engine.MAX_TICKS) {
      legacyState = engine.step(legacyState, legacyState.tick === 0 ? 'left' : null);
    }
    assert.equal(legacyState.terminal, true);
    const legacyRemainingMs = legacyState.tick * 1000 / engine.TICK_RATE - 3000 - (Date.now() - now) + 200;
    if (legacyRemainingMs > 0) await new Promise(resolve => setTimeout(resolve, legacyRemainingMs));
    const legacyLog = { rulesVersion: 2, totalTicks: legacyState.tick,
      actions: [{ tick: 1, action: 'left' }] };
    const legacyMismatch = await post(`/api/runs/${legacyRun.runId}/finish`,
      { ...legacyLog, rulesVersion: 3 }, cookieFor(legacyRun.playerId));
    assert.equal(legacyMismatch.status, 400);
    const legacyFinish = await post(`/api/runs/${legacyRun.runId}/finish`,
      legacyLog, cookieFor(legacyRun.playerId));
    assert.equal(legacyFinish.status, 200);
    const legacyVerified = await legacyFinish.json();
    assert.equal(legacyVerified.rawScore, legacyState.score);
    assert.equal(legacyVerified.finalScore, legacyState.score);
    let replayStartAt;
    let replaySession;
    let replayCookie;
    let state;
    // A random seed can end this simple replay before the snake scores.
    for (let attempt = 0; attempt < 20; attempt++) {
      replayStartAt = Date.now();
      const replayStart = await post('/api/runs', { gameId: 'snake', startLevel: 5, startSpeed: 4 });
      assert.equal(replayStart.status, 201);
      replaySession = await replayStart.json();
      replayCookie = replayStart.headers.get('Set-Cookie').split(';')[0];
      state = engine.createInitialState('snake', replaySession.seed, 5, 4);
      while (!state.terminal && state.tick < engine.MAX_TICKS) {
        state = engine.step(state, state.tick === 0 ? 'left' : null);
      }
      if (state.score > 0) break;
    }
    assert.equal(state.terminal, true);
    assert.ok(state.score > 0);
    const remainingMs = state.tick * 1000 / engine.TICK_RATE - 3000 - (Date.now() - replayStartAt) + 200;
    if (remainingMs > 0) await new Promise(resolve => setTimeout(resolve, remainingMs));
    const validLog = { rulesVersion: replaySession.rulesVersion, totalTicks: state.tick,
      actions: [{ tick: 1, action: 'left' }] };
    const finished = await Promise.all([
      post(`/api/runs/${replaySession.runId}/finish`, validLog, replayCookie),
      post(`/api/runs/${replaySession.runId}/finish`, validLog, replayCookie),
    ]);
    assert.deepEqual(finished.map(response => response.status), [200, 200]);
    const verified = await Promise.all(finished.map(response => response.json()));
    assert.deepEqual(verified[0], verified[1]);
    assert.equal(verified[0].rawScore, state.score);
    assert.equal(verified[0].startLevel, 5);
    assert.equal(verified[0].finalScore, state.score * 5);

    const tied = await post(`/api/runs/${tieVisitor.runId}/claim`, { nickname: 'TIED_PLAYER' },
      cookieFor(tieVisitor.playerId), { 'Accept-Language': 'zh-CN' });
    assert.equal(tied.status, 409);
    assert.equal(tied.headers.get('Content-Language'), 'zh-CN');
    assert.deepEqual(await tied.json(), {
      error: 'NOT_ELIGIBLE', message: '该分数未达到前十名资格。',
    });
    const first = contenders[0];
    assert.equal((await post(`/api/runs/${first.runId}/claim`,
      { nickname: '<script>alert(1)</script>' }, cookieFor(first.playerId))).status, 400);
    assert.equal((await post(`/api/runs/${first.runId}/claim`,
      { nickname: "' OR 1=1 --" }, cookieFor(first.playerId))).status, 400);
    assert.equal((await post(`/api/runs/${first.runId}/claim`,
      { nickname: 'PLAYER_0', finalScore: 9999999 }, cookieFor(first.playerId))).status, 400);

    const results = await Promise.all(contenders.map((run, index) =>
      post(`/api/runs/${run.runId}/claim`, { nickname: `PLAYER_${index}` }, cookieFor(run.playerId))));
    const accepted = results.filter(result => result.status === 200).length;
    assert.ok(accepted >= 10, `expected at least ten accepted claims, got ${accepted}`);
    assert.ok(results.every(result => result.status === 200 || result.status === 409),
      `unexpected claim statuses: ${results.map(result => result.status).join(',')}`);
    const tank = await (await fetch(`${origin}/api/leaderboards?gameId=tank`)).json();
    assert.equal(tank.entries.length, 10);
    assert.deepEqual(tank.entries.map(entry => entry.finalScore), [110, 109, 108, 107, 106, 105, 104, 103, 102, 101]);
    assert.equal(tank.version, accepted);
    assert.equal((await (await fetch(`${origin}/api/leaderboards?gameId=tetris`)).json()).version, 0);

    const winner = contenders[99];
    const repeat = await post(`/api/runs/${winner.runId}/claim`, { nickname: 'ANOTHER_NAME' }, cookieFor(winner.playerId));
    assert.equal(repeat.status, 200);
    assert.equal((await repeat.json()).boardVersion <= accepted, true);
    assert.equal((await (await fetch(`${origin}/api/leaderboards?gameId=tank`)).json()).version, accepted);

    const better = await post(`/api/runs/${improvement.runId}/claim`, { nickname: 'IMPROVED' }, cookieFor(improvement.playerId));
    assert.equal(better.status, 200);
    const improved = await (await fetch(`${origin}/api/leaderboards?gameId=tank`)).json();
    assert.equal(improved.version, accepted + 1);
    assert.equal(improved.entries[0].finalScore, 111);
    assert.equal(improved.entries.filter(entry => entry.nickname === 'IMPROVED').length, 1);
    assert.equal(improved.entries.length, 10);
    assert.ok(messages.some(message => message.type === 'leaderboard.updated' && message.gameId === 'tank'));
    const reconnect = new WebSocket(`${origin.replace('http:', 'ws:')}/ws/leaderboards`);
    const resync = await new Promise((resolve, reject) => {
      reconnect.addEventListener('message', event => resolve(JSON.parse(event.data)), { once: true });
      reconnect.addEventListener('error', reject, { once: true });
    });
    assert.equal(resync.type, 'leaderboard.sync');
    assert.equal(resync.versions.tank, accepted + 1);
    assert.equal(resync.versions.tetris, 0);
    assert.equal(resync.globalVersion, accepted + 1);
    reconnect.close();
    const oversized = new WebSocket(`${origin.replace('http:', 'ws:')}/ws/leaderboards`);
    const closeCode = await new Promise((resolve, reject) => {
      oversized.addEventListener('open', () => oversized.send('x'.repeat(64)), { once: true });
      oversized.addEventListener('close', event => resolve(event.code), { once: true });
      oversized.addEventListener('error', reject, { once: true });
    });
    assert.equal(closeCode, 1009);

    const firstCleanup = await fetch(`${origin}/cdn-cgi/local/scheduled?format=json`);
    assert.equal(firstCleanup.ok, true);
    assert.equal(await queryCount(stateDir, env,
      "SELECT COUNT(*) AS remaining FROM run_sessions WHERE run_id LIKE 'stale-%'"), 101);
    assert.equal(await queryCount(stateDir, env,
      `SELECT COUNT(*) AS remaining FROM verified_runs WHERE run_id = '${oldHistory.runId}'`), 0);
    assert.equal(await queryCount(stateDir, env,
      "SELECT COUNT(*) AS remaining FROM leaderboard_entries WHERE game_id = 'tetris'"), 10);
    assert.equal(await queryCount(stateDir, env,
      "SELECT COUNT(*) AS remaining FROM verified_runs WHERE game_id = 'tetris'"), 11);
    const secondCleanup = await fetch(`${origin}/cdn-cgi/local/scheduled?format=json`);
    assert.equal(secondCleanup.ok, true);
    assert.equal(await queryCount(stateDir, env,
      "SELECT COUNT(*) AS remaining FROM run_sessions WHERE run_id LIKE 'stale-%'"), 0);
  } finally {
    socket?.close();
    dev?.kill();
    if (dev) await Promise.race([new Promise(resolve => dev.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 2000))]);
    const target = path.resolve(stateDir);
    const tempRoot = path.resolve(os.tmpdir()) + path.sep;
    if (!target.startsWith(tempRoot) || !path.basename(target).startsWith('brick-worker-test-')) {
      throw new Error(`Refusing to remove unexpected test directory: ${target}`);
    }
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
