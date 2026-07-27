import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assignPoolFile } from "@/lib/coc/assignPoolFile";
import { uploadFileToPool } from "@/lib/coc/poolUpload";
import { reassignPendingPoolFiles } from "@/lib/coc/reassignPool";
import { mapWithConcurrency, summarizeUpload, type FileOutcome } from "@/lib/siteCoc/uploadQueue";

export interface PoolFile {
  id: string; file_name: string; file_url: string; file_size: number | null;
  detected_cert_no: string | null; detected_kind: string | null; status: string;
  reason: string | null; candidate_ids: string[] | null;
}
const UPLOAD_CONCURRENCY = 5;

export function useSiteCocPool(siteId: string | undefined, onAssigned: () => void) {
  const [pending, setPending] = useState<PoolFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<FileOutcome[]>([]);
  const inFlight = useRef<Set<string>>(new Set());

  const refetch = useCallback(async () => {
    if (!siteId) return;
    const { data } = await supabase.from("coc_file_pool").select("*").eq("site_id", siteId).eq("status", "pending").order("created_at");
    setPending((data ?? []) as unknown as PoolFile[]);
  }, [siteId]);

  useEffect(() => { refetch(); }, [refetch]);

  const upload = useCallback(async (files: File[]) => {
    if (!siteId || !files.length) return;
    setBusy(true);
    setProgress({ done: 0, total: files.length });
    try {
      const result = await mapWithConcurrency<File, FileOutcome>(
        files, UPLOAD_CONCURRENCY,
        async (file): Promise<FileOutcome> => {
          try {
            const { poolId, detectedCertNo } = await uploadFileToPool(siteId, file);
            return { name: file.name, state: "uploaded", poolId, detectedCertNo };
          } catch (e: any) {
            return { name: file.name, state: "failed", error: e?.message ?? "error" };
          }
        },
        (done, total) => setProgress({ done, total }),
      );
      setOutcomes(result);
      const sum = summarizeUpload(result);
      const { assigned } = await reassignPendingPoolFiles(siteId);
      toast.success(`Uploaded ${sum.uploaded}/${sum.total}; auto-assigned ${assigned}.${sum.failed ? ` ${sum.failed} failed.` : ""}`);
      await refetch();
      onAssigned();
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("pool upload failed", e);
      toast.error(e?.message || "Upload failed", { duration: 6000 });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [siteId, refetch, onAssigned]);

  const reassign = useCallback(async () => {
    if (!siteId) return;
    setBusy(true);
    try {
      const { assigned } = await reassignPendingPoolFiles(siteId);
      if (assigned) toast.success(`Auto-assigned ${assigned} pending file(s).`);
      await refetch();
      onAssigned();
    } finally { setBusy(false); }
  }, [siteId, refetch, onAssigned]);

  const assignManual = useCallback(async (file: PoolFile, subsectionId: string, kind: "coc" | "eval") => {
    if (!siteId || inFlight.current.has(file.id)) return;
    inFlight.current.add(file.id);
    setBusy(true);
    try { await assignPoolFile(siteId, file, subsectionId, kind); toast.success(`Assigned ${file.file_name}`); await refetch(); onAssigned(); }
    catch (e: any) { toast.error(e?.message || "Assign failed"); }
    finally { inFlight.current.delete(file.id); setBusy(false); }
  }, [siteId, refetch, onAssigned]);

  const assignManyTo = useCallback(async (files: PoolFile[], subsectionId: string) => {
    if (!siteId || !files.length) return;
    setBusy(true);
    try {
      let n = 0;
      for (const f of files) {
        try { await assignPoolFile(siteId, f, subsectionId, f.detected_kind === "eval" ? "eval" : "coc"); n++; }
        catch (e) { if (process.env.NODE_ENV === "development") console.error("batch assign failed", f.file_name, e); }
      }
      toast.success(`Assigned ${n}/${files.length} file(s).`);
      await refetch();
      onAssigned();
    } finally { setBusy(false); }
  }, [siteId, refetch, onAssigned]);

  const updateCertNo = useCallback(async (file: PoolFile, certNo: string) => {
    await supabase.from("coc_file_pool").update({ detected_cert_no: certNo || null }).eq("id", file.id);
    await reassign();
  }, [reassign]);

  const remove = useCallback(async (file: PoolFile) => {
    try {
      const u = new URL(file.file_url);
      const parts = u.pathname.split("/");
      const p = parts.slice(parts.indexOf("documents") + 1).join("/");
      if (p) await supabase.storage.from("documents").remove([p]);
    } catch { /* ignore */ }
    await supabase.from("coc_file_pool").delete().eq("id", file.id);
    await refetch();
  }, [refetch]);

  return { pending, busy, progress, outcomes, upload, reassign, assignManual, assignManyTo, updateCertNo, remove, refetch };
}
