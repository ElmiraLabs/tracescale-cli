// Détecte une installation déjà présente dans le dossier cible — signal de
// base identique à l'ancien garde-fou (package.json ou .git), mais complété
// pour identifier type (site/siège), cible (docker/natif) et version
// installée, afin de pouvoir proposer une mise à jour directement plutôt
// que de simplement refuser de continuer.
import { existsSync, readFileSync } from 'node:fs'
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
