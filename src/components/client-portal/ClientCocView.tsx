import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, FileBarChart, ShieldCheck } from "lucide-react";
import {
  buildClientCocSummary,
  type ClientCocSubsection,
  type ClientCocDoc,
} from "@/lib/siteCoc/clientCocSummary";
import { TONE_PILL, verdictTone } from "@/lib/siteCoc/statusDisplay";
import { buildCocReportModel } from "@/lib/siteCoc/cocReportModel";
import { buildSiteCocReportDocDef } from "@/lib/siteCoc/siteCocReport";
import { generatePdfBlob } from "@/lib/pdfMakeConfig";
import { downloadBlob } from "@/lib/fileDownload";

interface ClientCocViewProps {
  siteId: string;
  siteName: string;
  onPreview: (url: string, name: string) => void;
}

const shortVerdict = (v: string | null) => (v || "—").split("—")[0].trim() || "—";

export function ClientCocView({ siteId, siteName, onPreview }: ClientCocViewProps) {
  const [generating, setGenerating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["client-coc", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const [subsRes, schedRes, certRes] = await Promise.all([
        supabase.from("subsections")
          .select("id, name, tenant_name, is_coc_required, coc_status, coc_expiry_date")
          .eq("site_id", siteId).is("deleted_at", null).order("name"),
        supabase.from("coc_db_schedule").select("*").eq("site_id", siteId).order("shop_no_raw"),
        supabase.from("coc_certificates").select("*").eq("site_id", siteId).order("shop_no_raw"),
      ]);
      if (subsRes.error) throw subsRes.error;
      const subsections = (subsRes.data ?? []) as ClientCocSubsection[];
      const ids = subsections.map((s) => s.id);

      let cocDocs: ClientCocDoc[] = [];
      if (ids.length > 0) {
        const { data: docs, error: e2 } = await supabase
          .from("subsection_documents")
          .select("subsection_id, file_name, file_url, coc_type, document_categories(name)")
          .in("subsection_id", ids);
        if (e2) throw e2;
        cocDocs = (docs ?? []).map((d: any) => ({
          subsection_id: d.subsection_id,
          file_name: d.file_name,
          file_url: d.file_url,
          coc_type: d.coc_type,
          category_name: d.document_categories?.name ?? null,
        }));
      }
      return { subsections, cocDocs, schedule: schedRes.data ?? [], certificates: certRes.data ?? [] };
    },
  });

  const rows = data ? buildClientCocSummary(data.subsections, data.cocDocs) : [];
  const requiredRows = rows.filter((r) => r.cocRequired);
  const certificates = (data?.certificates ?? []) as any[];

  const handleDownloadReport = async () => {
    if (!data) return;
    setGenerating(true);
    try {
      const model = buildCocReportModel({
        siteName,
        generatedAt: new Date().toLocaleDateString(),
        lastImport: null,
        clientName: null,
        address: null,
        subsections: data.subsections.map((s) => ({
          id: s.id, name: s.name, tenant_name: s.tenant_name, is_coc_required: s.is_coc_required,
        })),
        certificates: (data.certificates as any[]).map((c) => ({
          subsection_id: c.subsection_id, cert_no: c.cert_no, cert_type: c.cert_type, verdict: c.verdict,
          rules: c.rules, issued_date: c.issued_date, coc_document_id: c.coc_document_id,
          eval_document_id: c.eval_document_id, shop_no_raw: c.shop_no_raw, doc_type: c.doc_type,
          clause_9_2: c.clause_9_2, confidence: c.confidence, source_file: c.source_file, notes: c.notes,
        })),
        schedule: (data.schedule as any[]).map((r) => ({
          subsection_id: r.subsection_id, shop_no_raw: r.shop_no_raw, initial_cert_nos: r.initial_cert_nos,
          supplementary_cert_nos: r.supplementary_cert_nos, trading_name: r.trading_name,
          coc_required: r.coc_required, files_count: r.files_count, status: r.status, notes: r.notes,
        })),
      });
      const blob = await generatePdfBlob(buildSiteCocReportDocDef(model, null));
      await downloadBlob(blob, `${siteName} - Site COC Report - ${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("Client COC report failed:", e);
      toast.error("Could not generate the COC report");
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (<Skeleton key={i} className="h-12 w-full" />))}
      </div>
    );
  }

  if (requiredRows.length === 0 && certificates.length === 0) {
    return (
      <Alert>
        <AlertDescription>No COC information available for this site yet.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Certificates of Compliance
          </h3>
          <p className="text-sm text-muted-foreground">
            {requiredRows.length} subsection{requiredRows.length === 1 ? "" : "s"} require a COC
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownloadReport} disabled={generating || !data}>
          <FileBarChart className="h-4 w-4 mr-2" />
          {generating ? "Preparing…" : "Download COC report"}
        </Button>
      </div>

      {/* Per-subsection compliance summary */}
      {requiredRows.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">Compliance by subsection</h4>
          {requiredRows.map((row) => (
            <Card key={row.subsectionId}>
              <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <span className="text-sm font-medium block truncate">{row.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.expiry ? `Expires ${row.expiry}` : "No expiry recorded"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={TONE_PILL[row.tone]}>{row.statusLabel}</Badge>
                  {row.viewUrl && (
                    <Button size="sm" variant="ghost" onClick={() => onPreview(row.viewUrl!, row.viewName!)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Certificate register (read-only) */}
      {certificates.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">Certificate register</h4>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="whitespace-nowrap">Shop</TableHead>
                  <TableHead>Cert no</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Attached</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificates.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{c.shop_no_raw || "—"}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{c.cert_no || "—"}</TableCell>
                    <TableCell className="text-xs">{c.cert_type || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={TONE_PILL[verdictTone(c.verdict)]}>{shortVerdict(c.verdict)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums whitespace-nowrap">{c.issued_date ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {c.coc_document_id ? <span className="text-emerald-600">COC ✓</span> : <span className="text-muted-foreground/60">COC —</span>}
                      {"  "}
                      {c.eval_document_id ? <span className="text-emerald-600">Eval ✓</span> : <span className="text-muted-foreground/60">Eval —</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
