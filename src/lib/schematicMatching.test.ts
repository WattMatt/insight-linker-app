import { describe, it, expect } from "vitest";
import {
  normalizeToken,
  parseStorageUrl,
  nextBlockIdentifier,
  matchSubsectionId,
  computeAutoMatches,
  type BlockLike,
  type SubsectionLike,
} from "./schematicMatching";

describe("normalizeToken", () => {
  it("uppercases and strips non-alphanumerics", () => {
    expect(normalizeToken("DB-001")).toBe("DB001");
    expect(normalizeToken("  shop rite ")).toBe("SHOPRITE");
    expect(normalizeToken(null)).toBe("");
    expect(normalizeToken(undefined)).toBe("");
  });
});

describe("parseStorageUrl", () => {
  it("parses public object URLs", () => {
    expect(
      parseStorageUrl(
        "https://x.supabase.co/storage/v1/object/public/documents/site-1/schematic-123.pdf"
      )
    ).toEqual({ bucket: "documents", path: "site-1/schematic-123.pdf" });
  });
  it("parses signed URLs and ignores query params", () => {
    expect(
      parseStorageUrl(
        "https://x.supabase.co/storage/v1/object/sign/documents/a/b.pdf?token=abc"
      )
    ).toEqual({ bucket: "documents", path: "a/b.pdf" });
  });
  it("decodes encoded path segments", () => {
    expect(
      parseStorageUrl(
        "https://x.supabase.co/storage/v1/object/public/documents/site%201/my%20file.pdf"
      )
    ).toEqual({ bucket: "documents", path: "site 1/my file.pdf" });
  });
  it("returns null for non-storage / invalid URLs", () => {
    expect(parseStorageUrl("https://example.com/foo.pdf")).toBeNull();
    expect(parseStorageUrl("not a url")).toBeNull();
    expect(parseStorageUrl("")).toBeNull();
    expect(parseStorageUrl(null)).toBeNull();
  });
});

describe("nextBlockIdentifier", () => {
  it("starts at DB-001 when empty", () => {
    expect(nextBlockIdentifier([])).toBe("DB-001");
  });
  it("uses max+1, not count (survives deletions)", () => {
    // DB-002 deleted: count is 2 but next must be DB-004, not DB-003.
    const blocks = [{ block_identifier: "DB-001" }, { block_identifier: "DB-003" }];
    expect(nextBlockIdentifier(blocks)).toBe("DB-004");
  });
  it("ignores custom (non-DB) identifiers", () => {
    expect(
      nextBlockIdentifier([{ block_identifier: "SHOPRITE" }, { block_identifier: "KFC" }])
    ).toBe("DB-001");
  });
  it("handles mixed formats", () => {
    expect(
      nextBlockIdentifier([{ block_identifier: "DB050" }, { block_identifier: "DB-7" }])
    ).toBe("DB-051");
  });
});

const subs: SubsectionLike[] = [
  { id: "s1", name: "DB-001" },
  { id: "s10", name: "DB-010" },
  { id: "shop", name: "Shoprite" },
];

describe("matchSubsectionId", () => {
  it("matches exact normalized names", () => {
    expect(matchSubsectionId("DB-001", subs)).toBe("s1");
    expect(matchSubsectionId("db001", subs)).toBe("s1");
    expect(matchSubsectionId("SHOPRITE", subs)).toBe("shop");
  });
  it("does NOT make short-substring false matches", () => {
    // The old bug: "DB-01" would substring-match "DB-010". Exact matching rejects it.
    expect(matchSubsectionId("DB-01", subs)).toBeNull();
    expect(matchSubsectionId("DB", subs)).toBeNull();
  });
  it("respects the exclude set", () => {
    expect(matchSubsectionId("DB-001", subs, new Set(["s1"]))).toBeNull();
  });
});

describe("computeAutoMatches", () => {
  it("links unlinked blocks and never reuses a subsection", () => {
    const blocks: BlockLike[] = [
      { id: "b1", block_identifier: "DB-001", subsection_id: null },
      { id: "b2", block_identifier: "DB-001", subsection_id: null }, // duplicate identifier
      { id: "b3", block_identifier: "Shoprite", subsection_id: null },
      { id: "b4", block_identifier: "DB-010", subsection_id: "s10" }, // already linked
    ];
    const matches = computeAutoMatches(blocks, subs);
    // b1 takes s1; b2 (same identifier) finds nothing left; b3 takes shop; b4 skipped.
    expect(matches).toEqual([
      { blockId: "b1", subsectionId: "s1" },
      { blockId: "b3", subsectionId: "shop" },
    ]);
  });
  it("does not reuse a subsection already linked to another block", () => {
    const blocks: BlockLike[] = [
      { id: "b1", block_identifier: "DB-001", subsection_id: "s1" },
      { id: "b2", block_identifier: "DB-001", subsection_id: null },
    ];
    expect(computeAutoMatches(blocks, subs)).toEqual([]);
  });
});
