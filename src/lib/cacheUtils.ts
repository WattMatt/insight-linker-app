/**
 * Cache clearing utilities for automatic daily logout
 */

// List of localStorage keys to preserve during cache clear
const PRESERVED_KEYS = ['supabase.auth.token']; // We'll clear this separately via signOut

/**
 * Clears all application caches including:
 * - IndexedDB databases
 * - localStorage (except essential items)
 * - Service worker caches
 */
export async function clearAllCaches(): Promise<void> {
  console.log('[CacheUtils] Starting cache clear...');
  
  const results = await Promise.allSettled([
    clearIndexedDB(),
    clearLocalStorage(),
    clearServiceWorkerCaches(),
    unregisterServiceWorkers(),
  ]);
  
  results.forEach((result, index) => {
    const operations = ['IndexedDB', 'localStorage', 'SW Caches', 'SW Unregister'];
    if (result.status === 'rejected') {
      console.error(`[CacheUtils] Failed to clear ${operations[index]}:`, result.reason);
    } else {
      console.log(`[CacheUtils] Cleared ${operations[index]}`);
    }
  });
  
  console.log('[CacheUtils] Cache clear complete');
}

/**
 * Clears all IndexedDB databases related to the app
 */
async function clearIndexedDB(): Promise<void> {
  // Known database names used by the app
  const dbNames = [
    'wm_compliance_offline',
    'wm_floor_plan_offline',
  ];
  
  for (const dbName of dbNames) {
    try {
      const deleteRequest = indexedDB.deleteDatabase(dbName);
      await new Promise<void>((resolve, reject) => {
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
        deleteRequest.onblocked = () => {
          console.warn(`[CacheUtils] IndexedDB ${dbName} deletion blocked`);
          resolve(); // Continue anyway
        };
      });
    } catch (error) {
      console.warn(`[CacheUtils] Could not delete IndexedDB ${dbName}:`, error);
    }
  }
}

/**
 * Clears localStorage except for preserved keys
 */
function clearLocalStorage(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !PRESERVED_KEYS.some(preserved => key.startsWith(preserved))) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      resolve();
    } catch (error) {
      console.warn('[CacheUtils] Could not clear localStorage:', error);
      resolve(); // Don't fail the whole operation
    }
  });
}

/**
 * Clears all service worker caches
 */
async function clearServiceWorkerCaches(): Promise<void> {
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    } catch (error) {
      console.warn('[CacheUtils] Could not clear SW caches:', error);
    }
  }
}

/**
 * Unregisters all service workers
 */
async function unregisterServiceWorkers(): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
    } catch (error) {
      console.warn('[CacheUtils] Could not unregister service workers:', error);
    }
  }
}
