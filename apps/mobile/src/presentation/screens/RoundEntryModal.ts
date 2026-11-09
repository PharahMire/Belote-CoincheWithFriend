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

/**
 * Aide à la saisie rapide sur mobile (Feuille de Marque Belote & Coinche) :
 * - Complète automatiquement les points de l'équipe adverse sur 162 (`162 - pointsSaisis`).
 * - Calcule en temps réel l'aperçu du score (Réussi / Dedans / Chute Coinche) avant validation.
 */
export class RoundEntryFormController {
  public static readonly COINCHE_BID_LADDER = [
    80, 90, 100, 110, 120, 130, 140, 150, 160,
  ] as const;

  public static computeAutoComplementPoints(
    enteredTeam: TeamSide,
    enteredValue: number,
    capotAchievedBy?: TeamSide
  ): { rawTrickPointsNS: number; rawTrickPointsEW: number } {
    if (capotAchievedBy === 'NS') {
      return { rawTrickPointsNS: 162, rawTrickPointsEW: 0 };
    }
    if (capotAchievedBy === 'EW') {
      return { rawTrickPointsNS: 0, rawTrickPointsEW: 162 };
    }

    const clamped = Math.max(0, Math.min(162, Math.round(enteredValue)));
    const complement = 162 - clamped;

    return enteredTeam === 'NS'
      ? { rawTrickPointsNS: clamped, rawTrickPointsEW: complement }
      : { rawTrickPointsNS: complement, rawTrickPointsEW: clamped };
  }

  public static toScoreInput(draft: RoundEntryDraft): RoundScoreInput {
    const { rawTrickPointsNS, rawTrickPointsEW } =
      this.computeAutoComplementPoints(
        draft.pointsEnteredForTeam,
        draft.pointsEnteredValue,
        draft.capotAchievedBy
      );

    return {
      rules: draft.rules,
      takerSeat: draft.takerSeat,
      trump: draft.trump,
      contractType: draft.contractType,
      contractValue:
        draft.contractType === ContractType.GENERALE
          ? 500
          : draft.contractType === ContractType.CAPOT
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
