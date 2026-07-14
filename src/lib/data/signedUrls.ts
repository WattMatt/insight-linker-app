/**
 * Batched signed-URL resolution for Supabase Storage.
 *
 * Replaces the per-row `createSignedUrl` N+1 that currently runs in Sites.tsx,
 * ClientPortalSites.tsx, ClientPortalDashboard.tsx and AdminContractorPreview.tsx
 * (50 sites = 50 storage round-trips) with a single `createSignedUrls` call per bucket.
 *
 * Rows whose URL cannot be parsed or signed keep their original URL, so callers
 * degrade exactly like the existing per-row try/catch does.
 */
import { supabase } from "@/integrations/supabase/client";
import { extractStorageInfo } from "@/lib/imageUrlResolver";
import { logger } from "@/lib/logger";

const log = logger.child("signedUrls");

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Sign many storage paths in one round trip. Returns a map of path -> signed URL.
 * Paths that fail to sign are simply absent from the map.
 */
export async function signPaths(
  bucket: string,
  paths: string[],
  expiresIn: number = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const unique = [...new Set(paths.filter((p) => p.length > 0))];
  if (unique.length === 0) return signed;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, expiresIn);
  if (error) {
    log.warn("Batch signing failed for bucket", bucket, error.message);
    return signed;
  }
  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

/**
 * Resolve a URL-bearing field on a list of rows to signed URLs, in one batch per bucket.
 *
 * Example (replaces the Promise.all/.map block in Sites.tsx):
 *   const sites = await withSignedUrls(rows, {
 *     bucket: "site-images",
 *     getUrl: (s) => s.site_image_url,
 *     withUrl: (s, url) => ({ ...s, site_image_url: url }),
 *   });
 */
export async function withSignedUrls<T>(
  rows: T[],
  options: {
    bucket: string;
    getUrl: (row: T) => string | null | undefined;
    withUrl: (row: T, signedUrl: string) => T;
    expiresIn?: number;
  },
): Promise<T[]> {
  const { bucket, getUrl, withUrl, expiresIn } = options;

  const pathByIndex = new Map<number, string>();
  rows.forEach((row, index) => {
    const url = getUrl(row);
    if (!url) return;
    const info = extractStorageInfo(url);
    if (info && info.bucket === bucket) pathByIndex.set(index, info.path);
  });
  if (pathByIndex.size === 0) return rows;

  const signed = await signPaths(bucket, [...pathByIndex.values()], expiresIn);

  return rows.map((row, index) => {
    const path = pathByIndex.get(index);
    const signedUrl = path ? signed.get(path) : undefined;
    return signedUrl ? withUrl(row, signedUrl) : row;
  });
}
