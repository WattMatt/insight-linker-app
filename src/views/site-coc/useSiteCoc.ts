import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
}
export interface CocBatch {
  id: string; created_at: string; schedule_file_name: string | null;
  verification_file_name: string | null; certs_imported: number; shops_imported: number;
  matched_count: number; unmatched_count: number;
}

export function useSiteCoc(siteId: string | undefined) {
  const [schedule, setSchedule] = useState<CocScheduleRow[]>([]);
  const [certificates, setCertificates] = useState<CocCertRow[]>([]);
  const [batch, setBatch] = useState<CocBatch | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    const [s, c, b] = await Promise.all([
      supabase.from("coc_db_schedule").select("*").eq("site_id", siteId).order("shop_no_raw"),
      supabase.from("coc_certificates").select("*").eq("site_id", siteId).order("shop_no_raw"),
      supabase.from("coc_import_batches").select("*").eq("site_id", siteId).order("created_at", { ascending: false }).limit(1),
    ]);
    setSchedule((s.data ?? []) as unknown as CocScheduleRow[]);
    setCertificates((c.data ?? []) as unknown as CocCertRow[]);
    setBatch(((b.data ?? [])[0] ?? null) as unknown as CocBatch | null);
    setLoading(false);
  }, [siteId]);

  useEffect(() => { refetch(); }, [refetch]);

  return { schedule, certificates, batch, loading, refetch };
}
