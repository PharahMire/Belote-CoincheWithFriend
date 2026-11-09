import {
  getTeamForSeat,
  ScoreEngine,
  TrumpMode,
  type GameMode,
  type PlayerSeat,
  type RoundScoreInput,
  type TableRulesConfig,
} from '../../../../../packages/core-rules/src/index.ts';
import type {
  GameParticipant,
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
import { HybridLogicalClock } from '../sync/HybridLogicalClock.ts';
import type { SyncMutationRecord } from '../sync/SyncEngine.ts';

/**
 * Repository Offline-First complet gérant :
 * 1. Les parties créées hors-ligne ("Mode Bateau") et la file d'attente `sync_queue`.
 * 2. La liaison de compte anonyme -> compte authentifié (Apple/Google/Email).
 * 3. La liaison différée des joueurs invités (`guestId` / `claimCode`) -> vrais profils d'amis (`profileId`).
 * 4. Le calcul analytique des statistiques individuelles et par couleur d'atout.
 */
export class OfflineFirstGameRepository {
  private games = new Map<string, GameRecord>();
  private guests = new Map<string, LocalGuestProfile>();
  private cachedFriends = new Map<string, FriendEntry>();
  private syncQueue = new Map<string, SyncMutationRecord>();
  private currentUser: UserProfile;
  private readonly hlc: HybridLogicalClock;

  constructor(initialProfile?: UserProfile, deviceNodeId = 'mobile-node-01') {
    this.hlc = new HybridLogicalClock(deviceNodeId);
    this.currentUser = initialProfile ?? {
      id: 'local-anon-user-01',
      username: 'Capitaine (Local)',
      friendCode: 'BLT-7A92C',
      authStatus: 'OFFLINE_ANONYMOUS',
      linkedProviders: [],
      isOnline: false,
    };
  }

  public getCurrentUser(): UserProfile {
    return this.currentUser;
  }

  public getCachedFriends(): FriendEntry[] {
    return Array.from(this.cachedFriends.values());
  }

  public getLocalGuests(): LocalGuestProfile[] {
    return Array.from(this.guests.values());
  }

  public getAllGames(): GameRecord[] {
    return Array.from(this.games.values()).sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt)
    );
  }

  public getPendingSyncQueue(): SyncMutationRecord[] {
    return Array.from(this.syncQueue.values()).filter(
      (m) => m.status === 'PENDING'
    );
  }

  /**
   * 1. CRÉATION D'INVITÉ HORS-LIGNE ("Mode Bateau")
   * Génère un `guestId` persistant et un `claimCode` court (ex: "CLAIM-4821")
   * pour que ce joueur puisse jouer plusieurs parties hors-ligne et tout récupérer plus tard.
   */
  public createLocalGuest(displayName: string): LocalGuestProfile {
    const cleanName = displayName.trim();
    if (!cleanName) {
      throw new Error('Le pseudo de l’invité ne peut pas être vide.');
    }
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const guest: LocalGuestProfile = {
      guestId: `guest-${Date.now()}-${randomSuffix}`,
      displayName: cleanName,
      claimCode: `CLAIM-${randomSuffix}`,
      createdAt: new Date().toISOString(),
    };
    this.guests.set(guest.guestId, guest);
    return guest;
  }

  /**
   * 2. AJOUT D'AMI PAR SCAN QR CODE HORS-LIGNE ("Offline P2P QR Token")
   * Permet de lier directement le vrai `profileId` d'un ami autour de la table
   * sans aucune connexion Internet !
   */
  public registerFriendFromOfflineQr(
    qrPayload: OfflinePlayerQrPayload
  ): FriendEntry {
    const entry: FriendEntry = {
      profileId: qrPayload.profileId,
      username: qrPayload.username,
      friendCode: qrPayload.friendCode,
      avatarUrl: qrPayload.avatarUrl,
      isOnline: false,
      status: 'ACCEPTED',
    };
    this.cachedFriends.set(entry.profileId, entry);
    return entry;
  }

  /**
   * Génère le payload QR Code hors-ligne du joueur courant
   */
  public generateMyOfflineQrPayload(): OfflinePlayerQrPayload {
    return {
      version: 1,
      profileId: this.currentUser.id,
      username: this.currentUser.username,
      friendCode: this.currentUser.friendCode,
      avatarUrl: this.currentUser.avatarUrl,
      issuedAt: Date.now(),
    };
  }

  /**
   * 3. CRÉATION D'UNE PARTIE HORS-LIGNE OU EN LIGNE
   */
  public createGame(params: {
    id?: string;
    mode: GameMode;
    targetScore: number;
    rules: TableRulesConfig;
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
    const gameId = params.id ?? `game-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const nowIso = new Date().toISOString();
    const hlc = this.hlc.now();

    const seatOrder: PlayerSeat[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    const participants: GameParticipant[] = seatOrder.map((seat) => {
      const config = params.seats[seat];
      const team = getTeamForSeat(seat);
      const participantId = `${gameId}-${seat}`;

      if (config.type === 'CURRENT_USER') {
        return {
          id: participantId,
          gameId,
          seat,
          team,
          identityType: 'AUTHENTICATED_USER',
          profileId: this.currentUser.id,
          displayName: this.currentUser.username,
        };
      }

      if (config.type === 'FRIEND') {
        return {
          id: participantId,
          gameId,
          seat,
          team,
          identityType: 'AUTHENTICATED_USER',
          profileId: config.profileId,
          displayName: config.username,
        };
      }

      if (config.type === 'OFFLINE_QR') {
        const friend = this.registerFriendFromOfflineQr(config.qrPayload);
        return {
          id: participantId,
          gameId,
          seat,
          team,
          identityType: 'OFFLINE_QR_VERIFIED',
          profileId: friend.profileId,
          displayName: friend.username,
        };
      }

      const guest = this.guests.get(config.guestId);
      if (!guest) {
        throw new Error(`Invité introuvable : ${config.guestId}`);
      }

      return {
        id: participantId,
        gameId,
        seat,
        team,
        identityType: 'LOCAL_GUEST',
        profileId: guest.linkedProfileId,
        guestId: guest.guestId,
        displayName: guest.linkedUsername ?? guest.displayName,
        claimCode: guest.claimCode,
      };
    });

    const game: GameRecord = {
      id: gameId,
      createdByProfileId: this.currentUser.id,
      mode: params.mode,
      status: 'IN_PROGRESS',
      targetScore: params.targetScore,
      rules: params.rules,
      participants,
      rounds: [],
      scoreNS: 0,
      scoreEW: 0,
      startedAt: nowIso,
      clientHlc: hlc,
      syncStatus: 'DIRTY',
    };

    this.games.set(gameId, game);
    this.enqueueMutation('GAME', gameId, 'UPSERT', game, hlc);
    return game;
  }

  /**
   * 4. ENREGISTREMENT D'UNE DONNE (100% Hors-Ligne, < 5ms)
   */
  public recordRound(
    gameId: string,
    dealerSeat: PlayerSeat,
    input: RoundScoreInput
  ): GameRecord {
    const game = this.games.get(gameId);
    if (!game) {
      throw new Error(`Partie introuvable : ${gameId}`);
    }

    const result = ScoreEngine.computeRoundScore(input);
    const roundNumber = game.rounds.length + 1;
    const roundId = `${gameId}-round-${roundNumber}`;
    const hlc = this.hlc.now();

    const roundRecord: PersistedRoundRecord = {
      id: roundId,
      gameId,
      roundNumber,
      dealerSeat,
      input,
      result,
      createdAt: new Date().toISOString(),
      clientHlc: hlc,
      syncStatus: 'DIRTY',
    };

    const nextScoreNS = game.scoreNS + result.finalScoreNS;
    const nextScoreEW = game.scoreEW + result.finalScoreEW;

    const isCompleted =
      nextScoreNS >= game.targetScore || nextScoreEW >= game.targetScore;
    const winnerTeam = isCompleted
      ? nextScoreNS >= nextScoreEW
        ? 'NS'
        : 'EW'
      : undefined;

    const updatedGame: GameRecord = {
      ...game,
      rounds: [...game.rounds, roundRecord],
      scoreNS: nextScoreNS,
      scoreEW: nextScoreEW,
      status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
      winnerTeam,
      endedAt: isCompleted ? new Date().toISOString() : undefined,
      clientHlc: hlc,
      syncStatus: 'DIRTY',
    };

    this.games.set(gameId, updatedGame);
    this.enqueueMutation('GAME_ROUND', roundId, 'UPSERT', roundRecord, hlc);
    this.enqueueMutation('GAME', gameId, 'UPSERT', updatedGame, hlc);
    return updatedGame;
  }

  /**
   * 5. CONNEXION & LIAISON DU COMPTE LOCAL ("Account Merging" après retour de mer)
   * Rattache toutes les parties créées hors-ligne sous `local-anon-user` au vrai compte Supabase Auth !
   */
  public linkCurrentAnonymousAccountToAuthenticatedProfile(authProfile: {
    authenticatedUserId: string;
    username: string;
    email?: string;
    provider: 'EMAIL' | 'APPLE' | 'GOOGLE';
  }): { migratedGamesCount: number; user: UserProfile } {
    const previousLocalId = this.currentUser.id;
    const newProfileId = authProfile.authenticatedUserId;

    this.currentUser = {
      ...this.currentUser,
      id: newProfileId,
      username: authProfile.username,
      email: authProfile.email,
      authStatus: 'AUTHENTICATED',
      linkedProviders: Array.from(
        new Set([...this.currentUser.linkedProviders, authProfile.provider])
      ),
      isOnline: true,
    };

    let migratedGamesCount = 0;

    for (const [gameId, game] of this.games.entries()) {
      let touched = false;
      const updatedParticipants = game.participants.map((p) => {
        if (p.profileId === previousLocalId) {
          touched = true;
          return {
            ...p,
            profileId: newProfileId,
            displayName: authProfile.username,
          };
        }
        return p;
      });

      const createdByMe = game.createdByProfileId === previousLocalId;
      if (touched || createdByMe) {
        migratedGamesCount += 1;
        const hlc = this.hlc.now();
        const updatedGame: GameRecord = {
          ...game,
          createdByProfileId: createdByMe
            ? newProfileId
            : game.createdByProfileId,
          participants: updatedParticipants,
          clientHlc: hlc,
          syncStatus: 'DIRTY',
        };
        this.games.set(gameId, updatedGame);
        this.enqueueMutation('GAME', gameId, 'UPSERT', updatedGame, hlc);
      }
    }

    return { migratedGamesCount, user: this.currentUser };
  }

  /**
   * 6. LIAISON RÉTROACTIVE D'UN INVITÉ ("Lucas Invité") VERS UN VRAI PROFIL AMI
   * Fonctionne par `guestId` (côté hôte) ou par `claimCode` (côté ami qui réclame ses parties).
   * Met à jour toutes les parties passées et les place dans la file `sync_queue` !
   */
  public linkGuestToFriendProfile(params: {
    guestId?: string;
    claimCode?: string;
    targetProfileId: string;
    targetUsername: string;
    targetFriendCode: string;
  }): { updatedGamesCount: number } {
    // 1. Trouver l'invité correspondant
    const matchingGuest = Array.from(this.guests.values()).find(
      (g) =>
        (params.guestId && g.guestId === params.guestId) ||
        (params.claimCode && g.claimCode === params.claimCode)
    );

    if (matchingGuest) {
      this.guests.set(matchingGuest.guestId, {
        ...matchingGuest,
        linkedProfileId: params.targetProfileId,
        linkedUsername: params.targetUsername,
      });
    }

    // 2. S'assurer que l'ami est aussi dans le cache d'amis local
    if (!this.cachedFriends.has(params.targetProfileId)) {
      this.cachedFriends.set(params.targetProfileId, {
        profileId: params.targetProfileId,
        username: params.targetUsername,
        friendCode: params.targetFriendCode,
        isOnline: true,
        status: 'ACCEPTED',
      });
    }

    // 3. Mettre à jour rétroactivement toutes les parties où cet invité a joué
    let updatedGamesCount = 0;

    for (const [gameId, game] of this.games.entries()) {
      let hasMatchedParticipant = false;
      const updatedParticipants = game.participants.map((p) => {
        const matchesGuestId =
          params.guestId && p.guestId === params.guestId;
        const matchesClaimCode =
          params.claimCode && p.claimCode === params.claimCode;

        if (matchesGuestId || matchesClaimCode) {
          hasMatchedParticipant = true;
          return {
            ...p,
            profileId: params.targetProfileId,
            displayName: params.targetUsername,
          };
        }
        return p;
      });

      if (hasMatchedParticipant) {
        updatedGamesCount += 1;
        const hlc = this.hlc.now();
        const updatedGame: GameRecord = {
          ...game,
          participants: updatedParticipants,
          clientHlc: hlc,
          syncStatus: 'DIRTY',
        };
        this.games.set(gameId, updatedGame);
        this.enqueueMutation('GAME', gameId, 'UPSERT', updatedGame, hlc);
      }
    }

    return { updatedGamesCount };
  }

  /**
   * 7. MARQUER TOUTES LES MUTATIONS EN ATTENTE COMME SYNCHRONISÉES (Après retour réseau)
   */
  public markAllSynced(): number {
    const count = this.syncQueue.size;
    this.syncQueue.clear();
    for (const [gameId, game] of this.games.entries()) {
      this.games.set(gameId, {
        ...game,
        syncStatus: 'SYNCED',
        rounds: game.rounds.map((r) => ({ ...r, syncStatus: 'SYNCED' })),
      });
    }
    return count;
  }

  /**
   * 8. CALCUL DU DASHBOARD DE STATISTIQUES (Fonctionne pour un vrai profil OU un invité)
   */
  public computePlayerStats(
    profileOrGuestId: string,
    modeFilter: GameMode | 'ALL' = 'ALL'
  ): PlayerStatsSummary {
    const emptyTrumpStats = (): Record<
      TrumpMode,
      { taken: number; succeeded: number; winRatePct: number }
    > => ({
      [TrumpMode.SPADES]: { taken: 0, succeeded: 0, winRatePct: 0 },
      [TrumpMode.HEARTS]: { taken: 0, succeeded: 0, winRatePct: 0 },
      [TrumpMode.DIAMONDS]: { taken: 0, succeeded: 0, winRatePct: 0 },
      [TrumpMode.CLUBS]: { taken: 0, succeeded: 0, winRatePct: 0 },
      [TrumpMode.NO_TRUMP]: { taken: 0, succeeded: 0, winRatePct: 0 },
      [TrumpMode.ALL_TRUMP]: { taken: 0, succeeded: 0, winRatePct: 0 },
    });

    const trumpStats = emptyTrumpStats();
    let gamesPlayed = 0;
    let gamesWon = 0;
    let roundsPlayed = 0;
    let contractsTaken = 0;
    let contractsFulfilled = 0;
    let totalPointsScored = 0;
    let coinchesAttempted = 0;
    let coinchesSucceeded = 0;
    let capotsAchieved = 0;

    for (const game of this.games.values()) {
      if (modeFilter !== 'ALL' && game.mode !== modeFilter) continue;

      const participant = game.participants.find(
        (p) =>
          p.profileId === profileOrGuestId || p.guestId === profileOrGuestId
      );
      if (!participant) continue;

      if (game.status === 'COMPLETED') {
        gamesPlayed += 1;
        if (game.winnerTeam === participant.team) {
          gamesWon += 1;
        }
      }

      for (const round of game.rounds) {
        roundsPlayed += 1;
        const myTeamScore =
          participant.team === 'NS'
            ? round.result.finalScoreNS
            : round.result.finalScoreEW;
        totalPointsScored += myTeamScore;

        if (round.input.capotAchievedBy === participant.team) {
          capotsAchieved += 1;
        }

        if (round.result.takerTeam === participant.team) {
          contractsTaken += 1;
          const trumpBucket = trumpStats[round.input.trump];
          trumpBucket.taken += 1;

          if (round.result.isContractFulfilled) {
            contractsFulfilled += 1;
            trumpBucket.succeeded += 1;
          }
          trumpBucket.winRatePct = Math.round(
            (trumpBucket.succeeded / trumpBucket.taken) * 100
          );
        }

        if (round.input.coincherSeat === participant.seat) {
          coinchesAttempted += 1;
          if (!round.result.isContractFulfilled) {
            coinchesSucceeded += 1;
          }
        }
      }
    }

    return {
      profileOrGuestId,
      mode: modeFilter,
      gamesPlayed,
      gamesWon,
      winRatePct:
        gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0,
      roundsPlayed,
      contractsTaken,
      contractsFulfilled,
      contractSuccessRatePct:
        contractsTaken > 0
          ? Math.round((contractsFulfilled / contractsTaken) * 100)
          : 0,
      averagePointsPerRound:
        roundsPlayed > 0
          ? Math.round((totalPointsScored / roundsPlayed) * 10) / 10
          : 0,
      coinchesAttempted,
      coinchesSucceeded,
      coincheEfficiencyPct:
        coinchesAttempted > 0
          ? Math.round((coinchesSucceeded / coinchesAttempted) * 100)
          : 0,
      capotsAchieved,
      winRateByTrump: trumpStats,
    };
  }

  private enqueueMutation(
    entityType: SyncMutationRecord['entity_type'],
    entityId: string,
    operation: SyncMutationRecord['operation'],
    payload: unknown,
    hlc: string
  ): void {
    // Coalescence : une seule entrée PENDING par (entityType, entityId)
    const compositeKey = `${entityType}:${entityId}`;
    this.syncQueue.set(compositeKey, {
      mutation_id: `mut-${compositeKey}-${hlc}`,
      entity_type: entityType,
      entity_id: entityId,
      operation,
      payload_json: JSON.stringify(payload),
      client_hlc: hlc,
      status: 'PENDING',
      retry_count: 0,
      next_retry_at: 0,
    });
  }
}
