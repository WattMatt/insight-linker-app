import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractCocNumber, extractEvalVerdict } from "@/lib/cocFilename";
import { classifyCocFile } from "@/lib/siteCoc/routeUpload";
import { normCert } from "@/lib/siteCoc/normalize";
import { planPoolAutoAssign, type CertRowLite } from "@/lib/siteCoc/poolAssign";
import { findOrCreateCategory, insertCocCertificateDoc, insertEvaluationReportDoc } from "@/lib/coc/uploadCocFiles";

export interface PoolFile {
  id: string; file_name: string; file_url: string; file_size: number | null;
  detected_cert_no: string | null; detected_kind: string | null; status: string;
}
const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9.-]/g, "_");

export function useSiteCocPool(siteId: string | undefined, onAssigned: () => void) {
  const [pending, setPending] = useState<PoolFile[]>([]);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef<Set<string>>(new Set());

  const refetch = useCallback(async () => {
    if (!siteId) return;
    const { data } = await supabase.from("coc_file_pool").select("*").eq("site_id", siteId).eq("status", "pending").order("created_at");
    setPending((data ?? []) as unknown as PoolFile[]);
  }, [siteId]);

  useEffect(() => { refetch(); }, [refetch]);

  // Stamp exactly ONE certificate row's link column (prefer one that has no link yet), never all matches.
  const stampCert = async (subsectionId: string, certKey: string, col: "coc_document_id" | "eval_document_id", docId: string) => {
    if (!certKey) return;
    const { data: empty } = await supabase.from("coc_certificates").select("id")
      .eq("site_id", siteId).eq("subsection_id", subsectionId).eq("cert_no_norm", certKey).is(col, null).limit(1);
    let targetId = empty?.[0]?.id as string | undefined;
    if (!targetId) {
      const { data: any1 } = await supabase.from("coc_certificates").select("id")
        .eq("site_id", siteId).eq("subsection_id", subsectionId).eq("cert_no_norm", certKey).limit(1);
      targetId = any1?.[0]?.id;
    }
    if (targetId) await supabase.from("coc_certificates").update({ [col]: docId }).eq("id", targetId);
  };

  // Insert a subsection_documents row referencing an already-stored pool file, then mark assigned.
  // Dedup: if the same file already exists in this subsection+category, reuse it (no duplicate row).
  const assign = useCallback(async (file: PoolFile, subsectionId: string, kind: "coc" | "eval") => {
    if (!siteId) return;
    const certNo = file.detected_cert_no;
    const certKey = certNo ? normCert(certNo) : "";
    const cat = await findOrCreateCategory(subsectionId, kind === "coc" ? "01 COC" : "07 COC Evaluation Reports");

    const { data: dupe } = await supabase.from("subsection_documents").select("id")
      .eq("subsection_id", subsectionId).eq("category_id", cat.id).eq("file_name", file.file_name).limit(1);
    let docId = dupe?.[0]?.id as string | undefined;

    if (!docId) {
      if (kind === "coc") {
        docId = (await insertCocCertificateDoc({ subsectionId, cocCategoryId: cat.id, fileName: file.file_name, fileUrl: file.file_url, fileSize: file.file_size, cocNumber: certNo })).id;
      } else {
        let parentId: string | null = null;
        if (certNo) {
          const { data: p } = await supabase.from("subsection_documents").select("id").eq("subsection_id", subsectionId).eq("coc_number", certNo).is("parent_document_id", null).limit(1);
          parentId = p?.[0]?.id ?? null;
        }
        docId = (await insertEvaluationReportDoc({ subsectionId, evalCategoryId: cat.id, parentCocId: parentId, fileName: file.file_name, fileUrl: file.file_url, fileSize: file.file_size, cocNumber: certNo, verdict: extractEvalVerdict(file.file_name) })).id;
      }
    }

    await stampCert(subsectionId, certKey, kind === "coc" ? "coc_document_id" : "eval_document_id", docId);
    await supabase.from("coc_file_pool").update({ status: "assigned", assigned_subsection_id: subsectionId, assigned_document_id: docId }).eq("id", file.id);
  }, [siteId]);

  const upload = useCallback(async (files: File[]) => {
    if (!siteId || !files.length) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const inserted: PoolFile[] = [];
      for (const file of files) {
        const ts = Date.now();
        const path = `${siteId}/_pool/${ts}-${sanitize(file.name)}`;
        const { data: up, error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr || !up?.path) { toast.error(`Upload failed: ${file.name}`); continue; }
        const { data: urlData } = supabase.storage.from("documents").getPublicUrl(up.path);
        const { data: row, error } = await supabase.from("coc_file_pool").insert({
          site_id: siteId, file_name: file.name, file_url: urlData.publicUrl, file_size: file.size,
          detected_cert_no: extractCocNumber(file.name), detected_kind: classifyCocFile(file.name),
          uploaded_by: user?.id ?? null,
        }).select("*").single();
        if (!error && row) inserted.push(row as unknown as PoolFile);
      }
      // Auto-assign exact matches.
      const { data: certs } = await supabase.from("coc_certificates").select("id, cert_no_norm, subsection_id").eq("site_id", siteId);
      const plan = planPoolAutoAssign(inserted, (certs ?? []) as CertRowLite[]);
      const byId = new Map(inserted.map(f => [f.id, f]));
      let auto = 0;
      for (const a of plan) {
        const f = byId.get(a.poolId);
        if (!f) continue;
        try { await assign(f, a.subsectionId, a.kind); auto++; }
        catch (e) { if (process.env.NODE_ENV === "development") console.error("auto-assign failed", f.file_name, e); }
      }
      toast.success(`Uploaded ${inserted.length} file(s); auto-assigned ${auto}. ${inserted.length - auto} awaiting assignment.`);
      await refetch();
      onAssigned();
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("pool upload failed", e);
      toast.error(e?.message || "Upload failed", { duration: 6000 });
    } finally {
      setBusy(false);
    }
  }, [siteId, assign, refetch, onAssigned]);

  const assignManual = useCallback(async (file: PoolFile, subsectionId: string, kind: "coc" | "eval") => {
    if (inFlight.current.has(file.id)) return; // guard against double-click duplicating
    inFlight.current.add(file.id);
    setBusy(true);
    try { await assign(file, subsectionId, kind); toast.success(`Assigned ${file.file_name}`); await refetch(); onAssigned(); }
    catch (e: any) { toast.error(e?.message || "Assign failed"); }
    finally { inFlight.current.delete(file.id); setBusy(false); }
  }, [assign, refetch, onAssigned]);

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

  return { pending, busy, upload, assignManual, remove, refetch };
}
