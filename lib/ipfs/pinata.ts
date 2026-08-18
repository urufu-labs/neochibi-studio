'use client';

// Client-side IPFS publish helper. Uploads happen in two directory phases so
// the resulting CIDs match the ERC-721 shape every launchpad and marketplace
// expects:
//   1. all output PNGs pinned as one directory  -> IMAGE_CID
//   2. all metadata JSONs (referencing IMAGE_CID) pinned as one directory
//      -> METADATA_CID (baseURI-compatible)
//
// tokenURI(id) => ipfs://METADATA_CID/{id}.json
// each metadata JSON's image => ipfs://IMAGE_CID/{id}.png

import { getAssetStore } from '@/lib/storage/asset-store';
import type { StoredOutput } from '@/lib/storage/db';

export interface PinProgress {
  phase: 'images' | 'metadata';
  done: number;
  total: number;
}

export interface PinResult {
  metadataCid: string;
  imageCid: string;
  totalTokens: number;
}

interface JwtResponse {
  jwt?: string;
  proxyMode?: boolean;
  error?: string;
}

async function fetchJwt(): Promise<
  | { mode: 'scoped'; jwt: string }
  | { mode: 'proxy' }
  | { mode: 'unavailable'; error: string }
> {
  const response = await fetch('/api/ipfs/mint-jwt', { method: 'POST' });
  if (response.status === 501) {
    const body = (await response.json()) as JwtResponse;
    return { mode: 'unavailable', error: body.error ?? 'PINATA_JWT not configured.' };
  }
  const body = (await response.json()) as JwtResponse;
  if (body.jwt) return { mode: 'scoped', jwt: body.jwt };
  return { mode: 'proxy' };
}

interface DirectoryFile {
  name: string;
  blob: Blob;
}

// Directly hit Pinata from the browser with a scoped JWT. Bypasses our Vercel
// proxy's 100 MB body limit; the ceiling is whatever Pinata's plan allows.
async function pinDirectoryScoped(
  jwt: string,
  files: DirectoryFile[],
  folderName: string,
): Promise<string> {
  const form = new FormData();
  for (const file of files) form.append('file', file.blob, file.name);
  form.append(
    'pinataOptions',
    JSON.stringify({ cidVersion: 1, wrapWithDirectory: true }),
  );
  form.append('pinataMetadata', JSON.stringify({ name: folderName }));

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Directory upload failed (${response.status}): ${text}`);
  }
  const payload = (await response.json()) as { IpfsHash?: string };
  if (!payload.IpfsHash) throw new Error('Directory upload returned no CID.');
  return payload.IpfsHash;
}

// Send through our proxy route. Constrained by Vercel's 100 MB body limit —
// suitable for smaller collections; scoped-JWT mode is preferred for full 10k.
async function pinDirectoryProxied(
  files: DirectoryFile[],
  folderName: string,
): Promise<string> {
  const form = new FormData();
  form.append('mode', 'directory');
  form.append('folderName', folderName);
  for (const file of files) form.append('file', file.blob, file.name);

  const response = await fetch('/api/ipfs/proxy-upload', {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Proxy directory upload failed: ${text}`);
  }
  const payload = (await response.json()) as { cid?: string };
  if (!payload.cid) throw new Error('Proxy directory upload returned no CID.');
  return payload.cid;
}

async function pinDirectory(
  session: { mode: 'scoped'; jwt: string } | { mode: 'proxy' },
  files: DirectoryFile[],
  folderName: string,
): Promise<string> {
  if (session.mode === 'scoped') return pinDirectoryScoped(session.jwt, files, folderName);
  return pinDirectoryProxied(files, folderName);
}

export interface PinOptions {
  collectionName: string;
  description: string;
  onProgress?: (progress: PinProgress) => void;
  shouldAbort?: () => boolean;
}

function buildTokenMetadata(
  output: StoredOutput,
  imageCid: string,
  collectionName: string,
  description: string,
): Record<string, unknown> {
  // Attributes: algorithm-derived + custom-merge-by-trait_type for 1-of-1s.
  const algorithmAttributes = output.traits.map((trait) => ({
    trait_type: trait.layerName,
    value: trait.traitName,
  }));

  let attributes: Array<{ trait_type: string; value: string }> = algorithmAttributes;
  if (output.isStatic && output.customAttributes && output.customAttributes.length > 0) {
    const byType = new Map<string, { trait_type: string; value: string }>();
    for (const attr of algorithmAttributes) byType.set(attr.trait_type, attr);
    for (const attr of output.customAttributes) byType.set(attr.trait_type, attr);
    attributes = Array.from(byType.values());
  }
  if (output.isStatic) {
    attributes = [...attributes, { trait_type: 'edition', value: '1 of 1' }];
  }

  const name = output.customName
    ? output.customName
    : `${collectionName || 'Untitled Collection'} #${output.tokenId}`;
  const finalDescription = output.customDescription ?? description ?? '';

  // OpenSea ERC-721 shape. Only include fields we have data for — OpenSea
  // prefers absent fields to empty ones.
  const metadata: Record<string, unknown> = {
    name,
    description: finalDescription,
    image: `ipfs://${imageCid}/${output.tokenId}.png`,
    attributes,
  };
  return metadata;
}

export async function pinCollection(options: PinOptions): Promise<PinResult> {
  const session = await fetchJwt();
  if (session.mode === 'unavailable') throw new Error(session.error);

  const store = getAssetStore();
  const outputs = await store.listOutputs();
  if (outputs.length === 0) throw new Error('Generate a collection before pinning.');

  const total = outputs.length;

  // Phase 1: gather images, pin as one directory.
  if (options.shouldAbort?.()) throw new Error('Cancelled.');
  options.onProgress?.({ phase: 'images', done: 0, total });

  const imageFiles: DirectoryFile[] = [];
  for (const output of outputs as StoredOutput[]) {
    if (options.shouldAbort?.()) throw new Error('Cancelled.');
    const blob = await store.getOutputBlob(output.tokenId);
    if (!blob) continue;
    imageFiles.push({ name: `${output.tokenId}.png`, blob });
  }
  if (imageFiles.length === 0) throw new Error('No output images found in storage.');

  const folderBase =
    (options.collectionName || 'collection')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'collection';

  const imageCid = await pinDirectory(session, imageFiles, `${folderBase}-images`);
  options.onProgress?.({ phase: 'images', done: total, total });

  if (options.shouldAbort?.()) throw new Error('Cancelled.');

  // Phase 2: build all metadata JSONs referencing imageCid, pin as directory.
  options.onProgress?.({ phase: 'metadata', done: 0, total });

  const metadataFiles: DirectoryFile[] = [];
  for (const output of outputs as StoredOutput[]) {
    const metadata = buildTokenMetadata(
      output,
      imageCid,
      options.collectionName || 'Untitled Collection',
      options.description || '',
    );
    const blob = new Blob([JSON.stringify(metadata, null, 2)], {
      type: 'application/json',
    });
    metadataFiles.push({ name: `${output.tokenId}.json`, blob });
  }

  const metadataCid = await pinDirectory(
    session,
    metadataFiles,
    `${folderBase}-metadata`,
  );
  options.onProgress?.({ phase: 'metadata', done: total, total });

  return {
    metadataCid,
    imageCid,
    totalTokens: outputs.length,
  };
}
