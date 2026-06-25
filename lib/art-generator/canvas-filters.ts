export interface PreviewEffectParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export interface PreviewEffect {
  id: string;
  enabled: boolean;
  options?: Record<string, number>;
}

export interface PreviewEffectDef {
  id: string;
  label: string;
  description: string;
  params: PreviewEffectParam[];
  apply: (canvas: HTMLCanvasElement, options: Record<string, number>) => void;
}

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }
  return ctx;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function applyPixelMosaic(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const blockSize = Math.max(1, Math.round(options.blockSize ?? 10));
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  const scaled = document.createElement('canvas');
  scaled.width = Math.max(1, Math.floor(width / blockSize));
  scaled.height = Math.max(1, Math.floor(height / blockSize));
  const scaledCtx = scaled.getContext('2d');
  if (!scaledCtx) return;
  scaledCtx.imageSmoothingEnabled = false;
  scaledCtx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(scaled, 0, 0, scaled.width, scaled.height, 0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
}

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function applyDither(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const levels = Math.max(2, Math.round(options.levels ?? 4));
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const step = 255 / (levels - 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const threshold = (BAYER_4X4[y & 3][x & 3] / 16 - 0.5) * (step * 0.9);
      for (let c = 0; c < 3; c++) {
        const v = data[i + c] + threshold;
        data[i + c] = Math.max(0, Math.min(255, Math.round(v / step) * step));
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

function applyPosterize(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const levels = Math.max(2, Math.round(options.levels ?? 5));
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i] / step) * step;
    data[i + 1] = Math.round(data[i + 1] / step) * step;
    data[i + 2] = Math.round(data[i + 2] / step) * step;
  }
  ctx.putImageData(image, 0, 0);
}

function applyScanlines(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const gap = Math.max(1, Math.round(options.gap ?? 3));
  const alpha = Math.max(0, Math.min(1, options.alpha ?? 0.25));
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < height; y += gap) {
    ctx.fillRect(0, y, width, 1);
  }
  ctx.restore();
}

function applyVHS(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const intensity = Math.max(0, Math.min(1, options.intensity ?? 0.5));
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  const src = ctx.getImageData(0, 0, width, height);
  const out = ctx.createImageData(width, height);
  const s = src.data;
  const o = out.data;
  const chroma = Math.max(1, Math.round(width * 0.008 * intensity + 1));
  const jitterAmp = 6 * intensity;
  const rand = mulberry32(0xbadf00d);
  for (let y = 0; y < height; y++) {
    const jitter = Math.round((rand() - 0.5) * jitterAmp);
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      const rx = Math.min(width - 1, Math.max(0, x - chroma + jitter));
      const gx = Math.min(width - 1, Math.max(0, x + jitter));
      const bx = Math.min(width - 1, Math.max(0, x + chroma + jitter));
      o[di] = s[(y * width + rx) * 4];
      o[di + 1] = s[(y * width + gx) * 4 + 1];
      o[di + 2] = s[(y * width + bx) * 4 + 2];
      o[di + 3] = s[(y * width + gx) * 4 + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.2 * intensity;
  ctx.fillStyle = '#000';
  for (let y = 0; y < height; y += 2) {
    ctx.fillRect(0, y, width, 1);
  }
  ctx.restore();
}

function applyGlitch(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const sliceCount = Math.max(1, Math.round(options.sliceCount ?? 10));
  const shift = Math.max(0, Math.round(options.shift ?? 14));
  const chromaShift = Math.max(0, Math.round(options.chromaShift ?? 4));
  const seed = Math.round(options.seed ?? 1337);
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  const snapshot = document.createElement('canvas');
  snapshot.width = width;
  snapshot.height = height;
  snapshot.getContext('2d')?.drawImage(canvas, 0, 0);
  const rand = mulberry32(seed);
  for (let i = 0; i < sliceCount; i++) {
    const sliceY = Math.floor(rand() * height);
    const sliceH = Math.max(2, Math.floor(rand() * (height / sliceCount)));
    const dx = Math.round((rand() - 0.5) * 2 * shift);
    ctx.drawImage(snapshot, 0, sliceY, width, sliceH, dx, sliceY, width, sliceH);
  }
  if (chromaShift === 0) return;
  const src = ctx.getImageData(0, 0, width, height);
  const out = ctx.createImageData(width, height);
  const s = src.data;
  const o = out.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      const rx = Math.min(width - 1, Math.max(0, x + chromaShift));
      const bx = Math.min(width - 1, Math.max(0, x - chromaShift));
      o[di] = s[(y * width + rx) * 4];
      o[di + 1] = s[di + 1];
      o[di + 2] = s[(y * width + bx) * 4 + 2];
      o[di + 3] = s[di + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

function applyChromaticAberration(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const shift = Math.max(0, Math.round(options.shift ?? 6));
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  const src = ctx.getImageData(0, 0, width, height);
  const out = ctx.createImageData(width, height);
  const s = src.data;
  const o = out.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      const rx = Math.min(width - 1, Math.max(0, x - shift));
      const bx = Math.min(width - 1, Math.max(0, x + shift));
      o[di] = s[(y * width + rx) * 4];
      o[di + 1] = s[di + 1];
      o[di + 2] = s[(y * width + bx) * 4 + 2];
      o[di + 3] = s[di + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

function applyNoise(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const intensity = Math.max(0, options.intensity ?? 12);
  const chromatic = Math.max(0, Math.min(1, options.chromatic ?? 0.4));
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const rand = mulberry32(0xc0ffee);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const luma = (rand() - 0.5) * 2 * intensity;
    const rJitter = (rand() - 0.5) * 2 * intensity * chromatic;
    const gJitter = (rand() - 0.5) * 2 * intensity * chromatic;
    const bJitter = (rand() - 0.5) * 2 * intensity * chromatic;
    data[i] = Math.max(0, Math.min(255, data[i] + luma + rJitter));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + luma + gJitter));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + luma + bJitter));
  }
  ctx.putImageData(image, 0, 0);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hueToRgbChannel(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hn = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToRgbChannel(p, q, hn + 1 / 3) * 255,
    hueToRgbChannel(p, q, hn) * 255,
    hueToRgbChannel(p, q, hn - 1 / 3) * 255,
  ];
}

function applyHueShift(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const degrees = options.degrees ?? 180;
  if (degrees === 0) return;
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const [r, g, b] = hslToRgb(h + degrees, s, l);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  ctx.putImageData(image, 0, 0);
}

function applySaturation(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const factor = Math.max(0, options.factor ?? 0.5);
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const [r, g, b] = hslToRgb(h, Math.min(1, s * factor), l);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  ctx.putImageData(image, 0, 0);
}

function applyBrightnessContrast(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const brightness = options.brightness ?? 0;
  const contrast = options.contrast ?? 0;
  const cf = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = Math.max(0, Math.min(255, cf * (data[i] - 128) + 128 + brightness));
    data[i + 1] = Math.max(0, Math.min(255, cf * (data[i + 1] - 128) + 128 + brightness));
    data[i + 2] = Math.max(0, Math.min(255, cf * (data[i + 2] - 128) + 128 + brightness));
  }
  ctx.putImageData(image, 0, 0);
}

function applyInvert(canvas: HTMLCanvasElement): void {
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  ctx.putImageData(image, 0, 0);
}

function applyHalftone(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const cellSize = Math.max(2, Math.round(options.cellSize ?? 10));
  const inkAmount = Math.max(0, Math.min(1, options.ink ?? 1));
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  const src = ctx.getImageData(0, 0, width, height);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';
  const maxRadius = (cellSize / 2) * 1.05 * inkAmount;
  for (let y = 0; y < height; y += cellSize) {
    for (let x = 0; x < width; x += cellSize) {
      let lumaSum = 0;
      let alphaSum = 0;
      let samples = 0;
      for (let dy = 0; dy < cellSize && y + dy < height; dy++) {
        for (let dx = 0; dx < cellSize && x + dx < width; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          lumaSum += 0.2126 * src.data[i] + 0.7152 * src.data[i + 1] + 0.0722 * src.data[i + 2];
          alphaSum += src.data[i + 3];
          samples += 1;
        }
      }
      if (samples === 0 || alphaSum / samples < 20) continue;
      const luma = lumaSum / samples / 255;
      const radius = maxRadius * (1 - luma);
      if (radius < 0.3) continue;
      ctx.beginPath();
      ctx.arc(x + cellSize / 2, y + cellSize / 2, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function applyDuotone(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const shadowHue = options.shadowHue ?? 260;
  const highlightHue = options.highlightHue ?? 35;
  const saturation = Math.max(0, Math.min(1, options.saturation ?? 0.7));
  const [sr, sg, sb] = hslToRgb(shadowHue, saturation, 0.2);
  const [hr, hg, hb] = hslToRgb(highlightHue, saturation, 0.82);
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    data[i] = sr + (hr - sr) * luma;
    data[i + 1] = sg + (hg - sg) * luma;
    data[i + 2] = sb + (hb - sb) * luma;
  }
  ctx.putImageData(image, 0, 0);
}

function applyCRT(canvas: HTMLCanvasElement, options: Record<string, number>): void {
  const scanlineAlpha = Math.max(0, Math.min(1, options.scanlineAlpha ?? 0.22));
  const vignette = Math.max(0, Math.min(1, options.vignette ?? 0.55));
  const gap = Math.max(1, Math.round(options.gap ?? 3));
  const ctx = getContext(canvas);
  const { width, height } = canvas;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${scanlineAlpha})`;
  for (let y = 0; y < height; y += gap) {
    ctx.fillRect(0, y, width, 1);
  }
  const grad = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.72);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${vignette})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export const PREVIEW_EFFECTS: ReadonlyArray<PreviewEffectDef> = [
  {
    id: 'hue',
    label: 'Hue shift',
    description: 'Rotate every pixel’s hue around the color wheel.',
    params: [{ key: 'degrees', label: 'Degrees', min: 0, max: 360, step: 1, defaultValue: 180 }],
    apply: applyHueShift,
  },
  {
    id: 'saturation',
    label: 'Saturation',
    description: 'Scale saturation. 0 = grayscale, 1 = unchanged, 2 = punchy.',
    params: [{ key: 'factor', label: 'Factor', min: 0, max: 2, step: 0.05, defaultValue: 0.5 }],
    apply: applySaturation,
  },
  {
    id: 'brightness-contrast',
    label: 'Brightness / Contrast',
    description: 'Classic brightness offset plus contrast multiplier.',
    params: [
      { key: 'brightness', label: 'Brightness', min: -100, max: 100, step: 1, defaultValue: 0 },
      { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, defaultValue: 30 },
    ],
    apply: applyBrightnessContrast,
  },
  {
    id: 'invert',
    label: 'Invert',
    description: 'Photographic negative.',
    params: [],
    apply: applyInvert,
  },
  {
    id: 'duotone',
    label: 'Duotone',
    description: 'Remap luminance between shadow and highlight hues.',
    params: [
      { key: 'shadowHue', label: 'Shadow hue', min: 0, max: 360, step: 1, defaultValue: 260 },
      { key: 'highlightHue', label: 'Highlight hue', min: 0, max: 360, step: 1, defaultValue: 35 },
      { key: 'saturation', label: 'Saturation', min: 0, max: 1, step: 0.05, defaultValue: 0.7 },
    ],
    apply: applyDuotone,
  },
  {
    id: 'halftone',
    label: 'Halftone',
    description: 'B&W dot pattern sized by source luminance.',
    params: [
      { key: 'cellSize', label: 'Cell size', min: 3, max: 30, step: 1, defaultValue: 8 },
      { key: 'ink', label: 'Ink', min: 0.2, max: 1.2, step: 0.05, defaultValue: 0.95 },
    ],
    apply: applyHalftone,
  },
  {
    id: 'pixel-mosaic',
    label: 'Pixel mosaic',
    description: 'Downsample into blocky pixels.',
    params: [{ key: 'blockSize', label: 'Block size', min: 2, max: 40, step: 1, defaultValue: 6 }],
    apply: applyPixelMosaic,
  },
  {
    id: 'dither',
    label: 'Dither',
    description: 'Ordered 4×4 Bayer dither.',
    params: [{ key: 'levels', label: 'Levels', min: 2, max: 8, step: 1, defaultValue: 4 }],
    apply: applyDither,
  },
  {
    id: 'posterize',
    label: 'Posterize',
    description: 'Flatten color bands.',
    params: [{ key: 'levels', label: 'Levels', min: 2, max: 12, step: 1, defaultValue: 5 }],
    apply: applyPosterize,
  },
  {
    id: 'chromatic',
    label: 'Chromatic aberration',
    description: 'Split RGB channels horizontally.',
    params: [{ key: 'shift', label: 'Shift', min: 0, max: 30, step: 1, defaultValue: 6 }],
    apply: applyChromaticAberration,
  },
  {
    id: 'glitch',
    label: 'Glitch',
    description: 'Horizontal slice displacement + RGB fringe.',
    params: [
      { key: 'shift', label: 'Shift', min: 0, max: 80, step: 1, defaultValue: 14 },
      { key: 'sliceCount', label: 'Slices', min: 1, max: 40, step: 1, defaultValue: 10 },
      { key: 'chromaShift', label: 'Chroma split', min: 0, max: 30, step: 1, defaultValue: 4 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, defaultValue: 1337 },
    ],
    apply: applyGlitch,
  },
  {
    id: 'vhs',
    label: 'VHS',
    description: 'Chroma bleed, jitter, and scanlines.',
    params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 1, step: 0.05, defaultValue: 0.5 }],
    apply: applyVHS,
  },
  {
    id: 'scanlines',
    label: 'Scanlines',
    description: 'Thin dark horizontal lines.',
    params: [
      { key: 'gap', label: 'Gap', min: 1, max: 10, step: 1, defaultValue: 3 },
      { key: 'alpha', label: 'Opacity', min: 0, max: 0.6, step: 0.02, defaultValue: 0.25 },
    ],
    apply: applyScanlines,
  },
  {
    id: 'noise',
    label: 'Noise',
    description: 'Per-pixel luminance jitter.',
    params: [
      { key: 'intensity', label: 'Intensity', min: 0, max: 60, step: 1, defaultValue: 12 },
      { key: 'chromatic', label: 'Chromatic', min: 0, max: 1, step: 0.05, defaultValue: 0.4 },
    ],
    apply: applyNoise,
  },
  {
    id: 'crt',
    label: 'CRT',
    description: 'Scanlines plus a radial vignette.',
    params: [
      { key: 'scanlineAlpha', label: 'Scanlines', min: 0, max: 0.6, step: 0.02, defaultValue: 0.18 },
      { key: 'vignette', label: 'Vignette', min: 0, max: 0.9, step: 0.02, defaultValue: 0.4 },
      { key: 'gap', label: 'Scanline gap', min: 1, max: 12, step: 1, defaultValue: 3 },
    ],
    apply: applyCRT,
  },
];

export const EFFECT_DEF_BY_ID: Map<string, PreviewEffectDef> = new Map(PREVIEW_EFFECTS.map((def) => [def.id, def]));

export function defaultOptionsFor(def: PreviewEffectDef): Record<string, number> {
  return def.params.reduce<Record<string, number>>((acc, p) => {
    acc[p.key] = p.defaultValue;
    return acc;
  }, {});
}

export const DEFAULT_PREVIEW_EFFECTS: PreviewEffect[] = PREVIEW_EFFECTS.map((def) => ({
  id: def.id,
  enabled: false,
  options: defaultOptionsFor(def),
}));

function normalizeOptions(def: PreviewEffectDef, input: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  for (const param of def.params) {
    const raw = source[param.key];
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : param.defaultValue;
    out[param.key] = Math.min(param.max, Math.max(param.min, value));
  }
  return out;
}

export function normalizePreviewEffects(input: unknown): PreviewEffect[] {
  const known = EFFECT_DEF_BY_ID;
  const seen = new Set<string>();
  const result: PreviewEffect[] = [];

  if (Array.isArray(input)) {
    for (const entry of input) {
      if (!entry || typeof entry !== 'object') continue;
      const id = String((entry as { id?: unknown }).id ?? '');
      const def = known.get(id);
      if (!def || seen.has(id)) continue;
      seen.add(id);
      result.push({
        id,
        enabled: Boolean((entry as { enabled?: unknown }).enabled),
        options: normalizeOptions(def, (entry as { options?: unknown }).options),
      });
    }
  }

  for (const def of PREVIEW_EFFECTS) {
    if (!seen.has(def.id)) {
      result.push({ id: def.id, enabled: false, options: defaultOptionsFor(def) });
    }
  }

  return result;
}

export function applyEffects(canvas: HTMLCanvasElement, effects: PreviewEffect[]): void {
  for (const entry of effects) {
    if (!entry.enabled) continue;
    const def = EFFECT_DEF_BY_ID.get(entry.id);
    if (!def) continue;
    const options = entry.options ?? defaultOptionsFor(def);
    def.apply(canvas, options);
  }
}

export function renderForegroundEffectsComposite(
  target: HTMLCanvasElement,
  background: HTMLCanvasElement | null,
  foreground: HTMLCanvasElement | null,
  effects: PreviewEffect[],
): void {
  const width = Math.max(background?.width ?? 0, foreground?.width ?? 0);
  const height = Math.max(background?.height ?? 0, foreground?.height ?? 0);
  if (width <= 0 || height <= 0) return;

  if (target.width !== width || target.height !== height) {
    target.width = width;
    target.height = height;
  }

  const ctx = target.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }

  ctx.clearRect(0, 0, width, height);
  if (background) ctx.drawImage(background, 0, 0, width, height);
  if (foreground) ctx.drawImage(foreground, 0, 0, width, height);

  if (!effects.some((entry) => entry.enabled)) return;

  // Snapshot composite alpha so background-fill effects (halftone, duotone)
  // don't bleed into transparent pixels when no background trait is selected.
  const before = ctx.getImageData(0, 0, width, height);
  applyEffects(target, effects);
  const after = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < after.data.length; i += 4) {
    after.data[i] = before.data[i];
  }
  ctx.putImageData(after, 0, 0);
}

export function hasPixelatedEffect(effects: PreviewEffect[]): boolean {
  return effects.some((e) => e.enabled && (e.id === 'pixel-mosaic' || e.id === 'dither'));
}

export interface PreviewEffectPreset {
  id: string;
  label: string;
  description: string;
  stack: Array<{ id: string; options?: Record<string, number> }>;
}

export const PREVIEW_EFFECT_PRESETS: ReadonlyArray<PreviewEffectPreset> = [
  {
    id: 'vhs-tape',
    label: 'VHS tape',
    description: 'Chroma bleed, scanlines, and grain.',
    stack: [
      { id: 'vhs', options: { intensity: 0.7 } },
      { id: 'scanlines', options: { gap: 3, alpha: 0.22 } },
      { id: 'noise', options: { intensity: 10 } },
    ],
  },
  {
    id: 'cursed-jpeg',
    label: 'Cursed JPEG',
    description: 'Over-compressed internet artifact.',
    stack: [
      { id: 'posterize', options: { levels: 4 } },
      { id: 'chromatic', options: { shift: 8 } },
      { id: 'noise', options: { intensity: 22 } },
    ],
  },
  {
    id: 'cute-pixel',
    label: 'Cute pixel',
    description: 'Chunky pixels + dither + punchy color.',
    stack: [
      { id: 'saturation', options: { factor: 1.35 } },
      { id: 'pixel-mosaic', options: { blockSize: 8 } },
      { id: 'dither', options: { levels: 5 } },
    ],
  },
  {
    id: 'halftone-print',
    label: 'Halftone print',
    description: 'Two-tone duotone plus a halftone dot screen.',
    stack: [
      { id: 'duotone', options: { shadowHue: 280, highlightHue: 40, saturation: 0.65 } },
      { id: 'halftone', options: { cellSize: 8, ink: 0.95 } },
    ],
  },
  {
    id: 'night-vision',
    label: 'Night vision',
    description: 'Green-phosphor surveillance footage.',
    stack: [
      { id: 'saturation', options: { factor: 0 } },
      { id: 'duotone', options: { shadowHue: 140, highlightHue: 95, saturation: 1 } },
      { id: 'scanlines', options: { gap: 2, alpha: 0.3 } },
      { id: 'noise', options: { intensity: 14 } },
    ],
  },
  {
    id: 'polaroid',
    label: 'Polaroid',
    description: 'Warm, slightly faded film snapshot.',
    stack: [
      { id: 'saturation', options: { factor: 0.8 } },
      { id: 'brightness-contrast', options: { brightness: 8, contrast: 18 } },
      { id: 'hue', options: { degrees: 12 } },
      { id: 'noise', options: { intensity: 6 } },
    ],
  },
  {
    id: 'crt-retro',
    label: 'CRT retro',
    description: 'Fat scanlines, fake curvature vignette.',
    stack: [
      { id: 'saturation', options: { factor: 1.2 } },
      { id: 'pixel-mosaic', options: { blockSize: 4 } },
      { id: 'crt', options: { scanlineAlpha: 0.32, vignette: 0.65 } },
    ],
  },
];

// Proportional params: their value scales with the image's source dimensions
// (block/cell SIZE, channel/slice SHIFT as a fraction of the canvas). Scaled
// by tileRender/canonicalRender so the effect occupies the same percentage of
// the canvas regardless of render resolution — feature count is preserved for
// density effects, and shift offsets stay at the same percentage of image
// width for chromatic/glitch.
const DENSITY_PIXEL_PARAMS: Record<string, readonly string[]> = {
  'pixel-mosaic': ['blockSize'],
  halftone: ['cellSize'],
  chromatic: ['shift'],
  glitch: ['shift', 'chromaShift'],
};

// Spacing params: gap between repeating features. Scaled to maintain the same
// CSS-pixel spacing on screen as the main preview. Scaling these like the
// proportional params would make them collapse to a solid overlay on small
// tiles (e.g. gap 3 × 0.25 = 1 = every-pixel = solid black).
const SPACING_PIXEL_PARAMS: Record<string, readonly string[]> = {
  scanlines: ['gap'],
  crt: ['gap'],
};

export const CANONICAL_PREVIEW_RENDER_SIZE = 1024;
export const CANONICAL_PREVIEW_DISPLAY_SIZE = 760;

/**
 * Scale pixel-counted parameters so a gallery tile rendered at
 * `tileRenderSize` and displayed at `tileDisplaySize` CSS pixels visually
 * resembles the main preview (which renders at ~1024 source displayed at
 * ~760 CSS).
 *
 * Density params (mosaic blockSize, halftone cellSize) shrink with the render
 * resolution so the feature count is preserved. Spacing/displacement params
 * (scanline gap, CRT gap, chromatic shift, glitch shift) stretch so each
 * feature ends up at the same CSS-pixel size.
 */
export function scaleEffectsForRender(
  effects: PreviewEffect[],
  tileRenderSize: number,
  tileDisplaySize: number,
): PreviewEffect[] {
  if (tileRenderSize <= 0 || tileDisplaySize <= 0) return effects;

  const densityScale = tileRenderSize / CANONICAL_PREVIEW_RENDER_SIZE;
  const tileRatio = tileRenderSize / tileDisplaySize;
  const canonicalRatio = CANONICAL_PREVIEW_RENDER_SIZE / CANONICAL_PREVIEW_DISPLAY_SIZE;
  const spacingScale = tileRatio / canonicalRatio;

  const densityCloseEnough = Math.abs(densityScale - 1) < 0.001;
  const spacingCloseEnough = Math.abs(spacingScale - 1) < 0.001;
  if (densityCloseEnough && spacingCloseEnough) return effects;

  return effects.map((effect) => {
    if (!effect.enabled || !effect.options) return effect;
    const def = EFFECT_DEF_BY_ID.get(effect.id);
    if (!def) return effect;

    const densityKeys = DENSITY_PIXEL_PARAMS[effect.id] ?? [];
    const spacingKeys = SPACING_PIXEL_PARAMS[effect.id] ?? [];
    if (densityKeys.length === 0 && spacingKeys.length === 0) return effect;

    const nextOptions = { ...effect.options };
    let changed = false;

    const apply = (keys: readonly string[], scale: number, closeEnough: boolean) => {
      if (closeEnough) return;
      for (const key of keys) {
        const param = def.params.find((p) => p.key === key);
        if (!param) continue;
        const current = effect.options![key] ?? param.defaultValue;
        const scaled = Math.max(param.min, Math.min(param.max, Math.round(current * scale)));
        if (scaled !== current) {
          nextOptions[key] = scaled;
          changed = true;
        }
      }
    };

    apply(densityKeys, densityScale, densityCloseEnough);
    apply(spacingKeys, spacingScale, spacingCloseEnough);

    return changed ? { ...effect, options: nextOptions } : effect;
  });
}

export function applyPreviewEffectPreset(
  current: PreviewEffect[],
  preset: PreviewEffectPreset,
): PreviewEffect[] {
  const enabledMap = new Map(preset.stack.map((entry) => [entry.id, entry]));
  const stackOrder = preset.stack.map((entry) => entry.id);

  const enabledEntries: PreviewEffect[] = stackOrder.map((id) => {
    const def = EFFECT_DEF_BY_ID.get(id);
    if (!def) return { id, enabled: false, options: {} };
    const presetEntry = enabledMap.get(id);
    return {
      id,
      enabled: true,
      options: { ...defaultOptionsFor(def), ...(presetEntry?.options ?? {}) },
    };
  });

  const leftovers: PreviewEffect[] = PREVIEW_EFFECTS.filter((def) => !enabledMap.has(def.id)).map((def) => ({
    id: def.id,
    enabled: false,
    options: defaultOptionsFor(def),
  }));

  return normalizePreviewEffects([...enabledEntries, ...leftovers]);
}
