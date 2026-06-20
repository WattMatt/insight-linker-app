import { describe, it, expect } from "vitest";
import { inspectionPassRate, buildSiteKpiBlock } from "./reportKpis";

describe("inspectionPassRate", () => {
  it("tallies pass/fail across sections, excludes pending/N-A", () => {
    const out = inspectionPassRate([
      { json_data: { sections: [{ items: [{ value: true }, { value: false }, { value: "N/A" }] }] } },
    ]);
    expect(out).toEqual({ pass: 1, fail: 1, pct: 50 });
  });
  it("aggregates across multiple inspections", () => {
    const out = inspectionPassRate([
      { json_data: { sections: [{ items: [{ value: "Pass" }, { value: "Pass" }] }] } },
      { json_data: { sections: [{ items: [{ value: "fail" }] }] } },
    ]);
    expect(out).toEqual({ pass: 2, fail: 1, pct: 67 });
  });
  it("empty -> 100 (nothing assessed)", () => {
    expect(inspectionPassRate([])).toEqual({ pass: 0, fail: 0, pct: 100 });
  });
});

describe("buildSiteKpiBlock", () => {
  const deliverablesSummary = {
    completionPct: 63,
    deliverables: [
      { key: "metering", done: 28, total: 28 },
      { key: "inspections", done: 26, total: 28 },
    ],
  };
  const snags = [
    { status: "Open", risk_level: "Critical", created_at: "2026-01-01", rectified_at: null },
    { status: "Open", risk_level: "Medium", created_at: "2026-06-10", rectified_at: null },
    { status: "Rectified", risk_level: "Low", created_at: "2026-05-01", rectified_at: "2026-05-10" },
  ];
  const subsections = [
    { coc_status: "Pass", coc_expiry_date: "2026-07-05" }, // 15 days from today -> within30
    { coc_status: "Pass", coc_expiry_date: null },
  ];
  const inspections = [
    { json_data: { sections: [{ items: [{ value: true }, { value: false }] }] } },
  ];

  it("assembles all site KPIs from reused site data", () => {
    const k = buildSiteKpiBlock({ deliverablesSummary, snags, subsections, inspections, today: "2026-06-20" });
    expect(k.readinessPct).toBe(63);
    expect(k.meteringDone).toBe(28);
    expect(k.meteringTotal).toBe(28);
    expect(k.snagsOpen).toBe(2);
    expect(k.snagsHighRisk).toBe(1);
    expect(k.snagsClosed).toBe(1);
    expect(k.oldestOpenDays).toBeGreaterThan(100);
    expect(k.inspectionPassPct).toBe(50);
    expect(k.expiry.within30).toBe(1);
    expect(k.expiry.expired).toBe(0);
  });
});
