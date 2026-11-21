# Mise en place de la boîte mail Gmail dans Tempo

Ce que contient la fonctionnalité :

| Où | Fichier | Rôle |
|---|---|---|
| Site | `parametres.html`, `js/parametres.js`, `css/parametres.css` | Connecter / déconnecter Gmail, réglages d'affichage |
| Site | `js/mail.js` | Client de l'API mail (appelle la fonction Supabase `gmail`) |
| Site | `js/mailbox.js`, `css/mail.css` + panneau dans `accueil.html` | Liste, lecture, réponse, nouveau message, mail → créneau / habitude |
| Serveur | `supabase/migrations/20261120_gmail_connections.sql` | Table des connexions (RLS activée, aucune policy : le navigateur n'y accède pas) |
| Serveur | `supabase/functions/gmail/` | API appelée par le site (status, connect, list, get, send, save_settings, disconnect) |
| Serveur | `supabase/functions/gmail-oauth-callback/` | Retour de Google : échange le code, chiffre et enregistre le jeton |
| Tests | `supabase/tests/gmail.test.mjs` | Tests de la logique serveur (sans réseau) |

Le navigateur ne parle jamais à Gmail directement. Le **secret Google** et les **jetons** restent côté serveur ; le jeton de rafraîchissement est chiffré (AES-256-GCM) avant d'être écrit en base.

---

## 1. Google Cloud (≈ 15 min)

1. <https://console.cloud.google.com> → crée un projet « Tempo ».
2. **API et services → Bibliothèque** → active **Gmail API**.
3. **Écran de consentement OAuth** (type **Externe**, statut **Test**) :
   - nom de l'appli, email d'assistance ;
   - **Champs d'application** : ajoute `.../auth/gmail.readonly` et `.../auth/gmail.send` ;
   - **Utilisateurs test** : ajoute les adresses Gmail autorisées à se connecter (100 maximum).
4. **Identifiants → Créer des identifiants → ID client OAuth → Application Web**.
   - **URI de redirection autorisé** (exactement) :
     `https://<TON-PROJET>.supabase.co/functions/v1/gmail-oauth-callback`
   - Note l'**ID client** et le **code secret**.

## 2. Base de données Supabase

Dans **SQL Editor**, colle et exécute `supabase/migrations/20261120_gmail_connections.sql`.

## 3. Secrets des fonctions

Avec la [CLI Supabase](https://supabase.com/docs/guides/cli) (`supabase login`, puis `supabase link --project-ref <TON-PROJET>`) :

```bash
supabase secrets set \
  GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="xxxx" \
  STATE_SECRET="$(openssl rand -hex 32)" \
  TOKEN_KEY="$(openssl rand -base64 32)" \
  SITE_URL="https://ton-site.example/tempo" \
  ALLOWED_ORIGINS="https://ton-site.example,http://localhost:5500"
```

- `SITE_URL` : l'adresse où Tempo est hébergé (sans `/` final). Google ramène l'utilisateur vers `SITE_URL/parametres.html`.
- `ALLOWED_ORIGINS` : origines autorisées à appeler la fonction (CORS), séparées par des virgules. Ajoute ton adresse de test locale si besoin. Si absent, seule l'origine de `SITE_URL` est autorisée.
- `TOKEN_KEY` : **garde-la précieusement**. La perdre rend les jetons déjà enregistrés illisibles (les utilisateurs devront reconnecter Gmail).
- Optionnel : `MAIL_MIN_AGE` (15 par défaut) change l'âge minimum pour connecter une boîte mail.

## 4. Déployer les fonctions

```bash
supabase functions deploy gmail --no-verify-jwt
supabase functions deploy gmail-oauth-callback --no-verify-jwt
```

`--no-verify-jwt` est voulu : `gmail-oauth-callback` est appelée par Google (sans session), et `gmail` vérifie elle-même le jeton de session de l'utilisateur dans son code (compatible avec les clés « publishable »).

## 5. Tester

1. Ouvre Tempo → **⚙ Paramètres → Connecter Gmail**, accepte **les deux** permissions sur l'écran de Google.
2. Retour sur Paramètres : « Gmail connecté ✓ ». Règle l'affichage, puis retourne à l'accueil : le panneau **📬 Boîte mail** affiche tes mails.
3. Tests automatiques de la logique serveur :
   ```bash
   node --experimental-strip-types --test supabase/tests/gmail.test.mjs
   ```

## À savoir avant de l'ouvrir à du monde

- **Mode Test de Google** : seuls les « utilisateurs test » peuvent se connecter, et, à ma connaissance, leur autorisation expire après **7 jours** (il faut reconnecter Gmail chaque semaine).
- **Passer en production** : `gmail.readonly` est une permission **« restreinte »** chez Google. Sans vérification, l'appli reste plafonnée à **100 utilisateurs** (à vie pour le projet). La vérification demande une page de confidentialité publique (déjà prévue : `confidentialite.html`), un domaine vérifié, une vidéo de démonstration, et en général une **évaluation de sécurité par un tiers (CASA)**, payante et à renouveler. À prévoir avant toute ouverture publique.
- **Mineurs** : la connexion est bloquée côté serveur sous 15 ans (`MAIL_MIN_AGE`).
- **Complète** les passages orange de `confidentialite.html` (responsable du traitement, email de contact, durée de conservation).

## Dépannage

| Symptôme | Cause probable |
|---|---|
| « Impossible de joindre le service mail » | Fonctions non déployées, ou origine absente de `ALLOWED_ORIGINS` |
| Google : `redirect_uri_mismatch` | L'URI de redirection de l'étape 1.4 n'est pas exactement celle de la fonction |
| Google : « Accès bloqué » | Ton adresse n'est pas dans les utilisateurs test (mode Test) |
| « Il faut autoriser la lecture ET l'envoi » | Une case a été décochée sur l'écran de Google |
| « La connexion à Gmail a échoué » + une piste | La piste indique l'étape : identifiants Google / redirection, API Gmail non activée, table absente, `TOKEN_KEY` invalide… |
| « La connexion à Gmail a échoué » sans piste | Lis les journaux : Supabase → Edge Functions → `gmail-oauth-callback` → Logs (ligne `gmail callback error:`) |
| « Ta connexion Gmail a expiré » | Autorisation révoquée ou expirée (7 jours en mode Test) : reconnecte-toi |
