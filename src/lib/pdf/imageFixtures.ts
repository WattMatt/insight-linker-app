/**
 * Real image bytes for tests.
 *
 * The G1 render round-trips previously mocked branding to `logoDataUrl: null` and
 * used `photos: []` everywhere, so not one byte of image data ever reached
 * pdfmake — which is exactly why "Unknown image format" shipped. These fixtures
 * exist so every generator can be rendered with both valid and hostile images.
 *
 * Node-only (uses node:zlib to build a real PNG); import from .test.ts files.
 */

import { deflateSync } from 'node:zlib';

const b64 = (bytes: Uint8Array | Buffer): string => Buffer.from(bytes).toString('base64');

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A genuinely valid 2x2 truecolour PNG — the control case. */
export function makePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  // Two scanlines, each: filter byte 0 + two RGB pixels.
  const raw = Buffer.from([0, 0xff, 0x00, 0x00, 0x00, 0xff, 0x00, 0, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * 1x1 baseline JPEG, verified to round-trip through pdfmake 0.3.7 / pdfkit 0.18.
 *
 * Kept as one unbroken literal: splitting it across concatenated lines silently
 * corrupted it once already. Note it has no FF D9 end-of-image marker, which is
 * precisely why imageFormat.ts applies its truncation check to PNG only — pdfkit
 * embeds this file happily.
 */
const JPEG_BYTES = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDT/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AqwA/9k=',
  'base64',
);

export const VALID_PNG_DATA_URL = `data:image/png;base64,${b64(makePng())}`;
export const VALID_JPEG_DATA_URL = `data:image/jpeg;base64,${b64(JPEG_BYTES)}`;

// ── Hostile inputs: every one of these previously aborted a whole report ──────

/** WebP — an allowed upload type (fileValidation.ts) pdfkit cannot embed. */
export const WEBP_DATA_URL = `data:image/webp;base64,${b64(
  Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x1a, 0, 0, 0]),
    Buffer.from('WEBPVP8 '),
    Buffer.alloc(14, 0),
  ]),
)}`;

/** HEIC — what an iPhone camera upload produces. */
export const HEIC_DATA_URL = `data:image/heic;base64,${b64(
  Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(12, 0)]),
)}`;

/** GIF — an allowed upload type. */
export const GIF_DATA_URL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Base64 SVG — what the old loaders returned verbatim for an SVG logo. */
export const SVG_DATA_URL = `data:image/svg+xml;base64,${b64(
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>'),
)}`;

/** Percent-encoded SVG — misses pdfkit's mandatory ";base64," marker. */
export const SVG_UTF8_DATA_URL =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>';

/** A storage error body served where an image was expected. */
export const JSON_BODY_DATA_URL = `data:application/json;base64,${b64(
  Buffer.from('{"error":"Object not found"}'),
)}`;

/** A remote URL used inline — pdfmake never fetches these. */
export const REMOTE_URL =
  'https://example.invalid/storage/v1/object/public/inspection-photos/a.jpg';

/** A PNG with its tail cut off — crashes pdfkit's decoder from an async callback. */
export const TRUNCATED_PNG_DATA_URL = (() => {
  const full = makePng();
  return `data:image/png;base64,${b64(full.subarray(0, full.length - 16))}`;
})();

/** Every hostile value, for table-driven tests. */
export const HOSTILE_IMAGES: Array<{ name: string; value: string }> = [
  { name: 'webp', value: WEBP_DATA_URL },
  { name: 'heic', value: HEIC_DATA_URL },
  { name: 'gif', value: GIF_DATA_URL },
  { name: 'svg-base64', value: SVG_DATA_URL },
  { name: 'svg-utf8', value: SVG_UTF8_DATA_URL },
  { name: 'json-body', value: JSON_BODY_DATA_URL },
  { name: 'remote-url', value: REMOTE_URL },
  { name: 'truncated-png', value: TRUNCATED_PNG_DATA_URL },
  { name: 'empty-string', value: '' },
];
