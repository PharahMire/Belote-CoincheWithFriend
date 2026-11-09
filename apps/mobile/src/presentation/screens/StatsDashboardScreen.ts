import { TrumpMode } from '../../../../../packages/core-rules/src/index.ts';
import type { PlayerStatsSummary } from '../../domain/models/Game.ts';

export class StatsDashboardPresenter {
  private static readonly TRUMP_LABELS: Readonly<Record<TrumpMode, string>> = {
    [TrumpMode.SPADES]: '♠ Pique',
    [TrumpMode.HEARTS]: '♥ Cœur',
    [TrumpMode.DIAMONDS]: '♦ Carreau',
    [TrumpMode.CLUBS]: '♣ Trèfle',
    [TrumpMode.NO_TRUMP]: 'Sans-Atout (SA)',
    [TrumpMode.ALL_TRUMP]: 'Tout-Atout (TA)',
  };

  public static buildViewModel(stats: PlayerStatsSummary) {
    const trumpBreakdown = (Object.keys(stats.winRateByTrump) as TrumpMode[]).map(
      (trump) => ({
        trump,
        label: this.TRUMP_LABELS[trump],
        taken: stats.winRateByTrump[trump].taken,
        succeeded: stats.winRateByTrump[trump].succeeded,
        winRatePct: stats.winRateByTrump[trump].winRatePct,
      })
    );

    return {
      kpis: [
        {
          label: 'Victoires',
          value: `${stats.winRatePct}%`,
          sublabel: `${stats.gamesWon}V / ${stats.gamesPlayed} parties`,
        },
        {
          label: 'Réussite Contrats',
          value: `${stats.contractSuccessRatePct}%`,
          sublabel: `${stats.contractsFulfilled}/${stats.contractsTaken} contrats faits`,
        },
        {
          label: 'Moyenne / Donne',
          value: `${stats.averagePointsPerRound} pts`,
          sublabel: `Sur ${stats.roundsPlayed} donnes jouées`,
        },
        {
          label: 'Efficacité Coinches',
          value: `${stats.coincheEfficiencyPct}%`,
          sublabel: `${stats.coinchesSucceeded}/${stats.coinchesAttempted} chutes provoquées`,
        },
      ],
      capotsAchieved: stats.capotsAchieved,
      trumpBreakdown,
    };
  }
}
