import type {
  FriendEntry,
  LocalGuestProfile,
  OfflinePlayerQrPayload,
  UserProfile,
} from '../../domain/models/UserProfile.ts';
import type { SyncLifecycleStatus } from '../../data/sync/LifecycleSyncCoordinator.ts';

export interface AuthAndLinkAccountScreenProps {
  readonly currentUser: UserProfile;
  readonly syncStatus: SyncLifecycleStatus;
  readonly unlinkedGuests: readonly LocalGuestProfile[];
  readonly friends: readonly FriendEntry[];
  readonly myOfflineQrPayload: OfflinePlayerQrPayload;
  readonly onSignInAndMerge: (params: {
    authenticatedUserId: string;
    username: string;
    email?: string;
    provider: 'EMAIL' | 'APPLE' | 'GOOGLE';
  }) => Promise<{ migratedGamesCount: number }>;
  readonly onLinkGuestToFriend: (params: {
    guestId?: string;
    claimCode?: string;
    targetProfileId: string;
    targetUsername: string;
    targetFriendCode: string;
  }) => Promise<{ updatedGamesCount: number }>;
}

/**
 * Contrôleur de présentation pour l'écran Compte, QR Hors-Ligne & Liaison Rétroactive des Parties.
 * Gère les 3 scénarios :
 * 1. "Je me connecte après avoir joué hors-ligne sur un bateau" -> Fusionne automatiquement toutes mes parties locales.
 * 2. "Mon ami affiche son QR Code sur le bateau" -> Permet un scan P2P sans internet.
 * 3. "Nous sommes revenus à terre" -> Permet de rattacher "Lucas (Invité)" au vrai compte "@lucas_belote" ou via son code CLAIM-XXXX.
 */
export class AuthAndLinkAccountPresenter {
  public static buildViewModel(props: AuthAndLinkAccountScreenProps) {
    const isAnonymousOffline =
      props.currentUser.authStatus === 'OFFLINE_ANONYMOUS';

    return {
      headerBadge: isAnonymousOffline
        ? 'Profil Hors-Ligne Actif (Parties sauvegardées localement)'
        : `Connecté (${props.currentUser.linkedProviders.join(', ')})`,
      canMergeLocalAccount: isAnonymousOffline,
      pendingSyncBanner:
        props.syncStatus.pendingMutationsCount > 0
          ? `${props.syncStatus.pendingMutationsCount} événement(s) en attente de synchronisation vers le Cloud`
          : 'Toutes les parties sont synchronisées dans le Cloud',
      qrCodeJsonString: JSON.stringify(props.myOfflineQrPayload),
      unlinkedGuestCards: props.unlinkedGuests.map((guest) => ({
        guestId: guest.guestId,
        displayName: guest.displayName,
        claimCode: guest.claimCode,
        shareMessage: `Rejoins Belote & Coinche et récupère tes statistiques de nos parties hors-ligne avec le code : ${guest.claimCode}`,
      })),
    };
  }
}
