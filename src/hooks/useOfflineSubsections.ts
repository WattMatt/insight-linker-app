import { useCallback } from 'react';
import { useOfflineSync } from './useOfflineSync';
import { 
  saveSubsection, 
  saveDocument, 
  saveFloorPlan,
  getSubsection,
  getSubsectionDocuments,
  getSubsectionFloorPlans 
} from '@/lib/offlineDBExtensions';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SubsectionData {
  name: string;
  tenant_name?: string | null;
  category: string;
  site_id: string;
  coc_number?: string | null;
  coc_type?: string | null;
  coc_status?: string | null;
  coc_issue_date?: string | null;
  meter_serial_number?: string | null;
  metering_status?: string | null;
  ct_ratio?: string | null;
  is_coc_required: boolean;
}

export function useOfflineSubsections() {
  const { isOnline, queueMutation } = useOfflineSync();

  const updateSubsection = useCallback(async (id: string, updates: Partial<SubsectionData>) => {
    if (isOnline) {
      try {
        const { error } = await supabase
          .from('subsections')
          .update(updates)
          .eq('id', id);

        if (error) throw error;
        toast.success('Subsection updated successfully');
        return;
      } catch (error) {
        console.error('Online update failed, falling back to offline:', error);
      }
    }

    // Offline mode - get existing subsection and merge updates
    const existing = await getSubsection(id);
    
    if (!existing) {
      // If no existing subsection in offline storage, we can't update it
      toast.error('Subsection data not available offline');
      return;
    }

    const updatedSubsection = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
      synced: false,
    };

    await saveSubsection(updatedSubsection);
    queueMutation('UPDATE_SUBSECTION', { id, ...updates });
    toast.success('Changes saved offline. Will sync when online.');
  }, [isOnline, queueMutation]);

  const uploadDocument = useCallback(async (
    subsectionId: string,
    categoryId: string,
    file: File
  ) => {
    const filePath = `subsections/${subsectionId}/${Date.now()}_${file.name}`;
    
    if (isOnline) {
      try {
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        const { error: dbError } = await supabase
          .from('subsection_documents')
          .insert({
            subsection_id: subsectionId,
            category_id: categoryId,
            file_name: file.name,
            file_url: publicUrl,
            file_size: file.size,
          });

        if (dbError) throw dbError;
        toast.success('Document uploaded successfully');
        return;
      } catch (error) {
        console.error('Online upload failed, falling back to offline:', error);
      }
    }

    // Offline mode - save blob to IndexedDB
    const documentId = `offline_doc_${Date.now()}_${Math.random()}`;
    await saveDocument({
      id: documentId,
      subsection_id: subsectionId,
      file_name: file.name,
      blob: file,
      category_id: categoryId,
      uploaded_at: new Date().toISOString(),
      synced: false,
    });

    queueMutation('UPLOAD_DOCUMENT', {
      documentId,
      subsectionId,
      categoryId,
      file,
      filePath,
    });

    toast.success('Document saved offline. Will upload when online.');
  }, [isOnline, queueMutation]);

  const uploadFloorPlan = useCallback(async (
    subsectionId: string,
    file: File
  ) => {
    const filePath = `floor-plans/${subsectionId}/${Date.now()}_${file.name}`;
    
    if (isOnline) {
      try {
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        const { error: dbError } = await supabase
          .from('subsection_floor_plans')
          .insert({
            subsection_id: subsectionId,
            file_name: file.name,
            file_url: publicUrl,
          });

        if (dbError) throw dbError;
        toast.success('Floor plan uploaded successfully');
        return;
      } catch (error) {
        console.error('Online upload failed, falling back to offline:', error);
      }
    }

    // Offline mode
    const floorPlanId = `offline_fp_${Date.now()}_${Math.random()}`;
    await saveFloorPlan({
      id: floorPlanId,
      subsection_id: subsectionId,
      file_name: file.name,
      blob: file,
      uploaded_at: new Date().toISOString(),
      synced: false,
    });

    queueMutation('UPLOAD_FLOOR_PLAN', {
      floorPlanId,
      subsectionId,
      file,
      filePath,
    });

    toast.success('Floor plan saved offline. Will upload when online.');
  }, [isOnline, queueMutation]);

  const getOfflineData = useCallback(async (subsectionId: string) => {
    try {
      const [subsection, documents, floorPlans] = await Promise.all([
        getSubsection(subsectionId),
        getSubsectionDocuments(subsectionId),
        getSubsectionFloorPlans(subsectionId),
      ]);

      return { subsection, documents, floorPlans };
    } catch (error) {
      console.error('Error loading offline data:', error);
      return { subsection: null, documents: [], floorPlans: [] };
    }
  }, []);

  return {
    updateSubsection,
    uploadDocument,
    uploadFloorPlan,
    getOfflineData,
    isOnline,
  };
}
