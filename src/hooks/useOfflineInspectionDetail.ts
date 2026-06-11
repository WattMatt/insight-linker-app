import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  offlineInspectionDB, 
  CachedInspection, 
  OfflineInspectionImage,
  CachedTemplate 
} from '@/lib/offlineInspectionDB';

interface UseOfflineInspectionDetailOptions {
  inspectionId: string;
  autoCache?: boolean;
}

export function useOfflineInspectionDetail({ 
  inspectionId, 
  autoCache = true 
}: UseOfflineInspectionDetailOptions) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isCached, setIsCached] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cachedData, setCachedData] = useState<CachedInspection | null>(null);
  const [offlineImages, setOfflineImages] = useState<OfflineInspectionImage[]>([]);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // A11: cache of object URLs keyed by image id. getSectionImages() used to mint a
  // fresh URL.createObjectURL per image on EVERY call and never revoke it — a steady
  // memory leak. We now reuse a cached URL per image id (stable across re-renders) and
  // revoke them all on unmount. Stored in a ref so it survives re-renders without
  // re-triggering effects.
  const objectUrlCacheRef = useRef<Map<string, string>>(new Map());

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // A11: revoke every cached object URL when the hook unmounts so the blob memory is
  // released. (Empty deps: the ref instance is stable; we only clean up on unmount.)
  useEffect(() => {
    const cache = objectUrlCacheRef.current;
    return () => {
      for (const url of cache.values()) {
        URL.revokeObjectURL(url);
      }
      cache.clear();
    };
  }, []);

  // Check if inspection is cached on mount
  useEffect(() => {
    const checkCache = async () => {
      if (!inspectionId) return;
      
      const cached = await offlineInspectionDB.getCachedInspection(inspectionId);
      setIsCached(cached !== null);
      setCachedData(cached);
      setHasPendingChanges(cached?.pending_changes || false);
      
      if (cached?.cached_at) {
        setLastSyncTime(new Date(cached.cached_at));
      }

      // Load offline images
      const images = await offlineInspectionDB.getInspectionImages(inspectionId);
      setOfflineImages(images);
    };

    checkCache();
  }, [inspectionId]);

  // Cache inspection data from Supabase
  const cacheInspection = useCallback(async (
    inspectionData: any,
    templateData: any,
    siteData: any,
    subsectionData: any
  ): Promise<boolean> => {
    if (!inspectionId) return false;

    try {
      const cachedInspection: CachedInspection = {
        id: inspectionId,
        title: inspectionData.title || '',
        status: inspectionData.status || '',
        inspection_date: inspectionData.inspection_date,
        site_id: inspectionData.site_id,
        subsection_id: inspectionData.subsection_id,
        inspector_name: inspectionData.inspector_name,
        json_data: inspectionData.json_data || {},
        template: templateData,
        template_id: inspectionData.template_id,
        template_category: templateData?.category || null,
        site_data: siteData ? {
          clientName: siteData.clientName || '',
          siteName: siteData.siteName || '',
          physicalAddress: siteData.physicalAddress || null,
          siteImageUrl: siteData.siteImageUrl || null,
          clientLogoUrl: siteData.clientLogoUrl || null
        } : null,
        subsection_data: subsectionData ? {
          name: subsectionData.name || ''
        } : null,
        cached_at: new Date().toISOString(),
        last_modified: new Date().toISOString(),
        synced: true,
        pending_changes: false
      };

      await offlineInspectionDB.cacheInspection(cachedInspection);

      // Cache template separately for reuse
      if (templateData && inspectionData.template_id) {
        const cachedTemplate: CachedTemplate = {
          id: inspectionData.template_id,
          name: templateData.name || '',
          category: templateData.category || '',
          sections: templateData.sections || {},
          cached_at: new Date().toISOString()
        };
        await offlineInspectionDB.cacheTemplate(cachedTemplate);
      }

      setIsCached(true);
      setCachedData(cachedInspection);
      setLastSyncTime(new Date());

      // Run LRU eviction in background
      offlineInspectionDB.evictOldInspections(50);
      offlineInspectionDB.evictOldTemplates(20);

      return true;
    } catch (error) {
      console.error('Failed to cache inspection:', error);
      return false;
    }
  }, [inspectionId]);

  // Get cached inspection data
  const getCachedInspection = useCallback(async (): Promise<CachedInspection | null> => {
    if (!inspectionId) return null;
    return offlineInspectionDB.getCachedInspection(inspectionId);
  }, [inspectionId]);

  // Save section changes locally (for offline editing)
  const saveInspectionSection = useCallback(async (
    sectionKey: string,
    itemKey: string,
    data: { status?: string; notes?: string }
  ): Promise<boolean> => {
    if (!inspectionId || !cachedData) return false;

    try {
      const updatedJsonData = {
        ...cachedData.json_data,
        [sectionKey]: {
          ...(cachedData.json_data?.[sectionKey] || {}),
          [itemKey]: {
            ...(cachedData.json_data?.[sectionKey]?.[itemKey] || {}),
            ...data
          }
        }
      };

      await offlineInspectionDB.updateCachedInspectionData(inspectionId, updatedJsonData);
      
      const updated = await offlineInspectionDB.getCachedInspection(inspectionId);
      setCachedData(updated);
      setHasPendingChanges(true);

      return true;
    } catch (error) {
      console.error('Failed to save section:', error);
      return false;
    }
  }, [inspectionId, cachedData]);

  // Add offline image with compression
  const addOfflineImage = useCallback(async (
    file: File | Blob,
    sectionKey: string,
    itemKey?: string
  ): Promise<string | null> => {
    if (!inspectionId) return null;

    try {
      // Compress image
      const compressedBlob = await compressImage(file);
      
      const imageId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fileName = file instanceof File ? file.name : `image_${Date.now()}.jpg`;

      const offlineImage: OfflineInspectionImage = {
        id: imageId,
        inspection_id: inspectionId,
        section_key: sectionKey,
        item_key: itemKey || null,
        blob: compressedBlob,
        file_name: fileName,
        created_at: new Date().toISOString(),
        synced: false,
        uploaded_url: null
      };

      await offlineInspectionDB.saveInspectionImage(offlineImage);
      
      // Update local state
      setOfflineImages(prev => [...prev, offlineImage]);
      setHasPendingChanges(true);

      // Return blob URL for immediate display
      return URL.createObjectURL(compressedBlob);
    } catch (error) {
      console.error('Failed to save offline image:', error);
      toast.error('Failed to save image offline');
      return null;
    }
  }, [inspectionId]);

  // Get all images for a section (both online URLs and offline blobs)
  const getSectionImages = useCallback(async (sectionKey: string): Promise<{
    onlineImages: string[];
    offlineImages: Array<{ id: string; blobUrl: string; synced: boolean }>;
  }> => {
    const cached = await getCachedInspection();
    
    // Get online images from cached json_data
    const sectionData = cached?.json_data?.[sectionKey];
    const onlineImages: string[] = [];
    
    if (sectionData) {
      Object.values(sectionData).forEach((item: any) => {
        if (item?.photos && Array.isArray(item.photos)) {
          onlineImages.push(...item.photos);
        }
        if (item?.images && typeof item.images === 'object') {
          Object.values(item.images).forEach((img: any) => {
            if (img?.url) onlineImages.push(img.url);
          });
        }
      });
    }

    // Get offline images. A11: reuse a cached object URL per image id instead of
    // minting (and leaking) a fresh one on every call. URLs are revoked on unmount.
    const offlineImgs = await offlineInspectionDB.getInspectionImages(inspectionId, sectionKey);
    const cache = objectUrlCacheRef.current;
    const offlineImageData = offlineImgs.map(img => {
      let blobUrl = cache.get(img.id);
      if (!blobUrl) {
        blobUrl = URL.createObjectURL(img.blob);
        cache.set(img.id, blobUrl);
      }
      return {
        id: img.id,
        blobUrl,
        synced: img.synced
      };
    });

    return { onlineImages, offlineImages: offlineImageData };
  }, [inspectionId, getCachedInspection]);

  // Delete offline image
  const deleteOfflineImage = useCallback(async (imageId: string): Promise<boolean> => {
    try {
      await offlineInspectionDB.deleteInspectionImage(imageId);
      setOfflineImages(prev => prev.filter(img => img.id !== imageId));
      return true;
    } catch (error) {
      console.error('Failed to delete offline image:', error);
      return false;
    }
  }, []);

  // Get cache statistics
  const getCacheStats = useCallback(async () => {
    return offlineInspectionDB.getCacheStats();
  }, []);

  // Check if a specific inspection is available offline
  const isAvailableOffline = useCallback(async (id?: string): Promise<boolean> => {
    const checkId = id || inspectionId;
    if (!checkId) return false;
    return offlineInspectionDB.isInspectionCached(checkId);
  }, [inspectionId]);

  // Clear cache for current inspection
  const clearCache = useCallback(async (): Promise<boolean> => {
    if (!inspectionId) return false;
    
    try {
      await offlineInspectionDB.deleteCachedInspection(inspectionId);
      await offlineInspectionDB.deleteInspectionImages(inspectionId);
      setIsCached(false);
      setCachedData(null);
      setOfflineImages([]);
      setHasPendingChanges(false);
      return true;
    } catch (error) {
      console.error('Failed to clear cache:', error);
      return false;
    }
  }, [inspectionId]);

  return {
    // State
    isOnline,
    isCached,
    isLoading,
    cachedData,
    offlineImages,
    hasPendingChanges,
    lastSyncTime,

    // Actions
    cacheInspection,
    getCachedInspection,
    saveInspectionSection,
    addOfflineImage,
    getSectionImages,
    deleteOfflineImage,
    getCacheStats,
    isAvailableOffline,
    clearCache
  };
}

// Image compression utility
async function compressImage(file: File | Blob, maxWidth = 800, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      URL.revokeObjectURL(img.src);

      let { width, height } = img;
      
      // Scale down if needed
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg',
          quality
        );
      } else {
        reject(new Error('Failed to get canvas context'));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };

    img.src = URL.createObjectURL(file);
  });
}
