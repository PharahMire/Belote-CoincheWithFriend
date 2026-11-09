import {
  DEFAULT_BELOTE_RULES,
  DEFAULT_COINCHE_RULES,
  type GameMode,
  type PlayerSeat,
  type TableRulesConfig,
} from '../../../../../packages/core-rules/src/index.ts';
import type {
  FriendEntry,
  LocalGuestProfile,
  OfflinePlayerQrPayload,
  UserProfile,
} from '../../domain/models/UserProfile.ts';

export type SeatSelectionInput =
  | { type: 'CURRENT_USER' }
  | { type: 'FRIEND'; profileId: string; username: string }
  | { type: 'OFFLINE_QR'; qrPayload: OfflinePlayerQrPayload }
  | { type: 'GUEST'; guestId: string };

export interface GameSetupDraft {
  readonly mode: GameMode;
  readonly targetScore: number;
  readonly rules: TableRulesConfig;
  readonly seats: Readonly<Record<PlayerSeat, SeatSelectionInput>>;
}

export class GameSetupController {
  public static createDefaultDraft(
    currentUser: UserProfile,
    existingGuests: readonly LocalGuestProfile[],
    cachedFriends: readonly FriendEntry[]
  ): GameSetupDraft {
    const northSeat: SeatSelectionInput = cachedFriends[0]
      ? {
          type: 'FRIEND',
          profileId: cachedFriends[0].profileId,
          username: cachedFriends[0].username,
        }
      : existingGuests[0]
      ? { type: 'GUEST', guestId: existingGuests[0].guestId }
      : { type: 'CURRENT_USER' };

    const eastSeat: SeatSelectionInput = cachedFriends[1]
      ? {
          type: 'FRIEND',
          profileId: cachedFriends[1].profileId,
          username: cachedFriends[1].username,
        }
      : existingGuests[1]
      ? { type: 'GUEST', guestId: existingGuests[1].guestId }
      : { type: 'CURRENT_USER' };

    const westSeat: SeatSelectionInput = cachedFriends[2]
      ? {
          type: 'FRIEND',
          profileId: cachedFriends[2].profileId,
          username: cachedFriends[2].username,
        }
      : existingGuests[2]
      ? { type: 'GUEST', guestId: existingGuests[2].guestId }
      : { type: 'CURRENT_USER' };

    return {
      mode: 'COINCHE',
      targetScore: 1000,
      rules: DEFAULT_COINCHE_RULES,
      seats: {
        SOUTH: { type: 'CURRENT_USER' },
        NORTH: northSeat,
        EAST: eastSeat,
        WEST: westSeat,
      },
    };
  }

  public static switchGameMode(
    draft: GameSetupDraft,
    mode: GameMode
  ): GameSetupDraft {
    return {
      ...draft,
      mode,
      rules:
        mode === 'BELOTE_CLASSIC' ? DEFAULT_BELOTE_RULES : DEFAULT_COINCHE_RULES,
    };
  }
}
