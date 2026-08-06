import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workerSrcFor } from './pdfWorkerPath';

/**
 * Guard for the self-hosted pdf.js workers (see pdfWorker.ts): the worker
 * files in /public/pdf-workers must exist for BOTH installed pdfjs-dist
 * versions (react-pdf's nested pin and the app's direct dependency), or PDF
 * viewing breaks at runtime with an API/worker version mismatch.
 */
function installedVersion(pkgJsonPath: string): string {
  return JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version as string;
}

const root = process.cwd();

describe('self-hosted pdf.js workers', () => {
  const versions = [
    installedVersion(join(root, 'node_modules', 'react-pdf', 'node_modules', 'pdfjs-dist', 'package.json')),
    installedVersion(join(root, 'node_modules', 'pdfjs-dist', 'package.json')),
  ];

  it.each(versions)('public worker exists for installed pdfjs-dist %s', (version) => {
    const publicPath = join(root, 'public', workerSrcFor(version));
    expect(existsSync(publicPath), `${publicPath} missing — re-copy per src/lib/pdfWorker.ts`).toBe(true);
  });

  it('workerSrcFor builds a local (non-CDN) path', () => {
    expect(workerSrcFor('1.2.3')).toBe('/pdf-workers/pdf.worker-1.2.3.min.mjs');
  });
});
