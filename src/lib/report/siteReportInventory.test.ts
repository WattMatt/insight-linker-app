import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, any>;

const { db, calls } = vi.hoisted(() => ({
  db: {
    site_documents: [] as Row[],
    subsection_documents: [] as Row[],
    // Shifted once per row delete; empty queue means success.
    deleteErrors: [] as ({ message: string } | null)[],
    // Ids whose DELETE is silently filtered to zero rows (what RLS does — no error).
    deleteDenied: new Set<string>(),
    storageError: null as { message: string } | null,
  },
  calls: [] as string[],
}));

function builder(table: string) {
  const self: any = {
    select: () => self,
    eq: () => self,
    in: () => self,
    then: (onOk: any, onErr: any) =>
      Promise.resolve({ data: (db as any)[table] ?? [], error: null }).then(onOk, onErr),
    delete: () => ({
      eq: (_col: string, id: string) => ({
        // PostgREST returns the deleted rows only when .select() is chained;
        // an RLS-filtered delete returns [] with error null.
        select: () => {
          calls.push(`row-delete:${table}:${id}`);
          const error = db.deleteErrors.shift() ?? null;
          const data = error ? null : db.deleteDenied.has(id) ? [] : [{ id }];
          return Promise.resolve({ data, error });
        },
      }),
    }),
  };
  return self;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => builder(table),
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          calls.push(`storage-remove:${bucket}:${paths.join(",")}`);
          return Promise.resolve({ error: db.storageError });
        },
      }),
    },
  },
}));

import {
  fetchSiteReportInventory,
  deleteSiteReport,
  deleteSiteReports,
  type SiteReportRow,
} from "./siteReportInventory";

const siteRow = (id: string, createdAt: string): Row => ({
  id,
  file_name: `${id}.pdf`,
  file_url: `site-1/Site_Summary_Reports/${id}.pdf`,
  category: "Site Summary Reports",
  created_at: createdAt,
});

const subRow = (id: string, uploadedAt: string): Row => ({
  id,
  file_name: `${id}.pdf`,
  file_url: `subsections/sub-1/Inspection_Reports/${id}.pdf`,
  uploaded_at: uploadedAt,
  document_categories: { name: "Inspection Reports" },
  subsections: { name: "Unit 7", site_id: "site-1" },
});

const report = (over: Partial<SiteReportRow>): SiteReportRow => ({
  id: "r1",
  source: "site",
  file_name: "r1.pdf",
  file_url: "site-1/Site_Summary_Reports/r1.pdf",
  category: "Site Summary Reports",
  created_at: "2026-01-01T00:00:00Z",
  subsectionName: null,
  ...over,
});

beforeEach(() => {
  db.site_documents = [];
  db.subsection_documents = [];
  db.deleteErrors = [];
  db.deleteDenied = new Set();
  db.storageError = null;
  calls.length = 0;
});

describe("fetchSiteReportInventory", () => {
  it("merges both tables, newest first, and labels subsection reports", async () => {
    db.site_documents = [siteRow("a", "2026-01-01T00:00:00Z")];
    db.subsection_documents = [
      subRow("b", "2026-03-01T00:00:00Z"),
      subRow("c", "2025-12-01T00:00:00Z"),
    ];

    const rows = await fetchSiteReportInventory("site-1");

    expect(rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(rows[0]).toMatchObject({
      source: "subsection",
      category: "Inspection Reports",
      subsectionName: "Unit 7",
      created_at: "2026-03-01T00:00:00Z",
    });
    expect(rows[1]).toMatchObject({ source: "site", subsectionName: null });
  });
});

describe("deleteSiteReport", () => {
  it("deletes the DB row BEFORE the storage object, against the right table", async () => {
    const result = await deleteSiteReport(report({ id: "r1", source: "site" }));

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      "row-delete:site_documents:r1",
      "storage-remove:documents:site-1/Site_Summary_Reports/r1.pdf",
    ]);
  });

  it("routes subsection reports to subsection_documents", async () => {
    await deleteSiteReport(
      report({
        id: "r2",
        source: "subsection",
        file_url: "subsections/sub-1/Inspection_Reports/r2.pdf",
      })
    );
    expect(calls[0]).toBe("row-delete:subsection_documents:r2");
  });

  it("does not touch storage when the row delete fails", async () => {
    db.deleteErrors = [{ message: "RLS says no" }];

    const result = await deleteSiteReport(report({ id: "r1" }));

    expect(result).toEqual({ ok: false, error: "RLS says no" });
    expect(calls).toEqual(["row-delete:site_documents:r1"]);
  });

  it("does not touch storage when RLS silently filters the delete to zero rows", async () => {
    // A non-admin staff user deleting a subsection report they did not upload:
    // PostgREST returns no error and no rows. The blob must survive.
    db.deleteDenied = new Set(["r2"]);

    const result = await deleteSiteReport(
      report({ id: "r2", source: "subsection", file_url: "subsections/sub-1/Inspection_Reports/r2.pdf" })
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not deleted/);
    expect(calls).toEqual(["row-delete:subsection_documents:r2"]);
  });

  it("still succeeds when only the storage removal fails (orphan blob, not a dangling row)", async () => {
    db.storageError = { message: "object gone" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await deleteSiteReport(report({ id: "r1" }));

    expect(result.ok).toBe(true);
    warn.mockRestore();
  });

  it("resolves legacy full-URL rows to a storage path", async () => {
    await deleteSiteReport(
      report({
        file_url:
          "https://x.supabase.co/storage/v1/object/public/documents/site-1/Reports/old.pdf?t=1",
      })
    );
    expect(calls[1]).toBe("storage-remove:documents:site-1/Reports/old.pdf");
  });
});

describe("deleteSiteReports", () => {
  it("continues past a failure and reports both outcomes", async () => {
    db.deleteErrors = [{ message: "nope" }, null];

    const { deleted, failed } = await deleteSiteReports([
      report({ id: "bad" }),
      report({ id: "good" }),
    ]);

    expect(failed).toHaveLength(1);
    expect(failed[0].report.id).toBe("bad");
    expect(failed[0].error).toBe("nope");
    expect(deleted.map((r) => r.id)).toEqual(["good"]);
  });
});
