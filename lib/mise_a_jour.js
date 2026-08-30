// Décisions pures (testées) de la mise à jour d'une installation existante —
// tracescale#1223 : le natif (Site ou Siège) est délégué à
// `instance:installer --cible=natif --mettre-a-jour --version=<tag>` ;
// Docker reste limité au Site (IMAGE_TAG écrit dans deploy/site/.env).

// → 'natif' | 'site-docker' | null (combinaison non prise en charge).
export function deciderMiseAJour(existante) {
  if (!existante) return null
  const { type, cible } = existante
  if (cible === 'natif' && (type === 'site' || type === 'siege')) return 'natif'
  if (cible === 'docker' && type === 'site') return 'site-docker'
  return null
}

// Argv de `node …` — le jeton n'y figure jamais (transmis par `env`, #10).
export function argumentsInstanceInstaller(mode, type, tag) {
  if (mode === 'natif') {
    return [
      'ace',
      'instance:installer',
      `--type=${type}`,
      '--cible=natif',
      '--mettre-a-jour',
      `--version=${tag}`,
    ]
  }
  return ['ace', 'instance:installer', '--type=site', '--mettre-a-jour']
}
