/**
 * PDF IMAGE FORMAT VALIDATION
 *
 * pdfmake delegates image embedding to pdfkit, and pdfkit supports exactly two
 * formats. `PDFImage.open` (node_modules/pdfkit/js/pdfkit.js) sniffs magic bytes:
 *
 *   FF D8            -> JPEG
 *   89 'PNG'         -> PNG
 *   anything else    -> throw new Error('Unknown image format.')
 *
 * pdfmake re-throws that as "Invalid image: Error: Unknown image format. Images
 * dictionary should contain dataURL entries (or local file paths in node.js)" —
 * the error that took down report generation. WebP, GIF, AVIF, SVG and HEIC are
 * all legal uploads in this app (see ALLOWED_MIME_TYPES in fileValidation.ts)
 * and all of them land in that branch, as does a non-image response body (a JSON
 * or HTML error page served with 200).
 *
 * This module is the single authority on "can pdfkit embed this?". It is pure and
 * DOM-free so it runs in the browser, in Node, and in tests.
 */

/** Formats pdfkit can embed. Nothing else may reach a docDefinition. */
export type PdfImageFormat = 'jpeg' | 'png';

/** Why a candidate image was rejected — surfaced in report diagnostics. */
export type ImageRejectReason =
  | 'empty'
  | 'not-a-string'
  | 'remote-url'
  | 'not-a-data-url'
  | 'not-base64'
  | 'undecodable-base64'
  | 'unsupported-format'
  | 'truncated';

export interface ImageInspection {
  ok: boolean;
  format?: PdfImageFormat;
  reason?: ImageRejectReason;
  /** Human-readable detail for logs and the in-report warning panel. */
  detail: string;
  /** Declared MIME type from the data URL, when there was one. */
  declaredMime?: string;
}

/** Bytes of the tail to decode when checking PNG integrity. */
const TAIL_B64_CHARS = 32;

/** 12 base64 chars decode to 9 bytes — enough for every signature we check. */
const HEAD_B64_CHARS = 12;

/**
 * Decode a slice of base64 to bytes. Returns null when the slice is not valid
 * base64 (atob throws) rather than letting a corrupt payload through.
 */
function decodeBase64Slice(b64: string): Uint8Array | null {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** ASCII compare, avoiding a TextDecoder dependency. */
function bytesAreAscii(bytes: Uint8Array, offset: number, ascii: string): boolean {
  if (offset < 0 || offset + ascii.length > bytes.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Identify a format from leading bytes using the same test pdfkit applies.
 * Returns null for anything pdfkit would reject.
 */
export function sniffImageFormat(bytes: Uint8Array): PdfImageFormat | null {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytesAreAscii(bytes, 1, 'PNG')) return 'png';
  return null;
}

/**
 * Best-effort label for bytes pdfkit cannot embed, so diagnostics can say
 * "webp" instead of "unsupported". Covers the formats this app accepts on upload
 * plus the non-image bodies storage errors produce.
 */
export function describeForeignBytes(bytes: Uint8Array): string {
  if (bytesAreAscii(bytes, 0, 'RIFF')) return 'WebP (RIFF)';
  if (bytesAreAscii(bytes, 0, 'GIF8')) return 'GIF';
  if (bytesAreAscii(bytes, 4, 'ftyp')) {
    if (bytesAreAscii(bytes, 8, 'heic') || bytesAreAscii(bytes, 8, 'heix')) return 'HEIC';
    if (bytesAreAscii(bytes, 8, 'mif1') || bytesAreAscii(bytes, 8, 'msf1')) return 'HEIF';
    if (bytesAreAscii(bytes, 8, 'avif')) return 'AVIF';
    return 'ISO-BMFF container (HEIC/AVIF family)';
  }
  if (bytesAreAscii(bytes, 0, '<svg') || bytesAreAscii(bytes, 0, '<?xm')) return 'SVG/XML';
  if (bytesAreAscii(bytes, 0, 'BM')) return 'BMP';
  if (bytesAreAscii(bytes, 0, 'II*') || bytesAreAscii(bytes, 0, 'MM\x00')) return 'TIFF';
  // A JSON or HTML error body served in place of the image.
  if (bytes[0] === 0x7b /* { */) return 'JSON body (not an image)';
  if (bytes[0] === 0x3c /* < */) return 'HTML body (not an image)';
  return 'unrecognised bytes';
}

/**
 * Detect PNG truncation, which pdfkit does NOT guard against: a clipped PNG
 * reaches png-js and throws Z_DATA_ERROR ("incorrect data check") from an async
 * zlib callback — outside pdfmake's try/catch, so it surfaces as an unhandled
 * exception that no caller can recover from. Cheaper and safer to reject here.
 *
 * Deliberately PNG-only. pdfkit does not require a JPEG EOI marker — it parses
 * the SOF header and embeds the scan as-is, and real-world JPEGs (including the
 * one used as a test fixture here) routinely lack a discoverable FF D9. Applying
 * the same check to JPEG would reject files pdfkit renders perfectly well,
 * turning working images into placeholders.
 */
function hasIntactTerminator(format: PdfImageFormat, tail: Uint8Array): boolean {
  if (format !== 'png') return true;
  // A PNG must end with the 12-byte IEND chunk: len(4) + 'IEND' + crc(4).
  return tail.length >= 12 && bytesAreAscii(tail, tail.length - 8, 'IEND');
}

const DATA_URL_RE = /^data:([^;,]*)(;[^,]*)?,/i;

/**
 * Inspect any value destined for a pdfmake `{ image: ... }` node and report
 * whether pdfkit can embed it.
 *
 * Non-string values (Buffer / ArrayBuffer, which pdfkit accepts natively) are
 * reported as ok — this module only adjudicates the string forms the app
 * actually produces.
 */
export function inspectPdfImage(value: unknown): ImageInspection {
  if (typeof value !== 'string') {
    if (value === null || value === undefined) {
      return { ok: false, reason: 'empty', detail: 'image value is null/undefined' };
    }
    // Buffer / ArrayBuffer / Uint8Array — pdfkit sniffs these itself.
    return { ok: true, detail: 'binary image value passed through to pdfkit' };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    // pdfmake rejects this even earlier, as "Unrecognized document structure".
    return { ok: false, reason: 'empty', detail: 'image value is an empty string' };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    // Verified against pdfmake 0.3.7: Printer.resolveUrls only walks
    // docDefinition.images/fonts/attachments/files — never the content tree — so
    // an inline URL is never fetched and pdfkit tries to read it off disk.
    return {
      ok: false,
      reason: 'remote-url',
      detail: 'remote URL used inline; pdfmake never fetches inline URLs — preload it to a data URL first',
    };
  }

  const match = DATA_URL_RE.exec(trimmed);
  if (!match) {
    return {
      ok: false,
      reason: 'not-a-data-url',
      detail: 'not a data URL and not a remote URL',
    };
  }

  const declaredMime = match[1] || 'application/octet-stream';
  const params = match[2] || '';
  if (!/;base64/i.test(params)) {
    // pdfkit's regex requires ";base64," — a percent-encoded data URL (common for
    // inline SVG) falls through to a filesystem read.
    return {
      ok: false,
      reason: 'not-base64',
      detail: `data URL is not base64-encoded (${declaredMime})`,
      declaredMime,
    };
  }

  const body = trimmed.slice(match[0].length);
  if (!body) {
    return { ok: false, reason: 'empty', detail: 'data URL has no payload', declaredMime };
  }

  const head = decodeBase64Slice(body.slice(0, HEAD_B64_CHARS));
  if (!head) {
    return {
      ok: false,
      reason: 'undecodable-base64',
      detail: `payload is not decodable base64 (${declaredMime})`,
      declaredMime,
    };
  }

  const format = sniffImageFormat(head);
  if (!format) {
    return {
      ok: false,
      reason: 'unsupported-format',
      detail: `${describeForeignBytes(head)} — pdfkit embeds JPEG and PNG only (declared ${declaredMime})`,
      declaredMime,
    };
  }

  // Slice on a 4-char group boundary measured from the start of the body, so the
  // decode is correct whether or not the payload carries '=' padding.
  const rawStart = Math.max(0, body.length - TAIL_B64_CHARS);
  const tail = decodeBase64Slice(body.slice(rawStart - (rawStart % 4)));
  if (!tail) {
    return {
      ok: false,
      reason: 'undecodable-base64',
      detail: `payload tail is not decodable base64 (${declaredMime})`,
      declaredMime,
    };
  }

  if (!hasIntactTerminator(format, tail)) {
    return {
      ok: false,
      format,
      reason: 'truncated',
      detail: `${format.toUpperCase()} appears truncated (no end marker) — would crash pdfkit's decoder`,
      declaredMime,
    };
  }

  return { ok: true, format, detail: `${format.toUpperCase()} ok`, declaredMime };
}

/** Convenience predicate for the common "is this safe to embed?" check. */
export function isPdfSafeImage(value: unknown): boolean {
  return inspectPdfImage(value).ok;
}

/**
 * Short, non-leaking description of an image value for logs: data URLs are
 * reported by MIME and size, URLs are truncated. Never emits a full payload.
 */
export function summariseImageValue(value: unknown): string {
  if (typeof value !== 'string') return typeof value;
  const match = DATA_URL_RE.exec(value.trim());
  if (match) {
    const kb = Math.round(((value.length - match[0].length) * 0.75) / 1024);
    return `${match[1] || 'unknown'} data URL (~${kb}KB)`;
  }
  return value.length > 96 ? `${value.slice(0, 96)}…` : value;
}
