import { NextResponse } from 'next/server';

// Server-only endpoint. The client asks for a short-lived, upload-only Pinata
// key so we never ship the master PINATA_JWT to the browser.
//
// Behavior:
//   - If PINATA_JWT is unset, respond 501 so the UI can disable itself with a
//     friendly hint.
//   - Otherwise try to mint a scoped key via Pinata v3 /pinata/keys. If that
//     fails (paid feature, plan restrictions), fall back to proxy mode so the
//     server pipes the upload through instead.

export const runtime = 'nodejs';

export async function POST() {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json(
      { error: 'PINATA_JWT not configured. Add it to .env.local to enable the "Push to IPFS" flow.' },
      { status: 501 },
    );
  }

  // Attempt to mint a scoped upload key.
  try {
    const response = await fetch('https://api.pinata.cloud/v3/pinata/keys', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keyName: `neochibi-upload-${Date.now()}`,
        maxUses: 200,
        permissions: {
          endpoints: {
            pinning: { pinFileToIPFS: true },
          },
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const snippet = body ? ` — ${body.slice(0, 240)}` : '';
      throw new Error(`Pinata key mint failed (${response.status})${snippet}`);
    }
    const payload = (await response.json()) as { JWT?: string; pinata_api_key?: string };
    if (!payload.JWT) throw new Error('Pinata key response missing JWT.');
    // Short-lived: caller should discard after the current upload session.
    return NextResponse.json({ jwt: payload.JWT, proxyMode: false });
  } catch (error) {
    // Fallback: proxy mode. The browser POSTs to /api/ipfs/proxy-upload which
    // pipes the multipart through to Pinata — but that path is capped at
    // Vercel's ~100 MB function body limit, so full 10k collections will fail.
    // Surface the exact reason so the UI can explain why scoped mode isn't
    // available (usually: master JWT lacks Admin scope, or the account plan
    // doesn't allow programmatic scoped-key creation).
    return NextResponse.json({
      proxyMode: true,
      note: error instanceof Error ? error.message : 'Scoped key mint unavailable.',
    });
  }
}
