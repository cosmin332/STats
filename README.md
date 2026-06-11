# 🏃 Running stats — PWA

Dashboard d'analyse course à pied basé sur l'export Strava (`activities.csv`).
Tout le calcul se fait dans le navigateur ([compute.js](compute.js)) — aucune donnée n'est envoyée à un serveur.

## Déployer sur GitHub Pages

1. Crée un dépôt GitHub (par ex. `running-stats`), **privé impossible pour Pages gratuit → mets-le public** (les données d'activités seront visibles ; sinon utilise un dépôt privé + GitHub Pro).
2. Pousse le contenu de ce dossier `pwa/` à la **racine** du dépôt :
   ```bash
   cd pwa
   git init -b main
   git add .
   git commit -m "Running stats PWA"
   git remote add origin https://github.com/<ton-user>/running-stats.git
   git push -u origin main
   ```
3. Sur GitHub : **Settings → Pages → Source : Deploy from a branch → Branch : `main` / `(root)`** → Save.
4. L'app est disponible sur `https://<ton-user>.github.io/running-stats/` après ~1 minute.

## Installer sur l'écran d'accueil

- **iPhone (Safari)** : ouvre l'URL → bouton Partager → « Sur l'écran d'accueil ».
- **Android (Chrome)** : ouvre l'URL → menu ⋮ → « Installer l'application ».

L'app fonctionne ensuite hors-ligne (service worker).

## Connecter l'API Strava (sync automatique)

1. Crée ton application API sur **[strava.com/settings/api](https://www.strava.com/settings/api)** :
   - *Category* : libre (par ex. « Data Importer »)
   - *Authorization Callback Domain* : **cosmin332.github.io** (le domaine de la page, sans https:// ni chemin)
2. Récupère le **Client ID** et le **Client Secret**, puis :
   - soit renseigne-les dans **`config.js`** et pousse (assumé public — n'importe qui pourra utiliser
     ces identifiants d'app, mais pas accéder à ton compte sans ton autorisation OAuth) ;
   - soit clique **⚙️** dans l'app et colle-les (stockage local sur l'appareil uniquement).
3. Bouton **« 🔗 Connecter Strava »** → autorisation sur strava.com → retour automatique dans l'app
   → toutes les activités sont synchronisées. Ensuite le bouton devient **« 🔄 Sync Strava »**.

L'app utilise le scope `activity:read_all` (lecture seule). Les jetons et activités sont en cache
local (localStorage) ; « ↺ » déconnecte et efface tout.

Données en plus via l'API : cadence. Données en moins vs CSV : météo, charge d'entraînement native
(remplacée par le « relative effort »), calories/pas (estimés).

## Mettre à jour les données (sans API)

Deux options :

**A. Depuis le téléphone (sans toucher au dépôt)** — bouton **« 📥 Importer activities.csv »** dans l'app :
demande ton export à Strava (Paramètres → Mon compte → Télécharger ou supprimer votre compte →
Télécharger une copie), récupère `activities.csv` dans l'archive et importe-le. Les données sont
recalculées localement et persistées sur l'appareil (localStorage). « ↺ Données du dépôt » pour revenir en arrière.

**B. Dans le dépôt (pour tous les appareils)** — remplace `activities.csv` à la racine du dépôt et pousse :
```bash
cp ~/Downloads/export_xxx/activities.csv .
git commit -am "maj activités" && git push
```
Le service worker récupère le nouveau fichier au rechargement suivant.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Shell de l'app (UI, styles) |
| `compute.js` | Calcul de toutes les statistiques (sources : CSV **ou** API Strava) |
| `strava.js` | OAuth + synchronisation API Strava |
| `config.js` | Client ID/Secret de ton application API Strava (optionnel) |
| `app.js` | Rendu des graphiques (Chart.js), import, service worker |
| `activities.csv` | Données par défaut (export Strava) |
| `sw.js` / `manifest.webmanifest` / `icons/` | PWA (offline + installation) |
| `vendor/` | Chart.js embarqué (pas de CDN → fonctionne hors-ligne) |

Note : l'objectif hebdomadaire (5 puis 15 km/sem, issu de `goals.csv`) est défini dans `compute.js` (`GOALS`).
