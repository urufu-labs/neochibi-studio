export interface ExportSummaryItem {
  layerName: string;
  traitName: string;
}

export function buildExportFileName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return `${normalized || 'neochibi-export'}.png`;
}

export function buildExportSummary(items: ExportSummaryItem[]): string[] {
  return items.map((item) => `${item.layerName}: ${item.traitName}`);
}
