import { Rank, type PlayerSeat } from './Card.ts';

export enum AnnouncementType {
  TIERCE = 'TIERCE',             // 3 cartes qui se suivent (20 pts)
  CINQUANTE = 'CINQUANTE',       // 4 cartes qui se suivent (50 pts)
  CENT = 'CENT',                 // 5+ cartes qui se suivent (100 pts)
  CARRE_JACKS = 'CARRE_JACKS',   // 4 Valets (200 pts)
  CARRE_NINES = 'CARRE_NINES',   // 4 Neuf (150 pts)
  CARRE_ACES = 'CARRE_ACES',     // 4 As (100 pts)
  CARRE_TENS = 'CARRE_TENS',     // 4 Dix (100 pts)
  CARRE_KINGS = 'CARRE_KINGS',   // 4 Rois (100 pts)
  CARRE_QUEENS = 'CARRE_QUEENS', // 4 Dames (100 pts)
}

export interface DeclaredAnnouncement {
  readonly type: AnnouncementType;
  readonly declarer: PlayerSeat;
  /** Pour départager deux séquences de même longueur (Tierce/50/100) */
  readonly highestRank?: Rank;
  readonly isAtTrump?: boolean;
}
