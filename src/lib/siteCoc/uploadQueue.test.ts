import { describe, it, expect } from "vitest";
import { mapWithConcurrency, summarizeUpload, type FileOutcome } from "./uploadQueue";

describe("mapWithConcurrency", () => {
  it("processes all items, preserves order, and never exceeds the limit", async () => {
    let active = 0, maxActive = 0;
    const worker = async (n: number) => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return n * 2;
    };
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, worker);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("reports progress per completion", async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3], 2, async (n) => n, (done) => seen.push(done));
    expect(seen).toEqual([1, 2, 3]);
    expect(seen[seen.length - 1]).toBe(3);
  });
});

describe("summarizeUpload", () => {
  it("counts uploaded vs failed", () => {
    const outcomes: FileOutcome[] = [
      { name: "a.pdf", state: "uploaded", poolId: "1", detectedCertNo: "B-1" },
      { name: "b.pdf", state: "failed", error: "boom" },
      { name: "c.pdf", state: "uploaded", poolId: "2", detectedCertNo: null },
    ];
    expect(summarizeUpload(outcomes)).toEqual({ total: 3, uploaded: 2, failed: 1 });
  });
});
