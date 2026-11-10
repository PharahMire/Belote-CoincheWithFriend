import type { IRemoteSyncTransport } from '../sync/SyncEngine.ts';
import type { FriendEntry, UserProfile } from '../../domain/models/UserProfile.ts';

export interface SupabaseConfig {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly getAccessToken?: () => Promise<string | null>;
}

/**
 * Connecteur Cloud Supabase (REST + RPC + Auth)
 * Implémente `IRemoteSyncTransport` pour la synchronisation Offline-First (`sync_push_batch`)
 * ainsi que la recherche d'amis par `friend_code` (`BLT-XXXXX`) et la réclamation d'invités (`claim_code`).
 */
export class SupabaseRemoteTransport implements IRemoteSyncTransport {
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private readonly getAccessToken?: () => Promise<string | null>;

  constructor(config: SupabaseConfig) {
    this.baseUrl = config.supabaseUrl.replace(/\/+$/, '');
    this.anonKey = config.supabaseAnonKey;
    this.getAccessToken = config.getAccessToken;
  }

  private async buildHeaders(): Promise<Record<string, string>> {
    const userAccessToken = await this.getAccessToken?.();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: this.anonKey,
    };

    if (userAccessToken) {
      headers.Authorization = `Bearer ${userAccessToken}`;
    } else if (!this.anonKey.startsWith('sb_publishable_')) {
      // Compatibilité clé `anon` JWT classique (eyJ...)
      headers.Authorization = `Bearer ${this.anonKey}`;
    }

    return headers;
  }

  /**
   * 1. PUSH BATCH : Envoie le lot de mutations hors-ligne (`sync_queue`) vers la fonction RPC PostgreSQL
   * `public.sync_push_batch(p_mutations)` définie dans `supabase/migrations/0001_initial_schema.sql`.
   */
  public async pushBatch(
    mutations: Array<{
      mutation_id: string;
      entity_type: string;
      entity_id: string;
      operation: string;
      payload: unknown;
      client_hlc: string;
    }>
  ): Promise<{ acknowledged_ids: string[] }> {
    const headers = await this.buildHeaders();
    const response = await fetch(
      `${this.baseUrl}/rest/v1/rpc/sync_push_batch`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_mutations: mutations }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur Supabase pushBatch (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as { acknowledged_ids?: string[] };
    return {
      acknowledged_ids:
        data.acknowledged_ids ?? mutations.map((m) => m.mutation_id),
    };
  }

  /**
   * 2. PULL DELTA : Récupère toutes les parties et donnes modifiées depuis `sinceIsoTimestamp`
   * dans lesquelles le joueur courant est participant (protégé par Row Level Security).
   */
  public async pullDelta(sinceIsoTimestamp: string): Promise<{
    games: unknown[];
    rounds: unknown[];
  }> {
    const headers = await this.buildHeaders();
    const encodedSince = encodeURIComponent(sinceIsoTimestamp);

    const [gamesRes, roundsRes] = await Promise.all([
      fetch(
        `${this.baseUrl}/rest/v1/games?select=*,game_participants(*)&updated_at=gt.${encodedSince}&order=updated_at.asc`,
        { headers }
      ),
      fetch(
        `${this.baseUrl}/rest/v1/game_rounds?select=*&updated_at=gt.${encodedSince}&order=round_number.asc`,
        { headers }
      ),
    ]);

    if (!gamesRes.ok || !roundsRes.ok) {
      throw new Error('Erreur lors de la récupération du delta Supabase.');
    }

    const games = (await gamesRes.json()) as unknown[];
    const rounds = (await roundsRes.json()) as unknown[];

    return { games, rounds };
  }

  /**
   * 3. RECHERCHE D'AMI PAR CODE AMI (ex: "BLT-8821") OU PSEUDO
   */
  public async searchFriendByCodeOrUsername(
    query: string
  ): Promise<FriendEntry | null> {
    const clean = query.trim();
    if (!clean) return null;

    const headers = await this.buildHeaders();
    const encoded = encodeURIComponent(clean);
    const response = await fetch(
      `${this.baseUrl}/rest/v1/profiles?or=(friend_code.ilike.${encoded},username.ilike.${encoded})&limit=1`,
      { headers }
    );

    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{
      id: string;
      username: string;
      friend_code: string;
      avatar_url?: string;
      is_online?: boolean;
    }>;

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      profileId: row.id,
      username: row.username,
      friendCode: row.friend_code,
      avatarUrl: row.avatar_url,
      isOnline: Boolean(row.is_online),
      status: 'ACCEPTED',
    };
  }

  /**
   * 4. LIAISON RÉTROACTIVE D'UN INVITÉ SUR LE CLOUD (par `claim_code` ou `guest_id`)
   * Met à jour `game_participants` dans PostgreSQL pour rattacher toutes les anciennes parties au vrai `profileId`.
   */
  public async claimGuestParticipationsOnCloud(params: {
    claimCode: string;
    targetProfileId: string;
  }): Promise<void> {
    const headers = await this.buildHeaders();
    const encodedClaim = encodeURIComponent(params.claimCode.trim());
    const response = await fetch(
      `${this.baseUrl}/rest/v1/game_participants?claim_code=eq.${encodedClaim}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          profile_id: params.targetProfileId,
          linked_at: new Date().toISOString(),
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur liaison invité Cloud (${response.status}): ${errText}`);
    }
  }

  /**
   * 5. LECTURE DU PROFIL AUTHENTIFIÉ COURANT
   */
  public async fetchMyProfile(userId: string): Promise<UserProfile | null> {
    const headers = await this.buildHeaders();
    const response = await fetch(
      `${this.baseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&limit=1`,
      { headers }
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{
      id: string;
      username: string;
      friend_code: string;
      avatar_url?: string;
    }>;
    if (rows.length === 0) return null;

    return {
      id: rows[0].id,
      username: rows[0].username,
      friendCode: rows[0].friend_code,
      avatarUrl: rows[0].avatar_url,
      authStatus: 'AUTHENTICATED',
      linkedProviders: ['EMAIL'],
      isOnline: true,
    };
  }
}
