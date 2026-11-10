import {
  DEFAULT_BELOTE_RULES,
  DEFAULT_COINCHE_RULES,
  getNextSeat,
  type GameMode,
  type PlayerSeat,
  type RoundScoreInput,
  type TableRulesConfig,
} from '../../../../../packages/core-rules/src/index.ts';
import { OfflineFirstGameRepository } from '../../data/repositories/OfflineFirstGameRepository.ts';
import {
  LifecycleSyncCoordinator,
  type SyncLifecycleStatus,
} from '../../data/sync/LifecycleSyncCoordinator.ts';
import type {
  GameRecord,
  PersistedRoundRecord,
  PlayerStatsSummary,
} from '../../domain/models/Game.ts';
import type {
  FriendEntry,
  LocalGuestProfile,
  OfflinePlayerQrPayload,
  UserProfile,
} from '../../domain/models/UserProfile.ts';

/**
 * Les 4 onglets de l'écran d'accueil :
 * 1. NEW_GAME (Création d'une partie — Onglet par défaut)
 * 2. GAMES_HISTORY (Historique des parties)
 * 3. STATS (Dashboard de statistiques & rivalités)
 * 4. ACCOUNT_AND_QR (Comptes, liaison invités & QR Codes)
 */
export type HomeTab =
  | 'NEW_GAME'
  | 'GAMES_HISTORY'
  | 'STATS'
  | 'ACCOUNT_AND_QR';

export interface AppViewModelState {
  readonly activeHomeTab: HomeTab;
  /**
   * La Feuille de Marque n'apparaît PAS dans les onglets de l'écran d'accueil :
   * elle s'ouvre uniquement lorsqu'on crée une nouvelle partie ou qu'on ouvre/modifie une partie depuis l'historique.
   */
  readonly isScoreSheetOpen: boolean;
  /** Donneur actuel de la prochaine donne (modifiable si on saute un tour) */
  readonly currentDealerSeat: PlayerSeat;
  /** Si renseigné, indique le numéro de la donne en cours d'édition sur la feuille de marque */
  readonly editingRoundNumber?: number;
  readonly editingRoundRecord?: PersistedRoundRecord;
  readonly currentUser: UserProfile;
  readonly syncStatus: SyncLifecycleStatus;
  readonly activeGame?: GameRecord;
  readonly gamesHistory: readonly GameRecord[];
  readonly cachedFriends: readonly FriendEntry[];
  readonly localGuests: readonly LocalGuestProfile[];
  readonly statsSummary: PlayerStatsSummary;
}

/**
 * Store central de l'application (architecture compatible Zustand / useSyncExternalStore)
 */
export class BeloteAppStore {
  private readonly repo: OfflineFirstGameRepository;
  private readonly syncCoordinator: LifecycleSyncCoordinator;
  /** Onglet 1 par défaut sur l'écran d'accueil : Création d'une partie */
  private activeHomeTab: HomeTab = 'NEW_GAME';
  /** La feuille de marque est fermée sur l'accueil tant qu'on ne crée/modifie pas une partie */
  private isScoreSheetOpen = false;
  private activeGameId?: string;
  private currentDealerSeat: PlayerSeat = 'SOUTH';
  private editingRoundNumber?: number;
  private statsModeFilter: GameMode | 'ALL' = 'ALL';
  private readonly listeners = new Set<(state: AppViewModelState) => void>();

  constructor(repo?: OfflineFirstGameRepository) {
    this.repo = repo ?? new OfflineFirstGameRepository();
    this.syncCoordinator = new LifecycleSyncCoordinator(this.repo);
    this.syncCoordinator.subscribe(() => this.notify());
  }

  public subscribe(listener: (state: AppViewModelState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): AppViewModelState {
    const gamesHistory = this.repo.getAllGames();
    const activeGame = this.activeGameId
      ? gamesHistory.find((g) => g.id === this.activeGameId)
      : undefined;
    const editingRoundRecord =
      activeGame && this.editingRoundNumber !== undefined
        ? activeGame.rounds.find(
            (r) => r.roundNumber === this.editingRoundNumber
          )
        : undefined;
    const currentUser = this.repo.getCurrentUser();

    return {
      activeHomeTab: this.activeHomeTab,
      isScoreSheetOpen: this.isScoreSheetOpen && activeGame !== undefined,
      currentDealerSeat: editingRoundRecord
        ? editingRoundRecord.dealerSeat
        : this.currentDealerSeat,
      editingRoundNumber: this.editingRoundNumber,
      editingRoundRecord,
      currentUser,
      syncStatus: this.syncCoordinator.getStatus(),
      activeGame,
      gamesHistory,
      cachedFriends: this.repo.getCachedFriends(),
      localGuests: this.repo.getLocalGuests(),
      statsSummary: this.repo.computePlayerStats(
        currentUser.id,
        this.statsModeFilter
      ),
    };
  }

  /** Change d'onglet sur l'écran d'accueil (et ferme la feuille de marque si elle était ouverte) */
  public navigateToHomeTab(tab: HomeTab): void {
    this.activeHomeTab = tab;
    this.isScoreSheetOpen = false;
    this.editingRoundNumber = undefined;
    this.notify();
  }

  /** Permet de changer manuellement le donneur (ou de sauter un tour) */
  public setCurrentDealerSeat(seat: PlayerSeat): void {
    this.currentDealerSeat = seat;
    this.notify();
  }

  /** Passe au donneur suivant si on saute un tour / fausse donne */
  public skipDealerTurn(): PlayerSeat {
    this.currentDealerSeat = getNextSeat(this.currentDealerSeat);
    this.notify();
    return this.currentDealerSeat;
  }

  /** Ouvre la Feuille de Marque pour consulter ou modifier une partie existante depuis l'Historique */
  public selectGameFromHistory(gameId: string): void {
    this.activeGameId = gameId;
    this.isScoreSheetOpen = true;
    this.editingRoundNumber = undefined;
    const game = this.repo.getAllGames().find((g) => g.id === gameId);
    if (game && game.rounds.length > 0) {
      const lastRound = game.rounds[game.rounds.length - 1];
      this.currentDealerSeat = getNextSeat(lastRound.dealerSeat);
    }
    this.notify();
  }

  /** Ferme la Feuille de Marque et revient à l'écran d'accueil */
  public closeScoreSheet(returnToTab?: HomeTab): void {
    if (returnToTab) {
      this.activeHomeTab = returnToTab;
    }
    this.isScoreSheetOpen = false;
    this.editingRoundNumber = undefined;
    this.notify();
  }

  /** Passe la feuille de marque en mode édition d'une donne existante */
  public startEditingRound(roundNumber: number): void {
    this.editingRoundNumber = roundNumber;
    const activeGame = this.getState().activeGame;
    const round = activeGame?.rounds.find((r) => r.roundNumber === roundNumber);
    if (round) {
      this.currentDealerSeat = round.dealerSeat;
    }
    this.notify();
  }

  public cancelEditingRound(): void {
    this.editingRoundNumber = undefined;
    this.notify();
  }

  public setStatsModeFilter(mode: GameMode | 'ALL'): void {
    this.statsModeFilter = mode;
    this.notify();
  }

  public createGuest(displayName: string): LocalGuestProfile {
    const guest = this.repo.createLocalGuest(displayName);
    this.notify();
    return guest;
  }

  public scanOfflineFriendQr(qrPayload: OfflinePlayerQrPayload): FriendEntry {
    const friend = this.repo.registerFriendFromOfflineQr(qrPayload);
    this.notify();
    return friend;
  }

  /** Crée une nouvelle partie (supporte 500, 1000, 1500, 2000 pts) et ouvre immédiatement sa Feuille de Marque */
  public startNewGame(params: {
    mode: GameMode;
    targetScore?: number;
    initialDealerSeat?: PlayerSeat;
    customRules?: Partial<TableRulesConfig>;
    seats: Readonly<
      Record<
        PlayerSeat,
        | { type: 'CURRENT_USER' }
        | { type: 'FRIEND'; profileId: string; username: string }
        | { type: 'OFFLINE_QR'; qrPayload: OfflinePlayerQrPayload }
        | { type: 'GUEST'; guestId: string }
      >
    >;
  }): GameRecord {
    const baseRules =
      params.mode === 'BELOTE_CLASSIC'
        ? DEFAULT_BELOTE_RULES
        : DEFAULT_COINCHE_RULES;

    const game = this.repo.createGame({
      mode: params.mode,
      targetScore: params.targetScore ?? 1000,
      rules: { ...baseRules, ...params.customRules, mode: params.mode },
      seats: params.seats,
    });

    this.activeGameId = game.id;
    this.currentDealerSeat = params.initialDealerSeat ?? 'SOUTH';
    this.isScoreSheetOpen = true;
    this.editingRoundNumber = undefined;
    this.notify();
    return game;
  }

  public addRoundToActiveGame(
    dealerSeat: PlayerSeat,
    input: RoundScoreInput
  ): GameRecord {
    const current = this.getState().activeGame;
    if (!current) {
      throw new Error('Aucune partie active.');
    }
    const updated = this.repo.recordRound(current.id, dealerSeat, input);
    this.currentDealerSeat = getNextSeat(dealerSeat);
    this.editingRoundNumber = undefined;
    this.notify();
    return updated;
  }

  /** Modifie une donne existante de la partie active (y compris son donneur si modifié) */
  public updateRoundInActiveGame(
    roundNumber: number,
    updatedInput: RoundScoreInput,
    updatedDealerSeat?: PlayerSeat
  ): GameRecord {
    const current = this.getState().activeGame;
    if (!current) {
      throw new Error('Aucune partie active.');
    }
    const updated = this.repo.updateRound(
      current.id,
      roundNumber,
      updatedInput,
      updatedDealerSeat ?? this.currentDealerSeat
    );
    this.editingRoundNumber = undefined;
    this.notify();
    return updated;
  }

  public async setNetworkConnectivity(isOnline: boolean): Promise<void> {
    await this.syncCoordinator.onConnectivityOrAppForegroundChange(isOnline);
    this.notify();
  }

  public async signInAndMergeLocalAccount(params: {
    authenticatedUserId: string;
    username: string;
    email?: string;
    provider: 'EMAIL' | 'APPLE' | 'GOOGLE';
  }): Promise<{ migratedGamesCount: number }> {
    const res =
      this.repo.linkCurrentAnonymousAccountToAuthenticatedProfile(params);
    await this.syncCoordinator.onConnectivityOrAppForegroundChange(true);
    this.notify();
    return { migratedGamesCount: res.migratedGamesCount };
  }

  public async linkGuestToFriend(params: {
    guestId?: string;
    claimCode?: string;
    targetProfileId: string;
    targetUsername: string;
    targetFriendCode: string;
  }): Promise<{ updatedGamesCount: number }> {
    const res = this.repo.linkGuestToFriendProfile(params);
    if (this.syncCoordinator.getStatus().connectivity !== 'OFFLINE_BOAT') {
      await this.syncCoordinator.onConnectivityOrAppForegroundChange(true);
    }
    this.notify();
    return res;
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
