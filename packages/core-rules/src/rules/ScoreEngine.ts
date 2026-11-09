import { AnnouncementType, type DeclaredAnnouncement } from '../entities/Announcement.ts';
import { CoincheLevel, ContractType } from '../entities/Bid.ts';
import {
  getOppositeTeam,
  getTeamForSeat,
  Rank,
  TrumpMode,
  type PlayerSeat,
  type TeamSide,
} from '../entities/Card.ts';

export type GameMode = 'BELOTE_CLASSIC' | 'COINCHE';

export type ScoringStyle =
  | 'POINTS_PLUS_CONTRACT' // Règle officielle tournoi : Points faits + Contrat annoncé
  | 'CONTRACT_ONLY'        // Règle variante : Le preneur marque uniquement son contrat, la défense marque ses points
  | 'ROUNDED_TO_TEN';      // Arrondi à la dizaine la plus proche

export interface TableRulesConfig {
  readonly mode: GameMode;
  readonly allowNoTrumpAllTrump: boolean;
  readonly enableAnnouncements: boolean;
  readonly scoringStyle: ScoringStyle;
  /** La Belote (+20) aide-t-elle à réaliser le contrat annoncé ? (Standard = true) */
  readonly beloteCountsTowardsContract: boolean;
  /** Les annonces (Tierce, 50, Carré...) aident-elles à réaliser le contrat en Coinche ? */
  readonly announcementsCountTowardsContract: boolean;
  /** En Tout-Atout (258 pts bruts) et Sans-Atout (130 pts bruts), normalise-t-on le total des plis sur 162 ? */
  readonly normalizeNoTrumpAllTrumpTo162: boolean;
}

export const DEFAULT_BELOTE_RULES: TableRulesConfig = {
  mode: 'BELOTE_CLASSIC',
  allowNoTrumpAllTrump: false,
  enableAnnouncements: false,
  scoringStyle: 'POINTS_PLUS_CONTRACT',
  beloteCountsTowardsContract: true,
  announcementsCountTowardsContract: false,
  normalizeNoTrumpAllTrumpTo162: false,
};

export const DEFAULT_COINCHE_RULES: TableRulesConfig = {
  mode: 'COINCHE',
  allowNoTrumpAllTrump: true,
  enableAnnouncements: true,
  scoringStyle: 'POINTS_PLUS_CONTRACT',
  beloteCountsTowardsContract: true,
  announcementsCountTowardsContract: true,
  normalizeNoTrumpAllTrumpTo162: true,
};

export interface RoundScoreInput {
  readonly rules: TableRulesConfig;
  readonly takerSeat: PlayerSeat;
  readonly trump: TrumpMode;
  readonly contractType: ContractType;
  /** Ignoré en Belote Classique (fixé automatiquement au seuil de 82). En Coinche : 80..160, 250, 500 */
  readonly contractValue: number;
  readonly coincheLevel: CoincheLevel;
  readonly coincherSeat?: PlayerSeat;

  /**
   * Points réalisés aux plis (Dix de der inclus).
   * - Si non-capot en couleur classique : rawTrickPointsNS + rawTrickPointsEW === 162
   * - Si capot réalisé : capotAchievedBy indique l'équipe qui a remporté les 8 plis
   */
  readonly rawTrickPointsNS: number;
  readonly rawTrickPointsEW: number;
  readonly capotAchievedBy?: TeamSide;
  /** Indique si le preneur a réussi les 8 plis tout seul (pour un contrat de Générale) */
  readonly generaleAchievedByTaker?: boolean;

  /** Équipe détenant le Roi et la Dame d'atout (+20 pts) */
  readonly beloteTeam?: TeamSide;

  /** Annonces déclarées autour de la table */
  readonly declarations?: readonly DeclaredAnnouncement[];
}

export interface RoundScoreResult {
  readonly takerTeam: TeamSide;
  readonly defenderTeam: TeamSide;
  readonly isContractFulfilled: boolean;
  readonly isLitige: boolean; // Cas 81 - 81 en Belote classique
  readonly normalizedTrickPointsNS: number;
  readonly normalizedTrickPointsEW: number;
  readonly belotePointsNS: number;
  readonly belotePointsEW: number;
  readonly announcementPointsNS: number;
  readonly announcementPointsEW: number;
  readonly winningAnnouncementsTeam?: TeamSide;
  readonly finalScoreNS: number;
  readonly finalScoreEW: number;
  readonly breakdownExplanation: string;
}

export class ScoreEngine {
  private static readonly TOTAL_STANDARD_TRICK_POINTS = 162;
  private static readonly CAPOT_TRICK_POINTS_BELOTE = 252; // 152 pts de cartes + 100 pts de prime capot
  private static readonly CAPOT_CONTRACT_BONUS_COINCHE = 250;
  private static readonly GENERALE_CONTRACT_BONUS_COINCHE = 500;
  private static readonly BELOTE_BONUS = 20;

  private static readonly ANNOUNCEMENT_VALUES: Readonly<Record<AnnouncementType, number>> = {
    [AnnouncementType.TIERCE]: 20,
    [AnnouncementType.CINQUANTE]: 50,
    [AnnouncementType.CENT]: 100,
    [AnnouncementType.CARRE_JACKS]: 200,
    [AnnouncementType.CARRE_NINES]: 150,
    [AnnouncementType.CARRE_ACES]: 100,
    [AnnouncementType.CARRE_TENS]: 100,
    [AnnouncementType.CARRE_KINGS]: 100,
    [AnnouncementType.CARRE_QUEENS]: 100,
  };

  /**
   * Point d'entrée principal : Calcule le score exact d'une donne (Belote ou Coinche)
   */
  public static computeRoundScore(input: RoundScoreInput): RoundScoreResult {
    this.validateInput(input);

    if (input.rules.mode === 'BELOTE_CLASSIC') {
      return this.computeBeloteClassic(input);
    }
    return this.computeCoinche(input);
  }

  // ==========================================================================
  // MODE 1 : BELOTE CLASSIQUE
  // ==========================================================================
  private static computeBeloteClassic(input: RoundScoreInput): RoundScoreResult {
    const takerTeam = getTeamForSeat(input.takerSeat);
    const defenderTeam = getOppositeTeam(takerTeam);

    // 1. Belote / Rebelote (imprenable même en cas de chute/dedans ou de capot adverse)
    const beloteNS = input.beloteTeam === 'NS' ? this.BELOTE_BONUS : 0;
    const beloteEW = input.beloteTeam === 'EW' ? this.BELOTE_BONUS : 0;

    // 2. Points des plis (252 si Capot, sinon sur 162)
    let trickNS = input.rawTrickPointsNS;
    let trickEW = input.rawTrickPointsEW;

    if (input.capotAchievedBy === 'NS') {
      trickNS = this.CAPOT_TRICK_POINTS_BELOTE;
      trickEW = 0;
    } else if (input.capotAchievedBy === 'EW') {
      trickNS = 0;
      trickEW = this.CAPOT_TRICK_POINTS_BELOTE;
    }

    // 3. Annonces éventuelles (si activées en variante Belote avec annonces)
    const { pointsNS: annNS, pointsEW: annEW, winningTeam: annWinner } =
      input.rules.enableAnnouncements
        ? this.resolveAnnouncements(input.declarations ?? [], input.trump, input.capotAchievedBy)
        : { pointsNS: 0, pointsEW: 0, winningTeam: undefined };

    // 4. Total d'évaluation du contrat pour chaque camp
    const evalNS = trickNS + (input.rules.beloteCountsTowardsContract ? beloteNS : 0) + annNS;
    const evalEW = trickEW + (input.rules.beloteCountsTowardsContract ? beloteEW : 0) + annEW;

    const takerEval = takerTeam === 'NS' ? evalNS : evalEW;
    const defenderEval = takerTeam === 'NS' ? evalEW : evalNS;

    const isLitige = takerEval === defenderEval && !input.capotAchievedBy;
    const isContractFulfilled = takerEval > defenderEval;

    let finalNS = 0;
    let finalEW = 0;
    let explanation = '';

    if (isContractFulfilled) {
      finalNS = trickNS + beloteNS + annNS;
      finalEW = trickEW + beloteEW + annEW;
      explanation = `Contrat réussi par ${takerTeam} (${takerEval} à ${defenderEval}).`;
    } else if (isLitige) {
      if (defenderTeam === 'NS') {
        finalNS = trickNS + beloteNS + annNS;
        finalEW = beloteEW;
      } else {
        finalEW = trickEW + beloteEW + annEW;
        finalNS = beloteNS;
      }
      explanation = `Litige (${takerEval} partout) : la défense (${defenderTeam}) marque ses points.`;
    } else {
      // DEDANS : La défense remporte les 162 pts (ou 252 si capot de la défense) + toutes les annonces,
      // MAIS la Belote-Rebelote reste toujours acquise à l'équipe qui l'a déclarée.
      const totalTrickPool =
        input.capotAchievedBy === defenderTeam
          ? this.CAPOT_TRICK_POINTS_BELOTE
          : this.TOTAL_STANDARD_TRICK_POINTS;
      const totalAnnouncements = annNS + annEW;

      if (defenderTeam === 'NS') {
        finalNS = totalTrickPool + totalAnnouncements + beloteNS;
        finalEW = beloteEW;
      } else {
        finalEW = totalTrickPool + totalAnnouncements + beloteEW;
        finalNS = beloteNS;
      }
      explanation = `Dedans ! ${takerTeam} chute (${takerEval} contre ${defenderEval}). ${defenderTeam} ramasse ${totalTrickPool} pts.`;
    }

    return {
      takerTeam,
      defenderTeam,
      isContractFulfilled,
      isLitige,
      normalizedTrickPointsNS: trickNS,
      normalizedTrickPointsEW: trickEW,
      belotePointsNS: beloteNS,
      belotePointsEW: beloteEW,
      announcementPointsNS: annNS,
      announcementPointsEW: annEW,
      winningAnnouncementsTeam: annWinner,
      finalScoreNS: this.applyRounding(finalNS, input.rules.scoringStyle),
      finalScoreEW: this.applyRounding(finalEW, input.rules.scoringStyle),
      breakdownExplanation: explanation,
    };
  }

  // ==========================================================================
  // MODE 2 : COINCHE / BELOTE COINCHÉE
  // ==========================================================================
  private static computeCoinche(input: RoundScoreInput): RoundScoreResult {
    const takerTeam = getTeamForSeat(input.takerSeat);
    const defenderTeam = getOppositeTeam(takerTeam);

    const multiplier =
      input.coincheLevel === CoincheLevel.SURCOINCHE
        ? 4
        : input.coincheLevel === CoincheLevel.COINCHE
        ? 2
        : 1;

    // 1. Normalisation des points de plis (Tout-Atout = 258 -> 162, Sans-Atout = 130 -> 162)
    const { trickNS, trickEW } = this.normalizeTrickPoints(input);

    // 2. Belote-Rebelote (Uniquement s'il y a un atout : pas de Belote à Sans-Atout)
    const canHaveBelote = input.trump !== TrumpMode.NO_TRUMP;
    const beloteNS = canHaveBelote && input.beloteTeam === 'NS' ? this.BELOTE_BONUS : 0;
    const beloteEW = canHaveBelote && input.beloteTeam === 'EW' ? this.BELOTE_BONUS : 0;

    // 3. Résolution des annonces (Tierce, 50, 100, Carrés)
    const { pointsNS: annNS, pointsEW: annEW, winningTeam: annWinner } =
      input.rules.enableAnnouncements && input.trump !== TrumpMode.NO_TRUMP
        ? this.resolveAnnouncements(input.declarations ?? [], input.trump, input.capotAchievedBy)
        : { pointsNS: 0, pointsEW: 0, winningTeam: undefined };

    // 4. Vérification de la réussite du contrat
    const takerTrickPoints = takerTeam === 'NS' ? trickNS : trickEW;
    const defenderTrickPoints = takerTeam === 'NS' ? trickEW : trickNS;
    const takerBelote = takerTeam === 'NS' ? beloteNS : beloteEW;
    const defenderBelote = takerTeam === 'NS' ? beloteEW : beloteNS;
    const takerAnn = takerTeam === 'NS' ? annNS : annEW;
    const defenderAnn = takerTeam === 'NS' ? annEW : annNS;

    const contractPointsForValidation =
      takerTrickPoints +
      (input.rules.beloteCountsTowardsContract ? takerBelote : 0) +
      (input.rules.announcementsCountTowardsContract ? takerAnn : 0);

    let isContractFulfilled = false;

    if (input.contractType === ContractType.GENERALE) {
      isContractFulfilled =
        input.capotAchievedBy === takerTeam && input.generaleAchievedByTaker === true;
    } else if (input.contractType === ContractType.CAPOT) {
      isContractFulfilled = input.capotAchievedBy === takerTeam;
    } else {
      const reachesContract = contractPointsForValidation >= input.contractValue;
      const hasMajority =
        contractPointsForValidation > defenderTrickPoints + defenderBelote + defenderAnn;
      isContractFulfilled = reachesContract && hasMajority;
    }

    const nominalContractValue =
      input.contractType === ContractType.GENERALE
        ? this.GENERALE_CONTRACT_BONUS_COINCHE
        : input.contractType === ContractType.CAPOT
        ? this.CAPOT_CONTRACT_BONUS_COINCHE
        : input.contractValue;

    let takerFinal = 0;
    let defenderFinal = 0;
    let explanation = '';

    if (isContractFulfilled) {
      if (input.coincheLevel !== CoincheLevel.NONE) {
        const baseSuccessScore =
          input.rules.scoringStyle === 'CONTRACT_ONLY'
            ? nominalContractValue
            : nominalContractValue + takerTrickPoints;

        takerFinal = (baseSuccessScore + takerAnn) * multiplier + takerBelote;
        defenderFinal = defenderBelote;
      } else {
        if (input.rules.scoringStyle === 'CONTRACT_ONLY') {
          takerFinal = nominalContractValue + takerAnn + takerBelote;
          defenderFinal =
            input.capotAchievedBy === takerTeam
              ? defenderBelote
              : defenderTrickPoints + defenderAnn + defenderBelote;
        } else {
          takerFinal = nominalContractValue + takerTrickPoints + takerAnn + takerBelote;
          defenderFinal =
            input.capotAchievedBy === takerTeam
              ? defenderBelote
              : defenderTrickPoints + defenderAnn + defenderBelote;
        }
      }
      explanation = `Contrat ${nominalContractValue} (${input.trump}) réussi par ${takerTeam}${
        multiplier > 1 ? ` [x${multiplier}]` : ''
      }.`;
    } else {
      const baseDefenseTrickPool =
        input.capotAchievedBy === defenderTeam
          ? this.CAPOT_CONTRACT_BONUS_COINCHE
          : 160;
      const allTableAnnouncements = takerAnn + defenderAnn;

      const basePenalty =
        input.rules.scoringStyle === 'CONTRACT_ONLY'
          ? nominalContractValue + allTableAnnouncements
          : baseDefenseTrickPool + nominalContractValue + allTableAnnouncements;

      defenderFinal = basePenalty * multiplier + defenderBelote;
      takerFinal = takerBelote;

      explanation = `Chute de ${takerTeam} sur ${nominalContractValue} (${contractPointsForValidation} pts réalisés). ${defenderTeam} marque ${defenderFinal} pts.`;
    }

    const finalNS = takerTeam === 'NS' ? takerFinal : defenderFinal;
    const finalEW = takerTeam === 'EW' ? takerFinal : defenderFinal;

    return {
      takerTeam,
      defenderTeam,
      isContractFulfilled,
      isLitige: false,
      normalizedTrickPointsNS: trickNS,
      normalizedTrickPointsEW: trickEW,
      belotePointsNS: beloteNS,
      belotePointsEW: beloteEW,
      announcementPointsNS: annNS,
      announcementPointsEW: annEW,
      winningAnnouncementsTeam: annWinner,
      finalScoreNS: this.applyRounding(finalNS, input.rules.scoringStyle),
      finalScoreEW: this.applyRounding(finalEW, input.rules.scoringStyle),
      breakdownExplanation: explanation,
    };
  }

  // ==========================================================================
  // NORMALISATION TOUT-ATOUT (258 -> 162) & SANS-ATOUT (130 -> 162)
  // ==========================================================================
  private static normalizeTrickPoints(input: RoundScoreInput): {
    trickNS: number;
    trickEW: number;
  } {
    if (input.capotAchievedBy === 'NS') {
      return { trickNS: this.CAPOT_CONTRACT_BONUS_COINCHE, trickEW: 0 };
    }
    if (input.capotAchievedBy === 'EW') {
      return { trickNS: 0, trickEW: this.CAPOT_CONTRACT_BONUS_COINCHE };
    }

    const sum = input.rawTrickPointsNS + input.rawTrickPointsEW;
    if (
      !input.rules.normalizeNoTrumpAllTrumpTo162 ||
      sum === this.TOTAL_STANDARD_TRICK_POINTS
    ) {
      return { trickNS: input.rawTrickPointsNS, trickEW: input.rawTrickPointsEW };
    }

    const scaledNS = Math.round(
      (input.rawTrickPointsNS * this.TOTAL_STANDARD_TRICK_POINTS) / sum
    );
    const scaledEW = this.TOTAL_STANDARD_TRICK_POINTS - scaledNS;
    return { trickNS: scaledNS, trickEW: scaledEW };
  }

  // ==========================================================================
  // RÉSOLUTION DES ANNONCES (Carrés > Cent > Cinquante > Tierce)
  // ==========================================================================
  private static resolveAnnouncements(
    declarations: readonly DeclaredAnnouncement[],
    _trump: TrumpMode,
    capotAchievedBy?: TeamSide
  ): { pointsNS: number; pointsEW: number; winningTeam?: TeamSide } {
    if (!declarations.length) {
      return { pointsNS: 0, pointsEW: 0 };
    }

    const validDeclarations = capotAchievedBy
      ? declarations.filter((d) => getTeamForSeat(d.declarer) === capotAchievedBy)
      : declarations;

    if (!validDeclarations.length) {
      return { pointsNS: 0, pointsEW: 0 };
    }

    let bestDeclaration: DeclaredAnnouncement | undefined;
    for (const decl of validDeclarations) {
      if (!bestDeclaration || this.compareDeclarations(decl, bestDeclaration) > 0) {
        bestDeclaration = decl;
      }
    }

    const winningTeam = bestDeclaration
      ? getTeamForSeat(bestDeclaration.declarer)
      : undefined;
    if (!winningTeam) {
      return { pointsNS: 0, pointsEW: 0 };
    }

    const totalWinningPoints = validDeclarations
      .filter((d) => getTeamForSeat(d.declarer) === winningTeam)
      .reduce((acc, d) => acc + this.ANNOUNCEMENT_VALUES[d.type], 0);

    return {
      pointsNS: winningTeam === 'NS' ? totalWinningPoints : 0,
      pointsEW: winningTeam === 'EW' ? totalWinningPoints : 0,
      winningTeam,
    };
  }

  private static compareDeclarations(
    a: DeclaredAnnouncement,
    b: DeclaredAnnouncement
  ): number {
    const valDiff =
      this.ANNOUNCEMENT_VALUES[a.type] - this.ANNOUNCEMENT_VALUES[b.type];
    if (valDiff !== 0) return valDiff;

    const rankOrder: readonly Rank[] = [
      Rank.SEVEN,
      Rank.EIGHT,
      Rank.NINE,
      Rank.TEN,
      Rank.JACK,
      Rank.QUEEN,
      Rank.KING,
      Rank.ACE,
    ];
    const rankA = a.highestRank ? rankOrder.indexOf(a.highestRank) : 0;
    const rankB = b.highestRank ? rankOrder.indexOf(b.highestRank) : 0;
    if (rankA !== rankB) return rankA - rankB;

    if (a.isAtTrump && !b.isAtTrump) return 1;
    if (!a.isAtTrump && b.isAtTrump) return -1;
    return 0;
  }

  private static applyRounding(score: number, style: ScoringStyle): number {
    if (style !== 'ROUNDED_TO_TEN') return score;
    return Math.round(score / 10) * 10;
  }

  private static validateInput(input: RoundScoreInput): void {
    if (input.rawTrickPointsNS < 0 || input.rawTrickPointsEW < 0) {
      throw new Error('Les points de plis ne peuvent pas être négatifs.');
    }
    if (!input.capotAchievedBy) {
      const sum = input.rawTrickPointsNS + input.rawTrickPointsEW;
      const validSums = [162, 258, 130];
      if (!validSums.includes(sum)) {
        throw new Error(
          `Total des points de plis invalide (${sum}). Attendu : 162 (standard), 258 (TA brut) ou 130 (SA brut).`
        );
      }
    }
  }
}
