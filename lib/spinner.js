// Spinner terminal minimaliste, zéro dépendance — inspiré de
// TopCli/Spinner (https://github.com/TopCli/Spinner), simplifié : un
// seul spinner actif à la fois (cette CLI n'en lance jamais deux en
// parallèle), une seule frame "dots" inlinée en dur (pas besoin du
// package `cli-spinners`).
import readline from 'node:readline'
import { styleText } from 'node:util'
import { SYMBOLES } from './ui.js'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const INTERVAL_MS = 80

export class Spinner {
  #texte = ''
  #frameIndex = 0
  #interval = null
  #actif = false
  #tty = process.stdout.isTTY

  start(texte) {
    this.#texte = texte
    this.#actif = true
    if (!this.#tty) {
      console.log(texte)
      return this
    }
    process.stdout.write(SYMBOLES.MasquerCurseur)
    this.#frameIndex = 0
    this.#dessiner()
    this.#interval = setInterval(() => {
      this.#frameIndex = (this.#frameIndex + 1) % FRAMES.length
      this.#dessiner()
    }, INTERVAL_MS)
    return this
  }

  #dessiner(symbole) {
    readline.clearLine(process.stdout, 0)
    readline.cursorTo(process.stdout, 0)
    const frame = symbole ?? styleText('cyan', FRAMES[this.#frameIndex])
    process.stdout.write(`${frame} ${this.#texte}`)
  }

  #arreter(symbole, texteFinal) {
    if (typeof texteFinal === 'string') this.#texte = texteFinal
    this.#actif = false
    if (!this.#tty) {
      if (texteFinal) console.log(texteFinal)
      return
    }
    if (this.#interval) clearInterval(this.#interval)
    this.#interval = null
    this.#dessiner(symbole)
    process.stdout.write(`\n${SYMBOLES.AfficherCurseur}`)
  }

  succeed(texte) {
    if (this.#actif) this.#arreter(SYMBOLES.Tick, texte)
    return this
  }

  failed(texte) {
    if (this.#actif) this.#arreter(SYMBOLES.Cross, texte)
    return this
  }

  stop() {
    if (this.#actif) this.#arreter()
    return this
  }
}

// Enveloppe une opération asynchrone : démarre le spinner, exécute
// `fnAsync`, affiche succès/échec automatiquement (succes/echec sont
// des formateurs optionnels — reçoivent respectivement le résultat et
// l'erreur), puis repropage l'erreur le cas échéant.
export async function avecSpinner(texte, fnAsync, { succes, echec } = {}) {
  const spinner = new Spinner().start(texte)
  try {
    const resultat = await fnAsync(spinner)
    spinner.succeed(succes ? succes(resultat) : undefined)
    return resultat
  } catch (err) {
    spinner.failed(echec ? echec(err) : `Échec : ${err.message}`)
    throw err
  }
}
