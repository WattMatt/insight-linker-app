import { describe, it, expect } from "vitest";
import { buildingCompliance, complianceBySection } from "./buildingCompliance";
import type { OhsComplianceItem } from "./types";

const item = (over: Partial<OhsComplianceItem> = {}): OhsComplianceItem =>
  ({ id: "i", site_id: "s", question: "q", answer: "Y", weight: 1, section: null, ...over } as OhsComplianceItem);

describe("buildingCompliance", () => {
  it("weights compliant answers and excludes N/A from the denominator", () => {
    const items = [
      item({ id: "1", answer: "Y", weight: 3 }),
      item({ id: "2", answer: "N", weight: 1 }),
      item({ id: "3", answer: "N/A", weight: 5 }), // excluded
    ];
    const s = buildingCompliance(items);
    expect(s.compliantWeight).toBe(3);
    expect(s.applicableWeight).toBe(4); // 3 + 1, N/A excluded
    expect(s.compliancePct).toBe(75);
    expect(s.naCount).toBe(1);
    expect(s.applicableCount).toBe(2);
  });

  it("defaults a null weight to 1", () => {
    const s = buildingCompliance([item({ answer: "Y", weight: null }), item({ answer: "N", weight: null })]);
    expect(s.applicableWeight).toBe(2);
    expect(s.compliancePct).toBe(50);
  });

  it("returns 100% when nothing is applicable (all N/A or empty)", () => {
    expect(buildingCompliance([]).compliancePct).toBe(100);
    expect(buildingCompliance([item({ answer: "N/A" })]).compliancePct).toBe(100);
  });

  it("ignores null answers (uncaptured items)", () => {
    const s = buildingCompliance([item({ answer: "Y", weight: 1 }), item({ answer: null, weight: 9 })]);
    expect(s.applicableWeight).toBe(1);
    expect(s.compliancePct).toBe(100);
  });
});

describe("complianceBySection", () => {
  it("rolls up per section", () => {
    const items = [
      item({ section: "1 Building", answer: "Y", weight: 1 }),
      item({ section: "1 Building", answer: "N", weight: 1 }),
      item({ section: "2 Equipment", answer: "Y", weight: 1 }),
    ];
    const bySection = complianceBySection(items);
    expect(bySection["1 Building"].compliancePct).toBe(50);
    expect(bySection["2 Equipment"].compliancePct).toBe(100);
  });
});
