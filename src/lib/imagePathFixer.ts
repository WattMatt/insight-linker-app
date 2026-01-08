import { supabase } from "@/integrations/supabase/client";

/**
 * Fixes image paths in an inspection's json_data by finding actual files
 * in storage and updating the database with correct URLs
 */
export async function fixInspectionImagePaths(inspectionId: string): Promise<{
  fixed: boolean;
  updatedPaths: number;
  error?: string;
}> {
  try {
    // Fetch inspection data
    const { data: inspection, error: fetchError } = await supabase
      .from('inspections')
      .select('json_data')
      .eq('id', inspectionId)
      .single();

    if (fetchError || !inspection) {
      return { fixed: false, updatedPaths: 0, error: 'Failed to fetch inspection' };
    }

    const jsonData = inspection.json_data as Record<string, any>;
    if (!jsonData) {
      return { fixed: false, updatedPaths: 0, error: 'No JSON data found' };
    }

    // Get all files in the inspection folder from storage
    const storageFiles = await getStorageFilesMap(inspectionId);
    
    if (Object.keys(storageFiles).length === 0) {
      return { fixed: false, updatedPaths: 0, error: 'No files found in storage' };
    }

    // Update paths in json_data
    let updatedPaths = 0;
    const updatedJsonData = { ...jsonData };

    // Iterate through each section (normalBoardImages, emergencyBoardImages, etc.)
    for (const [sectionKey, sectionData] of Object.entries(updatedJsonData)) {
      if (typeof sectionData !== 'object' || sectionData === null) continue;
      if (sectionKey === 'tenants' || sectionKey === 'observations') continue;

      // Iterate through each item in the section (boardOpen, meter, etc.)
      for (const [itemKey, itemData] of Object.entries(sectionData as Record<string, any>)) {
        if (typeof itemData !== 'object' || itemData === null) continue;
        
        const photos = (itemData as any).photos;
        if (!Array.isArray(photos) || photos.length === 0) continue;

        // Look for matching files in storage
        const storageKey = `${sectionKey}/${itemKey}`;
        const matchingFiles = storageFiles[storageKey] || [];
        
        if (matchingFiles.length > 0) {
          // Check if current photos are broken (old format or need updating)
          const currentPhotosAreBroken = photos.some(
            (url: string) => /\/\d+\/\d+\/\d+-\d+\.(jpg|jpeg|png|webp)$/i.test(url)
          );

          if (currentPhotosAreBroken) {
            // Replace with files found in storage (maintain same count if possible)
            const newPhotos = matchingFiles.slice(0, photos.length);
            if (newPhotos.length > 0) {
              (updatedJsonData[sectionKey] as any)[itemKey] = {
                ...(itemData as any),
                photos: newPhotos
              };
              updatedPaths += newPhotos.length;
            }
          }
        }
      }
    }

    if (updatedPaths > 0) {
      // Update the inspection with fixed paths
      const { error: updateError } = await supabase
        .from('inspections')
        .update({ json_data: updatedJsonData })
        .eq('id', inspectionId);

      if (updateError) {
        console.error('Failed to update inspection:', updateError);
        return { fixed: false, updatedPaths: 0, error: 'Failed to update inspection' };
      }
    }

    return { fixed: updatedPaths > 0, updatedPaths };
  } catch (err) {
    console.error('Error fixing image paths:', err);
    return { fixed: false, updatedPaths: 0, error: String(err) };
  }
}

/**
 * Get a map of section/item -> file URLs from storage
 */
async function getStorageFilesMap(inspectionId: string): Promise<Record<string, string[]>> {
  const map: Record<string, string[]> = {};
  const bucket = 'inspection-photos';

  // List top-level folders (section folders)
  const { data: sections, error: sectionsError } = await supabase.storage
    .from(bucket)
    .list(inspectionId, { limit: 50 });

  if (sectionsError || !sections) return map;

  for (const section of sections) {
    // Skip if it's not a folder (semantic folders have id === null)
    if (section.id !== null) continue;
    
    const sectionPath = `${inspectionId}/${section.name}`;
    
    // List items in this section
    const { data: items, error: itemsError } = await supabase.storage
      .from(bucket)
      .list(sectionPath, { limit: 50 });

    if (itemsError || !items) continue;

    for (const item of items) {
      // If it's a file directly in section folder
      if (item.id !== null && /\.(jpg|jpeg|png|webp)$/i.test(item.name)) {
        const key = section.name;
        if (!map[key]) map[key] = [];
        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(`${sectionPath}/${item.name}`);
        map[key].push(urlData.publicUrl);
        continue;
      }

      // If it's a subfolder (item folder like boardOpen, meter, etc.)
      if (item.id === null) {
        const itemPath = `${sectionPath}/${item.name}`;
        const key = `${section.name}/${item.name}`;
        
        // List files in this item folder
        const { data: files, error: filesError } = await supabase.storage
          .from(bucket)
          .list(itemPath, { limit: 50 });

        if (filesError || !files) continue;

        for (const file of files) {
          if (/\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
            if (!map[key]) map[key] = [];
            const { data: urlData } = supabase.storage
              .from(bucket)
              .getPublicUrl(`${itemPath}/${file.name}`);
            map[key].push(urlData.publicUrl);
          }
        }
      }
    }
  }

  return map;
}

/**
 * Fix all broken image paths for inspections in a subsection
 */
export async function fixAllSubsectionImagePaths(subsectionId: string): Promise<{
  inspectionsFixed: number;
  totalPathsFixed: number;
}> {
  const { data: inspections, error } = await supabase
    .from('inspections')
    .select('id')
    .eq('subsection_id', subsectionId);

  if (error || !inspections) {
    return { inspectionsFixed: 0, totalPathsFixed: 0 };
  }

  let inspectionsFixed = 0;
  let totalPathsFixed = 0;

  for (const inspection of inspections) {
    const result = await fixInspectionImagePaths(inspection.id);
    if (result.fixed) {
      inspectionsFixed++;
      totalPathsFixed += result.updatedPaths;
    }
  }

  return { inspectionsFixed, totalPathsFixed };
}

/**
 * Fix all broken image paths across ALL inspections in the database
 */
export async function fixAllInspectionImagePaths(): Promise<{
  inspectionsProcessed: number;
  inspectionsFixed: number;
  totalPathsFixed: number;
}> {
  const { data: inspections, error } = await supabase
    .from('inspections')
    .select('id')
    .not('json_data', 'is', null);

  if (error || !inspections) {
    return { inspectionsProcessed: 0, inspectionsFixed: 0, totalPathsFixed: 0 };
  }

  let inspectionsFixed = 0;
  let totalPathsFixed = 0;

  for (const inspection of inspections) {
    const result = await fixInspectionImagePaths(inspection.id);
    if (result.fixed) {
      inspectionsFixed++;
      totalPathsFixed += result.updatedPaths;
    }
  }

  return { 
    inspectionsProcessed: inspections.length, 
    inspectionsFixed, 
    totalPathsFixed 
  };
}