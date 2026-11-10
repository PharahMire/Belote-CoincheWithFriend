import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AnnouncementType,
  CardStrengthEvaluator,
  CoincheLevel,
  ContractType,
  Deck,
  DEFAULT_BELOTE_RULES,
  DEFAULT_COINCHE_RULES,
  Rank,
  ScoreEngine,
  Suit,
  TrumpMode,
} from '../src/index.ts';
import { ManualScoreKeeperSession } from '../../../apps/mobile/src/domain/session/GameSessionProvider.ts';
import { HybridLogicalClock } from '../../../apps/mobile/src/data/sync/HybridLogicalClock.ts';

describe('ScoreEngine - Belote Classique', () => {
  it('calcule une prise normale réussie (100 à 62) avec Belote pour le preneur', () => {
    const result = ScoreEngine.computeRoundScore({
      rules: DEFAULT_BELOTE_RULES,
      takerSeat: 'SOUTH', // Équipe NS
      trump: TrumpMode.HEARTS,
      contractType: ContractType.NORMAL,
      contractValue: 82,
      coincheLevel: CoincheLevel.NONE,
      rawTrickPointsNS: 100,
      rawTrickPointsEW: 62,
      beloteTeam: 'NS',
    });

    assert.equal(result.isContractFulfilled, true);
    assert.equal(result.finalScoreNS, 120); // 100 + 20 belote
    assert.equal(result.finalScoreEW, 62);
  });

  it('gère le Dedans (chute) : la défense prend 162 pts mais le preneur conserve sa Belote', () => {
    const result = ScoreEngine.computeRoundScore({
      rules: DEFAULT_BELOTE_RULES,
      takerSeat: 'NORTH', // Équipe NS prend
      trump: TrumpMode.SPADES,
      contractType: ContractType.NORMAL,
      contractValue: 82,
      coincheLevel: CoincheLevel.NONE,
      rawTrickPointsNS: 60, // Avec belote (+20) = 80 < 102 (EW) -> Dedans !
      rawTrickPointsEW: 102,
      beloteTeam: 'NS',
    });

    assert.equal(result.isContractFulfilled, false);
    assert.equal(result.finalScoreNS, 20); // Belote imprenable
    assert.equal(result.finalScoreEW, 162); // Total des 162 points pour la défense
  });

  it('permet à la Belote (+20) de sauver un contrat en Belote Classique (72 + 20 = 92 > 90)', () => {
    const result = ScoreEngine.computeRoundScore({
      rules: DEFAULT_BELOTE_RULES,
      takerSeat: 'SOUTH', // NS
      trump: TrumpMode.DIAMONDS,
      contractType: ContractType.NORMAL,
      contractValue: 82,
      coincheLevel: CoincheLevel.NONE,
      rawTrickPointsNS: 72,
      rawTrickPointsEW: 90,
      beloteTeam: 'NS',
    });

    assert.equal(result.isContractFulfilled, true);
    assert.equal(result.finalScoreNS, 92);
    assert.equal(result.finalScoreEW, 90);
  });

  it('gère le Litige (81 à 81 sans Belote)', () => {
    const result = ScoreEngine.computeRoundScore({
      rules: DEFAULT_BELOTE_RULES,
      takerSeat: 'SOUTH', // NS
      trump: TrumpMode.CLUBS,
      contractType: ContractType.NORMAL,
      contractValue: 82,
      coincheLevel: CoincheLevel.NONE,
      rawTrickPointsNS: 81,
      rawTrickPointsEW: 81,
    });

    assert.equal(result.isContractFulfilled, false);
    assert.equal(result.isLitige, true);
    assert.equal(result.finalScoreNS, 0);
    assert.equal(result.finalScoreEW, 81);
  });

  it('gère le Capot en Belote Classique (252 pts)', () => {
    const result = ScoreEngine.computeRoundScore({
      rules: DEFAULT_BELOTE_RULES,
      takerSeat: 'SOUTH', // NS
      trump: TrumpMode.HEARTS,
      contractType: ContractType.NORMAL,
      contractValue: 82,
      coincheLevel: CoincheLevel.NONE,
      rawTrickPointsNS: 162,
      rawTrickPointsEW: 0,
      capotAchievedBy: 'NS',
      beloteTeam: 'NS',
    });

    assert.equal(result.isContractFulfilled, true);
    assert.equal(result.finalScoreNS, 272); // 252 + 20 Belote
    assert.equal(result.finalScoreEW, 0);
  });
});

describe('ScoreEngine - Coinche (Belote Coinchée)', () => {
  it('calcule un contrat de 100 réussi avec annonces (Points faits + Contrat)', () => {
    const result = ScoreEngine.computeRoundScore({
      rules: DEFAULT_COINCHE_RULES,
      takerSeat: 'EAST', // Équipe EW
      trump: TrumpMode.SPADES,
      contractType: ContractType.NORMAL,
      contractValue: 100,
      coincheLevel: CoincheLevel.NONE,
      rawTrickPointsNS: 52,
      rawTrickPointsEW: 110,
      declarations: [
        { type: AnnouncementType.CINQUANTE, declarer: 'EAST', highestRank: Rank.KING },
        { type: AnnouncementType.TIERCE, declarer: 'NORTH', highestRank: Rank.ACE },
      ],
    });

    assert.equal(result.isContractFulfilled, true);
    assert.equal(result.winningAnnouncementsTeam, 'EW');
    assert.equal(result.announcementPointsEW, 50);
    assert.equal(result.announcementPointsNS, 0);
    assert.equal(result.finalScoreEW, 260); // 100 + 110 + 50
    assert.equal(result.finalScoreNS, 52);
  });

  it('calcule un contrat Coinché (x2) et Surcoinché (x4) réussi', () => {
    const result = ScoreEngine.computeRoundScore({
      rules: DEFAULT_COINCHE_RULES,
      takerSeat: 'SOUTH', // NS
      trump: TrumpMode.HEARTS,
      contractType: ContractType.NORMAL,
      contractValue: 110,
      coincheLevel: CoincheLevel.SURCOINCHE, // x4
      coincherSeat: 'WEST',
      rawTrickPointsNS: 100,
      rawTrickPointsEW: 62,
      beloteTeam: 'NS',
    });

    assert.equal(result.isContractFulfilled, true);
    assert.equal(result.finalScoreNS, 860); // (110 + 100) * 4 + 20
    assert.equal(result.finalScoreEW, 0);
  });

  it('calcule une chute sur contrat Coinché (x2) : la défense ramasse (160 + contrat + annonces) * 2', () => {
    const result = ScoreEngine.computeRoundScore({
      rules: DEFAULT_COINCHE_RULES,
      takerSeat: 'NORTH', // NS annonce 120
      trump: TrumpMode.CLUBS,
      contractType: ContractType.NORMAL,
      contractValue: 120,
      coincheLevel: CoincheLevel.COINCHE, // x2
      coincherSeat: 'EAST',
      rawTrickPointsNS: 90,
      rawTrickPointsEW: 72,
      declarations: [{ type: AnnouncementType.TIERCE, declarer: 'NORTH', highestRank: Rank.TEN }],
    });

    assert.equal(result.isContractFulfilled, false);
    assert.equal(result.finalScoreEW, 600); // (160 + 120 + 20) * 2
    assert.equal(result.finalScoreNS, 0);
  });

  it('gère la Générale (500 pts) réussie et chutée', () => {
    const success = ScoreEngine.computeRoundScore({
      rules: DEFAULT_COINCHE_RULES,
      takerSeat: 'SOUTH',
      trump: TrumpMode.ALL_TRUMP,
      contractType: ContractType.GENERALE,
      contractValue: 500,
      coincheLevel: CoincheLevel.NONE,
      rawTrickPointsNS: 258,
      rawTrickPointsEW: 0,
      capotAchievedBy: 'NS',
      generaleAchievedByTaker: true,
    });

    assert.equal(success.isContractFulfilled, true);
    assert.equal(success.finalScoreNS, 750); // 500 + 250

    const failedByPartner = ScoreEngine.computeRoundScore({
      rules: DEFAULT_COINCHE_RULES,
      takerSeat: 'SOUTH',
      trump: TrumpMode.ALL_TRUMP,
      contractType: ContractType.GENERALE,
      contractValue: 500,
      coincheLevel: CoincheLevel.NONE,
      rawTrickPointsNS: 258,
      rawTrickPointsEW: 0,
      capotAchievedBy: 'NS',
      generaleAchievedByTaker: false,
    });

    assert.equal(failedByPartner.isContractFulfilled, false);
    assert.equal(failedByPartner.finalScoreEW, 660); // 160 + 500
  });

  it('normalise correctement les points Tout-Atout (258 -> 162)', () => {
    const resultTA = ScoreEngine.computeRoundScore({
      rules: DEFAULT_COINCHE_RULES,
      takerSeat: 'SOUTH',
      trump: TrumpMode.ALL_TRUMP,
      contractType: ContractType.NORMAL,
      contractValue: 90,
      coincheLevel: CoincheLevel.NONE,
      rawTrickPointsNS: 172,
      rawTrickPointsEW: 86,
    });

    assert.equal(resultTA.normalizedTrickPointsNS, 108);
    assert.equal(resultTA.normalizedTrickPointsEW, 54);
    assert.equal(resultTA.isContractFulfilled, true);
    assert.equal(resultTA.finalScoreNS, 198);
  });
});

describe('Phase 2 Core Entities - CardStrengthEvaluator & Session', () => {
  it('vérifie que le jeu de 32 cartes totalise 152 points (162 avec le dix de der) en couleur classique', () => {
    const deck = Deck.create32CardDeck();
    assert.equal(deck.length, 32);

    const totalCardPoints = deck.reduce(
      (sum, card) => sum + CardStrengthEvaluator.getCardPoints(card, TrumpMode.HEARTS),
      0
    );
    assert.equal(totalCardPoints, 152);
  });

  it('impose l’obligation de monter à l’atout et de couper sur l’adversaire', () => {
    const hand = [
      { suit: Suit.HEARTS, rank: Rank.EIGHT },
      { suit: Suit.HEARTS, rank: Rank.JACK },
      { suit: Suit.SPADES, rank: Rank.ACE },
    ];

    const playable = CardStrengthEvaluator.getPlayableCards(
      hand,
      [{ seat: 'WEST', card: { suit: Suit.HEARTS, rank: Rank.NINE } }],
      'SOUTH',
      TrumpMode.HEARTS
    );

    assert.deepEqual(playable, [{ suit: Suit.HEARTS, rank: Rank.JACK }]);
  });

  it('gère une session ManualScoreKeeperSession et le HLC', async () => {
    const session = new ManualScoreKeeperSession('game-1', 'NORTH');
    await session.recordManualRound({
      rules: DEFAULT_BELOTE_RULES,
      takerSeat: 'SOUTH',
      trump: TrumpMode.HEARTS,
      contractType: ContractType.NORMAL,
      contractValue: 82,
      coincheLevel: CoincheLevel.NONE,
      rawTrickPointsNS: 100,
      rawTrickPointsEW: 62,
    });

    assert.equal(session.getState().totalScoreNS, 100);
    assert.equal(session.getState().totalScoreEW, 62);
    assert.equal(session.getState().currentRoundNumber, 2);
    assert.equal(session.getState().dealerSeat, 'EAST');

    const hlc = new HybridLogicalClock('device-A');
    const t1 = hlc.now(1700000000000);
    const t2 = hlc.now(1700000000000);
    assert.equal(HybridLogicalClock.compare(t2, t1), 1);
  });
});

describe('Scénario Complet "Mode Bateau" (Hors-Ligne -> Reconnexion -> Liaison Compte & Invités)', () => {
  it('joue hors-ligne avec invités et QR Code, synchronise au retour réseau et rattache rétroactivement les parties aux vrais comptes d’amis', async () => {
    const { BeloteAppStore } = await import(
      '../../../apps/mobile/src/presentation/state/useAppStore.ts'
    );
    const { ScoreSheetPresenter } = await import(
      '../../../apps/mobile/src/presentation/screens/ScoreSheetScreen.ts'
    );
    const { RoundEntryFormController } = await import(
      '../../../apps/mobile/src/presentation/screens/RoundEntryModal.ts'
    );
    const { StatsDashboardPresenter } = await import(
      '../../../apps/mobile/src/presentation/screens/StatsDashboardScreen.ts'
    );

    const appStore = new BeloteAppStore();

    // 1. L'écran d'accueil s'ouvre sur le 1er onglet "Création d'une partie" (NEW_GAME)
    //    et la Feuille de Marque est fermée tant qu'on n'a pas créé ou sélectionné une partie.
    assert.equal(appStore.getState().activeHomeTab, 'NEW_GAME');
    assert.equal(appStore.getState().isScoreSheetOpen, false);
    assert.equal(appStore.getState().currentUser.authStatus, 'OFFLINE_ANONYMOUS');
    assert.equal(appStore.getState().syncStatus.connectivity, 'OFFLINE_BOAT');

    // 2. Il ajoute 2 invités sans téléphone ("Lucas" et "Chloé") et scanne le QR Code hors-ligne de "Maxime"
    const lucasGuest = appStore.createGuest('Lucas (Bateau)');
    const chloeGuest = appStore.createGuest('Chloé (Bateau)');
    const maximeQr = {
      version: 1 as const,
      profileId: 'user-maxime-uuid',
      username: 'Maxime',
      friendCode: 'BLT-MAX99',
      issuedAt: 1700000000000,
    };

    // 3. Il lance une Partie #1 de Coinche -> La Feuille de Marque s'ouvre automatiquement !
    const game1 = appStore.startNewGame({
      mode: 'COINCHE',
      targetScore: 500,
      seats: {
        SOUTH: { type: 'CURRENT_USER' },
        NORTH: { type: 'GUEST', guestId: lucasGuest.guestId },
        EAST: { type: 'OFFLINE_QR', qrPayload: maximeQr },
        WEST: { type: 'GUEST', guestId: chloeGuest.guestId },
      },
    });
    assert.equal(appStore.getState().isScoreSheetOpen, true);

    // 4. Saisie d'une donne initiale (contrat 100 réussi -> 200 pts), puis MODIFICATION de cette donne #1 en Capot Beloté (520 pts)
    appStore.addRoundToActiveGame('SOUTH', {
      rules: DEFAULT_COINCHE_RULES,
      takerSeat: 'NORTH',
      trump: TrumpMode.HEARTS,
      contractType: ContractType.NORMAL,
      contractValue: 100,
      coincheLevel: CoincheLevel.NONE,
      rawTrickPointsNS: 100,
      rawTrickPointsEW: 62,
    });
    assert.equal(appStore.getState().activeGame?.scoreNS, 200);
    assert.equal(appStore.getState().activeGame?.status, 'IN_PROGRESS');

    // L'utilisateur clique sur "Modifier la donne #1" au lieu de l'annuler
    appStore.startEditingRound(1);
    assert.equal(appStore.getState().editingRoundNumber, 1);

    const draftCapotBelote = {
      rules: DEFAULT_COINCHE_RULES,
      takerSeat: 'NORTH' as const, // Lucas (NS) annonce finalement Capot Beloté à Cœur
      trump: TrumpMode.HEARTS,
      contractType: ContractType.CAPOT_BELOTE,
      contractValue: 250,
      coincheLevel: CoincheLevel.NONE,
      pointsEnteredForTeam: 'NS' as const,
      pointsEnteredValue: 162,
      capotAchievedBy: 'NS' as const,
      beloteTeam: 'NS' as const,
      declarations: [],
    };
    appStore.updateRoundInActiveGame(
      1,
      RoundEntryFormController.toScoreInput(draftCapotBelote)
    );
    assert.equal(appStore.getState().editingRoundNumber, undefined);

    const activeGame = appStore.getState().activeGame!;
    assert.equal(activeGame.scoreNS, 520); // Recalculé automatiquement après modification de la donne #1
    assert.equal(activeGame.status, 'COMPLETED');
    assert.equal(activeGame.winnerTeam, 'NS');

    // Retour à l'accueil (la Feuille de Marque se ferme)
    appStore.closeScoreSheet('GAMES_HISTORY');
    assert.equal(appStore.getState().isScoreSheetOpen, false);
    assert.equal(appStore.getState().activeHomeTab, 'GAMES_HISTORY');

    // 5. Création d'une Partie #2 où Est-Ouest (Maxime & Chloé) gagne sur Générale
    appStore.startNewGame({
      mode: 'COINCHE',
      targetScore: 500,
      seats: {
        SOUTH: { type: 'CURRENT_USER' },
        NORTH: { type: 'GUEST', guestId: lucasGuest.guestId },
        EAST: { type: 'OFFLINE_QR', qrPayload: maximeQr },
        WEST: { type: 'GUEST', guestId: chloeGuest.guestId },
      },
    });
    appStore.addRoundToActiveGame('EAST', {
      rules: DEFAULT_COINCHE_RULES,
      takerSeat: 'EAST',
      trump: TrumpMode.SPADES,
      contractType: ContractType.GENERALE,
      contractValue: 500,
      coincheLevel: CoincheLevel.NONE,
      rawTrickPointsNS: 0,
      rawTrickPointsEW: 162,
      capotAchievedBy: 'EW',
      generaleAchievedByTaker: true,
    });

    // Partie #3 gagnée par NS
    appStore.startNewGame({
      mode: 'COINCHE',
      targetScore: 500,
      seats: {
        SOUTH: { type: 'CURRENT_USER' },
        NORTH: { type: 'GUEST', guestId: lucasGuest.guestId },
        EAST: { type: 'OFFLINE_QR', qrPayload: maximeQr },
        WEST: { type: 'GUEST', guestId: chloeGuest.guestId },
      },
    });
    appStore.addRoundToActiveGame('SOUTH', RoundEntryFormController.toScoreInput(draftCapotBelote));

    // Fermeture de la feuille de marque, puis ouverture d'une ancienne partie depuis l'onglet Historique
    appStore.closeScoreSheet('GAMES_HISTORY');
    assert.equal(appStore.getState().isScoreSheetOpen, false);

    const historyList = ScoreSheetPresenter.buildGamesHistoryList(
      appStore.getState().gamesHistory
    );
    assert.equal(historyList.length, 3);
    appStore.selectGameFromHistory(game1.id);
    assert.equal(appStore.getState().isScoreSheetOpen, true);
    assert.equal(appStore.getState().activeGame?.id, game1.id);

    const sheetVm = ScoreSheetPresenter.buildViewModel(
      appStore.getState().activeGame!,
      appStore.getState().syncStatus
    );
    assert.equal(sheetVm.roundsRows[0].trickDisplayNS, 'Capot B');
    assert.equal(sheetVm.unlinkedPlayersInGame.length, 2);

    // 6. Retour à terre ! Le capitaine lie son compte Apple et synchronise automatiquement les 3 parties
    const mergeRes = await appStore.signInAndMergeLocalAccount({
      authenticatedUserId: 'auth-user-augustin',
      username: 'Augustin',
      email: 'augustin@example.com',
      provider: 'APPLE',
    });
    assert.equal(mergeRes.migratedGamesCount, 3);
    assert.equal(appStore.getState().syncStatus.connectivity, 'ONLINE_SYNCED');

    // 7. Liaison rétroactive de Lucas
    const linkRes = await appStore.linkGuestToFriend({
      claimCode: lucasGuest.claimCode,
      targetProfileId: 'auth-user-lucas',
      targetUsername: 'LucasPro',
      targetFriendCode: 'BLT-LUC01',
    });
    assert.equal(linkRes.updatedGamesCount, 3);

    // 8. Vérification des Statistiques de Victoires / Défaites par joueur
    const statsVm = StatsDashboardPresenter.buildViewModel(
      appStore.getState().statsSummary
    );
    assert.equal(statsVm.kpis[0].value, '67%'); // 2V / 3 parties
    assert.equal(statsVm.rivalries.bestPartner?.name, 'LucasPro');
    assert.equal(statsVm.rivalries.mostWinsAgainst?.name, 'Maxime');
    assert.equal(statsVm.rivalries.mostLossesAgainst?.name, 'Maxime');
  });
});
