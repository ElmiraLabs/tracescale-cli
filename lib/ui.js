// Symboles et couleurs partagés (spinner, menus, bannière) — zéro
// dépendance : coloration via `node:util.styleText` (natif depuis
// Node 20.12, cf. engines >=20 de ce package), pas de chalk.
import { styleText } from 'node:util'

// Repli ASCII pour les consoles qui ne rendent pas l'unicode
// correctement (cmd.exe historique). Détection reprise de
// https://github.com/sindresorhus/is-unicode-supported (même logique
// que TopCli/prompts).
export function unicodeSupporte() {
  if (process.platform !== 'win32') {
    return process.env.TERM !== 'linux'
  }
  return Boolean(
    process.env.WT_SESSION ||
      process.env.TERMINUS_SUBLIME ||
      process.env.ConEmuTask === '{cmd::Cmder}' ||
      process.env.TERM_PROGRAM === 'Terminus-Sublime' ||
      process.env.TERM_PROGRAM === 'vscode' ||
      process.env.TERM === 'xterm-256color' ||
      process.env.TERM === 'alacritty'
  )
}

const SYMBOLES_UNICODE = { tick: '✔', cross: '✖', pointeur: '›', actif: '●', inactif: '○' }
const SYMBOLES_ASCII = { tick: '√', cross: '×', pointeur: '>', actif: '(+)', inactif: '(-)' }
const brut = unicodeSupporte() || process.env.CI ? SYMBOLES_UNICODE : SYMBOLES_ASCII

export const SYMBOLES = {
  Tick: styleText(['green', 'bold'], brut.tick),
  Cross: styleText(['red', 'bold'], brut.cross),
  Pointeur: styleText('cyan', brut.pointeur),
  Actif: styleText('cyan', brut.actif),
  Inactif: styleText('gray', brut.inactif),
  MasquerCurseur: '\x1B[?25l',
  AfficherCurseur: '\x1B[?25h',
}

export function gris(texte) {
  return styleText('gray', texte)
}

export function cyanGras(texte) {
  return styleText(['cyan', 'bold'], texte)
}

export function blancGras(texte) {
  // "Noir" littéral (styleText('black', ...)) serait souvent invisible
  // sur un terminal à fond sombre (couleur par défaut de la plupart des
  // terminaux) — blanc/gris clair reste lisible dans les deux thèmes.
  return styleText(['white', 'bold'], texte)
}

export function vertGras(texte) {
  return styleText(['green', 'bold'], texte)
}
