function sanitizeDisplayName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferTraitNameFromFileName(fileName: string): string {
  return sanitizeDisplayName(fileName) || 'pasted-trait';
}

export function buildNewTraitFileName(traitName: string): string {
  const safeName = sanitizeDisplayName(traitName) || 'pasted-trait';
  return `${safeName}.png`;
}

export function normalizePendingNewTrait(
  draft: { layerName?: string | null; traitName?: string | null } | null | undefined,
  fallbackLayerName: string,
) {
  const layerName = sanitizeDisplayName(draft?.layerName || '') || sanitizeDisplayName(fallbackLayerName) || 'background';
  const traitName = sanitizeDisplayName(draft?.traitName || '') || 'pasted-trait';

  return { layerName, traitName };
}
