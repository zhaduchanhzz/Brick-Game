CREATE INDEX IF NOT EXISTS idx_verified_retention
  ON verified_runs (verified_at);
CREATE INDEX IF NOT EXISTS idx_session_retention
  ON run_sessions (created_at);
