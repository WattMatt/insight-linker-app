import { useState, useEffect, useCallback, useRef } from 'react';
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
  // A8: set once retries hit MAX_RETRIES so we stop looping and surface the failure.
  sync_error?: string | null;
}

const QUEUE_KEY = 'offline_mutation_queue';
const MAX_RETRIES = 3;

// A2: keys on a mutation's `data` object whose values are Blob/File and therefore
// must be moved into IndexedDB (queue_blobs) rather than JSON.stringify-ed into {}.
// At enqueue we replace `<key>` with `<key>_blob_id` (a queue_blobs id). At flush we
// re-read the blob by that id, and delete it after a successful upload.
const BLOB_FIELDS = ['file', 'blob', 'photo'] as const;

// A2: walk a mutation payload, persist any top-level or pin.photo_blob binaries to
// queue_blobs, and replace them with `<key>_blob_id` references. Returns a shallow
// clone that is safe to JSON.stringify (no Blob/File survives). Synchronous-free of
// surprises: callers await this before pushing to the queue.
async function externalizeBlobs(data: any): Promise<any> {
  if (!data || typeof data !== 'object') return data;
  const out: any = { ...data };

  // Top-level binary fields (UPLOAD_IMAGE.file, UPLOAD_DOCUMENT.file,
  // UPLOAD_FLOOR_PLAN.file, UPLOAD_INSPECTION_IMAGE.blob, UPDATE_FLOOR_PLAN_PIN.photo).
  for (const key of BLOB_FIELDS) {
    if (out[key] instanceof Blob) {
      out[`${key}_blob_id`] = await offlineDB.putQueueBlob(out[key]);
      delete out[key];
    }
  }

  // ADD_FLOOR_PLAN_PIN carries the binary nested at data.pin.photo_blob.
  if (out.pin && typeof out.pin === 'object' && out.pin.photo_blob instanceof Blob) {
    const pin = { ...out.pin };
    pin.photo_blob_id = await offlineDB.putQueueBlob(pin.photo_blob);
    delete pin.photo_blob;
    out.pin = pin;
  }

  // BATCH_UPLOAD_INSPECTION_IMAGES carries an array of { blob, ... } entries.
  if (Array.isArray(out.images)) {
    out.images = await Promise.all(out.images.map(async (img: any) => {
      if (img && img.blob instanceof Blob) {
        const clone = { ...img };
        clone.blob_id = await offlineDB.putQueueBlob(img.blob);
        delete clone.blob;
        return clone;
      }
      return img;
    }));
  }

  return out;
}

// A8: derive a STABLE, deterministic UUID from an arbitrary offline id (e.g.
// "offline_doc_173..._0.5"). Server PK columns are uuid-typed, so we cannot insert
// the raw offline id. Hashing it into a fixed uuid means every retry of the same
// queued mutation targets the SAME row, so an upsert is idempotent (no duplicates).
// Uses SHA-256 → first 16 bytes → RFC-4122 v5-shaped uuid (deterministic, not random).
async function deterministicUuid(seed: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)));
  const b = bytes.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC-4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// A2: collect every queue_blobs id referenced by a mutation so we can delete them
// all once the mutation has been fully processed (success) or permanently dropped.
function collectBlobIds(data: any): string[] {
  if (!data || typeof data !== 'object') return [];
  const ids: string[] = [];
  for (const key of BLOB_FIELDS) {
    if (typeof data[`${key}_blob_id`] === 'string') ids.push(data[`${key}_blob_id`]);
  }
  if (data.pin && typeof data.pin.photo_blob_id === 'string') ids.push(data.pin.photo_blob_id);
  if (Array.isArray(data.images)) {
    for (const img of data.images) {
      if (img && typeof img.blob_id === 'string') ids.push(img.blob_id);
    }
  }
  return ids;
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueSize, setQueueSize] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();
  // A7: ref-based concurrency guard (mirrors useOfflinePhotos.syncingRef). Unlike the
  // old `isSyncing` React state, a ref is read synchronously and is not captured stale
  // by the processQueue closure, so overlapping triggers (online event + effect +
  // manual button) cannot double-flush the same queue.
  const syncingRef = useRef(false);

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

  // Add mutation to queue. A2: binaries are externalized to queue_blobs first so the
  // localStorage entry only ever holds blob ids — never the bytes (which JSON.stringify
  // would silently turn into {}, destroying the image).
  const queueMutation = useCallback(async (type: string, data: any) => {
    const safeData = await externalizeBlobs(data);
    const queue = getQueue();
    const mutation: QueuedMutation = {
      id: crypto.randomUUID(),
      type,
      data: safeData,
      timestamp: Date.now(),
      retries: 0,
      sync_error: null,
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
        // A2: file lives in queue_blobs; re-read it by id at flush time.
        const { bucket, path, file_blob_id, inspectionId } = mutation.data;
        const file = file_blob_id ? await offlineDB.getQueueBlob(file_blob_id) : null;
        if (!file) throw new Error('UPLOAD_IMAGE: missing blob in queue_blobs');
        // A8: upsert so a retry after a partial failure overwrites rather than 409s.
        const { error } = await supabase.storage
          .from(bucket)
          .upload(path, file, { upsert: true });
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
        // A2: file re-read from queue_blobs. A8: deterministic row id + upserts so a
        // retry (after a partial storage/DB failure) targets the same path and row.
        const { documentId, subsectionId, categoryId, file_blob_id, filePath, fileName, fileSize } = mutation.data;
        const file = file_blob_id ? await offlineDB.getQueueBlob(file_blob_id) : null;
        if (!file) throw new Error('UPLOAD_DOCUMENT: missing blob in queue_blobs');

        // Upload to storage (upsert so a retry overwrites the same object).
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        // A8: deterministic uuid from the offline documentId → idempotent row write.
        const rowId = await deterministicUuid(documentId);
        const { error: dbError } = await supabase
          .from('subsection_documents')
          .upsert({
            id: rowId,
            subsection_id: subsectionId,
            category_id: categoryId,
            file_name: fileName,
            file_url: publicUrl,
            file_size: fileSize,
          });
        if (dbError) throw dbError;

        // Mark as synced in IndexedDB
        const { markDocumentSynced } = await import('@/lib/offlineDBExtensions');
        await markDocumentSynced(documentId);
        break;
      }

      case 'UPLOAD_FLOOR_PLAN': {
        // A2: file re-read from queue_blobs. A8: deterministic row id + upserts.
        const { floorPlanId, subsectionId, file_blob_id, filePath, fileName } = mutation.data;
        const file = file_blob_id ? await offlineDB.getQueueBlob(file_blob_id) : null;
        if (!file) throw new Error('UPLOAD_FLOOR_PLAN: missing blob in queue_blobs');

        // Upload to storage (upsert so a retry overwrites the same object).
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        // A8: deterministic uuid from the offline floorPlanId → idempotent row write.
        const rowId = await deterministicUuid(floorPlanId);
        const { error: dbError } = await supabase
          .from('subsection_floor_plans')
          .upsert({
            id: rowId,
            subsection_id: subsectionId,
            file_name: fileName,
            file_url: publicUrl,
          });
        if (dbError) throw dbError;

        // Mark as synced in IndexedDB
        const { markFloorPlanSynced } = await import('@/lib/offlineDBExtensions');
        await markFloorPlanSynced(floorPlanId);
        break;
      }

      case 'ADD_FLOOR_PLAN_PIN': {
        const { pin } = mutation.data;
        const { markPinSynced } = await import('@/lib/offlineFloorPlanDB');

        // A2: photo (if any) re-read from queue_blobs. A8: deterministic storage path
        // (keyed by the offline pin id, no Date.now()) + upsert so a retry overwrites
        // the same object instead of leaving an orphaned duplicate upload behind.
        let photoUrl = pin.photo_url;
        if (pin.photo_blob_id) {
          const photoBlob = await offlineDB.getQueueBlob(pin.photo_blob_id);
          if (photoBlob) {
            const fileName = `floor-plan-pins/${pin.floor_plan_id}/${pin.id}_photo.jpg`;
            const { error: upErr } = await supabase.storage
              .from('inspection-photos')
              .upload(fileName, photoBlob, { upsert: true });
            if (upErr) throw upErr;

            const { data: { publicUrl } } = supabase.storage
              .from('inspection-photos')
              .getPublicUrl(fileName);
            photoUrl = publicUrl;
          }
        }

        // A8: deterministic uuid from the offline pin id → upsert is idempotent,
        // so a retry after a partial failure does not create a duplicate pin row.
        const rowId = await deterministicUuid(pin.id);
        const { error: dbError } = await supabase
          .from('floor_plan_pins')
          .upsert({
            id: rowId,
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
        if (dbError) throw dbError;

        await markPinSynced(pin.id);
        break;
      }

      case 'UPDATE_FLOOR_PLAN_PIN': {
        // A2: photo re-read from queue_blobs. A8: deterministic storage path (keyed by
        // pinId, no Date.now()) + upsert so a retry overwrites the same object. The row
        // write is an .update() on an existing uuid pinId — already idempotent.
        const { pinId, updates, photoFileName, photo_blob_id } = mutation.data;
        const { markPinSynced } = await import('@/lib/offlineFloorPlanDB');

        let photoUrl = updates.photo_url;
        if (photo_blob_id) {
          const photoBlob = await offlineDB.getQueueBlob(photo_blob_id);
          if (photoBlob) {
            const fileName = `floor-plan-pins/${pinId}/${photoFileName || 'photo.jpg'}`;
            const { error: upErr } = await supabase.storage
              .from('inspection-photos')
              .upload(fileName, photoBlob, { upsert: true });
            if (upErr) throw upErr;

            const { data: { publicUrl } } = supabase.storage
              .from('inspection-photos')
              .getPublicUrl(fileName);
            photoUrl = publicUrl;
          }
        }

        const { error: dbError } = await supabase
          .from('floor_plan_pins')
          .update({
            ...updates,
            photo_url: photoUrl,
          })
          .eq('id', pinId);
        if (dbError) throw dbError;

        await markPinSynced(pinId);
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

      case 'SAVE_INSPECTION_JSON': {
        // A9: stop blind last-write-wins. Before overwriting the whole server
        // json_data, read the server row's updated_at and compare it to the moment the
        // offline edit was captured (editedAt). If the server is NEWER, someone changed
        // the inspection after we went offline — overwriting would clobber their work.
        // We skip the write, flag a conflict for manual review, and warn. This is
        // deliberately CONSERVATIVE: no deep merge (the json shape is item-keyed and
        // merging risks silent corruption — that needs a product decision).
        const { inspectionId, jsonData, editedAt } = mutation.data;
        const { offlineInspectionDB } = await import('@/lib/offlineInspectionDB');

        // Resolve the baseline timestamp the offline edit was made against.
        // Prefer editedAt threaded from the producer; otherwise fall back to the
        // locally cached inspection's last_modified.
        // LIMITATION: if neither is available we proceed with the overwrite (legacy
        // behaviour) rather than block a legitimate save — documented for device review.
        let baseline = editedAt as string | undefined;
        if (!baseline) {
          const cached = await offlineInspectionDB.getCachedInspection(inspectionId);
          baseline = cached?.last_modified;
        }

        const { data: serverRow, error: readErr } = await supabase
          .from('inspections')
          .select('updated_at')
          .eq('id', inspectionId)
          .single();
        if (readErr) throw readErr;

        if (baseline && serverRow?.updated_at &&
            new Date(serverRow.updated_at).getTime() > new Date(baseline).getTime()) {
          // Conflict: server changed after this offline edit. Do NOT overwrite.
          console.warn(
            `[OfflineSync] SAVE_INSPECTION_JSON conflict for ${inspectionId}: ` +
            `server updated_at (${serverRow.updated_at}) is newer than offline edit ` +
            `baseline (${baseline}). Skipping overwrite — manual review required.`
          );
          mutation.sync_error = 'conflict: server newer than offline edit';
          // Throwing routes this into the retry/flag path; once retries are exhausted
          // it is dropped (logged) instead of looping or silently clobbering.
          throw new Error('SAVE_INSPECTION_JSON conflict: server is newer than offline edit');
        }

        const { error } = await supabase
          .from('inspections')
          .update({
            json_data: jsonData,
            updated_at: new Date().toISOString()
          })
          .eq('id', inspectionId);
        if (error) throw error;

        // Mark as synced in IndexedDB
        await offlineInspectionDB.markInspectionSynced(inspectionId);
        break;
      }

      case 'UPLOAD_INSPECTION_IMAGE': {
        // A2: blob re-read from queue_blobs (was destroyed by JSON.stringify before).
        const { imageId, inspectionId, sectionKey, itemKey, blob_id, fileName } = mutation.data;
        const blob = blob_id ? await offlineDB.getQueueBlob(blob_id) : null;
        if (!blob) throw new Error('UPLOAD_INSPECTION_IMAGE: missing blob in queue_blobs');
        const { offlineInspectionDB } = await import('@/lib/offlineInspectionDB');

        // Get cached inspection for context (client/site/subsection names)
        const cachedInspection = await offlineInspectionDB.getCachedInspection(inspectionId);

        // A8: DETERMINISTIC storage path keyed by the stable offline imageId (NOT
        // Date.now()). generateInspectionImagePath() stamps Date.now() into the file
        // name, so a retry would land at a NEW path and produce a NEW public URL —
        // defeating the de-dupe below and re-uploading the same photo. Anchoring the
        // file name to imageId makes the path (and therefore the URL) stable across
        // retries, so upsert + includes() de-dupe are genuinely idempotent.
        const fileExtension = fileName.split('.').pop() || 'jpg';
        const filePath = `${inspectionId}/${sectionKey}/${itemKey || 'general'}/${imageId}.${fileExtension}`;

        console.log('[OfflineSync] Uploading image with path:', filePath);

        // A8: upsert so a retry (after a partial failure) overwrites the same object
        // and yields the same deterministic public URL — no orphaned duplicate upload.
        const { error: uploadError } = await supabase.storage
          .from('inspection-photos')
          .upload(filePath, blob, { upsert: true });
        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('inspection-photos')
          .getPublicUrl(filePath);

        // Update the inspection's json_data with the new image URL.
        // A8: de-dupe — only push the URL if it is not already present, so a retry
        // (filePath is deterministic, so publicUrl is stable) doesn't append twice.
        if (cachedInspection) {
          const updatedJsonData = { ...cachedInspection.json_data };
          if (!updatedJsonData[sectionKey]) {
            updatedJsonData[sectionKey] = {};
          }
          const targetKey = itemKey || 'images';
          if (!updatedJsonData[sectionKey][targetKey]) {
            updatedJsonData[sectionKey][targetKey] = { photos: [] };
          }
          if (!updatedJsonData[sectionKey][targetKey].photos) {
            updatedJsonData[sectionKey][targetKey].photos = [];
          }
          const photos: string[] = updatedJsonData[sectionKey][targetKey].photos;
          if (!photos.includes(publicUrl)) {
            photos.push(publicUrl);

            // Update inspection in Supabase (only when we actually added a URL).
            await supabase
              .from('inspections')
              .update({
                json_data: updatedJsonData,
                updated_at: new Date().toISOString()
              })
              .eq('id', inspectionId);
          }
        }

        // Mark image as synced
        await offlineInspectionDB.markImageSynced(imageId, publicUrl);
        console.log('[OfflineSync] Image synced successfully:', publicUrl);
        break;
      }

      case 'BATCH_UPLOAD_INSPECTION_IMAGES': {
        const { inspectionId, images } = mutation.data;
        const { offlineInspectionDB } = await import('@/lib/offlineInspectionDB');

        for (let index = 0; index < images.length; index++) {
          const image = images[index];
          // A2: each image's blob re-read from queue_blobs by its blob_id.
          const blob = image.blob_id ? await offlineDB.getQueueBlob(image.blob_id) : null;
          if (!blob) {
            console.warn('[OfflineSync] BATCH image missing blob in queue_blobs, skipping:', image.id);
            continue;
          }
          const fileExtension = image.fileName.split('.').pop() || 'jpg';

          // A8: DETERMINISTIC path keyed by the stable image.id (NOT Date.now()/index),
          // so a retry overwrites the same object via upsert instead of duplicating it.
          const filePath = `${inspectionId}/${image.sectionKey}/${image.itemKey || 'general'}/${image.id}.${fileExtension}`;

          const { error: uploadError } = await supabase.storage
            .from('inspection-photos')
            .upload(filePath, blob, { upsert: true });

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('inspection-photos')
              .getPublicUrl(filePath);
            await offlineInspectionDB.markImageSynced(image.id, publicUrl);
            console.log('[OfflineSync] Batch image synced:', filePath);
          }
        }
        break;
      }

      default:
        console.warn('Unknown mutation type:', mutation.type);
    }
  };

  // Process queue when online.
  //
  // A7 — snapshot-safe, read-modify-write keyed by id:
  //   The OLD code read getQueue() once, then at the end did saveQueue(failedMutations),
  //   which OVERWROTE the whole queue — silently destroying any mutation enqueued while
  //   the flush was running. We now snapshot the queue for processing, but at the end we
  //   RE-READ the current queue and only mutate the entries we processed (remove the
  //   succeeded/dropped ids, bump retries on retryable failures), preserving everything
  //   else — including items enqueued mid-flush.
  //
  // Concurrency is guarded by syncingRef (a ref, read synchronously) instead of the
  // isSyncing React state, so two near-simultaneous triggers can't both pass the guard.
  const processQueue = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setIsSyncing(true);

    try {
      const snapshot = getQueue();
      if (snapshot.length === 0) return;

      // ids of mutations to REMOVE from the queue afterwards (succeeded OR permanently
      // dropped after MAX_RETRIES). Map of id -> {retries, sync_error} for retryable
      // failures so we update them in place without clobbering newer fields.
      const removeIds = new Set<string>();
      const retryUpdates = new Map<string, { retries: number; sync_error: string }>();
      const blobIdsToDelete: string[] = [];
      let successCount = 0;

      for (const mutation of snapshot) {
        // Break the loop if we drop offline mid-flush (mirrors useOfflinePhotos).
        if (!navigator.onLine) break;

        try {
          await executeMutation(mutation);
          console.log('Successfully synced mutation:', mutation.type);
          removeIds.add(mutation.id);
          blobIdsToDelete.push(...collectBlobIds(mutation.data));
          successCount++;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          console.error('Failed to process mutation:', mutation.type, error);

          if (mutation.retries + 1 < MAX_RETRIES) {
            // Still retryable: bump the counter + persist the error, leave it queued.
            retryUpdates.set(mutation.id, { retries: mutation.retries + 1, sync_error: message });
          } else {
            // A8: cap reached — STOP retrying. Drop it (so it can't loop forever) but log
            // exactly what was dropped, and clean up its orphaned blobs. The mutation's
            // sync_error is already surfaced; nothing is silently lost without a trace.
            console.error(
              `[OfflineSync] DROPPING ${mutation.type} (id=${mutation.id}) after ${MAX_RETRIES} attempts. ` +
              `Last error: ${message}. Payload:`, mutation.data
            );
            toast.error(`Failed to sync ${mutation.type} after ${MAX_RETRIES} attempts`);
            removeIds.add(mutation.id);
            blobIdsToDelete.push(...collectBlobIds(mutation.data));
          }
        }
      }

      // A7: read-modify-write. Re-read the CURRENT queue (it may have grown mid-flush),
      // then rebuild it preserving untouched + newly-enqueued items.
      const current = getQueue();
      const next = current
        .filter((m) => !removeIds.has(m.id))
        .map((m) => {
          const upd = retryUpdates.get(m.id);
          return upd ? { ...m, retries: upd.retries, sync_error: upd.sync_error } : m;
        });
      saveQueue(next);

      // Clean up queue_blobs for everything we removed (success or permanent drop).
      for (const blobId of blobIdsToDelete) {
        try {
          await offlineDB.deleteQueueBlob(blobId);
        } catch (e) {
          console.warn('[OfflineSync] Failed to delete queue blob', blobId, e);
        }
      }

      if (successCount > 0) {
        toast.success(`Synced ${successCount} offline action${successCount > 1 ? 's' : ''}`);
        queryClient.invalidateQueries();
      }
    } catch (error) {
      console.error('[OfflineSync] processQueue error:', error);
    } finally {
      setIsSyncing(false);
      syncingRef.current = false;
    }
  }, [getQueue, saveQueue, queryClient]);

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
