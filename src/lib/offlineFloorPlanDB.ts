// IndexedDB operations for offline floor plan annotations
import { offlineDB } from './offlineDB';
import type { OfflineFloorPlanPin, OfflineMarkup, OfflineMeasurement } from './offlineDB';

async function getDB(): Promise<IDBDatabase> {
  // @ts-ignore - accessing private property
  if (!offlineDB['db']) {
    await offlineDB.init();
  }
  // @ts-ignore
  return offlineDB['db']!;
}

// Floor Plan Pins
export async function saveOfflinePin(pin: OfflineFloorPlanPin): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['floor_plan_pins'], 'readwrite');
    const store = transaction.objectStore('floor_plan_pins');
    const request = store.put(pin);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflinePin(id: string): Promise<OfflineFloorPlanPin | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['floor_plan_pins'], 'readonly');
    const store = transaction.objectStore('floor_plan_pins');
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getFloorPlanPins(floorPlanId: string): Promise<OfflineFloorPlanPin[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['floor_plan_pins'], 'readonly');
    const store = transaction.objectStore('floor_plan_pins');
    const index = store.index('floor_plan_id');
    const request = index.getAll(IDBKeyRange.only(floorPlanId));
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getUnsyncedPins(): Promise<OfflineFloorPlanPin[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['floor_plan_pins'], 'readonly');
    const store = transaction.objectStore('floor_plan_pins');
    const index = store.index('synced');
    const request = index.getAll(IDBKeyRange.only(false));
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function markPinSynced(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['floor_plan_pins'], 'readwrite');
    const store = transaction.objectStore('floor_plan_pins');
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const pin = getRequest.result;
      if (pin) {
        pin.synced = true;
        const putRequest = store.put(pin);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function deleteOfflinePin(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['floor_plan_pins'], 'readwrite');
    const store = transaction.objectStore('floor_plan_pins');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Markups
export async function saveMarkup(markup: OfflineMarkup): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['markups'], 'readwrite');
    const store = transaction.objectStore('markups');
    const request = store.put(markup);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getFloorPlanMarkups(floorPlanId: string): Promise<OfflineMarkup[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['markups'], 'readonly');
    const store = transaction.objectStore('markups');
    const index = store.index('floor_plan_id');
    const request = index.getAll(IDBKeyRange.only(floorPlanId));
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getUnsyncedMarkups(): Promise<OfflineMarkup[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['markups'], 'readonly');
    const store = transaction.objectStore('markups');
    const index = store.index('synced');
    const request = index.getAll(IDBKeyRange.only(false));
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function markMarkupSynced(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['markups'], 'readwrite');
    const store = transaction.objectStore('markups');
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const markup = getRequest.result;
      if (markup) {
        markup.synced = true;
        const putRequest = store.put(markup);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function deleteMarkup(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['markups'], 'readwrite');
    const store = transaction.objectStore('markups');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Measurements
export async function saveMeasurement(measurement: OfflineMeasurement): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['measurements'], 'readwrite');
    const store = transaction.objectStore('measurements');
    const request = store.put(measurement);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getFloorPlanMeasurements(floorPlanId: string): Promise<OfflineMeasurement[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['measurements'], 'readonly');
    const store = transaction.objectStore('measurements');
    const index = store.index('floor_plan_id');
    const request = index.getAll(IDBKeyRange.only(floorPlanId));
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getUnsyncedMeasurements(): Promise<OfflineMeasurement[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['measurements'], 'readonly');
    const store = transaction.objectStore('measurements');
    const index = store.index('synced');
    const request = index.getAll(IDBKeyRange.only(false));
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function markMeasurementSynced(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['measurements'], 'readwrite');
    const store = transaction.objectStore('measurements');
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const measurement = getRequest.result;
      if (measurement) {
        measurement.synced = true;
        const putRequest = store.put(measurement);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function deleteMeasurement(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['measurements'], 'readwrite');
    const store = transaction.objectStore('measurements');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
