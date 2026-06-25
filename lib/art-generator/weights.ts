export type TraitWeights = Record<string, number>;

export const DEFAULT_TRAIT_WEIGHT = 1;

export function normalizeTraitWeights(input: unknown): TraitWeights {
  if (!input || typeof input !== 'object') return {};
  const next: TraitWeights = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof key !== 'string' || !key) continue;
    const num = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(num) || num < 0) continue;
    next[key] = Math.max(0, Math.min(10000, Math.round(num * 100) / 100));
  }
  return next;
}
