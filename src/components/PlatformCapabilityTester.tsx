import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { offlineInspectionDB } from '@/lib/offlineInspectionDB';
import {
  Smartphone,
  Monitor,
  Tablet,
  CheckCircle,
  XCircle,
  AlertTriangle,
  HardDrive,
  Wifi,
  Camera,
  RefreshCw,
  Shield,
  Database,
  CloudOff,
  Image as ImageIcon,
  Clock,
  Zap,
  CheckCircle2
} from 'lucide-react';

interface PlatformInfo {
  platform: 'ios' | 'android' | 'desktop' | 'unknown';
  browser: string;
  isPWA: boolean;
  userAgent: string;
}

interface CapabilityTest {
  name: string;
  status: 'pending' | 'passed' | 'failed' | 'warning' | 'unsupported';
  message: string;
  details?: string;
}

interface StorageTestResult {
  indexedDBSupported: boolean;
  estimatedQuota: number;
  estimatedUsage: number;
  persistentStorageSupported: boolean;
  persistentStorageGranted: boolean | null;
  storageManagerSupported: boolean;
}

interface SyncTestResult {
  backgroundSyncSupported: boolean;
  serviceWorkerActive: boolean;
  periodicSyncSupported: boolean;
}

export function PlatformCapabilityTester() {
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityTest[]>([]);
  const [storageResult, setStorageResult] = useState<StorageTestResult | null>(null);
  const [syncResult, setSyncResult] = useState<SyncTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testComplete, setTestComplete] = useState(false);

  // Detect platform on mount
  useEffect(() => {
    detectPlatform();
  }, []);

  const detectPlatform = (): PlatformInfo => {
    const ua = navigator.userAgent;
    let platform: 'ios' | 'android' | 'desktop' | 'unknown' = 'unknown';
    let browser = 'Unknown';
    
    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(ua) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    // Detect Android
    const isAndroid = /Android/.test(ua);
    
    // Detect browser
    if (/CriOS/.test(ua)) browser = 'Chrome iOS';
    else if (/FxiOS/.test(ua)) browser = 'Firefox iOS';
    else if (/Safari/.test(ua) && /Apple/.test(navigator.vendor)) browser = 'Safari';
    else if (/Chrome/.test(ua)) browser = 'Chrome';
    else if (/Firefox/.test(ua)) browser = 'Firefox';
    else if (/Edge/.test(ua)) browser = 'Edge';
    
    if (isIOS) platform = 'ios';
    else if (isAndroid) platform = 'android';
    else if (!('ontouchstart' in window)) platform = 'desktop';
    
    // Detect PWA mode
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    
    const info: PlatformInfo = { platform, browser, isPWA, userAgent: ua };
    setPlatformInfo(info);
    return info;
  };

  const runAllTests = async () => {
    setIsTesting(true);
    setTestComplete(false);
    setCapabilities([]);
    
    const tests: CapabilityTest[] = [];
    const platform = detectPlatform();
    
    // 1. IndexedDB Test
    tests.push(await testIndexedDB());
    setCapabilities([...tests]);
    
    // 2. Production Offline DB Test - uses actual offlineInspectionDB
    tests.push(await testProductionOfflineDB());
    setCapabilities([...tests]);
    
    // 3. Storage Quota Test
    const storageTest = await testStorageQuota();
    tests.push(storageTest.capability);
    setStorageResult(storageTest.result);
    setCapabilities([...tests]);
    
    // 4. Persistent Storage Test
    tests.push(await testPersistentStorage());
    setCapabilities([...tests]);
    
    // 5. Service Worker Test
    tests.push(await testServiceWorker());
    setCapabilities([...tests]);
    
    // 6. Background Sync Test
    const syncTest = await testBackgroundSync();
    tests.push(syncTest.capability);
    setSyncResult(syncTest.result);
    setCapabilities([...tests]);
    
    // 7. Camera/Media Capture Test
    tests.push(await testCameraCapability());
    setCapabilities([...tests]);
    
    // 8. HEIC Support Test (iOS specific)
    if (platform.platform === 'ios') {
      tests.push(await testHEICSupport());
      setCapabilities([...tests]);
    }
    
    // 9. Network Information API Test
    tests.push(await testNetworkInfo());
    setCapabilities([...tests]);
    
    // 10. Blob/File API Test
    tests.push(await testBlobAPI());
    setCapabilities([...tests]);
    
    // 11. Cache API Test
    tests.push(await testCacheAPI());
    setCapabilities([...tests]);
    
    setIsTesting(false);
    setTestComplete(true);
    toast.success('Platform capability tests complete');
  };

  // Test the ACTUAL production offline database
  const testProductionOfflineDB = async (): Promise<CapabilityTest> => {
    try {
      // Initialize the production database
      await offlineInspectionDB.init();
      
      // Get stats from the actual production database
      const stats = await offlineInspectionDB.getCacheStats();
      const storageEstimate = await offlineInspectionDB.getStorageEstimate();
      
      const detailParts = [
        `Inspections: ${stats.inspectionCount}`,
        `Images: ${stats.imageCount}`,
        `Templates: ${stats.templateCount}`,
        `Pending sync: ${stats.pendingChanges}`,
        `Storage: ${Math.round(storageEstimate.used / 1024)}KB`
      ];
      
      return {
        name: 'Production Offline Database',
        status: 'passed',
        message: '✅ Production offline DB initialized and accessible',
        details: detailParts.join(' | ')
      };
    } catch (error) {
      return {
        name: 'Production Offline Database',
        status: 'failed',
        message: `❌ Production DB failed: ${error}`,
        details: 'The actual offline inspection database could not be initialized.'
      };
    }
  };

  // Individual test functions
  const testIndexedDB = async (): Promise<CapabilityTest> => {
    try {
      if (!window.indexedDB) {
        return {
          name: 'IndexedDB Support',
          status: 'failed',
          message: 'IndexedDB not supported',
          details: 'This browser does not support IndexedDB, which is required for offline storage.'
        };
      }
      
      // REAL TEST: Write and read data to verify full functionality
      const testId = `_capability_test_${Date.now()}`;
      const testData = { id: testId, value: 'offline_test', timestamp: new Date().toISOString() };
      
      const fullTest = await new Promise<{ success: boolean; writeOk: boolean; readOk: boolean; matchOk: boolean }>((resolve) => {
        const request = indexedDB.open('_capability_test_db', 1);
        
        request.onerror = () => resolve({ success: false, writeOk: false, readOk: false, matchOk: false });
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('test_store')) {
            db.createObjectStore('test_store', { keyPath: 'id' });
          }
        };
        
        request.onsuccess = async () => {
          const db = request.result;
          let writeOk = false;
          let readOk = false;
          let matchOk = false;
          
          try {
            // WRITE test
            const writeTx = db.transaction('test_store', 'readwrite');
            const writeStore = writeTx.objectStore('test_store');
            await new Promise<void>((res, rej) => {
              const writeReq = writeStore.put(testData);
              writeReq.onsuccess = () => { writeOk = true; res(); };
              writeReq.onerror = () => rej(writeReq.error);
            });
            
            // READ test
            const readTx = db.transaction('test_store', 'readonly');
            const readStore = readTx.objectStore('test_store');
            const readResult = await new Promise<any>((res, rej) => {
              const readReq = readStore.get(testId);
              readReq.onsuccess = () => { readOk = true; res(readReq.result); };
              readReq.onerror = () => rej(readReq.error);
            });
            
            // VERIFY test
            matchOk = readResult?.value === 'offline_test';
            
            // Cleanup
            const deleteTx = db.transaction('test_store', 'readwrite');
            deleteTx.objectStore('test_store').delete(testId);
            
          } catch (e) {
            console.error('IndexedDB test error:', e);
          }
          
          db.close();
          indexedDB.deleteDatabase('_capability_test_db');
          
          resolve({ success: writeOk && readOk && matchOk, writeOk, readOk, matchOk });
        };
      });
      
      if (fullTest.success) {
        return {
          name: 'IndexedDB Support',
          status: 'passed',
          message: '✅ Offline storage VERIFIED - Write/Read/Verify passed',
          details: `Write: ${fullTest.writeOk ? '✓' : '✗'} | Read: ${fullTest.readOk ? '✓' : '✗'} | Match: ${fullTest.matchOk ? '✓' : '✗'} - Full offline capability confirmed.`
        };
      } else {
        return {
          name: 'IndexedDB Support',
          status: 'warning',
          message: 'IndexedDB partial - some operations failed',
          details: `Write: ${fullTest.writeOk ? '✓' : '✗'} | Read: ${fullTest.readOk ? '✓' : '✗'} | Match: ${fullTest.matchOk ? '✓' : '✗'}`
        };
      }
    } catch (error) {
      return {
        name: 'IndexedDB Support',
        status: 'failed',
        message: `Test error: ${error}`,
      };
    }
  };

  const testStorageQuota = async (): Promise<{ capability: CapabilityTest; result: StorageTestResult }> => {
    const result: StorageTestResult = {
      indexedDBSupported: !!window.indexedDB,
      estimatedQuota: 0,
      estimatedUsage: 0,
      persistentStorageSupported: false,
      persistentStorageGranted: null,
      storageManagerSupported: false
    };
    
    try {
      if (navigator.storage && navigator.storage.estimate) {
        result.storageManagerSupported = true;
        const estimate = await navigator.storage.estimate();
        result.estimatedQuota = estimate.quota || 0;
        result.estimatedUsage = estimate.usage || 0;
        
        const quotaMB = Math.round(result.estimatedQuota / (1024 * 1024));
        const usageMB = Math.round(result.estimatedUsage / (1024 * 1024));
        const percentUsed = result.estimatedQuota > 0 
          ? Math.round((result.estimatedUsage / result.estimatedQuota) * 100) 
          : 0;
        
        // Platform-specific quota warnings
        const platform = platformInfo?.platform || 'unknown';
        const isPWA = platformInfo?.isPWA || false;
        let status: CapabilityTest['status'] = 'passed';
        let details = `Available: ${quotaMB}MB, Used: ${usageMB}MB (${percentUsed}%)`;
        
        // iOS has different behavior: PWA mode typically grants much larger quota
        if (platform === 'ios') {
          if (quotaMB < 100 && !isPWA) {
            status = 'warning';
            details += ' ⚠️ iOS Safari browser mode has ~50MB limit. Add to Home Screen for larger quota.';
          } else if (quotaMB >= 1000) {
            details += ' ✅ PWA storage quota is healthy.';
          }
        } else if (quotaMB < 50) {
          status = 'warning';
          details += ' ⚠️ Limited storage available.';
        }
        
        return {
          capability: {
            name: 'Storage Quota',
            status,
            message: `${quotaMB}MB available, ${percentUsed}% used`,
            details
          },
          result
        };
      }
      
      return {
        capability: {
          name: 'Storage Quota',
          status: 'unsupported',
          message: 'Storage Manager API not supported',
          details: 'Cannot determine available storage. May still work with defaults.'
        },
        result
      };
    } catch (error) {
      return {
        capability: {
          name: 'Storage Quota',
          status: 'failed',
          message: `Error: ${error}`,
        },
        result
      };
    }
  };

  const testPersistentStorage = async (): Promise<CapabilityTest> => {
    try {
      if (!navigator.storage || !navigator.storage.persist) {
        return {
          name: 'Persistent Storage',
          status: 'unsupported',
          message: 'Persistent Storage API not available',
          details: 'Browser may evict offline data when storage is low. iOS Safari commonly lacks this.'
        };
      }
      
      // Check if already persisted
      const isPersisted = await navigator.storage.persisted();
      if (isPersisted) {
        return {
          name: 'Persistent Storage',
          status: 'passed',
          message: 'Storage is already persistent',
          details: 'Offline data will not be automatically evicted.'
        };
      }
      
      // Try to request persistence
      const granted = await navigator.storage.persist();
      return {
        name: 'Persistent Storage',
        status: granted ? 'passed' : 'warning',
        message: granted ? 'Persistent storage granted' : 'Persistent storage denied',
        details: granted 
          ? 'Offline data will be protected from eviction.' 
          : 'Browser may delete offline data when space is needed. Sync frequently!'
      };
    } catch (error) {
      return {
        name: 'Persistent Storage',
        status: 'failed',
        message: `Error: ${error}`,
      };
    }
  };

  const testServiceWorker = async (): Promise<CapabilityTest> => {
    try {
      if (!('serviceWorker' in navigator)) {
        return {
          name: 'Service Worker',
          status: 'failed',
          message: 'Service Workers not supported',
          details: 'Offline caching and background sync will not work.'
        };
      }
      
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && registration.active) {
        return {
          name: 'Service Worker',
          status: 'passed',
          message: 'Service Worker is active',
          details: `Scope: ${registration.scope}`
        };
      }
      
      return {
        name: 'Service Worker',
        status: 'warning',
        message: 'Service Worker registered but not active',
        details: 'May need page refresh for full offline support.'
      };
    } catch (error) {
      return {
        name: 'Service Worker',
        status: 'failed',
        message: `Error: ${error}`,
      };
    }
  };

  const testBackgroundSync = async (): Promise<{ capability: CapabilityTest; result: SyncTestResult }> => {
    const result: SyncTestResult = {
      backgroundSyncSupported: false,
      serviceWorkerActive: false,
      periodicSyncSupported: false
    };
    
    try {
      if (!('serviceWorker' in navigator)) {
        return {
          capability: {
            name: 'Background Sync',
            status: 'unsupported',
            message: 'Requires Service Worker',
          },
          result
        };
      }
      
      const registration = await navigator.serviceWorker.ready;
      result.serviceWorkerActive = true;
      
      // Check for Background Sync API
      if ('sync' in registration) {
        result.backgroundSyncSupported = true;
      }
      
      // Check for Periodic Background Sync
      if ('periodicSync' in registration) {
        result.periodicSyncSupported = true;
      }
      
      const platform = platformInfo?.platform || 'unknown';
      
      if (!result.backgroundSyncSupported) {
        return {
          capability: {
            name: 'Background Sync',
            status: platform === 'ios' ? 'warning' : 'unsupported',
            message: 'Background Sync API not available',
            details: platform === 'ios' 
              ? 'iOS Safari does not support Background Sync. App must sync when opened.'
              : 'Sync will occur only when app is open.'
          },
          result
        };
      }
      
      return {
        capability: {
          name: 'Background Sync',
          status: 'passed',
          message: 'Background Sync is supported',
          details: result.periodicSyncSupported 
            ? 'Supports both one-time and periodic sync.'
            : 'Supports one-time background sync.'
        },
        result
      };
    } catch (error) {
      return {
        capability: {
          name: 'Background Sync',
          status: 'failed',
          message: `Error: ${error}`,
        },
        result
      };
    }
  };

  const testCameraCapability = async (): Promise<CapabilityTest> => {
    try {
      // Check for MediaDevices API
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Fall back to input capture check
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        
        return {
          name: 'Camera Capture',
          status: 'warning',
          message: 'Using file input fallback',
          details: 'MediaDevices API not available, but file input with capture should work.'
        };
      }
      
      // Check available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');
      
      if (cameras.length === 0) {
        return {
          name: 'Camera Capture',
          status: 'warning',
          message: 'No cameras detected',
          details: 'May need to grant camera permissions first.'
        };
      }
      
      return {
        name: 'Camera Capture',
        status: 'passed',
        message: `${cameras.length} camera(s) available`,
        details: 'Can capture photos for inspections.'
      };
    } catch (error) {
      return {
        name: 'Camera Capture',
        status: 'warning',
        message: 'Camera access requires permission',
        details: 'Permission needed on first use.'
      };
    }
  };

  const testHEICSupport = async (): Promise<CapabilityTest> => {
    try {
      // Check if heic2any library is available
      const hasHeic2any = typeof (await import('heic2any')) !== 'undefined';
      
      return {
        name: 'HEIC Conversion',
        status: hasHeic2any ? 'passed' : 'warning',
        message: hasHeic2any ? 'HEIC to JPEG conversion available' : 'HEIC library not loaded',
        details: 'iOS devices may capture photos in HEIC format. Auto-conversion is configured.'
      };
    } catch (error) {
      return {
        name: 'HEIC Conversion',
        status: 'warning',
        message: 'HEIC conversion may not work',
        details: 'Ensure photos are captured in JPEG mode if issues occur.'
      };
    }
  };

  const testNetworkInfo = async (): Promise<CapabilityTest> => {
    try {
      const connection = (navigator as any).connection || 
                        (navigator as any).mozConnection || 
                        (navigator as any).webkitConnection;
      
      if (!connection) {
        return {
          name: 'Network Information',
          status: 'unsupported',
          message: 'Network Information API not supported',
          details: 'Using basic online/offline detection only.'
        };
      }
      
      return {
        name: 'Network Information',
        status: 'passed',
        message: `${connection.effectiveType || 'Unknown'} connection`,
        details: `Downlink: ${connection.downlink || 'N/A'} Mbps, RTT: ${connection.rtt || 'N/A'}ms`
      };
    } catch (error) {
      return {
        name: 'Network Information',
        status: 'unsupported',
        message: 'Cannot detect network quality',
      };
    }
  };

  const testBlobAPI = async (): Promise<CapabilityTest> => {
    try {
      // Test blob creation and reading
      const testBlob = new Blob(['test'], { type: 'text/plain' });
      const url = URL.createObjectURL(testBlob);
      URL.revokeObjectURL(url);
      
      // Test canvas to blob
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      
      const blobPromise = new Promise<boolean>((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob !== null);
        }, 'image/jpeg', 0.9);
      });
      
      const canvasToBlob = await blobPromise;
      
      return {
        name: 'Blob/File API',
        status: canvasToBlob ? 'passed' : 'warning',
        message: canvasToBlob ? 'Full Blob support' : 'Limited Blob support',
        details: 'Can compress and store images locally.'
      };
    } catch (error) {
      return {
        name: 'Blob/File API',
        status: 'failed',
        message: `Error: ${error}`,
      };
    }
  };

  const testCacheAPI = async (): Promise<CapabilityTest> => {
    try {
      if (!('caches' in window)) {
        return {
          name: 'Cache API',
          status: 'unsupported',
          message: 'Cache API not supported',
          details: 'Static assets may not be cached for offline use.'
        };
      }
      
      // Try to open a test cache
      const cache = await caches.open('_capability_test');
      await caches.delete('_capability_test');
      
      return {
        name: 'Cache API',
        status: 'passed',
        message: 'Cache API available',
        details: 'Can cache static assets for offline access.'
      };
    } catch (error) {
      return {
        name: 'Cache API',
        status: 'failed',
        message: `Error: ${error}`,
      };
    }
  };

  const getStatusIcon = (status: CapabilityTest['status']) => {
    switch (status) {
      case 'passed': return <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />;
      case 'failed': return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
      case 'unsupported': return <CloudOff className="h-5 w-5 text-muted-foreground" />;
      default: return <Clock className="h-5 w-5 text-muted-foreground animate-pulse" />;
    }
  };

  const getPlatformIcon = () => {
    switch (platformInfo?.platform) {
      case 'ios': return <Smartphone className="h-6 w-6" />;
      case 'android': return <Smartphone className="h-6 w-6" />;
      case 'desktop': return <Monitor className="h-6 w-6" />;
      default: return <Tablet className="h-6 w-6" />;
    }
  };

  const getPlatformRecommendations = (): string[] => {
    if (!platformInfo) return [];
    
    const recommendations: string[] = [];
    const quotaMB = storageResult ? Math.round(storageResult.estimatedQuota / (1024 * 1024)) : 0;
    const isLargeQuota = quotaMB > 1000; // More than 1GB
    
    if (platformInfo.platform === 'ios') {
      // Check if running as PWA with good storage
      if (platformInfo.isPWA) {
        recommendations.push('✅ Running as installed PWA - optimal iOS experience.');
        if (isLargeQuota) {
          recommendations.push(`✅ Large storage quota available (${Math.round(quotaMB / 1024)}GB) - PWA storage working well.`);
        } else {
          recommendations.push('⚠️ Storage quota is limited. Sync frequently to avoid data loss.');
        }
      } else {
        recommendations.push('⚠️ iOS Safari has ~50MB storage limit in browser mode.');
        recommendations.push('📱 Add to Home Screen for much larger storage quota and better experience.');
      }
      
      recommendations.push('⚠️ Background Sync is not supported on iOS. App must be open to sync.');
      
      if (storageResult?.persistentStorageGranted === false || storageResult?.persistentStorageGranted === null) {
        recommendations.push('⚠️ Persistent storage not confirmed. Sync frequently to prevent data loss.');
      }
    }
    
    if (platformInfo.platform === 'android') {
      if (platformInfo.isPWA) {
        recommendations.push('✅ Running as installed PWA with full Android integration.');
      } else {
        recommendations.push('💡 Add to Home Screen for app-like experience.');
      }
      recommendations.push('✅ Android Chrome has excellent offline support with large storage quotas.');
      recommendations.push('✅ Background Sync should work for automatic data upload.');
    }
    
    if (platformInfo.platform === 'desktop') {
      recommendations.push('✅ Desktop browsers typically have large storage quotas (GB range).');
      recommendations.push('✅ Best platform for handling many inspections offline.');
    }
    
    return recommendations;
  };

  const getOverallScore = (): { score: number; label: string; color: string } => {
    if (capabilities.length === 0) return { score: 0, label: 'Not tested', color: 'text-muted-foreground' };
    
    const passed = capabilities.filter(c => c.status === 'passed').length;
    const warnings = capabilities.filter(c => c.status === 'warning').length;
    const failed = capabilities.filter(c => c.status === 'failed').length;
    
    const score = Math.round(((passed + warnings * 0.5) / capabilities.length) * 100);
    
    if (score >= 80) return { score, label: 'Excellent', color: 'text-green-600' };
    if (score >= 60) return { score, label: 'Good', color: 'text-yellow-600' };
    if (score >= 40) return { score, label: 'Limited', color: 'text-orange-600' };
    return { score, label: 'Poor', color: 'text-destructive' };
  };

  const overallScore = getOverallScore();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Platform Capability Testing
        </CardTitle>
        <CardDescription>
          Test offline capabilities for your current device and browser
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Platform Detection */}
        {platformInfo && (
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            {getPlatformIcon()}
            <div className="flex-1">
              <div className="font-medium">
                {platformInfo.platform.toUpperCase()} - {platformInfo.browser}
              </div>
              <div className="text-sm text-muted-foreground">
                {platformInfo.isPWA ? '✓ Running as PWA' : 'Running in browser'}
              </div>
            </div>
            <Button onClick={runAllTests} disabled={isTesting}>
              {isTesting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Run All Tests
                </>
              )}
            </Button>
          </div>
        )}

        {/* Overall Score */}
        {testComplete && (
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Offline Capability Score</span>
              <span className={`font-bold ${overallScore.color}`}>
                {overallScore.score}% - {overallScore.label}
              </span>
            </div>
            <Progress value={overallScore.score} className="h-2" />
          </div>
        )}

        {/* Test Results */}
        {capabilities.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Test Results</h4>
            <div className="space-y-2">
              {capabilities.map((cap, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg">
                  {getStatusIcon(cap.status)}
                  <div className="flex-1">
                    <div className="font-medium">{cap.name}</div>
                    <div className="text-sm text-muted-foreground">{cap.message}</div>
                    {cap.details && (
                      <div className="text-xs text-muted-foreground mt-1">{cap.details}</div>
                    )}
                  </div>
                  <Badge variant={
                    cap.status === 'passed' ? 'default' :
                    cap.status === 'warning' ? 'secondary' :
                    cap.status === 'failed' ? 'destructive' : 'outline'
                  }>
                    {cap.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Storage Details */}
        {storageResult && storageResult.storageManagerSupported && (
          <div className="p-4 border rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Storage Details
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Quota</div>
                <div className="font-medium">
                  {Math.round(storageResult.estimatedQuota / (1024 * 1024))} MB
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Used</div>
                <div className="font-medium">
                  {Math.round(storageResult.estimatedUsage / (1024 * 1024))} MB
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Est. Images Capacity</div>
                <div className="font-medium">
                  ~{Math.round((storageResult.estimatedQuota - storageResult.estimatedUsage) / 80000)} photos
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Persistent</div>
                <div className="font-medium">
                  {storageResult.persistentStorageGranted === true ? 'Yes ✓' : 
                   storageResult.persistentStorageGranted === false ? 'Denied' : 'Unknown'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Platform Recommendations */}
        {testComplete && (
          <div className="p-4 border rounded-lg bg-muted/30">
            <h4 className="font-medium mb-2">Platform Recommendations</h4>
            <ul className="space-y-1 text-sm">
              {getPlatformRecommendations().map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Sync Capabilities */}
        {syncResult && (
          <div className="p-4 border rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Sync Capabilities
            </h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <div className={syncResult.serviceWorkerActive ? 'text-green-600' : 'text-destructive'}>
                  {syncResult.serviceWorkerActive ? '✓' : '✗'}
                </div>
                <div className="text-muted-foreground">Service Worker</div>
              </div>
              <div className="text-center">
                <div className={syncResult.backgroundSyncSupported ? 'text-green-600' : 'text-yellow-600'}>
                  {syncResult.backgroundSyncSupported ? '✓' : '✗'}
                </div>
                <div className="text-muted-foreground">Background Sync</div>
              </div>
              <div className="text-center">
                <div className={syncResult.periodicSyncSupported ? 'text-green-600' : 'text-muted-foreground'}>
                  {syncResult.periodicSyncSupported ? '✓' : '✗'}
                </div>
                <div className="text-muted-foreground">Periodic Sync</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
