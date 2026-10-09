import { GAME_IDS } from '../../src/engine/registry.js';
import { HttpError } from './http';
import type { BoardRow, D1Binding } from './types';

export interface PublicEntry {
  rank: number;
  nickname: string;
  finalScore: number;
  rawScore: number;
  startLevel: number;
  achievedAt: string;
}

export interface PublicBoard {
  version: number;
  entries: PublicEntry[];
}

export function validGameId(id: unknown): id is string {
  return typeof id === 'string' && (GAME_IDS as readonly string[]).includes(id);
}

export function rankRows(rows: BoardRow[]): BoardRow[] {
  return [...rows].sort((a, b) =>
    b.final_score - a.final_score || a.achieved_at - b.achieved_at ||
    (a.entry_id < b.entry_id ? -1 : a.entry_id > b.entry_id ? 1 : 0)
  );
}

export function isEligible(rows: BoardRow[], playerId: string, score: number): boolean {
  if (!Number.isSafeInteger(score) || score <= 0) return false;
  const current = rows.find(row => row.player_id === playerId);
  if (current && score <= current.final_score) return false;
  if (current) return true;
  const sorted = rankRows(rows);
  return sorted.length < 10 || score > sorted[9].final_score;
}

function publicBoard(version: number, rows: BoardRow[]): PublicBoard {
  return {
    version,
    entries: rankRows(rows).slice(0, 10).map((row, index) => ({
      rank: index + 1,
      nickname: row.nickname,
      finalScore: row.final_score,
      rawScore: row.raw_score,
      startLevel: row.start_level,
      achievedAt: new Date(row.achieved_at).toISOString(),
    })),
  };
}

export async function readVersions(db: D1Binding): Promise<{ versions: Record<string, number>; globalVersion: number }> {
  const [versionResult, globalResult] = await db.batch([
    db.prepare('SELECT game_id, version FROM leaderboard_versions'),
    db.prepare('SELECT global_version FROM leaderboard_meta WHERE singleton = 1'),
  ]) as [{ results: { game_id: string; version: number }[] }, { results: { global_version: number }[] }];
  const versions: Record<string, number> = Object.fromEntries(GAME_IDS.map(id => [id, 0]));
  for (const row of versionResult.results) versions[row.game_id] = row.version;
  return { versions, globalVersion: globalResult.results[0]?.global_version || 0 };
}

export async function readLeaderboards(db: D1Binding, gameId?: string): Promise<unknown> {
  if (gameId !== undefined && !validGameId(gameId)) throw new HttpError(400, 'INVALID_GAME_ID');
  const [versionResult, rowResult, globalResult] = await db.batch([
    db.prepare('SELECT game_id, version FROM leaderboard_versions'),
    gameId
      ? db.prepare('SELECT * FROM leaderboard_entries WHERE game_id = ? ORDER BY final_score DESC, achieved_at ASC, entry_id ASC LIMIT 10').bind(gameId)
      : db.prepare('SELECT * FROM leaderboard_entries ORDER BY game_id, final_score DESC, achieved_at ASC, entry_id ASC'),
    db.prepare('SELECT global_version FROM leaderboard_meta WHERE singleton = 1'),
  ]) as [
    { results: { game_id: string; version: number }[] },
    { results: BoardRow[] },
    { results: { global_version: number }[] },
  ];
  const versions = new Map(versionResult.results.map(row => [row.game_id, row.version]));
  const globalVersion = globalResult.results[0]?.global_version || 0;
  if (gameId) {
    const board = publicBoard(versions.get(gameId) || 0, rowResult.results);
    return { gameId, ...board, globalVersion };
  }
  const games: Record<string, PublicBoard> = {};
  for (const id of GAME_IDS) {
    games[id] = publicBoard(versions.get(id) || 0, rowResult.results.filter(row => row.game_id === id));
  }
  return { globalVersion, games };
}
