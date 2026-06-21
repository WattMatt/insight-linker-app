export type DocSource = 'site' | 'subsection';

export function storagePathFromUrl(url: string): string | null {
  if (!url || !url.includes('/documents/')) return null;
  const after = url.split('/documents/')[1];
  if (!after) return null;
  return after.split('?')[0];
}

export function splitNameExt(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}

// Matches the existing upload sanitizer in SiteDetail.tsx handleUploadDocument.
export function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9.-]/g, '_');
}

// Rename keeps the file in its current folder; only the filename changes. The directory is
// taken verbatim from the old path so we never have to guess the per-source folder convention.
export function buildRenamePath(oldPath: string, newBase: string, ext: string, timestamp: number): string {
  const slash = oldPath.lastIndexOf('/');
  const dir = slash >= 0 ? oldPath.slice(0, slash) : '';
  const fileName = `${timestamp}-${sanitizeSegment(newBase)}${ext}`;
  return dir ? `${dir}/${fileName}` : fileName;
}

export interface BuildMoveArgs {
  source: DocSource;
  siteId: string | null;
  subsectionId: string | null;
  targetCategoryId: string;
  targetCategoryName: string;
  fileName: string;
  timestamp: number;
}

// Move builds a fresh canonical path per source: site docs fold the category NAME into the
// path (matching the existing upload convention); subsection docs use the immutable category ID.
export function buildMovePath(a: BuildMoveArgs): string {
  const file = `${a.timestamp}-${sanitizeSegment(a.fileName)}`;
  if (a.source === 'site') {
    return `${a.siteId}/${sanitizeSegment(a.targetCategoryName)}/${file}`;
  }
  return `subsections/${a.subsectionId}/${a.targetCategoryId}/${file}`;
}
