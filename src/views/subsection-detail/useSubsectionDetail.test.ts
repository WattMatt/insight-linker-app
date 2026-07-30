import { describe, it, expect } from "vitest";
import { isCocCertificateCategory } from "@/lib/cocHierarchy";
import { flattenDocumentCategory } from "./useSubsectionDetail";

const row = (id: string, categoryName: string | null) => ({
  id,
  file_name: `${id}.pdf`,
  file_url: `https://example.test/${id}.pdf`,
  category_id: `cat-${id}`,
  uploaded_at: "2026-01-01T00:00:00Z",
  coc_number: "B1",
  coc_type: "Initial",
  coc_status: "Pass",
  document_categories: categoryName === null ? null : { name: categoryName },
});

describe("flattenDocumentCategory", () => {
  it("lifts the joined category name onto the row and drops the nested relation", () => {
    const [doc] = flattenDocumentCategory([row("a", "01 COC")]);
    expect(doc.category).toBe("01 COC");
    expect(doc).not.toHaveProperty("document_categories");
  });

  it("preserves every column the row already carried", () => {
    const [doc] = flattenDocumentCategory([row("a", "01 COC")]);
    expect(doc).toMatchObject({
      id: "a", file_name: "a.pdf", category_id: "cat-a", coc_number: "B1",
      coc_type: "Initial", coc_status: "Pass",
    });
  });

  it("falls back to an empty category when the join returned nothing", () => {
    expect(flattenDocumentCategory([row("a", null)])[0].category).toBe("");
    expect(flattenDocumentCategory([{ id: "b" }])[0].category).toBe("");
  });

  it("feeds the COC filter the verdict is computed from: certificates in, eval reports out", () => {
    const docs = flattenDocumentCategory([
      row("a", "01 COC"),
      row("b", "07 COC Evaluation Reports"),
      row("c", "02 Manuals"),
    ]);
    const cocDocs = docs.filter(d => isCocCertificateCategory(d.category || ""));
    expect(cocDocs.map(d => d.id)).toEqual(["a"]);
  });
});
