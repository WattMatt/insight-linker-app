import { supabase } from "@/integrations/supabase/client";
import { extractCocNumber, extractEvalVerdict } from "@/lib/cocFilename";

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9.-]/g, "_");
const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXT = /\.(html?|pdf|docx?|jpe?g|png)$/i;

function validate(file: File) {
  if (file.size > MAX_BYTES) throw new Error(`File exceeds 50MB (${(file.size / 1048576).toFixed(2)}MB)`);
  if (!ALLOWED_EXT.test(file.name)) throw new Error("Invalid file type. Upload PDF, DOC, DOCX, JPG, PNG, or HTML.");
}

/** Find a subsection document category by name (case-insensitive), creating it if absent. */
export async function findOrCreateCategory(subsectionId: string, name: string): Promise<{ id: string; name: string }> {
  const { data: existing } = await supabase
    .from("document_categories").select("id, name").eq("subsection_id", subsectionId).ilike("name", name).limit(1);
  if (existing && existing[0]) return existing[0];
  const { data: cats } = await supabase.from("document_categories").select("name").eq("subsection_id", subsectionId);
  const maxOrder = (cats ?? []).reduce((m, c) => Math.max(m, parseInt((c.name || "").split(" ")[0]) || 0), 0);
  const { data, error } = await supabase
    .from("document_categories").insert({ subsection_id: subsectionId, name, order_index: maxOrder + 1 }).select("id, name").single();
  if (error || !data) throw new Error(`Could not resolve category "${name}": ${error?.message}`);
  return data;
}

/** Upload a COC certificate into a subsection's COC category (per-COC folder, number extracted). */
export async function uploadCocCertificate(opts: { subsectionId: string; cocCategoryId: string; file: File }): Promise<{ id: string; cocNumber: string | null }> {
  const { subsectionId, cocCategoryId, file } = opts;
  validate(file);
  const cocNumber = extractCocNumber(file.name);
  const ts = Date.now();
  const folderKey = sanitize(cocNumber || `${ts}`);
  const path = `${subsectionId}/COC/${folderKey}/${ts}-${sanitize(file.name)}`;
  const { data: up, error: upErr } = await supabase.storage.from("documents").upload(path, file);
  if (upErr || !up?.path) throw new Error(`Upload failed: ${upErr?.message ?? "no path"}`);
  const { data: urlData } = supabase.storage.from("documents").getPublicUrl(up.path);
  try {
    const { id } = await insertCocCertificateDoc({ subsectionId, cocCategoryId, fileName: file.name, fileUrl: urlData.publicUrl, fileSize: file.size, cocNumber });
    return { id, cocNumber };
  } catch (e) {
    await supabase.storage.from("documents").remove([up.path]);
    throw e;
  }
}

/** Insert a COC certificate document row from an already-stored file (no upload). */
export async function insertCocCertificateDoc(opts: { subsectionId: string; cocCategoryId: string; fileName: string; fileUrl: string; fileSize: number | null; cocNumber: string | null }): Promise<{ id: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: row, error } = await supabase.from("subsection_documents").insert({
    subsection_id: opts.subsectionId, category_id: opts.cocCategoryId, file_name: opts.fileName,
    file_url: opts.fileUrl, file_size: opts.fileSize, uploaded_by: user.id,
    coc_number: opts.cocNumber, coc_status: "Pending",
  }).select("id").single();
  if (error || !row) throw new Error(`Save failed: ${error?.message}`);
  return { id: row.id };
}

/** Upload an evaluation report paired to a COC (same per-COC folder, verdict from filename prefix). */
export async function uploadEvaluationReport(opts: { subsectionId: string; evalCategoryId: string; parentCocId: string; parentCocNumber: string | null; file: File }): Promise<{ id: string }> {
  const { subsectionId, evalCategoryId, parentCocId, parentCocNumber, file } = opts;
  validate(file);
  const ts = Date.now();
  const folderKey = sanitize(parentCocNumber || parentCocId);
  const path = `${subsectionId}/COC/${folderKey}/${ts}-${sanitize(file.name)}`;
  const { data: up, error: upErr } = await supabase.storage.from("documents").upload(path, file);
  if (upErr || !up?.path) throw new Error(`Upload failed: ${upErr?.message ?? "no path"}`);
  const { data: urlData } = supabase.storage.from("documents").getPublicUrl(up.path);
  try {
    return await insertEvaluationReportDoc({
      subsectionId, evalCategoryId, parentCocId,
      fileName: file.name, fileUrl: urlData.publicUrl, fileSize: file.size,
      cocNumber: parentCocNumber || extractCocNumber(file.name),
      verdict: extractEvalVerdict(file.name),
    });
  } catch (e) {
    await supabase.storage.from("documents").remove([up.path]);
    throw e;
  }
}

/** Insert an evaluation-report document row from an already-stored file (no upload). */
export async function insertEvaluationReportDoc(opts: { subsectionId: string; evalCategoryId: string; parentCocId: string | null; fileName: string; fileUrl: string; fileSize: number | null; cocNumber: string | null; verdict: string | null }): Promise<{ id: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: row, error } = await supabase.from("subsection_documents").insert({
    subsection_id: opts.subsectionId, category_id: opts.evalCategoryId, parent_document_id: opts.parentCocId,
    file_name: opts.fileName, file_url: opts.fileUrl, file_size: opts.fileSize, uploaded_by: user.id,
    coc_number: opts.cocNumber, coc_status: opts.verdict ?? "Pending",
  }).select("id").single();
  if (error || !row) throw new Error(`Save failed: ${error?.message}`);
  return { id: row.id };
}
