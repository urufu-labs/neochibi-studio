# AGENTS.md - urufulabs studio (repo: neochibi-studio)

Guidance for AI agents and contributors working in this repo.

## Mission

urufulabs studio is a browser-based generative NFT art tool by urufu labs.
Users upload trait layers, tune weights and single-ruleset rules, generate up
to 10,000 unique tokens entirely on-device via a Web Worker + OffscreenCanvas,
curate the results (reroll / swap / 1-of-1), and publish to IPFS via the
"Publish to IPFS" panel. The repo folder + npm package name is still
`neochibi-studio` for continuity; the user-facing product is `urufulabs studio`.

Keep this repo standalone. Do not import code that assumes a parent monorepo,
wallet/contracts/minting flows, hosted AI generation, or any specific brand or
collection identity.

## Architecture

- `app/studio/` — the Studio page (Next.js App Router).
- `app/api/art-generator/` — filesystem-backed API routes for browsing,
  uploading, replacing, renaming, deleting, reordering, configs, and weights.
- `components/art-generator-studio.tsx` — the main Studio client component.
- `components/preview-canvas.tsx`, `components/gallery-tile.tsx`,
  `components/trait-picker.tsx` — preview and picker UI.
- `lib/art-generator/` — pure model code: library scan, rule engine,
  persistence helpers, weights, effect pipeline, paste helpers.
- `data/art/inputs/v1/` — the trait library root. Ships empty for new users.
- `data/art/inputs/v1/.studio-configs/_autosave.json` — active layer order,
  selected traits, effects, templates, and collection rules.
- `data/art/inputs/v1/.studio-weights.json` — per-trait rarity weights.

## Working rules

- Keep changes small, scoped, and artist-facing.
- Do not add dependencies unless a maintainer explicitly asks. The repo
  intentionally ships with only `next`, `react`, `react-dom`, and dev tools.
- Prefer local filesystem behavior over hosted services.
- Treat edits under `data/art/inputs/v1/` as real art/config changes. Stage
  them only when the task is actually about traits, rules, autosave, or
  weights.
- If the Studio app rewrites `_autosave.json` during QA, inspect the diff
  before staging it.
- Keep the README usable by a new artist who only knows `pnpm install` and
  `pnpm dev`.

## Validation

```bash
pnpm typecheck
pnpm test
pnpm build
```

For visual or workflow changes, also smoke test the studio:

```bash
pnpm dev
# open http://localhost:3000/studio
```

Verify:

- The toolbar shows the trait root.
- Layer count and trait count populate after loading a library with content.
- Collection preview gallery renders nonblank tiles when traits exist.
- Changing a template rule or trait weight updates preview behavior.
- Paste/replace flows write into the configured trait root.
