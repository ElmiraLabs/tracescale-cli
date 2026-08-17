# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`tracescale-cli` is the public `npx` bootstrapper for TraceScale
(`npx github:ElmiraLabs/tracescale-cli`). It provisions a fresh client
machine by fetching the latest published release of the private
`ElmiraLabs/tracescale` repo, running `npm install`, and handing off to
that repo's own install wizard. **This repo contains zero business logic**
— only download/install plumbing. Everything else lives in the private
monorepo.

There is no build step, no test suite, no linter, and no dependencies
(`package.json` declares none). Run the CLI directly with Node ≥ 20:

```sh
node bin/tracescale-cli.js --token=... --dir=./tracescale --type=site --cible=docker
```

Any argument omitted on the command line is prompted for interactively
instead (see `lib/prompts.js`).

## Non-negotiable constraints (why the code looks the way it does)

- **Zero npm dependencies, by design.** This is a bootstrapper that must
  run via bare `npx` before anything else exists on the target machine.
  Do not add dependencies (no `enquirer`, `chalk`, etc.) — prompts and
  ANSI color are hand-rolled in `lib/prompts.js` /
  `bin/tracescale-cli.js` on purpose. The private monorepo's wizard is
  allowed richer deps; this repo is not.
- **API download, never `git clone`.** `lib/github.js` fetches the tarball
  via the GitHub REST API instead of cloning, specifically so the access
  token never ends up persisted in `.git/config` or a remote URL.
- **Latest release only, never `main`.** `derniereRelease()` always hits
  `/releases/latest` (release-please tags on the private repo). A client
  must always receive a published, released state — never in-progress
  integration code from the default branch.
- **First provisioning only.** This tool refuses to run if the target
  directory already looks like an install (`package.json` or `.git`
  present) — updates/renewals/reinstalls go through `node ace
  instance:installer` inside the already-cloned repo, not through this
  CLI again.
- **This repo is public; the token must never leak into it.** The access
  token is a GitHub fine-grained PAT scoped to `Contents: Read-only` on
  `ElmiraLabs/tracescale` only, distributed out-of-band per
  client/deployment. Never log it, echo it unmasked, or write it to disk.

## Architecture

Three files, linear flow, no framework:

- **`bin/tracescale-cli.js`** — entry point (`main()`). Parses `--key=value`
  CLI args (`lireArgs`), falls back to interactive prompts for anything
  missing, validates the target dir is empty, then runs the pipeline:
  fetch latest release → download+extract tarball → `npm install` in the
  target dir → `npm run install:<type>:<cible>` (spawned with
  `stdio: 'inherit'` so the child wizard's own prompts/output pass
  through directly). `type` is `siege|site`, `cible` is `docker|natif`;
  the four combinations map to npm scripts of that same
  `install:<type>:<cible>` name expected to exist in the private repo's
  `package.json` once cloned.
- **`lib/github.js`** — all GitHub API interaction: `derniereRelease(jeton)`
  fetches release metadata, `telechargerEtExtraire(tarballUrl, jeton,
  dossierCible)` streams the tarball to disk and shells out to the
  system `tar` (`--strip-components=1`, since GitHub tarballs wrap
  content in an `<owner>-<repo>-<sha>/` dir) — no `tar` npm package,
  relies on the OS binary. Also exports `messageErreur(err)`, which
  unwraps Node/undici's habit of collapsing every `fetch` failure into a
  generic `TypeError: fetch failed` — the real cause (DNS, TLS,
  connection refused...) is in `err.cause`, not `err.message`. This is
  the same fix applied to `siege_client.ts`/`synchro_validation.ts` in
  the private monorepo, reimplemented here standalone since this repo
  can't import from the private repo it hasn't cloned yet.
- **`lib/prompts.js`** — hand-rolled readline prompts: `ask` (text with
  default), `askConfirmation` (y/n), `askChoix` (numbered menu),
  `askMasque` (masked token input, raw-mode stdin echoing `*`). Falls
  back to unmasked `ask` when stdin isn't a TTY. `askMasque` processes a
  raw-mode `data` chunk **character by character**, not as one unit —
  pasting a token delivers the whole paste in a single `data` event, and
  treating it as one char let a stray `\r`/`\n` from the clipboard
  corrupt the token (see commit `779aee0`).

Windows note: child processes (`npm install`, `npm run ...`) are spawned
with `shell: SUR_WINDOWS` (`process.platform === 'win32'`) since `npm` is
a `.cmd` shim there and needs a shell to resolve.

## Relationship to the private `tracescale` monorepo

This repo only bootstraps up to the point of calling
`npm run install:<type>:<cible>` inside the freshly-downloaded repo. The
actual install wizard, `node ace instance:installer`, environment-guard
scripts (`assurer_env_dev.js`), and all business logic live there, not
here. When a change here references behavior "on the other side" (e.g.
`install:*:natif` needing a `.env` before `node ace` runs), that's
describing a contract with the private repo's `package.json` scripts —
verify against that repo if you need details beyond what's cross-referenced
in comments here.
