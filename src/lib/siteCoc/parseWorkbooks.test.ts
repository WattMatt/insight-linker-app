import { describe, it, expect } from "vitest";
import { parseDbSchedule, parseCertificateDetail, parseVerification, mergeCertificates } from "./parseWorkbooks";

const schedRows = [
  ["YARONA — DB / COC SCHEDULE"],
  ["desc line"],
  ["Shop No","Trading Name","COC Req.","Initial COC No(s)","Supplementary COC No(s)","Unclear (no tick)","Supp→Initial ref","Files","Status","Notes"],
  ["SHOP 002","SHOPRITE LIQUOR SHOP","Y","B 1612744; ECA 147525","NM 1850896","","185 0896",4,"OK — initial present",""],
  ["KIOSK K02","FNB SELF SERVICE CHANNEL","N/A","","","","",0,"N/A",""],
];

const certRows = [
  ["File","Matched","Doc type","Cert No","Type","9(2)","Supp→Init","Issued","Location","Conf","Notes"],
  ["COCs/B1612744 - SHOP K4.pdf","SHOP 002","electrical_coc","B 1612744","Initial","a","","2024-11-05","Mzansi","high","reg 7(1)"],
];

const verifRows = [
  ["YARONA — COC VERIFICATION"],
  ["desc"],
  ["Shop","Trading","Cert No","Type","Verdict","Reasons","A1 cert no","B1 conductors","C15 switching"],
  ["SHOP 002","SHOPRITE LIQUOR SHOP","B 1612744","I","PASS","","PASS","PASS","N/A"],
];

describe("parseDbSchedule", () => {
  it("parses rows under the header, skipping title rows", () => {
    const rows = parseDbSchedule(schedRows);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ shop_no_raw: "SHOP 002", trading_name: "SHOPRITE LIQUOR SHOP", coc_required: "Y", files_count: 4, status: "OK — initial present" });
    expect(rows[1]).toMatchObject({ shop_no_raw: "KIOSK K02", coc_required: "N/A", files_count: 0 });
  });
});

describe("parseCertificateDetail", () => {
  it("maps metadata fields", () => {
    const rows = parseCertificateDetail(certRows);
    expect(rows[0]).toMatchObject({ shop_no_raw: "SHOP 002", cert_no: "B 1612744", cert_no_norm: "B1612744", cert_type: "Initial", doc_type: "electrical_coc", clause_9_2: "a", issued_date: "2024-11-05", confidence: "high", source_file: "COCs/B1612744 - SHOP K4.pdf" });
  });
});

describe("parseVerification", () => {
  it("maps verdict + rules by code", () => {
    const rows = parseVerification(verifRows);
    expect(rows[0]).toMatchObject({ shop_no_raw: "SHOP 002", cert_no: "B 1612744", cert_type: "Initial", verdict: "PASS" });
    expect(rows[0].rules).toEqual({ A1: "PASS", B1: "PASS", C15: "N/A" });
  });
});

describe("mergeCertificates", () => {
  it("merges detail + verification by (shop, cert_no_norm, type)", () => {
    const merged = mergeCertificates(parseCertificateDetail(certRows), parseVerification(verifRows));
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ cert_no: "B 1612744", doc_type: "electrical_coc", verdict: "PASS" });
    expect(merged[0].rules.A1).toBe("PASS");
  });
  it("keeps a verification-only cert when no detail match", () => {
    const merged = mergeCertificates([], parseVerification(verifRows));
    expect(merged).toHaveLength(1);
    expect(merged[0].verdict).toBe("PASS");
    expect(merged[0].doc_type).toBe("");
  });
});
