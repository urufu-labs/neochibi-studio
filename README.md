# neochibi-studio

A local, browser-based trait composition studio for generative PNG art
collections. You point it at a folder of layered PNGs on disk; you get a live
preview canvas, a rules engine for rarity and template-driven distributions, an
effects pipeline, and a collection-scale simulator — all backed by plain JSON
files that live next to the art.

> Maintained by [Urufu Labs](https://github.com/urufu-labs). MIT licensed.

```text
data/art/inputs/v1/
├── background/
│   ├── aqua.png
│   └── meadow.png
├── body/
│   ├── cream.png
│   └── ghost.png
├── hair/ …
├── face/ …
└── .studio-configs/_autosave.json   ← your studio state, versioned with the art
```

Studio reads that tree, lets you compose any combination in the browser, and
writes your rules and weights back to disk so the whole project — art + config
— can be committed to git.

## Why use it

- **Local first.** Everything lives in your working tree. No accounts, no
  hosted services, no asset uploads. The studio is just a Next.js app that
  talks to your filesystem through API routes.
- **Source-controllable config.** Layer order, selected traits, effects,
  template rules, and rarity weights are stored as JSON next to your PNGs.
  Diff them like any other file.
- **Wire-in friendly.** The on-disk format is documented below. The `lib/
  art-generator/` model code is pure TypeScript with no framework lock-in, so
  you can import the rule engine and effects pipeline into your own minting
  or export pipeline.
- **Two-template distributions.** First-class support for split collections
  (e.g. two factions / variants with different rules and weights from the
  same trait library).
- **Capacity and simulation.** Before you commit to a 6,000-supply drop,
  press *Simulate* and watch how many uniques the rolls actually produce
  under your weights.

## Quickstart

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000/studio>. `/` redirects to `/studio`.

The repo ships with **empty layer folders**:

```text
background/  body/  coat/  face/  hair/  beard/  shirt/  tail/
```

Drop your own PNGs into those folders (or rename / delete / add new ones — the
studio reads whatever subfolders exist under `data/art/inputs/v1/`). Refresh
the page, click *Load trait root*, and your layers will appear.

If you want to start from a clean slate, delete the folders above and create
your own. Each subfolder of the trait root becomes a layer; each PNG inside
becomes a trait.

## How it works

### The trait library

The studio scans the trait root and builds a `TraitLibrary`:

```ts
interface TraitLibrary {
  rootDir: string;
  layers: Array<{
    id: string;                  // derived from directory name
    name: string;                // display name
    directoryName: string;       // exact folder on disk
    traits: Array<{
      id: string;                // `${layer.id}--${slug}`
      name: string;              // display name (PNG basename)
      relativePath: string;      // stable key, e.g. "background/aqua.png"
      extension: 'png';
      version: number;           // bumps on overwrite for cache-busting
    }>;
  }>;
}
```

Rules and weights use `relativePath` as the stable identity key, so renaming a
PNG breaks references on purpose — the studio shows the broken state instead of
silently dropping rules.

### Layer order, selection, and rendering

You drag layers to reorder them. The studio composites bottom-up: layer 0 is
the background, the last layer is the topmost.

The *current selection* is one trait per layer (or none, to skip the layer).
Selection drives the live preview canvas and is what gets saved with each
config.

### Rules: two templates per collection

A collection has two **template kinds**: `templateA` and `templateB`. Every
roll picks a template kind first (weighted by *Template A weight*, 0–100%),
then applies that template's rules.

Each template has:

| Field                  | What it does                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `alwaysLayerIds`       | Layers that must appear if they have an eligible trait.                                             |
| `neverLayerIds`        | Layers that are always skipped under this template.                                                 |
| `excludedTraitPaths`   | Specific trait files to exclude under this template.                                                |
| `layerRules`           | Per-layer overrides: `chancePercent` and `excludeLayerIds` for cross-layer skips when this rolls.   |

Globally (shared across templates), the collection also has:

- **Trait pairs.** When trait A rolls, force trait B (and vice versa). Used
  for "must match" combinations like matching hair + tail colors.
- **Layer exclusions.** When a source layer rolls a trait, skip these target
  layers. (For per-template behavior, use the template-scoped `layerRules`
  instead.)

The full structure is in [`lib/art-generator/rules.ts`](lib/art-generator/rules.ts).

### Rarity weights

Each trait has a non-negative integer weight (default 10). The `pickWeightedTrait`
function does a standard weighted lottery within each layer's eligible traits.
Set a weight to 0 to exclude a trait entirely; the studio still shows it in the
picker but won't roll it.

Weights live in `data/art/inputs/v1/.studio-weights.json`:

```json
{
  "background/aqua.png": 10,
  "background/meadow.png": 3,
  "coat/golden.png": 1
}
```

### Effects pipeline

Effects are baked into the preview canvas in order. Each is a small,
self-contained function in [`lib/art-generator/canvas-filters.ts`](lib/art-generator/canvas-filters.ts).

Available out of the box: `saturation`, `brightness-contrast`, `hue`, `invert`,
`duotone`, `halftone`, `pixel-mosaic`, `dither`, `posterize`, `chromatic`,
`glitch`, `vhs`, `scanlines`, `noise`, `crt`. Pixel-counted effects auto-scale
between the main preview and the gallery tiles so the look stays consistent.

### Capacity and simulation

The *Collection stats* panel computes two numbers:

- **Capacity.** The deterministic upper bound — the product of viable traits
  per non-`Never` layer, accounting for chance-based optional layers.
- **Simulated unique.** Runs the actual weighted roll up to `target * 1.5`
  attempts and counts unique fingerprints. Useful for catching cases where
  capacity says "10k possible" but weights make 90% of rolls collide.

## Working with traits

Most artist workflows are click-or-paste, not edit-a-file:

- **Paste-create.** Copy an image to the clipboard, paste into the studio,
  name it, and it lands in the right layer folder.
- **Paste-replace.** Pick a target trait, paste, and the file is overwritten
  in place (the `version` counter bumps so the canvas refreshes).
- **Upload.** Drag a PNG into the upload field.
- **Rename / delete / reorder** layers and traits from the management panel.

All of these go through `app/api/art-generator/*` and write directly to disk.

## Where data lives

```text
data/art/inputs/v1/
├── <layer-1>/<trait>.png ...
├── <layer-2>/<trait>.png ...
├── .studio-weights.json
└── .studio-configs/
    ├── _autosave.json          ← always-on, written by the studio
    └── <your-named-preset>.json
```

`_autosave.json` is rewritten on every meaningful change. Named presets are
written when you click *Save preset*. Both follow the same `SavedGeneratorConfig`
shape — see [`lib/art-generator/presets.ts`](lib/art-generator/presets.ts).

The trait root is configurable. By default it's `<repo>/data/art/inputs/v1`
(returned by `GET /api/art-generator/default-root`), but you can point the
studio at any directory on disk via the *Trait root* input. The chosen root is
persisted to `localStorage`.

## Building and extending

```bash
pnpm typecheck    # tsc --noEmit
pnpm test         # node --test test/*.test.ts (no jest, no vitest)
pnpm build        # next build
pnpm dev          # next dev on :3000
```

The rule engine and effects pipeline are pure modules — no React, no
filesystem. You can import them directly:

```ts
import {
  rollFromTemplate,
  simulateCollection,
  pickTemplateKind,
  DEFAULT_TEMPLATES,
} from 'neochibi-studio/lib/art-generator/rules';
import { pickWeightedTrait } from 'neochibi-studio/lib/art-generator/rules';
```

If you want to wire the studio's output into a downstream pipeline (game,
marketplace, indexer), see [`docs/art-studio.md`](docs/art-studio.md) for a
recommended export-manifest shape that records the ordered trait stack per
generated slot.

### Adding an effect

1. Implement the filter in `lib/art-generator/canvas-filters.ts` and add it to
   `DEFAULT_PREVIEW_EFFECTS` with a default `enabled: false`.
2. Add a preset (optional) to `PREVIEW_EFFECT_PRESETS` so it shows up in the
   gallery preset list.
3. Reference the effect ID anywhere — the studio handles persisting its
   options through `normalizePreviewEffects`.

### Adding a rule

Rules live in `lib/art-generator/rules.ts`. Each rule type has its own
normalizer (so garbage configs round-trip cleanly) and is applied inside
`rollFromTemplate`. New rules should:

- Add a normalizer that survives unknown fields.
- Be applied deterministically (no calls to `Math.random` outside the passed-in
  `rng`).
- Have a test in `test/rules.test.ts`.

## Repo layout

```text
app/
  studio/               Studio page (App Router)
  api/art-generator/    Filesystem-backed API routes
components/
  art-generator-studio.tsx   Main studio client component
  preview-canvas.tsx
  gallery-tile.tsx
  trait-picker.tsx
lib/
  art-generator/        Pure model: library, rules, weights, effects, presets
data/art/inputs/v1/     Trait root (ships empty)
docs/
  art-studio.md         Implementation notes + export manifest shape
test/                   Node-native unit tests (no jest, no vitest)
```

## Roadmap / limitations

- **Two templates per collection.** The `templateA` / `templateB` split is
  hardcoded — generalizing to N templates is the most common extension
  request and is on the roadmap.
- **PNG only.** Traits must be `.png`. SVG and animated formats are not
  supported.
- **Single canvas size.** The preview canvas assumes square layers. Mixed
  dimensions render against whatever size the studio computes from the first
  trait it loads.
- **No undo stack.** The autosave is the only history. Use git if you need
  rollback.

## Contributing

Issues and PRs welcome at <https://github.com/urufu-labs/neochibi-studio>. See
[`AGENTS.md`](AGENTS.md) for repo guidelines (scoped diffs, no new dependencies
without discussion, validation commands).

## License

[MIT](LICENSE) © 2026 Urufu Labs.
