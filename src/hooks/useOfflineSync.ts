import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { offlineDB } from '@/lib/offlineDB';
import { OFFLINE_QUEUE_KEY as QUEUE_KEY, orderQueueForSync, mergeServerPhotos } from '@/lib/offlineQueue';
import { getOnline } from '@/lib/onlineStatus';

interface QueuedMutation {
  id: string;
  type: string;
  data: any;
  timestamp: number;
  retries: number;
}

const MAX_RETRIES = 3;

// Module-level drain coordination — shared across ALL useOfflineSync instances in this
// tab so multiple mounts (e.g. OfflineIndicator + InspectionDetail) can't run concurrent
// or duplicate drains. `isDraining` is a synchronous lock (the old isSyncing React-state
// guard updated too late to prevent a race); `drainAgain` coalesces a request that lands
// while the lock is held (e.g. an enqueue mid-drain) into one more pass.
let isDraining = false;
let drainAgain = false;

// Broadcast drain state to ALL mounted instances. The lock is module-global, so the
// "syncing" indicator must be too — otherwise a non-draining mount shows a stale spinner
// and an enabled "Sync Now" button while another instance is mid-drain.
function announceSyncing(syncing: boolean) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline-sync-state', { detail: { syncing } }));
  }
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(getOnline);
  const wasOnline = useRef(getOnline());
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
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('offline-queue-updated'));
  }, [getQueue, saveQueue]);

  // Queue an upload mutation WITHOUT putting the File/Blob through JSON: store the blob in
  // IndexedDB (queued_blobs) and carry only its id in the localStorage mutation.
  const queueUpload = useCallback(async (type: string, data: Record<string, unknown>, file: Blob & { name?: string }) => {
    const blobId = await offlineDB.putQueuedBlob(file, { fileName: file.name, fileType: file.type });
    queueMutation(type, { ...data, blobId, fileName: file.name ?? null, fileSize: file.size });
  }, [queueMutation]);

  // Execute mutation based on type
  const executeMutation = async (mutation: QueuedMutation) => {
    switch (mutation.type) {
      case 'CREATE_INSPECTION': {
        // upsert on the row id so a retry after a partial success can't duplicate or PK-conflict.
        const { error } = await supabase.from('inspections').upsert([mutation.data], { onConflict: 'id' });
        if (error) throw error;
        if (mutation.data.id) await offlineDB.markInspectionSynced(mutation.data.id);
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
        const { bucket, path, blobId, inspectionId } = mutation.data;
        const blob = await offlineDB.getQueuedBlob(blobId);
        if (!blob) throw new Error(`UPLOAD_IMAGE: queued blob ${blobId} missing`);
        const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true });
        if (error) throw error;

        if (inspectionId) {
          const images = await offlineDB.getUnsyncedImages();
          const image = images.find(img => img.inspection_id === inspectionId);
          if (image) await offlineDB.markImageSynced(image.id);
        }
        await offlineDB.deleteQueuedBlob(blobId);
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
        const { documentId, subsectionId, categoryId, blobId, filePath, fileName, fileSize } = mutation.data;
        const blob = await offlineDB.getQueuedBlob(blobId);
        if (!blob) throw new Error(`UPLOAD_DOCUMENT: queued blob ${blobId} missing`);

        const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, blob, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

        const { error: dbError } = await supabase.from('subsection_documents').insert({
          subsection_id: subsectionId,
          category_id: categoryId,
          file_name: fileName,
          file_url: publicUrl,
          file_size: fileSize,
        });
        if (dbError) throw dbError;

        const { markDocumentSynced } = await import('@/lib/offlineDBExtensions');
        await markDocumentSynced(documentId);
        await offlineDB.deleteQueuedBlob(blobId);
        break;
      }

      case 'UPLOAD_FLOOR_PLAN': {
        const { floorPlanId, subsectionId, blobId, filePath, fileName } = mutation.data;
        const blob = await offlineDB.getQueuedBlob(blobId);
        if (!blob) throw new Error(`UPLOAD_FLOOR_PLAN: queued blob ${blobId} missing`);

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, blob, { upsert: true });
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
            file_name: fileName,
            file_url: publicUrl,
          });
        if (dbError) throw dbError;

        // Mark as synced in IndexedDB
        const { markFloorPlanSynced } = await import('@/lib/offlineDBExtensions');
        await markFloorPlanSynced(floorPlanId);
        await offlineDB.deleteQueuedBlob(blobId);
        break;
      }

      case 'ADD_FLOOR_PLAN_PIN': {
        const { pin } = mutation.data;
        const { markPinSynced } = await import('@/lib/offlineFloorPlanDB');
        
        // Upload photo if exists
        let photoUrl = pin.photo_url;
        if (mutation.data.photoBlobId) {
          const photo = await offlineDB.getQueuedBlob(mutation.data.photoBlobId);
          if (!photo) throw new Error(`ADD_FLOOR_PLAN_PIN: queued blob ${mutation.data.photoBlobId} missing`);
          const fileName = `floor-plan-pins/${pin.floor_plan_id}/${Date.now()}_photo.jpg`;
          const { error } = await supabase.storage.from('inspection-photos').upload(fileName, photo, { upsert: true });
          if (error) throw error;
          const { data: { publicUrl } } = supabase.storage.from('inspection-photos').getPublicUrl(fileName);
          photoUrl = publicUrl;
        }

        const { error: pinInsertError } = await supabase
          .from('floor_plan_pins')
          .insert({
            floor_plan_id: pin.floor_plan_id,
            pin_number: pin.pin_number,
            x_position: pin.x_position,
            y_position: pin.y_position,
            pin_type: pin.pin_type,
            title: pin.title,
            notes: pin.notes,
            detailed_description: pin.detailed_description,
            priority: pin.priority,
            status: pin.status,
            assigned_contractor: pin.assigned_contractor,
            stakeholders: pin.stakeholders,
            package: pin.package,
            due_date: pin.due_date,
            photo_url: photoUrl,
            created_by: pin.created_by,
          });
        if (pinInsertError) throw pinInsertError;

        await markPinSynced(pin.id);
        if (mutation.data.photoBlobId) await offlineDB.deleteQueuedBlob(mutation.data.photoBlobId);
        break;
      }

      case 'UPDATE_FLOOR_PLAN_PIN': {
        const { pinId, updates, photoBlobId, photoFileName } = mutation.data;
        const { markPinSynced } = await import('@/lib/offlineFloorPlanDB');

        let photoUrl = updates.photo_url;
        if (photoBlobId) {
          const photo = await offlineDB.getQueuedBlob(photoBlobId);
          if (!photo) throw new Error(`UPDATE_FLOOR_PLAN_PIN: queued blob ${photoBlobId} missing`);
          const fileName = `floor-plan-pins/${pinId}/${Date.now()}_${photoFileName ?? 'photo.jpg'}`;
          const { error } = await supabase.storage.from('inspection-photos').upload(fileName, photo, { upsert: true });
          if (error) throw error;
          const { data: { publicUrl } } = supabase.storage.from('inspection-photos').getPublicUrl(fileName);
          photoUrl = publicUrl;
        }

        const { error: pinUpdateError } = await supabase.from('floor_plan_pins').update({ ...updates, photo_url: photoUrl }).eq('id', pinId);
        if (pinUpdateError) throw pinUpdateError;
        await markPinSynced(pinId);
        if (photoBlobId) await offlineDB.deleteQueuedBlob(photoBlobId);
        break;
      }

      case 'DELETE_FLOOR_PLAN_PIN': {
        const { deleteOfflinePin } = await import('@/lib/offlineFloorPlanDB');
        await supabase
          .from('floor_plan_pins')
          .delete()
          .eq('id', mutation.data.pinId);
        
        await deleteOfflinePin(mutation.data.pinId);
        break;
      }

      case 'ADD_MARKUP': {
        const { markMarkupSynced } = await import('@/lib/offlineFloorPlanDB');
        // Markups are stored locally only for now
        await markMarkupSynced(mutation.data.markup.id);
        break;
      }

      case 'DELETE_MARKUP': {
        const { deleteMarkup } = await import('@/lib/offlineFloorPlanDB');
        await deleteMarkup(mutation.data.markupId);
        break;
      }

      case 'ADD_MEASUREMENT': {
        const { markMeasurementSynced } = await import('@/lib/offlineFloorPlanDB');
        // Measurements are stored locally only for now
        await markMeasurementSynced(mutation.data.measurement.id);
        break;
      }

      case 'DELETE_MEASUREMENT': {
        const { deleteMeasurement } = await import('@/lib/offlineFloorPlanDB');
        await deleteMeasurement(mutation.data.measurementId);
        break;
      }

      // ============ Inspection Offline Mutations ============

      // LEGACY: a past version enqueued SAVE_INSPECTION_JSON. No longer produced, but
      // kept so a mutation still sitting in an old client's queue can drain (removing it
      // would strand and eventually discard that user's unsynced edit).
      case 'SAVE_INSPECTION_JSON': {
        const { inspectionId, jsonData } = mutation.data;
        const { error } = await supabase
          .from('inspections')
          .update({ json_data: jsonData, updated_at: new Date().toISOString() })
          .eq('id', inspectionId);
        if (error) throw error;
        const { offlineInspectionDB } = await import('@/lib/offlineInspectionDB');
        await offlineInspectionDB.markInspectionSynced(inspectionId);
        break;
      }

      case 'SYNC_INSPECTION': {
        // `fields` carries the full record from an offline full-save (status,
        // quality_rating, project_name, json_data, …). Fall back to the legacy
        // json_data-only shape for any mutation queued before this change.
        const { id, json_data, fields } = mutation.data;
        const payload = { ...(fields ?? { json_data }) };

        // This save's json_data snapshot does not include offline-captured photos
        // (they upload separately). Merge back any photos already committed to the
        // server — by an UPLOAD_INSPECTION_IMAGE that drained in an earlier reconnect —
        // so this overwrite can't orphan them (cross-drain protection; orderQueueForSync
        // only covers same-drain ordering).
        if (payload.json_data) {
          const { data: row } = await supabase
            .from('inspections').select('json_data').eq('id', id).single();
          payload.json_data = mergeServerPhotos(row?.json_data, payload.json_data);
        }

        const { error } = await supabase.from('inspections')
          .update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        const { offlineInspectionDB } = await import('@/lib/offlineInspectionDB');
        await offlineInspectionDB.markInspectionSynced(id); // clears pending_changes in the cache
        break;
      }

      case 'UPLOAD_INSPECTION_IMAGE': {
        const { imageId, inspectionId, sectionKey, itemKey } = mutation.data;
        const { offlineInspectionDB } = await import('@/lib/offlineInspectionDB');

        // Read the blob from IndexedDB (NOT mutation.data.blob — that never survived the JSON queue).
        const images = await offlineInspectionDB.getInspectionImages(inspectionId);
        const image = images.find(i => i.id === imageId);
        if (!image) throw new Error(`UPLOAD_INSPECTION_IMAGE: image ${imageId} missing in offlineInspectionDB`);

        const fileExtension = (image.file_name?.split('.').pop()) || 'jpg';
        const filePath = `${inspectionId}/${sectionKey}/${itemKey || 'general'}/${imageId}.${fileExtension}`;

        const { error: uploadError } = await supabase.storage
          .from('inspection-photos').upload(filePath, image.blob, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('inspection-photos').getPublicUrl(filePath);

        // Link into the inspection's json_data via a server read-modify-write so it's never orphaned.
        const { data: row, error: readError } = await supabase
          .from('inspections').select('json_data').eq('id', inspectionId).single();
        if (readError) throw readError;
        const jsonData = { ...(row?.json_data || {}) } as Record<string, any>;
        const targetKey = itemKey || 'images';
        jsonData[sectionKey] = jsonData[sectionKey] || {};
        jsonData[sectionKey][targetKey] = jsonData[sectionKey][targetKey] || { photos: [] };
        jsonData[sectionKey][targetKey].photos = jsonData[sectionKey][targetKey].photos || [];
        if (!jsonData[sectionKey][targetKey].photos.includes(publicUrl)) {
          jsonData[sectionKey][targetKey].photos.push(publicUrl); // idempotent: no dupe URL on retry
        }
        const { error: updError } = await supabase.from('inspections')
          .update({ json_data: jsonData, updated_at: new Date().toISOString() }).eq('id', inspectionId);
        if (updError) throw updError;

        await offlineInspectionDB.markImageSynced(imageId, publicUrl);
        break;
      }

      default:
        console.warn('Unknown mutation type:', mutation.type);
    }
  };

  // Process queue when online
  const processQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    // Synchronous lock. If a drain is already running, ask it to run once more after it
    // finishes (covers an enqueue that lands mid-drain) and return — no concurrent drain.
    if (isDraining) { drainAgain = true; return; }
    isDraining = true;

    try {
      // Broadcast syncing state so EVERY mounted instance reflects it (the lock is
      // module-global; the spinner must be too). Inside try so the lock can never wedge.
      announceSyncing(true);

      // Ids attempted in THIS drain cycle. A coalesced re-pass (new items arrived) must
      // NOT re-attempt a failed item — that would burn its retry budget in a tight burst
      // and prematurely discard a mutation (deleting its blob) that a normally-spaced
      // retry would have synced.
      const attempted = new Set<string>();

      do {
        drainAgain = false;

        // Drain json_data overwrites (SYNC_INSPECTION) before appends
        // (UPLOAD_INSPECTION_IMAGE) so a full-save can't clobber a just-appended photo.
        const snapshot = orderQueueForSync(getQueue()).filter(m => !attempted.has(m.id));
        if (snapshot.length === 0) break;

        const succeeded = new Set<string>();
        const discarded = new Set<string>();
        const retried = new Map<string, QueuedMutation>();

        for (const mutation of snapshot) {
          attempted.add(mutation.id);
          try {
            await executeMutation(mutation);
            succeeded.add(mutation.id);
          } catch (error) {
            console.error('Failed to process mutation:', error);
            if (mutation.retries < MAX_RETRIES) {
              retried.set(mutation.id, { ...mutation, retries: mutation.retries + 1 });
            } else {
              // Permanent discard — delete any queued blob this mutation referenced.
              const d = (mutation.data ?? {}) as { blobId?: string; photoBlobId?: string };
              if (d.blobId) await offlineDB.deleteQueuedBlob(d.blobId);
              if (d.photoBlobId) await offlineDB.deleteQueuedBlob(d.photoBlobId);
              discarded.add(mutation.id);
              toast.error(`Failed to sync ${mutation.type} after ${MAX_RETRIES} attempts`);
            }
          }
        }

        // Reconcile against the CURRENT queue (not the snapshot) so anything enqueued
        // DURING this pass is preserved instead of clobbered. Drop succeeded + discarded;
        // apply retry increments to the rest (failed items stay, with bumped retries).
        const reconciled = getQueue()
          .filter(m => !succeeded.has(m.id) && !discarded.has(m.id))
          .map(m => retried.get(m.id) ?? m);
        saveQueue(reconciled);

        if (retried.size === 0 && discarded.size === 0 && succeeded.size > 0) {
          toast.success(`Synced ${succeeded.size} offline action${succeeded.size > 1 ? 's' : ''}`);
          queryClient.invalidateQueries();
        }

        // Loop only for genuinely-new items (not yet attempted this cycle) — never to
        // re-attempt a still-failed item (it waits for the next external drain trigger).
        if (getQueue().some(m => !attempted.has(m.id))) drainAgain = true;
      } while (drainAgain && navigator.onLine);
    } finally {
      isDraining = false;
      announceSyncing(false);
    }
  }, [getQueue, saveQueue, queryClient]);

  // Monitor online/offline status AND self-heal a stuck value. navigator.onLine can read `false`
  // transiently at mount (e.g. during a service-worker swap on a fresh deploy); since no 'online'
  // event fires when we're already online, listening only for transitions would leave the badge
  // stuck on "Offline". So we re-read navigator.onLine on mount, on focus/visibility, and on a
  // short interval — not only on the transition events. Toasts fire only on a genuine change.
  useEffect(() => {
    const sync = (announce: boolean) => {
      const next = navigator.onLine;
      setIsOnline(next); // React bails if unchanged — safe to call repeatedly
      if (announce && next !== wasOnline.current) {
        if (next) {
          toast.success('Back online! Syncing...', { duration: 2000 });
        } else {
          toast.warning('You are offline. Changes will be synced when connection is restored.', { duration: 4000 });
        }
      }
      wasOnline.current = next;
    };

    sync(false); // re-sync on mount — recovers a bad initial value
    const onOnline = () => sync(true);
    const onOffline = () => sync(true);
    const onWake = () => sync(false); // tab refocus / becomes visible → re-check quietly

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    const intervalId = window.setInterval(() => sync(false), 15000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
      window.clearInterval(intervalId);
    };
  }, []);

  // Process queue when coming back online
  useEffect(() => {
    if (isOnline) {
      processQueue();
    }
  }, [isOnline, processQueue]);

  // Drain promptly when any code enqueues a mutation (same-tab event from enqueueOfflineMutation /
  // queueMutation) — so mid-session edits don't wait for the next connectivity change.
  useEffect(() => {
    const onEnqueued = () => {
      setQueueSize(getQueue().length); // reflect the new item in the badge immediately, even offline
      if (navigator.onLine) processQueue();
    };
    window.addEventListener('offline-queue-updated', onEnqueued);
    return () => window.removeEventListener('offline-queue-updated', onEnqueued);
  }, [processQueue, getQueue]);

  // Mirror the module-global drain state into this instance so every mounted instance —
  // not just the one holding the lock — shows the correct syncing spinner/button state.
  useEffect(() => {
    const onState = (e: Event) => setIsSyncing(!!(e as CustomEvent).detail?.syncing);
    window.addEventListener('offline-sync-state', onState);
    return () => window.removeEventListener('offline-sync-state', onState);
  }, []);

  // Update queue size on mount
  useEffect(() => {
    setQueueSize(getQueue().length);
  }, [getQueue]);

  return {
    isOnline,
    queueSize,
    isSyncing,
    queueMutation,
    queueUpload,
    processQueue,
  };
}
