/**
 * Document storage URL resolution — the single chokepoint between stored
 * `file_url` values and anything that fetches, previews, downloads, renames
 * or deletes the underlying object.
 *
 * Why this exists (PDF standardization P0, 2026-08-06):
 * The `documents` bucket is PRIVATE (see migration 20260806090000). Rows
 * written before the lockdown store full `getPublicUrl()` URLs which no
 * longer serve bytes; rows written after it store the bare storage PATH
 * (e.g. `{siteId}/Inspection_Reports/1730-file.pdf` or
 * `subsections/{subsectionId}/...`). Every consumer must therefore:
 *   1. parse either form into { bucket, path }   → parseDocumentFileRef()
 *   2. mint a short-lived signed URL to display  → getDocumentSignedUrl()
 *      (or fall back gracefully)                 → resolveDocumentUrl()
 *
 * Never hand a stored file_url straight to <img>, <iframe>, fetch(), or
 * window.open — route it through here.
 */
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

const log = logger.child('documentUrl');

export const DOCUMENTS_BUCKET = 'documents';

/** Standard TTL for read-time signed URLs (matches signedUrls.ts). */
export const DOCUMENT_SIGNED_URL_TTL_SECONDS = 3600;

export interface DocumentFileRef {
  bucket: string;
  path: string;
}

/**
 * Parse a stored file_url value into a storage reference.
 *
 * Accepts:
 *  - full Supabase storage URLs (public / sign / authenticated variants) —
 *    legacy rows written while the bucket was public, and signed URLs;
 *  - bare storage paths (new rows) — attributed to the `documents` bucket.
 *
 * Returns null for anything that is not a storage object reference
 * (blob:/data: URLs, external http(s) URLs, empty values), so callers can
 * pass those through untouched.
 */
export function parseDocumentFileRef(value: string | null | undefined): DocumentFileRef | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Full Supabase storage object URL (any access variant, with or without query).
  const match = trimmed.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/);
  if (match) {
    try {
      return { bucket: match[1], path: decodeURIComponent(match[2]).replace(/^\/+/, '') };
    } catch {
      return { bucket: match[1], path: match[2].replace(/^\/+/, '') };
    }
  }

  // Any other URL scheme is not ours to resolve.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) return null;

  // Bare storage path (new convention) — documents bucket.
  return { bucket: DOCUMENTS_BUCKET, path: trimmed.replace(/^\/+/, '') };
}

/**
 * Mint a signed URL for a stored file_url value (bare path or legacy full
 * URL). Returns null when the value is not a storage reference or signing
 * fails (e.g. anonymous visitor without a SELECT policy on the object).
 */
export async function getDocumentSignedUrl(
  value: string | null | undefined,
  expiresIn: number = DOCUMENT_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const ref = parseDocumentFileRef(value);
  if (!ref) return null;

  const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, expiresIn);
  if (error || !data?.signedUrl) {
    log.warn('Failed to sign document URL', ref.bucket, ref.path, error?.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Resolve a stored file_url value to something displayable: a signed URL
 * when possible, otherwise the original value unchanged (blob:/data: URLs,
 * external links, or signing failures degrade to current behaviour).
 */
export async function resolveDocumentUrl(
  value: string,
  expiresIn: number = DOCUMENT_SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const signed = await getDocumentSignedUrl(value, expiresIn);
  return signed ?? value;
}

/**
 * Download the object behind a stored file_url value via the SDK (works
 * against the private bucket for any authorised user). Returns null when the
 * value is not a storage reference or the download fails.
 */
export async function downloadDocumentBlob(value: string): Promise<Blob | null> {
  const ref = parseDocumentFileRef(value);
  if (!ref) return null;
  const { data, error } = await supabase.storage.from(ref.bucket).download(ref.path);
  if (error || !data) {
    log.warn('Failed to download document', ref.bucket, ref.path, error?.message);
    return null;
  }
  return data;
}
