import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toSignOffRecord, type SignOffRecord, type SignOffRow } from "@/lib/siteCoc/signOff";

const SELECT = `id, record_key, review_status, proposed_verdict, proposed_verdict_alt, cert_no, cert_type, doc_type,
  issued_date, location, confidence, source_file, reasons, rule_results, flags, caveats, db_name, building,
  reg_person, reg_no, subsection_id, signed_off_at, sign_off_note,
  coc_certificate_source_files(page_no, role, coc_source_files(storage_path))`;

/** Re-verification records for a site (live rows only), for the Sign-off tab. */
export function useSignOff(siteId: string | undefined) {
  const qc = useQueryClient();
  const key = ["coc-sign-off", siteId];

  const query = useQuery({
    queryKey: key,
    enabled: !!siteId,
    queryFn: async (): Promise<SignOffRecord[]> => {
      const { data, error } = await supabase.from("coc_certificates").select(SELECT)
        .eq("site_id", siteId!).not("record_key", "is", null).is("superseded_at", null)
        .in("review_status", ["proposed", "signed_off", "rejected"]).order("cert_no");
      if (error) throw error;
      return ((data ?? []) as unknown as SignOffRow[]).map(toSignOffRecord);
    },
  });

  const patch = (id: string, changes: Partial<SignOffRecord>) =>
    qc.setQueryData<SignOffRecord[]>(key, (rows) => rows?.map((r) => (r.id === id ? { ...r, ...changes } : r)));

  /** Accept or reject through the database function (Admin only; it also supersedes replaced rows). */
  const decide = async (id: string, decision: "accept" | "reject", note: string) => {
    const { error } = await supabase.rpc("sign_off_coc_certificate", { p_id: id, p_decision: decision, p_note: note || undefined });
    if (error) throw error;
    patch(id, decision === "accept"
      ? { status: "signed_off", signedOffAt: new Date().toISOString(), signOffNote: note || null }
      : { status: "rejected", signOffNote: note || null });
  };

  const setShop = async (id: string, subsectionId: string | null) => {
    const { error } = await supabase.from("coc_certificates")
      .update({ subsection_id: subsectionId, match_status: subsectionId ? "manual" : "unmatched" }).eq("id", id);
    if (error) throw error;
    patch(id, { subsectionId });
  };

  return { records: query.data ?? [], loading: query.isLoading, error: query.error, decide, setShop, refetch: query.refetch };
}

/** Short-lived signed URLs for one record's page images (private `documents` bucket). */
export function usePageUrls(paths: string[]) {
  return useQuery({
    queryKey: ["coc-sign-off-pages", paths],
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("documents").createSignedUrls(paths, 60 * 60);
      if (error) throw error;
      return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u);
    },
  });
}
