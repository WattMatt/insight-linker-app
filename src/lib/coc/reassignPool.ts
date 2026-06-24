import { supabase } from "@/integrations/supabase/client";
import { planPoolAssignment, type CertRowLite, type PoolFileLite } from "@/lib/siteCoc/assignmentEngine";
import { assignPoolFile, type AssignablePoolFile } from "@/lib/coc/assignPoolFile";

interface PoolRow extends PoolFileLite, AssignablePoolFile {}

export interface ReassignResult { assigned: number; pending: number }

/** Re-classify all pending pool files for a site, assign the assignable, persist reasons on the rest. */
export async function reassignPendingPoolFiles(siteId: string): Promise<ReassignResult> {
  const [{ data: poolRows }, { data: certs }] = await Promise.all([
    supabase.from("coc_file_pool").select("*").eq("site_id", siteId).eq("status", "pending"),
    supabase.from("coc_certificates").select("id, cert_no_norm, subsection_id").eq("site_id", siteId),
  ]);
  const files = (poolRows ?? []) as unknown as PoolRow[];
  const classifications = planPoolAssignment(files, (certs ?? []) as CertRowLite[]);
  const byId = new Map(files.map((f) => [f.id, f]));

  let assigned = 0;
  for (const c of classifications) {
    const f = byId.get(c.poolId);
    if (!f) continue;
    if (c.outcome === "assigned" && c.subsectionId) {
      try {
        await assignPoolFile(siteId, f, c.subsectionId, f.detected_kind === "eval" ? "eval" : "coc");
        assigned++;
      } catch (e) {
        if (process.env.NODE_ENV === "development") console.error("reassign assign failed", f.file_name, e);
        await supabase.from("coc_file_pool").update({ reason: "assign_failed", candidate_ids: [] }).eq("id", f.id);
      }
    } else {
      await supabase.from("coc_file_pool")
        .update({ reason: c.outcome, candidate_ids: c.candidateSubsectionIds ?? [] })
        .eq("id", f.id);
    }
  }
  return { assigned, pending: classifications.length - assigned };
}
