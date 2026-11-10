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

export type TargetScoreOption = 500 | 1000 | 1500 | 2000;

export interface GameSetupDraft {
  /** Nom de la partie (pré-rempli par défaut, et regénéré automatiquement s'il est laissé vide) */
  readonly title: string;
  readonly mode: GameMode;
  readonly targetScore: TargetScoreOption;
  readonly initialDealerSeat: PlayerSeat;
  readonly rules: TableRulesConfig;
  readonly seats: Readonly<Record<PlayerSeat, SeatSelectionInput>>;
}

export class GameSetupController {
  /** Paliers de score cible proposés en boutons tactiles (sans liste déroulante) */
  public static readonly TARGET_SCORE_OPTIONS: readonly TargetScoreOption[] = [
    500, 1000, 1500, 2000,
  ];

  public static createDefaultDraft(
    _currentUser: UserProfile,
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
      title: 'Soirée Coinche #1',
      mode: 'COINCHE',
      targetScore: 1000,
      initialDealerSeat: 'SOUTH',
      rules: DEFAULT_COINCHE_RULES,
      seats: {
        SOUTH: { type: 'CURRENT_USER' },
        NORTH: northSeat,
        EAST: eastSeat,
        WEST: westSeat,
      },
    };
  }

  public static setTitle(
    draft: GameSetupDraft,
    title: string
  ): GameSetupDraft {
    return {
      ...draft,
      title,
    };
  }

  public static switchGameMode(
    draft: GameSetupDraft,
    mode: GameMode
  ): GameSetupDraft {
    const isDefaultTitle =
      draft.title === 'Soirée Coinche #1' || draft.title === 'Soirée Belote #1';
    return {
      ...draft,
      title: isDefaultTitle
        ? mode === 'BELOTE_CLASSIC'
          ? 'Soirée Belote #1'
          : 'Soirée Coinche #1'
        : draft.title,
      mode,
      rules:
        mode === 'BELOTE_CLASSIC' ? DEFAULT_BELOTE_RULES : DEFAULT_COINCHE_RULES,
    };
  }

  public static setTargetScore(
    draft: GameSetupDraft,
    targetScore: TargetScoreOption
  ): GameSetupDraft {
    return {
      ...draft,
      targetScore,
    };
  }
}
