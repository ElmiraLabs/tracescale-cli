// Accès au dépôt privé ElmiraLabs/tracescale via l'API GitHub (pas `git
// clone` — évite que le jeton persiste dans un `.git/config` ou une URL de
// remote). Toujours la dernière RELEASE publiée (release-please), jamais
// `main` : un client reçoit un état publié, jamais du code en cours
// d'intégration.
import { createWriteStream, mkdirSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'

const DEPOT = 'ElmiraLabs/tracescale'

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

export async function derniereRelease(jeton) {
  let reponse
  try {
    reponse = await fetch(`https://api.github.com/repos/${DEPOT}/releases/latest`, {
      headers: {
        Authorization: `Bearer ${jeton}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
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
  if (!donnees.tarball_url) {
    throw new Error('Réponse GitHub inattendue (tarball_url absent).')
  }
  return { tag: donnees.tag_name, tarballUrl: donnees.tarball_url }
}

// Les tarballs GitHub enveloppent toujours le contenu dans un dossier
// `<owner>-<repo>-<sha>/` — `--strip-components=1` fait atterrir le
// contenu directement dans dossierCible.
export async function telechargerEtExtraire(tarballUrl, jeton, dossierCible) {
  mkdirSync(dossierCible, { recursive: true })
  const cheminArchive = join(dossierCible, '.tracescale-source.tar.gz')

  let reponse
  try {
    reponse = await fetch(tarballUrl, { headers: { Authorization: `Bearer ${jeton}` } })
  } catch (err) {
    throw new Error(`Téléchargement échoué (${messageErreur(err)}).`)
  }
  if (!reponse.ok || !reponse.body) {
    throw new Error(`Téléchargement échoué (HTTP ${reponse.status}).`)
  }

  await finished(Readable.fromWeb(reponse.body).pipe(createWriteStream(cheminArchive)))

  try {
    // Sortie capturée (pas `inherit`) : un spinner contrôle cette même
    // zone du terminal pendant l'extraction (cf. bin/tracescale-cli.js)
    // — la liste de fichiers extraits par `tar` n'a pas d'intérêt pour
    // l'utilisateur en temps normal, mais reste incluse dans l'erreur
    // ci-dessous si l'extraction échoue.
    execFileSync('tar', ['-xzf', cheminArchive, '-C', dossierCible, '--strip-components=1'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        "La commande « tar » est introuvable sur cette machine — installer tar (déjà présent nativement sur Windows 10+, macOS et Linux) avant de relancer."
      )
    }
    // `err.message` (via messageErreur) inclut déjà stderr — c'est
    // execFileSync qui l'y embarque automatiquement sur échec.
    throw new Error(`Extraction de l'archive échouée : ${messageErreur(err)}`)
  } finally {
    try {
      unlinkSync(cheminArchive)
    } catch {
      // Nettoyage best-effort — ne bloque pas l'installation si l'archive
      // temporaire ne peut pas être supprimée.
    }
  }
}
