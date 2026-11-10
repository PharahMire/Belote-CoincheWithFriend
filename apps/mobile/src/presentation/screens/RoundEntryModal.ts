import {
  AnnouncementType,
  CoincheLevel,
  ContractType,
  ScoreEngine,
  TrumpMode,
  type DeclaredAnnouncement,
  type PlayerSeat,
  type RoundScoreInput,
  type RoundScoreResult,
  type TableRulesConfig,
  type TeamSide,
} from '../../../../../packages/core-rules/src/index.ts';

export interface RoundEntryDraft {
  readonly rules: TableRulesConfig;
  readonly takerSeat: PlayerSeat;
  readonly trump: TrumpMode;
  readonly contractType: ContractType;
  readonly contractValue: number;
  readonly coincheLevel: CoincheLevel;
  readonly coincherSeat?: PlayerSeat;
  readonly pointsEnteredForTeam: TeamSide;
  readonly pointsEnteredValue: number; // 0..162
  readonly capotAchievedBy?: TeamSide;
  readonly generaleAchievedByTaker?: boolean;
  readonly beloteTeam?: TeamSide;
  readonly declarations: readonly DeclaredAnnouncement[];
}

export interface TrickBarDisplayState {
  readonly rawTrickPointsNS: number;
  readonly rawTrickPointsEW: number;
  /** Affiche 'Capot', 'Capot B', 'Générale' ou le nombre de points (0..162) */
  readonly displayLabelNS: string;
  readonly displayLabelEW: string;
  /** Pourcentage de remplissage de la barre de score des plis (0..100%) */
  readonly barFillPctNS: number;
  readonly barFillPctEW: number;
}

/**
 * Aide à la saisie rapide sur mobile (Feuille de Marque Belote & Coinche) :
 * - Complète automatiquement les points de l'équipe adverse sur 162 (`162 - pointsSaisis`).
 * - Remplit la barre à 100% et affiche 'Capot', 'Capot B' ou 'Générale' lorsque l'un de ces contrats/résultats est réalisé.
 * - Calcule en temps réel l'aperçu du score (Réussi / Dedans / Chute Coinche) avant validation.
 */
export class RoundEntryFormController {
  public static readonly COINCHE_BID_LADDER = [
    80, 90, 100, 110, 120, 130, 140, 150, 160,
  ] as const;

  public static readonly SPECIAL_CONTRACTS = [
    { type: ContractType.CAPOT, label: 'Capot (250)' },
    { type: ContractType.CAPOT_BELOTE, label: 'Capot Beloté (250+20)' },
    { type: ContractType.GENERALE, label: 'Générale (500)' },
  ] as const;

  public static computeAutoComplementPoints(
    enteredTeam: TeamSide,
    enteredValue: number,
    capotAchievedBy?: TeamSide,
    contractType: ContractType = ContractType.NORMAL,
    beloteTeam?: TeamSide,
    generaleAchievedByTaker?: boolean
  ): TrickBarDisplayState {
    if (capotAchievedBy === 'NS') {
      const specialLabel =
        contractType === ContractType.GENERALE && generaleAchievedByTaker
          ? 'Générale'
          : contractType === ContractType.CAPOT_BELOTE || beloteTeam === 'NS'
          ? 'Capot B'
          : 'Capot';
      return {
        rawTrickPointsNS: 162,
        rawTrickPointsEW: 0,
        displayLabelNS: specialLabel,
        displayLabelEW: '0',
        barFillPctNS: 100,
        barFillPctEW: 0,
      };
    }

    if (capotAchievedBy === 'EW') {
      const specialLabel =
        contractType === ContractType.GENERALE && generaleAchievedByTaker
          ? 'Générale'
          : contractType === ContractType.CAPOT_BELOTE || beloteTeam === 'EW'
          ? 'Capot B'
          : 'Capot';
      return {
        rawTrickPointsNS: 0,
        rawTrickPointsEW: 162,
        displayLabelNS: '0',
        displayLabelEW: specialLabel,
        barFillPctNS: 0,
        barFillPctEW: 100,
      };
    }

    const clamped = Math.max(0, Math.min(162, Math.round(enteredValue)));
    const complement = 162 - clamped;
    const ns = enteredTeam === 'NS' ? clamped : complement;
    const ew = enteredTeam === 'NS' ? complement : clamped;

    return {
      rawTrickPointsNS: ns,
      rawTrickPointsEW: ew,
      displayLabelNS: String(ns),
      displayLabelEW: String(ew),
      barFillPctNS: Math.round((ns / 162) * 100),
      barFillPctEW: Math.round((ew / 162) * 100),
    };
  }

  public static toScoreInput(draft: RoundEntryDraft): RoundScoreInput {
    const { rawTrickPointsNS, rawTrickPointsEW } =
      this.computeAutoComplementPoints(
        draft.pointsEnteredForTeam,
        draft.pointsEnteredValue,
        draft.capotAchievedBy,
        draft.contractType,
        draft.beloteTeam,
        draft.generaleAchievedByTaker
      );

    return {
      rules: draft.rules,
      takerSeat: draft.takerSeat,
      trump: draft.trump,
      contractType: draft.contractType,
      contractValue:
        draft.contractType === ContractType.GENERALE
          ? 500
          : draft.contractType === ContractType.CAPOT ||
            draft.contractType === ContractType.CAPOT_BELOTE
          ? 250
          : draft.contractValue,
      coincheLevel: draft.coincheLevel,
      coincherSeat: draft.coincherSeat,
      rawTrickPointsNS,
      rawTrickPointsEW,
      capotAchievedBy: draft.capotAchievedBy,
      generaleAchievedByTaker: draft.generaleAchievedByTaker,
      beloteTeam: draft.beloteTeam,
      declarations: draft.declarations,
    };
  }

  public static previewLiveScore(draft: RoundEntryDraft): RoundScoreResult {
    return ScoreEngine.computeRoundScore(this.toScoreInput(draft));
  }

  public static getAvailableAnnouncementTypes(): AnnouncementType[] {
    return [
      AnnouncementType.TIERCE,
      AnnouncementType.CINQUANTE,
      AnnouncementType.CENT,
      AnnouncementType.CARRE_JACKS,
      AnnouncementType.CARRE_NINES,
      AnnouncementType.CARRE_ACES,
      AnnouncementType.CARRE_TENS,
      AnnouncementType.CARRE_KINGS,
      AnnouncementType.CARRE_QUEENS,
    ];
  }
}
