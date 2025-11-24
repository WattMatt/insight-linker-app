// IndexedDB wrapper for offline inspection storage
const DB_NAME = 'wm_compliance_offline';
const DB_VERSION = 1;

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

class OfflineDatabase {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
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
}

export const offlineDB = new OfflineDatabase();
