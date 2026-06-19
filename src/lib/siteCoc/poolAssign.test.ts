import { describe, it, expect } from "vitest";
import { planPoolAutoAssign } from "./poolAssign";

const certs = [
  { id: "c1", cert_no_norm: "B1612744", subsection_id: "u1" },
  { id: "c2", cert_no_norm: "B1612747", subsection_id: "u2" },
  { id: "c3", cert_no_norm: "DUP", subsection_id: "u3" },
  { id: "c4", cert_no_norm: "DUP", subsection_id: "u4" },   // ambiguous
  { id: "c5", cert_no_norm: "NOSUB", subsection_id: null }, // no subsection
];

describe("planPoolAutoAssign", () => {
  it("auto-assigns exact unique matches with detected kind", () => {
    const out = planPoolAutoAssign([
      { id: "p1", detected_cert_no: "B-1612744", detected_kind: "coc" },
      { id: "p2", detected_cert_no: "B 1612747", detected_kind: "eval" },
    ], certs);
    expect(out).toEqual([
      { poolId: "p1", subsectionId: "u1", kind: "coc" },
      { poolId: "p2", subsectionId: "u2", kind: "eval" },
    ]);
  });
  it("skips ambiguous, no-subsection, and no-number files", () => {
    const out = planPoolAutoAssign([
      { id: "p3", detected_cert_no: "DUP", detected_kind: "coc" },
      { id: "p4", detected_cert_no: "NOSUB", detected_kind: "coc" },
      { id: "p5", detected_cert_no: null, detected_kind: "coc" },
    ], certs);
    expect(out).toEqual([]);
  });
});
