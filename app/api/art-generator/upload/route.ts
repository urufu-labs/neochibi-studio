import { NextResponse } from 'next/server';

import { saveUploadedTrait, scanTraitRoot } from '@/lib/art-generator/library';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const rootDir = String(formData.get('rootDir') ?? '').trim();
    const layerName = String(formData.get('layerName') ?? '').trim();
    const layerOrderValue = String(formData.get('layerOrder') ?? '').trim();
    const file = formData.get('file');

    if (!rootDir) {
      return NextResponse.json({ error: 'Missing rootDir.' }, { status: 400 });
    }

    if (!layerName) {
      return NextResponse.json({ error: 'Missing layerName.' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file upload.' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const preferredOrder = layerOrderValue ? Number(layerOrderValue) : undefined;

    const upload = await saveUploadedTrait({
      rootDir,
      layerName,
      fileName: file.name,
      bytes,
      preferredOrder: preferredOrder && Number.isFinite(preferredOrder) ? preferredOrder : undefined,
    });

    const library = await scanTraitRoot(rootDir);

    return NextResponse.json({
      upload,
      library,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload trait.' },
      { status: 400 },
    );
  }
}
