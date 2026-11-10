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
    roundsRows: ReadonlyArray<{
    roundNumber: number;
    contractSummary: string;
    statusBadge: 'RÉUSSI' | 'CHUTE' | 'LITIGE';
    trickDisplayNS: string;
    trickDisplayEW: string;
    scoreNS: number;
    scoreEW: number;
    cumulativeNS: number;
    cumulativeEW: number;
    explanation: string;
  }>;
}

export interface GameHistoryItemViewModel {
  readonly gameId: string;
  readonly title: string;
  readonly modeLabel: string;
  readonly statusLabel: 'EN COURS' | 'TERMINÉE';
  readonly scoreSummary: string;
  readonly winnerLabel?: string;
  readonly roundsCount: number;
  readonly syncBadge: '☁️ Sync' | '⏳ Local';
}

export class ScoreSheetPresenter {
  public static buildGamesHistoryList(
    games: readonly GameRecord[]
  ): GameHistoryItemViewModel[] {
    return games.map((g, idx) => {
      const nsNames = g.participants
        .filter((p) => p.team === 'NS')
        .map((p) => p.displayName)
        .join(' & ');
      const ewNames = g.participants
        .filter((p) => p.team === 'EW')
        .map((p) => p.displayName)
        .join(' & ');

      return {
        gameId: g.id,
        title: `Partie #${games.length - idx} : ${nsNames} vs ${ewNames}`,
        modeLabel: g.mode === 'BELOTE_CLASSIC' ? 'Belote' : 'Coinche',
        statusLabel: g.status === 'COMPLETED' ? 'TERMINÉE' : 'EN COURS',
        scoreSummary: `${g.scoreNS} - ${g.scoreEW}`,
        winnerLabel:
          g.winnerTeam === 'NS'
            ? `Victoire ${nsNames}`
            : g.winnerTeam === 'EW'
            ? `Victoire ${ewNames}`
            : undefined,
        roundsCount: g.rounds.length,
        syncBadge: g.syncStatus === 'SYNCED' ? '☁️ Sync' : '⏳ Local',
      };
    });
  }

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

      const contractName =
        r.input.contractType === 'CAPOT_BELOTE'
          ? 'Capot Beloté'
          : r.input.contractType === 'CAPOT'
          ? 'Capot'
          : r.input.contractType === 'GENERALE'
          ? 'Générale'
          : String(r.input.contractValue);

      const contractSummary =
        game.mode === 'BELOTE_CLASSIC'
          ? `Prise ${r.result.takerTeam} (${r.input.trump})`
          : `${r.result.takerTeam} : ${contractName} ${r.input.trump}${coincheSuffix}`;

      const statusBadge: 'RÉUSSI' | 'CHUTE' | 'LITIGE' = r.result.isLitige
        ? 'LITIGE'
        : r.result.isContractFulfilled
        ? 'RÉUSSI'
        : 'CHUTE';

      return {
        roundNumber: r.roundNumber,
        contractSummary,
        statusBadge,
        trickDisplayNS: r.result.trickDisplayNS,
        trickDisplayEW: r.result.trickDisplayEW,
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
