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
  npx github:ElmiraLabs/tracescale-cli \
    --token=github_pat_xxx \
    --dir=./tracescale \
    --type=site \
    --cible=docker
  ```

  Télécharge la **dernière release publiée** de TraceScale (pas la branche
  de développement), installe les dépendances, puis lance l'assistant
  d'installation côté dépôt privé.

- **Dossier contenant déjà une installation Site/Docker** → mise à jour :
  le type est détecté automatiquement (pas besoin de le refournir), la
  version déjà installée est comparée à la dernière release publiée, puis
  une confirmation est demandée avant de lancer la mise à jour (délègue à
  `node ace instance:installer --mettre-a-jour` dans le dépôt déjà présent
  — voir sa documentation pour le détail du mécanisme). Rien à faire si
  déjà à jour. Les autres combinaisons (Siège, bare-metal) ne sont pas
  encore prises en charge par cette détection automatique — message
  explicite renvoyant vers `node ace instance:installer` directement.

## Prérequis sur la machine cible

- Node.js ≥ 20 et npm (déjà nécessaires pour exécuter `npx` lui-même).
- La commande système `tar` — présente nativement sur Windows 10+, macOS
  et Linux.
- Pour la cible Docker : Docker Engine + Docker Compose v2.

## Jeton d'accès

Le jeton doit être un **fine-grained personal access token** GitHub, limité
au dépôt `ElmiraLabs/tracescale`, avec la permission **Contents: Read-only**
uniquement. Il est généré et transmis par Elmira Labs via un canal séparé
(jamais en clair dans un dépôt ou une documentation publique), révocable et
limitable dans le temps, par client/déploiement.

## Portée

Détecte et gère le premier provisionnement **et** la mise à jour d'une
installation Site/Docker existante. Pour un renouvellement de certificat,
une réinstallation forcée, ou une mise à jour Siège/bare-metal (pas encore
détectées automatiquement), utiliser directement les commandes déjà
installées depuis le répertoire cloné (`node ace instance:installer ...`,
voir la documentation du dépôt principal).
