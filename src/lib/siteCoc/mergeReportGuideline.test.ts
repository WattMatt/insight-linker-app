import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergeGuidelineAfterCover } from "./mergeReportGuideline";

async function makeDoc(sizes: [number, number][]): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (const [w, h] of sizes) d.addPage([w, h]);
  return d.save();
}

describe("mergeGuidelineAfterCover", () => {
  it("inserts guideline pages after the report cover, then the rest", async () => {
    const report = await makeDoc([[842, 595], [842, 595], [842, 595]]); // landscape: cover + 2 rest
    const guide = await makeDoc([[595, 842], [595, 842]]);              // portrait
    const out = await mergeGuidelineAfterCover(report, guide);
    const merged = await PDFDocument.load(out);
    expect(merged.getPageCount()).toBe(5);
    const portrait = (i: number) => { const p = merged.getPage(i).getSize(); return p.height > p.width; };
    expect(portrait(0)).toBe(false); // cover
    expect(portrait(1)).toBe(true);  // guideline
    expect(portrait(2)).toBe(true);  // guideline
    expect(portrait(3)).toBe(false); // rest
    expect(portrait(4)).toBe(false); // rest
  });

  it("handles a single-page report (cover only)", async () => {
    const report = await makeDoc([[842, 595]]);
    const guide = await makeDoc([[595, 842]]);
    const out = await mergeGuidelineAfterCover(report, guide);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });
});
