import {
  DEFAULT_BELOTE_RULES,
  DEFAULT_COINCHE_RULES,
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
  PlayerStatsSummary,
} from '../../domain/models/Game.ts';
import type {
  FriendEntry,
  LocalGuestProfile,
  OfflinePlayerQrPayload,
  UserProfile,
} from '../../domain/models/UserProfile.ts';

export type ActiveTabScreen =
  | 'SCOREBOARD'
  | 'NEW_GAME'
  | 'GUEST_LINKING'
  | 'STATS'
  | 'ACCOUNT_AND_QR';

export interface AppViewModelState {
  readonly activeScreen: ActiveTabScreen;
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
  private activeScreen: ActiveTabScreen = 'NEW_GAME';
  private activeGameId?: string;
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
      : gamesHistory[0];
    const currentUser = this.repo.getCurrentUser();

    return {
      activeScreen: this.activeScreen,
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

  public navigateTo(screen: ActiveTabScreen): void {
    this.activeScreen = screen;
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

  public startNewGame(params: {
    mode: GameMode;
    targetScore?: number;
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
    this.activeScreen = 'SCOREBOARD';
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
