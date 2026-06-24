import { supabase } from "@/integrations/supabase/client";
import { normCert } from "@/lib/siteCoc/normalize";
import { extractEvalVerdict } from "@/lib/cocFilename";
import { findOrCreateCategory, insertCocCertificateDoc, insertEvaluationReportDoc } from "@/lib/coc/uploadCocFiles";

export interface AssignablePoolFile {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  detected_cert_no: string | null;
}

async function stampCert(siteId: string, subsectionId: string, certKey: string, col: "coc_document_id" | "eval_document_id", docId: string) {
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
}

/** Insert a subsection_documents row for a pooled file (firing the COC rollup), link the cert, mark the pool row assigned. */
export async function assignPoolFile(siteId: string, file: AssignablePoolFile, subsectionId: string, kind: "coc" | "eval"): Promise<void> {
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

  await stampCert(siteId, subsectionId, certKey, kind === "coc" ? "coc_document_id" : "eval_document_id", docId);
  await supabase.from("coc_file_pool").update({ status: "assigned", assigned_subsection_id: subsectionId, assigned_document_id: docId }).eq("id", file.id);
}
