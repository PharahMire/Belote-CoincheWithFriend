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

    // 1. Sur le bateau (0 réseau) : l'utilisateur est en profil local anonyme
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

    // 3. Il lance une partie de Coinche sur le bateau (Sud = Moi, Nord = Lucas Invité, Est = Maxime QR, Ouest = Chloé Invitée)
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

    // 4. Saisie de 2 donnes via le contrôleur de formulaire (avec auto-complétion sur 162)
    const draft1 = {
      rules: DEFAULT_COINCHE_RULES,
      takerSeat: 'NORTH' as const, // Lucas (NS) prend à 110 Cœur Coinché
      trump: TrumpMode.HEARTS,
      contractType: ContractType.NORMAL,
      contractValue: 110,
      coincheLevel: CoincheLevel.COINCHE,
      coincherSeat: 'EAST' as const,
      pointsEnteredForTeam: 'NS' as const,
      pointsEnteredValue: 120, // EW aura automatiquement 42
      beloteTeam: 'NS' as const,
      declarations: [],
    };
    const preview1 = RoundEntryFormController.previewLiveScore(draft1);
    assert.equal(preview1.finalScoreNS, 480); // (110 + 120) * 2 + 20 belote = 480

    appStore.addRoundToActiveGame('SOUTH', RoundEntryFormController.toScoreInput(draft1));

    // Donne 2 : NS marque 190 -> Total NS = 670 >= 500 (Partie gagnée par NS !)
    appStore.addRoundToActiveGame('WEST', {
      rules: DEFAULT_COINCHE_RULES,
      takerSeat: 'SOUTH',
      trump: TrumpMode.SPADES,
      contractType: ContractType.NORMAL,
      contractValue: 90,
      coincheLevel: CoincheLevel.NONE,
      rawTrickPointsNS: 100,
      rawTrickPointsEW: 62,
    });

    const activeGame = appStore.getState().activeGame!;
    assert.equal(activeGame.status, 'COMPLETED');
    assert.equal(activeGame.winnerTeam, 'NS');

    // Vérification du ViewModel de la Feuille de Marque en mode Hors-Ligne
    const sheetVm = ScoreSheetPresenter.buildViewModel(
      activeGame,
      appStore.getState().syncStatus
    );
    assert.equal(sheetVm.unlinkedPlayersInGame.length, 2); // Lucas & Chloé sont encore des invités non liés
    assert.ok(sheetVm.syncBadgeLabel.includes('Hors-Ligne'));

    // 5. Retour à terre ! Le capitaine lie son compte Apple/Google et synchronise automatiquement
    const mergeRes = await appStore.signInAndMergeLocalAccount({
      authenticatedUserId: 'auth-user-augustin',
      username: 'Augustin',
      email: 'augustin@example.com',
      provider: 'APPLE',
    });
    assert.equal(mergeRes.migratedGamesCount, 1);
    assert.equal(appStore.getState().syncStatus.connectivity, 'ONLINE_SYNCED');
    assert.equal(appStore.getState().syncStatus.pendingMutationsCount, 0);

    // 6. Liaison rétroactive : "Lucas (Bateau)" crée son compte (@lucas_pro) et on lie son guestId (ou claimCode)
    const linkRes = await appStore.linkGuestToFriend({
      claimCode: lucasGuest.claimCode,
      targetProfileId: 'auth-user-lucas',
      targetUsername: 'LucasPro',
      targetFriendCode: 'BLT-LUC01',
    });
    assert.equal(linkRes.updatedGamesCount, 1);

    // 7. Vérification que LucasPro possède désormais 100% des statistiques de ses parties jouées sur le bateau !
    const statsVm = StatsDashboardPresenter.buildViewModel(appStore.getState().statsSummary);
    assert.equal(statsVm.kpis[0].value, '100%'); // 1 victoire / 1 partie
  });
});
