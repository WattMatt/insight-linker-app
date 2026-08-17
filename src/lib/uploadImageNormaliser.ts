/**
 * UPLOAD IMAGE NORMALISER
 *
 * One gate for every image entering storage. Guarantees that what gets stored is
 * genuinely JPEG or PNG and that its MIME type and file extension describe the
 * bytes truthfully — or that the upload is refused with a reason.
 *
 * Two defects this replaces, both present in duplicate implementations in
 * useImageUpload.ts and DynamicFieldManager.tsx:
 *
 * 1. MISLABELLING. `compressImageForUpload` had four `resolve(file)` fallbacks
 *    (non-image type, no canvas context, null toBlob, decode error) and the
 *    caller then relabelled the result `image/jpeg` and renamed it `.jpg`
 *    unconditionally. Any source the browser could not decode — HEIC outside
 *    Safari, a corrupt or truncated file, a format the build does not support —
 *    was therefore stored as `.jpg` with `Content-Type: image/jpeg` while still
 *    containing its original bytes, misleading anything that trusted the label.
 *
 * 2. BLACK BACKGROUNDS. The canvas was never filled before drawImage, and output
 *    was always JPEG. JPEG has no alpha channel, so a transparent PNG logo came
 *    out with its transparent regions rendered black.
 *
 * The JPEG/PNG constraint is shared with the PDF pipeline by design: pdfkit
 * embeds nothing else, so refusing an unembeddable upload at the door is what
 * stops it becoming an "Image unavailable" placeholder in a report later.
 */

import { sniffImageFormat, type PdfImageFormat } from './pdf/imageFormat';

/** Matches the previous compression targets so stored sizes do not change. */
export const UPLOAD_IMAGE_CONFIG = {
  maxWidth: 800,
  quality: 0.7,
} as const;

export interface NormalisedUploadImage {
  /** Bytes to upload. Always genuinely JPEG or PNG. */
  blob: Blob;
  /** MIME type that truthfully describes `blob`. */
  mime: 'image/jpeg' | 'image/png';
  /** File extension that truthfully matches `mime`. */
  extension: 'jpg' | 'png';
  /** Whether the canvas downscale/re-encode ran. False means the original bytes are passed through. */
  recompressed: boolean;
}

export interface NormaliseFailure {
  /** Short, user-facing explanation naming the offending format. */
  reason: string;
}

export type NormaliseResult =
  | { ok: true; image: NormalisedUploadImage }
  | { ok: false; error: NormaliseFailure };

const MIME_FOR: Record<PdfImageFormat, 'image/jpeg' | 'image/png'> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
};

const EXT_FOR: Record<PdfImageFormat, 'jpg' | 'png'> = {
  jpeg: 'jpg',
  png: 'png',
};

/** Replace a filename's extension. Adds one when the name has none. */
export function applyExtension(fileName: string, extension: string): string {
  if (!fileName) return `image.${extension}`;
  return /\.[^./\\]+$/.test(fileName)
    ? fileName.replace(/\.[^./\\]+$/, `.${extension}`)
    : `${fileName}.${extension}`;
}

/** Does this file look like HEIC/HEIF by declared type or filename? */
export function isHeicSource(file: { type?: string; name?: string }): boolean {
  if (file.type && /^image\/(heic|heif)$/i.test(file.type)) return true;
  return !!file.name && /\.(heic|heif)$/i.test(file.name);
}

/**
 * Build the truthful label for bytes that have already been sniffed.
 *
 * Pure, so the labelling decision — the part that was previously wrong — is
 * testable without a DOM.
 */
export function labelFor(
  format: PdfImageFormat,
  recompressed: boolean,
): Omit<NormalisedUploadImage, 'blob'> {
  return { mime: MIME_FOR[format], extension: EXT_FOR[format], recompressed };
}

/** Human-readable name for bytes we refuse, so the toast can be specific. */
export function describeRejectedSource(file: { type?: string; name?: string }): string {
  const declared = (file.type || '').replace(/^image\//, '').toUpperCase();
  if (declared) return declared;
  const ext = file.name?.match(/\.([^.]+)$/)?.[1];
  return ext ? ext.toUpperCase() : 'unrecognised';
}

async function sniffBlob(blob: Blob): Promise<PdfImageFormat | null> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  return sniffImageFormat(head);
}

/** Convert HEIC/HEIF to JPEG. Returns null when heic2any cannot decode it. */
async function convertHeic(file: Blob): Promise<Blob | null> {
  try {
    const heic2any = (await import('heic2any')).default;
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const out = Array.isArray(converted) ? converted[0] : converted;
    return out instanceof Blob ? out : null;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('[UploadImage] HEIC conversion failed:', error);
    return null;
  }
}

/** True when any pixel is not fully opaque — decides PNG vs JPEG output. */
function usesTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    // A tainted canvas cannot be read. Assume transparency and keep PNG, which
    // is the lossless, alpha-preserving choice.
    return true;
  }
}

/**
 * Downscale and re-encode through a canvas.
 *
 * Chooses PNG when the image actually uses transparency and JPEG otherwise, so
 * logos keep their alpha instead of gaining a black background while photos
 * still get JPEG's much smaller output. Returns null rather than the original
 * blob on any failure — passing the original through under a JPEG label was the
 * bug this module exists to remove.
 */
async function reencode(
  source: Blob,
): Promise<{ blob: Blob; format: PdfImageFormat } | null> {
  if (typeof document === 'undefined') return null;

  const objectUrl = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = objectUrl;
    });
    if (!img) return null;

    // Verified in-browser: an SVG carrying only a viewBox still gets a default
    // 150x150 intrinsic size and rasterises fine, so this guard is for the rarer
    // genuinely zero-dimension source — rasterising that would yield an empty
    // canvas, and an empty image is worse than a refusal.
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    if (!naturalWidth || !naturalHeight) return null;

    let width = naturalWidth;
    let height = naturalHeight;
    if (width > UPLOAD_IMAGE_CONFIG.maxWidth) {
      height = Math.max(1, Math.round((height * UPLOAD_IMAGE_CONFIG.maxWidth) / width));
      width = UPLOAD_IMAGE_CONFIG.maxWidth;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const transparent = usesTransparency(ctx, width, height);
    const mime = transparent ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mime, transparent ? undefined : UPLOAD_IMAGE_CONFIG.quality);
    });
    if (!blob) return null;

    // Verify the encoder produced what we asked for rather than trusting it.
    const format = await sniffBlob(blob);
    return format ? { blob, format } : null;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.warn('[UploadImage] Canvas re-encode failed:', error);
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Normalise a file for upload.
 *
 * Order matters: HEIC is converted first because no browser except Safari can
 * decode it in an <img>, so the canvas step alone would fail on iPhone photos.
 *
 * @returns the normalised image with a truthful mime/extension, or a failure
 *          with a reason suitable for a toast. Callers must not upload on failure.
 */
export async function normaliseImageForUpload(file: File): Promise<NormaliseResult> {
  let working: Blob = file;

  if (isHeicSource(file)) {
    const converted = await convertHeic(file);
    if (!converted) {
      return { ok: false, error: { reason: 'HEIC image could not be converted. Please upload a JPG or PNG.' } };
    }
    working = converted;
  }

  const reencoded = await reencode(working);
  if (reencoded) {
    return { ok: true, image: { blob: reencoded.blob, ...labelFor(reencoded.format, true) } };
  }

  // Re-encoding failed. The bytes are still usable if they are ALREADY a format
  // pdfkit can embed — store them under their true label rather than a false one.
  const original = await sniffBlob(working);
  if (original) {
    return { ok: true, image: { blob: working, ...labelFor(original, false) } };
  }

  return {
    ok: false,
    error: {
      reason: `${describeRejectedSource(file)} images cannot be processed. Please upload a JPG or PNG.`,
    },
  };
}
