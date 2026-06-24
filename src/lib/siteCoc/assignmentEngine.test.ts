import { describe, it, expect } from "vitest";
import { planPoolAssignment } from "./assignmentEngine";

const certs = [
  { id: "c1", cert_no_norm: "B1612744", subsection_id: "u1" },
  { id: "c2", cert_no_norm: "B1612747", subsection_id: "u2" },
  { id: "c3", cert_no_norm: "DUP", subsection_id: "u3" },
  { id: "c4", cert_no_norm: "DUP", subsection_id: "u4" },     // ambiguous (two subsections)
  { id: "c5", cert_no_norm: "NOSUB", subsection_id: null },   // matched cert, no subsection
  { id: "c6", cert_no_norm: "SAME", subsection_id: "u9" },
  { id: "c7", cert_no_norm: "SAME", subsection_id: "u9" },    // duplicate, SAME subsection
];

describe("planPoolAssignment", () => {
  it("assigns an exact unique cert that has a subsection", () => {
    const r = planPoolAssignment([{ id: "p1", detected_cert_no: "B-1612744", detected_kind: "coc" }], certs);
    expect(r).toEqual([{ poolId: "p1", outcome: "assigned", certId: "c1", subsectionId: "u1" }]);
  });

  it("flags no_cert_detected when the filename had no cert token", () => {
    const r = planPoolAssignment([{ id: "p2", detected_cert_no: null, detected_kind: "coc" }], certs);
    expect(r[0]).toEqual({ poolId: "p2", outcome: "no_cert_detected" });
  });

  it("flags cert_not_found when the number is not in the register", () => {
    const r = planPoolAssignment([{ id: "p3", detected_cert_no: "Z-9", detected_kind: "coc" }], certs);
    expect(r[0]).toEqual({ poolId: "p3", outcome: "cert_not_found" });
  });

  it("flags cert_has_no_subsection when the only match has no subsection", () => {
    const r = planPoolAssignment([{ id: "p4", detected_cert_no: "NOSUB", detected_kind: "coc" }], certs);
    expect(r[0]).toEqual({ poolId: "p4", outcome: "cert_has_no_subsection", certId: "c5" });
  });

  it("flags ambiguous_cert with candidate ids when the number spans two subsections", () => {
    const r = planPoolAssignment([{ id: "p5", detected_cert_no: "DUP", detected_kind: "coc" }], certs);
    expect(r[0]).toEqual({
      poolId: "p5",
      outcome: "ambiguous_cert",
      candidateCertIds: ["c3", "c4"],
      candidateSubsectionIds: ["u3", "u4"],
    });
  });

  it("assigns duplicates that all point to the SAME subsection", () => {
    const r = planPoolAssignment([{ id: "p6", detected_cert_no: "SAME", detected_kind: "coc" }], certs);
    expect(r[0]).toEqual({ poolId: "p6", outcome: "assigned", certId: "c6", subsectionId: "u9" });
  });
});
