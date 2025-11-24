// Extended IndexedDB operations for subsections, documents, and floor plans
import { offlineDB } from './offlineDB';
import type { OfflineSubsection, OfflineDocument, OfflineFloorPlan } from './offlineDB';

// Subsection operations
export async function saveSubsection(subsection: OfflineSubsection): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['subsections'], 'readwrite');
    const store = transaction.objectStore('subsections');
    const request = store.put(subsection);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getSubsection(id: string): Promise<OfflineSubsection | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['subsections'], 'readonly');
    const store = transaction.objectStore('subsections');
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getUnsyncedSubsections(): Promise<OfflineSubsection[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['subsections'], 'readonly');
    const store = transaction.objectStore('subsections');
    const index = store.index('synced');
    const request = index.getAll(IDBKeyRange.only(false));
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function markSubsectionSynced(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['subsections'], 'readwrite');
    const store = transaction.objectStore('subsections');
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const subsection = getRequest.result;
      if (subsection) {
        subsection.synced = true;
        const putRequest = store.put(subsection);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Document operations
export async function saveDocument(document: OfflineDocument): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['documents'], 'readwrite');
    const store = transaction.objectStore('documents');
    const request = store.put(document);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getUnsyncedDocuments(): Promise<OfflineDocument[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['documents'], 'readonly');
    const store = transaction.objectStore('documents');
    const index = store.index('synced');
    const request = index.getAll(IDBKeyRange.only(false));
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getSubsectionDocuments(subsectionId: string): Promise<OfflineDocument[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['documents'], 'readonly');
    const store = transaction.objectStore('documents');
    const index = store.index('subsection_id');
    const request = index.getAll(IDBKeyRange.only(subsectionId));
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function markDocumentSynced(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['documents'], 'readwrite');
    const store = transaction.objectStore('documents');
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const document = getRequest.result;
      if (document) {
        document.synced = true;
        const putRequest = store.put(document);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['documents'], 'readwrite');
    const store = transaction.objectStore('documents');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Floor plan operations
export async function saveFloorPlan(floorPlan: OfflineFloorPlan): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['floor_plans'], 'readwrite');
    const store = transaction.objectStore('floor_plans');
    const request = store.put(floorPlan);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getUnsyncedFloorPlans(): Promise<OfflineFloorPlan[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['floor_plans'], 'readonly');
    const store = transaction.objectStore('floor_plans');
    const index = store.index('synced');
    const request = index.getAll(IDBKeyRange.only(false));
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getSubsectionFloorPlans(subsectionId: string): Promise<OfflineFloorPlan[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['floor_plans'], 'readonly');
    const store = transaction.objectStore('floor_plans');
    const index = store.index('subsection_id');
    const request = index.getAll(IDBKeyRange.only(subsectionId));
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function markFloorPlanSynced(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['floor_plans'], 'readwrite');
    const store = transaction.objectStore('floor_plans');
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const floorPlan = getRequest.result;
      if (floorPlan) {
        floorPlan.synced = true;
        const putRequest = store.put(floorPlan);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function deleteFloorPlan(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['floor_plans'], 'readwrite');
    const store = transaction.objectStore('floor_plans');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Helper to get DB instance
async function getDB(): Promise<IDBDatabase> {
  // @ts-ignore - accessing private property for extension
  if (!offlineDB['db']) {
    await offlineDB.init();
  }
  // @ts-ignore
  return offlineDB['db']!;
}
