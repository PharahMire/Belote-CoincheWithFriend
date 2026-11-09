import type { DeclaredAnnouncement } from './Announcement.ts';
import { CoincheLevel, type Bid } from './Bid.ts';
import type { Card, PlayerSeat, TeamSide } from './Card.ts';
import type { Trick } from './Trick.ts';

export type RoundPhase = 'DEALING' | 'BIDDING' | 'PLAYING_TRICKS' | 'COMPLETED';

export interface RoundState {
  readonly roundNumber: number;
  readonly dealerSeat: PlayerSeat;
  readonly phase: RoundPhase;
  readonly activeBid?: Bid;
  readonly coincheLevel: CoincheLevel;
  readonly coincherSeat?: PlayerSeat;
  readonly hands?: Readonly<Record<PlayerSeat, readonly Card[]>>;
  readonly completedTricks: readonly Trick[];
  readonly currentTrick?: Trick;
  readonly declarations: readonly DeclaredAnnouncement[];
  readonly beloteTeam?: TeamSide;
}
