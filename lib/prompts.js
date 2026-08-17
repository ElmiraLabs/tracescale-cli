// Prompts minimalistes, zéro dépendance (node:readline uniquement) — pas
// de sélecteur à flèches type enquirer/@poppinss/prompts (utilisé côté
// wizard du monorepo), volontairement plus simple ici : ce bootstrapper
// doit rester sans dépendance npm. Techniques (menu à flèches, saisie
// masquée via readline plutôt que parsing manuel) inspirées de
// TopCli/prompts (https://github.com/TopCli/prompts), simplifiées à
// l'essentiel pour nos deux seuls usages (menus à 2 choix fixes, un
// champ masqué).
import readline from 'node:readline'
import { Writable } from 'node:stream'
import { styleText } from 'node:util'
import { SYMBOLES, gris } from './ui.js'

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

// Saisie masquée (jeton d'accès) — s'appuie sur un readline.Interface
// normal (output vers un flux muet) pour déléguer toute l'édition de
// ligne (curseur gauche/droite, retour arrière, collage) au parseur de
// touches natif de Node, qui gère déjà correctement le collage — on
// n'affiche que des « * » en reflet de la longueur/position réelles
// (`rl.line`/`rl.cursor`). Remplace l'ancien parsing manuel octet par
// octet, qui ne gérait pas les flèches gauche/droite pendant la saisie
// et avait dû être corrigé une première fois pour un bug de collage
// (cf. historique git). Repli sans masquage si stdin n'est pas un vrai
// TTY (ex. entrée redirigée).
export function askMasque(question) {
  if (!process.stdin.isTTY) return ask(question)

  return new Promise((resolve, reject) => {
    const prefixe = `${question} : `
    const sortieMuette = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    })

    const etaitRawMode = process.stdin.isRaw
    const rl = readline.createInterface({ input: process.stdin, output: sortieMuette, terminal: true })

    // `termine` : readline traite le keypress d'Entrée/Ctrl+C et déclenche
    // `nettoyer()` de façon synchrone, mais notre propre listener
    // `redessiner` — enregistré après celui de readline sur le même
    // événement — reste appelé pour ce même keypress même après
    // `removeListener` (les listeners d'un `emit()` en cours sont figés
    // au moment de l'appel). Sans ce garde-fou, chaque validation
    // déclenchait un redessin résiduel après le saut de ligne final.
    let termine = false

    const redessiner = () => {
      if (termine) return
      readline.cursorTo(process.stdout, 0)
      readline.clearLine(process.stdout, 0)
      process.stdout.write(`${prefixe}${'*'.repeat(rl.line.length)}`)
      readline.cursorTo(process.stdout, prefixe.length + rl.cursor)
    }

    const nettoyer = () => {
      termine = true
      process.stdin.removeListener('keypress', redessiner)
      rl.close()
      // Filet de sécurité explicite plutôt que de compter sur le retour
      // en mode normal de `rl.close()` — même logique défensive que
      // l'ancienne implémentation manuelle.
      process.stdin.setRawMode(etaitRawMode)
    }

    process.stdout.write(prefixe)
    process.stdin.on('keypress', redessiner)

    rl.on('SIGINT', () => {
      nettoyer()
      process.stdout.write('\n')
      reject(new Error('Interrompu (Ctrl+C).'))
    })

    rl.question('', (reponse) => {
      nettoyer()
      process.stdout.write('\n')
      resolve(reponse.trim())
    })
  })
}
