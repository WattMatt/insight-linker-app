import { Button } from "@/components/ui/button";
import { FileText, Loader2, Eye, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import { storagePathFromUrl } from "@/lib/documents/paths";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import type { SiteKpiBlock } from "@/lib/siteCoc/reportKpis";
import { generateSiteCocReportPdf } from "@/lib/siteCoc/siteCocReportPdf";
import type { CocScheduleRow, CocCertRow, CocBatch, SubsectionOption } from "./useSiteCoc";

interface SavedReport { id: string; file_name: string; file_url: string; created_at: string; }
const CATEGORY = getReportCategoryName("site-coc");

export function ReportSubTab({ siteId, siteName, schedule, certificates, batch, subsections, clientName, siteAddress, siteKpis, companyLogo }: {
  siteId: string | undefined; siteName: string; schedule: CocScheduleRow[]; certificates: CocCertRow[]; batch: CocBatch | null; subsections: SubsectionOption[]; clientName?: string | null; siteAddress?: string | null; siteKpis?: SiteKpiBlock; companyLogo?: string | null;
}) {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string; blob?: Blob; isObjectUrl?: boolean } | null>(null);
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const empty = !subsections.some(s => s.is_coc_required);

  const fetchSaved = useCallback(async () => {
    if (!siteId) return;
    const { data } = await supabase.from("site_documents").select("id, file_name, file_url, created_at").eq("site_id", siteId).eq("category", CATEGORY).order("created_at", { ascending: false });
    setSaved((data ?? []) as unknown as SavedReport[]);
  }, [siteId]);
  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { blob, filename } = await generateSiteCocReportPdf({
        siteId, siteName, clientName, siteAddress, siteKpis, companyLogo, schedule, certificates, batch, subsections,
      });
      const url = URL.createObjectURL(blob);
      setPreview({ url, name: filename, blob, isObjectUrl: true });
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("Site COC report failed:", e);
      toast.error("Could not generate the report");
    } finally { setGenerating(false); }
  };

  const closePreview = () => {
    if (preview?.isObjectUrl && preview.url.startsWith("blob:")) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const handleSave = async () => {
    if (!preview?.blob || !siteId) return;
    setSaving(true);
    const res = await savePDFToDocuments({ blob: preview.blob, fileName: preview.name, siteId, categoryName: CATEGORY });
    setSaving(false);
    if (res.success) { toast.success("Report saved to site documents"); fetchSaved(); }
    else toast.error(res.error || "Could not save the report");
  };

  // Delete a saved report: remove the storage object (best-effort) then the site_documents row.
  // Mirrors SiteReports.handleDeleteReport.
  const handleDelete = async (r: SavedReport) => {
    if (!window.confirm(`Delete "${r.file_name}"? This cannot be undone.`)) return;
    setDeleting(r.id);
    try {
      // storagePathFromUrl handles both legacy full URLs and bare-path rows.
      const path = r.file_url ? storagePathFromUrl(r.file_url) : null;
      if (path) await supabase.storage.from("documents").remove([path]);
      const { error } = await supabase.from("site_documents").delete().eq("id", r.id);
      if (error) throw error;
      toast.success("Report deleted");
      setSaved(prev => prev.filter(x => x.id !== r.id));
      if (preview && !preview.isObjectUrl && preview.url === r.file_url) closePreview();
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("Delete report failed:", e);
      toast.error("Could not delete the report");
    } finally { setDeleting(null); }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Generate the inclusive site COC report — then preview, download, or save it to the site's documents.</p>
        <Button onClick={generate} disabled={generating || empty}>
          {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
          Generate report
        </Button>
        {empty && <p className="text-xs text-muted-foreground">No COC-required subsections on this site.</p>}
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Saved reports</p>
        {saved.length ? (
          <div className="rounded-md border divide-y">
            {saved.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 p-2">
                <div className="min-w-0">
                  <div className="text-sm truncate">{r.file_name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setPreview({ url: r.file_url, name: r.file_name })} title="Preview / download">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(r)} disabled={deleting === r.id} title="Delete report">
                    {deleting === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">No saved reports yet.</p>}
      </div>

      {preview && (
        <DocumentPreviewDialog
          open={!!preview}
          onOpenChange={(o) => { if (!o) closePreview(); }}
          fileUrl={preview.url}
          fileName={preview.name}
          downloadBlobData={preview.blob}
          onSaveToDocuments={preview.blob ? handleSave : undefined}
          saveLocation="site"
          contextName={siteName}
          isSaving={saving}
        />
      )}
    </div>
  );
}
