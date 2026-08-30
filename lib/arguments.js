// Analyse des arguments `--cle=valeur` / `--drapeau` — fonction pure (testée).
// Seuls les drapeaux de la liste blanche acceptent la forme nue (→ `true`) ;
// une option à valeur passée nue (`--dir`, `--token`…) est ignorée comme
// avant (repli sur la saisie interactive), jamais convertie en `true`.
// Un drapeau reçu AVEC une valeur (`--desinstaller=oui`) est conservé tel
// quel (chaîne) pour que l'appelant puisse le refuser explicitement.

export const DRAPEAUX = ['desinstaller', 'purger-donnees', 'tout', 'lister', 'supprimer-images']

export function lireArgs(argv, drapeaux = DRAPEAUX) {
  const args = {}
  for (const arg of argv) {
    const correspondance = /^--([a-z][a-z-]*)(?:=(.*))?$/.exec(arg)
    if (!correspondance) continue
    const [, cle, valeur] = correspondance
    if (valeur !== undefined) {
      args[cle] = valeur
    } else if (drapeaux.includes(cle)) {
      args[cle] = true
    }
  }
  return args
}
