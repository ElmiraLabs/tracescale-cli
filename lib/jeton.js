// #10 / tracescale#1224 : résolution du jeton d'accès au dépôt tracescale —
// même nom de variable et même ordre que côté dépôt privé
// (apps/api/app/modules/installation/jeton_release_github.ts) :
//   1. variable d'environnement TRACESCALE_GITHUB_TOKEN (jamais GITHUB_TOKEN,
//      pour ne pas capturer par accident le jeton d'un runner CI) ;
//   2. `--token=` encore accepté avec avertissement, retiré plus tard ;
//   3. sinon `null` → l'appelant demande une saisie masquée.
// Fonctions pures (testées) : ne lisent ni process.env ni process.argv.

export const NOM_VARIABLE_JETON = 'TRACESCALE_GITHUB_TOKEN'

export const AVERTISSEMENT_JETON_ARGUMENT = `Avertissement : --token expose le jeton dans la liste des processus et l'historique du shell — préférer la variable ${NOM_VARIABLE_JETON} (ou la saisie masquée). --token sera retiré dans une prochaine version.`

// La variable prime sur l'argument : un `--token` résiduel dans un script
// devient sans effet dès que l'opérateur pose la variable.
export function resoudreJeton(argumentToken, env) {
  const depuisEnv = env[NOM_VARIABLE_JETON]?.trim()
  if (depuisEnv) return { jeton: depuisEnv, source: 'environnement' }
  const depuisArgument = argumentToken?.trim()
  if (depuisArgument) return { jeton: depuisArgument, source: 'argument' }
  return null
}

// Environnement des processus enfants (wizard, mise à jour) : le jeton y est
// posé pour que `instance:installer`/`instance:installer:gui` ne le
// redemandent pas — jamais en argument de ligne de commande. `base` n'est
// pas muté.
export function envAvecJeton(jeton, base = process.env) {
  return { ...base, [NOM_VARIABLE_JETON]: jeton }
}
