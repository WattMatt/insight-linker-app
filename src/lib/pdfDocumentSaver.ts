import { supabase } from "@/integrations/supabase/client";

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

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("documents")
    .getPublicUrl(uploadData.path);

  // Insert document record
  const { error: insertError } = await supabase
    .from("site_documents")
    .insert({
      site_id: siteId,
      category_id: categoryId,
      file_name: fileName,
      file_url: urlData.publicUrl,
      category: categoryName,
    });

  if (insertError) {
    await removeUploadedBlob(uploadData.path);
    throw insertError;
  }

  return { success: true, documentUrl: urlData.publicUrl };
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

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("documents")
    .getPublicUrl(uploadData.path);

  // Insert document record
  const { error: insertError } = await supabase
    .from("subsection_documents")
    .insert({
      subsection_id: subsectionId,
      category_id: categoryId,
      file_name: fileName,
      file_url: urlData.publicUrl,
      file_size: blob.size,
    });

  if (insertError) {
    await removeUploadedBlob(uploadData.path);
    throw insertError;
  }

  return { success: true, documentUrl: urlData.publicUrl };
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
    "site-drawing": "Site Drawing Reports",
    "fortress-checklist": "Marking Checklists",
  };
  return categoryMap[reportType] || "Generated Reports";
}
