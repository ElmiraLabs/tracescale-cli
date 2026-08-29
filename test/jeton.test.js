// Tests `node --test` de lib/jeton.js (#10 / tracescale#1224).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NOM_VARIABLE_JETON, envAvecJeton, resoudreJeton } from '../lib/jeton.js'

test('la variable d’environnement prime sur --token, valeurs nettoyées', () => {
  assert.deepEqual(resoudreJeton('ghp_argument', { [NOM_VARIABLE_JETON]: ' ghp_env ' }), {
    jeton: 'ghp_env',
    source: 'environnement',
  })
})

test('--token accepté (source « argument ») quand la variable est absente ou blanche', () => {
  assert.deepEqual(resoudreJeton(' ghp_argument ', {}), { jeton: 'ghp_argument', source: 'argument' })
  assert.deepEqual(resoudreJeton('ghp_argument', { [NOM_VARIABLE_JETON]: '  ' }), {
    jeton: 'ghp_argument',
    source: 'argument',
  })
})

test('rien de fourni → null ; GITHUB_TOKEN d’un runner CI est ignoré', () => {
  assert.equal(resoudreJeton(undefined, {}), null)
  assert.equal(resoudreJeton('  ', { GITHUB_TOKEN: 'jeton-ci' }), null)
})

test('envAvecJeton pose la clé sans muter la base', () => {
  const base = { PATH: '/usr/bin' }
  const env = envAvecJeton('ghp_x', base)
  assert.deepEqual(env, { PATH: '/usr/bin', [NOM_VARIABLE_JETON]: 'ghp_x' })
  assert.deepEqual(base, { PATH: '/usr/bin' })
})
