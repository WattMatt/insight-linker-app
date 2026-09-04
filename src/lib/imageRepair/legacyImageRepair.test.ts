import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, any>;

const { store, calls, normaliser } = vi.hoisted(() => ({
  store: {
    // bucket -> folder -> pages of list() results
    listings: {} as Record<string, Record<string, Row[][]>>,
    downloads: {} as Record<string, Blob | null>,
    uploadError: null as { message: string } | null,
  },
  calls: [] as string[],
  normaliser: { result: null as any },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        list: (folder: string, opts: { offset?: number }) => {
          const pages = store.listings[bucket]?.[folder] ?? [[]];
          const pageIndex = Math.floor((opts.offset ?? 0) / 1000);
          calls.push(`list:${bucket}:${folder || "(root)"}:${opts.offset ?? 0}`);
          return Promise.resolve({ data: pages[pageIndex] ?? [], error: null });
        },
        download: (path: string) => {
          calls.push(`download:${bucket}/${path}`);
          const blob = store.downloads[`${bucket}/${path}`];
          return Promise.resolve(blob ? { data: blob, error: null } : { data: null, error: { message: "not found" } });
        },
        upload: (path: string, blob: Blob, opts: Row) => {
          calls.push(`upload:${bucket}/${path}:upsert=${opts.upsert}:type=${opts.contentType}:size=${blob.size}`);
          return Promise.resolve({ error: store.uploadError });
        },
        createSignedUrls: (paths: string[]) =>
          Promise.resolve({ data: paths.map(p => ({ path: p, signedUrl: `https://x/${bucket}/${p}` })), error: null }),
      }),
    },
  },
}));

vi.mock("@/lib/uploadImageNormaliser", () => ({
  normaliseImageForUpload: vi.fn(async (file: File) => {
    calls.push(`normalise:${file.name}:${file.type}`);
    return normaliser.result;
  }),
}));

import {
  classifyBytes,
  isCandidatePath,
  mimeForLabel,
  listBucketObjects,
  scanBuckets,
  repairObject,
  repairObjects,
  type ClassifiedObject,
} from "./legacyImageRepair";

const bytes = (...b: (number | string)[]) =>
  new Uint8Array(b.flatMap(x => (typeof x === "string" ? [...x].map(c => c.charCodeAt(0)) : [x])));

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, "PNG", 0x0d, 0x0a);
const HEIC = bytes(0, 0, 0, 0x18, "ftypheic", 0, 0, 0, 0);
const WEBP = bytes("RIFF", 0, 0, 0, 0, "WEBP");

const file = (name: string, id: string | null, size?: number): Row => ({
  name,
  id,
  metadata: id ? { size: size ?? 1000 } : null,
});

beforeEach(() => {
  store.listings = {};
  store.downloads = {};
  store.uploadError = null;
  normaliser.result = null;
  calls.length = 0;
});

describe("classifyBytes", () => {
  it("accepts JPEG and PNG as-is", () => {
    expect(classifyBytes(JPEG)).toEqual({ kind: "ok", format: "jpeg" });
    expect(classifyBytes(PNG)).toEqual({ kind: "ok", format: "png" });
  });

  it("flags ONLY the HEIC family as repairable", () => {
    expect(classifyBytes(HEIC)).toEqual({ kind: "repairable", label: "HEIC" });
  });

  it("reports browser-displayable formats (WebP/GIF/SVG) as displayable, never repairable", () => {
    expect(classifyBytes(WEBP)).toEqual({ kind: "displayable", label: "WebP (RIFF)" });
    expect(classifyBytes(bytes("GIF8"))).toEqual({ kind: "displayable", label: "GIF" });
    expect(classifyBytes(bytes("<svg"))).toEqual({ kind: "displayable", label: "SVG/XML" });
  });

  it("never marks an error body or empty object as an image", () => {
    expect(classifyBytes(bytes("{"))).toMatchObject({ kind: "not-image" });
    expect(classifyBytes(bytes("<html"))).toMatchObject({ kind: "not-image" });
    expect(classifyBytes(new Uint8Array(0))).toMatchObject({ kind: "not-image" });
  });
});

describe("isCandidatePath", () => {
  it("sniffs image extensions and extension-less names, skips documents and placeholders", () => {
    expect(isCandidatePath("site/IMG_0001.JPG")).toBe(true);
    expect(isCandidatePath("coc/abc/photo.heic")).toBe(true);
    expect(isCandidatePath("site/noext")).toBe(true);
    expect(isCandidatePath("site/Reports/report.pdf")).toBe(false);
    expect(isCandidatePath("site/sheet.xlsx")).toBe(false);
    expect(isCandidatePath("site/.emptyFolderPlaceholder")).toBe(false);
  });
});

describe("mimeForLabel", () => {
  it("routes HEIC-family bytes to a type the normaliser converts via heic2any", () => {
    expect(mimeForLabel("HEIC")).toBe("image/heic");
    expect(mimeForLabel("HEIF")).toBe("image/heic");
    expect(mimeForLabel("ISO-BMFF container (HEIC/AVIF family)")).toBe("image/heic");
  });

  it("does not claim a real type for non-repairable formats (they are never re-encoded)", () => {
    expect(mimeForLabel("WebP (RIFF)")).toBe("application/octet-stream");
    expect(mimeForLabel("SVG/XML")).toBe("application/octet-stream");
  });
});

describe("listBucketObjects", () => {
  it("recurses into folders and pages through large folders", async () => {
    const bigPage = Array.from({ length: 1000 }, (_, i) => file(`p${i}.jpg`, `id${i}`));
    store.listings["inspection-photos"] = {
      "": [[file("site-a", null), file("root.jpg", "r1")]],
      "site-a": [bigPage, [file("last.jpg", "l1", 42)]],
    };

    const refs = await listBucketObjects("inspection-photos");

    expect(refs).toHaveLength(1002);
    expect(refs.find(r => r.path === "site-a/last.jpg")).toEqual({ bucket: "inspection-photos", path: "site-a/last.jpg", size: 42 });
    expect(calls.filter(c => c.startsWith("list:"))).toEqual([
      "list:inspection-photos:(root):0",
      "list:inspection-photos:site-a:0",
      "list:inspection-photos:site-a:1000",
    ]);
  });
});

describe("scanBuckets", () => {
  it("classifies only candidate paths, counts skipped, and records read failures", async () => {
    const heads: Record<string, Uint8Array | null> = {
      "b/a.jpg": HEIC,
      "b/b.png": PNG,
      "b/c.jpg": null,
    };
    const deps = {
      listObjects: async () => [
        { bucket: "b", path: "a.jpg", size: 1 },
        { bucket: "b", path: "b.png", size: 1 },
        { bucket: "b", path: "c.jpg", size: 1 },
        { bucket: "b", path: "report.pdf", size: 1 },
      ],
      readHead: async (bucket: string, path: string) => heads[`${bucket}/${path}`] ?? null,
    };

    const result = await scanBuckets(["b"], { deps });

    expect(result.skipped).toBe(1);
    expect(result.objects.map(o => [o.path, o.verdict.kind]).sort()).toEqual([
      ["a.jpg", "repairable"],
      ["b.png", "ok"],
    ]);
    expect(result.errors).toEqual([{ bucket: "b", path: "c.jpg", error: "could not read object" }]);
  });

  it("stops early when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const deps = { listObjects: async () => { throw new Error("should not list"); }, readHead: async () => null };
    const result = await scanBuckets(["b"], { deps, signal: controller.signal });
    expect(result.objects).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

describe("repairObject", () => {
  const heicAsJpg: ClassifiedObject = {
    bucket: "coc-photos",
    path: "coc/ctx/photo/abc.jpg",
    size: 3_000_000,
    verdict: { kind: "repairable", label: "HEIC" },
  };

  it("downloads, normalises under the TRUE type, and upserts to the same path with a truthful Content-Type", async () => {
    store.downloads["coc-photos/coc/ctx/photo/abc.jpg"] = new Blob([HEIC]);
    normaliser.result = { ok: true, image: { blob: new Blob([JPEG]), mime: "image/jpeg", extension: "jpg", recompressed: true } };

    const outcome = await repairObject(heicAsJpg);

    expect(outcome).toMatchObject({ status: "repaired", format: "jpeg", before: HEIC.length, after: JPEG.length });
    expect((outcome as any).note).toBeUndefined();
    expect(calls).toEqual([
      "download:coc-photos/coc/ctx/photo/abc.jpg",
      "normalise:abc.jpg:image/heic",
      `upload:coc-photos/coc/ctx/photo/abc.jpg:upsert=true:type=image/jpeg:size=${JPEG.length}`,
    ]);
  });

  it("notes when the stored extension no longer matches the bytes", async () => {
    const obj = { ...heicAsJpg, path: "x/IMG_1.HEIC" };
    store.downloads["coc-photos/x/IMG_1.HEIC"] = new Blob([HEIC]);
    normaliser.result = { ok: true, image: { blob: new Blob([JPEG]), mime: "image/jpeg", extension: "jpg", recompressed: true } };

    const outcome = await repairObject(obj);

    expect(outcome.status).toBe("repaired");
    expect((outcome as any).note).toMatch(/keeps its \.heic name/);
  });

  it("does not upload when the normaliser refuses", async () => {
    store.downloads["coc-photos/coc/ctx/photo/abc.jpg"] = new Blob([HEIC]);
    normaliser.result = { ok: false, error: { reason: "HEIC image could not be converted. Please upload a JPG or PNG." } };

    const outcome = await repairObject(heicAsJpg);

    expect(outcome).toEqual({ bucket: "coc-photos", path: "coc/ctx/photo/abc.jpg", status: "failed", error: "HEIC image could not be converted. Please upload a JPG or PNG." });
    expect(calls.some(c => c.startsWith("upload:"))).toBe(false);
  });

  it("refuses to touch objects that are not repairable", async () => {
    const outcome = await repairObject({ ...heicAsJpg, verdict: { kind: "ok", format: "jpeg" } });
    expect(outcome.status).toBe("failed");
    expect(calls).toEqual([]);
  });

  it("reports a failed download without uploading", async () => {
    const outcome = await repairObject(heicAsJpg);
    expect(outcome).toMatchObject({ status: "failed", error: "not found" });
    expect(calls.some(c => c.startsWith("upload:"))).toBe(false);
  });
});

describe("repairObjects", () => {
  it("continues past failures and honours abort between items", async () => {
    const a: ClassifiedObject = { bucket: "b", path: "a.jpg", size: 1, verdict: { kind: "repairable", label: "HEIC" } };
    const b: ClassifiedObject = { bucket: "b", path: "b.jpg", size: 1, verdict: { kind: "repairable", label: "HEIC" } };
    store.downloads["b/b.jpg"] = new Blob([HEIC]);
    normaliser.result = { ok: true, image: { blob: new Blob([JPEG]), mime: "image/jpeg", extension: "jpg", recompressed: true } };

    const progress: number[] = [];
    const outcomes = await repairObjects([a, b], { onProgress: (done) => progress.push(done) });

    expect(outcomes.map(o => o.status)).toEqual(["failed", "repaired"]);
    expect(progress).toEqual([1, 2]);

    const controller = new AbortController();
    controller.abort();
    expect(await repairObjects([a, b], { signal: controller.signal })).toEqual([]);
  });
});
