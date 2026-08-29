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

  Le jeton se fournit par la variable d'environnement `TRACESCALE_GITHUB_TOKEN`
  ou en saisie masquée ; il est transmis au wizard du dépôt privé par
  l'environnement, jamais en argument (`--token=` reste accepté mais
  déconseillé — visible dans `ps` et l'historique du shell — et sera retiré).

  Télécharge la **dernière release publiée** de TraceScale (pas la branche
  de développement), **vérifie son empreinte SHA-256** contre le manifeste
  `SHA256SUMS` publié sur la même release (une archive altérée ou une
  release sans manifeste est refusée, rien n'est extrait), installe les
  dépendances, puis lance l'assistant d'installation côté dépôt privé.

- **Dossier contenant déjà une installation Site/Docker** → mise à jour :
  le type est détecté automatiquement (pas besoin de le refournir), la
  version déjà installée est comparée à la dernière release publiée, puis
  une confirmation est demandée avant de lancer la mise à jour. Le tag
  confirmé est écrit dans `deploy/site/.env` (`IMAGE_TAG=`, qui fait foi
  côté dépôt privé — jamais « la dernière version » choisie en silence sur
  une machine de production), puis délègue à `node ace instance:installer
  --mettre-a-jour` dans le dépôt déjà présent (voir sa documentation pour
  le détail du mécanisme : image `api` publiée tirée directement, `web`
  reconstruit localement). Rien à faire si déjà à jour. Les autres
  combinaisons (Siège, bare-metal) ne sont pas encore prises en charge par
  cette détection automatique — message explicite renvoyant vers `node ace
  instance:installer` directement.

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
installation Site/Docker existante. Pour un renouvellement de certificat,
une réinstallation forcée, ou une mise à jour Siège/bare-metal (pas encore
détectées automatiquement), utiliser directement les commandes déjà
installées depuis le répertoire cloné (`node ace instance:installer ...`,
voir la documentation du dépôt principal).
