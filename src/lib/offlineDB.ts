// IndexedDB wrapper for offline inspection storage
const DB_NAME = 'wm_compliance_offline';
// v4: unified with offlineInspectionDB so both modules open the SAME db name at
// the SAME version with the SAME complete store set (see onupgradeneeded). Before
// this, offlineDB(v3) and offlineInspectionDB(v2) fought over one db name with
// divergent schemas, causing VersionError / missing object stores.
const DB_VERSION = 5; // v5: + queued_blobs store (blobs referenced by id, kept out of the localStorage queue)

export interface OfflineInspection {
  id: string;
  title: string;
  description: string | null;
  status: string;
  inspection_date: string | null;
  site_id: string;
  inspector_id?: string;
  created_at: string;
  synced: boolean;
}

export interface OfflineImage {
  id: string;
  inspection_id: string;
  blob: Blob;
  file_name: string;
  created_at: string;
  synced: boolean;
}

export interface OfflineSubsection {
  id: string;
  name: string;
  tenant_name: string | null;
  category: string;
  site_id: string;
  coc_number: string | null;
  coc_type: string | null;
  coc_status: string | null;
  coc_issue_date: string | null;
  meter_serial_number: string | null;
  metering_status: string | null;
  ct_ratio: string | null;
  is_coc_required: boolean;
  updated_at: string;
  synced: boolean;
}

export interface OfflineDocument {
  id: string;
  subsection_id: string;
  file_name: string;
  blob: Blob;
  category_id: string;
  uploaded_at: string;
  synced: boolean;
}

export interface OfflineFloorPlan {
  id: string;
  subsection_id: string;
  file_name: string;
  blob: Blob;
  uploaded_at: string;
  synced: boolean;
}

export interface OfflineFloorPlanPin {
  id: string;
  floor_plan_id: string;
  pin_number: number;
  x_position: number;
  y_position: number;
  pin_type: 'snag' | 'observation';
  title: string | null;
  notes: string | null;
  detailed_description: string | null;
  priority: string | null;
  status: string;
  assigned_contractor: string | null;
  stakeholders: string | null;
  package: string | null;
  due_date: string | null;
  photo_url: string | null;
  photo_blob: Blob | null;
  created_by: string | null;
  created_at: string;
  synced: boolean;
}

export type COCPhotoType = 'coc_document' | 'test_equipment_reading' | 'db_board' | 'installation_overview' | 'signature' | 'general_evidence';

export type OfflinePhotoType = COCPhotoType | 'inspection_finding' | 'inspection_snag' | 'floor_plan_pin' | 'floor_plan_overview' | 'site_progress' | 'document_scan';

export type OfflinePhotoContextType = 'coc' | 'inspection' | 'floor_plan' | 'site' | 'document';

export interface OfflinePhoto {
  id: string;
  context_type: OfflinePhotoContextType;
  context_id: string;
  secondary_context_id: string | null;
  photo_type: OfflinePhotoType;
  file_blob: Blob;
  file_name: string;
  file_size: number;
  thumbnail_blob: Blob | null;
  mime_type: string;
  captured_at: string;
  captured_by: string;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  synced: boolean;
  sync_error: string | null;
  retry_count: number;
  remote_url: string | null;
}

export interface OfflineMarkup {
  id: string;
  floor_plan_id: string;
  markup_type: 'line' | 'rectangle' | 'circle' | 'arrow' | 'text' | 'freehand';
  vector_data: string; // JSON string of shape data
  color: string;
  stroke_width: number;
  created_at: string;
  synced: boolean;
}

export interface OfflineMeasurement {
  id: string;
  floor_plan_id: string;
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
  value: number;
  unit: string;
  label: string | null;
  created_at: string;
  synced: boolean;
}

class OfflineDatabase {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        // If another tab/module triggers a version upgrade, close this handle so
        // we don't block it (and force a re-open on next use).
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Inspections store
        if (!db.objectStoreNames.contains('inspections')) {
          const inspectionStore = db.createObjectStore('inspections', { keyPath: 'id' });
          inspectionStore.createIndex('synced', 'synced', { unique: false });
          inspectionStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Images store
        if (!db.objectStoreNames.contains('images')) {
          const imageStore = db.createObjectStore('images', { keyPath: 'id' });
          imageStore.createIndex('inspection_id', 'inspection_id', { unique: false });
          imageStore.createIndex('synced', 'synced', { unique: false });
        }

        // Mutations queue store
        if (!db.objectStoreNames.contains('mutations')) {
          const mutationStore = db.createObjectStore('mutations', { keyPath: 'id' });
          mutationStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Subsections store
        if (!db.objectStoreNames.contains('subsections')) {
          const subsectionStore = db.createObjectStore('subsections', { keyPath: 'id' });
          subsectionStore.createIndex('synced', 'synced', { unique: false });
          subsectionStore.createIndex('site_id', 'site_id', { unique: false });
        }

        // Documents store
        if (!db.objectStoreNames.contains('documents')) {
          const documentStore = db.createObjectStore('documents', { keyPath: 'id' });
          documentStore.createIndex('subsection_id', 'subsection_id', { unique: false });
          documentStore.createIndex('synced', 'synced', { unique: false });
        }

        // Floor plans store
        if (!db.objectStoreNames.contains('floor_plans')) {
          const floorPlanStore = db.createObjectStore('floor_plans', { keyPath: 'id' });
          floorPlanStore.createIndex('subsection_id', 'subsection_id', { unique: false });
          floorPlanStore.createIndex('synced', 'synced', { unique: false });
        }

        // Floor plan pins store
        if (!db.objectStoreNames.contains('floor_plan_pins')) {
          const pinsStore = db.createObjectStore('floor_plan_pins', { keyPath: 'id' });
          pinsStore.createIndex('floor_plan_id', 'floor_plan_id', { unique: false });
          pinsStore.createIndex('synced', 'synced', { unique: false });
        }

        // Markups store
        if (!db.objectStoreNames.contains('markups')) {
          const markupsStore = db.createObjectStore('markups', { keyPath: 'id' });
          markupsStore.createIndex('floor_plan_id', 'floor_plan_id', { unique: false });
          markupsStore.createIndex('synced', 'synced', { unique: false });
        }

        // Measurements store
        if (!db.objectStoreNames.contains('measurements')) {
          const measurementsStore = db.createObjectStore('measurements', { keyPath: 'id' });
          measurementsStore.createIndex('floor_plan_id', 'floor_plan_id', { unique: false });
          measurementsStore.createIndex('synced', 'synced', { unique: false });
        }

        // Unified Offline Photos store (v3)
        if (!db.objectStoreNames.contains('offline_photos')) {
          const photosStore = db.createObjectStore('offline_photos', { keyPath: 'id' });
          photosStore.createIndex('context_type', 'context_type', { unique: false });
          photosStore.createIndex('context_id', 'context_id', { unique: false });
          photosStore.createIndex('secondary_context_id', 'secondary_context_id', { unique: false });
          photosStore.createIndex('synced', 'synced', { unique: false });
          photosStore.createIndex('photo_type', 'photo_type', { unique: false });
        }

        // v4: stores owned by offlineInspectionDB — created here too so the
        // complete schema exists regardless of which module opens the db first.
        if (!db.objectStoreNames.contains('inspection_cache')) {
          const cacheStore = db.createObjectStore('inspection_cache', { keyPath: 'id' });
          cacheStore.createIndex('synced', 'synced', { unique: false });
          cacheStore.createIndex('site_id', 'site_id', { unique: false });
          cacheStore.createIndex('cached_at', 'cached_at', { unique: false });
          cacheStore.createIndex('pending_changes', 'pending_changes', { unique: false });
        }
        if (!db.objectStoreNames.contains('inspection_images')) {
          const imagesStore = db.createObjectStore('inspection_images', { keyPath: 'id' });
          imagesStore.createIndex('inspection_id', 'inspection_id', { unique: false });
          imagesStore.createIndex('section_key', 'section_key', { unique: false });
          imagesStore.createIndex('synced', 'synced', { unique: false });
        }
        if (!db.objectStoreNames.contains('template_cache')) {
          const templateStore = db.createObjectStore('template_cache', { keyPath: 'id' });
          templateStore.createIndex('cached_at', 'cached_at', { unique: false });
        }

        // Queued upload blobs — referenced by id from the localStorage mutation queue
        // so File/Blob objects never go through JSON.stringify (which drops them to {}).
        if (!db.objectStoreNames.contains('queued_blobs')) {
          db.createObjectStore('queued_blobs', { keyPath: 'id' });
        }
      };
    });
  }

  // Inspections
  async saveInspection(inspection: OfflineInspection): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspections'], 'readwrite');
      const store = transaction.objectStore('inspections');
      const request = store.put(inspection);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedInspections(): Promise<OfflineInspection[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspections'], 'readonly');
      const store = transaction.objectStore('inspections');
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(false));
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markInspectionSynced(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspections'], 'readwrite');
      const store = transaction.objectStore('inspections');
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const inspection = getRequest.result;
        if (inspection) {
          inspection.synced = true;
          const putRequest = store.put(inspection);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteInspection(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspections'], 'readwrite');
      const store = transaction.objectStore('inspections');
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Images
  async saveImage(image: OfflineImage): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['images'], 'readwrite');
      const store = transaction.objectStore('images');
      const request = store.put(image);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedImages(): Promise<OfflineImage[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['images'], 'readonly');
      const store = transaction.objectStore('images');
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(false));
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markImageSynced(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['images'], 'readwrite');
      const store = transaction.objectStore('images');
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const image = getRequest.result;
        if (image) {
          image.synced = true;
          const putRequest = store.put(image);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteImage(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['images'], 'readwrite');
      const store = transaction.objectStore('images');
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // === Unified Offline Photos ===

  async saveOfflinePhoto(photo: OfflinePhoto): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['offline_photos'], 'readwrite');
      const store = tx.objectStore('offline_photos');
      const req = store.put(photo);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getOfflinePhoto(id: string): Promise<OfflinePhoto | undefined> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['offline_photos'], 'readonly');
      const req = tx.objectStore('offline_photos').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getOfflinePhotosByContext(contextType: OfflinePhotoContextType, contextId: string): Promise<OfflinePhoto[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['offline_photos'], 'readonly');
      const store = tx.objectStore('offline_photos');
      const index = store.index('context_id');
      const req = index.getAll(IDBKeyRange.only(contextId));
      req.onsuccess = () => {
        const results = (req.result as OfflinePhoto[]).filter(p => p.context_type === contextType);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getUnsyncedOfflinePhotos(): Promise<OfflinePhoto[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['offline_photos'], 'readonly');
      const index = tx.objectStore('offline_photos').index('synced');
      const req = index.getAll(IDBKeyRange.only(false));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteOfflinePhoto(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['offline_photos'], 'readwrite');
      const req = tx.objectStore('offline_photos').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // === Queued Blobs (v5) ===
  // Keeps File/Blob objects out of the localStorage mutation queue so they are
  // never silently dropped by JSON.stringify. Store the blob here and put only
  // the returned id into the mutation payload.

  async putQueuedBlob(blob: Blob, meta?: { fileName?: string; fileType?: string }): Promise<string> {
    if (!this.db) await this.init();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['queued_blobs'], 'readwrite');
      const req = tx.objectStore('queued_blobs').put({
        id,
        blob,
        fileName: meta?.fileName ?? null,
        fileType: meta?.fileType ?? blob.type ?? null,
        created_at: new Date().toISOString(),
      });
      // Resolve on COMMIT so a post-put abort (quota) can't hand back a blob id whose
      // data never persisted — the upload executor would then find nothing to send.
      tx.oncomplete = () => resolve(id);
      tx.onabort = () => reject(tx.error ?? new Error('putQueuedBlob transaction aborted'));
      req.onerror = () => reject(req.error);
    });
  }

  async getQueuedBlob(id: string): Promise<Blob | undefined> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['queued_blobs'], 'readonly');
      const req = tx.objectStore('queued_blobs').get(id);
      req.onsuccess = () => resolve(req.result ? (req.result.blob as Blob) : undefined);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteQueuedBlob(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['queued_blobs'], 'readwrite');
      const req = tx.objectStore('queued_blobs').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // Delete queued blobs that no mutation references AND that are older than the cutoff.
  // Orphans accumulate when a putQueuedBlob succeeds but its enqueue/delete didn't (app
  // crash, transaction error) — they'd otherwise grow IndexedDB unbounded. The age cutoff
  // protects a blob just put but not-yet-enqueued (putQueuedBlob then queueMutation are two
  // steps). Returns the number deleted.
  async cleanupOrphanedBlobs(referencedIds: Set<string>, olderThanIso: string): Promise<number> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['queued_blobs'], 'readwrite');
      const store = tx.objectStore('queued_blobs');
      const cursorReq = store.openCursor();
      let deleted = 0;

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return; // iteration done; resolve on tx.oncomplete
        const rec = cursor.value as { id: string; created_at?: string };
        const isOrphan = !referencedIds.has(rec.id);
        const isOld = !rec.created_at || rec.created_at < olderThanIso;
        if (isOrphan && isOld) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
      tx.oncomplete = () => resolve(deleted);
      tx.onabort = () => reject(tx.error ?? new Error('cleanupOrphanedBlobs transaction aborted'));
    });
  }
}

export const offlineDB = new OfflineDatabase();
