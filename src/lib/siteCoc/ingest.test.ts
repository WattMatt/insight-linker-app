import { describe, it, expect } from "vitest";
import { matchSubsection, assembleScheduleRows, assembleCertificateRows, summarize } from "./ingest";
import type { ParsedScheduleRow, ParsedCertificate, SubsectionLite } from "./types";

// Subsections named by TRADING NAME (the real YARONA shape), some by tenant.
const subs: SubsectionLite[] = [
  { id: "ack", name: "ACKERMANS", tenant_name: "ACKERMANS" },
  { id: "d2d", name: "DAY TO DAY", tenant_name: "DAY TO DAY" },
  { id: "pep", name: "PEP", tenant_name: "PEP" },
  { id: "pepc", name: "PEP CELL", tenant_name: "PEP CELL" },
  { id: "atmAbsa", name: "ATM", tenant_name: "ABSA" },
  { id: "atmCap", name: "ATM", tenant_name: "CAPITEC" },
  { id: "kfc", name: "KFC", tenant_name: "KFC" },
];

describe("matchSubsection", () => {
  it("exact match on trading name vs subsection name", () => {
    expect(matchSubsection({ shop_no_raw: "SHOP 004 004B", trading_name: "ACKERMANS" }, subs)).toBe("ack");
  });
  it("contains match when trading name is longer than the subsection name", () => {
    expect(matchSubsection({ shop_no_raw: "SHOP 001", trading_name: "DAY TO DAY FASHION AND LIVING" }, subs)).toBe("d2d");
  });
  it("exact match prefers the precise name over a longer sibling (PEP vs PEP CELL)", () => {
    expect(matchSubsection({ shop_no_raw: "SHOP 011", trading_name: "PEP" }, subs)).toBe("pep");
    expect(matchSubsection({ shop_no_raw: "SHOP 005A", trading_name: "PEP CELL" }, subs)).toBe("pepc");
  });
  it("matches an ATM by tenant via contains (Shop No 'ATM nnn' does not cause ambiguity)", () => {
    expect(matchSubsection({ shop_no_raw: "ATM 001", trading_name: "ABSA BANK LIMITED" }, subs)).toBe("atmAbsa");
  });
  it("returns null for abbreviation mismatch (manual resolve)", () => {
    expect(matchSubsection({ shop_no_raw: "SHOP 013C", trading_name: "KENTUCKY FRIED CHICKEN" }, subs)).toBeNull();
  });
  it("returns null when nothing matches", () => {
    expect(matchSubsection({ shop_no_raw: "SHOP 999", trading_name: "UNKNOWN STORE" }, subs)).toBeNull();
  });
});

const schedRow = (over: Partial<ParsedScheduleRow>): ParsedScheduleRow => ({
  shop_no_raw: "", trading_name: "", coc_required: "Y", initial_cert_nos: "", supplementary_cert_nos: "",
  unclear: "", supp_to_initial_ref: "", files_count: 0, status: "", notes: "", ...over,
});

describe("assembleScheduleRows", () => {
  it("sets subsection_id + match_status via the smart matcher", () => {
    const rows = assembleScheduleRows(
      [schedRow({ shop_no_raw: "SHOP 004", trading_name: "ACKERMANS" }),
       schedRow({ shop_no_raw: "SHOP 013C", trading_name: "KENTUCKY FRIED CHICKEN" })],
      subs, "site1", "batch1");
    expect(rows[0]).toMatchObject({ subsection_id: "ack", match_status: "matched", site_id: "site1", import_batch_id: "batch1" });
    expect(rows[1]).toMatchObject({ subsection_id: null, match_status: "unmatched" });
  });
});

describe("assembleCertificateRows", () => {
  it("inherits the shop's match from the assembled schedule rows", () => {
    const schedRows = assembleScheduleRows([schedRow({ shop_no_raw: "SHOP 004", trading_name: "ACKERMANS" })], subs, "site1", "batch1");
    const certs: ParsedCertificate[] = [{
      shop_no_raw: "SHOP 004", cert_no: "B 1612744", cert_no_norm: "B1612744", cert_type: "Initial",
      doc_type: "electrical_coc", clause_9_2: "a", supp_to_init: "", issued_date: null, location: "",
      confidence: "high", source_file: "f.pdf", verdict: "PASS", reasons: "", rules: { A1: "PASS" }, notes: "",
    }];
    const rows = assembleCertificateRows(certs, schedRows, "site1", "batch1");
    expect(rows[0]).toMatchObject({ subsection_id: "ack", match_status: "matched", cert_no: "B 1612744" });
  });
  it("unmatched cert when its shop has no schedule match", () => {
    const schedRows = assembleScheduleRows([schedRow({ shop_no_raw: "SHOP 013C", trading_name: "KENTUCKY FRIED CHICKEN" })], subs, "site1", "batch1");
    const certs: ParsedCertificate[] = [{
      shop_no_raw: "SHOP 013C", cert_no: "X 1", cert_no_norm: "X1", cert_type: "Unclear",
      doc_type: "", clause_9_2: "", supp_to_init: "", issued_date: null, location: "",
      confidence: "", source_file: "", verdict: "", reasons: "", rules: {}, notes: "",
    }];
    const rows = assembleCertificateRows(certs, schedRows, "site1", "batch1");
    expect(rows[0].subsection_id).toBeNull();
    expect(rows[0].match_status).toBe("unmatched");
  });
});

describe("summarize", () => {
  it("counts matched/unmatched", () => {
    const s = summarize([{ match_status: "matched" }, { match_status: "unmatched" }], [{ match_status: "matched" }]);
    expect(s).toEqual({ shops_imported: 2, certs_imported: 1, matched_count: 1, unmatched_count: 1 });
  });
});
