// Tests `node --test` de lib/arguments.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lireArgs } from '../lib/arguments.js'

test('options à valeur : --cle=valeur, `=` conservé dans la valeur, tirets internes', () => {
  assert.deepEqual(lireArgs(['--dir=C:\\dev', '--type=site', '--purger-donnees=x', '--a-b=1']), {
    'dir': 'C:\\dev',
    'type': 'site',
    'purger-donnees': 'x',
    'a-b': '1',
  })
  assert.deepEqual(lireArgs(['--token=ghp_a=b']), { token: 'ghp_a=b' })
})

test('drapeaux nus : seulement la liste blanche → true ; une option à valeur nue est ignorée', () => {
  assert.deepEqual(lireArgs(['--desinstaller', '--purger-donnees']), {
    'desinstaller': true,
    'purger-donnees': true,
  })
  assert.deepEqual(lireArgs(['--tout', '--lister', '--supprimer-images']), {
    'tout': true,
    'lister': true,
    'supprimer-images': true,
  })
  assert.deepEqual(lireArgs(['--dir', '--token', '--type']), {})
  assert.deepEqual(lireArgs(['--inconnu']), {})
})

test('arguments hors motif ignorés', () => {
  assert.deepEqual(lireArgs(['install', '-d', '--MAJ=1', '--=x']), {})
})
