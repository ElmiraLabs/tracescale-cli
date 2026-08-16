#!/usr/bin/env node
// #713 (volet 2) : point d'entrée unique `npx github:ElmiraLabs/tracescale-cli`
// pour provisionner une instance TraceScale sur une machine cliente fraîche
// — clone (via API GitHub, dernière release) → npm install → lance le
// wizard d'installation déjà existant côté dépôt privé (aucune logique
// métier ici, cf. README.md).
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { ask, askChoix, askMasque } from '../lib/prompts.js'
import { derniereRelease, telechargerEtExtraire } from '../lib/github.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SUR_WINDOWS = process.platform === 'win32'

// Couleur ANSI faite main (pas de dépendance type chalk/gradient-string,
// cohérent avec le choix « zéro dépendance » de ce dépôt) — désactivée si
// la sortie n'est pas un TTY (redirection vers un fichier/pipe) pour ne
// jamais polluer une sortie scriptée avec des codes d'échappement.
function afficherBanniere() {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))
  if (!process.stdout.isTTY) {
    console.log(`\nTraceScale CLI v${pkg.version}\n`)
    return
  }
  const CYAN_GRAS = '[1m[36m'
  const GRIS = '[2m'
  const RESET = '[0m'
  const separateur = '━'.repeat(24)
  console.log(`\n${GRIS}${separateur}${RESET}`)
  console.log(`${CYAN_GRAS}TraceScale CLI${RESET} ${GRIS}v${pkg.version}${RESET}`)
  console.log(`${GRIS}${separateur}${RESET}\n`)
}

function lireArgs() {
  const args = {}
  for (const arg of process.argv.slice(2)) {
    const correspondance = /^--([a-z]+)=(.*)$/.exec(arg)
    if (correspondance) args[correspondance[1]] = correspondance[2]
  }
  return args
}

async function main() {
  afficherBanniere()
  const args = lireArgs()

  const jeton = args.token ?? (await askMasque("Jeton d'accès au dépôt tracescale"))
  if (!jeton.trim()) {
    console.error('Jeton requis — impossible de continuer.')
    process.exitCode = 1
    return
  }

  const dossierBrut = args.dir ?? (await ask("Répertoire d'installation", { default: './tracescale' }))
  const dossierCible = resolve(process.cwd(), dossierBrut)
  if (existsSync(join(dossierCible, 'package.json')) || existsSync(join(dossierCible, '.git'))) {
    console.error(
      `${dossierCible} existe déjà et semble contenir une installation — ce script ne gère pas la mise à jour. ` +
        'Utiliser directement `node ace instance:installer` depuis ce dossier pour un renouvellement ou une réinstallation.'
    )
    process.exitCode = 1
    return
  }

  const type =
    args.type ??
    (await askChoix("Type d'instance à installer :", [
      { value: 'siege', label: 'Siège' },
      { value: 'site', label: 'Site' },
    ]))
  if (type !== 'siege' && type !== 'site') {
    console.error(`Type inconnu « ${type} ». Valeurs possibles : siege, site`)
    process.exitCode = 1
    return
  }

  const cible =
    args.cible ??
    (await askChoix("Cible d'installation :", [
      { value: 'docker', label: 'Docker (recommandé)' },
      { value: 'natif', label: 'Bare-metal, sans Docker' },
    ]))
  if (cible !== 'docker' && cible !== 'natif') {
    console.error(`Cible inconnue « ${cible} ». Valeurs possibles : docker, natif`)
    process.exitCode = 1
    return
  }

  console.log('\nRécupération de la dernière version de TraceScale...')
  let release
  try {
    release = await derniereRelease(jeton)
  } catch (err) {
    console.error(`Échec : ${err.message}`)
    process.exitCode = 1
    return
  }
  console.log(`Version trouvée : ${release.tag}`)

  console.log(`Téléchargement dans ${dossierCible}...`)
  try {
    await telechargerEtExtraire(release.tarballUrl, jeton, dossierCible)
  } catch (err) {
    console.error(`Échec : ${err.message}`)
    process.exitCode = 1
    return
  }
  console.log('Téléchargement terminé.')

  console.log('\nInstallation des dépendances (npm install)...')
  const resultatInstall = spawnSync('npm', ['install'], {
    cwd: dossierCible,
    stdio: 'inherit',
    shell: SUR_WINDOWS,
  })
  if (resultatInstall.status !== 0) {
    console.error('npm install a échoué — voir le détail ci-dessus.')
    process.exitCode = 1
    return
  }

  console.log(`\nLancement de l'assistant d'installation (${type}, ${cible})...\n`)
  if (cible === 'docker') {
    const resultat = spawnSync('npm', ['run', `install:${type}:docker`], {
      cwd: dossierCible,
      stdio: 'inherit',
      shell: SUR_WINDOWS,
    })
    process.exitCode = resultat.status ?? 1
  } else if (type === 'site') {
    // Bare-metal Site : GUI disponible (extension #632) — même garde-fou
    // d'environnement que la branche Docker (installer:gui:site:natif
    // chaîne assurer_env_dev.js en amont, apps/api/package.json).
    const resultat = spawnSync('npm', ['run', 'install:site:natif'], {
      cwd: dossierCible,
      stdio: 'inherit',
      shell: SUR_WINDOWS,
    })
    process.exitCode = resultat.status ?? 1
  } else {
    // Bare-metal Siège : pas encore de GUI (choix domaine public/CA locale
    // natif non tranché, #632) — reste sur le CLI classique. `node ace`
    // valide toutes les variables d'environnement dès son démarrage, avant
    // même le code de instance:installer — sur ce clone tout juste
    // installé, apps/api/.env n'existe pas encore et planterait
    // immédiatement. `installer:cli` (apps/api/package.json) génère
    // d'abord un .env de dev factice si besoin, même garde-fou que les
    // branches ci-dessus.
    const resultat = spawnSync(
      'npm',
      ['run', 'installer:cli', '--workspace=apps/api', '--', `--type=${type}`, '--cible=natif'],
      {
        cwd: dossierCible,
        stdio: 'inherit',
        shell: SUR_WINDOWS,
      }
    )
    process.exitCode = resultat.status ?? 1
  }
}

main().catch((err) => {
  console.error(`Erreur inattendue : ${err.message}`)
  process.exitCode = 1
})
