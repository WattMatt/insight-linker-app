import { supabase } from "@/integrations/supabase/client";
import { extractCocNumber } from "@/lib/cocFilename";
import { classifyCocFile } from "@/lib/siteCoc/routeUpload";
import { reassignPendingPoolFiles } from "@/lib/coc/reassignPool";

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9.-]/g, "_");

export interface PoolRouteResult {
  poolId: string;
  detectedCertNo: string | null;
  /** null => still pending in the Exceptions queue */
  assignedSubsectionId: string | null;
  /** failure reason when still pending */
  reason: string | null;
}

/** Upload ONE file into the site COC pool (storage + coc_file_pool row). */
export async function uploadFileToPool(siteId: string, file: File): Promise<{ poolId: string; detectedCertNo: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  const ts = Date.now();
  const path = `${siteId}/_pool/${ts}-${sanitize(file.name)}`;
  const { data: up, error: upErr } = await supabase.storage.from("documents").upload(path, file);
  if (upErr || !up?.path) throw new Error(upErr?.message ?? "upload error");
  const { data: urlData } = supabase.storage.from("documents").getPublicUrl(up.path);
  const detected = extractCocNumber(file.name);
  const { data: row, error } = await supabase.from("coc_file_pool").insert({
    site_id: siteId, file_name: file.name, file_url: urlData.publicUrl, file_size: file.size,
    detected_cert_no: detected, detected_kind: classifyCocFile(file.name), uploaded_by: user?.id ?? null,
  }).select("id").single();
  if (error || !row) {
    await supabase.storage.from("documents").remove([up.path]);
    throw new Error(error?.message ?? "insert error");
  }
  return { poolId: row.id, detectedCertNo: detected };
}

/** One-pipe ingestion for subsection-level uploads: pool the file, run
 * auto-assignment, and report where it landed. */
export async function poolRouteFile(siteId: string, file: File): Promise<PoolRouteResult> {
  const { poolId, detectedCertNo } = await uploadFileToPool(siteId, file);
  await reassignPendingPoolFiles(siteId);
  const { data } = await supabase.from("coc_file_pool")
    .select("status, reason, assigned_subsection_id").eq("id", poolId).single();
  const assigned = data?.status === "assigned";
  return {
    poolId,
    detectedCertNo,
    assignedSubsectionId: assigned ? ((data?.assigned_subsection_id as string | null) ?? null) : null,
    reason: assigned ? null : ((data?.reason as string | null) ?? null),
  };
}
