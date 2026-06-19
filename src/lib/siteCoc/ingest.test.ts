import { describe, it, expect } from "vitest";
import { matchShop, assembleScheduleRows, assembleCertificateRows, summarize } from "./ingest";
import type { ParsedScheduleRow, ParsedCertificate, SubsectionLite } from "./types";

const subs: SubsectionLite[] = [{ id: "u1", name: "SHOP-002" }, { id: "u2", name: "ATM 002" }];

describe("matchShop", () => {
  it("matches across separator differences", () => {
    expect(matchShop("SHOP 002", subs)).toBe("u1");
  });
  it("returns null when no match", () => {
    expect(matchShop("KIOSK K02", subs)).toBeNull();
  });
});

describe("assembleScheduleRows", () => {
  it("sets subsection_id + match_status", () => {
    const parsed: ParsedScheduleRow[] = [
      { shop_no_raw: "SHOP 002", trading_name: "S", coc_required: "Y", initial_cert_nos: "", supplementary_cert_nos: "", unclear: "", supp_to_initial_ref: "", files_count: 1, status: "OK", notes: "" },
      { shop_no_raw: "KIOSK K02", trading_name: "F", coc_required: "N/A", initial_cert_nos: "", supplementary_cert_nos: "", unclear: "", supp_to_initial_ref: "", files_count: 0, status: "N/A", notes: "" },
    ];
    const rows = assembleScheduleRows(parsed, subs, "site1", "batch1");
    expect(rows[0]).toMatchObject({ site_id: "site1", import_batch_id: "batch1", subsection_id: "u1", match_status: "matched" });
    expect(rows[1]).toMatchObject({ subsection_id: null, match_status: "unmatched" });
  });
});

describe("assembleCertificateRows", () => {
  it("sets subsection_id + match_status + keeps rules", () => {
    const certs: ParsedCertificate[] = [{ shop_no_raw: "ATM 002", cert_no: "B 1612747", cert_no_norm: "B1612747", cert_type: "Initial", doc_type: "electrical_coc", clause_9_2: "a", supp_to_init: "", issued_date: null, location: "", confidence: "high", source_file: "f.pdf", verdict: "PASS", reasons: "", rules: { A1: "PASS" }, notes: "" }];
    const rows = assembleCertificateRows(certs, subs, "site1", "batch1");
    expect(rows[0]).toMatchObject({ site_id: "site1", subsection_id: "u2", match_status: "matched", cert_no: "B 1612747", verdict: "PASS" });
    expect(rows[0].rules).toEqual({ A1: "PASS" });
  });
});

describe("summarize", () => {
  it("counts matched/unmatched", () => {
    const s = summarize(
      [{ match_status: "matched" }, { match_status: "unmatched" }],
      [{ match_status: "matched" }],
    );
    expect(s).toEqual({ shops_imported: 2, certs_imported: 1, matched_count: 1, unmatched_count: 1 });
  });
});
