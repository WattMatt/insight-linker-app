/**
 * Self-hosted pdf.js worker configuration — the ONE place workerSrc is set.
 *
 * Previously 5 files pointed at 2 different CDNs (unpkg + cdnjs), one of them
 * with a stale `.js` extension against pdfjs 5.x's `.mjs` workers. CDN workers
 * break offline PWA use in the field and add a supply-chain dependency; the
 * workers are now served from /public/pdf-workers/.
 *
 * TWO pdfjs-dist copies exist in node_modules (react-pdf pins its own exact
 * version; the app depends on a newer one directly), and pdf.js hard-fails on
 * an API/worker version mismatch — so the worker files are version-named and
 * each instance resolves its own via workerSrcFor(version).
 *
 * When upgrading react-pdf or pdfjs-dist, re-copy the matching workers:
 *   cp node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs \
 *      public/pdf-workers/pdf.worker-<react-pdf's pdfjs version>.min.mjs
 *   cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs \
 *      public/pdf-workers/pdf.worker-<pdfjs-dist version>.min.mjs
 * pdfWorker.assets.test.ts fails the suite if the files are missing/stale.
 *
 * Usage:
 *   - react-pdf consumers: `import '@/lib/pdfWorker';` (side effect configures
 *     react-pdf's pdfjs instance).
 *   - direct pdfjs-dist consumers: `import { workerSrcFor } from '@/lib/pdfWorker';`
 *     then `pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrcFor(pdfjsLib.version);`
 */
import { pdfjs } from 'react-pdf';
import { workerSrcFor } from './pdfWorkerPath';

export { workerSrcFor };

pdfjs.GlobalWorkerOptions.workerSrc = workerSrcFor(pdfjs.version);
