import { supabase } from "@/integrations/supabase/client";
import { storagePathFromUrl } from "@/lib/documents/paths";

interface SavePDFOptions {
  blob: Blob;
  fileName: string;
  siteId?: string;
  subsectionId?: string;
  categoryName: string;
}

interface SaveResult {
  success: boolean;
  error?: string;
  /**
   * The STORAGE PATH of the saved document (not a fetchable URL). The
   * `documents` bucket is private; resolve through getDocumentSignedUrl()
   * (src/lib/documents/documentUrl.ts) before displaying or downloading.
   */
  documentUrl?: string;
}

/** Best-effort delete of an uploaded blob after a later step fails, so a failed save leaves no orphan. */
async function removeUploadedBlob(path: string): Promise<void> {
  try {
    await supabase.storage.from("documents").remove([path]);
  } catch (e) {
    console.warn("Failed to remove orphaned blob after save failure:", path, e);
  }
}

/**
 * Keep only the latest report of a given identity (scope + category). Called
 * AFTER the new report is saved, so at least the latest always exists; it then
 * deletes every older row of the same identity and removes its storage object.
 *
 * A report's identity is its scope plus its category: (site_id, category) for
 * site reports, (subsection_id, category_id) for subsection reports. Regenerating
 * a report therefore supersedes the previous one instead of piling up copies.
 *
 * Best-effort by design: if row-level security blocks a delete (e.g. a
 * non-staff uploader), the older report simply remains rather than failing a
 * save that already succeeded.
 *
 * @returns the number of superseded (deleted) reports.
 */
async function supersedePreviousReports(
  table: "site_documents" | "subsection_documents",
  scopeId: string,
  /** category NAME for site_documents, category_id for subsection_documents */
  categoryValue: string,
  keepId: string,
): Promise<number> {
  try {
    const older = table === "site_documents"
      ? (await supabase.from("site_documents").select("id, file_url").eq("site_id", scopeId).eq("category", categoryValue).neq("id", keepId)).data
      : (await supabase.from("subsection_documents").select("id, file_url").eq("subsection_id", scopeId).eq("category_id", categoryValue).neq("id", keepId)).data;

    if (!older || older.length === 0) return 0;

    const ids = older.map((r) => r.id);
    // Delete the rows FIRST and confirm which actually went (RLS may filter some);
    // only then remove the corresponding blobs, so we never orphan a live row.
    const deleted = table === "site_documents"
      ? (await supabase.from("site_documents").delete().in("id", ids).select("id")).data
      : (await supabase.from("subsection_documents").delete().in("id", ids).select("id")).data;

    const deletedIds = new Set((deleted ?? []).map((d) => d.id));
    if (deletedIds.size === 0) return 0;

    const paths = older
      .filter((r) => deletedIds.has(r.id) && r.file_url)
      .map((r) => storagePathFromUrl(r.file_url))
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage.from("documents").remove(paths);
      if (rmErr) console.warn("Superseded report rows deleted but some blobs remain:", rmErr.message);
    }
    return deletedIds.size;
  } catch (e) {
    console.warn("Failed to supersede previous reports (older copies may remain):", e);
    return 0;
  }
}

/**
 * Save a PDF to either site_documents or subsection_documents based on context
 */
export async function savePDFToDocuments(options: SavePDFOptions): Promise<SaveResult> {
  const { blob, fileName, siteId, subsectionId, categoryName } = options;

  try {
    // Determine save location
    if (subsectionId) {
      return await saveToSubsectionDocuments(blob, fileName, subsectionId, categoryName);
    } else if (siteId) {
      return await saveToSiteDocuments(blob, fileName, siteId, categoryName);
    } else {
      return { success: false, error: "Either siteId or subsectionId must be provided" };
    }
  } catch (error) {
    console.error("Error saving PDF to documents:", error);
    const rawMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const isTooLarge = /exceeded the maximum allowed size|payload too large|413/i.test(rawMessage);
    const sizeMb = (blob.size / (1024 * 1024)).toFixed(1);
    return {
      success: false,
      error: isTooLarge
        ? `Report file is too large to save (${sizeMb} MB). Reduce the number of photos or attached documents and try again.`
        : rawMessage,
    };
  }
}

async function saveToSiteDocuments(
  blob: Blob,
  fileName: string,
  siteId: string,
  categoryName: string
): Promise<SaveResult> {
  // Find or create category
  const { data: existingCategories } = await supabase
    .from("site_document_categories")
    .select("*")
    .eq("site_id", siteId)
    .eq("name", categoryName);

  let categoryId: string;

  if (existingCategories && existingCategories.length > 0) {
    categoryId = existingCategories[0].id;
  } else {
    const { data: newCategory, error: categoryError } = await supabase
      .from("site_document_categories")
      .insert({
        site_id: siteId,
        name: categoryName,
        order_index: 999,
        is_system: true,
      })
      .select()
      .single();

    if (categoryError) throw categoryError;
    categoryId = newCategory.id;
  }

  // Upload to storage
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${siteId}/${categoryName.replace(/[^a-zA-Z0-9]/g, "_")}/${timestamp}-${sanitizedFileName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, blob, {
      contentType: "application/pdf",
    });

  if (uploadError) throw uploadError;

  // The bucket is PRIVATE: store the storage PATH, not a public URL.
  // Readers mint signed URLs via getDocumentSignedUrl() at display time.
  const { data: inserted, error: insertError } = await supabase
    .from("site_documents")
    .insert({
      site_id: siteId,
      category_id: categoryId,
      file_name: fileName,
      file_url: uploadData.path,
      category: categoryName,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    await removeUploadedBlob(uploadData.path);
    throw insertError ?? new Error("Report row insert returned nothing");
  }

  // Only the latest report of this identity is kept.
  await supersedePreviousReports("site_documents", siteId, categoryName, inserted.id);

  return { success: true, documentUrl: uploadData.path };
}

async function saveToSubsectionDocuments(
  blob: Blob,
  fileName: string,
  subsectionId: string,
  categoryName: string
): Promise<SaveResult> {
  // Find or create category for this subsection
  const { data: existingCategories } = await supabase
    .from("document_categories")
    .select("*")
    .eq("subsection_id", subsectionId)
    .eq("name", categoryName);

  let categoryId: string;

  if (existingCategories && existingCategories.length > 0) {
    categoryId = existingCategories[0].id;
  } else {
    const { data: newCategory, error: categoryError } = await supabase
      .from("document_categories")
      .insert({
        subsection_id: subsectionId,
        name: categoryName,
        order_index: 999,
        is_system: true,
      })
      .select()
      .single();

    if (categoryError) throw categoryError;
    categoryId = newCategory.id;
  }

  // Upload to storage
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `subsections/${subsectionId}/${categoryName.replace(/[^a-zA-Z0-9]/g, "_")}/${timestamp}-${sanitizedFileName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, blob, {
      contentType: "application/pdf",
    });

  if (uploadError) throw uploadError;

  // The bucket is PRIVATE: store the storage PATH, not a public URL.
  // Readers mint signed URLs via getDocumentSignedUrl() at display time.
  // uploaded_by is recorded so the row-level DELETE policy ("Admin or the
  // uploader") lets the person who generated the report remove it.
  const { data: { user } } = await supabase.auth.getUser();
  const { data: inserted, error: insertError } = await supabase
    .from("subsection_documents")
    .insert({
      subsection_id: subsectionId,
      category_id: categoryId,
      file_name: fileName,
      file_url: uploadData.path,
      file_size: blob.size,
      uploaded_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    await removeUploadedBlob(uploadData.path);
    throw insertError ?? new Error("Report row insert returned nothing");
  }

  // Only the latest report of this identity is kept.
  await supersedePreviousReports("subsection_documents", subsectionId, categoryId, inserted.id);

  return { success: true, documentUrl: uploadData.path };
}

/**
 * Get the appropriate category name for a report type
 */
export function getReportCategoryName(reportType: string): string {
  const categoryMap: Record<string, string> = {
    "site-summary": "Site Summary Reports",
    "asset-verification": "Asset Verification Reports",
    "floor-plan": "Floor Plan Reports",
    "inspection": "Inspection Reports",
    "coc-validation": "COC Validation Reports",
    "site-coc": "Site COC Reports",
    "site-drawing": "Site Drawing Reports",
    "fortress-checklist": "Marking Checklists",
  };
  return categoryMap[reportType] || "Generated Reports";
}
