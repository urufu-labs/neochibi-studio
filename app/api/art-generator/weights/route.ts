import { NextResponse } from 'next/server';

import { readTraitWeights, writeTraitWeights } from '@/lib/art-generator/weights-store';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rootDir = searchParams.get('root')?.trim();

    if (!rootDir) {
      return NextResponse.json({ error: 'Missing root query parameter.' }, { status: 400 });
    }

    const weights = await readTraitWeights(rootDir);
    return NextResponse.json({ weights });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load trait weights.' },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      rootDir?: string;
      weights?: unknown;
    };

    const rootDir = String(payload.rootDir ?? '').trim();
    if (!rootDir) {
      return NextResponse.json({ error: 'Missing rootDir.' }, { status: 400 });
    }

    const weights = await writeTraitWeights(rootDir, (payload.weights as Record<string, number>) ?? {});
    return NextResponse.json({ weights });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save trait weights.' },
      { status: 400 },
    );
  }
}
