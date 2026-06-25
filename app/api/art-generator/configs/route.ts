import { NextResponse } from 'next/server';

import { deleteStoredConfig, listStoredConfigs, saveStoredConfig } from '@/lib/art-generator/config-store';
import { parseSavedConfig } from '@/lib/art-generator/presets';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rootDir = searchParams.get('root')?.trim();

    if (!rootDir) {
      return NextResponse.json({ error: 'Missing root query parameter.' }, { status: 400 });
    }

    const configs = await listStoredConfigs(rootDir);
    return NextResponse.json({ configs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load saved configs.' },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      rootDir?: string;
      config?: unknown;
      rawJson?: string;
    };

    const rootDir = String(payload.rootDir ?? '').trim();
    if (!rootDir) {
      return NextResponse.json({ error: 'Missing rootDir.' }, { status: 400 });
    }

    const config = parseSavedConfig(payload.config);
    const saved = await saveStoredConfig(rootDir, config, payload.rawJson);
    const configs = await listStoredConfigs(rootDir);

    return NextResponse.json({ saved, configs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save config.' },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rootDir = searchParams.get('root')?.trim();
    const configId = searchParams.get('id')?.trim();

    if (!rootDir || !configId) {
      return NextResponse.json({ error: 'Missing root or id query parameter.' }, { status: 400 });
    }

    await deleteStoredConfig(rootDir, configId);
    const configs = await listStoredConfigs(rootDir);
    return NextResponse.json({ configs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete config.' },
      { status: 400 },
    );
  }
}
