export enum Suit {
  SPADES = 'SPADES',     // Pique ♠
  HEARTS = 'HEARTS',     // Cœur ♥
  DIAMONDS = 'DIAMONDS', // Carreau ♦
  CLUBS = 'CLUBS',       // Trèfle ♣
}

export enum TrumpMode {
  SPADES = 'SPADES',
  HEARTS = 'HEARTS',
  DIAMONDS = 'DIAMONDS',
  CLUBS = 'CLUBS',
  NO_TRUMP = 'NO_TRUMP',   // Sans-Atout (SA)
  ALL_TRUMP = 'ALL_TRUMP', // Tout-Atout (TA)
}

export enum Rank {
  SEVEN = '7',
  EIGHT = '8',
  NINE = '9',
  TEN = '10',
  JACK = 'J',
  QUEEN = 'Q',
  KING = 'K',
  ACE = 'A',
}

export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}

export type TeamSide = 'NS' | 'EW';
export type PlayerSeat = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';

export const SEAT_ORDER: readonly PlayerSeat[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

export function getTeamForSeat(seat: PlayerSeat): TeamSide {
  return seat === 'NORTH' || seat === 'SOUTH' ? 'NS' : 'EW';
}

export function getOppositeTeam(team: TeamSide): TeamSide {
  return team === 'NS' ? 'EW' : 'NS';
}

export function getNextSeat(seat: PlayerSeat): PlayerSeat {
  const idx = SEAT_ORDER.indexOf(seat);
  return SEAT_ORDER[(idx + 1) % SEAT_ORDER.length];
}
