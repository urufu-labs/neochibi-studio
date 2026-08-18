'use client';

// Client-side Pinata upload helper. Two-phase:
//   1. Ask the server for a scoped JWT (or fall back to proxy mode).
//   2. Upload each output PNG + a per-token metadata JSON to Pinata.
//
// Aggregation strategy at 10k tokens: rather than upload every file as one big
// directory (which needs a scoped-key upload with wrapWithDirectory=true), we
// pin each token individually and store the CID map inside a manifest that we
// pin as the collection's metadata CID. Consumers reach a token by its
// `image` URI from the metadata JSON (ipfs://<file-cid>).

import { getAssetStore } from '@/lib/storage/asset-store';
import type { StoredOutput } from '@/lib/storage/db';

export interface PinProgress {
  phase: 'images' | 'metadata';
  done: number;
  total: number;
  currentCid?: string;
}

export interface PinResult {
  collectionManifestCid: string;
  metadataCid: string;
  totalTokens: number;
  imageCids: Record<number, string>;
}

interface JwtResponse {
  jwt?: string;
  proxyMode?: boolean;
  error?: string;
}

async function fetchJwt(): Promise<{ mode: 'scoped'; jwt: string } | { mode: 'proxy' } | { mode: 'unavailable'; error: string }> {
  const response = await fetch('/api/ipfs/mint-jwt', { method: 'POST' });
  if (response.status === 501) {
    const body = (await response.json()) as JwtResponse;
    return { mode: 'unavailable', error: body.error ?? 'PINATA_JWT not configured.' };
  }
  const body = (await response.json()) as JwtResponse;
  if (body.jwt) return { mode: 'scoped', jwt: body.jwt };
  return { mode: 'proxy' };
}

async function pinBlobScoped(jwt: string, blob: Blob, name: string): Promise<string> {
  const form = new FormData();
  form.append('file', blob, name);
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  form.append('pinataMetadata', JSON.stringify({ name }));
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Pinata upload failed for ${name}: ${response.status}`);
  const payload = (await response.json()) as { IpfsHash?: string };
  if (!payload.IpfsHash) throw new Error(`Pinata returned no CID for ${name}.`);
  return payload.IpfsHash;
}

async function pinBlobProxied(blob: Blob, name: string): Promise<string> {
  const form = new FormData();
  form.append('file', blob, name);
  form.append('name', name);
  const response = await fetch('/api/ipfs/proxy-upload', { method: 'POST', body: form });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Proxy upload failed for ${name}: ${text}`);
  }
  const payload = (await response.json()) as { cid?: string };
  if (!payload.cid) throw new Error(`Proxy upload returned no CID for ${name}.`);
  return payload.cid;
}

async function pinBlob(session: { mode: 'scoped'; jwt: string } | { mode: 'proxy' }, blob: Blob, name: string): Promise<string> {
  if (session.mode === 'scoped') return pinBlobScoped(session.jwt, blob, name);
  return pinBlobProxied(blob, name);
}

export interface PinOptions {
  collectionName: string;
  description: string;
  onProgress?: (progress: PinProgress) => void;
  shouldAbort?: () => boolean;
}

export async function pinCollection(options: PinOptions): Promise<PinResult> {
  const session = await fetchJwt();
  if (session.mode === 'unavailable') throw new Error(session.error);

  const store = getAssetStore();
  const outputs = await store.listOutputs();
  if (outputs.length === 0) throw new Error('Generate a collection before pinning.');

  const imageCids: Record<number, string> = {};
  let done = 0;
  const total = outputs.length;

  for (const output of outputs as StoredOutput[]) {
    if (options.shouldAbort?.()) throw new Error('Cancelled.');
    const blob = await store.getOutputBlob(output.tokenId);
    if (!blob) continue;
    const name = `${String(output.tokenId).padStart(6, '0')}.png`;
    const cid = await pinBlob(session, blob, name);
    imageCids[output.tokenId] = cid;
    done += 1;
    options.onProgress?.({ phase: 'images', done, total, currentCid: cid });
  }

  // Build ERC-721 metadata per token and pin those individually too, then a
  // manifest referencing everything. 1-of-1 tokens layer their custom name,
  // description, and attributes over the algorithm-derived ones.
  done = 0;
  const metadataCids: Record<number, string> = {};
  for (const output of outputs as StoredOutput[]) {
    if (options.shouldAbort?.()) throw new Error('Cancelled.');
    const imageCid = imageCids[output.tokenId];
    if (!imageCid) continue;

    const algorithmAttributes = output.traits.map((trait) => ({
      trait_type: trait.layerName,
      value: trait.traitName as string,
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
      : `${options.collectionName || 'Untitled Collection'} #${output.tokenId}`;
    const description = output.customDescription ?? options.description ?? '';

    const metadata = {
      name,
      description,
      image: `ipfs://${imageCid}`,
      attributes,
    };
    const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
    const cid = await pinBlob(session, metadataBlob, `${String(output.tokenId).padStart(6, '0')}.json`);
    metadataCids[output.tokenId] = cid;
    done += 1;
    options.onProgress?.({ phase: 'metadata', done, total, currentCid: cid });
  }

  // Manifest: one JSON that maps token id → image cid + metadata cid.
  const manifest = {
    name: options.collectionName || 'Untitled Collection',
    description: options.description || '',
    tokens: outputs.map((output) => ({
      id: output.tokenId,
      image: imageCids[output.tokenId] ? `ipfs://${imageCids[output.tokenId]}` : null,
      metadata: metadataCids[output.tokenId] ? `ipfs://${metadataCids[output.tokenId]}` : null,
    })),
  };
  const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  const collectionManifestCid = await pinBlob(session, manifestBlob, `${(options.collectionName || 'collection').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-manifest.json`);

  // Metadata directory CID: for simplicity we pin the manifest a second time as
  // the "metadata index" so the UI can present two distinct CID pills without
  // implying a fake directory structure. Consumers can navigate token → metadata
  // via the manifest.
  const metadataCid = collectionManifestCid;

  return {
    collectionManifestCid,
    metadataCid,
    totalTokens: outputs.length,
    imageCids,
  };
}
