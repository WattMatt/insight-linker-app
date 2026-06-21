import { describe, it, expect } from "vitest";
import { miniBar, segmentedBar, gaugeBar, tintedKpiCard, toneForPct, TONE_TINT } from "./pdfBars";

// Recursively assert a pdfmake node tree contains NO `canvas` primitive. This is the whole
// point of these helpers: pdf.js mis-renders canvas-in-table-cell, so bars must be tables.
function hasCanvas(node: any): boolean {
  if (Array.isArray(node)) return node.some(hasCanvas);
  if (node && typeof node === "object") {
    if ("canvas" in node) return true;
    return Object.values(node).some(hasCanvas);
  }
  return false;
}

describe("toneForPct", () => {
  it("maps thresholds: >=80 green, >=50 amber, else red", () => {
    expect(toneForPct(100)).toBe("green");
    expect(toneForPct(80)).toBe("green");
    expect(toneForPct(79)).toBe("amber");
    expect(toneForPct(50)).toBe("amber");
    expect(toneForPct(49)).toBe("red");
    expect(toneForPct(0)).toBe("red");
  });
});

describe("miniBar", () => {
  it("is table-based, never canvas", () => {
    const bar: any = miniBar(50, "#1D9E75");
    expect(bar.table).toBeTruthy();
    expect(hasCanvas(bar)).toBe(false);
  });
  it("fills proportionally and clamps to [0,100]", () => {
    const half: any = miniBar(50, "#000", { width: 100 });
    expect(half.table.widths).toEqual([50, 50]);
    const over: any = miniBar(150, "#000", { width: 100 });
    expect(over.table.widths[0]).toBe(100); // clamped; track collapses to its min of 1
    const under: any = miniBar(-10, "#000", { width: 100 });
    expect(under.table.widths[0]).toBe(1); // fill never below its min of 1
  });
  it("paints fill then track colours", () => {
    const bar: any = miniBar(40, "#abc", { track: "#eee" });
    expect(bar.table.body[0][0].fillColor).toBe("#abc");
    expect(bar.table.body[0][1].fillColor).toBe("#eee");
  });
});

describe("segmentedBar", () => {
  it("drops zero-value segments and keeps one cell per visible segment", () => {
    const bar: any = segmentedBar([
      { value: 3, color: "#1D9E75" },
      { value: 0, color: "#EF9F27" },
      { value: 1, color: "#E24B4A" },
    ]);
    expect(bar.table.body[0]).toHaveLength(2);
    expect(bar.table.body[0].map((c: any) => c.fillColor)).toEqual(["#1D9E75", "#E24B4A"]);
    expect(hasCanvas(bar)).toBe(false);
  });
  it("renders a single grey track when all segments are zero", () => {
    const bar: any = segmentedBar([{ value: 0, color: "#1D9E75" }]);
    expect(bar.table.body[0]).toHaveLength(1);
    expect(bar.table.body[0][0].fillColor).toBe("#ECECEC");
  });
});

describe("gaugeBar", () => {
  it("is table-based and fills proportionally", () => {
    const g: any = gaugeBar(25, "#1D9E75", { width: 100 });
    expect(g.table.widths).toEqual([25, 75]);
    expect(hasCanvas(g)).toBe(false);
  });
});

describe("tintedKpiCard", () => {
  it("uses the tone tint and nests an accent bar + content, no canvas", () => {
    const card: any = tintedKpiCard({ label: "Compliance", value: "82%", sub: "10 of 12 clear", tone: "green", barPct: 82 });
    expect(card.fillColor).toBe(TONE_TINT.green.bg);
    expect(card.table.body[0][0].fillColor).toBe(TONE_TINT.green.accent); // left accent bar
    expect(hasCanvas(card)).toBe(false);
  });
  it("omits the bar and sub when not provided", () => {
    const card: any = tintedKpiCard({ label: "Outstanding", value: "3", tone: "amber" });
    const stack = card.table.body[0][1].stack;
    expect(stack).toHaveLength(2); // label + value only
  });
});
