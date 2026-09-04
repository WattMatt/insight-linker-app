import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, any>;

const { db, removed } = vi.hoisted(() => ({
  db: {
    site_document_categories: [] as Row[],
    document_categories: [] as Row[],
    site_documents: [] as Row[],
    subsection_documents: [] as Row[],
    // Force the report-row insert to fail (fail-closed path).
    insertError: null as { message: string } | null,
    // ids a DELETE ... in(ids) is allowed to remove (RLS); null = all allowed.
    deletableIds: null as Set<string> | null,
    seq: 0,
  },
  removed: [] as string[],
}));

const REPORT_TABLES = new Set(["site_documents", "subsection_documents"]);

// Minimal PostgREST-ish builder covering exactly what pdfDocumentSaver uses:
// select().eq()/.neq(), insert().select().single(), delete().in().select().
function makeBuilder(table: string) {
  const eqs: Array<[string, any]> = [];
  const neqs: Array<[string, any]> = [];
  let mode: "select" | "insert" | "delete" = "select";
  let insertRow: Row | null = null;
  const rows = () => (db as any)[table] as Row[];
  const pred = (r: Row) =>
    eqs.every(([c, v]) => (v && v.__in ? v.__in.includes(r[c]) : r[c] === v)) && neqs.every(([c, v]) => r[c] !== v);

  const self: any = {
    select() { return self; },
    eq(c: string, v: any) { eqs.push([c, v]); return self; },
    neq(c: string, v: any) { neqs.push([c, v]); return self; },
    in(c: string, vals: any[]) { eqs.push([c, { __in: vals }]); return self; },
    insert(row: Row) { mode = "insert"; insertRow = row; return self; },
    delete() { mode = "delete"; return self; },
    single() { return self._run(true); },
    then(onOk: any, onErr: any) { return self._run(false).then(onOk, onErr); },
    async _run(single: boolean) {
      if (mode === "insert") {
        if (REPORT_TABLES.has(table) && db.insertError) return { data: null, error: db.insertError };
        const id = `${table}-${++db.seq}`;
        rows().push({ id, ...insertRow });
        return { data: single ? { id } : [{ id }], error: null };
      }
      if (mode === "delete") {
        const targeted = rows().filter(pred);
        const allowed = targeted.filter((r) => db.deletableIds === null || db.deletableIds.has(r.id));
        const allowedIds = new Set(allowed.map((r) => r.id));
        (db as any)[table] = rows().filter((r) => !allowedIds.has(r.id));
        return { data: allowed.map((r) => ({ id: r.id })), error: null };
      }
      const found = rows().filter(pred);
      return { data: single ? (found[0] ?? null) : found, error: null };
    },
  };
  return self;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => makeBuilder(table),
    storage: {
      from: () => ({
        upload: (path: string) => Promise.resolve({ data: { path }, error: null }),
        remove: (paths: string[]) => { removed.push(...paths); return Promise.resolve({ error: null }); },
      }),
    },
  },
}));

import { savePDFToDocuments, getReportCategoryName } from "./pdfDocumentSaver";

const blob = new Blob(["pdf"], { type: "application/pdf" });
const siteOpts = () => ({ blob, fileName: "Report.pdf", siteId: "site-1", categoryName: "Site Summary Reports" });

beforeEach(() => {
  db.site_document_categories = [{ id: "cat-1", site_id: "site-1", name: "Site Summary Reports" }];
  db.document_categories = [{ id: "dc-1", subsection_id: "sub-1", name: "Inspection Reports" }];
  db.site_documents = [];
  db.subsection_documents = [];
  db.insertError = null;
  db.deletableIds = null;
  db.seq = 0;
  removed.length = 0;
});

describe("getReportCategoryName", () => {
  it('maps site-coc to "Site COC Reports"', () => {
    expect(getReportCategoryName("site-coc")).toBe("Site COC Reports");
  });
});

describe("savePDFToDocuments — fail-closed + no orphan blob (#5)", () => {
  it("stores the STORAGE PATH in file_url, never a public URL (private bucket)", async () => {
    const result = await savePDFToDocuments(siteOpts());
    expect(result.success).toBe(true);
    // Bare storage path, not an https public URL.
    expect(result.documentUrl).toMatch(/^site-1\/Site_Summary_Reports\/\d+-Report\.pdf$/);
    const row = db.site_documents.find((r) => r.file_name === "Report.pdf");
    expect(row?.file_url).toBe(result.documentUrl);
  });

  it("removes the uploaded blob and reports failure when the DB insert fails", async () => {
    db.insertError = { message: "insert boom" };
    const result = await savePDFToDocuments(siteOpts());
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(removed).toHaveLength(1); // the just-uploaded blob is cleaned up
  });

  it("does NOT remove any blob on a successful save with no prior report", async () => {
    const result = await savePDFToDocuments(siteOpts());
    expect(result.success).toBe(true);
    expect(removed).toEqual([]);
  });
});

describe("savePDFToDocuments — replace on save (site reports)", () => {
  it("supersedes the previous site report of the same category and removes its blob", async () => {
    db.site_documents = [
      { id: "old-1", site_id: "site-1", category: "Site Summary Reports", file_url: "site-1/Site_Summary_Reports/1-a.pdf" },
      { id: "old-2", site_id: "site-1", category: "Site Summary Reports", file_url: "site-1/Site_Summary_Reports/2-b.pdf" },
      { id: "keep-inspection", site_id: "site-1", category: "Inspection Reports", file_url: "site-1/Inspection_Reports/9-z.pdf" },
    ];

    const res = await savePDFToDocuments(siteOpts());
    expect(res.success).toBe(true);

    const summaries = db.site_documents.filter((r) => r.category === "Site Summary Reports");
    expect(summaries).toHaveLength(1); // only the latest remains
    expect(summaries[0].file_name).toBe("Report.pdf");
    expect(db.site_documents.some((r) => r.id === "keep-inspection")).toBe(true); // other type untouched
    expect(removed.sort()).toEqual(["site-1/Site_Summary_Reports/1-a.pdf", "site-1/Site_Summary_Reports/2-b.pdf"]);
  });

  it("keeps the new report even if RLS blocks deletion of the old ones", async () => {
    db.site_documents = [{ id: "old-1", site_id: "site-1", category: "Site Summary Reports", file_url: "site-1/x/old.pdf" }];
    db.deletableIds = new Set(); // nothing may be deleted

    const res = await savePDFToDocuments(siteOpts());
    expect(res.success).toBe(true);
    expect(db.site_documents.some((r) => r.file_name === "Report.pdf")).toBe(true); // latest saved
    expect(db.site_documents.some((r) => r.id === "old-1")).toBe(true);             // old remains, not orphaned
    expect(removed).toEqual([]);                                                    // no blob removed
  });
});

describe("savePDFToDocuments — replace on save (subsection reports)", () => {
  it("supersedes older reports of the same subsection + category only", async () => {
    db.subsection_documents = [
      { id: "old-1", subsection_id: "sub-1", category_id: "dc-1", file_url: "subsections/sub-1/Inspection_Reports/1-a.pdf" },
      { id: "other-sub", subsection_id: "sub-2", category_id: "dc-9", file_url: "subsections/sub-2/Inspection_Reports/1-a.pdf" },
    ];

    const res = await savePDFToDocuments({ blob, fileName: "latest.pdf", subsectionId: "sub-1", categoryName: "Inspection Reports" });
    expect(res.success).toBe(true);

    const forSub1 = db.subsection_documents.filter((r) => r.subsection_id === "sub-1");
    expect(forSub1).toHaveLength(1);
    expect(forSub1[0].file_name).toBe("latest.pdf");
    expect(db.subsection_documents.some((r) => r.id === "other-sub")).toBe(true);
    expect(removed).toEqual(["subsections/sub-1/Inspection_Reports/1-a.pdf"]);
  });
});
