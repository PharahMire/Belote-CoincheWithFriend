import { TrumpMode, type PlayerSeat } from './Card.ts';

export enum ContractType {
  NORMAL = 'NORMAL',     // Contrat chiffré (80 à 160) ou prise Belote simple
  CAPOT = 'CAPOT',       // 8 plis promis par l'équipe (250 pts en Coinche, 252 en Belote)
  GENERALE = 'GENERALE', // 8 plis promis par un joueur seul (500 pts en Coinche)
}

export enum CoincheLevel {
  NONE = 'NONE',             // x1
  COINCHE = 'COINCHE',       // x2
  SURCOINCHE = 'SURCOINCHE', // x4
}

export type ValidCoincheBidValue =
  | 80
  | 90
  | 100
  | 110
  | 120
  | 130
  | 140
  | 150
  | 160
  | 250 // Capot
  | 500; // Générale

export interface Bid {
  readonly bidder: PlayerSeat;
  readonly trump: TrumpMode;
  readonly contractType: ContractType;
  readonly value: number;
}
