/**
 * Image naming utilities for inspection photos
 * Creates descriptive file names and handles renaming of existing images
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Sanitizes a string to be safe for file names
 */
export const sanitizeForFileName = (str: string): string => {
  return str
    .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .slice(0, 50); // Limit length
};

/**
 * Generates a descriptive file path for inspection images
 */
export interface ImagePathOptions {
  clientName?: string;
  siteName?: string;
  subsectionName?: string;
  inspectionId: string;
  sectionKey: string;
  itemKey: string;
  index?: number;
  fileExtension: string;
}

export const generateInspectionImagePath = (options: ImagePathOptions): string => {
  const {
    clientName = 'unknown-client',
    siteName = 'unknown-site',
    subsectionName = 'unknown-subsection',
    inspectionId,
    sectionKey,
    itemKey,
    index,
    fileExtension
  } = options;

  const timestamp = Date.now();
  
  // Sanitize all parts
  const safeClient = sanitizeForFileName(clientName);
  const safeSite = sanitizeForFileName(siteName);
  const safeSubsection = sanitizeForFileName(subsectionName);
  const safeSection = sanitizeForFileName(sectionKey);
  const safeItem = sanitizeForFileName(itemKey);
  
  // Build descriptive file name
  const fileName = [
    safeClient,
    safeSite,
    safeSubsection,
    safeSection,
    safeItem,
    timestamp,
    index !== undefined ? index + 1 : undefined
  ].filter(Boolean).join('_');

  // Build full path
  return `${inspectionId}/${safeSection}/${safeItem}/${fileName}.${fileExtension}`;
};

/**
 * Generates a descriptive file path for tenant images
 */
export interface TenantImagePathOptions {
  clientName?: string;
  siteName?: string;
  subsectionName?: string;
  inspectionId: string;
  tenantId: string;
  field: string;
  fileExtension: string;
}

export const generateTenantImagePath = (options: TenantImagePathOptions): string => {
  const {
    clientName = 'unknown-client',
    siteName = 'unknown-site',
    subsectionName = 'unknown-subsection',
    inspectionId,
    tenantId,
    field,
    fileExtension
  } = options;

  const timestamp = Date.now();
  
  // Sanitize all parts
  const safeClient = sanitizeForFileName(clientName);
  const safeSite = sanitizeForFileName(siteName);
  const safeSubsection = sanitizeForFileName(subsectionName);
  const safeField = sanitizeForFileName(field);
  
  // Build descriptive file name
  const fileName = [
    safeClient,
    safeSite,
    safeSubsection,
    'tenant',
    safeField,
    timestamp
  ].join('_');

  // Build full path
  return `${inspectionId}/tenants/${tenantId}/${field}/${fileName}.${fileExtension}`;
};

/**
 * Extracts the storage path from a URL
 */
export const extractPathFromUrl = (url: string): string | null => {
  try {
    // Handle both public and signed URLs
    const match = url.match(/inspection-photos\/(.+?)(?:\?|$)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error extracting path from URL:', error);
    return null;
  }
};

/**
 * Renames an image in Supabase storage by copying to new location and deleting old
 */
export const renameImage = async (
  oldPath: string,
  newPath: string
): Promise<{ success: boolean; newUrl?: string; error?: string }> => {
  try {
    // Add a timeout to prevent hanging
    const timeoutPromise = new Promise<{ success: false; error: string }>((_, reject) => 
      setTimeout(() => reject({ success: false, error: 'Download timeout' }), 10000)
    );

    // Download the file with timeout
    const downloadPromise = supabase.storage
      .from('inspection-photos')
      .download(oldPath);

    const { data: fileData, error: downloadError } = await Promise.race([
      downloadPromise,
      timeoutPromise.then(() => ({ data: null, error: { message: 'Timeout' } }))
    ]) as any;

    if (downloadError || !fileData) {
      // Silently skip - file doesn't exist at this path
      return { success: false, error: 'File not found or download failed' };
    }

    // Upload to new location
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('inspection-photos')
      .upload(newPath, fileData, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      return { success: false, error: 'Failed to upload to new location' };
    }

    // Get new public URL
    const { data: publicData } = supabase.storage
      .from('inspection-photos')
      .getPublicUrl(newPath);

    // Delete old file (don't wait or fail on this)
    supabase.storage
      .from('inspection-photos')
      .remove([oldPath])
      .catch(() => {});

    return { success: true, newUrl: publicData.publicUrl };
  } catch (error: any) {
    // Don't log errors for missing files
    return { success: false, error: error.message || 'Unknown error' };
  }
};

/**
 * Batch renames all images in an inspection's json_data
 */
export const renameInspectionImages = async (
  inspectionId: string,
  clientName: string,
  siteName: string,
  subsectionName: string,
  jsonData: any
): Promise<{ updatedJsonData: any; renamedCount: number; failedCount: number }> => {
  let renamedCount = 0;
  let failedCount = 0;
  const updatedJsonData = JSON.parse(JSON.stringify(jsonData)); // Deep clone

  // Function to rename images in an item
  const renameItemImages = async (sectionKey: string, itemKey: string, itemData: any) => {
    if (!itemData.photos || !Array.isArray(itemData.photos)) {
      return;
    }

    const newPhotos: string[] = [];

    for (let i = 0; i < itemData.photos.length; i++) {
      const photoUrl = itemData.photos[i];
      const oldPath = extractPathFromUrl(photoUrl);

      if (!oldPath) {
        newPhotos.push(photoUrl); // Keep original if we can't extract path
        continue;
      }

      // Check if already has the new naming format (contains client/site names)
      if (oldPath.includes(sanitizeForFileName(clientName)) && 
          oldPath.includes(sanitizeForFileName(siteName))) {
        newPhotos.push(photoUrl); // Already renamed
        continue;
      }

      // Get file extension
      const ext = oldPath.split('.').pop() || 'jpg';

      // Generate new path
      const newPath = generateInspectionImagePath({
        clientName,
        siteName,
        subsectionName,
        inspectionId,
        sectionKey,
        itemKey,
        index: i,
        fileExtension: ext
      });

      // Rename the image
      const result = await renameImage(oldPath, newPath);

      if (result.success && result.newUrl) {
        newPhotos.push(result.newUrl);
        renamedCount++;
      } else {
        newPhotos.push(photoUrl); // Keep original on failure
        failedCount++;
        console.error(`Failed to rename ${oldPath}:`, result.error);
      }
    }

    itemData.photos = newPhotos;
  };

  // Process all sections and items
  if (updatedJsonData && typeof updatedJsonData === 'object') {
    for (const sectionKey of Object.keys(updatedJsonData)) {
      const section = updatedJsonData[sectionKey];
      
      if (section && typeof section === 'object' && !Array.isArray(section)) {
        for (const itemKey of Object.keys(section)) {
          const item = section[itemKey];
          
          if (item && typeof item === 'object') {
            await renameItemImages(sectionKey, itemKey, item);
          }
        }
      }
    }

    // Process tenant images
    if (updatedJsonData.tenants && Array.isArray(updatedJsonData.tenants)) {
      for (const tenant of updatedJsonData.tenants) {
        const imageFields = ['breakerImage', 'ctRatioImage', 'meterImage'];
        
        for (const field of imageFields) {
          if (tenant[field]) {
            const oldPath = extractPathFromUrl(tenant[field]);
            
            if (oldPath && !oldPath.includes(sanitizeForFileName(clientName))) {
              const ext = oldPath.split('.').pop() || 'jpg';
              
              const newPath = generateTenantImagePath({
                clientName,
                siteName,
                subsectionName,
                inspectionId,
                tenantId: tenant.id,
                field,
                fileExtension: ext
              });

              const result = await renameImage(oldPath, newPath);

              if (result.success && result.newUrl) {
                tenant[field] = result.newUrl;
                renamedCount++;
              } else {
                failedCount++;
                console.error(`Failed to rename tenant image ${oldPath}:`, result.error);
              }
            }
          }
        }
      }
    }
  }

  return { updatedJsonData, renamedCount, failedCount };
};
