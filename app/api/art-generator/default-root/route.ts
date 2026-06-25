import path from 'node:path';

import { NextResponse } from 'next/server';

export async function GET() {
  const defaultRoot = path.resolve(process.cwd(), 'data/art/inputs/v1');
  return NextResponse.json({ rootDir: defaultRoot });
}
