export interface SyncMutationRecord {
  mutation_id: string;
  entity_type: 'GAME' | 'GAME_PARTICIPANTS' | 'GAME_ROUND';
  entity_id: string;
  operation: 'UPSERT' | 'DELETE';
  payload_json: string;
  client_hlc: string;
  status: 'PENDING' | 'IN_FLIGHT' | 'FAILED' | 'DEAD_LETTER';
  retry_count: number;
  next_retry_at: number;
}

export interface ISyncQueueStorage {
  getPendingBatch(limit: number, nowEpochMs: number): Promise<SyncMutationRecord[]>;
  markInFlight(mutationIds: string[]): Promise<void>;
  acknowledgeSuccess(mutationIds: string[]): Promise<void>;
  markFailedWithBackoff(
    mutationId: string,
    errorMsg: string,
    nextRetryAt: number,
    isDeadLetter: boolean
  ): Promise<void>;
  getLastPullTimestamp(): Promise<string | null>;
  setLastPullTimestamp(isoTimestamp: string): Promise<void>;
  upsertRemoteReconciledEntities(payload: {
    games: unknown[];
    rounds: unknown[];
  }): Promise<void>;
}

export interface IRemoteSyncTransport {
  pushBatch(
    mutations: Array<{
      mutation_id: string;
      entity_type: string;
      entity_id: string;
      operation: string;
      payload: unknown;
      client_hlc: string;
    }>
  ): Promise<{ acknowledged_ids: string[] }>;

  pullDelta(sinceIsoTimestamp: string): Promise<{
    games: unknown[];
    rounds: unknown[];
  }>;
}

export class SyncEngine {
  private isSyncing = false;
  private static readonly MAX_RETRIES = 8;
  private static readonly BASE_BACKOFF_MS = 1500;
  private static readonly BATCH_SIZE = 50;

  constructor(
    private readonly storage: ISyncQueueStorage,
    private readonly transport: IRemoteSyncTransport
  ) {}

  /**
   * Cycle complet : 1. PUSH des mutations locales -> 2. PULL incrémental (Delta Sync)
   */
  public async triggerSyncCycle(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      await this.pushLocalQueue();
      await this.pullRemoteChanges();
    } finally {
      this.isSyncing = false;
    }
  }

  private async pushLocalQueue(): Promise<void> {
    while (true) {
      const now = Date.now();
      const batch = await this.storage.getPendingBatch(
        SyncEngine.BATCH_SIZE,
        now
      );
      if (batch.length === 0) break;

      const mutationIds = batch.map((m) => m.mutation_id);
      await this.storage.markInFlight(mutationIds);

      try {
        const result = await this.transport.pushBatch(
          batch.map((m) => ({
            mutation_id: m.mutation_id,
            entity_type: m.entity_type,
            entity_id: m.entity_id,
            operation: m.operation,
            payload: JSON.parse(m.payload_json),
            client_hlc: m.client_hlc,
          }))
        );

        const ackIds = result.acknowledged_ids ?? mutationIds;
        await this.storage.acknowledgeSuccess(ackIds);
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown network error';

        for (const item of batch) {
          const nextRetryCount = item.retry_count + 1;
          const isDeadLetter = nextRetryCount >= SyncEngine.MAX_RETRIES;
          const exponentialDelay =
            SyncEngine.BASE_BACKOFF_MS * Math.pow(2, item.retry_count) +
            Math.floor(Math.random() * 500);

          await this.storage.markFailedWithBackoff(
            item.mutation_id,
            errorMessage,
            Date.now() + exponentialDelay,
            isDeadLetter
          );
        }
        break;
      }
    }
  }

  private async pullRemoteChanges(): Promise<void> {
    const since =
      (await this.storage.getLastPullTimestamp()) ?? '1970-01-01T00:00:00.000Z';
    const pullStartedAt = new Date().toISOString();

    const data = await this.transport.pullDelta(since);
    await this.storage.upsertRemoteReconciledEntities({
      games: data.games ?? [],
      rounds: data.rounds ?? [],
    });

    await this.storage.setLastPullTimestamp(pullStartedAt);
  }
}
