# TraceScale CLI

Amorce `npx` pour installer TraceScale sur une machine cliente fraîche,
sans avoir à cloner le dépôt privé à la main, lancer `npm install`, ou
retrouver le bon script npm.

Ce dépôt est **public et ne contient aucun code métier** — uniquement la
logique de téléchargement/installation. Le vrai dépôt (`ElmiraLabs/tracescale`)
reste privé, protégé par un jeton d'accès dédié.

## Utilisation

```sh
npx github:ElmiraLabs/tracescale-cli
```

Sans argument, la commande demande tout de façon interactive : jeton
d'accès, répertoire d'installation, type d'instance (Siège/Site), cible
(Docker/bare-metal). Tout peut aussi être fourni en argument pour un usage
scripté :

```sh
npx github:ElmiraLabs/tracescale-cli \
  --token=github_pat_xxx \
  --dir=./tracescale \
  --type=site \
  --cible=docker
```

La commande télécharge la **dernière release publiée** de TraceScale (pas
la branche de développement), installe les dépendances, puis lance
l'assistant d'installation déjà existant côté dépôt privé — rien de plus.

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

Cet outil ne gère que le **premier provisionnement**. Pour un renouvellement
de certificat, une réinstallation ou une mise à jour, utiliser directement
les commandes déjà installées depuis le répertoire cloné (`node ace
instance:installer ...`, voir la documentation du dépôt principal).
