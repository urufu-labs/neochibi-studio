import { NextResponse } from 'next/server';

// Proxy Pinata upload — used when scoped-key mode is unavailable. Two modes:
//   - single: one file per request. Returns { cid, size, timestamp }.
//   - directory: multiple files in one request, treated by Pinata as a single
//                directory. Returns the directory CID.
//
// Directory mode has a hard Vercel body limit of 100 MB per request. For
// larger collections use scoped-key mode from the client (browser -> Pinata
// direct) which bypasses this route entirely.

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
  const mode = (form.get('mode') ?? 'single').toString();

  if (mode === 'directory') {
    const files = form.getAll('file').filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files supplied.' }, { status: 400 });
    }
    const folderName = (form.get('folderName') ?? 'collection').toString();

    const upstream = new FormData();
    for (const file of files) {
      // Pinata infers a directory from a shared path prefix. Multiple flat
      // filenames trigger "More than one file and/or directory was provided
      // for pinning"; prefixing every entry with the same root folds them
      // into one wrapped directory.
      upstream.append('file', file, `${folderName}/${file.name}`);
    }
    upstream.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
    upstream.append('pinataMetadata', JSON.stringify({ name: folderName }));

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: upstream,
    });
    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Directory upload failed: ${response.status} ${text}` },
        { status: 502 },
      );
    }
    const payload = (await response.json()) as {
      IpfsHash?: string;
      PinSize?: number;
      Timestamp?: string;
    };
    if (!payload.IpfsHash) {
      return NextResponse.json(
        { error: 'Pinata response missing IpfsHash.' },
        { status: 502 },
      );
    }
    return NextResponse.json({
      cid: payload.IpfsHash,
      size: payload.PinSize,
      timestamp: payload.Timestamp,
    });
  }

  // single-file mode (legacy).
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
    return NextResponse.json(
      { error: `Pinata upload failed: ${response.status} ${text}` },
      { status: 502 },
    );
  }
  const payload = (await response.json()) as {
    IpfsHash?: string;
    PinSize?: number;
    Timestamp?: string;
  };
  if (!payload.IpfsHash) {
    return NextResponse.json({ error: 'Pinata response missing IpfsHash.' }, { status: 502 });
  }
  return NextResponse.json({
    cid: payload.IpfsHash,
    size: payload.PinSize,
    timestamp: payload.Timestamp,
  });
}
