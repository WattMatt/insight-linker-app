import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { offlineDB } from '@/lib/offlineDB';

interface QueuedMutation {
  id: string;
  type: string;
  data: any;
  timestamp: number;
  retries: number;
}

const QUEUE_KEY = 'offline_mutation_queue';
const MAX_RETRIES = 3;

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueSize, setQueueSize] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();

  // Load queue from localStorage
  const getQueue = useCallback((): QueuedMutation[] => {
    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  // Save queue to localStorage
  const saveQueue = useCallback((queue: QueuedMutation[]) => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    setQueueSize(queue.length);
  }, []);

  // Add mutation to queue
  const queueMutation = useCallback((type: string, data: any) => {
    const queue = getQueue();
    const mutation: QueuedMutation = {
      id: `${Date.now()}_${Math.random()}`,
      type,
      data,
      timestamp: Date.now(),
      retries: 0,
    };
    queue.push(mutation);
    saveQueue(queue);
    toast.info('Action queued. Will sync when online.', { duration: 2000 });
  }, [getQueue, saveQueue]);

  // Execute mutation based on type
  const executeMutation = async (mutation: QueuedMutation) => {
    switch (mutation.type) {
      case 'CREATE_INSPECTION': {
        const { error } = await supabase.from('inspections').insert([mutation.data]);
        if (error) throw error;
        
        // Mark as synced in IndexedDB
        if (mutation.data.id) {
          await offlineDB.markInspectionSynced(mutation.data.id);
        }
        break;
      }

      case 'UPDATE_INSPECTION': {
        const { id, ...updates } = mutation.data;
        const { error } = await supabase
          .from('inspections')
          .update(updates)
          .eq('id', id);
        if (error) throw error;
        break;
      }

      case 'DELETE_INSPECTION': {
        const { error } = await supabase
          .from('inspections')
          .delete()
          .eq('id', mutation.data.id);
        if (error) throw error;
        
        // Delete from IndexedDB
        await offlineDB.deleteInspection(mutation.data.id);
        break;
      }

      case 'UPLOAD_IMAGE': {
        const { bucket, path, file, inspectionId } = mutation.data;
        const { error } = await supabase.storage
          .from(bucket)
          .upload(path, file);
        if (error) throw error;
        
        // Mark as synced in IndexedDB
        if (inspectionId) {
          const images = await offlineDB.getUnsyncedImages();
          const image = images.find(img => img.inspection_id === inspectionId);
          if (image) {
            await offlineDB.markImageSynced(image.id);
          }
        }
        break;
      }

      case 'UPDATE_SUBSECTION': {
        const { id, ...updates } = mutation.data;
        const { error } = await supabase
          .from('subsections')
          .update(updates)
          .eq('id', id);
        if (error) throw error;
        
        // Mark as synced in IndexedDB
        const { markSubsectionSynced } = await import('@/lib/offlineDBExtensions');
        await markSubsectionSynced(id);
        break;
      }

      case 'UPLOAD_DOCUMENT': {
        const { documentId, subsectionId, categoryId, file, filePath } = mutation.data;
        
        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        // Insert into database
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

        // Mark as synced in IndexedDB
        const { markDocumentSynced } = await import('@/lib/offlineDBExtensions');
        await markDocumentSynced(documentId);
        break;
      }

      case 'UPLOAD_FLOOR_PLAN': {
        const { floorPlanId, subsectionId, file, filePath } = mutation.data;
        
        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        // Insert into database
        const { error: dbError } = await supabase
          .from('subsection_floor_plans')
          .insert({
            subsection_id: subsectionId,
            file_name: file.name,
            file_url: publicUrl,
          });
        if (dbError) throw dbError;

        // Mark as synced in IndexedDB
        const { markFloorPlanSynced } = await import('@/lib/offlineDBExtensions');
        await markFloorPlanSynced(floorPlanId);
        break;
      }

      default:
        console.warn('Unknown mutation type:', mutation.type);
    }
  };

  // Process queue when online
  const processQueue = useCallback(async () => {
    if (!isOnline || isSyncing) return;

    const queue = getQueue();
    if (queue.length === 0) return;

    setIsSyncing(true);
    const failedMutations: QueuedMutation[] = [];

    for (const mutation of queue) {
      try {
        await executeMutation(mutation);
        console.log('Successfully synced mutation:', mutation.type);
      } catch (error) {
        console.error('Failed to process mutation:', error);
        
        if (mutation.retries < MAX_RETRIES) {
          failedMutations.push({
            ...mutation,
            retries: mutation.retries + 1,
          });
        } else {
          toast.error(`Failed to sync ${mutation.type} after ${MAX_RETRIES} attempts`);
        }
      }
    }

    saveQueue(failedMutations);
    setIsSyncing(false);

    if (failedMutations.length === 0 && queue.length > 0) {
      toast.success(`Synced ${queue.length} offline action${queue.length > 1 ? 's' : ''}`);
      queryClient.invalidateQueries();
    }
  }, [isOnline, isSyncing, getQueue, saveQueue, queryClient]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Back online! Syncing...', { duration: 2000 });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('You are offline. Changes will be synced when connection is restored.', {
        duration: 4000,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Process queue when coming back online
  useEffect(() => {
    if (isOnline) {
      processQueue();
    }
  }, [isOnline, processQueue]);

  // Update queue size on mount
  useEffect(() => {
    setQueueSize(getQueue().length);
  }, [getQueue]);

  return {
    isOnline,
    queueSize,
    isSyncing,
    queueMutation,
    processQueue,
  };
}
