// Accès au dépôt privé ElmiraLabs/tracescale via l'API GitHub (pas `git
// clone` — évite que le jeton persiste dans un `.git/config` ou une URL de
// remote). Toujours la dernière RELEASE publiée (release-please), jamais
// `main` : un client reçoit un état publié, jamais du code en cours
// d'intégration.
//
// #14 (miroir de tracescale#1172) : l'archive source est l'asset
// `tracescale-source.tar.gz` produit par la CI (`git archive` du tag), plus
// le tarball GitHub généré à la volée (`tarball_url`) qui n'a pas
// d'empreinte publiable. Son SHA-256 est vérifié contre le manifeste
// `SHA256SUMS` publié sur la même release AVANT toute extraction — mismatch
// ou manifeste absent : arrêt, fichier supprimé, jamais de repli.
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, mkdirSync, rmSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const DEPOT = 'ElmiraLabs/tracescale'
export const NOM_ASSET_SOURCE = 'tracescale-source.tar.gz'
export const NOM_ASSET_MANIFESTE = 'SHA256SUMS'
const MOTIF_LIGNE_MANIFESTE = /^([0-9a-f]{64})\s+\*?(\S.*)$/i

// Tag release-please : `tracescale-v0.14.0` — extrait `0.14.0` pour
// comparaison directe avec `package.json` `version` (jamais de préfixe
// `tracescale-`/`v` là-bas). Retombe sur le tag brut si le format change un
// jour côté release-please — comparaison alors toujours correcte (juste
// moins lisible dans le message affiché), jamais une exception.
export function versionDepuisTag(tag) {
  const correspondance = /v(\d+\.\d+\.\d+)$/.exec(tag)
  return correspondance ? correspondance[1] : tag
}

// Même correctif que #721/#722 côté monorepo tracescale (siege_client.ts,
// synchro_validation.ts) : Node/undici enveloppe toute erreur `fetch` dans
// un TypeError générique dont le `.message` vaut toujours "fetch failed"
// — la cause réelle (DNS, TLS, connexion refusée...) est dans `err.cause`.
// Réimplémenté ici en zéro dépendance : ce dépôt ne peut pas importer le
// helper du monorepo privé avant même de l'avoir cloné.
export function messageErreur(err) {
  if (err instanceof Error) {
    const cause = err.cause
    if (cause instanceof Error) return cause.message
    if (typeof cause === 'string' && cause.trim().length > 0) return cause
    return err.message
  }
  return String(err)
}

function entetesApi(jeton) {
  return {
    Authorization: `Bearer ${jeton}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export async function derniereRelease(jeton) {
  let reponse
  try {
    reponse = await fetch(`https://api.github.com/repos/${DEPOT}/releases/latest`, {
      headers: entetesApi(jeton),
    })
  } catch (err) {
    throw new Error(`Impossible de joindre GitHub (${messageErreur(err)}).`)
  }

  if (reponse.status === 401 || reponse.status === 403) {
    throw new Error(
      'Jeton invalide, expiré, ou sans accès en lecture au dépôt tracescale (permission « Contents: Read-only » requise).'
    )
  }
  if (reponse.status === 404) {
    throw new Error(
      'Dépôt ElmiraLabs/tracescale introuvable avec ce jeton, ou aucune release publiée — vérifier le jeton.'
    )
  }
  if (!reponse.ok) {
    throw new Error(`GitHub a répondu HTTP ${reponse.status}.`)
  }

  const donnees = await reponse.json()
  if (!donnees.tag_name) {
    throw new Error('Réponse GitHub inattendue (tag_name absent).')
  }
  // `assets` : { name, url } — `url` (API assets) est seule capable de
  // servir un asset de release PRIVÉE avec un jeton porteur.
  const assets = Array.isArray(donnees.assets)
    ? donnees.assets.map((a) => ({ name: a.name, url: a.url }))
    : []
  return { tag: donnees.tag_name, assets }
}

// Fonction pure (testée) : format `sha256sum` (`<hex>  <nom>`), lignes
// vides et commentaires ignorés, empreinte normalisée en minuscules ; une
// ligne non conforme est une erreur (un manifeste corrompu ne doit pas
// passer pour « incomplet »).
export function analyserManifeste(texte) {
  const manifeste = new Map()
  for (const ligneBrute of texte.split('\n')) {
    const ligne = ligneBrute.trim()
    if (!ligne || ligne.startsWith('#')) continue
    const correspondance = MOTIF_LIGNE_MANIFESTE.exec(ligne)
    if (!correspondance) {
      throw new Error(
        `Manifeste ${NOM_ASSET_MANIFESTE} illisible (ligne « ${ligne.slice(0, 120)} »).`
      )
    }
    manifeste.set(correspondance[2].trim(), correspondance[1].toLowerCase())
  }
  return manifeste
}

export function empreinteFichierSha256(chemin) {
  return new Promise((resolve, reject) => {
    const hachage = createHash('sha256')
    createReadStream(chemin)
      .on('error', reject)
      .on('data', (segment) => hachage.update(segment))
      .on('end', () => resolve(hachage.digest('hex')))
  })
}

function supprimerSansErreur(chemin) {
  try {
    unlinkSync(chemin)
  } catch {
    // Best-effort : le message d'erreur principal prime.
  }
}

// Compare l'empreinte du fichier reçu à celle du manifeste. Toute
// divergence (ou asset absent du manifeste) supprime le fichier et lève —
// l'appelant ne doit jamais atteindre l'extraction.
export async function verifierEmpreinteFichier(chemin, nomAsset, manifeste) {
  const attendue = manifeste.get(nomAsset)
  if (!attendue) {
    supprimerSansErreur(chemin)
    throw new Error(
      `« ${nomAsset} » n'apparaît pas dans le manifeste ${NOM_ASSET_MANIFESTE} de la release — fichier rejeté et supprimé.`
    )
  }
  let calculee
  try {
    calculee = await empreinteFichierSha256(chemin)
  } catch (err) {
    supprimerSansErreur(chemin)
    throw new Error(
      `Lecture de « ${nomAsset} » impossible pour vérification (${messageErreur(err)}) — fichier supprimé.`
    )
  }
  if (calculee !== attendue) {
    supprimerSansErreur(chemin)
    throw new Error(
      `Empreinte SHA-256 de « ${nomAsset} » invalide (attendue ${attendue}, reçue ${calculee}) — le fichier téléchargé ne correspond pas à celui publié par la CI ; il a été supprimé, rien n'a été extrait. Retélécharger ; si l'écart persiste, la release a été altérée.`
    )
  }
}

function trouverAsset(assets, nom) {
  return assets.find((a) => a.name === nom)
}

async function telechargerAsset(jeton, asset, contexte) {
  let reponse
  try {
    reponse = await fetch(asset.url, {
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/octet-stream' },
    })
  } catch (err) {
    throw new Error(`${contexte} échoué (${messageErreur(err)}).`)
  }
  if (!reponse.ok || !reponse.body) {
    throw new Error(`${contexte} échoué (HTTP ${reponse.status}).`)
  }
  return reponse
}

// Télécharge le manifeste de la release et l'analyse. Absent = release
// antérieure à tracescale#1172 ou publication incomplète : erreur, jamais
// un manifeste vide qui laisserait tout passer.
export async function telechargerManifeste(jeton, assets) {
  const asset = trouverAsset(assets, NOM_ASSET_MANIFESTE)
  if (!asset) {
    throw new Error(
      `Manifeste d'empreintes « ${NOM_ASSET_MANIFESTE} » introuvable sur cette release — publiée avant tracescale#1172, ou publication CI incomplète. Aucun fichier de cette release ne peut être installé sans vérification.`
    )
  }
  const reponse = await telechargerAsset(jeton, asset, 'Téléchargement du manifeste')
  return analyserManifeste(await reponse.text())
}

// L'archive source de la CI enveloppe son contenu dans `tracescale/` —
// `--strip-components=1` fait atterrir le contenu directement dans
// dossierCible. `--no-same-owner --no-same-permissions` : lancé en
// root/Administrateur, GNU tar restaurerait sinon l'uid du runner CI ;
// accepté aussi par bsdtar (Windows 10+, macOS).
export async function telechargerEtExtraire(release, jeton, dossierCible) {
  const assetSource = trouverAsset(release.assets, NOM_ASSET_SOURCE)
  if (!assetSource) {
    throw new Error(
      `Archive source « ${NOM_ASSET_SOURCE} » introuvable sur la release ${release.tag} — publiée avant tracescale#1172 ; une release plus récente est nécessaire.`
    )
  }
  const manifeste = await telechargerManifeste(jeton, release.assets)

  mkdirSync(dossierCible, { recursive: true })
  const cheminArchive = join(dossierCible, '.tracescale-source.tar.gz')
  // Jamais suivre un lien symbolique préexistant portant ce nom : l'entrée
  // est supprimée puis recréée en exclusif (`wx`), lisible par nous seuls.
  rmSync(cheminArchive, { force: true })

  const reponse = await telechargerAsset(jeton, assetSource, 'Téléchargement')
  // `pipeline` (pas `pipe` + `finished`) : une coupure réseau en cours de
  // téléchargement remonte ici au lieu de laisser le spinner bloqué ou
  // de faire tomber le process ; l'archive partielle est supprimée.
  try {
    await pipeline(
      Readable.fromWeb(reponse.body),
      createWriteStream(cheminArchive, { flags: 'wx', mode: 0o600 })
    )
  } catch (err) {
    supprimerSansErreur(cheminArchive)
    throw new Error(`Téléchargement interrompu (${messageErreur(err)}) — archive partielle supprimée.`)
  }

  await verifierEmpreinteFichier(cheminArchive, NOM_ASSET_SOURCE, manifeste)

  try {
    // Sortie capturée (pas `inherit`) : un spinner contrôle cette même
    // zone du terminal pendant l'extraction (cf. bin/tracescale-cli.js).
    execFileSync(
      'tar',
      [
        '-xzf',
        cheminArchive,
        '-C',
        dossierCible,
        '--no-same-owner',
        '--no-same-permissions',
        '--strip-components=1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        "La commande « tar » est introuvable sur cette machine — installer tar (déjà présent nativement sur Windows 10+, macOS et Linux) avant de relancer."
      )
    }
    throw new Error(`Extraction de l'archive échouée : ${messageErreur(err)}`)
  } finally {
    supprimerSansErreur(cheminArchive)
  }
}
