import { describe, it, expect } from "vitest";
import { toSignOffRecord, issues, progress, filterRecords, indexAfterDecision, type SignOffRow, type SignOffRecord } from "./signOff";

const row = (over: Partial<SignOffRow> = {}): SignOffRow => ({
  id: "c1", record_key: "doc001", review_status: "proposed", proposed_verdict: "FAIL", proposed_verdict_alt: "FAIL",
  cert_no: "NM 1", cert_type: "Initial", doc_type: "electrical_coc", issued_date: "2025-05-08", location: null,
  confidence: "high", source_file: "a.pdf", reasons: "A2 FAIL", flags: ["f1"], caveats: ["c1"], db_name: null,
  building: null, reg_person: null, reg_no: null, subsection_id: null, signed_off_at: null, sign_off_note: null,
  rule_results: [{ rule: "A1", res: "PASS" }, { rule: "C1", res: "ASSERTED", note: "no value" }, { rule: "A2", res: "FAIL", note: "missing" }, { rule: "C3", res: "N/A" }],
  coc_certificate_source_files: [
    { page_no: 2, role: "page", coc_source_files: { storage_path: "coc-reverification/b.jpg" } },
    { page_no: 1, role: "page", coc_source_files: { storage_path: "coc-reverification/a.jpg" } },
  ],
  ...over,
});

describe("toSignOffRecord", () => {
  it("maps rows, orders pages, keeps string flags/caveats only", () => {
    const r = toSignOffRecord(row({ flags: ["x", 3, null] }));
    expect(r.pages).toEqual(["coc-reverification/a.jpg", "coc-reverification/b.jpg"]);
    expect(r.flags).toEqual(["x"]);
    expect(r).toMatchObject({ status: "proposed", verdict: "FAIL", recordKey: "doc001" });
  });
  it("tolerates missing page links and odd statuses", () => {
    const r = toSignOffRecord(row({ coc_certificate_source_files: null, review_status: "final", proposed_verdict: null }));
    expect(r).toMatchObject({ pages: [], status: "proposed", verdict: "REVIEW" });
  });
});

describe("issues", () => {
  it("drops PASS and N/A and puts FAIL first", () => {
    expect(issues(toSignOffRecord(row()).rules).map((r) => r.rule)).toEqual(["A2", "C1"]);
  });
});

describe("progress / filterRecords / indexAfterDecision", () => {
  const recs: SignOffRecord[] = [
    toSignOffRecord(row({ id: "1" })),
    toSignOffRecord(row({ id: "2", proposed_verdict: "PASS" })),
    toSignOffRecord(row({ id: "3", review_status: "signed_off" })),
    toSignOffRecord(row({ id: "4", review_status: "rejected" })),
  ];
  it("counts by status", () => expect(progress(recs)).toEqual({ total: 4, toReview: 2, signedOff: 1, rejected: 1 }));
  it("filters by status and verdict", () => {
    expect(filterRecords(recs, { status: "proposed", verdict: "all" }).map((r) => r.id)).toEqual(["1", "2"]);
    expect(filterRecords(recs, { status: "proposed", verdict: "PASS" }).map((r) => r.id)).toEqual(["2"]);
  });
  it("stays on the same slot after a decision, clamped to the end", () => {
    expect(indexAfterDecision(1, 3)).toBe(1);
    expect(indexAfterDecision(3, 3)).toBe(2);
    expect(indexAfterDecision(0, 0)).toBe(0);
  });
});
