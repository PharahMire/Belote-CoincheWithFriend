import {
  getNextSeat,
  ScoreEngine,
  type Bid,
  type Card,
  type DeclaredAnnouncement,
  type PlayerSeat,
  type RoundScoreInput,
  type RoundScoreResult,
  type Trick,
} from '../../../../../packages/core-rules/src/index.ts';

export type SessionTransportMode =
  | 'MANUAL_SCOREKEEPER' // Phase 1 : Saisie manuelle à la fin de chaque donne
  | 'P2P_HOST'           // Phase 2A : WebRTC / Wi-Fi Direct entre 4 téléphones autour de la table
  | 'DEDICATED_SERVER';  // Phase 2B : WebSocket autoritaire (Matchmaking classé)

export interface RoundSummarySnapshot {
  readonly roundNumber: number;
  readonly dealer: PlayerSeat;
  readonly input: RoundScoreInput;
  readonly scoreResult: RoundScoreResult;
  readonly biddingHistory?: readonly Bid[];
  readonly tricksHistory?: readonly Trick[];
}

export interface GameSessionState {
  readonly gameId: string;
  readonly transportMode: SessionTransportMode;
  readonly currentRoundNumber: number;
  readonly dealerSeat: PlayerSeat;
  readonly totalScoreNS: number;
  readonly totalScoreEW: number;
  readonly rounds: readonly RoundSummarySnapshot[];
  // Champs Phase 2 (optionnels en Phase 1, hydratés temps réel en Phase 2)
  readonly activeRoundPhase?: 'DEALING' | 'BIDDING' | 'PLAYING_TRICKS' | 'SCORING';
  readonly myHand?: readonly Card[];
  readonly currentTrick?: Trick;
}

export interface GameSessionProvider {
  readonly mode: SessionTransportMode;

  /** Abonnement réactif aux changements d'état de la partie */
  subscribe(listener: (state: GameSessionState) => void): () => void;

  /** Récupère l'état courant synchrone */
  getState(): GameSessionState;

  // --- Actions Phase 1 (Utilisées par ManualScoreKeeperSession) ---
  recordManualRound(input: RoundScoreInput): Promise<RoundScoreResult>;
  updateManualRound(
    roundNumber: number,
    input: RoundScoreInput
  ): Promise<RoundScoreResult>;

  // --- Actions Phase 2 (Implémentées dans P2PHostSession & DedicatedServerSession) ---
  submitBid?(bid: Bid | 'PASS' | 'COINCHE' | 'SURCOINCHE'): Promise<void>;
  declareAnnouncement?(announcement: DeclaredAnnouncement): Promise<void>;
  playCard?(card: Card): Promise<void>;

  dispose(): Promise<void>;
}

/**
 * Implémentation Phase 1 : Carnet de Scores Manuel (Offline-First)
 */
export class ManualScoreKeeperSession implements GameSessionProvider {
  public readonly mode: SessionTransportMode = 'MANUAL_SCOREKEEPER';
  private state: GameSessionState;
  private readonly listeners = new Set<(state: GameSessionState) => void>();

  constructor(
    gameId: string,
    initialDealer: PlayerSeat = 'SOUTH',
    private readonly onPersistRound?: (
      snapshot: RoundSummarySnapshot,
      nextState: GameSessionState
    ) => Promise<void>
  ) {
    this.state = {
      gameId,
      transportMode: 'MANUAL_SCOREKEEPER',
      currentRoundNumber: 1,
      dealerSeat: initialDealer,
      totalScoreNS: 0,
      totalScoreEW: 0,
      rounds: [],
    };
  }

  public getState(): GameSessionState {
    return this.state;
  }

  public subscribe(listener: (state: GameSessionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async recordManualRound(input: RoundScoreInput): Promise<RoundScoreResult> {
    const scoreResult = ScoreEngine.computeRoundScore(input);
    const snapshot: RoundSummarySnapshot = {
      roundNumber: this.state.currentRoundNumber,
      dealer: this.state.dealerSeat,
      input,
      scoreResult,
    };

    const nextState: GameSessionState = {
      ...this.state,
      currentRoundNumber: this.state.currentRoundNumber + 1,
      dealerSeat: getNextSeat(this.state.dealerSeat),
      totalScoreNS: this.state.totalScoreNS + scoreResult.finalScoreNS,
      totalScoreEW: this.state.totalScoreEW + scoreResult.finalScoreEW,
      rounds: [...this.state.rounds, snapshot],
    };

    if (this.onPersistRound) {
      await this.onPersistRound(snapshot, nextState);
    }

    this.state = nextState;
    this.notify();
    return scoreResult;
  }

  /**
   * Modifie une donne existante (numéro `roundNumber`) et recalcule les totaux de la partie
   */
  public async updateManualRound(
    roundNumber: number,
    input: RoundScoreInput
  ): Promise<RoundScoreResult> {
    const targetIdx = this.state.rounds.findIndex(
      (r) => r.roundNumber === roundNumber
    );
    if (targetIdx === -1) {
      throw new Error(`Donne #${roundNumber} introuvable dans cette partie.`);
    }

    const scoreResult = ScoreEngine.computeRoundScore(input);
    const existing = this.state.rounds[targetIdx];
    const updatedSnapshot: RoundSummarySnapshot = {
      ...existing,
      input,
      scoreResult,
    };

    const updatedRounds = this.state.rounds.map((r, i) =>
      i === targetIdx ? updatedSnapshot : r
    );
    const totalScoreNS = updatedRounds.reduce(
      (sum, r) => sum + r.scoreResult.finalScoreNS,
      0
    );
    const totalScoreEW = updatedRounds.reduce(
      (sum, r) => sum + r.scoreResult.finalScoreEW,
      0
    );

    const nextState: GameSessionState = {
      ...this.state,
      totalScoreNS,
      totalScoreEW,
      rounds: updatedRounds,
    };

    if (this.onPersistRound) {
      await this.onPersistRound(updatedSnapshot, nextState);
    }

    this.state = nextState;
    this.notify();
    return scoreResult;
  }

  public async dispose(): Promise<void> {
    this.listeners.clear();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
