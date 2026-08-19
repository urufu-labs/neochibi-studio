// Minimal STORE-mode ZIP writer (no compression). PNGs are already compressed
// and JSON is small — store-mode keeps the writer dependency-free and streamable
// enough for browser-side collection bundling. Files > 4 GB or archives > 4 GB
// would need ZIP64; typical NFT collections stay well under both limits.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  crc: number;
  size: number;
  offset: number;
}

export class ZipWriter {
  private chunks: Array<Blob | Uint8Array> = [];
  private offset = 0;
  private entries: ZipEntry[] = [];
  private encoder = new TextEncoder();

  async addFile(name: string, blob: Blob): Promise<void> {
    const nameBytes = this.encoder.encode(name);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const crc = crc32(buf);
    const size = buf.length;

    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0x21, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);

    this.entries.push({ name, crc, size, offset: this.offset });
    this.chunks.push(header, blob);
    this.offset += header.length + size;
  }

  finish(): Blob {
    let cdSize = 0;
    for (const e of this.entries) cdSize += 46 + this.encoder.encode(e.name).length;

    const cd = new Uint8Array(cdSize);
    let ptr = 0;
    for (const e of this.entries) {
      const nameBytes = this.encoder.encode(e.name);
      const view = new DataView(cd.buffer, ptr, 46);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint16(14, 0x21, true);
      view.setUint32(16, e.crc, true);
      view.setUint32(20, e.size, true);
      view.setUint32(24, e.size, true);
      view.setUint16(28, nameBytes.length, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, e.offset, true);
      cd.set(nameBytes, ptr + 46);
      ptr += 46 + nameBytes.length;
    }

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, this.entries.length, true);
    ev.setUint16(10, this.entries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, this.offset, true);
    ev.setUint16(20, 0, true);

    this.chunks.push(cd, eocd);
    return new Blob(this.chunks as BlobPart[], { type: 'application/zip' });
  }
}
