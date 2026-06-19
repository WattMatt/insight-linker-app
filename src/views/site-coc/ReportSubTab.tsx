import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { buildCocReportModel } from "@/lib/siteCoc/cocReportModel";
import { buildSiteCocReportDocDef } from "@/lib/siteCoc/siteCocReport";
import type { CocScheduleRow, CocCertRow, CocBatch, SubsectionOption } from "./useSiteCoc";

export function ReportSubTab({ siteName, schedule, certificates, batch, subsections }: {
  siteName: string; schedule: CocScheduleRow[]; certificates: CocCertRow[]; batch: CocBatch | null; subsections: SubsectionOption[];
}) {
  const [busy, setBusy] = useState(false);
  const empty = !subsections.some(s => s.is_coc_required);

  const download = async () => {
    setBusy(true);
    try {
      const { downloadPdf } = await import("@/lib/pdfMakeConfig");
      const model = buildCocReportModel({
        siteName,
        generatedAt: new Date().toLocaleDateString(),
        lastImport: batch ? new Date(batch.created_at).toLocaleDateString() : null,
        subsections: subsections.map(s => ({ id: s.id, name: s.name, tenant_name: s.tenant_name, is_coc_required: s.is_coc_required })),
        certificates: certificates.map(c => ({ subsection_id: c.subsection_id, cert_no: c.cert_no, cert_type: c.cert_type, verdict: c.verdict, rules: c.rules, issued_date: c.issued_date, coc_document_id: c.coc_document_id, eval_document_id: c.eval_document_id })),
        schedule: schedule.map(r => ({ subsection_id: r.subsection_id, shop_no_raw: r.shop_no_raw, initial_cert_nos: r.initial_cert_nos, supplementary_cert_nos: r.supplementary_cert_nos })),
      });
      downloadPdf(buildSiteCocReportDocDef(model), `${siteName} - Site COC Report.pdf`);
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("Site COC report failed:", e);
      toast.error("Could not generate the report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Inclusive site COC report — a facility-manager dashboard plus a per-tenant section for each COC-required subsection (status, COCs on file, outstanding actions, SANS grid).</p>
      <Button onClick={download} disabled={busy || empty}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        Download PDF
      </Button>
      {empty && <p className="text-xs text-muted-foreground">No COC-required subsections on this site.</p>}
    </div>
  );
}
