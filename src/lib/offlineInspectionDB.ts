// Extended IndexedDB storage for offline inspection functionality
const DB_NAME = 'wm_compliance_offline';
// MUST match offlineDB.ts DB_VERSION. Both modules share this db name and create
// the SAME complete store set, so neither clobbers the other's schema and there is
// no version skew (a lower version here throws VersionError when offlineDB — which
// mounts first via the app-root useOfflineSync — has already created the db at v5).
const DB_VERSION = 5;

export interface CachedInspection {
  id: string;
  title: string;
  status: string;
  inspection_date: string | null;
  site_id: string;
  subsection_id: string | null;
  inspector_name: string | null;
  json_data: any;
  template: any | null;
  template_id: string | null;
  template_category: string | null;
  site_data: {
    clientName: string;
    siteName: string;
    physicalAddress: string | null;
    siteImageUrl: string | null;
    clientLogoUrl: string | null;
  } | null;
  subsection_data: {
    name: string;
  } | null;
  cached_at: string;
  last_modified: string;
  synced: boolean;
  pending_changes: boolean;
}

export interface OfflineInspectionImage {
  id: string;
  inspection_id: string;
  section_key: string;
  item_key: string | null;
  blob: Blob;
  file_name: string;
  created_at: string;
  synced: boolean;
  uploaded_url: string | null;
}

export interface CachedTemplate {
  id: string;
  name: string;
  category: string;
  sections: any;
  cached_at: string;
}

class OfflineInspectionDatabase {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    const promise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        // Close on a version change triggered elsewhere so we don't block it.
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        console.log(`Upgrading IndexedDB from version ${oldVersion} to ${DB_VERSION}`);

        // v4: create the full store set idempotently on every upgrade so the
        // schema is complete regardless of the db's prior version or which module
        // opened it first. (Shared with offlineDB.ts — keep the two in sync.)
        {
          if (!db.objectStoreNames.contains('inspections')) {
            const inspectionStore = db.createObjectStore('inspections', { keyPath: 'id' });
            inspectionStore.createIndex('synced', 'synced', { unique: false });
            inspectionStore.createIndex('created_at', 'created_at', { unique: false });
          }
          if (!db.objectStoreNames.contains('images')) {
            const imageStore = db.createObjectStore('images', { keyPath: 'id' });
            imageStore.createIndex('inspection_id', 'inspection_id', { unique: false });
            imageStore.createIndex('synced', 'synced', { unique: false });
          }
          if (!db.objectStoreNames.contains('mutations')) {
            const mutationStore = db.createObjectStore('mutations', { keyPath: 'id' });
            mutationStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
          if (!db.objectStoreNames.contains('subsections')) {
            const subsectionStore = db.createObjectStore('subsections', { keyPath: 'id' });
            subsectionStore.createIndex('synced', 'synced', { unique: false });
            subsectionStore.createIndex('site_id', 'site_id', { unique: false });
          }
          if (!db.objectStoreNames.contains('documents')) {
            const documentStore = db.createObjectStore('documents', { keyPath: 'id' });
            documentStore.createIndex('subsection_id', 'subsection_id', { unique: false });
            documentStore.createIndex('synced', 'synced', { unique: false });
          }
          if (!db.objectStoreNames.contains('floor_plans')) {
            const floorPlanStore = db.createObjectStore('floor_plans', { keyPath: 'id' });
            floorPlanStore.createIndex('subsection_id', 'subsection_id', { unique: false });
            floorPlanStore.createIndex('synced', 'synced', { unique: false });
          }
          if (!db.objectStoreNames.contains('floor_plan_pins')) {
            const pinsStore = db.createObjectStore('floor_plan_pins', { keyPath: 'id' });
            pinsStore.createIndex('floor_plan_id', 'floor_plan_id', { unique: false });
            pinsStore.createIndex('synced', 'synced', { unique: false });
          }
          if (!db.objectStoreNames.contains('markups')) {
            const markupsStore = db.createObjectStore('markups', { keyPath: 'id' });
            markupsStore.createIndex('floor_plan_id', 'floor_plan_id', { unique: false });
            markupsStore.createIndex('synced', 'synced', { unique: false });
          }
          if (!db.objectStoreNames.contains('measurements')) {
            const measurementsStore = db.createObjectStore('measurements', { keyPath: 'id' });
            measurementsStore.createIndex('floor_plan_id', 'floor_plan_id', { unique: false });
            measurementsStore.createIndex('synced', 'synced', { unique: false });
          }
        }

        {
          // Inspection cache - full inspection data for offline access
          if (!db.objectStoreNames.contains('inspection_cache')) {
            const cacheStore = db.createObjectStore('inspection_cache', { keyPath: 'id' });
            cacheStore.createIndex('synced', 'synced', { unique: false });
            cacheStore.createIndex('site_id', 'site_id', { unique: false });
            cacheStore.createIndex('cached_at', 'cached_at', { unique: false });
            cacheStore.createIndex('pending_changes', 'pending_changes', { unique: false });
          }

          // Inspection images - images captured during inspection
          if (!db.objectStoreNames.contains('inspection_images')) {
            const imagesStore = db.createObjectStore('inspection_images', { keyPath: 'id' });
            imagesStore.createIndex('inspection_id', 'inspection_id', { unique: false });
            imagesStore.createIndex('section_key', 'section_key', { unique: false });
            imagesStore.createIndex('synced', 'synced', { unique: false });
          }

          // Template cache - inspection templates for offline use
          if (!db.objectStoreNames.contains('template_cache')) {
            const templateStore = db.createObjectStore('template_cache', { keyPath: 'id' });
            templateStore.createIndex('cached_at', 'cached_at', { unique: false });
          }

          // v5: Queued upload blobs — referenced by id from the localStorage mutation
          // queue so File/Blob objects never go through JSON.stringify (which drops
          // them to {}). Owned by offlineDB.ts; created here too so the complete schema
          // exists regardless of which module opens the shared db first.
          if (!db.objectStoreNames.contains('queued_blobs')) {
            db.createObjectStore('queued_blobs', { keyPath: 'id' });
          }
        }

        // v4: stores owned by offlineDB.ts — created here too so the complete
        // schema exists regardless of which module opens the db first.
        if (!db.objectStoreNames.contains('coc_compliance_photos')) {
          const cocPhotosStore = db.createObjectStore('coc_compliance_photos', { keyPath: 'id' });
          cocPhotosStore.createIndex('subsection_id', 'subsection_id', { unique: false });
          cocPhotosStore.createIndex('coc_validation_id', 'coc_validation_id', { unique: false });
          cocPhotosStore.createIndex('synced', 'synced', { unique: false });
        }
        if (!db.objectStoreNames.contains('offline_photos')) {
          const photosStore = db.createObjectStore('offline_photos', { keyPath: 'id' });
          photosStore.createIndex('context_type', 'context_type', { unique: false });
          photosStore.createIndex('context_id', 'context_id', { unique: false });
          photosStore.createIndex('secondary_context_id', 'secondary_context_id', { unique: false });
          photosStore.createIndex('synced', 'synced', { unique: false });
          photosStore.createIndex('photo_type', 'photo_type', { unique: false });
        }
      };
    });

    this.initPromise = promise;
    // C4: on failure, drop the cached promise so a later init() retries with a fresh
    // open instead of permanently re-returning this rejection (a single transient
    // open failure must not kill offline storage for the whole session). Guard the
    // identity check so a concurrent retry's promise isn't clobbered.
    promise.catch(() => {
      if (this.initPromise === promise) this.initPromise = null;
    });
    return promise;
  }

  // ============ Inspection Cache Methods ============

  async cacheInspection(inspection: CachedInspection): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspection_cache'], 'readwrite');
      const store = transaction.objectStore('inspection_cache');
      const request = store.put(inspection);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedInspection(id: string): Promise<CachedInspection | null> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspection_cache'], 'readonly');
      const store = transaction.objectStore('inspection_cache');
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllCachedInspections(): Promise<CachedInspection[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspection_cache'], 'readonly');
      const store = transaction.objectStore('inspection_cache');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedInspectionsBySite(siteId: string): Promise<CachedInspection[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspection_cache'], 'readonly');
      const store = transaction.objectStore('inspection_cache');
      const index = store.index('site_id');
      const request = index.getAll(IDBKeyRange.only(siteId));
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedInspections(): Promise<CachedInspection[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspection_cache'], 'readonly');
      const store = transaction.objectStore('inspection_cache');
      const index = store.index('pending_changes');
      const request = index.getAll(IDBKeyRange.only(true));
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async markInspectionSynced(id: string): Promise<void> {
    if (!this.db) await this.init();
    const inspection = await this.getCachedInspection(id);
    if (inspection) {
      inspection.synced = true;
      inspection.pending_changes = false;
      await this.cacheInspection(inspection);
    }
  }

  async updateCachedInspectionData(id: string, jsonData: any): Promise<void> {
    if (!this.db) await this.init();
    const inspection = await this.getCachedInspection(id);
    if (inspection) {
      inspection.json_data = jsonData;
      inspection.last_modified = new Date().toISOString();
      inspection.pending_changes = true;
      inspection.synced = false;
      await this.cacheInspection(inspection);
    }
  }

  async deleteCachedInspection(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspection_cache'], 'readwrite');
      const store = transaction.objectStore('inspection_cache');
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async isInspectionCached(id: string): Promise<boolean> {
    const inspection = await this.getCachedInspection(id);
    return inspection !== null;
  }

  // LRU eviction - keep only the most recent N inspections
  async evictOldInspections(maxCount: number = 50): Promise<number> {
    if (!this.db) await this.init();
    const allInspections = await this.getAllCachedInspections();
    
    if (allInspections.length <= maxCount) return 0;

    // Sort by cached_at descending (most recent first)
    allInspections.sort((a, b) => 
      new Date(b.cached_at).getTime() - new Date(a.cached_at).getTime()
    );

    // Keep only inspections without pending changes, or the most recent ones
    const toKeep = allInspections.slice(0, maxCount);
    const toEvict = allInspections.slice(maxCount).filter(i => !i.pending_changes);

    for (const inspection of toEvict) {
      await this.deleteCachedInspection(inspection.id);
      // Also delete associated images
      await this.deleteInspectionImages(inspection.id);
    }

    return toEvict.length;
  }

  // ============ Inspection Images Methods ============

  async saveInspectionImage(image: OfflineInspectionImage): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspection_images'], 'readwrite');
      const store = transaction.objectStore('inspection_images');
      const request = store.put(image);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getInspectionImages(inspectionId: string, sectionKey?: string): Promise<OfflineInspectionImage[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspection_images'], 'readonly');
      const store = transaction.objectStore('inspection_images');
      const index = store.index('inspection_id');
      const request = index.getAll(IDBKeyRange.only(inspectionId));
      
      request.onsuccess = () => {
        let results = request.result || [];
        if (sectionKey) {
          results = results.filter(img => img.section_key === sectionKey);
        }
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedImages(): Promise<OfflineInspectionImage[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspection_images'], 'readonly');
      const store = transaction.objectStore('inspection_images');
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(false));
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async markImageSynced(id: string, uploadedUrl: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspection_images'], 'readwrite');
      const store = transaction.objectStore('inspection_images');
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const image = getRequest.result;
        if (image) {
          image.synced = true;
          image.uploaded_url = uploadedUrl;
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

  async deleteInspectionImage(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['inspection_images'], 'readwrite');
      const store = transaction.objectStore('inspection_images');
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteInspectionImages(inspectionId: string): Promise<void> {
    const images = await this.getInspectionImages(inspectionId);
    for (const image of images) {
      await this.deleteInspectionImage(image.id);
    }
  }

  // ============ Template Cache Methods ============

  async cacheTemplate(template: CachedTemplate): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['template_cache'], 'readwrite');
      const store = transaction.objectStore('template_cache');
      const request = store.put(template);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedTemplate(id: string): Promise<CachedTemplate | null> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['template_cache'], 'readonly');
      const store = transaction.objectStore('template_cache');
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllCachedTemplates(): Promise<CachedTemplate[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['template_cache'], 'readonly');
      const store = transaction.objectStore('template_cache');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteCachedTemplate(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['template_cache'], 'readwrite');
      const store = transaction.objectStore('template_cache');
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // LRU eviction for templates
  async evictOldTemplates(maxCount: number = 20): Promise<number> {
    if (!this.db) await this.init();
    const allTemplates = await this.getAllCachedTemplates();
    
    if (allTemplates.length <= maxCount) return 0;

    // Sort by cached_at descending
    allTemplates.sort((a, b) => 
      new Date(b.cached_at).getTime() - new Date(a.cached_at).getTime()
    );

    const toEvict = allTemplates.slice(maxCount);
    for (const template of toEvict) {
      await this.deleteCachedTemplate(template.id);
    }

    return toEvict.length;
  }

  // ============ Storage Quota Methods ============

  async getStorageEstimate(): Promise<{ used: number; quota: number; percentage: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (used / quota) * 100 : 0;
      return { used, quota, percentage };
    }
    return { used: 0, quota: 0, percentage: 0 };
  }

  async getCacheStats(): Promise<{
    inspectionCount: number;
    imageCount: number;
    templateCount: number;
    pendingChanges: number;
    unsyncedImages: number;
  }> {
    const inspections = await this.getAllCachedInspections();
    const templates = await this.getAllCachedTemplates();
    const unsyncedImages = await this.getUnsyncedImages();
    const pendingInspections = inspections.filter(i => i.pending_changes);

    let totalImages = 0;
    for (const insp of inspections) {
      const images = await this.getInspectionImages(insp.id);
      totalImages += images.length;
    }

    return {
      inspectionCount: inspections.length,
      imageCount: totalImages,
      templateCount: templates.length,
      pendingChanges: pendingInspections.length,
      unsyncedImages: unsyncedImages.length
    };
  }
}

export const offlineInspectionDB = new OfflineInspectionDatabase();
