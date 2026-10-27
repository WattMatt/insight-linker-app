// Site COC report data: load + model, no PDF code. Shared by the PDF builder (siteCocReportPdf.ts),
// the COC tab and the remote MCP server, which passes its own per-user client instead of the
// browser singleton.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { buildCocReportModel } from "./cocReportModel";
import type { SiteKpiBlock } from "./reportKpis";
import { LIVE_REVIEW_STATUSES } from "./liveRows";
import { judgementRules, type RuleResult } from "./judgementRules";
import type { CocScheduleRow, CocCertRow, CocBatch, SubsectionOption } from "@/views/site-coc/useSiteCoc";

export interface SiteCocData {
  schedule: CocScheduleRow[];
  certificates: CocCertRow[];
  batch: CocBatch | null;
  subsections: SubsectionOption[];
  /** Live re-verification rows not yet signed off, carrying the proposed JUDGEMENT verdict and the
   *  judgement-translated rules (what sign_off_coc_certificate_judgement would record). The report
   *  uses them only for shops that have no final/signed-off row. */
  proposedCertificates?: CocCertRow[];
}

type ProposedRaw = CocCertRow & { proposed_verdict: string | null; proposed_verdict_alt: string | null; rule_results: RuleResult[] | null };

export async function loadSiteCocData(siteId: string, client: SupabaseClient = supabase as unknown as SupabaseClient): Promise<SiteCocData> {
  const [s, c, b, subs, p] = await Promise.all([
    client.from("coc_db_schedule").select("*").eq("site_id", siteId).order("shop_no_raw"),
    client.from("coc_certificates").select("*").eq("site_id", siteId)
      .in("review_status", LIVE_REVIEW_STATUSES).is("superseded_at", null).order("shop_no_raw"),
    client.from("coc_import_batches").select("*").eq("site_id", siteId).order("created_at", { ascending: false }).limit(1),
    client.from("subsections").select("id, name, tenant_name, is_coc_required").eq("site_id", siteId).is("deleted_at", null).order("name"),
    client.from("coc_certificates").select("*").eq("site_id", siteId)
      .eq("review_status", "proposed").is("superseded_at", null).order("shop_no_raw"),
  ]);
  return {
    schedule: (s.data ?? []) as unknown as CocScheduleRow[],
    certificates: (c.data ?? []) as unknown as CocCertRow[],
    batch: ((b.data ?? [])[0] ?? null) as unknown as CocBatch | null,
    subsections: (subs.data ?? []) as unknown as SubsectionOption[],
    proposedCertificates: ((p.data ?? []) as unknown as ProposedRaw[]).map(r => ({
      ...r, verdict: r.proposed_verdict_alt ?? r.proposed_verdict ?? "", rules: judgementRules(r.rule_results),
    })),
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
  const { siteName, batch, clientName, siteAddress, subsections, certificates, schedule, siteKpis, proposedCertificates } = input;
  const certRow = (c: CocCertRow) => ({ subsection_id: c.subsection_id, cert_no: c.cert_no, cert_type: c.cert_type, verdict: c.verdict, rules: c.rules, issued_date: c.issued_date, coc_document_id: c.coc_document_id, eval_document_id: c.eval_document_id, shop_no_raw: c.shop_no_raw, doc_type: c.doc_type, clause_9_2: c.clause_9_2, confidence: c.confidence, source_file: c.source_file, notes: c.notes });
  return buildCocReportModel({
    siteName, generatedAt: new Date().toLocaleDateString(), lastImport: batch ? new Date(batch.created_at).toLocaleDateString() : null,
    clientName: clientName ?? null, address: siteAddress ?? null,
    subsections: subsections.map(s => ({ id: s.id, name: s.name, tenant_name: s.tenant_name, is_coc_required: s.is_coc_required })),
    certificates: certificates.map(certRow),
    proposedCertificates: (proposedCertificates ?? []).map(certRow),
    schedule: schedule.map(r => ({ subsection_id: r.subsection_id, shop_no_raw: r.shop_no_raw, initial_cert_nos: r.initial_cert_nos, supplementary_cert_nos: r.supplementary_cert_nos, trading_name: r.trading_name, coc_required: r.coc_required, files_count: r.files_count, status: r.status, notes: r.notes })),
    siteKpis,
  });
}
