import type { GameRecord } from '../../domain/models/Game.ts';
import type { SyncLifecycleStatus } from '../../data/sync/LifecycleSyncCoordinator.ts';

export interface ScoreSheetViewModel {
  readonly gameId: string;
  readonly modeLabel: string;
  readonly teamNSLabel: string;
  readonly teamEWLabel: string;
  readonly scoreNS: number;
  readonly scoreEW: number;
  readonly targetScore: number;
  readonly progressPctNS: number;
  readonly progressPctEW: number;
  readonly syncBadgeLabel: string;
  readonly unlinkedPlayersInGame: ReadonlyArray<{
    seat: string;
    displayName: string;
    guestId?: string;
    claimCode?: string;
  }>;
  readonly roundsRows: ReadonlyArray<{
    roundNumber: number;
    contractSummary: string;
    statusBadge: 'RÉUSSI' | 'CHUTE' | 'LITIGE';
    scoreNS: number;
    scoreEW: number;
    cumulativeNS: number;
    cumulativeEW: number;
    explanation: string;
  }>;
}

export class ScoreSheetPresenter {
  public static buildViewModel(
    game: GameRecord,
    syncStatus: SyncLifecycleStatus
  ): ScoreSheetViewModel {
    const nsPlayers = game.participants
      .filter((p) => p.team === 'NS')
      .map((p) => p.displayName)
      .join(' & ');
    const ewPlayers = game.participants
      .filter((p) => p.team === 'EW')
      .map((p) => p.displayName)
      .join(' & ');

    const unlinkedPlayersInGame = game.participants
      .filter((p) => p.identityType === 'LOCAL_GUEST' && !p.profileId)
      .map((p) => ({
        seat: p.seat,
        displayName: p.displayName,
        guestId: p.guestId,
        claimCode: p.claimCode,
      }));

    let runningNS = 0;
    let runningEW = 0;

    const roundsRows = game.rounds.map((r) => {
      runningNS += r.result.finalScoreNS;
      runningEW += r.result.finalScoreEW;

      const coincheSuffix =
        r.input.coincheLevel === 'SURCOINCHE'
          ? ' 🔥 Surcoinché (x4)'
          : r.input.coincheLevel === 'COINCHE'
          ? ' ⚡ Coinché (x2)'
          : '';

      const contractSummary =
        game.mode === 'BELOTE_CLASSIC'
          ? `Prise ${r.result.takerTeam} (${r.input.trump})`
          : `${r.result.takerTeam} : ${r.input.contractValue} ${r.input.trump}${coincheSuffix}`;

      const statusBadge: 'RÉUSSI' | 'CHUTE' | 'LITIGE' = r.result.isLitige
        ? 'LITIGE'
        : r.result.isContractFulfilled
        ? 'RÉUSSI'
        : 'CHUTE';

      return {
        roundNumber: r.roundNumber,
        contractSummary,
        statusBadge,
        scoreNS: r.result.finalScoreNS,
        scoreEW: r.result.finalScoreEW,
        cumulativeNS: runningNS,
        cumulativeEW: runningEW,
        explanation: r.result.breakdownExplanation,
      };
    });

    const syncBadgeLabel =
      syncStatus.connectivity === 'OFFLINE_BOAT'
        ? `⛵ Hors-Ligne (${syncStatus.pendingMutationsCount} en file locale)`
        : syncStatus.connectivity === 'ONLINE_SYNCING'
        ? `🔄 Synchronisation Cloud en cours...`
        : `☁️ Synchronisé en ligne`;

    return {
      gameId: game.id,
      modeLabel:
        game.mode === 'BELOTE_CLASSIC'
          ? 'Belote Classique'
          : 'Coinche / Belote Coinchée',
      teamNSLabel: nsPlayers || 'Nord - Sud',
      teamEWLabel: ewPlayers || 'Est - Ouest',
      scoreNS: game.scoreNS,
      scoreEW: game.scoreEW,
      targetScore: game.targetScore,
      progressPctNS: Math.min(
        100,
        Math.round((game.scoreNS / game.targetScore) * 100)
      ),
      progressPctEW: Math.min(
        100,
        Math.round((game.scoreEW / game.targetScore) * 100)
      ),
      syncBadgeLabel,
      unlinkedPlayersInGame,
      roundsRows,
    };
  }
}
