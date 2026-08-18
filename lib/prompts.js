// Prompts minimalistes, zéro dépendance (node:readline uniquement) — pas
// de sélecteur à flèches type enquirer/@poppinss/prompts (utilisé côté
// wizard du monorepo), volontairement plus simple ici : ce bootstrapper
// doit rester sans dépendance npm. Menu à flèches inspiré de
// TopCli/prompts (https://github.com/TopCli/prompts), simplifié à
// l'essentiel pour nos deux seuls usages (menus à 2 choix fixes).
import readline from 'node:readline'
import { styleText } from 'node:util'
import { SYMBOLES, gris } from './ui.js'

const CTRL_C = ''
const BACKSPACE = ''
const BACKSPACE_ALT = '\b'

export async function ask(question, { default: defaut } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const suffixe = defaut ? ` (${defaut})` : ''
  const reponse = await new Promise((resolve) => rl.question(`${question}${suffixe} : `, resolve))
  rl.close()
  const valeur = reponse.trim()
  return valeur.length > 0 ? valeur : (defaut ?? '')
}

export async function askConfirmation(question, { default: defaut = true } = {}) {
  const suffixe = defaut ? 'O/n' : 'o/N'
  const reponse = (await ask(`${question} (${suffixe})`)).toLowerCase()
  if (reponse === '') return defaut
  return reponse === 'o' || reponse === 'oui' || reponse === 'y' || reponse === 'yes'
}

// Repli non-TTY (raw mode indisponible, ex. entrée redirigée) : même
// comportement "tape un numéro" qu'avant.
async function askChoixNumerique(question, choix) {
  console.log(question)
  choix.forEach((c, i) => console.log(`  ${i + 1}. ${c.label}`))
  for (;;) {
    const reponse = await ask('Votre choix (numéro)')
    const index = Number.parseInt(reponse, 10) - 1
    if (index >= 0 && index < choix.length) return choix[index].value
    console.log('Choix invalide, réessayez.')
  }
}

// Menu à flèches (↑/↓ + Entrée) — lecture directe des `keypress` sur
// stdin (pas de readline.Interface ici : pas d'édition de ligne à
// gérer, juste un index actif qu'on redessine).
export async function askChoix(question, choix) {
  if (!process.stdin.isTTY) return askChoixNumerique(question, choix)

  console.log(question)
  let index = 0
  const stdin = process.stdin

  const dessinerLigne = (i) => {
    readline.clearLine(process.stdout, 0)
    readline.cursorTo(process.stdout, 0)
    const selectionne = i === index
    const pointeur = selectionne ? `${SYMBOLES.Pointeur} ` : '  '
    const label = selectionne ? styleText('bold', choix[i].label) : gris(choix[i].label)
    process.stdout.write(`${pointeur}${label}\n`)
  }

  const dessiner = (premiereFois) => {
    if (!premiereFois) readline.moveCursor(process.stdout, 0, -choix.length)
    for (let i = 0; i < choix.length; i++) dessinerLigne(i)
  }

  return new Promise((resolve, reject) => {
    readline.emitKeypressEvents(stdin)
    const etaitRawMode = stdin.isRaw
    stdin.setRawMode(true)
    stdin.resume()
    process.stdout.write(SYMBOLES.MasquerCurseur)
    dessiner(true)

    const nettoyer = () => {
      stdin.setRawMode(etaitRawMode)
      stdin.pause()
      stdin.removeListener('keypress', surTouche)
      process.stdout.write(SYMBOLES.AfficherCurseur)
    }

    const surTouche = (_str, key) => {
      if (key.ctrl && key.name === 'c') {
        nettoyer()
        reject(new Error('Interrompu (Ctrl+C).'))
        return
      }
      if (key.name === 'up') {
        index = index === 0 ? choix.length - 1 : index - 1
        dessiner(false)
      } else if (key.name === 'down') {
        index = (index + 1) % choix.length
        dessiner(false)
      } else if (key.name === 'return') {
        nettoyer()
        resolve(choix[index].value)
      }
    }

    stdin.on('keypress', surTouche)
  })
}

// Séquences d'échappement ANSI (flèches, Origine/Fin, Suppr, touches de
// fonction...) — CSI (`ESC [ ... lettre`) et SS3 (`ESC O lettre`). On les
// retire du chunk *avant* la boucle caractère par caractère plutôt que de
// tenter de les gérer (le champ n'a pas besoin d'édition en milieu de
// ligne) : sans ça leurs octets s'ajoutaient un par un à `saisie`,
// corrompant silencieusement le jeton.
const SEQUENCE_ECHAPPEMENT = /\x1b(?:\[[0-9;]*[A-Za-z~]|O[A-Za-z])/g

// Saisie masquée (jeton d'accès) — bascule stdin en mode raw, intercepte
// chaque touche et affiche « * » à la place du caractère réel. Repli sans
// masquage si stdin n'est pas un vrai TTY (ex. entrée redirigée) : mieux
// vaut lire en clair que planter sur setRawMode indisponible.
//
// Rendu délibérément le plus simple possible (écriture linéaire, pas de
// repositionnement de curseur) : une version basée sur
// readline.Interface + redessin complet de la ligne à chaque frappe a
// été essayée puis abandonnée — dans certains terminaux (rafale de
// `keypress` lors d'un collage), les appels `cursorTo`/`clearLine` ne
// suffisaient pas à empêcher chaque redessin de laisser sa propre ligne
// au lieu d'écraser la précédente. Cette version-ci ne fait jamais de
// repositionnement de curseur — seulement des écritures linéaires
// (`*` en avançant, `\b \b` en reculant) — donc rien à désynchroniser.
export function askMasque(question) {
  if (!process.stdin.isTTY) return ask(question)

  return new Promise((resolve, reject) => {
    process.stdout.write(`${question} : `)
    const stdin = process.stdin
    const etaitRawMode = stdin.isRaw
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    let saisie = ''
    const nettoyer = () => {
      stdin.setRawMode(etaitRawMode)
      stdin.pause()
      stdin.removeListener('data', surDonnee)
    }
    // Un jeton d'accès (40+ caractères aléatoires) se colle, il ne se tape
    // jamais caractère par caractère — en mode raw, un collage délivre tout
    // le texte en un seul événement `data`, pas un événement par caractère.
    // Traiter le chunk entier comme un caractère unique laissait passer un
    // \r/\n résiduel du presse-papiers directement dans le jeton (corrompant
    // ensuite l'en-tête Authorization). On itère donc caractère par
    // caractère à l'intérieur de chaque chunk reçu.
    const surDonnee = (chunkBrut) => {
      const chunk = chunkBrut.replace(SEQUENCE_ECHAPPEMENT, '')
      for (const char of chunk) {
        if (char === CTRL_C) {
          nettoyer()
          process.stdout.write('\n')
          reject(new Error('Interrompu (Ctrl+C).'))
          return
        }
        if (char === '\r' || char === '\n') {
          nettoyer()
          process.stdout.write('\n')
          resolve(saisie.trim())
          return
        }
        if (char === BACKSPACE || char === BACKSPACE_ALT) {
          if (saisie.length > 0) {
            saisie = saisie.slice(0, -1)
            process.stdout.write('\b \b')
          }
          continue
        }
        saisie += char
        process.stdout.write('*')
      }
    }
    stdin.on('data', surDonnee)
  })
}
