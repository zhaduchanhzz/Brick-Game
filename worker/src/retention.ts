import type { D1Binding } from './types';

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;
const MAX_ROUNDS = 5;

export async function cleanupOldRuns(db: D1Binding, scheduledAt: number): Promise<{
  verifiedDeleted: number;
  sessionsDeleted: number;
}> {
  const cutoff = scheduledAt - RETENTION_MS;
  let verifiedDeleted = 0;
  let sessionsDeleted = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const [verified, sessions] = await db.batch([
      db.prepare(`DELETE FROM verified_runs WHERE run_id IN (
        SELECT v.run_id FROM verified_runs v
        WHERE v.verified_at < ?
          AND NOT EXISTS (SELECT 1 FROM leaderboard_entries e WHERE e.run_id = v.run_id)
        ORDER BY v.verified_at ASC LIMIT ?
      )`).bind(cutoff, BATCH_SIZE),
      db.prepare(`DELETE FROM run_sessions WHERE run_id IN (
        SELECT s.run_id FROM run_sessions s
        WHERE s.created_at < ?
          AND NOT EXISTS (SELECT 1 FROM verified_runs v WHERE v.run_id = s.run_id)
        ORDER BY s.created_at ASC LIMIT ?
      )`).bind(cutoff, BATCH_SIZE),
    ]) as [{ meta: { changes: number } }, { meta: { changes: number } }];
    const verifiedCount = verified.meta.changes || 0;
    const sessionCount = sessions.meta.changes || 0;
    verifiedDeleted += verifiedCount;
    sessionsDeleted += sessionCount;
    if (verifiedCount < BATCH_SIZE && sessionCount < BATCH_SIZE) break;
  }
  return { verifiedDeleted, sessionsDeleted };
}
