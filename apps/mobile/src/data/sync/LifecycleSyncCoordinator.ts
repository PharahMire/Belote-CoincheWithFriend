import type { OfflineFirstGameRepository } from '../../data/repositories/OfflineFirstGameRepository.ts';
import type { SyncEngine } from '../../data/sync/SyncEngine.ts';

export type ConnectivityState = 'OFFLINE_BOAT' | 'ONLINE_SYNCING' | 'ONLINE_SYNCED';

export interface SyncLifecycleStatus {
  readonly connectivity: ConnectivityState;
  readonly pendingMutationsCount: number;
  readonly unlinkedGuestsCount: number;
  readonly lastSyncedAt?: string;
}

/**
 * Coordonnateur du cycle de vie AppState (ouverture de l'app) + Connectivité Réseau :
 * - Tant que les joueurs sont sur le bateau sans réseau : stocke tout dans SQLite + sync_queue.
 * - Dès que l'utilisateur réouvre l'app avec du réseau (ou que la 4G/Wi-Fi revient) :
 *   déclenche automatiquement le flush de la sync_queue en arrière-plan.
 */
export class LifecycleSyncCoordinator {
  private isOnline = false;
  private lastSyncedAt?: string;
  private readonly listeners = new Set<(status: SyncLifecycleStatus) => void>();

  constructor(
    private readonly repo: OfflineFirstGameRepository,
    private readonly syncEngine?: SyncEngine
  ) {}

  public subscribe(listener: (status: SyncLifecycleStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getStatus(): SyncLifecycleStatus {
    const pendingCount = this.repo.getPendingSyncQueue().length;
    const unlinkedGuestsCount = this.repo
      .getLocalGuests()
      .filter((g) => !g.linkedProfileId).length;

    let connectivity: ConnectivityState = 'OFFLINE_BOAT';
    if (this.isOnline) {
      connectivity = pendingCount > 0 ? 'ONLINE_SYNCING' : 'ONLINE_SYNCED';
    }

    return {
      connectivity,
      pendingMutationsCount: pendingCount,
      unlinkedGuestsCount,
      lastSyncedAt: this.lastSyncedAt,
    };
  }

  /**
   * Appelé automatiquement par `NetInfo.addEventListener` ou `AppState.addEventListener('change', 'active')`
   */
  public async onConnectivityOrAppForegroundChange(
    hasNetworkConnection: boolean
  ): Promise<SyncLifecycleStatus> {
    this.isOnline = hasNetworkConnection;
    this.notify();

    if (this.isOnline && this.repo.getPendingSyncQueue().length > 0) {
      if (this.syncEngine) {
        await this.syncEngine.triggerSyncCycle();
      }
      this.repo.markAllSynced();
      this.lastSyncedAt = new Date().toISOString();
      this.notify();
    }

    return this.getStatus();
  }

  private notify(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}
