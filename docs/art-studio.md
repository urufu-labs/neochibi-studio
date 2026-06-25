# Art Studio Notes

Implementation notes for collection-generation behavior. The [README](../README.md)
is the user-facing intro — this file is reference material for contributors and
anyone wiring the studio's output into a downstream pipeline.

## What Studio is responsible for

- Layer and trait management on disk.
- Paste-create and paste-replace workflows for fast iteration.
- Canvas preview with baked effects.
- Collection template rules (two templates per project) and rarity weights.
- Local asset hosting from the configured trait root.

## Template rules

Studio templates support per-layer rules within each of the two template kinds
(`templateA` and `templateB`):

- `Always` forces a layer to appear whenever it has an eligible trait.
- `Never` skips the layer.
- `Optional` defaults to 100% appearance, but can be lowered with a per-template
  chance percentage.
- Each template layer can skip other layers when it actually appears. For
  example: "in templateA, Coat appears 10% of the time, and when it appears it
  hides Shirt and Hair."

Trait pairs and global layer exclusions still exist for cross-template behavior,
but template-scoped layer rules should be preferred when the rule only applies
to one template kind.

## Recommended export manifest

If you're consuming Studio output downstream (game, marketplace, indexer), do
not infer character parts from a flattened token image. Consume a stored art
composition manifest that records the exact ordered trait stack for each
generated slot.

```ts
interface ArtCompositionV1 {
  schemaVersion: 1;
  artRootVersion: 'v1';
  artSlot: string;
  templateKind: 'templateA' | 'templateB';
  canvas: { width: number; height: number };
  backgroundLayerIds: string[];
  masks?: Record<string, {
    relativePath: string;
    appliesToLayerIds: string[];
    overlayLayerIds: string[];
  }>;
  layers: Array<{
    order: number;
    layerId: string;
    layerName: string;
    directoryName: string;
    role: 'background' | 'foreground';
    traitId: string;
    traitName: string;
    relativePath: string;
    attributeType: string;
    attributeValue: string;
  }>;
  displayAttributes: Array<{
    trait_type: string;
    value: string;
  }>;
  effects?: Array<{
    id: string;
    enabled: boolean;
    options?: Record<string, number>;
  }>;
}
```

Transparent character rendering is a view of the same manifest: render `layers`
in ascending `order`, skip entries whose `role` is `background` or whose
`layerId` is in `backgroundLayerIds`, and preserve the PNG alpha channel.

## Notes

- Trait IDs are derived from layer directory plus trait display name. The
  `relativePath` field is the most stable cross-repo asset key. Downstream
  consumers should store both, and treat `relativePath` as the asset lookup key.
- Studio is the source of truth for the trait library, layer ordering, template
  rules, rarity weights, and preview effect definitions. Versioned manifests
  exported from Studio should be the canonical artifact downstream tools read —
  do not copy raw filesystem state across repos.
