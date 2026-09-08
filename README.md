# TraceScale CLI

Amorce `npx` unique pour installer TraceScale sur une machine cliente
fraîche, **ou** mettre à jour une installation déjà présente — la même
commande détecte automatiquement laquelle des deux situations s'applique,
sans avoir à retrouver le bon script npm ni la bonne commande `node ace`.

Ce dépôt est **public et ne contient aucun code métier** — uniquement la
logique de téléchargement/installation. Le vrai dépôt (`ElmiraLabs/tracescale`)
reste privé, protégé par un jeton d'accès dédié.

## Utilisation

```sh
npx github:ElmiraLabs/tracescale-cli
```

Sans argument, la commande demande le jeton d'accès et le répertoire cible,
puis regarde ce qu'il y a dedans :

- **Dossier vide ou inexistant** → installation neuve : demande en plus le
  type d'instance (Siège/Site) et la cible (Docker/bare-metal). Tout peut
  aussi être fourni en argument pour un usage scripté :

  ```sh
  TRACESCALE_GITHUB_TOKEN=github_pat_xxx \
  npx github:ElmiraLabs/tracescale-cli \
    --dir=./tracescale \
    --type=site \
    --cible=docker
  ```

  Sous Windows : `$env:TRACESCALE_GITHUB_TOKEN = 'github_pat_xxx'` (PowerShell)
  ou `set TRACESCALE_GITHUB_TOKEN=github_pat_xxx` (cmd) avant la commande.

  Le jeton se fournit par la variable d'environnement `TRACESCALE_GITHUB_TOKEN`
  ou en saisie masquée ; il est transmis au wizard du dépôt privé par
  l'environnement, jamais en argument (`--token=` reste accepté mais
  déconseillé — visible dans `ps` et l'historique du shell — et sera retiré).

  Télécharge la **dernière release publiée** de TraceScale (pas la branche
  de développement), **vérifie son empreinte SHA-256** contre le manifeste
  `SHA256SUMS` publié sur la même release (une archive altérée ou une
  release sans manifeste est refusée, rien n'est extrait), installe les
  dépendances, puis lance l'assistant d'installation côté dépôt privé.

- **Dossier contenant déjà une installation Site/Docker, ou native (Site ou Siège)** → mise à jour :
  le type est détecté automatiquement (pas besoin de le refournir), la
  version déjà installée est comparée à la dernière release publiée, puis
  une confirmation est demandée avant de lancer la mise à jour. Site
  Docker : le tag confirmé est écrit dans `deploy/site/.env` (`IMAGE_TAG=`,
  qui fait foi côté dépôt privé — jamais « la dernière version » choisie en
  silence sur une machine de production), puis délégation à `node ace
  instance:installer --mettre-a-jour`. Native (Site ou Siège, détectée par
  `apps/api/build/.env`) : le dépôt présent est d'abord rafraîchi depuis
  l'archive vérifiée de la release (pour disposer de l'installateur à jour),
  puis délégation à `node ace instance:installer --cible=natif
  --mettre-a-jour --version=<tag>` (sauvegarde, bascule de `build/`, retour
  arrière : voir `deploy/site-natif/README.md` du dépôt principal). La
  version installée est lue dans ce qui tourne (`build/package.json` en
  natif). Rien à faire si déjà à jour. Seul le Siège Docker n'est pas pris
  en charge par cette détection — message explicite renvoyant vers `node ace
  instance:installer` directement.

## Désinstallation

```sh
npx github:ElmiraLabs/tracescale-cli --desinstaller --dir=./tracescale
# + suppression de la base, des certificats et des données (IRRÉVERSIBLE) :
npx github:ElmiraLabs/tracescale-cli --desinstaller --purger-donnees --dir=./tracescale
# + dossier système (journaux), step-ca/réseau Docker et le checkout lui-même (IRRÉVERSIBLE) :
npx github:ElmiraLabs/tracescale-cli --desinstaller --purger-donnees --tout --dir=./tracescale
# Inventaire de ce que chaque niveau retirerait, sans rien faire :
npx github:ElmiraLabs/tracescale-cli --desinstaller --lister --dir=./tracescale
# Docker seulement : + images tracescale-api/-web au tag installé (jamais postgres ni step-ca) :
npx github:ElmiraLabs/tracescale-cli --desinstaller --supprimer-images --dir=./tracescale
```

Aucun jeton, aucun téléchargement : la CLI identifie l'installation présente
(type, cible, version), demande confirmation, puis délègue à l'installateur
déjà en place (`node ace instance:installer --type=… --cible=… --desinstaller`),
qui redemande lui-même confirmation avant toute purge. Sans `--purger-donnees`,
seuls les services (natif) ou conteneurs (Docker) sont retirés — base,
certificats et configuration restent en place pour une réinstallation.
Trois niveaux emboîtés : `--desinstaller` ⊂ `--purger-donnees` ⊂ `--tout`
(qui exige `--purger-donnees`). Avec `--tout`, le checkout n'est pas effacé
en bloc : seuls ses sous-dossiers connus du dépôt et ses fichiers de premier
niveau sont retirés, tout autre sous-dossier est conservé et nommé. Les
prérequis (PostgreSQL, Node, nssm, step, Docker) et le compte système
`tracescale` (Linux) ne sont jamais touchés.

## Prérequis sur la machine cible

- Node.js ≥ 20 et npm (déjà nécessaires pour exécuter `npx` lui-même).
- La commande système `tar` — présente nativement sur Windows 10+, macOS
  et Linux.
- Pour la cible Docker : Docker Engine + Docker Compose v2.

## Jeton d'accès

Le jeton doit être un **fine-grained personal access token** GitHub, limité
au dépôt `ElmiraLabs/tracescale`, avec la permission **Contents: Read-only**.
Pour une installation Site (seule à supporter la mise à jour automatique,
cf. ci-dessus), ajouter aussi **Packages: Read** — le paquet
`ghcr.io/elmiralabs/tracescale-api` est privé, nécessaire pour que la
mise à jour déléguée puisse le tirer (`docker login ghcr.io`, géré côté
dépôt privé, jamais par ce script). Il est généré et transmis par Elmira
Labs via un canal séparé (jamais en clair dans un dépôt ou une
documentation publique), révocable et limitable dans le temps, par
client/déploiement.

## Portée

Détecte et gère le premier provisionnement **et** la mise à jour d'une
installation Site/Docker ou native existante (la mise à jour native — sauvegarde, bascule de `build/`, retour arrière — est décrite dans `deploy/site-natif/README.md` du dépôt principal). Pour un renouvellement de certificat,
une réinstallation forcée, ou une mise à jour Siège Docker (pas encore
détectée automatiquement), utiliser directement les commandes déjà
installées depuis le répertoire cloné (`node ace instance:installer ...`,
voir la documentation du dépôt principal).
