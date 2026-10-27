import { describe, expect, it } from "vitest";
import { folderQuery, planCertLinks } from "./linkCerts";

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
      ],
      subs,
    );
    expect(out[0].outcome).toBe("review");
    expect(out[0].candidates?.length).toBeGreaterThan(1);
    expect(out[1].outcome).toBe("unmatched");
  });
  it("never links when the schedule lists the certificate on two shops", () => {
    const out = planCertLinks([{ id: "c1", cert_no: "ECA 1", source_file: null }], subs,
      [{ subsection_id: "s1", initial_cert_nos: "ECA 1" }, { subsection_id: "s2", initial_cert_nos: "ECA 1" }]);
    expect(out[0].outcome).toBe("unmatched");
  });
});
