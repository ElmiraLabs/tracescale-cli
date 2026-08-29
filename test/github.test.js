// Tests `node --test` (zéro dépendance, comme le reste du dépôt) des
// fonctions pures de lib/github.js — #14 : vérification d'empreinte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  analyserManifeste,
  empreinteFichierSha256,
  verifierEmpreinteFichier,
  versionDepuisTag,
  NOM_ASSET_SOURCE,
} from '../lib/github.js'

test('versionDepuisTag : tag release-please → semver nu, tag inconnu conservé', () => {
  assert.equal(versionDepuisTag('tracescale-v0.14.0'), '0.14.0')
  assert.equal(versionDepuisTag('autre-format'), 'autre-format')
})

test('analyserManifeste : format sha256sum, commentaires ignorés, empreinte en minuscules', () => {
  const hex = 'A'.repeat(64)
  const manifeste = analyserManifeste(
    `# commentaire\n\n${hex}  tracescale-source.tar.gz\n${'b'.repeat(64)} *SHA256SUMS-bis\n`
  )
  assert.equal(manifeste.get('tracescale-source.tar.gz'), 'a'.repeat(64))
  assert.equal(manifeste.get('SHA256SUMS-bis'), 'b'.repeat(64))
})

test('analyserManifeste : une ligne non conforme est une erreur, pas un manifeste incomplet', () => {
  assert.throws(() => analyserManifeste('pas-une-empreinte  fichier'), /illisible/)
})

test('verifierEmpreinteFichier : conforme → passe ; divergente ou absente → fichier supprimé', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'tracescale-cli-'))
  const chemin = join(dossier, 'archive.tar.gz')
  const contenu = Buffer.from('contenu de test')
  writeFileSync(chemin, contenu)
  const attendue = createHash('sha256').update(contenu).digest('hex')
  assert.equal(await empreinteFichierSha256(chemin), attendue)

  await verifierEmpreinteFichier(chemin, NOM_ASSET_SOURCE, new Map([[NOM_ASSET_SOURCE, attendue]]))
  assert.ok(existsSync(chemin), 'fichier conforme conservé')

  await assert.rejects(
    () => verifierEmpreinteFichier(chemin, NOM_ASSET_SOURCE, new Map([[NOM_ASSET_SOURCE, 'f'.repeat(64)]])),
    /invalide/
  )
  assert.ok(!existsSync(chemin), 'fichier divergent supprimé')

  writeFileSync(chemin, contenu)
  await assert.rejects(() => verifierEmpreinteFichier(chemin, NOM_ASSET_SOURCE, new Map()), /n'apparaît pas/)
  assert.ok(!existsSync(chemin), 'fichier hors manifeste supprimé')
})
