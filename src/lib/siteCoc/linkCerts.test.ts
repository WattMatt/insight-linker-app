import { describe, expect, it } from "vitest";
import { cleanQuery, folderQuery, planCertLinks } from "./linkCerts";

const subs = [
  { id: "s1", name: "SHOP 007", tenant_name: "STUDIO 88", shop_number: "007" },
  { id: "s2", name: "SHOP 008", tenant_name: "PEP CELL", shop_number: "008" },
  { id: "s3", name: "SHOP 09 & 010", tenant_name: "CAPITEC BANK", shop_number: "09 & 010" },
  { id: "s4", name: "Main DB 1", tenant_name: "Main DB 1", shop_number: null },
  { id: "s5", name: "Main DB 2", tenant_name: "Main DB 2", shop_number: null },
];

describe("folderQuery", () => {
  it("takes the folder under COCs/ and strips COC noise and dates", () => {
    expect(folderQuery("COCs/Skipper Bar/Skipper Bar COC.pdf")).toBe("Skipper Bar");
    expect(folderQuery("COCs/Botlokwa Plaza - Pep Cell - COC - 15.11.2024.pdf")).toBe("Botlokwa Plaza Pep Cell");
    expect(folderQuery("COCs/ECA M0332632 Botlokwa Plaza Ackermans.pdf")).toBe("ECA M0332632 Botlokwa Plaza Ackermans");
  });
});

describe("planCertLinks", () => {
  it("links by schedule first, then by shop number, then by a clear name match", () => {
    const out = planCertLinks(
      [
        { id: "c1", cert_no: "ECA 1", shop_no_raw: null, source_file: "COCs/nothing/x.pdf" },
        { id: "c2", cert_no: "ECA 2", shop_no_raw: "SHOP 008", source_file: null },
        { id: "c3", cert_no: "ECA 3", shop_no_raw: null, source_file: "COCs/Studio 88/Studio 88 - COC.pdf" },
      ],
      subs,
      [{ subsection_id: "s3", initial_cert_nos: "ECA 1; ECA 99" }],
    );
    expect(out[0]).toMatchObject({ outcome: "assign", method: "schedule", subsection_id: "s3" });
    expect(out[1]).toMatchObject({ outcome: "assign", method: "shop_no", subsection_id: "s2" });
    expect(out[2]).toMatchObject({ outcome: "assign", method: "name", subsection_id: "s1" });
  });
  it("sends weak or ambiguous matches to review, and nothing-like to unmatched", () => {
    const out = planCertLinks(
      [
        { id: "c1", cert_no: "A", source_file: "COCs/Main DB/Main DB COC.pdf" },
        { id: "c2", cert_no: "B", source_file: "COCs/Vodacom/Vodacom.pdf" },
        { id: "c3", cert_no: "C", source_file: "COCs/Pep/Pep - COC.pdf" },
        { id: "c4", cert_no: "D", source_file: "COCs/Capitec/Capitec - COC.pdf" },
      ],
      [...subs, { id: "s6", name: "SHOP 022", tenant_name: "PEP STORE", shop_number: "022" }],
    );
    expect(out[0].outcome).toBe("unmatched"); // "Main DB" alone is generic
    expect(out[1].outcome).toBe("unmatched");
    expect(out[2].outcome).toBe("review"); // PEP CELL and PEP STORE
    expect(out[2].candidates?.length).toBe(2);
    expect(out[3]).toMatchObject({ outcome: "assign", subsection_id: "s3" }); // CAPITEC BANK
  });
  it("never links when the schedule lists the certificate on two shops", () => {
    const out = planCertLinks([{ id: "c1", cert_no: "ECA 1", source_file: null }], subs,
      [{ subsection_id: "s1", initial_cert_nos: "ECA 1" }, { subsection_id: "s2", initial_cert_nos: "ECA 1" }]);
    expect(out[0].outcome).toBe("unmatched");
  });
});

describe("cleanQuery and generic queries", () => {
  it("strips DB prefixes and bracketed asides", () => {
    expect(cleanQuery("DB - TRABELLA PIZZERIA")).toBe("TRABELLA PIZZERIA");
    expect(cleanQuery("DB-N208B")).toBe("N208B");
    expect(cleanQuery("MAIN DB (Monument Center) - old main DB taken out")).toBe("old main DB taken out");
    expect(cleanQuery("COC Ground floor DB V.E [last token low confidence]")).toBe("COC Ground floor DB V E");
  });
  it("never links on a generic DB name or the site's own address", () => {
    const subs2 = [
      { id: "m1", name: "Main DB F1 1st Floor North", tenant_name: "Main DB", shop_number: null },
      { id: "m2", name: "Main DB LV", tenant_name: "Oxford", shop_number: null },
      { id: "t1", name: "SHOP N105", tenant_name: "TRABELLA PIZZERIA", shop_number: "N105" },
      { id: "t2", name: "N208B", tenant_name: "Centre management office", shop_number: "N208B" },
    ];
    const out = planCertLinks(
      [
        { id: "a", cert_no: "1", db_name: "Main DB", location: "204 Oxford Rd" },
        { id: "b", cert_no: "2", location: "204 Oxford Rd, Illovo" },
        { id: "c", cert_no: "3", db_name: "DB - TRABELLA PIZZERIA", location: "204 Oxford Rd" },
        { id: "d", cert_no: "4", db_name: "DB - N208B" },
      ],
      subs2, [], { siteName: "204 Oxford", siteAddress: "204 Oxford Rd, Illovo, Sandton, Gauteng" },
    );
    expect(out[0].outcome).toBe("unmatched");
    expect(out[1].outcome).toBe("unmatched");
    expect(out[2]).toMatchObject({ outcome: "assign", subsection_id: "t1" });
    expect(out[3]).toMatchObject({ outcome: "assign", subsection_id: "t2" });
  });
});

describe("number-only overlaps and punctuated site addresses", () => {
  it("does not link on a bare number or on a site-address word", () => {
    const subs3 = [
      { id: "m1", name: "Main DB 1", tenant_name: "Main DB 1", shop_number: null },
      { id: "u1", name: "SHOP UNIT 1", tenant_name: "Medico Pharmacy", shop_number: "UNIT 1" },
      { id: "f1", name: "Fourways flower market", tenant_name: "Fourways flower market", shop_number: null },
      { id: "k1", name: "SHOP 020", tenant_name: "KFC", shop_number: "020" },
    ];
    const out = planCertLinks(
      [
        { id: "a", cert_no: "1", location: "N1 Mphakane 1" },
        { id: "b", cert_no: "2", source_file: "COCs/ECA596878 BIYELA 1.pdf" },
        { id: "c", cert_no: "3", location: "Pineslopes Shopping Center Fourways" },
        { id: "d", cert_no: "4", source_file: "COCs/KFC.pdf" },
      ],
      subs3, [], { siteName: "Biyela Centre 1", siteAddress: "Corner Witkoppen & The Straight, Fourways, Gauteng" },
    );
    expect(out[0].outcome).not.toBe("assign");
    expect(out[1].outcome).not.toBe("assign");
    expect(out[2].outcome).not.toBe("assign");
    expect(out[3]).toMatchObject({ outcome: "assign", subsection_id: "k1" });
  });
});
