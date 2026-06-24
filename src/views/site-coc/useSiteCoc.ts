import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normShop } from "@/lib/siteCoc/normalize";
import { matchSubsection } from "@/lib/siteCoc/ingest";
import { reassignPendingPoolFiles } from "@/lib/coc/reassignPool";

export interface CocScheduleRow {
  id: string; subsection_id: string | null; shop_no_raw: string; trading_name: string;
  coc_required: string; initial_cert_nos: string; supplementary_cert_nos: string;
  unclear: string; supp_to_initial_ref: string; files_count: number | null;
  status: string; notes: string; match_status: string;
}
export interface CocCertRow {
  id: string; subsection_id: string | null; shop_no_raw: string; cert_no: string;
  cert_type: string; doc_type: string; clause_9_2: string; supp_to_init: string;
  issued_date: string | null; location: string; confidence: string; source_file: string;
  verdict: string; reasons: string; rules: Record<string, string>; notes: string; match_status: string;
  coc_document_id: string | null; eval_document_id: string | null;
}
export interface CocBatch {
  id: string; created_at: string; schedule_file_name: string | null;
  verification_file_name: string | null; certs_imported: number; shops_imported: number;
  matched_count: number; unmatched_count: number;
}

export interface SubsectionOption { id: string; name: string; tenant_name: string | null; is_coc_required: boolean | null; }

export function useSiteCoc(siteId: string | undefined) {
  const [schedule, setSchedule] = useState<CocScheduleRow[]>([]);
  const [certificates, setCertificates] = useState<CocCertRow[]>([]);
  const [batch, setBatch] = useState<CocBatch | null>(null);
  const [subsections, setSubsections] = useState<SubsectionOption[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    const [s, c, b, subs] = await Promise.all([
      supabase.from("coc_db_schedule").select("*").eq("site_id", siteId).order("shop_no_raw"),
      supabase.from("coc_certificates").select("*").eq("site_id", siteId).order("shop_no_raw"),
      supabase.from("coc_import_batches").select("*").eq("site_id", siteId).order("created_at", { ascending: false }).limit(1),
      supabase.from("subsections").select("id, name, tenant_name, is_coc_required").eq("site_id", siteId).is("deleted_at", null).order("name"),
    ]);
    setSchedule((s.data ?? []) as unknown as CocScheduleRow[]);
    setCertificates((c.data ?? []) as unknown as CocCertRow[]);
    setBatch(((b.data ?? [])[0] ?? null) as unknown as CocBatch | null);
    setSubsections((subs.data ?? []) as unknown as SubsectionOption[]);
    setLoading(false);
  }, [siteId]);

  useEffect(() => { refetch(); }, [refetch]);

  /**
   * Stamp one shop→subsection match: the schedule row (by id) and its certificates (by id, matched
   * against the loaded set via normalised shop — not a raw shop_no_raw equality). Does NOT refetch,
   * so callers can batch. */
  const stampMatch = useCallback(async (scheduleRowId: string, shopNoRaw: string, subsectionId: string, status: "matched" | "manual" = "matched") => {
    await supabase.from("coc_db_schedule").update({ subsection_id: subsectionId, match_status: status }).eq("id", scheduleRowId);
    const target = normShop(shopNoRaw);
    const certIds = certificates.filter(c => normShop(c.shop_no_raw) === target).map(c => c.id);
    if (certIds.length) {
      await supabase.from("coc_certificates").update({ subsection_id: subsectionId, match_status: status }).in("id", certIds);
    }
  }, [certificates]);

  /** Manually map an unmatched schedule shop to a subsection (stamped 'manual' so re-import never clobbers it),
   * then re-trigger pool assignment so files waiting on this shop attach automatically. */
  const resolveShop = useCallback(async (scheduleRowId: string, shopNoRaw: string, subsectionId: string) => {
    if (!siteId) return;
    await stampMatch(scheduleRowId, shopNoRaw, subsectionId, "manual");
    await reassignPendingPoolFiles(siteId);
    await refetch();
  }, [siteId, stampMatch, refetch]);

  /** Non-destructive: run the auto-matcher over currently-unmatched rows and stamp the hits. Returns the count. */
  const rerunAutoMatch = useCallback(async (): Promise<number> => {
    if (!siteId) return 0;
    const plan = schedule
      .filter(r => !r.subsection_id)
      .map(r => ({ row: r, sub: matchSubsection({ shop_no_raw: r.shop_no_raw, trading_name: r.trading_name }, subsections) }))
      .filter((p): p is { row: CocScheduleRow; sub: string } => !!p.sub);
    for (const p of plan) await stampMatch(p.row.id, p.row.shop_no_raw, p.sub);
    if (plan.length) await refetch();
    return plan.length;
  }, [siteId, schedule, subsections, stampMatch, refetch]);

  return { schedule, certificates, batch, subsections, loading, refetch, resolveShop, rerunAutoMatch };
}
