import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { buildSiteCocReportDocDef } from "@/lib/siteCoc/siteCocReport";
import type { CocScheduleRow, CocCertRow, CocBatch } from "./useSiteCoc";

export function ReportSubTab({ siteName, schedule, certificates, batch }: {
  siteName: string; schedule: CocScheduleRow[]; certificates: CocCertRow[]; batch: CocBatch | null;
}) {
  const [busy, setBusy] = useState(false);
  const empty = !certificates.length && !schedule.length;

  const download = async () => {
    setBusy(true);
    try {
      const { downloadPdf } = await import("@/lib/pdfMakeConfig");
      const doc = buildSiteCocReportDocDef({ siteName, schedule, certificates, batch });
      downloadPdf(doc, `${siteName} - Site COC Report.pdf`);
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("Site COC report failed:", e);
      toast.error("Could not generate the report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Overall site COC report generated from the imported schedule + verification data.</p>
      <Button onClick={download} disabled={busy || empty}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        Download PDF
      </Button>
      {empty && <p className="text-xs text-muted-foreground">Import the workbooks first.</p>}
    </div>
  );
}
