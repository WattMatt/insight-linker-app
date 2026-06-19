import { Button } from "@/components/ui/button";
import { FileText, Loader2, Eye } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generatePdfBlob } from "@/lib/pdfMakeConfig";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { buildCocReportModel } from "@/lib/siteCoc/cocReportModel";
import { buildSiteCocReportDocDef } from "@/lib/siteCoc/siteCocReport";
import { mergeGuidelineAfterCover } from "@/lib/siteCoc/mergeReportGuideline";
import type { CocScheduleRow, CocCertRow, CocBatch, SubsectionOption } from "./useSiteCoc";

interface SavedReport { id: string; file_name: string; file_url: string; created_at: string; }
const CATEGORY = getReportCategoryName("site-coc");

export function ReportSubTab({ siteId, siteName, schedule, certificates, batch, subsections, clientName, siteAddress }: {
  siteId: string | undefined; siteName: string; schedule: CocScheduleRow[]; certificates: CocCertRow[]; batch: CocBatch | null; subsections: SubsectionOption[]; clientName?: string | null; siteAddress?: string | null;
}) {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string; blob?: Blob; isObjectUrl?: boolean } | null>(null);
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const empty = !subsections.some(s => s.is_coc_required);

  const fetchSaved = useCallback(async () => {
    if (!siteId) return;
    const { data } = await supabase.from("site_documents").select("id, file_name, file_url, created_at").eq("site_id", siteId).eq("category", CATEGORY).order("created_at", { ascending: false });
    setSaved((data ?? []) as unknown as SavedReport[]);
  }, [siteId]);
  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  const buildModel = () => buildCocReportModel({
    siteName, generatedAt: new Date().toLocaleDateString(), lastImport: batch ? new Date(batch.created_at).toLocaleDateString() : null,
    clientName: clientName ?? null, address: siteAddress ?? null,
    subsections: subsections.map(s => ({ id: s.id, name: s.name, tenant_name: s.tenant_name, is_coc_required: s.is_coc_required })),
    certificates: certificates.map(c => ({ subsection_id: c.subsection_id, cert_no: c.cert_no, cert_type: c.cert_type, verdict: c.verdict, rules: c.rules, issued_date: c.issued_date, coc_document_id: c.coc_document_id, eval_document_id: c.eval_document_id })),
    schedule: schedule.map(r => ({ subsection_id: r.subsection_id, shop_no_raw: r.shop_no_raw, initial_cert_nos: r.initial_cert_nos, supplementary_cert_nos: r.supplementary_cert_nos })),
  });

  const generate = async () => {
    setGenerating(true);
    try {
      const reportBlob = await generatePdfBlob(buildSiteCocReportDocDef(buildModel()));
      let blob = reportBlob;
      try {
        const [reportBytes, guideRes] = await Promise.all([
          reportBlob.arrayBuffer(),
          fetch("/reference/coc-verification-guideline.pdf"),
        ]);
        if (guideRes.ok) {
          const merged = await mergeGuidelineAfterCover(reportBytes, await guideRes.arrayBuffer());
          blob = new Blob([merged], { type: "application/pdf" });
        }
      } catch (e) {
        if (process.env.NODE_ENV === "development") console.error("Guideline merge skipped:", e);
      }
      const url = URL.createObjectURL(blob);
      setPreview({ url, name: `${siteName} - Site COC Report - ${new Date().toISOString().slice(0, 10)}.pdf`, blob, isObjectUrl: true });
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

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Generate the inclusive site COC report (with the SANS 10142-1 verification guideline) — then preview, download, or save it to the site's documents.</p>
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
                <Button size="sm" variant="ghost" onClick={() => setPreview({ url: r.file_url, name: r.file_name })} title="Preview / download">
                  <Eye className="h-4 w-4" />
                </Button>
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
