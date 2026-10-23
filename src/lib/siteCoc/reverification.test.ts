import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { planSite, parseSourceDate, certNoNormForRow, reconcileSite, resolveSiteId, type SiteSource, type SourceDoc, type ExistingCert } from "./reverification";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const doc = (over: Partial<SourceDoc>): SourceDoc => ({
  id: "doc001", file: "a.pdf", doc_class: "electrical_coc", cert_no: "NM 1791989", cert_norm: "1791989",
  cls_type: "I", verdict: "FAIL", verdict_alt: "FAIL", reason: "A2 FAIL", flags: [], rules: [], db: null, date: "08/05/2025",
  ...over,
});
const site = (docs: SourceDoc[]): SiteSource => ({ site: "EVATON", policy: {}, docs });
const legacy = (over: Partial<ExistingCert>): ExistingCert => ({
  id: "L1", site_id: "S", cert_no: "NM 1791989", cert_no_norm: "NM1791989", verdict: "FAIL",
  subsection_id: "SUB1", coc_document_id: null, eval_document_id: null, ...over,
});

describe("planSite", () => {
  it("imports scored records only, as proposed rows with no final verdict", () => {
    const p = planSite(site([
      doc({ id: "a" }), doc({ id: "b", verdict: "N/A", doc_class: "non_electrical" }),
      doc({ id: "c", verdict: "N/A", doc_class: "duplicate", copy_of: "a" }),
    ]), "S", [], sha);
    expect(p.scored).toBe(1);
    expect(p.notScored).toBe(2);
    expect(p.adds).toHaveLength(1);
    expect(p.adds[0].row).toMatchObject({ review_status: "proposed", verdict: null, proposed_verdict: "FAIL", copies: ["c"], record_key: "a" });
  });

  it("folds a copy of a copy into the scored primary", () => {
    const p = planSite(site([
      doc({ id: "a" }), doc({ id: "b", verdict: "N/A", doc_class: "duplicate", copy_of: "a" }),
      doc({ id: "c", verdict: "N/A", doc_class: "duplicate", copy_of: "b" }),
    ]), "S", [], sha);
    expect(p.adds[0].row.copies).toEqual(["b", "c"]);
    expect(p.orphanCopies).toEqual([]);
  });

  it("keeps records that share cert_norm + db as separate rows (keyed by record id)", () => {
    const p = planSite(site([doc({ id: "a", cert_norm: "" }), doc({ id: "b", cert_norm: "" })]), "S", [], sha);
    expect(p.adds.map(a => a.row.record_key)).toEqual(["a", "b"]);
    expect(p.certNormDbCollisions).toBe(1);
  });

  it("first run leaves legacy rows live, links them for sign-off, and carries an unambiguous shop link", () => {
    const p = planSite(site([doc({ id: "a" })]), "S", [legacy({}), legacy({ id: "L2", cert_no: "X 9", cert_no_norm: "X9" })], sha);
    expect(p.adds[0].subsection_id).toBe("SUB1");
    expect(p.adds[0].supersedes_ids).toEqual(["L1"]);
    expect(p.adds[0].coc_document_id).toBeNull();
    expect(p.superseded).toEqual([]);
    expect(p).toMatchObject({ legacyLinked: 1, legacyUnlinked: 1 });
  });

  it("carries a document link only when the legacy matches agree on one", () => {
    const one = planSite(site([doc({ id: "a" })]), "S", [legacy({ coc_document_id: "D1" }), legacy({ id: "L2", coc_document_id: null })], sha);
    expect(one.adds[0].coc_document_id).toBe("D1");
    expect(one.docLinksCarried).toBe(1);
    const two = planSite(site([doc({ id: "a" })]), "S", [legacy({ coc_document_id: "D1" }), legacy({ id: "L2", coc_document_id: "D2" })], sha);
    expect(two.adds[0].coc_document_id).toBeNull();
  });

  it("re-run of the same batch is a no-op", () => {
    const src = site([doc({ id: "a" })]);
    const first = planSite(src, "S", [], sha);
    const prior: ExistingCert = { ...legacy({ id: "N1" }), record_key: "a", source_content_hash: first.adds[0].row.source_content_hash };
    const again = planSite(src, "S", [prior], sha);
    expect(again).toMatchObject({ adds: [], updates: [], unchanged: 1, superseded: [], blocked: [] });
  });

  it("changed source updates in place; a dropped record is superseded", () => {
    const priorA: ExistingCert = { ...legacy({ id: "N1" }), record_key: "a", source_content_hash: "old" };
    const priorZ: ExistingCert = { ...legacy({ id: "N2" }), record_key: "z", source_content_hash: "old" };
    const p = planSite(site([doc({ id: "a" })]), "S", [priorA, priorZ], sha);
    expect(p.updates.map(u => u.id)).toEqual(["N1"]);
    expect(p.superseded).toEqual(["N2"]);
  });

  it("blocks instead of touching a signed-off row", () => {
    const signed: ExistingCert = { ...legacy({ id: "N1" }), record_key: "a", source_content_hash: "old", signed_off_at: "2026-10-30" };
    const gone: ExistingCert = { ...legacy({ id: "N2" }), record_key: "z", signed_off_at: "2026-10-30" };
    const p = planSite(site([doc({ id: "a" })]), "S", [signed, gone], sha);
    expect(p.updates).toEqual([]);
    expect(p.superseded).toEqual([]);
    expect(p.blocked.map(b => b.id).sort()).toEqual(["N1", "N2"]);
  });

  it("attaches README caveats to the named record", () => {
    const p = planSite(site([doc({ id: "a", cert_norm: "2082938", rules: [{ rule: "C5", res: "FAIL" }] })]), "S", [], sha);
    expect(p.adds[0].row.caveats).toHaveLength(2);
  });
});

describe("certNoNormForRow", () => {
  it.each([
    ["NM 1791989", "NM1791989"], ["E-COC-M139904", "ECOCM139904"], ["559612 (handwritten above…", "559612"],
    ["COC 559612 (handwritten …", "COC559612"], ["NM (digits faded/illegib…", ""], [null, ""],
  ])("%s -> %s", (input, out) => expect(certNoNormForRow(input)).toBe(out));
});

describe("parseSourceDate", () => {
  it.each([
    ["08/05/2025", "2025-05-08"], ["2025-08-14", "2025-08-14"], ["09-09-2019", "2019-09-09"],
    ["15-7-16", null], ["October 2017", null], ["31/02/2020", null], ["", null], [null, null],
  ])("%s -> %s", (input, out) => expect(parseSourceDate(input)).toBe(out));
});

describe("reconcileSite / resolveSiteId", () => {
  it("reports mismatches against the roll-up", () => {
    const p = planSite(site([doc({})]), "S", [], sha);
    expect(reconcileSite(p, { records: 1, scored: 1, pass: 0, fail: 1, review: 0, na: 0 })).toEqual([]);
    expect(reconcileSite(p, { records: 2, scored: 1, pass: 0, fail: 1, review: 0, na: 1 })).toHaveLength(2);
  });
  it("resolves names case-insensitively, & as AND, and only when unique", () => {
    const sites = [{ id: "1", name: "Capricorn and Mutsindo" }, { id: "2", name: "Evaton" }, { id: "3", name: "EVATON" }];
    expect(resolveSiteId("CAPRICORN & MUTSINDO", sites, {})).toBe("1");
    expect(resolveSiteId("EVATON", sites, {})).toBeNull();
    expect(resolveSiteId("EVATON", sites, { EVATON: "2" })).toBe("2");
  });
});
