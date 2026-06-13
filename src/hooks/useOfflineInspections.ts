import { useCallback } from 'react';
import { useOfflineSync } from './useOfflineSync';
import { offlineDB } from '@/lib/offlineDB';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { validateFile, FILE_LIMITS } from '@/lib/fileValidation';
import { checkStorageAvailable } from '@/lib/storageQuota';

export interface InspectionData {
  title: string;
  description?: string | null;
  status: string;
  inspection_date?: string | null;
  site_id: string;
  inspector_id?: string;
  subsection_id?: string | null;
  shop_name?: string | null;
  shop_number?: string | null;
}

export function useOfflineInspections() {
  const { isOnline, queueMutation, queueUpload } = useOfflineSync();

  const createInspection = useCallback(async (data: InspectionData) => {
    const inspectionId = `offline_${Date.now()}_${Math.random()}`;
    const inspectionData = {
      id: inspectionId,
      ...data,
      created_at: new Date().toISOString(),
    };

    if (isOnline) {
      // Try online creation first
      try {
        const { data: created, error } = await supabase
          .from('inspections')
          .insert([inspectionData])
          .select()
          .single();

        if (error) throw error;
        toast.success('Inspection created successfully');
        return created;
      } catch (error) {
        console.error('Online creation failed, falling back to offline:', error);
        // Fall through to offline mode
      }
    }

    // Offline mode
    await offlineDB.saveInspection({
      ...inspectionData,
      description: inspectionData.description ?? null,
      inspection_date: inspectionData.inspection_date ?? null,
      synced: false,
    });

    queueMutation('CREATE_INSPECTION', inspectionData);
    toast.success('Inspection saved offline. Will sync when online.');
    return inspectionData;
  }, [isOnline, queueMutation]);

  const updateInspection = useCallback(async (id: string, updates: Partial<InspectionData>) => {
    if (isOnline) {
      try {
        const { error } = await supabase
          .from('inspections')
          .update(updates)
          .eq('id', id);

        if (error) throw error;
        toast.success('Inspection updated successfully');
        return;
      } catch (error) {
        console.error('Online update failed, falling back to offline:', error);
      }
    }

    // Offline mode
    queueMutation('UPDATE_INSPECTION', { id, ...updates });
    toast.success('Changes saved offline. Will sync when online.');
  }, [isOnline, queueMutation]);

  const deleteInspection = useCallback(async (id: string) => {
    if (isOnline) {
      try {
        const { error } = await supabase
          .from('inspections')
          .delete()
          .eq('id', id);

        if (error) throw error;
        toast.success('Inspection deleted successfully');
        return;
      } catch (error) {
        console.error('Online deletion failed, falling back to offline:', error);
      }
    }

    // Offline mode
    queueMutation('DELETE_INSPECTION', { id });
    toast.success('Deletion queued. Will sync when online.');
  }, [isOnline, queueMutation]);

  const uploadImage = useCallback(async (
    bucket: string,
    path: string,
    file: File,
    inspectionId?: string
  ) => {
    // Validate file
    const validation = validateFile(file, {
      maxSize: FILE_LIMITS.MAX_IMAGE_SIZE,
      category: 'images'
    });

    if (!validation.valid) {
      return;
    }

    // Check storage quota
    const hasSpace = await checkStorageAvailable(file.size);
    if (!hasSpace) {
      return;
    }

    if (isOnline) {
      try {
        const { error } = await supabase.storage
          .from(bucket)
          .upload(path, file);

        if (error) throw error;
        toast.success('Image uploaded successfully');
        return;
      } catch (error) {
        console.error('Online upload failed, falling back to offline:', error);
      }
    }

    // Offline mode - save to IndexedDB
    const imageId = `offline_img_${Date.now()}_${Math.random()}`;
    await offlineDB.saveImage({
      id: imageId,
      inspection_id: inspectionId || '',
      blob: file,
      file_name: file.name,
      created_at: new Date().toISOString(),
      synced: false,
    });

    await queueUpload('UPLOAD_IMAGE', { bucket, path, inspectionId }, file);
    toast.success('Image saved offline. Will upload when online.');
  }, [isOnline, queueUpload]);

  return {
    createInspection,
    updateInspection,
    deleteInspection,
    uploadImage,
    isOnline,
  };
}
