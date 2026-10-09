export interface D1Statement {
  bind(...values: (string | number | null)[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1Binding {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

export interface HubStub {
  fetch(request: Request): Promise<Response>;
}

export interface HubNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): HubStub;
}

export interface HubState {
  acceptWebSocket(webSocket: WebSocket): void;
  getWebSockets(): WebSocket[];
}

export interface RateLimitBinding {
  limit(args: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Binding;
  LEADERBOARD_HUB: HubNamespace;
  START_LIMIT: RateLimitBinding;
  FINISH_LIMIT: RateLimitBinding;
  CLAIM_LIMIT: RateLimitBinding;
  WS_LIMIT: RateLimitBinding;
  ENABLE_RANKED: string;
  ENABLE_LEADERBOARD_WS: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET?: string;
}

export interface RunSession {
  run_id: string;
  player_id: string;
  game_id: string;
  start_level: number;
  start_speed: number;
  seed: number;
  rules_version: number;
  status: string;
  created_at: number;
  expires_at: number;
  verified_at: number | null;
  verified_raw_score: number | null;
  verified_final_score: number | null;
  eligible_to_claim: number | null;
  claimed_at: number | null;
  claim_rank: number | null;
  claim_board_version: number | null;
}

export interface BoardRow {
  entry_id: string;
  game_id: string;
  player_id: string;
  run_id: string;
  nickname: string;
  raw_score: number;
  start_level: number;
  final_score: number;
  achieved_at: number;
}
