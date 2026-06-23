import { describe, it, expect } from "vitest";
import { buildClientCocSummary, cocStatusTone, cocStatusLabel } from "./clientCocSummary";

const subs = [
  { id: "s1", name: "Shop 1", tenant_name: "Acme", is_coc_required: true,  coc_status: "Pass",    coc_expiry_date: "2027-01-01" },
  { id: "s2", name: "Shop 2", tenant_name: null,   is_coc_required: true,  coc_status: "Missing", coc_expiry_date: null },
  { id: "s3", name: "Shop 3", tenant_name: null,   is_coc_required: false, coc_status: "N/A",     coc_expiry_date: "2030-01-01" },
  { id: "s4", name: "Shop 4", tenant_name: null,   is_coc_required: true,  coc_status: null,      coc_expiry_date: null },
];

const docs = [
  { subsection_id: "s1", file_name: "coc-initial.pdf", file_url: "u1", coc_type: "Initial",       category_name: "COC Certificates" },
  { subsection_id: "s1", file_name: "eval.pdf",        file_url: "u2", coc_type: "Supplementary", category_name: "COC Validation Report" },
];

describe("cocStatusTone", () => {
  it("maps gated statuses to tones, neutral when not required", () => {
    expect(cocStatusTone("Pass", true)).toBe("green");
    expect(cocStatusTone("Fail", true)).toBe("red");
    expect(cocStatusTone("Missing", true)).toBe("amber");
    expect(cocStatusTone("Pending", true)).toBe("amber");
    expect(cocStatusTone(null, true)).toBe("amber");
    expect(cocStatusTone("Pass", false)).toBe("slate");
  });
});

describe("cocStatusLabel", () => {
  it("shows 'Not required' / 'Pending' fallbacks", () => {
    expect(cocStatusLabel("Pass", true)).toBe("Pass");
    expect(cocStatusLabel(null, true)).toBe("Pending");
    expect(cocStatusLabel("Pass", false)).toBe("Not required");
  });
});

describe("buildClientCocSummary", () => {
  it("builds curated rows with tenant in the name, status, expiry and the Initial COC link", () => {
    const rows = buildClientCocSummary(subs, docs);
    expect(rows).toHaveLength(4);

    const r1 = rows.find((r) => r.subsectionId === "s1")!;
    expect(r1.name).toBe("Shop 1 (Acme)");
    expect(r1.cocRequired).toBe(true);
    expect(r1.statusLabel).toBe("Pass");
    expect(r1.tone).toBe("green");
    expect(r1.expiry).toBe("2027-01-01");
    expect(r1.viewUrl).toBe("u1"); // Initial COC doc, not the validation report
    expect(r1.viewName).toBe("coc-initial.pdf");
  });

  it("excludes non-COC-category docs from the View link and handles missing docs", () => {
    const rows = buildClientCocSummary(subs, docs);
    const r2 = rows.find((r) => r.subsectionId === "s2")!;
    expect(r2.statusLabel).toBe("Missing");
    expect(r2.tone).toBe("amber");
    expect(r2.viewUrl).toBeNull();
  });

  it("nulls expiry and marks 'Not required' for non-required subsections", () => {
    const rows = buildClientCocSummary(subs, docs);
    const r3 = rows.find((r) => r.subsectionId === "s3")!;
    expect(r3.cocRequired).toBe(false);
    expect(r3.statusLabel).toBe("Not required");
    expect(r3.tone).toBe("slate");
    expect(r3.expiry).toBeNull();
  });
});
