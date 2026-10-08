/**
 * Writes a .ico container holding PNG images (valid since Windows Vista; browsers accept it).
 * Layout: ICONDIR (6) | ICONDIRENTRY (16) × n | PNG blobs.
 */
export function buildIco(pngs: { size: number; data: Uint8Array }[]): Uint8Array {
  const headerLen = 6 + 16 * pngs.length;
  const total = headerLen + pngs.reduce((n, p) => n + p.data.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true); // reserved
  dv.setUint16(2, 1, true); // type: icon
  dv.setUint16(4, pngs.length, true);
  let offset = headerLen;
  pngs.forEach((p, i) => {
    const e = 6 + i * 16;
    out[e] = p.size >= 256 ? 0 : p.size; // width (0 means 256)
    out[e + 1] = p.size >= 256 ? 0 : p.size; // height
    out[e + 2] = 0; // palette
    out[e + 3] = 0; // reserved
    dv.setUint16(e + 4, 1, true); // color planes
    dv.setUint16(e + 6, 32, true); // bits per pixel
    dv.setUint32(e + 8, p.data.length, true);
    dv.setUint32(e + 12, offset, true);
    out.set(p.data, offset);
    offset += p.data.length;
  });
  return out;
}

export function parseIcoHeader(bytes: Uint8Array): { count: number; sizes: number[] } | null {
  if (bytes.length < 6) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  if (dv.getUint16(0, true) !== 0 || dv.getUint16(2, true) !== 1) return null;
  const count = dv.getUint16(4, true);
  const sizes: number[] = [];
  for (let i = 0; i < count; i++) {
    const w = bytes[6 + i * 16];
    sizes.push(w === 0 ? 256 : w);
  }
  return { count, sizes };
}
