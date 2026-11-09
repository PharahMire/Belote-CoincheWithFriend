import type { Card, PlayerSeat } from './Card.ts';

export interface PlayedCard {
  readonly seat: PlayerSeat;
  readonly card: Card;
}

export interface Trick {
  readonly index: number; // 1 à 8
  readonly leadSeat: PlayerSeat;
  readonly plays: readonly PlayedCard[];
  readonly winnerSeat?: PlayerSeat;
}
