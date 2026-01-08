import { supabase } from "@/integrations/supabase/client";

interface StorageFile {
  name: string;
  id: string | null;
}

/**
 * Fixes image paths in an inspection's json_data by matching stored paths
 * with actual files in storage
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
    const allFiles = await getAllFilesInFolder('inspection-photos', inspectionId);
    
    if (allFiles.length === 0) {
      return { fixed: false, updatedPaths: 0, error: 'No files found in storage' };
    }

    // Build a map of section/item to files
    const fileMap = buildFileMap(allFiles);

    // Update paths in json_data
    let updatedPaths = 0;
    const updatedJsonData = { ...jsonData };

    for (const [sectionKey, sectionData] of Object.entries(updatedJsonData)) {
      if (typeof sectionData !== 'object' || sectionData === null) continue;

      for (const [itemKey, itemData] of Object.entries(sectionData as Record<string, any>)) {
        if (typeof itemData !== 'object' || itemData === null) continue;
        
        const photos = (itemData as any).photos;
        if (!Array.isArray(photos) || photos.length === 0) continue;

        // Check if any photos are broken (old format)
        const updatedPhotos: string[] = [];
        for (const photoUrl of photos) {
          if (typeof photoUrl !== 'string') continue;

          // Check if this is an old-format path that doesn't exist
          const isOldFormat = /\/\d+\/\d+\/\d+-\d+\.(jpg|jpeg|png|webp)$/i.test(photoUrl);
          
          if (isOldFormat) {
            // Try to find a matching file in the new structure
            const matchingFiles = fileMap[`${sectionKey}/${itemKey}`] || [];
            if (matchingFiles.length > 0) {
              // Use the first matching file
              const newUrl = matchingFiles.shift()!;
              updatedPhotos.push(newUrl);
              updatedPaths++;
            } else {
              // Keep the old URL if no match found
              updatedPhotos.push(photoUrl);
            }
          } else {
            updatedPhotos.push(photoUrl);
          }
        }

        (updatedJsonData[sectionKey] as any)[itemKey] = {
          ...(itemData as any),
          photos: updatedPhotos
        };
      }
    }

    if (updatedPaths > 0) {
      // Update the inspection with fixed paths
      const { error: updateError } = await supabase
        .from('inspections')
        .update({ json_data: updatedJsonData })
        .eq('id', inspectionId);

      if (updateError) {
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
 * Recursively get all files in a storage folder
 */
async function getAllFilesInFolder(bucket: string, folderPath: string): Promise<string[]> {
  const files: string[] = [];
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folderPath, { limit: 1000 });

  if (error || !data) return files;

  for (const item of data) {
    const itemPath = `${folderPath}/${item.name}`;
    
    if (item.id === null) {
      // It's a folder, recurse
      const subFiles = await getAllFilesInFolder(bucket, itemPath);
      files.push(...subFiles);
    } else {
      // It's a file
      if (/\.(jpg|jpeg|png|webp)$/i.test(item.name)) {
        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(itemPath);
        files.push(urlData.publicUrl);
      }
    }
  }

  return files;
}

/**
 * Build a map of section/item keys to their file URLs
 */
function buildFileMap(files: string[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  for (const fileUrl of files) {
    // Extract path from URL
    const match = fileUrl.match(/\/inspection-photos\/[^/]+\/([^/]+)\/([^/]+)\//);
    if (match) {
      const sectionKey = match[1];
      const itemKey = match[2];
      const key = `${sectionKey}/${itemKey}`;
      
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(fileUrl);
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
