// Tests `node --test` de lib/mise_a_jour.js (tracescale#1223).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  argumentsDesinstallation,
  argumentsInstanceInstaller,
  deciderDesinstallation,
  deciderMiseAJour,
} from '../lib/mise_a_jour.js'

test('deciderMiseAJour : natif Site/Siège, Site Docker ; refus sinon', () => {
  assert.equal(deciderMiseAJour({ type: 'site', cible: 'natif', version: '0.32.0' }), 'natif')
  assert.equal(deciderMiseAJour({ type: 'siege', cible: 'natif', version: null }), 'natif')
  assert.equal(deciderMiseAJour({ type: 'site', cible: 'docker', version: '0.35.0' }), 'site-docker')
  assert.equal(deciderMiseAJour({ type: 'siege', cible: 'docker', version: '0.35.0' }), null)
  assert.equal(deciderMiseAJour({ type: null, cible: 'natif', version: null }), null)
  assert.equal(deciderMiseAJour({ type: null, cible: null, version: '0.1.0' }), null)
  assert.equal(deciderMiseAJour(null), null)
})

test('argumentsInstanceInstaller : natif porte type, cible et version ; Docker inchangé ; jamais de jeton', () => {
  assert.deepEqual(argumentsInstanceInstaller('natif', 'siege', 'tracescale-v0.37.0'), [
    'ace',
    'instance:installer',
    '--type=siege',
    '--cible=natif',
    '--mettre-a-jour',
    '--version=tracescale-v0.37.0',
  ])
  assert.deepEqual(argumentsInstanceInstaller('site-docker', 'site', 'tracescale-v0.37.0'), [
    'ace',
    'instance:installer',
    '--type=site',
    '--mettre-a-jour',
  ])
  for (const mode of ['natif', 'site-docker']) {
    assert.ok(!argumentsInstanceInstaller(mode, 'site', 't').some((a) => a.includes('token')))
  }
})

test('deciderDesinstallation : toute combinaison identifiée ; refus si type ou cible inconnus', () => {
  assert.deepEqual(deciderDesinstallation({ type: 'siege', cible: 'docker', version: '0.35.0' }), {
    type: 'siege',
    cible: 'docker',
  })
  assert.deepEqual(deciderDesinstallation({ type: 'site', cible: 'natif', version: null }), {
    type: 'site',
    cible: 'natif',
  })
  assert.equal(deciderDesinstallation({ type: null, cible: 'natif', version: null }), null)
  assert.equal(deciderDesinstallation({ type: 'site', cible: null, version: '0.1.0' }), null)
  assert.equal(deciderDesinstallation(null), null)
})

test('argumentsDesinstallation : --purger-donnees seulement si demandé, jamais de jeton', () => {
  assert.deepEqual(argumentsDesinstallation('site', 'natif', false), [
    'ace',
    'instance:installer',
    '--type=site',
    '--cible=natif',
    '--desinstaller',
  ])
  assert.deepEqual(argumentsDesinstallation('siege', 'docker', true), [
    'ace',
    'instance:installer',
    '--type=siege',
    '--cible=docker',
    '--desinstaller',
    '--purger-donnees',
  ])
  assert.ok(!argumentsDesinstallation('site', 'docker', undefined).includes('--purger-donnees'))
})
