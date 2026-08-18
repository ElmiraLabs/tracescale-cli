// Détecte une installation déjà présente dans le dossier cible — signal de
// base identique à l'ancien garde-fou (package.json ou .git), mais complété
// pour identifier type (site/siège), cible (docker/natif) et version
// installée, afin de pouvoir proposer une mise à jour directement plutôt
// que de simplement refuser de continuer.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// `deploy/site/.env`/`deploy/staging/.env` n'existent que pour une
// installation Docker déjà provisionnée (écrits par `instance:installer`,
// jamais dans une archive de release — gitignored côté dépôt privé) : leur
// présence suffit à identifier type + cible sans avoir à les lire.
// Bare-metal (natif) : un seul chemin possible quel que soit le type
// (`<repertoireApplication>/build/.env`, cf. instance_installer.ts) — sauf
// répertoire d'application personnalisé au moment de l'installation
// initiale, non détectable ici ; ce cas retombe sur `type: null` plus bas.
export function installationExistante(dossierCible) {
  const aPackageJson = existsSync(join(dossierCible, 'package.json'))
  const aGit = existsSync(join(dossierCible, '.git'))
  if (!aPackageJson && !aGit) return null

  let type = null
  let cible = null
  if (existsSync(join(dossierCible, 'deploy/site/.env'))) {
    type = 'site'
    cible = 'docker'
  } else if (existsSync(join(dossierCible, 'deploy/staging/.env'))) {
    type = 'siege'
    cible = 'docker'
  } else {
    const cheminEnvNatif = join(dossierCible, 'apps/api/build/.env')
    if (existsSync(cheminEnvNatif)) {
      cible = 'natif'
      const contenu = readFileSync(cheminEnvNatif, 'utf8')
      const ligne = contenu.split('\n').find((l) => l.startsWith('TYPE_INSTANCE='))
      type = ligne ? ligne.slice('TYPE_INSTANCE='.length).trim() || null : null
    }
  }

  let version = null
  try {
    const pkg = JSON.parse(readFileSync(join(dossierCible, 'package.json'), 'utf8'))
    version = pkg.version ?? null
  } catch {
    version = null
  }

  return { type, cible, version }
}

// Issue #830 : IMAGE_TAG (deploy/site/.env) fait foi côté dépôt privé pour
// choisir quelle version installer/mettre à jour — jamais "la dernière
// release" automatiquement sur une machine de production
// (instance_installer.ts, mettreAJourSite()). Ce module détecte et propose
// une mise à jour vers la dernière release publiée : écrit ici le tag
// retenu avant de déléguer, pour que les deux mécanismes restent
// cohérents (ce que ce module a proposé est bien ce que --mettre-a-jour va
// réellement installer). Ajoute la ligne si absente (installation
// antérieure à #830, sans IMAGE_TAG dans son .env.example d'origine).
export function ecrireImageTag(dossierCible, tag) {
  const cheminEnv = join(dossierCible, 'deploy/site/.env')
  const lignes = readFileSync(cheminEnv, 'utf8').split('\n')
  const index = lignes.findIndex((l) => l.startsWith('IMAGE_TAG='))
  if (index >= 0) {
    lignes[index] = `IMAGE_TAG=${tag}`
  } else {
    lignes.push(`IMAGE_TAG=${tag}`)
  }
  writeFileSync(cheminEnv, lignes.join('\n'))
}
