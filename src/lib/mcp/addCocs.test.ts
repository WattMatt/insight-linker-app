import { describe, expect, it } from "vitest";
import { parseAddDocs } from "./fortressTools";

const base = { id: "add-20261111-001", file: "NM-1583825_CONTAINER-TELKOM_I.pdf", cert_no: "NM 1583825", cls_type: "I", verdict: "FAIL", reason: "C7 FAIL", rules: [{ rule: "C7", res: "FAIL" }], subsection_id: "94821ae5-00e9-45af-b139-a616b32f3f41" };

describe("parseAddDocs", () => {
  it("accepts a valid doc (array or JSON text) and defaults verdict_alt and doc_class", () => {
    const [d] = parseAddDocs(JSON.stringify([base]));
    expect(d.verdict_alt).toBe("FAIL");
    expect(d.doc_class).toBe("electrical_coc");
    expect(d.subsection_id).toBe(base.subsection_id);
  });
  it("refuses ids without the add- prefix, duplicates, bad verdicts and missing shops", () => {
    expect(() => parseAddDocs([{ ...base, id: "doc001" }])).toThrow(/add-/);
    expect(() => parseAddDocs([base, base])).toThrow(/duplicate/);
    expect(() => parseAddDocs([{ ...base, verdict: "N/A" }])).toThrow(/verdict/);
    expect(() => parseAddDocs([{ ...base, subsection_id: undefined }])).toThrow(/subsection_id/);
    expect(() => parseAddDocs([{ ...base, copy_of: "x" }])).toThrow(/copy_of/);
    expect(() => parseAddDocs([])).toThrow(/non-empty/);
  });
});
