'use client';

// Bundle the current collection into a single ZIP so users who don't want to
// push to IPFS can host the images/metadata themselves. Layout mirrors the
// two-folder IPFS shape every launchpad expects:
//   images/{tokenId}.png
//   metadata/{tokenId}.json  (image field uses `imageBaseUrl`)
//   README.txt               (how to rewrite the image prefix after upload)

import { getAssetStore } from '@/lib/storage/asset-store';
import type { StoredOutput } from '@/lib/storage/db';

import { ZipWriter } from './zip';

export interface DownloadProgress {
  phase: 'images' | 'metadata' | 'packing';
  done: number;
  total: number;
}

export interface DownloadOptions {
  collectionName: string;
  description: string;
  imageBaseUrl: string;
  onProgress?: (progress: DownloadProgress) => void;
  shouldAbort?: () => boolean;
}

function buildTokenMetadata(
  output: StoredOutput,
  imageBaseUrl: string,
  collectionName: string,
  description: string,
): Record<string, unknown> {
  const algorithmAttributes = output.traits.map((t) => ({
    trait_type: t.layerName,
    value: t.traitName,
  }));

  let attributes: Array<{ trait_type: string; value: string }> = algorithmAttributes;
  if (output.isStatic && output.customAttributes && output.customAttributes.length > 0) {
    const byType = new Map<string, { trait_type: string; value: string }>();
    for (const a of algorithmAttributes) byType.set(a.trait_type, a);
    for (const a of output.customAttributes) byType.set(a.trait_type, a);
    attributes = Array.from(byType.values());
  }
  if (output.isStatic) attributes = [...attributes, { trait_type: 'edition', value: '1 of 1' }];

  const name = output.customName
    ? output.customName
    : `${collectionName || 'Untitled Collection'} #${output.tokenId}`;
  const finalDescription = output.customDescription ?? description ?? '';

  return {
    name,
    description: finalDescription,
    image: `${imageBaseUrl}${output.tokenId}.png`,
    attributes,
  };
}

function slugify(input: string): string {
  return (input || 'collection')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'collection';
}

function buildReadme(collectionName: string, imageBaseUrl: string, tokenCount: number): string {
  const title = collectionName || 'Untitled Collection';
  return [
    title,
    '='.repeat(Math.max(3, title.length)),
    '',
    `${tokenCount.toLocaleString()} tokens · exported by urufulabs studio ✿`,
    '',
    'Layout',
    '------',
    '  images/    one PNG per token, filename is the tokenId',
    '  metadata/  one JSON per token, OpenSea-standard ERC-721 shape',
    '',
    'Image URL prefix',
    '----------------',
    'Each metadata JSON currently points its "image" field at:',
    `  ${imageBaseUrl}{tokenId}.png`,
    '',
    'After you upload the images/ folder somewhere (IPFS, S3, Arweave, your',
    'own CDN), do a find-and-replace across every JSON in metadata/ to swap',
    'that prefix for the real host URL. Keep the {tokenId}.png suffix intact.',
    '',
    'Launchpad baseURI',
    '-----------------',
    'Upload metadata/ as a directory. Use the resulting folder URL (or CID)',
    'as your ERC-721 baseURI. Your contract\'s tokenURI(id) should resolve to:',
    '  <baseURI>/{id}.json',
    '',
  ].join('\n');
}

export async function downloadCollectionBundle(options: DownloadOptions): Promise<{ tokens: number }> {
  const store = getAssetStore();
  const outputs = await store.listOutputs();
  if (outputs.length === 0) throw new Error('Generate a collection before downloading.');

  const total = outputs.length;
  const zip = new ZipWriter();

  options.onProgress?.({ phase: 'images', done: 0, total });
  let imgDone = 0;
  for (const output of outputs) {
    if (options.shouldAbort?.()) throw new Error('Cancelled.');
    const blob = await store.getOutputBlob(output.tokenId);
    if (!blob) continue;
    await zip.addFile(`images/${output.tokenId}.png`, blob);
    imgDone += 1;
    if (imgDone % 10 === 0 || imgDone === total) {
      options.onProgress?.({ phase: 'images', done: imgDone, total });
    }
  }

  options.onProgress?.({ phase: 'metadata', done: 0, total });
  let mdDone = 0;
  for (const output of outputs) {
    if (options.shouldAbort?.()) throw new Error('Cancelled.');
    const metadata = buildTokenMetadata(
      output,
      options.imageBaseUrl,
      options.collectionName,
      options.description,
    );
    const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
    await zip.addFile(`metadata/${output.tokenId}.json`, blob);
    mdDone += 1;
    if (mdDone % 25 === 0 || mdDone === total) {
      options.onProgress?.({ phase: 'metadata', done: mdDone, total });
    }
  }

  const readmeBlob = new Blob(
    [buildReadme(options.collectionName || 'Untitled Collection', options.imageBaseUrl, total)],
    { type: 'text/plain' },
  );
  await zip.addFile('README.txt', readmeBlob);

  options.onProgress?.({ phase: 'packing', done: total, total });
  const finalBlob = zip.finish();

  const url = URL.createObjectURL(finalBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(options.collectionName)}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  return { tokens: total };
}
