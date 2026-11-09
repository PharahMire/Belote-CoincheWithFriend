import { getTeamForSeat, Rank, TrumpMode, type Card, type PlayerSeat } from '../entities/Card.ts';
import type { PlayedCard } from '../entities/Trick.ts';

export class CardStrengthEvaluator {
  // Valeurs standards à l'atout (Total = 62 pts par couleur)
  private static readonly TRUMP_POINTS: Readonly<Record<Rank, number>> = {
    [Rank.JACK]: 20,
    [Rank.NINE]: 14,
    [Rank.ACE]: 11,
    [Rank.TEN]: 10,
    [Rank.KING]: 4,
    [Rank.QUEEN]: 3,
    [Rank.EIGHT]: 0,
    [Rank.SEVEN]: 0,
  };

  // Valeurs standards hors-atout (Total = 30 pts par couleur)
  private static readonly NON_TRUMP_POINTS: Readonly<Record<Rank, number>> = {
    [Rank.ACE]: 11,
    [Rank.TEN]: 10,
    [Rank.KING]: 4,
    [Rank.QUEEN]: 3,
    [Rank.JACK]: 2,
    [Rank.NINE]: 0,
    [Rank.EIGHT]: 0,
    [Rank.SEVEN]: 0,
  };

  // Ordre de force croissant (du plus faible 0 au plus fort 7)
  private static readonly TRUMP_STRENGTH: readonly Rank[] = [
    Rank.SEVEN,
    Rank.EIGHT,
    Rank.QUEEN,
    Rank.KING,
    Rank.TEN,
    Rank.ACE,
    Rank.NINE,
    Rank.JACK,
  ];

  private static readonly NON_TRUMP_STRENGTH: readonly Rank[] = [
    Rank.SEVEN,
    Rank.EIGHT,
    Rank.NINE,
    Rank.JACK,
    Rank.QUEEN,
    Rank.KING,
    Rank.TEN,
    Rank.ACE,
  ];

  public static isCardTrump(card: Card, trump: TrumpMode): boolean {
    if (trump === TrumpMode.ALL_TRUMP) return true;
    if (trump === TrumpMode.NO_TRUMP) return false;
    return (card.suit as string) === (trump as string);
  }

  public static getCardPoints(card: Card, trump: TrumpMode): number {
    return this.isCardTrump(card, trump)
      ? this.TRUMP_POINTS[card.rank]
      : this.NON_TRUMP_POINTS[card.rank];
  }

  public static getCardStrength(card: Card, trump: TrumpMode): number {
    const order = this.isCardTrump(card, trump)
      ? this.TRUMP_STRENGTH
      : this.NON_TRUMP_STRENGTH;
    return order.indexOf(card.rank);
  }

  /** Calcule le total des points contenus dans un pli (+10 si c'est le 8e pli / Dix de der) */
  public static computeTrickPoints(
    plays: readonly PlayedCard[],
    trump: TrumpMode,
    isLastTrick = false
  ): number {
    const cardSum = plays.reduce(
      (sum, p) => sum + this.getCardPoints(p.card, trump),
      0
    );
    return cardSum + (isLastTrick ? 10 : 0);
  }

  /** Détermine quel joueur remporte le pli en cours */
  public static getTrickWinner(
    plays: readonly PlayedCard[],
    trump: TrumpMode
  ): PlayedCard {
    if (plays.length === 0) {
      throw new Error('Impossible de déterminer le gagnant d’un pli vide.');
    }

    const leadSuit = plays[0].card.suit;
    let winningPlay = plays[0];

    for (let i = 1; i < plays.length; i++) {
      const current = plays[i];
      const winningIsTrump = this.isCardTrump(winningPlay.card, trump);
      const currentIsTrump = this.isCardTrump(current.card, trump);

      if (currentIsTrump && !winningIsTrump) {
        // Coupe avec un atout
        winningPlay = current;
      } else if (
        currentIsTrump &&
        winningIsTrump &&
        current.card.suit === winningPlay.card.suit
      ) {
        // Surcoupe ou montée à l'atout dans la même couleur (utile aussi en Tout-Atout)
        if (
          this.getCardStrength(current.card, trump) >
          this.getCardStrength(winningPlay.card, trump)
        ) {
          winningPlay = current;
        }
      } else if (!currentIsTrump && !winningIsTrump && current.card.suit === leadSuit) {
        // Même couleur hors-atout que la couleur demandée
        if (
          this.getCardStrength(current.card, trump) >
          this.getCardStrength(winningPlay.card, trump)
        ) {
          winningPlay = current;
        }
      }
    }

    return winningPlay;
  }

  /**
   * Filtre les cartes jouables de la main d'un joueur selon les règles officielles :
   * 1. Obligation de fournir à la couleur demandée.
   * 2. Si la couleur demandée est de l'atout (ou Tout-Atout) : obligation de monter sur le plus fort atout déjà posé.
   * 3. Si on n'a pas la couleur demandée :
   *    - Si le partenaire est actuellement maître du pli : libre de défausser (sauf en Tout-Atout où on doit fournir la couleur demandée).
   *    - Si l'adversaire est maître : obligation de couper à l'atout (et de surcouper si possible, sinon sous-couper).
   */
  public static getPlayableCards(
    hand: readonly Card[],
    currentPlays: readonly PlayedCard[],
    playerSeat: PlayerSeat,
    trump: TrumpMode
  ): Card[] {
    if (currentPlays.length === 0) {
      return [...hand];
    }

    const leadCard = currentPlays[0].card;
    const leadSuit = leadCard.suit;
    const sameSuitCards = hand.filter((c) => c.suit === leadSuit);

    // Cas 1 : Le joueur possède la couleur demandée
    if (sameSuitCards.length > 0) {
      const isLeadSuitTrump = this.isCardTrump(leadCard, trump);
      if (!isLeadSuitTrump) {
        return sameSuitCards;
      }

      // La couleur demandée est de l'atout (ou Tout-Atout) -> obligation de monter
      const highestTrumpInSuit = currentPlays
        .filter((p) => p.card.suit === leadSuit)
        .reduce((best, p) =>
          this.getCardStrength(p.card, trump) > this.getCardStrength(best.card, trump)
            ? p
            : best
        );

      const higherCards = sameSuitCards.filter(
        (c) =>
          this.getCardStrength(c, trump) >
          this.getCardStrength(highestTrumpInSuit.card, trump)
      );

      return higherCards.length > 0 ? higherCards : sameSuitCards;
    }

    // Cas 2 : Le joueur ne possède PAS la couleur demandée
    if (trump === TrumpMode.NO_TRUMP || trump === TrumpMode.ALL_TRUMP) {
      // À Sans-Atout ou Tout-Atout, si on n'a pas la couleur demandée, on défausse n'importe quelle carte
      return [...hand];
    }

    const currentWinner = this.getTrickWinner(currentPlays, trump);
    const isPartnerWinning =
      getTeamForSeat(currentWinner.seat) === getTeamForSeat(playerSeat);

    // Si le partenaire est maître, pas d'obligation de couper
    if (isPartnerWinning) {
      return [...hand];
    }

    // L'adversaire est maître -> obligation de couper si on a de l'atout
    const trumpCardsInHand = hand.filter((c) => this.isCardTrump(c, trump));
    if (trumpCardsInHand.length === 0) {
      return [...hand];
    }

    // Si un atout a déjà été joué dans le pli, obligation de surcouper si possible
    const trumpsPlayed = currentPlays.filter((p) => this.isCardTrump(p.card, trump));
    if (trumpsPlayed.length > 0) {
      const highestTrumpPlayed = trumpsPlayed.reduce((best, p) =>
        this.getCardStrength(p.card, trump) > this.getCardStrength(best.card, trump)
          ? p
          : best
      );

      const overTrumps = trumpCardsInHand.filter(
        (c) =>
          this.getCardStrength(c, trump) >
          this.getCardStrength(highestTrumpPlayed.card, trump)
      );

      return overTrumps.length > 0 ? overTrumps : trumpCardsInHand;
    }

    return trumpCardsInHand;
  }
}
