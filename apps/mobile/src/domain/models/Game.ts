import type {
  GameMode,
  PlayerSeat,
  RoundScoreInput,
  RoundScoreResult,
  TableRulesConfig,
  TeamSide,
  TrumpMode,
} from '../../../../../packages/core-rules/src/index.ts';

export type ParticipantIdentityType =
  | 'AUTHENTICATED_USER' // L'utilisateur courant ou un ami déjà en cache
  | 'OFFLINE_QR_VERIFIED'// Ami scanné par QR Code hors-ligne sur le bateau (possède déjà son vrai profileId !)
  | 'LOCAL_GUEST';       // Invité temporaire créé sans compte (peut être lié à un vrai compte au retour du réseau)

export interface GameParticipant {
  readonly id: string;
  readonly gameId: string;
  readonly seat: PlayerSeat;
  readonly team: TeamSide;
  readonly identityType: ParticipantIdentityType;
  /** Présent si AUTHENTICATED_USER ou OFFLINE_QR_VERIFIED, ou après liaison d'un LOCAL_GUEST */
  readonly profileId?: string;
  /** Présent si LOCAL_GUEST (permet de lier toutes les parties de cet invité d'un seul coup) */
  readonly guestId?: string;
  readonly displayName: string;
  readonly claimCode?: string;
}

export interface PersistedRoundRecord {
  readonly id: string;
  readonly gameId: string;
  readonly roundNumber: number;
  readonly dealerSeat: PlayerSeat;
  readonly input: RoundScoreInput;
  readonly result: RoundScoreResult;
  readonly createdAt: string;
  readonly clientHlc: string;
  readonly syncStatus: 'SYNCED' | 'DIRTY';
}

export interface GameRecord {
  readonly id: string;
  readonly createdByProfileId: string;
  readonly mode: GameMode;
  readonly status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  readonly targetScore: number;
  readonly rules: TableRulesConfig;
  readonly participants: readonly GameParticipant[];
  readonly rounds: readonly PersistedRoundRecord[];
  readonly scoreNS: number;
  readonly scoreEW: number;
  readonly winnerTeam?: TeamSide;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly clientHlc: string;
  readonly syncStatus: 'SYNCED' | 'DIRTY';
}

export interface PlayerStatsSummary {
  readonly profileOrGuestId: string;
  readonly mode: GameMode | 'ALL';
  readonly gamesPlayed: number;
  readonly gamesWon: number;
  readonly winRatePct: number;
  readonly roundsPlayed: number;
  readonly contractsTaken: number;
  readonly contractsFulfilled: number;
  readonly contractSuccessRatePct: number;
  readonly averagePointsPerRound: number;
  readonly coinchesAttempted: number;
  readonly coinchesSucceeded: number;
  readonly coincheEfficiencyPct: number;
  readonly capotsAchieved: number;
  readonly winRateByTrump: Readonly<
    Record<TrumpMode, { taken: number; succeeded: number; winRatePct: number }>
  >;
}
