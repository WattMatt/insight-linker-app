import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { offlineDB, type OfflinePhoto, type OfflinePhotoType, type OfflinePhotoContextType } from '@/lib/offlineDB';
import { useCamera } from '@/hooks/useCamera';

const MAX_RETRIES = 3;
const PHOTOS_BUCKET = 'coc-photos';

// Sync priority: lower number = higher priority
const SYNC_PRIORITY: Record<OfflinePhotoContextType, number> = {
  coc: 0,
  document: 1,
  inspection: 2,
  floor_plan: 3,
  site: 4,
};

interface CaptureOptions {
  notes?: string;
  secondaryContextId?: string;
}

type ConnectionQuality = 'wifi' | 'cellular' | 'unknown';

const getConnectionQuality = (): ConnectionQuality => {
  const nav = navigator as { connection?: { type?: string; effectiveType?: string } };
  if (nav.connection) {
    if (nav.connection.type === 'wifi' || nav.connection.type === 'ethernet') return 'wifi';
    if (nav.connection.effectiveType === '4g') return 'wifi'; // treat 4g as good
    return 'cellular';
  }
  return 'unknown';
};

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
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.6);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
};

const compressImage = (file: File | Blob, quality: 'standard' | 'aggressive' = 'standard'): Promise<Blob> => {
  const maxWidth = quality === 'aggressive' ? 500 : 800;
  const jpegQuality = quality === 'aggressive' ? 0.5 : 0.7;

  return new Promise((resolve) => {
    if (!(file instanceof Blob) || !file.type.startsWith('image/')) { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
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
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', jpegQuality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
};

const getGPSCoordinates = (): Promise<{ latitude: number; longitude: number } | null> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    const timeout = setTimeout(() => resolve(null), 5000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timeout); resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); },
      () => { clearTimeout(timeout); resolve(null); },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  });
};

export function useOfflinePhotos(
  contextType: OfflinePhotoContextType,
  contextId?: string
) {
  const [photos, setPhotos] = useState<OfflinePhoto[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingSizeBytes, setPendingSizeBytes] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [syncPaused, setSyncPaused] = useState(false);
  const isOnline = navigator.onLine;
  const { takePicture } = useCamera();
  const syncingRef = useRef(false);

  const loadPhotos = useCallback(async () => {
    if (!contextId) return;
    try {
      const localPhotos = await offlineDB.getOfflinePhotosByContext(contextType, contextId);
      localPhotos.sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
      setPhotos(localPhotos);
      const unsynced = localPhotos.filter(p => !p.synced);
      setPendingCount(unsynced.length);
      setPendingSizeBytes(unsynced.reduce((sum, p) => sum + p.file_size, 0));
    } catch (err) {
      console.error('[OfflinePhotos] Failed to load:', err);
    }
  }, [contextType, contextId]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const capturePhoto = useCallback(async (
    photoType: OfflinePhotoType,
    options?: CaptureOptions
  ): Promise<OfflinePhoto | null> => {
    if (!contextId) { toast.error('No context selected'); return null; }
    setIsCapturing(true);
    try {
      const file = await takePicture({ preferCamera: true, quality: 90 });
      if (!file) { setIsCapturing(false); return null; }

      const connQuality = getConnectionQuality();
      const compressionLevel = connQuality === 'cellular' ? 'aggressive' : 'standard';

      const [compressed, gps] = await Promise.all([
        compressImage(file, compressionLevel),
        getGPSCoordinates()
      ]);
      const thumbnail = await generateThumbnail(compressed);
      const { data: { user } } = await supabase.auth.getUser();

      // FIX CRITICAL 1: Use crypto.randomUUID() for proper UUID generation
      const photo: OfflinePhoto = {
        id: crypto.randomUUID(),
        context_type: contextType,
        context_id: contextId,
        secondary_context_id: options?.secondaryContextId || null,
        photo_type: photoType,
        file_blob: compressed,
        file_name: `${contextType}_${photoType}_${Date.now()}.jpg`,
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

      await offlineDB.saveOfflinePhoto(photo);
      await loadPhotos();
      toast.success('Photo captured and stored locally');
      return photo;
    } catch (err) {
      console.error('[OfflinePhotos] Capture error:', err);
      toast.error('Failed to capture photo');
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [contextType, contextId, takePicture, loadPhotos]);

  const syncPhotos = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine || syncPaused) return;
    syncingRef.current = true;
    setIsSyncing(true);

    try {
      const allUnsynced = await offlineDB.getUnsyncedOfflinePhotos();
      if (allUnsynced.length === 0) { setIsSyncing(false); syncingRef.current = false; return; }

      // Sort by sync priority
      allUnsynced.sort((a, b) =>
        (SYNC_PRIORITY[a.context_type] ?? 99) - (SYNC_PRIORITY[b.context_type] ?? 99)
      );

      // Adaptive compression based on connection
      const connQuality = getConnectionQuality();
      const compressionLevel = connQuality === 'cellular' ? 'aggressive' : 'standard';

      toast.info(`Syncing ${allUnsynced.length} photo${allUnsynced.length > 1 ? 's' : ''}...`);
      let successCount = 0;

      for (const photo of allUnsynced) {
        if (syncPaused || !navigator.onLine) break;
        if (photo.retry_count >= MAX_RETRIES) continue;

        try {
          // Re-compress if on slow connection and photo wasn't already aggressively compressed
          let blobToUpload = photo.file_blob;
          if (compressionLevel === 'aggressive' && photo.file_size > 100_000) {
            blobToUpload = await compressImage(photo.file_blob, 'aggressive');
          }

          const storagePath = `${photo.context_type}/${photo.context_id}/${photo.photo_type}/${photo.id}.jpg`;

          const { error: uploadError } = await supabase.storage
            .from(PHOTOS_BUCKET)
            .upload(storagePath, blobToUpload, {
              cacheControl: '3600',
              upsert: true,
              contentType: photo.mime_type
            });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from(PHOTOS_BUCKET)
            .getPublicUrl(storagePath);

          // Insert DB record into the unified offline_photos table for all contexts
          // (incl. COC - context_type self-describes the photo).
          const { error: dbError } = await supabase
            .from('offline_photos')
            .upsert({
              id: photo.id,
              context_type: photo.context_type,
              context_id: photo.context_id,
              secondary_context_id: photo.secondary_context_id,
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

          photo.synced = true;
          photo.remote_url = publicUrl;
          photo.sync_error = null;
          await offlineDB.saveOfflinePhoto(photo);
          successCount++;
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error('[OfflinePhotos] Sync error for', photo.id, err);
          photo.retry_count += 1;
          photo.sync_error = errorMessage;
          await offlineDB.saveOfflinePhoto(photo);
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} of ${allUnsynced.length} photo${allUnsynced.length > 1 ? 's' : ''} synced`);
      }
      if (successCount < allUnsynced.length) {
        const failed = allUnsynced.length - successCount;
        toast.warning(`${failed} photo${failed > 1 ? 's' : ''} failed to sync`);
      }

      await loadPhotos();
    } catch (err) {
      console.error('[OfflinePhotos] Sync error:', err);
      toast.error('Photo sync failed');
    } finally {
      setIsSyncing(false);
      syncingRef.current = false;
    }
  }, [loadPhotos, syncPaused]);

  const deletePhoto = useCallback(async (id: string) => {
    try {
      const photo = await offlineDB.getOfflinePhoto(id);
      if (photo?.synced && photo.remote_url) {
        const storagePath = `${photo.context_type}/${photo.context_id}/${photo.photo_type}/${photo.id}.jpg`;
        await supabase.storage.from(PHOTOS_BUCKET).remove([storagePath]);
        await supabase.from('offline_photos').delete().eq('id', id);
      }
      await offlineDB.deleteOfflinePhoto(id);
      await loadPhotos();
      toast.success('Photo deleted');
    } catch (err) {
      console.error('[OfflinePhotos] Delete error:', err);
      toast.error('Failed to delete photo');
    }
  }, [loadPhotos]);

  const getPhotoPreviewUrl = useCallback((photo: OfflinePhoto): string => {
    if (photo.remote_url) return photo.remote_url;
    if (photo.thumbnail_blob) return URL.createObjectURL(photo.thumbnail_blob);
    return URL.createObjectURL(photo.file_blob);
  }, []);

  const getPhotoFullUrl = useCallback((photo: OfflinePhoto): string => {
    if (photo.remote_url) return photo.remote_url;
    return URL.createObjectURL(photo.file_blob);
  }, []);

  const pauseSync = useCallback(() => setSyncPaused(true), []);
  const resumeSync = useCallback(() => {
    setSyncPaused(false);
    if (navigator.onLine) syncPhotos();
  }, [syncPhotos]);

  // Auto-sync on online
  useEffect(() => {
    const handleOnline = () => { if (!syncPaused) syncPhotos(); };
    window.addEventListener('online', handleOnline);
    if (navigator.onLine && !syncPaused) syncPhotos();
    return () => window.removeEventListener('online', handleOnline);
  }, [syncPhotos, syncPaused]);

  return {
    photos,
    pendingCount,
    pendingSizeBytes,
    isSyncing,
    isCapturing,
    isOnline,
    syncPaused,
    capturePhoto,
    syncPhotos,
    deletePhoto,
    getPhotoPreviewUrl,
    getPhotoFullUrl,
    pauseSync,
    resumeSync,
    loadPhotos,
  };
}
