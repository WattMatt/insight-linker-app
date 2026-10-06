// Site COC report: data load + PDF build, hook-free. Shared by the COC tab (ReportSubTab / useSiteCoc)
// and the site "All reports" runner so both produce the same PDF from the same data.
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { generatePdfBlob } from "@/lib/pdfMakeConfig";
import { generateDocumentFilename } from "@/lib/documentDesignStandards";
import { imageUrlToBase64 } from "@/lib/pdfBranding";
import { qrSiteRedirectUrl } from "@/lib/qrBaseUrl";
import { buildCocReportModel } from "./cocReportModel";
import { buildSiteCocReportDocDef } from "./siteCocReport";
import type { SiteKpiBlock } from "./reportKpis";
import type { CocScheduleRow, CocCertRow, CocBatch, SubsectionOption } from "@/views/site-coc/useSiteCoc";

export interface SiteCocData {
  schedule: CocScheduleRow[];
  certificates: CocCertRow[];
  batch: CocBatch | null;
  subsections: SubsectionOption[];
}

export async function loadSiteCocData(siteId: string): Promise<SiteCocData> {
  const [s, c, b, subs] = await Promise.all([
    supabase.from("coc_db_schedule").select("*").eq("site_id", siteId).order("shop_no_raw"),
    supabase.from("coc_certificates").select("*").eq("site_id", siteId).order("shop_no_raw"),
    supabase.from("coc_import_batches").select("*").eq("site_id", siteId).order("created_at", { ascending: false }).limit(1),
    supabase.from("subsections").select("id, name, tenant_name, is_coc_required").eq("site_id", siteId).is("deleted_at", null).order("name"),
  ]);
  return {
    schedule: (s.data ?? []) as unknown as CocScheduleRow[],
    certificates: (c.data ?? []) as unknown as CocCertRow[],
    batch: ((b.data ?? [])[0] ?? null) as unknown as CocBatch | null,
    subsections: (subs.data ?? []) as unknown as SubsectionOption[],
  };
}

export interface SiteCocReportInput extends SiteCocData {
  siteId: string | undefined;
  siteName: string;
  clientName?: string | null;
  siteAddress?: string | null;
  siteKpis?: SiteKpiBlock;
  companyLogo?: string | null;
}

export function buildSiteCocModel(input: SiteCocReportInput) {
  const { siteName, batch, clientName, siteAddress, subsections, certificates, schedule, siteKpis } = input;
  return buildCocReportModel({
    siteName, generatedAt: new Date().toLocaleDateString(), lastImport: batch ? new Date(batch.created_at).toLocaleDateString() : null,
    clientName: clientName ?? null, address: siteAddress ?? null,
    subsections: subsections.map(s => ({ id: s.id, name: s.name, tenant_name: s.tenant_name, is_coc_required: s.is_coc_required })),
    certificates: certificates.map(c => ({ subsection_id: c.subsection_id, cert_no: c.cert_no, cert_type: c.cert_type, verdict: c.verdict, rules: c.rules, issued_date: c.issued_date, coc_document_id: c.coc_document_id, eval_document_id: c.eval_document_id, shop_no_raw: c.shop_no_raw, doc_type: c.doc_type, clause_9_2: c.clause_9_2, confidence: c.confidence, source_file: c.source_file, notes: c.notes })),
    schedule: schedule.map(r => ({ subsection_id: r.subsection_id, shop_no_raw: r.shop_no_raw, initial_cert_nos: r.initial_cert_nos, supplementary_cert_nos: r.supplementary_cert_nos, trading_name: r.trading_name, coc_required: r.coc_required, files_count: r.files_count, status: r.status, notes: r.notes })),
    siteKpis,
  });
}

export async function generateSiteCocReportPdf(input: SiteCocReportInput): Promise<{ blob: Blob; filename: string }> {
  const { siteId, siteName, companyLogo } = input;
  const logoDataUrl = companyLogo ? await imageUrlToBase64(companyLogo).catch(() => null) : null;
  // Site-level verification QR for the report header — same stable qr-redirect
  // indirection as the Site Summary Report cover. See src/lib/qrBaseUrl.ts.
  const qrCodeDataUrl = siteId
    ? await QRCode.toDataURL(qrSiteRedirectUrl(siteId), {
        width: 500,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'H',
      }).catch(() => null)
    : null;
  const blob = await generatePdfBlob(buildSiteCocReportDocDef(buildSiteCocModel(input), logoDataUrl, qrCodeDataUrl));
  // Unified naming (F3): sanitised, LOCAL date stamp via the shared helper.
  return { blob, filename: generateDocumentFilename('Site_COC_Report', siteName) };
}
