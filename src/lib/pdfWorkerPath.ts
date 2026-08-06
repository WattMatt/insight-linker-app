/**
 * Pure path builder for the self-hosted pdf.js workers — kept free of any
 * pdfjs/react-pdf import so tests (and non-DOM code) can use it in Node.
 * See src/lib/pdfWorker.ts for the full story and upgrade instructions.
 */

/** Local, version-matched worker path for a given pdfjs API version. */
export function workerSrcFor(version: string): string {
  return `/pdf-workers/pdf.worker-${version}.min.mjs`;
}
