import { describe, it, expect } from "vitest";
import { classifyCocFile, planRouting } from "./routeUpload";

describe("classifyCocFile", () => {
  it("PASS-/FAIL- prefix => eval", () => {
    expect(classifyCocFile("PASS-B-1612744-X.html")).toBe("eval");
    expect(classifyCocFile("FAIL_B-1.pdf")).toBe("eval");
  });
  it(".html => eval", () => expect(classifyCocFile("B-1612744 report.html")).toBe("eval"));
  it("plain pdf => coc", () => expect(classifyCocFile("B-1612744_I.pdf")).toBe("coc"));
});

describe("planRouting", () => {
  const certs = [
    { id: "c1", cert_no_norm: "B1612744", subsection_id: "u1" },
    { id: "c2", cert_no_norm: "B1612747", subsection_id: "u2" },
    { id: "c3", cert_no_norm: "NM1850896", subsection_id: null },   // unmatched cert (no subsection)
    { id: "c4", cert_no_norm: "B1612744", subsection_id: "u9" },    // duplicate number => ambiguous
  ];
  it("routes a unique match, orders COCs before evals", () => {
    const plan = planRouting([{ name: "PASS-B-1612747-x.html" }, { name: "B-1612747_I.pdf" }], certs.slice(0, 2));
    expect(plan.map(p => p.kind)).toEqual(["coc", "eval"]);
    expect(plan[0]).toMatchObject({ status: "routed", subsectionId: "u2", certRowId: "c2" });
    expect(plan[1]).toMatchObject({ status: "routed", subsectionId: "u2" });
  });
  it("unmatched when no number match", () => {
    const plan = planRouting([{ name: "random.pdf" }], certs);
    expect(plan[0].status).toBe("unmatched");
  });
  it("unmatched when matched cert has no subsection", () => {
    const plan = planRouting([{ name: "NM-1850896.pdf" }], certs);
    expect(plan[0].status).toBe("unmatched");
  });
  it("ambiguous when number resolves to >1 subsection", () => {
    const plan = planRouting([{ name: "B-1612744_I.pdf" }], certs);
    expect(plan[0].status).toBe("ambiguous");
  });
});
