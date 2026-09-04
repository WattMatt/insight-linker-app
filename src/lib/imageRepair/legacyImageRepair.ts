import { supabase } from "@/integrations/supabase/client";
import { describeForeignBytes, sniffImageFormat, type PdfImageFormat } from "@/lib/pdf/imageFormat";
import { normaliseImageForUpload } from "@/lib/uploadImageNormaliser";

/**
 * Legacy image repair.
 *
 * Before the upload-side normaliser existed, several upload paths stored
 * whatever bytes the browser handed them under a guessed extension — most
 * damagingly iPhone HEIC photos saved as ".jpg" with Content-Type image/jpeg.
 * Reports already convert those at generation time (pdf/loadReportImage.ts),
 * but nothing else can display them outside Safari.
 *
 * This module scans storage buckets by reading only the leading bytes of each
 * object, classifies them by magic number (the same test pdfkit applies), and
 * re-encodes ONLY the genuinely undisplayable HEIC family IN PLACE through the
 * same normaliser every new upload passes through. Paths never change, so no
 * database row needs touching; only the bytes and Content-Type become truthful.
 *
 * Deliberately narrow, by design:
 *  - Only HEIC/HEIF (and the generic ISO-BMFF container, which in these buckets
 *    is the iPhone HEIC/AVIF family) is treated as repairable. WebP/GIF/SVG/BMP/
 *    TIFF/AVIF are recognised and reported but NEVER rewritten — browsers show
 *    them, reports already convert them at render time, and re-encoding a vector
 *    SVG or an animated GIF to an 800px raster would be a lossy, irreversible
 *    loss with no benefit.
 *  - The `documents` bucket is excluded: it holds user-uploaded originals
 *    (drawings, scans, vector logos) whose bytes are referenced verbatim by
 *    site_documents/subsection_documents rows and by download flows that derive
 *    the file type from the stored name. Rewriting them in place would leave the
 *    row and the bytes describing different things.
 */

export const IMAGE_BUCKETS = [
  "inspection-photos",
  "coc-photos",
  "site-images",
  "company-logos",
  "client-logos",
  "profile-images",
] as const;
export type ImageBucket = (typeof IMAGE_BUCKETS)[number];

/** Extensions worth sniffing. Anything else (pdf, docx, …) is skipped without a request. */
const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "bmp", "tif", "tiff", "avif", "svg",
]);

const HEAD_BYTES = 64;
const LIST_PAGE = 1000;
const SIGN_BATCH = 100;
const SIGNED_URL_TTL_SECONDS = 300;

export interface StorageObjectRef {
  bucket: string;
  path: string;
  size: number | null;
}

export type ObjectVerdict =
  /** Already a browser- and pdfkit-embeddable JPEG or PNG. */
  | { kind: "ok"; format: PdfImageFormat }
  /** HEIC family: undisplayable outside Safari and reliably convertible — repair in place. */
  | { kind: "repairable"; label: string }
  /** A recognised image (WebP/GIF/SVG/BMP/TIFF/AVIF) — reported for visibility, never rewritten. */
  | { kind: "displayable"; label: string }
  /** Not an image at all (error body, unknown bytes) — reported, never rewritten. */
  | { kind: "not-image"; label: string };

export interface ClassifiedObject extends StorageObjectRef {
  verdict: ObjectVerdict;
}

export interface ScanProgress {
  bucket: string;
  listed: number;
  checked: number;
  /** 'listing' while enumerating objects (can be slow), 'checking' while sniffing bytes. */
  phase: "listing" | "checking";
}

export interface ScanResult {
  objects: ClassifiedObject[];
  errors: { bucket: string; path: string; error: string }[];
  /** Objects skipped by extension without a request. */
  skipped: number;
}

export type RepairOutcome =
  | { bucket: string; path: string; status: "repaired"; before: number; after: number; format: PdfImageFormat; note?: string }
  | { bucket: string; path: string; status: "failed"; error: string };

export interface ScanDeps {
  listObjects: (bucket: string, prefix: string, signal?: AbortSignal) => Promise<StorageObjectRef[]>;
  readHead: (bucket: string, path: string) => Promise<Uint8Array | null>;
  /** Optional batch warm-up (e.g. pre-signing URLs) before readHead is called per object. */
  primeHeads?: (bucket: string, paths: string[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested without a network)
// ---------------------------------------------------------------------------

export function isCandidatePath(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  if (!name || name.startsWith(".")) return false; // .emptyFolderPlaceholder etc.
  const dot = name.lastIndexOf(".");
  if (dot < 0) return true; // no extension: unknown, worth sniffing
  return IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export function classifyBytes(head: Uint8Array): ObjectVerdict {
  if (head.length === 0) return { kind: "not-image", label: "empty object" };
  const format = sniffImageFormat(head);
  if (format) return { kind: "ok", format };
  const label = describeForeignBytes(head);
  // Only the HEIC/HEIF family is repaired: undisplayable outside Safari AND
  // reliably convertible by heic2any. "ISO-BMFF container" is the generic
  // ftyp-brand fallback, which in these photo buckets is the iPhone HEIC family.
  if (/^(HEIC|HEIF|ISO-BMFF)/.test(label)) {
    return { kind: "repairable", label };
  }
  // Recognised images that browsers render (or that reports convert at render
  // time). Reported so an admin can see them, but never rewritten in place.
  if (/^(WebP|GIF|SVG|BMP|TIFF|AVIF)/.test(label)) {
    return { kind: "displayable", label };
  }
  return { kind: "not-image", label };
}

/** The MIME the normaliser needs to see so it routes HEIC through heic2any. */
export function mimeForLabel(label: string): string {
  if (/^(HEIC|HEIF|ISO-BMFF)/.test(label)) return "image/heic";
  return "application/octet-stream";
}

function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Storage access
// ---------------------------------------------------------------------------

/** Recursive, paginated listing. Folders come back from list() without an id. */
export async function listBucketObjects(
  bucket: string,
  prefix = "",
  signal?: AbortSignal,
  onProgress?: (listed: number) => void,
): Promise<StorageObjectRef[]> {
  const out: StorageObjectRef[] = [];
  const folders: string[] = [prefix];

  while (folders.length > 0) {
    if (signal?.aborted) break;
    const folder = folders.shift() as string;
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(folder, { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`list ${bucket}/${folder || "(root)"}: ${error.message}`);
      const items = data ?? [];
      for (const item of items) {
        const path = folder ? `${folder}/${item.name}` : item.name;
        if (!item.id) {
          folders.push(path);
        } else {
          const size = (item.metadata as { size?: number } | null)?.size ?? null;
          out.push({ bucket, path, size });
        }
      }
      onProgress?.(out.length);
      if (items.length < LIST_PAGE) break;
      offset += LIST_PAGE;
    }
  }
  return out;
}

/**
 * Read the first bytes of many objects. Signed URLs work for public and private
 * buckets alike and are minted in batches; a Range request keeps the transfer
 * to a few dozen bytes. If Range is refused or the fetch fails, the whole
 * object is downloaded instead so classification never silently skips a file.
 */
export function makeHeadReader(): Pick<ScanDeps, "readHead" | "primeHeads"> {
  const urlCache = new Map<string, string>();

  const signBatch = async (bucket: string, paths: string[]) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    if (error) throw new Error(`sign ${bucket}: ${error.message}`);
    for (const row of data ?? []) {
      if (row.signedUrl && row.path) urlCache.set(`${bucket}/${row.path}`, row.signedUrl);
    }
  };

  const readHead = async (bucket: string, path: string): Promise<Uint8Array | null> => {
    const key = `${bucket}/${path}`;
    if (!urlCache.has(key)) {
      try { await signBatch(bucket, [path]); } catch { /* fall back to download below */ }
    }
    const url = urlCache.get(key);
    if (url) {
      try {
        const res = await fetch(url, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` } });
        if (res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer());
          return buf.slice(0, HEAD_BYTES);
        }
      } catch {
        // fall through to a full download
      }
    }
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.slice(0, HEAD_BYTES).arrayBuffer());
  };

  // Pre-sign in batches so a scan of thousands of objects is not thousands of sign calls.
  const primeHeads = async (bucket: string, paths: string[]) => {
    for (let i = 0; i < paths.length; i += SIGN_BATCH) {
      await signBatch(bucket, paths.slice(i, i + SIGN_BATCH));
    }
  };

  return { readHead, primeHeads };
}

const defaultDeps = (): ScanDeps => ({
  listObjects: (bucket, prefix, signal) => listBucketObjects(bucket, prefix, signal),
  ...makeHeadReader(),
});

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal?.aborted) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

export async function scanBuckets(
  buckets: readonly string[],
  opts: { signal?: AbortSignal; onProgress?: (p: ScanProgress) => void; prefix?: string; deps?: ScanDeps } = {},
): Promise<ScanResult> {
  const deps = opts.deps ?? defaultDeps();
  const result: ScanResult = { objects: [], errors: [], skipped: 0 };

  for (const bucket of buckets) {
    if (opts.signal?.aborted) break;
    // Announce the listing phase up front: enumerating a large bucket is one
    // sequential request per folder and can take a while before any object is
    // classified, so the UI must not look idle.
    opts.onProgress?.({ bucket, listed: 0, checked: 0, phase: "listing" });
    let refs: StorageObjectRef[];
    try {
      refs = await deps.listObjects(bucket, opts.prefix ?? "", opts.signal);
    } catch (error) {
      result.errors.push({ bucket, path: "", error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    const candidates = refs.filter(r => isCandidatePath(r.path));
    result.skipped += refs.length - candidates.length;
    opts.onProgress?.({ bucket, listed: refs.length, checked: 0, phase: "checking" });

    if (deps.primeHeads) {
      try { await deps.primeHeads(bucket, candidates.map(c => c.path)); } catch { /* per-object signing still works */ }
    }

    let checked = 0;
    await mapWithConcurrency(candidates, 4, async (ref) => {
      try {
        const head = await deps.readHead(bucket, ref.path);
        if (!head) {
          result.errors.push({ bucket, path: ref.path, error: "could not read object" });
        } else {
          result.objects.push({ ...ref, verdict: classifyBytes(head) });
        }
      } catch (error) {
        result.errors.push({ bucket, path: ref.path, error: error instanceof Error ? error.message : String(error) });
      }
      checked++;
      if (checked % 10 === 0 || checked === candidates.length) {
        opts.onProgress?.({ bucket, listed: refs.length, checked, phase: "checking" });
      }
    }, opts.signal);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Repair
// ---------------------------------------------------------------------------

export async function repairObject(obj: ClassifiedObject): Promise<RepairOutcome> {
  if (obj.verdict.kind !== "repairable") {
    return { bucket: obj.bucket, path: obj.path, status: "failed", error: "not a repairable image" };
  }

  const { data: blob, error: downloadError } = await supabase.storage.from(obj.bucket).download(obj.path);
  if (downloadError || !blob) {
    return { bucket: obj.bucket, path: obj.path, status: "failed", error: downloadError?.message ?? "download failed" };
  }

  // Hand the normaliser a File whose declared type reflects the REAL bytes, so a
  // HEIC stored as ".jpg" is routed through heic2any rather than a canvas that
  // cannot decode it.
  const name = obj.path.split("/").pop() ?? "image";
  const file = new File([blob], name, { type: mimeForLabel(obj.verdict.label) });
  const normalised = await normaliseImageForUpload(file);
  if (!normalised.ok) {
    return { bucket: obj.bucket, path: obj.path, status: "failed", error: normalised.error.reason };
  }

  const { error: uploadError } = await supabase.storage
    .from(obj.bucket)
    .upload(obj.path, normalised.image.blob, {
      upsert: true,
      contentType: normalised.image.mime,
      cacheControl: "3600",
    });
  if (uploadError) {
    return { bucket: obj.bucket, path: obj.path, status: "failed", error: uploadError.message };
  }

  const ext = extensionOf(obj.path);
  const note =
    ext && ext !== normalised.image.extension && !(ext === "jpeg" && normalised.image.extension === "jpg")
      ? `bytes are now ${normalised.image.extension.toUpperCase()} but the path keeps its .${ext} name (renaming would break stored references); Content-Type is correct`
      : undefined;

  return {
    bucket: obj.bucket,
    path: obj.path,
    status: "repaired",
    before: blob.size,
    after: normalised.image.blob.size,
    format: normalised.image.mime === "image/png" ? "png" : "jpeg",
    note,
  };
}

export async function repairObjects(
  objects: ClassifiedObject[],
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number, last: RepairOutcome) => void } = {},
): Promise<RepairOutcome[]> {
  const outcomes: RepairOutcome[] = [];
  for (const obj of objects) {
    if (opts.signal?.aborted) break;
    const outcome = await repairObject(obj);
    outcomes.push(outcome);
    opts.onProgress?.(outcomes.length, objects.length, outcome);
  }
  return outcomes;
}
