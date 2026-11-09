-- ============================================================================
-- SCHÉMA SQLITE LOCAL (OFFLINE-FIRST + SYNC_QUEUE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS local_games (
  id TEXT PRIMARY KEY NOT NULL,
  created_by TEXT NOT NULL,
  mode TEXT NOT NULL, -- 'BELOTE_CLASSIC' | 'COINCHE'
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  target_score INTEGER NOT NULL DEFAULT 1000,
  rules_config_json TEXT NOT NULL,
  score_ns INTEGER NOT NULL DEFAULT 0,
  score_ew INTEGER NOT NULL DEFAULT 0,
  winner_team TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  updated_at TEXT NOT NULL,
  client_hlc TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'DIRTY' -- 'SYNCED' | 'DIRTY' | 'CONFLICT'
);

CREATE TABLE IF NOT EXISTS local_guests (
  guest_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  claim_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  linked_profile_id TEXT,
  linked_username TEXT,
  sync_status TEXT NOT NULL DEFAULT 'DIRTY'
);

CREATE TABLE IF NOT EXISTS local_game_participants (
  id TEXT PRIMARY KEY NOT NULL,
  game_id TEXT NOT NULL REFERENCES local_games(id) ON DELETE CASCADE,
  seat TEXT NOT NULL,
  team TEXT NOT NULL,
  identity_type TEXT NOT NULL DEFAULT 'LOCAL_GUEST',
  profile_id TEXT,
  guest_id TEXT REFERENCES local_guests(guest_id) ON DELETE SET NULL,
  guest_name TEXT,
  claim_code TEXT,
  UNIQUE(game_id, seat)
);

CREATE TABLE IF NOT EXISTS local_game_rounds (
  id TEXT PRIMARY KEY NOT NULL,
  game_id TEXT NOT NULL REFERENCES local_games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  dealer_seat TEXT NOT NULL,
  taker_seat TEXT NOT NULL,
  taker_team TEXT NOT NULL,
  trump TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  contract_value INTEGER NOT NULL,
  coinche_status TEXT NOT NULL,
  coincher_seat TEXT,
  raw_trick_points_ns INTEGER NOT NULL,
  raw_trick_points_ew INTEGER NOT NULL,
  is_capot_achieved INTEGER NOT NULL DEFAULT 0,
  capot_team TEXT,
  belote_team TEXT,
  announcements_ns_json TEXT NOT NULL DEFAULT '[]',
  announcements_ew_json TEXT NOT NULL DEFAULT '[]',
  announcement_points_ns INTEGER NOT NULL DEFAULT 0,
  announcement_points_ew INTEGER NOT NULL DEFAULT 0,
  is_contract_fulfilled INTEGER NOT NULL,
  final_points_ns INTEGER NOT NULL,
  final_points_ew INTEGER NOT NULL,
  bidding_history_json TEXT,
  tricks_history_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  client_hlc TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'DIRTY',
  UNIQUE(game_id, round_number)
);

CREATE TABLE IF NOT EXISTS local_cached_friends (
  profile_id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  friend_code TEXT NOT NULL,
  avatar_url TEXT,
  is_online INTEGER NOT NULL DEFAULT 0,
  cached_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  mutation_id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  client_hlc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  next_retry_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_dispatch 
  ON sync_queue (status, next_retry_at, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_sync_queue_entity 
  ON sync_queue (entity_type, entity_id);
