# Belote & Coinche With Friends 🃏

Application mobile cross-platform (iOS & Android) **Offline-First** dédiée à la **Belote Classique** et à la **Coinche (Belote Coinchée)**.

- **Phase 1 :** Carnet de scores intelligent, social (Amis + Invités locaux) et 100% fonctionnel hors-ligne avec synchronisation asynchrone vers Supabase (LWW via Hybrid Logical Clock).
- **Phase 2 Ready :** Moteur de règles isolé (`@belote/core-rules`) et abstraction `GameSessionProvider` prêts pour le multijoueur P2P (WebRTC) et Serveur Autoritaire (Matchmaking classé).

## Structure du Projet

- [`packages/core-rules`](file:///home/antigravity/PharahMire/Belote-CoincheWithFriend/packages/core-rules/src/index.ts) : Règles métier pures (0 dépendance externe), incluant [`ScoreEngine`](file:///home/antigravity/PharahMire/Belote-CoincheWithFriend/packages/core-rules/src/rules/ScoreEngine.ts) et [`CardStrengthEvaluator`](file:///home/antigravity/PharahMire/Belote-CoincheWithFriend/packages/core-rules/src/rules/CardStrengthEvaluator.ts).
- [`apps/mobile/src/domain/session/GameSessionProvider.ts`](file:///home/antigravity/PharahMire/Belote-CoincheWithFriend/apps/mobile/src/domain/session/GameSessionProvider.ts) : Abstraction unifiée entre saisie manuelle (Phase 1), session P2P (Phase 2A) et serveur dédié (Phase 2B).
- [`apps/mobile/src/data/sync/SyncEngine.ts`](file:///home/antigravity/PharahMire/Belote-CoincheWithFriend/apps/mobile/src/data/sync/SyncEngine.ts) & [`HybridLogicalClock.ts`](file:///home/antigravity/PharahMire/Belote-CoincheWithFriend/apps/mobile/src/data/sync/HybridLogicalClock.ts) : File d'attente de synchronisation offline-to-online avec Backoff exponentiel et résolution de conflits Last-Write-Wins.
- [`apps/mobile/src/data/local/schema.sql`](file:///home/antigravity/PharahMire/Belote-CoincheWithFriend/apps/mobile/src/data/local/schema.sql) : Schéma SQLite local + table `sync_queue`.
- [`supabase/migrations/0001_initial_schema.sql`](file:///home/antigravity/PharahMire/Belote-CoincheWithFriend/supabase/migrations/0001_initial_schema.sql) : Schéma Cloud PostgreSQL + RPC `sync_push_batch`.
