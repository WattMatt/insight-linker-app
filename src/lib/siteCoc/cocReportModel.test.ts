import { describe, it, expect } from "vitest";
import { verdictKind, buildCocReportModel } from "./cocReportModel";

describe("verdictKind", () => {
  it("classifies fail/pass/review/cv/pending", () => {
    expect(verdictKind("FAIL", {})).toBe("fail");
    expect(verdictKind("PASS", { C1: "FAIL" })).toBe("fail");
    expect(verdictKind("PASS — minor (C14)", { C14: "CV" })).toBe("pass");
    expect(verdictKind("REVIEW — confirm", { C1: "CV" })).toBe("review");
    expect(verdictKind("", { C1: "CV" })).toBe("cv");
    expect(verdictKind("", {})).toBe("pending");
  });
  it("classifies an unknown non-empty verdict as review, not pass (safe default)", () => {
    expect(verdictKind("MISSING", {})).toBe("review");
    expect(verdictKind("INCOMPLETE", {})).toBe("review");
  });
});

const subs = [
  { id: "a", name: "ACK", tenant_name: "ACK", is_coc_required: true },
  { id: "t", name: "TELKOM", tenant_name: "TELKOM", is_coc_required: true },
  { id: "x", name: "STORE", tenant_name: "STORE", is_coc_required: false },
];
const certs = [
  { subsection_id: "a", cert_no: "B1", cert_type: "Initial", verdict: "PASS", rules: {}, issued_date: "2024-01-01", coc_document_id: "d1", eval_document_id: "e1" },
  { subsection_id: "a", cert_no: "B2", cert_type: "Supplementary", verdict: "FAIL", rules: { C8: "FAIL" }, issued_date: null, coc_document_id: "d2", eval_document_id: null },
];
const schedule = [{ subsection_id: "a", shop_no_raw: "SHOP 1", initial_cert_nos: "B1", supplementary_cert_nos: "B2" }];

describe("buildCocReportModel", () => {
  const m = buildCocReportModel({ siteName: "S", generatedAt: "2026-06-19", lastImport: "2026-06-19", subsections: subs, certificates: certs, schedule });
  it("summary counts COC-required only", () => {
    expect(m.summary.required).toBe(2);
    expect(m.summary.noCoc).toBe(1);
    expect(m.summary.failed).toBe(1);
  });
  it("issues list = no-COC + failed", () => {
    expect(m.issues.noCoc.map(i => i.name)).toEqual(["TELKOM"]);
    expect(m.issues.failed[0]).toMatchObject({ name: "ACK", certNo: "B2", failedRules: ["C8"] });
  });
  it("tenant carries register numbers, coverage, actions", () => {
    const ack = m.tenants.find(t => t.name === "ACK")!;
    expect(ack.registerInitial).toBe("B1");
    expect(ack.coverage.hasCoc).toBe(true);
    expect(ack.actions.some(a => a.includes("B2") && a.toLowerCase().includes("remediate"))).toBe(true);
    const telkom = m.tenants.find(t => t.name === "TELKOM")!;
    expect(telkom.noCoc).toBe(true);
    expect(telkom.actions[0].toLowerCase()).toContain("no coc");
  });
  it("excludes non-COC-required subsections", () => {
    expect(m.tenants.find(t => t.name === "STORE")).toBeUndefined();
  });
});

describe("buildCocReportModel data tables", () => {
  const schedule2 = [{
    subsection_id: "a", shop_no_raw: "SHOP 1", initial_cert_nos: "B1", supplementary_cert_nos: "B2",
    trading_name: "ACKERMANS", coc_required: "Y", files_count: 2, status: "MISSING — no electrical CoC", notes: "1 non-CoC doc",
  }];
  const certs2 = [{
    subsection_id: "a", cert_no: "B2", cert_type: "Supplementary", verdict: "FAIL — test value out of limit",
    rules: { A1: "PASS", C8: "FAIL" }, issued_date: "2024-02-02", coc_document_id: "d2", eval_document_id: null,
    shop_no_raw: "SHOP 1", doc_type: "electrical_coc", clause_9_2: "b", confidence: "high", source_file: "COCs/B2.pdf", notes: "reg person X",
  }];
  const m = buildCocReportModel({ siteName: "S", generatedAt: "d", lastImport: null, subsections: subs, certificates: certs2, schedule: schedule2 });

  it("schedule table carries raw status + columns for colouring", () => {
    expect(m.scheduleTable[0]).toMatchObject({ shopNo: "SHOP 1", trading: "ACKERMANS", req: "Y", files: 2, status: "MISSING — no electrical CoC", notes: "1 non-CoC doc" });
  });
  it("verification rows carry per-rule values + verdict", () => {
    expect(m.verificationRows[0]).toMatchObject({ shop: "SHOP 1", certNo: "B2", type: "Supplementary" });
    expect(m.verificationRows[0].rules.C8).toBe("FAIL");
    expect(m.verificationRows[0].rules.A1).toBe("PASS");
  });
  it("file register carries file name, matched shop, doc type", () => {
    expect(m.fileRegister[0]).toMatchObject({ file: "COCs/B2.pdf", matched: "SHOP 1", docType: "electrical_coc", certNo: "B2", clause92: "b", conf: "high" });
  });
});

describe("buildCocReportModel KPIs + cover", () => {
  const m = buildCocReportModel({ siteName: "S", generatedAt: "d", lastImport: null, clientName: "Acme", address: "1 St", subsections: subs, certificates: certs, schedule });
  it("cover carries client + address", () => {
    expect(m.cover).toEqual({ clientName: "Acme", address: "1 St" });
  });
  it("kpis compute coverage, verdict, outstanding", () => {
    expect(m.kpis.cocCoveragePct).toBe(50);   // ACK has COC; TELKOM none → 1 of 2
    expect(m.kpis.evalCoveragePct).toBe(50);   // ACK has eval e1
    expect(m.kpis.verdict.fail).toBe(1);
    expect(m.kpis.verdict.pass).toBe(1);
    expect(m.kpis.outstanding).toBe(2);        // TELKOM no-COC + ACK fail
  });
});

// Signed-off re-verification rows can carry no certificate number (blank on the test-report page)
// and no shop number. Before 2026-10-27 only workbook rows reached the report; signing off put these
// in and the Site COC Report crashed in the sorts ("Cannot read properties of null (reading 'localeCompare')").
describe("buildCocReportModel with missing certificate and shop numbers", () => {
  const nullCerts: Parameters<typeof buildCocReportModel>[0]["certificates"] = [
    { subsection_id: "a", cert_no: "B9", cert_type: "Initial", verdict: "FAIL", rules: {}, issued_date: null, coc_document_id: null, eval_document_id: null, source_file: "b.pdf" },
    { subsection_id: "a", cert_no: null, cert_type: "Unclear", verdict: "FAIL", rules: { C5: "FAIL" }, issued_date: null, coc_document_id: null, eval_document_id: null, shop_no_raw: null, source_file: null },
    { subsection_id: null, cert_no: null, cert_type: "Unclear", verdict: "REVIEW", rules: {}, issued_date: null, coc_document_id: null, eval_document_id: null, source_file: "a.pdf" },
  ];
  const nullSchedule: Parameters<typeof buildCocReportModel>[0]["schedule"] = [
    { subsection_id: "a", shop_no_raw: "SHOP 1", initial_cert_nos: "B9", supplementary_cert_nos: "" },
    { subsection_id: "t", shop_no_raw: null, initial_cert_nos: "", supplementary_cert_nos: "" },
  ];
  const build = () => buildCocReportModel({ siteName: "S", generatedAt: "2026-10-27", lastImport: null, subsections: subs, certificates: nullCerts, schedule: nullSchedule });

  it("builds without throwing", () => {
    expect(build).not.toThrow();
  });
  it("sorts rows with no number first, as empty strings", () => {
    const m = build();
    expect(m.verificationRows.map(r => r.certNo)).toEqual(["", "", "B9"]);
    expect(m.scheduleTable.map(r => r.shopNo)).toEqual(["", "SHOP 1"]);
    expect(m.fileRegister.map(r => r.file)).toEqual(["", "a.pdf", "b.pdf"]);
  });
  it("names a numberless failed COC in the action instead of leaving a blank", () => {
    const ack = build().tenants.find(t => t.name === "ACK")!;
    expect(ack.certs.map(c => c.certNo).sort()).toEqual(["", "B9"]);
    expect(ack.actions.some(a => a.startsWith("COC (no certificate number) failed SANS rule(s) C5"))).toBe(true);
  });
});

// Shops whose only certificates are proposed re-verification rows have a COC on file, awaiting sign-off.
// Before 27 Oct 2026 the report loaded only final/signed-off rows, so these read "No COC on file".
describe("buildCocReportModel: COC on file but awaiting sign-off", () => {
  type In = Parameters<typeof buildCocReportModel>[0];
  const shops: In["subsections"] = [
    { id: "f", name: "FINAL SHOP", tenant_name: null, is_coc_required: true },
    { id: "pf", name: "PROPOSED FAIL", tenant_name: null, is_coc_required: true },
    { id: "pp", name: "PROPOSED PASS", tenant_name: null, is_coc_required: true },
    { id: "pr", name: "PROPOSED REVIEW", tenant_name: null, is_coc_required: true },
    { id: "n", name: "NOTHING", tenant_name: null, is_coc_required: true },
  ];
  const row = (sub: string, cert: string, verdict: string, rules: Record<string, string> = {}) =>
    ({ subsection_id: sub, cert_no: cert, cert_type: "Initial", verdict, rules, issued_date: null, coc_document_id: null, eval_document_id: null });
  const m = buildCocReportModel({
    siteName: "S", generatedAt: "2026-10-27", lastImport: null, subsections: shops, schedule: [],
    certificates: [row("f", "F1", "PASS")],
    proposedCertificates: [
      row("f", "F2", "FAIL", { C8: "FAIL" }),        // ignored: shop already has a final row
      row("pf", "P1", "FAIL", { C8: "FAIL" }),
      row("pp", "P2", "PASS", { C5: "FLAG" }),
      row("pr", "P3", "REVIEW"),
    ],
  });
  const t = (name: string) => m.tenants.find(x => x.name === name)!;

  it("a shop with only proposed rows is on file, not 'no COC'", () => {
    expect(m.issues.noCoc.map(i => i.name)).toEqual(["NOTHING"]);
    expect(m.summary.noCoc).toBe(1);
    expect(t("PROPOSED FAIL").noCoc).toBe(false);
    expect(t("PROPOSED FAIL").awaitingSignOff).toBe(true);
  });
  it("failed and review proposals are listed under their verdict, marked awaiting sign-off", () => {
    expect(m.issues.failed).toEqual([{ name: "PROPOSED FAIL", certNo: "P1", failedRules: ["C8"], awaitingSignOff: true }]);
    expect(m.issues.awaitingSignOff).toEqual([
      { name: "PROPOSED FAIL", verdictKind: "fail" },
      { name: "PROPOSED PASS", verdictKind: "pass" },
      { name: "PROPOSED REVIEW", verdictKind: "review" },
    ]);
    expect(m.summary.awaitingSignOff).toBe(3);
    expect(t("PROPOSED FAIL").actions.some(a => a.includes("awaiting sign-off"))).toBe(true);
  });
  it("a shop's final/signed-off rows win over its proposals", () => {
    expect(t("FINAL SHOP").awaitingSignOff).toBe(false);
    expect(t("FINAL SHOP").certs.map(c => c.certNo)).toEqual(["F1"]);
  });
  it("only signed/final passes count as clear", () => {
    expect(m.summary.clear).toBe(1);
    expect(t("PROPOSED PASS").coverage.verdictKind).toBe("pass");
    expect(m.summary.compliantPct).toBe(20);
  });
  it("without proposed rows nothing changes", () => {
    const plain = buildCocReportModel({ siteName: "S", generatedAt: "x", lastImport: null, subsections: shops, schedule: [], certificates: [row("f", "F1", "PASS")] });
    expect(plain.summary.noCoc).toBe(4);
    expect(plain.summary.awaitingSignOff).toBe(0);
    expect(plain.issues.awaitingSignOff).toEqual([]);
  });
});
