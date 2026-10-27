import { describe, it, expect } from "vitest";
import { forEachLimited } from "./concurrency";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("forEachLimited", () => {
  it("never runs more than `limit` at once and visits every item", async () => {
    let inFlight = 0, peak = 0;
    const seen: number[] = [];
    await forEachLimited(Array.from({ length: 40 }, (_, i) => i), 6, async (n) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await tick(1 + (n % 3));
      seen.push(n);
      inFlight--;
    });
    expect(peak).toBe(6);
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => i));
  });

  it("handles fewer items than the limit and an empty list", async () => {
    const seen: number[] = [];
    await forEachLimited([1, 2], 6, async (n) => { seen.push(n); });
    await forEachLimited([], 6, async () => { throw new Error("not called"); });
    expect(seen).toEqual([1, 2]);
  });

  it("rejects with the first error", async () => {
    await expect(forEachLimited([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error("boom"); })).rejects.toThrow("boom");
  });
});
