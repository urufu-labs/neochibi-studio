import { NextResponse } from 'next/server';

import { scanTraitRoot } from '@/lib/art-generator/library';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rootDir = searchParams.get('root')?.trim();

  if (!rootDir) {
    return NextResponse.json({ error: 'Missing root query parameter.' }, { status: 400 });
  }

  try {
    const library = await scanTraitRoot(rootDir);
    return NextResponse.json(library);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to scan trait root.' },
      { status: 400 },
    );
  }
}
