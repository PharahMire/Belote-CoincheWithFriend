# 🚀 Guide de Mise en Production & Test entre Amis (Supabase + Auth + Mobile)

Ce guide détaille pas à pas comment brancher la base de données en ligne **Supabase**, activer l'authentification (**Email, Google, Apple**) et déployer l'application pour jouer et tester avec tes amis sur téléphone.

---

## ÉTAPE 1 — Créer la Base de Données en Ligne (Supabase — 5 min)

Le schéma SQL complet (tables, index, sécurité Row Level Security, fonction de synchronisation HLC et statistiques) est déjà prêt dans [`supabase/migrations/0001_initial_schema.sql`](./supabase/migrations/0001_initial_schema.sql).

1. Crée un compte gratuit sur **[https://supabase.com](https://supabase.com)** et clique sur **"New Project"**.
2. Choisis un nom (ex: `belote-coinche-friends`), un mot de passe de base de données et la région **`West EU (Paris)`** ou **`Central EU (Frankfurt)`**.
3. Une fois le projet initialisé (environ 1 minute) :
   - Dans le menu de gauche, ouvre **SQL Editor** → **New Query**.
   - Copie-colle l'intégralité du fichier [`supabase/migrations/0001_initial_schema.sql`](./supabase/migrations/0001_initial_schema.sql) et clique sur **Run**.
   - Cela crée automatiquement :
     - `public.profiles` (avec génération automatique d'un `friend_code` unique `BLT-XXXXX` pour chaque joueur inscrit)
     - `public.friendships` (demandes d'amis et liste d'amis)
     - `public.games` (avec le nom de la partie `title`, le mode, les règles et le verrouillage)
     - `public.game_participants` (avec support des profils liés, du scan QR et des invités `claim_code`)
     - `public.game_rounds` (détail de chaque donne, donneur, contrat, plis, annonces)
     - `public.sync_push_batch` (la fonction RPC de synchronisation Offline-First avec résolution de conflits Hybrid Logical Clock)

---

## ÉTAPE 2 — Activer le Système de Connexion (Auth)

Dans ton tableau de bord Supabase, va dans **Authentication** → **Providers** :

1. **Email / Mot de passe (Activé par défaut) :**
   - Pour tester rapidement entre amis sans devoir cliquer sur un lien de confirmation par mail, tu peux désactiver temporairement *"Confirm email"* dans **Authentication → Providers → Email**.
2. **Connexion Google (Optionnel) :**
   - Active **Google** dans Supabase et renseigne un `Client ID` / `Client Secret` depuis Google Cloud Console.
3. **Sign in with Apple (Optionnel, requis uniquement lors de la publication sur l'App Store iOS) :**
   - Active **Apple** dans Supabase avec ton identifiant Apple Developer.

### Auto-création du profil et du Code Ami (`BLT-XXXXX`) à l'inscription
Exécute ce petit trigger dans le **SQL Editor** de Supabase pour que chaque nouvel utilisateur inscrit dans `auth.users` reçoive automatiquement son profil et son Code Ami unique :

```sql
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_friend_code VARCHAR(12);
  v_username VARCHAR(32);
BEGIN
  v_friend_code := 'BLT-' || UPPER(SUBSTRING(MD5(NEW.id::text || NOW()::text) FROM 1 FOR 5));
  v_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    SPLIT_PART(NEW.email, '@', 1),
    'Joueur_' || SUBSTRING(NEW.id::text FROM 1 FOR 4)
  );

  INSERT INTO public.profiles (id, username, friend_code, avatar_url)
  VALUES (NEW.id, v_username, v_friend_code, NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
```

---

## ÉTAPE 3 — Connecter l'Application à ton Projet Supabase

1. Dans ton dashboard Supabase, va dans **Project Settings (⚙️)** → **API**.
2. Récupère :
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon / public key** (`eyJhbGci...`)
3. Copie le fichier [`apps/mobile/.env.example`](./apps/mobile/.env.example) vers `apps/mobile/.env` et colle tes deux clés :

```env
EXPO_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
EXPO_PUBLIC_SUPABASE_ANON_KEY="eyJhbGci..."
```

Le connecteur [`SupabaseRemoteTransport.ts`](./apps/mobile/src/data/remote/SupabaseRemoteTransport.ts) utilise directement ces variables pour :
- Envoyer les parties créées hors-ligne dès que le réseau revient (`pushBatch` → RPC `sync_push_batch`)
- Récupérer les parties jouées par tes amis (`pullDelta`)
- Chercher un ami par son Code Ami (`searchFriendByCodeOrUsername`)
- Rattacher un joueur invité à son vrai compte (`claimGuestParticipationsOnCloud`)

---

## ÉTAPE 4 — Deux façons de tester avec tes potes dès aujourd'hui

### Option A — Test immédiat sur tous les téléphones (iOS & Android) en Web-App Mobile (PWA) — *Le plus rapide (2 minutes)*
Comme l'interface est pensée 100% tactile mobile et autonome :
1. Tu peux héberger gratuitement l'application web mobile sur **Vercel**, **Netlify** ou **GitHub Pages** directement depuis ton dépôt GitHub `PharahMire/Belote-CoincheWithFriend`.
2. Envoie simplement le lien à tes amis sur WhatsApp/Discord.
3. Sur iPhone (Safari → *Partager* → **Sur l'écran d'accueil**) et sur Android (Chrome → **Ajouter à l'écran d'accueil**), l'application s'installe en plein écran comme une vraie application native et fonctionne hors-ligne grâce au stockage local.

### Option B — Application Native iOS & Android avec React Native / Expo Go
Pour lancer le projet dans le conteneur natif **Expo** :
1. Sur ton ordinateur, dans `apps/mobile`, installe les dépendances Expo :
   ```bash
   npx create-expo-app@latest belote-native --template blank-typescript
   npm install @supabase/supabase-js expo-sqlite @react-native-community/netinfo expo-camera react-native-qrcode-svg zustand
   ```
2. Lance le serveur de développement :
   ```bash
   npx expo start --tunnel
   ```
3. Tes amis téléchargent l'application gratuite **Expo Go** (sur App Store / Google Play) et scannent le QR Code du terminal pour ouvrir l'application native directement sur leur téléphone.
4. Pour générer un fichier `.apk` (Android) ou distribuer sur TestFlight (iOS) sans avoir besoin de ton ordinateur allumé :
   ```bash
   npm install -g eas-cli
   eas build --platform android --profile preview
   ```
   Cela te génère un lien de téléchargement direct que tes amis peuvent installer en 1 clic sur leur téléphone.
