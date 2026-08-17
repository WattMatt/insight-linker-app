/**
 * SIMPLE IMAGE LOADER — compatibility layer.
 *
 * The implementation moved to src/lib/pdf/loadReportImage.ts, which is now the
 * only image loader for PDF generation. These wrappers keep the existing call
 * sites working.
 *
 * The old implementation returned the *original* blob whenever the browser could
 * not decode it (`img.onerror -> resolve(blob)`) and passed non-image blobs
 * straight through. That made an iPhone HEIC photo, a zero-dimension SVG or a
 * JSON error body reach pdfmake as a valid-looking data URL carrying bytes pdfkit
 * cannot embed, which aborted the whole report with "Unknown image format".
 * The replacement returns null instead — never an unusable payload.
 */

import { loadReportImage, loadReportImages, type LoadReportImageOptions } from './pdf/loadReportImage';

export type ReportImageOptions = LoadReportImageOptions;

/**
 * Load an image as a data URL pdfkit can embed.
 *
 * @returns a verified JPEG/PNG data URL, or null when the source cannot be
 *          converted. Callers must skip the image on null.
 */
export async function loadImageSimple(
  url: string,
  opts?: ReportImageOptions,
): Promise<string | null> {
  return loadReportImage(url, opts);
}

/**
 * Load multiple images in parallel.
 * Returns a Map of original URL -> verified JPEG/PNG data URL. URLs that could
 * not be converted are absent from the map.
 */
export async function loadImagesSimple(
  urls: string[],
  opts?: ReportImageOptions,
): Promise<Map<string, string>> {
  return loadReportImages(urls, opts);
}
