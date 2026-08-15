// Prompts minimalistes, zéro dépendance (node:readline uniquement) — pas
// de sélecteur à flèches type enquirer/@poppinss/prompts (utilisé côté
// wizard du monorepo), volontairement plus simple ici : ce bootstrapper
// doit rester sans dépendance npm.
import readline from 'node:readline'

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

export async function askChoix(question, choix) {
  console.log(question)
  choix.forEach((c, i) => console.log(`  ${i + 1}. ${c.label}`))
  for (;;) {
    const reponse = await ask('Votre choix (numéro)')
    const index = Number.parseInt(reponse, 10) - 1
    if (index >= 0 && index < choix.length) return choix[index].value
    console.log('Choix invalide, réessayez.')
  }
}

// Saisie masquée (jeton d'accès) — bascule stdin en mode raw, intercepte
// chaque touche et affiche « * » à la place du caractère réel. Repli sans
// masquage si stdin n'est pas un vrai TTY (ex. entrée redirigée) : mieux
// vaut lire en clair que planter sur setRawMode indisponible.
export function askMasque(question) {
  if (!process.stdin.isTTY) return ask(question)

  return new Promise((resolve, reject) => {
    process.stdout.write(`${question} : `)
    const stdin = process.stdin
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    let saisie = ''
    const nettoyer = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', surDonnee)
    }
    const surDonnee = (char) => {
      if (char === CTRL_C) {
        nettoyer()
        process.stdout.write('\n')
        reject(new Error('Interrompu (Ctrl+C).'))
        return
      }
      if (char === '\r' || char === '\n') {
        nettoyer()
        process.stdout.write('\n')
        resolve(saisie)
        return
      }
      if (char === BACKSPACE || char === BACKSPACE_ALT) {
        if (saisie.length > 0) {
          saisie = saisie.slice(0, -1)
          process.stdout.write('\b \b')
        }
        return
      }
      saisie += char
      process.stdout.write('*')
    }
    stdin.on('data', surDonnee)
  })
}
