import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { planRouting, type CertRowLite } from "@/lib/siteCoc/routeUpload";
import { normCert } from "@/lib/siteCoc/normalize";
import { findOrCreateCategory, uploadCocCertificate, uploadEvaluationReport } from "@/lib/coc/uploadCocFiles";

export interface LoadResult {
  routedCoc: number; routedEval: number;
  unmatched: string[]; ambiguous: string[]; needsCoc: string[]; failed: string[];
}

export function useSiteCocLoad(siteId: string | undefined, onDone: () => void) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LoadResult | null>(null);

  const load = async (files: File[]) => {
    if (!siteId || !files.length) return;
    setLoading(true);
    setResult(null);
    const res: LoadResult = { routedCoc: 0, routedEval: 0, unmatched: [], ambiguous: [], needsCoc: [], failed: [] };
    try {
      const { data: certs } = await supabase
        .from("coc_certificates").select("id, cert_no_norm, subsection_id").eq("site_id", siteId);
      const certRows: CertRowLite[] = (certs ?? []) as CertRowLite[];
      const byName = new Map(files.map(f => [f.name, f]));
      const plan = planRouting(files.map(f => ({ name: f.name })), certRows);

      const cocDocByKey = new Map<string, string>(); // `${subsectionId}|${normCert}` -> cocDocId

      for (const item of plan) {
        const file = byName.get(item.name);
        if (!file) continue;
        if (item.status === "unmatched") { res.unmatched.push(item.name); continue; }
        if (item.status === "ambiguous") { res.ambiguous.push(item.name); continue; }
        const key = item.certNo ? normCert(item.certNo) : "";
        const mapKey = `${item.subsectionId}|${key}`;
        try {
          if (item.kind === "coc") {
            const cat = await findOrCreateCategory(item.subsectionId!, "01 COC");
            const { id } = await uploadCocCertificate({ subsectionId: item.subsectionId!, cocCategoryId: cat.id, file });
            cocDocByKey.set(mapKey, id);
            if (item.certRowId) await supabase.from("coc_certificates").update({ coc_document_id: id }).eq("id", item.certRowId);
            res.routedCoc++;
          } else {
            let parentId = cocDocByKey.get(mapKey);
            if (!parentId) {
              const { data: existing } = await supabase
                .from("subsection_documents").select("id")
                .eq("subsection_id", item.subsectionId!).eq("coc_number", item.certNo ?? "").is("parent_document_id", null).limit(1);
              parentId = existing?.[0]?.id;
            }
            if (!parentId) { res.needsCoc.push(item.name); continue; }
            const evalCat = await findOrCreateCategory(item.subsectionId!, "07 COC Evaluation Reports");
            const { id } = await uploadEvaluationReport({ subsectionId: item.subsectionId!, evalCategoryId: evalCat.id, parentCocId: parentId, parentCocNumber: item.certNo, file });
            if (item.certRowId) await supabase.from("coc_certificates").update({ eval_document_id: id }).eq("id", item.certRowId);
            res.routedEval++;
          }
        } catch (e: any) {
          if (process.env.NODE_ENV === "development") console.error("route failed", item.name, e);
          res.failed.push(item.name);
        }
      }
      setResult(res);
      const attention = res.unmatched.length + res.ambiguous.length + res.needsCoc.length + res.failed.length;
      toast.success(`Loaded ${res.routedCoc} COC + ${res.routedEval} eval file(s)${attention ? ` · ${attention} need attention` : ""}.`);
      onDone();
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("Site COC load failed:", e);
      toast.error(e?.message || "Load failed", { duration: 6000 });
    } finally {
      setLoading(false);
    }
  };

  return { loading, result, load };
}
