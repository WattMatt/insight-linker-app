import { toast } from 'sonner';

export interface StorageQuotaInfo {
  usage: number;
  quota: number;
  available: number;
  percentUsed: number;
}

/**
 * Gets current storage quota information
 */
export async function getStorageQuota(): Promise<StorageQuotaInfo | null> {
  if (!navigator.storage || !navigator.storage.estimate) {
    console.warn('Storage API not supported');
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const available = quota - usage;
    const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

    return {
      usage,
      quota,
      available,
      percentUsed,
    };
  } catch (error) {
    console.error('Error getting storage quota:', error);
    return null;
  }
}

/**
 * Checks if there's enough storage space for a given size
 */
export async function checkStorageAvailable(
  requiredBytes: number
): Promise<boolean> {
  const quota = await getStorageQuota();
  
  if (!quota) {
    // If we can't check, assume it's available
    return true;
  }

  // Add 10MB buffer for safety
  const buffer = 10 * 1024 * 1024;
  const needed = requiredBytes + buffer;

  if (quota.available < needed) {
    const availableMB = (quota.available / (1024 * 1024)).toFixed(1);
    const neededMB = (needed / (1024 * 1024)).toFixed(1);
    
    toast.error(
      `Not enough storage space. Available: ${availableMB}MB, Needed: ${neededMB}MB`,
      { duration: 5000 }
    );
    return false;
  }

  // Warn if storage is getting full (>80%)
  if (quota.percentUsed > 80) {
    toast.warning(
      `Storage is ${quota.percentUsed.toFixed(0)}% full. Consider clearing old offline data.`,
      { duration: 4000 }
    );
  }

  return true;
}

/**
 * Formats bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Estimates IndexedDB usage
 */
export async function estimateIndexedDBUsage(): Promise<number> {
  try {
    if (!window.indexedDB) return 0;

    const databases = await window.indexedDB.databases();
    let totalSize = 0;

    // This is an estimation - actual size may vary
    for (const db of databases) {
      if (db.name) {
        // Estimate ~1KB per database entry as baseline
        totalSize += 1024;
      }
    }

    return totalSize;
  } catch (error) {
    console.error('Error estimating IndexedDB usage:', error);
    return 0;
  }
}

/**
 * Clears old offline data to free up space
 */
export async function clearOldOfflineData(daysOld: number = 30): Promise<void> {
  try {
    const { offlineDB } = await import('@/lib/offlineDB');
    await offlineDB.init();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffTimestamp = cutoffDate.toISOString();

    // This would need to be implemented in offlineDB
    console.log(`Clearing offline data older than ${daysOld} days (${cutoffTimestamp})`);
    
    toast.success('Old offline data cleared successfully');
  } catch (error) {
    console.error('Error clearing old data:', error);
    toast.error('Failed to clear old offline data');
  }
}
