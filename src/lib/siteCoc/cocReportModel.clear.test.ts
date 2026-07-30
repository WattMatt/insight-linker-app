import { describe, it, expect } from "vitest";
import { buildCocReportModel } from "./cocReportModel";

const cert = (subsection_id: string, cert_no: string, verdict: string, rules: Record<string, string> = {}) => ({
  subsection_id, cert_no, cert_type: "Initial", verdict, rules,
  issued_date: "2024-01-01", coc_document_id: "d-" + cert_no, eval_document_id: null,
});

const subs = [
  { id: "p", name: "PASSING", tenant_name: "PASSING", is_coc_required: true },
  { id: "r", name: "REVIEWING", tenant_name: "REVIEWING", is_coc_required: true },
  { id: "c", name: "CONDITIONAL", tenant_name: "CONDITIONAL", is_coc_required: true },
  { id: "n", name: "UNMARKED", tenant_name: "UNMARKED", is_coc_required: true },
];

const build = (certificates: ReturnType<typeof cert>[]) =>
  buildCocReportModel({
    siteName: "S", generatedAt: "2026-06-19", lastImport: null,
    subsections: subs, certificates, schedule: [],
  });

describe("buildCocReportModel summary.clear", () => {
  it("counts only outright passes — review, cv and pending are not clear", () => {
    const m = build([
      cert("p", "B1", "PASS"),
      cert("r", "B2", "REVIEW — confirm earth continuity"),
      cert("c", "B3", "", { C14: "CV" }),
      cert("n", "B4", ""),
    ]);
    expect(m.summary.required).toBe(4);
    expect(m.summary.clear).toBe(1);
    expect(m.summary.compliantPct).toBe(25);
  });

  it("a tenant whose only fail sits beside a pass is still not clear", () => {
    const m = build([cert("p", "B1", "PASS"), cert("p", "B2", "FAIL", { C8: "FAIL" })]);
    expect(m.summary.clear).toBe(0);
    expect(m.summary.failed).toBe(1);
  });

  it("clear never exceeds required, and no-COC tenants stay out of it", () => {
    const m = build([cert("p", "B1", "PASS")]);
    expect(m.summary.clear).toBe(1);
    expect(m.summary.noCoc).toBe(3);
    expect(m.summary.clear + m.summary.noCoc).toBeLessThanOrEqual(m.summary.required);
  });

  it("clear agrees with the per-tenant verdict the same report renders", () => {
    const m = build([cert("p", "B1", "PASS"), cert("r", "B2", "REVIEW")]);
    expect(m.summary.clear).toBe(m.tenants.filter(t => t.coverage.verdictKind === "pass").length);
  });
});
