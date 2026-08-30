# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`tracescale-cli` is the public `npx` bootstrapper for TraceScale
(`npx github:ElmiraLabs/tracescale-cli`). Same entry point handles two
cases, auto-detected from the target directory's contents: provisioning a
fresh client machine (fetches the latest published release of the private
`ElmiraLabs/tracescale` repo, runs `npm install`, hands off to that repo's
own install wizard), or updating an already-installed Site/Docker or native (Site/Siège) instance
(detects type/current version, confirms, delegates to `node ace
instance:installer --mettre-a-jour` inside the already-present install —
never re-implements the update itself). **This repo contains zero business
logic** — only download/install/update plumbing. Everything else lives in
the private monorepo.

There is no build step, no linter, and no dependencies (`package.json`
declares none); the pure helpers in `lib/` are covered by `npm test`
(`node --test`). Run the CLI directly with Node ≥ 20:

```sh
TRACESCALE_GITHUB_TOKEN=... node bin/tracescale-cli.js --dir=./tracescale --type=site --cible=docker
```

The token comes from `TRACESCALE_GITHUB_TOKEN` or a masked prompt
(#10 / tracescale#1224); `--token=` is still accepted with a warning and
will be removed. It is handed to every child process **through `env`**
(`envAvecJeton()`), never as a CLI argument — so the private repo's
wizard (`instance:installer`, `instance:installer:gui`) reads the same
variable and does not ask again.

Any argument omitted on the command line is prompted for interactively
instead (see `lib/prompts.js`).

## Non-negotiable constraints (why the code looks the way it does)

- **Zero npm dependencies, by design.** This is a bootstrapper that must
  run via bare `npx` before anything else exists on the target machine.
  Do not add dependencies (no `enquirer`, `chalk`, etc.) — prompts and
  ANSI color are hand-rolled in `lib/prompts.js` /
  `bin/tracescale-cli.js` on purpose. The private monorepo's wizard is
  allowed richer deps; this repo is not.
- **API download, never `git clone`.** `lib/github.js` fetches the release
  assets via the GitHub REST API instead of cloning, specifically so the
  access token never ends up persisted in `.git/config` or a remote URL.
- **Verified before extracted (#14, mirror of tracescale#1172).** The
  source archive is the CI-built asset `tracescale-source.tar.gz` (never
  GitHub's on-the-fly `tarball_url`, which has no publishable checksum).
  Its SHA-256 is checked against the `SHA256SUMS` manifest published on
  the same release *before* `tar` runs; a mismatch or a missing manifest
  aborts, deletes the file and never falls back. A release published
  before tracescale#1172 therefore cannot be installed by this CLI — by
  design. `tar` runs with `--no-same-owner --no-same-permissions` (the CLI
  runs as root/Administrator). Pure helpers (`analyserManifeste`,
  `empreinteFichierSha256`, `verifierEmpreinteFichier`, `versionDepuisTag`) are covered by
  `npm test` (`node --test`, still zero dependencies).
- **Latest release only, never `main`.** `derniereRelease()` always hits
  `/releases/latest` (release-please tags on the private repo). A client
  must always receive a published, released state — never in-progress
  integration code from the default branch.
- **Provisioning or update, auto-detected — never re-implemented here.**
  `installationExistante()` (`lib/installation_existante.js`) checks the
  target directory for an existing install (`package.json`/`.git`
  present) and, if found, identifies type/cible/version from files the
  private repo's own installer already writes (`deploy/site/.env`,
  `deploy/staging/.env`, `apps/api/build/.env`'s `TYPE_INSTANCE=`) — no
  guessing, no re-asking the operator. Site+Docker and native (Site/Siège, tracescale#1223) updates are
  delegated automatically (`node ace instance:installer --mettre-a-jour`,
  spawned with the token in `env`); anything else (Siège/Docker, or a
  native install whose `TYPE_INSTANCE` could not be read) prints a clear
  message pointing at `node ace instance:installer` directly rather than
  attempting a call that would fail. The actual update mechanism (what `--mettre-a-jour` downloads,
  rebuilds, restarts) lives entirely in the private repo — this repo only
  detects and delegates.
- **This repo is public; the token must never leak into it.** The access
  token is a GitHub fine-grained PAT scoped to `Contents: Read-only` on
  `ElmiraLabs/tracescale` (add `Packages: Read` for Site tokens that will
  also drive updates — the `tracescale-api` GHCR package is private),
  distributed out-of-band per client/deployment. Never log it, echo it
  unmasked, or write it to disk — `ecrireImageTag()` writes only the
  confirmed release *tag* (never a secret) into the target's `.env`.

## Architecture

One entry point plus small `lib/` helpers (`github.js`, `jeton.js`,
`installation_existante.js`, `prompts.js`, `spinner.js`, `ui.js`), linear
flow, no framework:

- **`bin/tracescale-cli.js`** — entry point (`main()`). Parses `--key=value`
  CLI args (`lireArgs`), falls back to interactive prompts for token/dir.
  Calls `installationExistante(dossierCible)`; if it returns non-null,
  hands off entirely to `mettreAJour()` (same file) and returns — the
  fresh-install path below never runs. Otherwise (no existing install)
  asks for type/cible, then runs the provisioning pipeline: fetch latest
  release → download+extract tarball → `npm install` in the target dir →
  `npm run install:<type>:<cible>` (spawned with `stdio: 'inherit'` so
  the child wizard's own prompts/output pass through directly). `type` is
  `siege|site`, `cible` is `docker|natif`; the four combinations map to
  npm scripts of that same `install:<type>:<cible>` name expected to
  exist in the private repo's `package.json` once cloned.
  `mettreAJour(dossierCible, existante, jeton)` proceeds automatically
  for Site/Docker and for native installs (Site or Siège, decided by the
  pure `deciderMiseAJour()` in `lib/mise_a_jour.js`; Siège/Docker prints
  a message pointing at `node ace instance:installer` and exits). Native:
  the checkout is refreshed first (verified source archive + `npm
  install`, so the installer of the target version is available — a
  pre-#1223 install has no `--cible=natif --mettre-a-jour`), then `node
  ace instance:installer --type=<type> --cible=natif --mettre-a-jour
  --version=<tag>` (`argumentsInstanceInstaller()`). The installed version
  is read from what RUNS (`apps/api/build/package.json` for native, see
  `installationExistante`), never from the checkout the CLI itself
  refreshes. Docker: fetches the latest release, compares
  its version to `existante.version` (no-op if already current), confirms
  with the operator, writes that confirmed tag into `deploy/site/.env`
  (`ecrireImageTag`, see below — keeps this tool's proposal and what
  `--mettre-a-jour` actually installs in sync, since that command reads
  `IMAGE_TAG` from `.env` rather than re-fetching "latest" itself), then
  spawns `node ace instance:installer --type=site --mettre-a-jour` with
  `cwd: <dossierCible>/apps/api` and the token in `env`
  (`TRACESCALE_GITHUB_TOKEN`), never as `--token=`.
- **Uninstall** — `--desinstaller [--purger-donnees]` (`desinstaller()` in
  `bin/`, handled before any token prompt): detects the existing install,
  asks one confirmation, then delegates to the installer already present
  (`node ace instance:installer --type=<t> --cible=<c> --desinstaller
  [--purger-donnees]`, `argumentsDesinstallation()`); every identified
  type/cible pair is accepted (`deciderDesinstallation()`). Never downloads
  anything and never adds `--purger-donnees` on its own. Argument parsing
  lives in `lib/arguments.js` (`lireArgs(argv)`, tested): only whitelisted
  flags (`DRAPEAUX`) accept the bare form (→ `true`); a value option passed
  bare (`--dir`) is ignored and prompted for, as before; a flag given a
  value is refused by `main()`.
- **`lib/jeton.js`** — `resoudreJeton(argumentToken, env)` (pure: env
  `TRACESCALE_GITHUB_TOKEN` → `--token` → `null`, trimmed) and
  `envAvecJeton(jeton, base)` (child-process env, never an argv). Tested
  in `test/jeton.test.js`.
- **`lib/installation_existante.js`** — `installationExistante(dossierCible)`
  returns `null` if nothing is installed there, otherwise `{ type, cible,
  version }` inferred from files the private repo's own installer already
  writes: `deploy/site/.env` present → `site`/`docker`;
  `deploy/staging/.env` present → `siege`/`docker`; `apps/api/build/.env`
  present → reads its `TYPE_INSTANCE=` line for `type`, `cible` is
  `natif`. `version` comes from the target directory's own
  `package.json`. Pure filesystem inspection, no network call.
  `ecrireImageTag(dossierCible, tag)` writes/updates the `IMAGE_TAG=` line
  in `deploy/site/.env` — the private repo's source of truth for which
  release a Site's API image should be pulled at (never "latest" chosen
  silently on a production machine, cf. `instance_installer.ts`).
- **`lib/github.js`** — all GitHub API interaction: `derniereRelease(jeton)`
  fetches release metadata (`{ tag, assets: [{ name, url }] }`),
  `telechargerEtExtraire(release, jeton, dossierCible)` downloads the
  `SHA256SUMS` manifest and the `tracescale-source.tar.gz` asset (asset
  API URL with `Accept: application/octet-stream`, the only way to fetch
  an asset of a *private* release with a bearer token), verifies the
  archive's SHA-256 against the manifest, then shells out to the system
  `tar` (`--strip-components=1`, since the CI archive wraps content in a
  `tracescale/` dir) — no `tar` npm package, relies on the OS binary. `versionDepuisTag(tag)` strips the
  release-please tag format (`tracescale-v0.14.0`) down to a bare semver
  (`0.14.0`) comparable against `package.json`'s `version` field. Also
  exports `messageErreur(err)`, which unwraps Node/undici's habit of
  collapsing every `fetch` failure into a generic `TypeError: fetch
  failed` — the real cause (DNS, TLS, connection refused...) is in
  `err.cause`, not `err.message`. This is the same fix applied to
  `siege_client.ts`/`synchro_validation.ts` in the private monorepo,
  reimplemented here standalone since this repo can't import from the
  private repo it hasn't cloned yet.
- **`lib/prompts.js`** — hand-rolled readline prompts: `ask` (text with
  default), `askConfirmation` (y/n), `askChoix` (numbered menu),
  `askMasque` (masked token input, raw-mode stdin echoing `*`). Falls
  back to unmasked `ask` when stdin isn't a TTY. `askMasque` processes a
  raw-mode `data` chunk **character by character**, not as one unit —
  pasting a token delivers the whole paste in a single `data` event, and
  treating it as one char let a stray `\r`/`\n` from the clipboard
  corrupt the token (see commit `779aee0`).

Windows note: child processes (`npm install`, `npm run ...`, `node ace
instance:installer ...`) are spawned with `shell: SUR_WINDOWS`
(`process.platform === 'win32'`) since `npm` is a `.cmd` shim there and
needs a shell to resolve.

## Relationship to the private `tracescale` monorepo

Fresh install: this repo only bootstraps up to the point of calling
`npm run install:<type>:<cible>` inside the freshly-downloaded repo.
Update: it stops at spawning `node ace instance:installer --mettre-a-jour`
inside the already-present repo. Either way, the actual install/update
wizard, `node ace instance:installer`, environment-guard scripts
(`assurer_env_dev.js`), and all business logic live there, not here. When
a change here references behavior "on the other side" (e.g. `install:*:natif`
needing a `.env` before `node ace` runs, or what `--mettre-a-jour`
downloads/rebuilds/restarts), that's describing a contract with the
private repo's `package.json` scripts and `instance_installer.ts` — verify
against that repo if you need details beyond what's cross-referenced in
comments here.
