-- ============================================================================
-- MIGRATION 0001 : SCHÉMA INITIAL SUPABASE (PostgreSQL 16)
-- Belote & Coinche With Friends - Phase 1 (Scorekeeper) & Phase 2 Ready
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- ENUMS
-- ==========================================
CREATE TYPE game_mode AS ENUM ('BELOTE_CLASSIC', 'COINCHE');
CREATE TYPE game_status AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');
CREATE TYPE friendship_status AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');
CREATE TYPE team_side AS ENUM ('NS', 'EW');
CREATE TYPE player_seat AS ENUM ('NORTH', 'EAST', 'SOUTH', 'WEST');
CREATE TYPE trump_suit AS ENUM ('SPADES', 'HEARTS', 'DIAMONDS', 'CLUBS', 'NO_TRUMP', 'ALL_TRUMP');
CREATE TYPE contract_type AS ENUM ('NORMAL', 'CAPOT', 'GENERALE');
CREATE TYPE coinche_level AS ENUM ('NONE', 'COINCHE', 'SURCOINCHE');
CREATE TYPE scoring_style AS ENUM (
  'POINTS_PLUS_CONTRACT',
  'CONTRACT_ONLY',
  'ROUNDED_TO_TEN'
);

-- ==========================================
-- 1. PROFILS UTILISATEURS
-- ==========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(32) NOT NULL UNIQUE,
  friend_code VARCHAR(12) NOT NULL UNIQUE,
  avatar_url TEXT,
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_username_lower ON public.profiles (LOWER(username));
CREATE INDEX idx_profiles_friend_code ON public.profiles (friend_code);

-- ==========================================
-- 2. SYSTÈME D'AMIS
-- ==========================================
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status friendship_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_no_self_friend CHECK (requester_id <> addressee_id),
  CONSTRAINT uq_friendship_pair UNIQUE (requester_id, addressee_id)
);

CREATE INDEX idx_friendships_requester ON public.friendships (requester_id, status);
CREATE INDEX idx_friendships_addressee ON public.friendships (addressee_id, status);

-- ==========================================
-- 3. PARTIES (GAMES)
-- ==========================================
CREATE TABLE public.games (
  id UUID PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  mode game_mode NOT NULL,
  status game_status NOT NULL DEFAULT 'IN_PROGRESS',
  target_score INTEGER NOT NULL DEFAULT 1000,
  rules_config JSONB NOT NULL DEFAULT '{
    "allowNoTrumpAllTrump": true,
    "enableAnnouncements": true,
    "scoringStyle": "POINTS_PLUS_CONTRACT",
    "beloteCountsTowardsContract": true,
    "announcementsCountTowardsContract": true,
    "normalizeNoTrumpAllTrumpTo162": true
  }'::jsonb,
  score_ns INTEGER NOT NULL DEFAULT 0,
  score_ew INTEGER NOT NULL DEFAULT 0,
  winner_team team_side,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_hlc VARCHAR(64) NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_games_created_by ON public.games (created_by, started_at DESC);
CREATE INDEX idx_games_status ON public.games (status);

-- ==========================================
-- 4. JOUEURS DE LA PARTIE (GAME PARTICIPANTS)
-- ==========================================
CREATE TABLE public.game_participants (
  id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  seat player_seat NOT NULL,
  team team_side NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  guest_id UUID,
  guest_name VARCHAR(40),
  claim_code VARCHAR(16),
  linked_at TIMESTAMPTZ,
  CONSTRAINT uq_game_seat UNIQUE (game_id, seat),
  CONSTRAINT chk_participant_identity CHECK (
    (profile_id IS NOT NULL) OR (guest_name IS NOT NULL AND LENGTH(TRIM(guest_name)) > 0)
  )
);

CREATE INDEX idx_game_participants_profile ON public.game_participants (profile_id);
CREATE INDEX idx_game_participants_guest_id ON public.game_participants (guest_id);
CREATE INDEX idx_game_participants_claim_code ON public.game_participants (claim_code);
CREATE INDEX idx_game_participants_game ON public.game_participants (game_id);

-- ==========================================
-- 5. DONNES / MANCHES (GAME ROUNDS)
-- ==========================================
CREATE TABLE public.game_rounds (
  id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  dealer_seat player_seat NOT NULL,
  taker_seat player_seat NOT NULL,
  taker_team team_side NOT NULL,
  trump trump_suit NOT NULL,
  contract_type contract_type NOT NULL DEFAULT 'NORMAL',
  contract_value INTEGER NOT NULL DEFAULT 80,
  coinche_status coinche_level NOT NULL DEFAULT 'NONE',
  coincher_seat player_seat,
  raw_trick_points_ns INTEGER NOT NULL,
  raw_trick_points_ew INTEGER NOT NULL,
  is_capot_achieved BOOLEAN NOT NULL DEFAULT FALSE,
  capot_team team_side,
  belote_team team_side,
  announcements_ns JSONB NOT NULL DEFAULT '[]'::jsonb,
  announcements_ew JSONB NOT NULL DEFAULT '[]'::jsonb,
  announcement_points_ns INTEGER NOT NULL DEFAULT 0,
  announcement_points_ew INTEGER NOT NULL DEFAULT 0,
  is_contract_fulfilled BOOLEAN NOT NULL,
  final_points_ns INTEGER NOT NULL,
  final_points_ew INTEGER NOT NULL,
  bidding_history JSONB DEFAULT NULL,
  tricks_history JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_hlc VARCHAR(64) NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_game_round_num UNIQUE (game_id, round_number)
);

CREATE INDEX idx_game_rounds_game ON public.game_rounds (game_id, round_number);
CREATE INDEX idx_game_rounds_taker_team ON public.game_rounds (taker_team, is_contract_fulfilled);
CREATE INDEX idx_game_rounds_trump ON public.game_rounds (trump);

-- ==========================================
-- 6. JOURNAL D'IDEMPOTENCE DE SYNCHRONISATION
-- ==========================================
CREATE TABLE public.sync_processed_mutations (
  mutation_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type VARCHAR(32) NOT NULL,
  entity_id UUID NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_mutations_user ON public.sync_processed_mutations (user_id, processed_at DESC);

-- ==========================================
-- 7. RPC DE SYNCHRONISATION LWW (PUSH BATCH)
-- ==========================================
CREATE OR REPLACE FUNCTION public.sync_push_batch(mutations JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  mut JSONB;
  v_mutation_id UUID;
  v_entity_type TEXT;
  v_entity_id UUID;
  v_hlc TEXT;
  v_payload JSONB;
  v_ack_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  FOR mut IN SELECT * FROM jsonb_array_elements(mutations)
  LOOP
    v_mutation_id := (mut->>'mutation_id')::UUID;
    v_entity_type := mut->>'entity_type';
    v_entity_id   := (mut->>'entity_id')::UUID;
    v_hlc         := mut->>'client_hlc';
    v_payload     := mut->'payload';

    IF EXISTS (SELECT 1 FROM public.sync_processed_mutations WHERE mutation_id = v_mutation_id) THEN
      v_ack_ids := array_append(v_ack_ids, v_mutation_id);
      CONTINUE;
    END IF;

    IF v_entity_type = 'GAME' THEN
      INSERT INTO public.games (
        id, created_by, mode, status, target_score, rules_config,
        score_ns, score_ew, winner_team, started_at, ended_at, updated_at, client_hlc, is_deleted
      ) VALUES (
        v_entity_id,
        auth.uid(),
        (v_payload->>'mode')::game_mode,
        (v_payload->>'status')::game_status,
        (v_payload->>'target_score')::INTEGER,
        COALESCE(v_payload->'rules_config', '{}'::jsonb),
        (v_payload->>'score_ns')::INTEGER,
        (v_payload->>'score_ew')::INTEGER,
        (v_payload->>'winner_team')::team_side,
        (v_payload->>'started_at')::TIMESTAMPTZ,
        (v_payload->>'ended_at')::TIMESTAMPTZ,
        NOW(),
        v_hlc,
        COALESCE((v_payload->>'is_deleted')::BOOLEAN, FALSE)
      )
      ON CONFLICT (id) DO UPDATE SET
        status       = EXCLUDED.status,
        score_ns     = EXCLUDED.score_ns,
        score_ew     = EXCLUDED.score_ew,
        winner_team  = EXCLUDED.winner_team,
        ended_at     = EXCLUDED.ended_at,
        updated_at   = NOW(),
        client_hlc   = EXCLUDED.client_hlc,
        is_deleted   = EXCLUDED.is_deleted
      WHERE EXCLUDED.client_hlc > public.games.client_hlc;

    ELSIF v_entity_type = 'GAME_ROUND' THEN
      INSERT INTO public.game_rounds (
        id, game_id, round_number, dealer_seat, taker_seat, taker_team, trump,
        contract_type, contract_value, coinche_status, coincher_seat,
        raw_trick_points_ns, raw_trick_points_ew, is_capot_achieved, capot_team,
        belote_team, announcements_ns, announcements_ew,
        announcement_points_ns, announcement_points_ew,
        is_contract_fulfilled, final_points_ns, final_points_ew,
        client_hlc, is_deleted
      ) VALUES (
        v_entity_id,
        (v_payload->>'game_id')::UUID,
        (v_payload->>'round_number')::INTEGER,
        (v_payload->>'dealer_seat')::player_seat,
        (v_payload->>'taker_seat')::player_seat,
        (v_payload->>'taker_team')::team_side,
        (v_payload->>'trump')::trump_suit,
        (v_payload->>'contract_type')::contract_type,
        (v_payload->>'contract_value')::INTEGER,
        (v_payload->>'coinche_status')::coinche_level,
        (v_payload->>'coincher_seat')::player_seat,
        (v_payload->>'raw_trick_points_ns')::INTEGER,
        (v_payload->>'raw_trick_points_ew')::INTEGER,
        COALESCE((v_payload->>'is_capot_achieved')::BOOLEAN, FALSE),
        (v_payload->>'capot_team')::team_side,
        (v_payload->>'belote_team')::team_side,
        COALESCE(v_payload->'announcements_ns', '[]'::jsonb),
        COALESCE(v_payload->'announcements_ew', '[]'::jsonb),
        COALESCE((v_payload->>'announcement_points_ns')::INTEGER, 0),
        COALESCE((v_payload->>'announcement_points_ew')::INTEGER, 0),
        (v_payload->>'is_contract_fulfilled')::BOOLEAN,
        (v_payload->>'final_points_ns')::INTEGER,
        (v_payload->>'final_points_ew')::INTEGER,
        v_hlc,
        COALESCE((v_payload->>'is_deleted')::BOOLEAN, FALSE)
      )
      ON CONFLICT (id) DO UPDATE SET
        taker_seat             = EXCLUDED.taker_seat,
        taker_team             = EXCLUDED.taker_team,
        trump                  = EXCLUDED.trump,
        contract_type          = EXCLUDED.contract_type,
        contract_value         = EXCLUDED.contract_value,
        coinche_status         = EXCLUDED.coinche_status,
        coincher_seat          = EXCLUDED.coincher_seat,
        raw_trick_points_ns    = EXCLUDED.raw_trick_points_ns,
        raw_trick_points_ew    = EXCLUDED.raw_trick_points_ew,
        is_capot_achieved      = EXCLUDED.is_capot_achieved,
        capot_team             = EXCLUDED.capot_team,
        belote_team            = EXCLUDED.belote_team,
        announcements_ns       = EXCLUDED.announcements_ns,
        announcements_ew       = EXCLUDED.announcements_ew,
        announcement_points_ns = EXCLUDED.announcement_points_ns,
        announcement_points_ew = EXCLUDED.announcement_points_ew,
        is_contract_fulfilled  = EXCLUDED.is_contract_fulfilled,
        final_points_ns        = EXCLUDED.final_points_ns,
        final_points_ew        = EXCLUDED.final_points_ew,
        updated_at             = NOW(),
        client_hlc             = EXCLUDED.client_hlc,
        is_deleted             = EXCLUDED.is_deleted
      WHERE EXCLUDED.client_hlc > public.game_rounds.client_hlc;
    END IF;

    INSERT INTO public.sync_processed_mutations (mutation_id, user_id, entity_type, entity_id)
    VALUES (v_mutation_id, auth.uid(), v_entity_type, v_entity_id);

    v_ack_ids := array_append(v_ack_ids, v_mutation_id);
  END LOOP;

  RETURN jsonb_build_object('acknowledged_ids', v_ack_ids);
END;
$$;

-- ==========================================
-- 8. RPC DE LIAISON RÉTROACTIVE INVITÉ -> PROFIL UTILISATEUR
-- Permet de rattacher toutes les parties jouées hors-ligne par un invité ("Mode Bateau")
-- au vrai compte d'un ami une fois la connexion retrouvée (via guest_id ou claim_code).
-- ==========================================
CREATE OR REPLACE FUNCTION public.link_guest_to_profile(
  p_guest_id UUID,
  p_claim_code VARCHAR,
  p_target_profile_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE public.game_participants
  SET
    profile_id = p_target_profile_id,
    linked_at  = NOW()
  WHERE
    profile_id IS NULL
    AND (
      (p_guest_id IS NOT NULL AND guest_id = p_guest_id)
      OR (p_claim_code IS NOT NULL AND claim_code = p_claim_code)
    );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;
