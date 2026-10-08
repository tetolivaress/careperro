/**
 * Minimal JPEG APP1/EXIF helpers used by the keep-metadata option.
 * Canvas re-encoding drops everything; when the user opts to keep metadata on a JPEG → JPEG
 * export we copy the original APP1 segment back, resetting Orientation to 1 because the
 * decoded bitmap is already upright.
 */

const SOI = 0xffd8;

/** Returns the raw APP1 segment (marker + length + payload) or null. */
export async function extractExif(file: Blob): Promise<Uint8Array | null> {
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 256 * 1024)).arrayBuffer());
  const view = new DataView(head.buffer);
  if (head.length < 4 || view.getUint16(0) !== SOI) return null;
  let offset = 2;
  while (offset + 4 <= head.length) {
    if (head[offset] !== 0xff) return null;
    const marker = head[offset + 1];
    if (marker === 0xda) return null; // start of scan: no APP1 before image data
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && offset + 2 + length <= head.length) {
      const seg = head.slice(offset, offset + 2 + length);
      // "Exif\0\0" signature
      if (seg[4] === 0x45 && seg[5] === 0x78 && seg[6] === 0x69 && seg[7] === 0x66) {
        resetOrientation(seg);
        return seg;
      }
    }
    offset += 2 + length;
  }
  return null;
}

/** Sets EXIF Orientation (tag 0x0112) to 1 in place, if present in IFD0. */
function resetOrientation(seg: Uint8Array): void {
  const tiff = 10; // after marker(2) + length(2) + "Exif\0\0"(6)
  if (seg.length < tiff + 8) return;
  const view = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
  const little = view.getUint16(tiff) === 0x4949;
  const ifd0 = tiff + view.getUint32(tiff + 4, little);
  if (ifd0 + 2 > seg.length) return;
  const count = view.getUint16(ifd0, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > seg.length) return;
    if (view.getUint16(entry, little) === 0x0112) {
      view.setUint16(entry + 8, 1, little);
      return;
    }
  }
}

/** Inserts the APP1 segment right after SOI of a freshly encoded JPEG. */
export async function injectExif(jpeg: Blob, app1: Uint8Array): Promise<Blob> {
  const buf = new Uint8Array(await jpeg.arrayBuffer());
  if (buf.length < 2 || (buf[0] !== 0xff && buf[1] !== 0xd8)) return jpeg;
  const out = new Uint8Array(buf.length + app1.length);
  out.set(buf.subarray(0, 2), 0);
  out.set(app1, 2);
  out.set(buf.subarray(2), 2 + app1.length);
  return new Blob([out], { type: "image/jpeg" });
}
