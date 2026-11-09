import { Rank, Suit, type Card } from './Card.ts';

export class Deck {
  private static readonly SUITS: readonly Suit[] = [
    Suit.SPADES,
    Suit.HEARTS,
    Suit.DIAMONDS,
    Suit.CLUBS,
  ];

  private static readonly RANKS: readonly Rank[] = [
    Rank.SEVEN,
    Rank.EIGHT,
    Rank.NINE,
    Rank.TEN,
    Rank.JACK,
    Rank.QUEEN,
    Rank.KING,
    Rank.ACE,
  ];

  /** Génère un jeu complet de 32 cartes */
  public static create32CardDeck(): Card[] {
    const cards: Card[] = [];
    for (const suit of this.SUITS) {
      for (const rank of this.RANKS) {
        cards.push({ suit, rank });
      }
    }
    return cards;
  }

  /** Coupe un jeu de cartes (tradition Belote : pas de mélange, on coupe) */
  public static cutDeck(cards: readonly Card[], cutIndex: number): Card[] {
    if (cutIndex <= 0 || cutIndex >= cards.length) {
      return [...cards];
    }
    return [...cards.slice(cutIndex), ...cards.slice(0, cutIndex)];
  }
}
