export type AuthStatus =
  | 'OFFLINE_ANONYMOUS' // Utilisateur non connecté (ex: sur un bateau sans réseau), joue avec un profil local
  | 'AUTHENTICATED';    // Connecté via Supabase Auth (Email, Apple, Google)

export type AuthProviderType = 'EMAIL' | 'APPLE' | 'GOOGLE';

export interface UserProfile {
  readonly id: string; // UUID (local_profile_id tant que OFFLINE_ANONYMOUS, puis migré vers auth.users.id)
  readonly username: string;
  readonly friendCode: string; // Ex: "BLT-8F92A"
  readonly avatarUrl?: string;
  readonly authStatus: AuthStatus;
  readonly email?: string;
  readonly linkedProviders: readonly AuthProviderType[];
  readonly isOnline: boolean;
}

/**
 * Profil d'un invité créé hors-ligne (ex: sur un bateau).
 * Un même invité ("Lucas") peut faire 5 parties d'affilée hors-ligne grâce à son `guestId`.
 * Une fois de retour en ligne, l'hôte (ou Lucas via un claimCode) lie ce `guestId` à son vrai `profileId` !
 */
export interface LocalGuestProfile {
  readonly guestId: string;
  readonly displayName: string;
  readonly claimCode: string; // Ex: "CLAIM-7492" (permet au joueur de réclamer ses parties plus tard)
  readonly createdAt: string;
  /** Renseigné une fois que l'invité a été lié à un vrai compte utilisateur */
  readonly linkedProfileId?: string;
  readonly linkedUsername?: string;
}

/**
 * Payload encodé dans le QR Code d'un joueur pour l'ajouter à une table
 * MÊME SANS AUCUNE CONNEXION INTERNET (Scan QR en P2P visuel sur le bateau)
 */
export interface OfflinePlayerQrPayload {
  readonly version: 1;
  readonly profileId: string;
  readonly username: string;
  readonly friendCode: string;
  readonly avatarUrl?: string;
  readonly issuedAt: number;
}

export interface FriendEntry {
  readonly profileId: string;
  readonly username: string;
  readonly friendCode: string;
  readonly avatarUrl?: string;
  readonly isOnline: boolean;
  readonly status: 'ACCEPTED' | 'PENDING_SENT' | 'PENDING_RECEIVED';
}
