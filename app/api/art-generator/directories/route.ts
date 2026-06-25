import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

function isInside(base: string, target: string): boolean {
  const relative = path.relative(base, target);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const currentPath = searchParams.get('path')?.trim() || path.resolve(process.cwd(), '..', 'data/art/inputs/v1');
    const resolvedCurrent = path.resolve(currentPath);
    const projectRoot = path.resolve(process.cwd(), '..');
    const parent = path.dirname(resolvedCurrent);

    const entries = await readdir(resolvedCurrent, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: path.join(resolvedCurrent, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));

    return NextResponse.json({
      currentPath: resolvedCurrent,
      parentPath: isInside(projectRoot, parent) ? parent : projectRoot,
      directories,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list directories.' },
      { status: 400 },
    );
  }
}
