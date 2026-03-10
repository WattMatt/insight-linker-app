import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { offlineDB, type OfflineCOCPhoto, type COCPhotoType } from '@/lib/offlineDB';
import { useCamera } from '@/hooks/useCamera';

const MAX_RETRIES = 3;
const COC_PHOTOS_BUCKET = 'coc-photos';

interface CaptureOptions {
  notes?: string;
  cocValidationId?: string;
}

/**
 * Generates a thumbnail from a File/Blob at 200px wide
 */
const generateThumbnail = (blob: Blob): Promise<Blob | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxWidth = 200;
      const scale = maxWidth / img.width;
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (b) => resolve(b),
        'image/jpeg',
        0.6
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
};

/**
 * Compresses an image to max 800px width, 70% JPEG quality
 */
const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxWidth = 800;
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob || file),
        'image/jpeg',
        0.7
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
};

/**
 * Try to get GPS coordinates (non-blocking)
 */
const getGPSCoordinates = (): Promise<{ latitude: number; longitude: number } | null> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    const timeout = setTimeout(() => resolve(null), 5000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeout);
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => { clearTimeout(timeout); resolve(null); },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  });
};

export function useOfflineCOCPhotos(subsectionId?: string) {
  const [photos, setPhotos] = useState<OfflineCOCPhoto[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const isOnline = navigator.onLine;
  const { takePicture } = useCamera();
  const syncingRef = useRef(false);

  // Load photos for subsection
  const loadPhotos = useCallback(async () => {
    if (!subsectionId) return;
    try {
      const localPhotos = await offlineDB.getCOCPhotosForSubsection(subsectionId);
      setPhotos(localPhotos.sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()));
      setPendingCount(localPhotos.filter(p => !p.synced).length);
    } catch (err) {
      console.error('[COCPhotos] Failed to load photos:', err);
    }
  }, [subsectionId]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  // Capture a photo
  const capturePhoto = useCallback(async (
    photoType: COCPhotoType,
    options?: CaptureOptions
  ): Promise<OfflineCOCPhoto | null> => {
    if (!subsectionId) {
      toast.error('No subsection selected');
      return null;
    }
    setIsCapturing(true);
    try {
      const file = await takePicture({ preferCamera: true, quality: 90 });
      if (!file) { setIsCapturing(false); return null; }

      // Compress and generate thumbnail in parallel with GPS
      const [compressed, gps] = await Promise.all([
        compressImage(file),
        getGPSCoordinates()
      ]);
      const thumbnail = await generateThumbnail(compressed);

      const { data: { user } } = await supabase.auth.getUser();

      const photo: OfflineCOCPhoto = {
        id: `coc_photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        subsection_id: subsectionId,
        coc_validation_id: options?.cocValidationId || null,
        photo_type: photoType,
        file_blob: compressed,
        file_name: `coc_${photoType}_${Date.now()}.jpg`,
        file_size: compressed.size,
        thumbnail_blob: thumbnail,
        mime_type: 'image/jpeg',
        captured_at: new Date().toISOString(),
        captured_by: user?.id || 'unknown',
        latitude: gps?.latitude || null,
        longitude: gps?.longitude || null,
        notes: options?.notes || null,
        synced: false,
        sync_error: null,
        retry_count: 0,
        remote_url: null
      };

      await offlineDB.saveCOCPhoto(photo);
      await loadPhotos();
      toast.success('Photo captured and stored locally');
      return photo;
    } catch (err) {
      console.error('[COCPhotos] Capture error:', err);
      toast.error('Failed to capture photo');
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [subsectionId, takePicture, loadPhotos]);

  // Get photos for a validation
  const getPhotosForValidation = useCallback(async (cocValidationId: string) => {
    return offlineDB.getCOCPhotosForValidation(cocValidationId);
  }, []);

  // Get pending count globally
  const getPendingCount = useCallback(async () => {
    const unsynced = await offlineDB.getUnsyncedCOCPhotos();
    return unsynced.length;
  }, []);

  // Sync all unsynced photos
  const syncPhotos = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setIsSyncing(true);

    try {
      const unsynced = await offlineDB.getUnsyncedCOCPhotos();
      if (unsynced.length === 0) { setIsSyncing(false); syncingRef.current = false; return; }

      toast.info(`Syncing ${unsynced.length} photo${unsynced.length > 1 ? 's' : ''}...`);
      let successCount = 0;

      for (const photo of unsynced) {
        if (photo.retry_count >= MAX_RETRIES) continue;

        try {
          const storagePath = `${photo.subsection_id}/${photo.photo_type}/${photo.id}.jpg`;

          // Upload to storage
          const { error: uploadError } = await supabase.storage
            .from(COC_PHOTOS_BUCKET)
            .upload(storagePath, photo.file_blob, {
              cacheControl: '3600',
              upsert: true,
              contentType: photo.mime_type
            });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from(COC_PHOTOS_BUCKET)
            .getPublicUrl(storagePath);

          // Insert into Supabase table
          const { error: dbError } = await supabase
            .from('coc_compliance_photos')
            .upsert({
              id: photo.id,
              subsection_id: photo.subsection_id,
              coc_validation_id: photo.coc_validation_id,
              photo_type: photo.photo_type,
              storage_path: storagePath,
              file_name: photo.file_name,
              file_size: photo.file_size,
              mime_type: photo.mime_type,
              captured_at: photo.captured_at,
              captured_by: photo.captured_by,
              latitude: photo.latitude,
              longitude: photo.longitude,
              notes: photo.notes
            });

          if (dbError) throw dbError;

          // Mark synced locally
          photo.synced = true;
          photo.remote_url = publicUrl;
          photo.sync_error = null;
          await offlineDB.saveCOCPhoto(photo);
          successCount++;
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error('[COCPhotos] Sync error for', photo.id, err);
          photo.retry_count += 1;
          photo.sync_error = errorMessage;
          await offlineDB.saveCOCPhoto(photo);
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} of ${unsynced.length} photo${unsynced.length > 1 ? 's' : ''} synced`);
      }
      if (successCount < unsynced.length) {
        const failed = unsynced.length - successCount;
        toast.warning(`${failed} photo${failed > 1 ? 's' : ''} failed to sync`);
      }

      await loadPhotos();
    } catch (err) {
      console.error('[COCPhotos] Sync error:', err);
      toast.error('Photo sync failed');
    } finally {
      setIsSyncing(false);
      syncingRef.current = false;
    }
  }, [loadPhotos]);

  // Delete a photo
  const deletePhoto = useCallback(async (id: string) => {
    try {
      const photo = await offlineDB.getCOCPhoto(id);
      if (photo?.synced && photo.remote_url) {
        // Delete from Supabase storage
        const storagePath = `${photo.subsection_id}/${photo.photo_type}/${photo.id}.jpg`;
        await supabase.storage.from(COC_PHOTOS_BUCKET).remove([storagePath]);
        await supabase.from('coc_compliance_photos').delete().eq('id', id);
      }
      await offlineDB.deleteCOCPhoto(id);
      await loadPhotos();
      toast.success('Photo deleted');
    } catch (err) {
      console.error('[COCPhotos] Delete error:', err);
      toast.error('Failed to delete photo');
    }
  }, [loadPhotos]);

  // Get preview URL from blob
  const getPhotoPreviewUrl = useCallback((photo: OfflineCOCPhoto): string => {
    if (photo.remote_url) return photo.remote_url;
    if (photo.thumbnail_blob) return URL.createObjectURL(photo.thumbnail_blob);
    return URL.createObjectURL(photo.file_blob);
  }, []);

  // Link photo to validation
  const linkPhotoToValidation = useCallback(async (photoId: string, cocValidationId: string) => {
    try {
      const photo = await offlineDB.getCOCPhoto(photoId);
      if (!photo) return;
      photo.coc_validation_id = cocValidationId;
      await offlineDB.saveCOCPhoto(photo);
      
      if (photo.synced) {
        await supabase
          .from('coc_compliance_photos')
          .update({ coc_validation_id: cocValidationId })
          .eq('id', photoId);
      }
      await loadPhotos();
    } catch (err) {
      console.error('[COCPhotos] Link error:', err);
    }
  }, [loadPhotos]);

  // Auto-sync when coming online
  useEffect(() => {
    const handleOnline = () => { syncPhotos(); };
    window.addEventListener('online', handleOnline);
    // Sync on mount if online
    if (navigator.onLine) { syncPhotos(); }
    return () => window.removeEventListener('online', handleOnline);
  }, [syncPhotos]);

  return {
    photos,
    pendingCount,
    isSyncing,
    isCapturing,
    isOnline,
    capturePhoto,
    getPhotosForValidation,
    getPendingCount,
    syncPhotos,
    deletePhoto,
    getPhotoPreviewUrl,
    linkPhotoToValidation,
    loadPhotos
  };
}
