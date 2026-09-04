import { supabase } from "@/integrations/supabase/client";
import { storagePathFromUrl } from "@/lib/documents/paths";
import { SYSTEM_REPORT_CATEGORIES } from "@/lib/documents/reportCategories";

/**
 * Generated reports live in TWO tables: site-level reports in site_documents
 * (category is a text column) and per-subsection reports — notably every bulk
 * inspection report — in subsection_documents (category lives on the joined
 * document_categories row). A site's Reports tab must read both, or bulk
 * output is invisible and undeletable from the hub.
 */

// Category names that identify a document as a generated report: the canonical
// generator-owned list, plus the legacy "Compliance Reports" name so old rows
// stay visible. (The hub's previous hand-rolled whitelist had drifted and hid
// Marking Checklists, Site Drawing and Generated Reports.)
export const REPORT_CATEGORIES = [...SYSTEM_REPORT_CATEGORIES, "Compliance Reports"];

export type ReportSource = "site" | "subsection";

export interface SiteReportRow {
  id: string;
  source: ReportSource;
  file_name: string;
  file_url: string;
  category: string;
  created_at: string;
  /** Set for subsection-scoped reports so the hub can say where they belong. */
  subsectionName: string | null;
}

export async function fetchSiteReportInventory(siteId: string): Promise<SiteReportRow[]> {
  const [siteRes, subRes] = await Promise.all([
    supabase
      .from("site_documents")
      .select("id, file_name, file_url, category, created_at")
      .eq("site_id", siteId)
      .in("category", REPORT_CATEGORIES),
    supabase
      .from("subsection_documents")
      .select(
        "id, file_name, file_url, uploaded_at, document_categories!inner(name), subsections!inner(name, site_id)"
      )
      .eq("subsections.site_id", siteId)
      .in("document_categories.name", REPORT_CATEGORIES),
  ]);

  if (siteRes.error) throw siteRes.error;
  if (subRes.error) throw subRes.error;

  const siteRows: SiteReportRow[] = (siteRes.data || []).map((d) => ({
    id: d.id,
    source: "site",
    file_name: d.file_name,
    file_url: d.file_url,
    category: d.category,
    created_at: d.created_at,
    subsectionName: null,
  }));

  const subRows: SiteReportRow[] = (subRes.data || []).map((d: any) => ({
    id: d.id,
    source: "subsection",
    file_name: d.file_name,
    file_url: d.file_url,
    category: d.document_categories?.name ?? "Inspection Reports",
    created_at: d.uploaded_at,
    subsectionName: d.subsections?.name ?? null,
  }));

  return [...siteRows, ...subRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export interface DeleteReportResult {
  ok: boolean;
  error?: string;
}

/**
 * Delete the DB row FIRST, then the storage object. A failed row delete leaves
 * everything intact; a failed storage remove leaves only an invisible orphaned
 * blob. The reverse order (which this replaces) could leave a listed report
 * whose file no longer exists.
 *
 * The delete must PROVE it removed a row: a DELETE that row-level security
 * filters to nothing comes back with no error, exactly like a real delete.
 * `.select("id")` returns the deleted rows, so zero rows means "not permitted
 * (or already gone)" and the storage object is left alone.
 */
export async function deleteSiteReport(report: SiteReportRow): Promise<DeleteReportResult> {
  const table = report.source === "site" ? "site_documents" : "subsection_documents";
  const { data, error } = await supabase.from(table).delete().eq("id", report.id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Report was not deleted — you may not have permission to remove it" };
  }

  const path = report.file_url ? storagePathFromUrl(report.file_url) : null;
  if (path) {
    const { error: storageError } = await supabase.storage.from("documents").remove([path]);
    if (storageError) {
      console.warn("Report row deleted but storage object removal failed:", path, storageError);
    }
  }
  return { ok: true };
}

/** Sequential bulk delete; one failure never stops the rest. */
export async function deleteSiteReports(
  reports: SiteReportRow[]
): Promise<{ deleted: SiteReportRow[]; failed: { report: SiteReportRow; error: string }[] }> {
  const deleted: SiteReportRow[] = [];
  const failed: { report: SiteReportRow; error: string }[] = [];
  for (const report of reports) {
    const result = await deleteSiteReport(report);
    if (result.ok) deleted.push(report);
    else failed.push({ report, error: result.error ?? "Unknown error" });
  }
  return { deleted, failed };
}
