/**
 * REPORT IMAGE LOADER — the single image source for PDF generation.
 *
 * Replaces four divergent loaders (pdfBranding.imageUrlToBase64,
 * simpleImageLoader.loadImageSimple, pdfEngine.loadImageAsDataUrl,
 * imageUrlResolver.fetchImageAsDataUrl) that each handled failure differently and
 * between them let SVG, WebP, GIF, HEIC and non-image error bodies reach pdfmake.
 *
 * The contract is narrow and absolute: the resolved value is either a JPEG/PNG
 * data URL that pdfkit can embed, verified by magic bytes, or null. A source this
 * module cannot convert is never passed through in its original form — that
 * "best-effort" fallback was the bug.
 */

import { supabase } from '@/integrations/supabase/client';
import { DOCUMENT_DESIGN_STANDARDS } from '../documentDesignStandards';
import { inspectPdfImage, isPdfSafeImage, sniffImageFormat } from './imageFormat';

const { images: IMAGE_STANDARDS } = DOCUMENT_DESIGN_STANDARDS;

/** 1mm at 150dpi (the standard's minimum) ~= 5.9px; used to cap pixel dimensions. */
const PX_PER_MM_AT_MIN_DPI = IMAGE_STANDARDS.minDPI / 25.4;

/** Ceiling derived from the design standard's max image width (170mm @ 150dpi). */
export const MAX_IMAGE_PX = Math.round(IMAGE_STANDARDS.maxWidth * PX_PER_MM_AT_MIN_DPI);

export interface LoadReportImageOptions {
  /**
   * Downscale and re-encode to keep PDFs under the storage upload limit.
   * Photos should set this; logos generally should not.
   */
  compress?: boolean;
  /** Max width in px. Defaults to the design standard's ceiling when compressing. */
  maxWidth?: number;
  /** JPEG quality 0..1 when re-encoding to JPEG. */
  quality?: number;
  /**
   * Preserve alpha by encoding to PNG instead of flattening onto white. Set for
   * logos — a white-on-transparent mark flattened onto a white page vanishes.
   */
  transparent?: boolean;
}

/** MIME types the browser cannot decode in an <img>, needing explicit conversion. */
const HEIC_MIME = /^image\/(heic|heif)$/i;

interface ConversionTarget {
  format: 'jpeg' | 'png';
  mime: 'image/jpeg' | 'image/png';
}

/**
 * Decide the output encoding. Kept pure and exported so the decision is testable
 * without a DOM — the canvas work around it is not.
 */
export function chooseConversionTarget(opts?: LoadReportImageOptions): ConversionTarget {
  return opts?.transparent
    ? { format: 'png', mime: 'image/png' }
    : { format: 'jpeg', mime: 'image/jpeg' };
}

/**
 * Decide whether a blob already satisfies the contract and can skip re-encoding.
 * Pure, so the branch logic is testable in Node.
 */
export function needsReencoding(
  sniffed: 'jpeg' | 'png' | null,
  opts?: LoadReportImageOptions,
): boolean {
  // Unknown or unsupported bytes always need conversion (or rejection).
  if (sniffed === null) return true;
  // Explicit compression request: re-encode so downscaling actually happens.
  if (opts?.compress) return true;
  return false;
}

/** Extract bucket + path from a Supabase storage URL, public or signed. */
function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return { bucket: match[1], path: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

/** Read the first bytes of a blob so we can sniff without decoding it all. */
async function sniffBlob(blob: Blob): Promise<'jpeg' | 'png' | null> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  return sniffImageFormat(head);
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert HEIC/HEIF to JPEG. iPhone photos arrive in this format and no browser
 * except Safari can decode them in an <img>, so canvas re-encoding alone fails.
 * heic2any is already a dependency (used by the three upload paths).
 */
async function convertHeic(blob: Blob): Promise<Blob | null> {
  try {
    const heic2any = (await import('heic2any')).default;
    const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.85 });
    const out = Array.isArray(converted) ? converted[0] : converted;
    return out instanceof Blob ? out : null;
  } catch (error) {
    console.warn('[ReportImage] HEIC conversion failed:', error);
    return null;
  }
}

/**
 * Re-encode a blob through a canvas into JPEG or PNG.
 *
 * Returns null — never the original blob — when the browser cannot decode the
 * source or the canvas produces nothing. Silently returning the original was the
 * precise mechanism by which HEIC and zero-dimension SVG payloads reached pdfkit.
 */
async function reencodeViaCanvas(
  blob: Blob,
  target: ConversionTarget,
  maxWidth: number,
  quality: number,
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = objectUrl;
    });

    if (!img) return null;

    // Verified in-browser: an SVG carrying only a viewBox still gets a default
    // 150x150 intrinsic size, so this covers the rarer genuinely zero-dimension
    // source — fall back to the standard's max box rather than an empty canvas.
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (!width || !height) {
      width = Math.min(maxWidth, MAX_IMAGE_PX);
      height = Math.round(width * 0.75);
    }

    if (width > maxWidth) {
      height = Math.max(1, Math.round((height * maxWidth) / width));
      width = maxWidth;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // JPEG has no alpha: flatten onto white so transparent regions do not go black.
    if (target.format === 'jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((out) => resolve(out), target.mime, quality);
    });
  } catch (error) {
    // A cross-origin source taints the canvas and toBlob throws a SecurityError.
    console.warn('[ReportImage] Canvas re-encode failed:', error);
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Fetch the bytes behind a URL, preferring the authenticated storage API. */
async function fetchImageBlob(url: string): Promise<Blob | null> {
  const storage = parseSupabaseStorageUrl(url);
  if (storage) {
    // The storage API carries the session, so it keeps working for private
    // buckets and sidesteps CORS on the public path.
    const { data, error } = await supabase.storage.from(storage.bucket).download(storage.path);
    if (!error && data) return data;
    if (error) {
      console.warn(`[ReportImage] Storage download failed for ${storage.bucket}/${storage.path}: ${error.message}`);
    }
  }

  try {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) {
      console.warn(`[ReportImage] Fetch returned ${response.status} for ${url.slice(0, 96)}`);
      return null;
    }
    const blob = await response.blob();
    // A storage error can arrive as a 200 with a JSON or HTML body. Reject it here
    // rather than base64-encoding an error message into the document.
    if (blob.type && !blob.type.startsWith('image/') && !blob.type.startsWith('application/octet-stream')) {
      console.warn(`[ReportImage] Response is not an image (${blob.type}) for ${url.slice(0, 96)}`);
      return null;
    }
    return blob;
  } catch (error) {
    console.warn(`[ReportImage] Fetch failed for ${url.slice(0, 96)}:`, error);
    return null;
  }
}

/**
 * Normalise any blob to a JPEG or PNG blob, converting HEIC and re-encoding
 * anything else through a canvas.
 *
 * @returns a JPEG/PNG blob, or null when the source cannot be converted. Never
 *          the original blob — returning an undecodable source unchanged is what
 *          let HEIC photos reach pdfkit.
 */
export async function toPdfSafeBlob(
  blob: Blob,
  opts?: LoadReportImageOptions,
): Promise<Blob | null> {
  const target = chooseConversionTarget(opts);
  const maxWidth = Math.min(opts?.maxWidth ?? MAX_IMAGE_PX, MAX_IMAGE_PX);
  const quality = opts?.quality ?? 0.75;

  let working = blob;

  if (HEIC_MIME.test(blob.type)) {
    const converted = await convertHeic(blob);
    if (!converted) return null;
    working = converted;
  }

  const sniffed = await sniffBlob(working);
  if (!needsReencoding(sniffed, opts)) return working;

  const reencoded = await reencodeViaCanvas(working, target, maxWidth, quality);
  if (!reencoded) return null;

  // Verify the canvas actually produced the format we asked for.
  return (await sniffBlob(reencoded)) ? reencoded : null;
}

/** Turn any blob into a verified JPEG/PNG data URL, or null. */
async function blobToPdfSafeDataUrl(
  blob: Blob,
  opts?: LoadReportImageOptions,
): Promise<string | null> {
  const safe = await toPdfSafeBlob(blob, opts);
  if (!safe) return null;

  const dataUrl = await blobToDataUrl(safe);
  if (!dataUrl) return null;

  // Verify rather than trust: also catches truncated downloads, which would
  // otherwise crash pdfkit's PNG decoder from an async zlib callback.
  const inspection = inspectPdfImage(dataUrl);
  if (!inspection.ok) {
    console.warn(`[ReportImage] Output still unusable: ${inspection.detail}`);
    return null;
  }
  return dataUrl;
}

/**
 * Load an image for embedding in a PDF.
 *
 * @returns a JPEG or PNG data URL verified by magic bytes, or null. Callers must
 *          treat null as "omit this image" — passing an unverified value onward
 *          is what caused reports to fail outright.
 */
export async function loadReportImage(
  url: string | null | undefined,
  opts?: LoadReportImageOptions,
): Promise<string | null> {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:')) {
    // Already inline: accept it only if pdfkit can embed it, otherwise convert.
    if (isPdfSafeImage(trimmed)) return trimmed;
    try {
      const response = await fetch(trimmed);
      const blob = await response.blob();
      return await blobToPdfSafeDataUrl(blob, opts);
    } catch (error) {
      console.warn('[ReportImage] Could not convert inline data URL:', error);
      return null;
    }
  }

  const blob = await fetchImageBlob(trimmed);
  if (!blob) return null;

  return blobToPdfSafeDataUrl(blob, opts);
}

/**
 * Load many images concurrently, keyed by their original URL.
 *
 * URLs that fail are absent from the map — callers should skip the image (the
 * sink guard in generatePdfBlob renders a placeholder for anything that slips
 * through by another route).
 */
export async function loadReportImages(
  urls: Array<string | null | undefined>,
  opts?: LoadReportImageOptions,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(urls.filter((u): u is string => !!u && !!u.trim()))];
  if (unique.length === 0) return result;

  await Promise.all(
    unique.map(async (url) => {
      const dataUrl = await loadReportImage(url, opts);
      if (dataUrl) result.set(url, dataUrl);
    }),
  );

  return result;
}
