#!/usr/bin/env node
// #713 (volet 2) : point d'entrée unique `npx github:ElmiraLabs/tracescale-cli`
// — première installation (clone via API GitHub, dernière release → npm
// install → lance le wizard côté dépôt privé) ET mise à jour d'une
// installation déjà présente (détectée automatiquement, délègue à `node
// ace instance:installer --mettre-a-jour` — cf. mettreAJour() plus bas).
// Aucune logique métier ici dans les deux cas, cf. README.md.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { ask, askChoix, askConfirmation, askMasque } from '../lib/prompts.js'
import { derniereRelease, telechargerEtExtraire, versionDepuisTag } from '../lib/github.js'
import { installationExistante, ecrireImageTag } from '../lib/installation_existante.js'
import { AVERTISSEMENT_JETON_ARGUMENT, envAvecJeton, resoudreJeton } from '../lib/jeton.js'
import {
  argumentsDesinstallation,
  argumentsInstanceInstaller,
  deciderDesinstallation,
  deciderMiseAJour,
} from '../lib/mise_a_jour.js'
import { avecSpinner } from '../lib/spinner.js'
import { gris, blancGras, vertGras } from '../lib/ui.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SUR_WINDOWS = process.platform === 'win32'

// Coloration via `node:util.styleText` (lib/ui.js) — pas de dépendance
// type chalk/gradient-string, cohérent avec le choix « zéro dépendance »
// de ce dépôt — désactivée si la sortie n'est pas un TTY (redirection
// vers un fichier/pipe) pour ne jamais polluer une sortie scriptée avec
// des codes d'échappement.
function afficherBanniere() {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))
  if (!process.stdout.isTTY) {
    console.log(`\nTraceScale CLI v${pkg.version}\n`)
    return
  }
  const separateur = '━'.repeat(24)
  console.log(`\n${gris(separateur)}`)
  console.log(`${blancGras('Trace')}${vertGras('Scale')} CLI ${gris(`v${pkg.version}`)}`)
  console.log(`${gris(separateur)}\n`)
}

// `--cle=valeur` → chaîne ; `--drapeau` seul → true (`--desinstaller`,
// `--purger-donnees`). Les tirets internes sont conservés dans la clé.
function lireArgs() {
  const args = {}
  for (const arg of process.argv.slice(2)) {
    const correspondance = /^--([a-z][a-z-]*)(?:=(.*))?$/.exec(arg)
    if (correspondance) args[correspondance[1]] = correspondance[2] ?? true
  }
  return args
}

// tracescale-cli `--desinstaller` (registre TraceScale 2026-08-30) : délègue
// à l'installateur DÉJÀ PRÉSENT dans le checkout — aucun jeton, aucun
// téléchargement. `--purger-donnees` n'est transmis que s'il est donné ;
// les confirmations propres à l'installateur (purge irréversible) restent.
async function desinstaller(args) {
  const dossierBrut = args.dir ?? (await ask("Répertoire de l'installation", { default: './tracescale' }))
  const dossierCible = resolve(process.cwd(), dossierBrut)
  const existante = installationExistante(dossierCible)
  const cible = deciderDesinstallation(existante)
  if (!cible) {
    console.error(
      `${dossierCible} ne contient pas d'installation TraceScale identifiable (type et cible introuvables) — rien à désinstaller.`
    )
    process.exitCode = 1
    return
  }
  const purger = args['purger-donnees'] === true
  const description = `${cible.type}/${cible.cible}${existante.version ? ` ${existante.version}` : ''}`
  console.log(
    `\nInstallation détectée : ${description} dans ${dossierCible}.` +
      (purger
        ? '\nAVEC --purger-donnees : base de données, certificats et données seront SUPPRIMÉS (irréversible).'
        : '\nLes données (base, certificats) sont conservées ; seuls les services et conteneurs sont retirés.')
  )
  const continuer = await askConfirmation('Désinstaller maintenant ?', { default: false })
  if (!continuer) {
    console.log('Désinstallation annulée.')
    return
  }
  console.log('\nLancement de la désinstallation...\n')
  const resultat = spawnSync('node', argumentsDesinstallation(cible.type, cible.cible, purger), {
    cwd: join(dossierCible, 'apps/api'),
    stdio: 'inherit',
    shell: SUR_WINDOWS,
  })
  process.exitCode = resultat.status ?? 1
}

// Une installation détectée dans dossierCible ne redemande rien (type,
// cible, jeton déjà connus) : récupère la dernière release, compare à la
// version déjà en place, puis délègue à `node ace instance:installer
// --mettre-a-jour` (dépôt privé) — jamais de logique de mise à jour ici,
// seulement la détection + la délégation (cf. README.md, « aucun code
// métier »).
async function mettreAJour(dossierCible, existante, jeton) {
  // tracescale#1223 : le natif (Site et Siège) est délégué à
  // `--cible=natif --mettre-a-jour --version=<tag>` ; Docker reste limité au
  // Site (IMAGE_TAG écrit dans deploy/site/.env par ecrireImageTag).
  const mode = deciderMiseAJour(existante)
  const natif = mode === 'natif'
  if (mode === null) {
    const description = existante.type
      ? `${existante.type}/${existante.cible ?? 'inconnue'}`
      : 'de type indéterminé'
    console.error(
      `${dossierCible} contient déjà une installation ${description} — la mise à jour automatique prend en charge Site + Docker et les installations natives (Site ou Siège). ` +
        'Utiliser directement `node ace instance:installer` depuis ce dossier (voir la documentation du dépôt principal).'
    )
    process.exitCode = 1
    return
  }

  console.log()
  let release
  try {
    release = await avecSpinner(
      'Vérification de la dernière version publiée...',
      () => derniereRelease(jeton),
      { succes: (r) => `Dernière version publiée : ${r.tag}` }
    )
  } catch {
    process.exitCode = 1
    return
  }

  const versionCible = versionDepuisTag(release.tag)
  if (existante.version && versionCible === existante.version) {
    console.log(`\n${dossierCible} est déjà à jour (version ${existante.version}).`)
    return
  }

  console.log(
    `\nVersion actuelle : ${existante.version ?? 'inconnue'} → nouvelle version disponible : ${versionCible}`
  )
  const continuer = await askConfirmation('Mettre à jour maintenant ?')
  if (!continuer) {
    console.log('Mise à jour annulée.')
    return
  }

  // #830 : IMAGE_TAG (deploy/site/.env) fait foi côté --mettre-a-jour — on
  // écrit ici le tag qu'on vient de proposer et de faire confirmer, pour
  // que les deux mécanismes restent cohérents (jamais de version
  // différente entre ce qui a été annoncé et ce qui est réellement
  // installé).
  // Natif : le checkout est d'abord rafraîchi (archive source vérifiée +
  // npm install) pour disposer de l'installateur de la version cible — une
  // installation antérieure à tracescale#1223 n'a pas encore de
  // `--cible=natif --mettre-a-jour`. Ni la séquence côté dépôt privé ni ce
  // CLI (installationExistante) ne lisent la version en cours dans le
  // checkout — tous deux lisent build/package.json (ce qui tourne) : cet
  // amorçage ne les trompe pas. Doublon assumé : la séquence retélécharge
  // l'archive et refait `npm install` (elle ne peut pas supposer un checkout
  // déjà frais) — coût en temps/bande passante accepté, pas en sûreté.
  if (natif) {
    try {
      await avecSpinner(
        "Mise à jour de l'installateur (checkout)...",
        () => telechargerEtExtraire(release, jeton, dossierCible),
        { succes: () => 'Installateur à jour.' }
      )
    } catch {
      process.exitCode = 1
      return
    }
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
  }
  // Pas d'IMAGE_TAG en natif : la version cible est passée à la commande
  // (tracescale#1223) — même tag que celui annoncé et confirmé ci-dessus.
  const argsInstaller = argumentsInstanceInstaller(mode, existante.type, release.tag)
  if (!natif) ecrireImageTag(dossierCible, release.tag)

  console.log('\nLancement de la mise à jour...\n')
  // #10 / tracescale#1224 : jeton transmis par l'environnement, jamais en
  // argument (visible dans `ps` le temps de la mise à jour).
  const resultat = spawnSync('node', argsInstaller, {
    cwd: join(dossierCible, 'apps/api'),
    stdio: 'inherit',
    shell: SUR_WINDOWS,
    env: envAvecJeton(jeton),
  })
  process.exitCode = resultat.status ?? 1
}

async function main() {
  afficherBanniere()
  const args = lireArgs()

  // Désinstallation : ni jeton ni téléchargement — traitée avant tout.
  if (args.desinstaller === true) {
    await desinstaller(args)
    return
  }

  // #10 / tracescale#1224 : variable d'environnement d'abord (jamais dans
  // `ps` ni l'historique), puis saisie masquée ; `--token=` encore accepté
  // avec avertissement, retiré dans une prochaine version (lib/jeton.js).
  const resolu = resoudreJeton(args.token, process.env)
  if (resolu?.source === 'argument') console.error(AVERTISSEMENT_JETON_ARGUMENT)
  const jeton = resolu?.jeton ?? (await askMasque("Jeton d'accès au dépôt tracescale")).trim()
  if (!jeton.trim()) {
    console.error('Jeton requis — impossible de continuer.')
    process.exitCode = 1
    return
  }

  const dossierBrut = args.dir ?? (await ask("Répertoire d'installation", { default: './tracescale' }))
  const dossierCible = resolve(process.cwd(), dossierBrut)

  const existante = installationExistante(dossierCible)
  if (existante) {
    await mettreAJour(dossierCible, existante, jeton)
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

  console.log()
  let release
  try {
    release = await avecSpinner(
      'Récupération de la dernière version de TraceScale...',
      () => derniereRelease(jeton),
      { succes: (r) => `Version trouvée : ${r.tag}` }
    )
  } catch {
    process.exitCode = 1
    return
  }

  try {
    await avecSpinner(
      `Téléchargement dans ${dossierCible}...`,
      // #14 : archive source de la CI, vérifiée contre SHA256SUMS avant extraction.
      () => telechargerEtExtraire(release, jeton, dossierCible),
      { succes: () => 'Téléchargement vérifié et extrait.' }
    )
  } catch {
    process.exitCode = 1
    return
  }

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
      env: envAvecJeton(jeton),
    })
    process.exitCode = resultat.status ?? 1
  } else {
    // Bare-metal (Site et Siège) : GUI disponible pour les deux (#632/#738)
    // — même garde-fou d'environnement que la branche Docker
    // (installer:gui:${type}:natif chaîne assurer_env_dev.js en amont,
    // apps/api/package.json).
    const resultat = spawnSync('npm', ['run', `install:${type}:natif`], {
      cwd: dossierCible,
      stdio: 'inherit',
      shell: SUR_WINDOWS,
      env: envAvecJeton(jeton),
    })
    process.exitCode = resultat.status ?? 1
  }
}

main().catch((err) => {
  console.error(`Erreur inattendue : ${err.message}`)
  process.exitCode = 1
})
