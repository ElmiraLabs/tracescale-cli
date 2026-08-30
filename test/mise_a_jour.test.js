// Tests `node --test` de lib/mise_a_jour.js (tracescale#1223).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { argumentsInstanceInstaller, deciderMiseAJour } from '../lib/mise_a_jour.js'

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
