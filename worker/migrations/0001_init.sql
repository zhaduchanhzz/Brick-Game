CREATE TABLE IF NOT EXISTS run_sessions (
  run_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  game_id TEXT NOT NULL CHECK (game_id IN ('tank','tetris','snake','shooting','racing','breakout')),
  start_level INTEGER NOT NULL CHECK (start_level BETWEEN 1 AND 10),
  seed INTEGER NOT NULL,
  rules_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('STARTED','VERIFIED','CLAIMED','ABORTED','EXPIRED')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verified_at INTEGER,
  verified_raw_score INTEGER,
  verified_final_score INTEGER,
  eligible_to_claim INTEGER,
  claimed_at INTEGER,
  claim_rank INTEGER,
  claim_board_version INTEGER
);

CREATE TABLE IF NOT EXISTS verified_runs (
  run_id TEXT PRIMARY KEY REFERENCES run_sessions(run_id),
  player_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  start_level INTEGER NOT NULL,
  raw_score INTEGER NOT NULL CHECK (raw_score >= 0),
  final_score INTEGER NOT NULL CHECK (final_score >= 0),
  rules_version INTEGER NOT NULL,
  verified_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  entry_id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL CHECK (game_id IN ('tank','tetris','snake','shooting','racing','breakout')),
  player_id TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE REFERENCES verified_runs(run_id),
  nickname TEXT NOT NULL,
  raw_score INTEGER NOT NULL CHECK (raw_score >= 0),
  start_level INTEGER NOT NULL CHECK (start_level BETWEEN 1 AND 10),
  final_score INTEGER NOT NULL CHECK (final_score >= 0),
  achieved_at INTEGER NOT NULL,
  UNIQUE (game_id, player_id)
);

CREATE TABLE IF NOT EXISTS leaderboard_versions (
  game_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0)
);

INSERT OR IGNORE INTO leaderboard_versions (game_id, version) VALUES
  ('tank', 0), ('tetris', 0), ('snake', 0),
  ('shooting', 0), ('racing', 0), ('breakout', 0);

CREATE TABLE IF NOT EXISTS leaderboard_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  global_version INTEGER NOT NULL DEFAULT 0 CHECK (global_version >= 0)
);
INSERT OR IGNORE INTO leaderboard_meta (singleton, global_version) VALUES (1, 0);

CREATE INDEX IF NOT EXISTS idx_lb_rank
  ON leaderboard_entries (game_id, final_score DESC, achieved_at ASC, entry_id ASC);
CREATE INDEX IF NOT EXISTS idx_run_player
  ON run_sessions (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_expiry
  ON run_sessions (status, expires_at);
