import { NextResponse } from 'next/server';

// Proxy Pinata upload — used when the free tier can't mint scoped keys.
// Streams the incoming multipart body straight through to Pinata using the
// server-held PINATA_JWT. The client uploads one file at a time and gets back
// the file's CID; the client is responsible for aggregation (name each file
// as `{tokenId}.png` and Pinata will not create a wrap-directory, so the
// client can pin the metadata JSON as a manifest CID separately).

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json(
      { error: 'PINATA_JWT not configured.' },
      { status: 501 },
    );
  }

  const form = await request.formData();
  const file = form.get('file');
  const name = form.get('name');
  if (!(file instanceof Blob) || typeof name !== 'string') {
    return NextResponse.json({ error: 'Missing file or name.' }, { status: 400 });
  }
  const wrapWithDirectory = form.get('wrapWithDirectory') === 'true';

  const upstream = new FormData();
  upstream.append('file', file, name);
  upstream.append('pinataOptions', JSON.stringify({ cidVersion: 1, wrapWithDirectory }));
  upstream.append('pinataMetadata', JSON.stringify({ name }));

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: upstream,
  });
  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: `Pinata upload failed: ${response.status} ${text}` }, { status: 502 });
  }
  const payload = (await response.json()) as { IpfsHash?: string; PinSize?: number; Timestamp?: string };
  if (!payload.IpfsHash) {
    return NextResponse.json({ error: 'Pinata response missing IpfsHash.' }, { status: 502 });
  }
  return NextResponse.json({ cid: payload.IpfsHash, size: payload.PinSize, timestamp: payload.Timestamp });
}
