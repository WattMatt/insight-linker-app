import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { offlineInspectionDB, CachedInspection, OfflineInspectionImage } from '@/lib/offlineInspectionDB';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { PlatformCapabilityTester } from '@/components/PlatformCapabilityTester';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  WifiOff, 
  Wifi, 
  Database, 
  Image as ImageIcon, 
  Upload, 
  RefreshCw,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  HardDrive,
  Camera,
  Smartphone
} from 'lucide-react';

interface TestImage {
  id: string;
  file_name: string;
  section_key: string;
  item_key: string | null;
  synced: boolean;
  uploaded_url: string | null;
  created_at: string;
  blob_size: number;
}

export default function OfflineSyncTest() {
  const navigate = useNavigate();
  const { isOnline, queueSize, isSyncing, processQueue, queueMutation } = useOfflineSync();
  
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [cachedInspections, setCachedInspections] = useState<CachedInspection[]>([]);
  const [offlineImages, setOfflineImages] = useState<TestImage[]>([]);
  const [selectedInspection, setSelectedInspection] = useState<string>('');
  const [availableInspections, setAvailableInspections] = useState<any[]>([]);
  const [storageStats, setStorageStats] = useState<{ used: number; quota: number; percentage: number }>({ used: 0, quota: 0, percentage: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [testLog, setTestLog] = useState<string[]>([]);

  const effectiveOnline = isOnline && !simulatedOffline;

  // Add log entry
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTestLog(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 99)]);
  };

  // Load data on mount
  useEffect(() => {
    loadCachedData();
    loadAvailableInspections();
    loadStorageStats();
  }, []);

  const loadCachedData = async () => {
    try {
      const inspections = await offlineInspectionDB.getAllCachedInspections();
      setCachedInspections(inspections);
      addLog(`Loaded ${inspections.length} cached inspections from IndexedDB`);

      // Load all offline images
      const allImages: TestImage[] = [];
      for (const inspection of inspections) {
        const images = await offlineInspectionDB.getInspectionImages(inspection.id);
        images.forEach(img => {
          allImages.push({
            id: img.id,
            file_name: img.file_name,
            section_key: img.section_key,
            item_key: img.item_key,
            synced: img.synced,
            uploaded_url: img.uploaded_url,
            created_at: img.created_at,
            blob_size: img.blob.size
          });
        });
      }
      setOfflineImages(allImages);
      addLog(`Loaded ${allImages.length} offline images`);
    } catch (error) {
      console.error('Failed to load cached data:', error);
      addLog(`ERROR: Failed to load cached data - ${error}`);
    }
  };

  const loadAvailableInspections = async () => {
    try {
      const { data, error } = await supabase
        .from('inspections')
        .select(`
          id,
          title,
          status,
          site_id,
          sites!inner(
            name,
            clients!inner(name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setAvailableInspections(data || []);
      addLog(`Loaded ${data?.length || 0} inspections from Supabase`);
    } catch (error) {
      console.error('Failed to load inspections:', error);
      addLog(`ERROR: Failed to load inspections - ${error}`);
    }
  };

  const loadStorageStats = async () => {
    const stats = await offlineInspectionDB.getStorageEstimate();
    setStorageStats(stats);
  };

  // Cache an inspection for offline testing
  const cacheInspection = async (inspectionId: string) => {
    setIsLoading(true);
    addLog(`Caching inspection ${inspectionId}...`);

    try {
      // Fetch full inspection data
      const { data: inspection, error } = await supabase
        .from('inspections')
        .select(`
          *,
          inspection_templates(*),
          sites(
            id,
            name,
            address,
            site_image_url,
            client_logo_url,
            clients(id, name)
          ),
          subsections(id, name)
        `)
        .eq('id', inspectionId)
        .single();

      if (error) throw error;

      const cachedData: CachedInspection = {
        id: inspection.id,
        title: inspection.title,
        status: inspection.status,
        inspection_date: inspection.inspection_date,
        site_id: inspection.site_id,
        subsection_id: inspection.subsection_id,
        inspector_name: inspection.inspector_name,
        json_data: inspection.json_data || {},
        template: inspection.inspection_templates,
        template_id: inspection.template_id,
        template_category: inspection.inspection_templates?.category || null,
        site_data: inspection.sites ? {
          clientName: (inspection.sites as any).clients?.name || '',
          siteName: (inspection.sites as any).name || '',
          physicalAddress: (inspection.sites as any).address || null,
          siteImageUrl: (inspection.sites as any).site_image_url || null,
          clientLogoUrl: (inspection.sites as any).client_logo_url || null
        } : null,
        subsection_data: inspection.subsections ? {
          name: (inspection.subsections as any).name
        } : null,
        cached_at: new Date().toISOString(),
        last_modified: new Date().toISOString(),
        synced: true,
        pending_changes: false
      };

      await offlineInspectionDB.cacheInspection(cachedData);
      addLog(`✓ Cached inspection: ${inspection.title}`);
      
      await loadCachedData();
      await loadStorageStats();
      toast.success('Inspection cached for offline use');
    } catch (error) {
      console.error('Failed to cache inspection:', error);
      addLog(`ERROR: Failed to cache inspection - ${error}`);
      toast.error('Failed to cache inspection');
    } finally {
      setIsLoading(false);
    }
  };

  // Simulate capturing an image offline
  const simulateCaptureImage = async () => {
    if (!selectedInspection) {
      toast.error('Select an inspection first');
      return;
    }

    const cached = cachedInspections.find(i => i.id === selectedInspection);
    if (!cached) {
      toast.error('Inspection not cached. Cache it first.');
      return;
    }

    addLog(`Simulating image capture for ${cached.title}...`);

    // Create a test image blob (100x100 colored canvas)
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = `hsl(${Math.random() * 360}, 70%, 50%)`;
      ctx.fillRect(0, 0, 100, 100);
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('TEST', 50, 55);
    }

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9);
    });

    // Determine section key from template
    const sectionKey = cached.template?.sections?.[0]?.id || 'general';
    const itemKey = 'test_item';
    const timestamp = Date.now();
    const fileName = `offline_test_${timestamp}.jpg`;

    const offlineImage: OfflineInspectionImage = {
      id: `offline_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      inspection_id: selectedInspection,
      section_key: sectionKey,
      item_key: itemKey,
      blob: blob,
      file_name: fileName,
      created_at: new Date().toISOString(),
      synced: false,
      uploaded_url: null
    };

    await offlineInspectionDB.saveInspectionImage(offlineImage);
    
    addLog(`✓ Image saved offline: ${fileName}`);
    addLog(`  - Inspection: ${selectedInspection}`);
    addLog(`  - Section: ${sectionKey}`);
    addLog(`  - Item: ${itemKey}`);
    addLog(`  - Size: ${(blob.size / 1024).toFixed(2)} KB`);

    await loadCachedData();
    await loadStorageStats();
    toast.success('Test image saved offline');
  };

  // Test the sync process
  const testSync = async () => {
    if (simulatedOffline) {
      toast.error('Cannot sync while simulated offline is active');
      return;
    }

    addLog('Starting sync process...');
    
    // Get unsynced images
    const unsyncedImages = await offlineInspectionDB.getUnsyncedImages();
    addLog(`Found ${unsyncedImages.length} unsynced images`);

    for (const image of unsyncedImages) {
      // Queue the upload mutation
      queueMutation('UPLOAD_INSPECTION_IMAGE', {
        imageId: image.id,
        inspectionId: image.inspection_id,
        sectionKey: image.section_key,
        itemKey: image.item_key,
        blob: image.blob,
        fileName: image.file_name
      });
      addLog(`Queued image for upload: ${image.file_name}`);
    }

    // Get unsynced inspections
    const unsyncedInspections = await offlineInspectionDB.getUnsyncedInspections();
    addLog(`Found ${unsyncedInspections.length} inspections with pending changes`);

    for (const inspection of unsyncedInspections) {
      queueMutation('SAVE_INSPECTION_JSON', {
        inspectionId: inspection.id,
        jsonData: inspection.json_data
      });
      addLog(`Queued inspection data: ${inspection.title}`);
    }

    // Process the queue
    await processQueue();
    addLog('Sync process completed');

    await loadCachedData();
    toast.success('Sync completed');
  };

  // Clear all cached data
  const clearAllCache = async () => {
    if (!confirm('Clear all cached inspections and images?')) return;

    addLog('Clearing all cached data...');
    
    for (const inspection of cachedInspections) {
      await offlineInspectionDB.deleteCachedInspection(inspection.id);
      await offlineInspectionDB.deleteInspectionImages(inspection.id);
    }

    addLog('✓ All cached data cleared');
    await loadCachedData();
    await loadStorageStats();
    toast.success('Cache cleared');
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Offline Sync Testing Dashboard</h1>
          <p className="text-muted-foreground">
            Test and verify the offline inspection workflow
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
      </div>

      {/* Status Bar */}
      <div className="flex flex-wrap gap-4">
        <Card className="flex-1 min-w-[200px]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              {effectiveOnline ? (
                <Wifi className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : (
                <WifiOff className="h-5 w-5 text-destructive" />
              )}
              <span className="font-medium">
                {effectiveOnline ? 'Online' : 'Offline'}
              </span>
              {simulatedOffline && (
                <Badge variant="secondary">Simulated</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1 min-w-[200px]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <span className="font-medium">{cachedInspections.length} Cached</span>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1 min-w-[200px]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              <span className="font-medium">{offlineImages.length} Images</span>
              <Badge variant={offlineImages.filter(i => !i.synced).length > 0 ? 'destructive' : 'secondary'}>
                {offlineImages.filter(i => !i.synced).length} unsynced
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1 min-w-[200px]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              <span className="font-medium">
                {formatBytes(storageStats.used)} / {formatBytes(storageStats.quota)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle>Test Controls</CardTitle>
          <CardDescription>
            Simulate offline scenarios and test the sync workflow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <Button
              variant={simulatedOffline ? 'destructive' : 'outline'}
              onClick={() => {
                setSimulatedOffline(!simulatedOffline);
                addLog(simulatedOffline ? 'Simulated offline mode disabled' : 'Simulated offline mode enabled');
              }}
            >
              {simulatedOffline ? <WifiOff className="h-4 w-4 mr-2" /> : <Wifi className="h-4 w-4 mr-2" />}
              {simulatedOffline ? 'Disable Offline Mode' : 'Simulate Offline'}
            </Button>

            <div className="flex gap-2 items-center">
              <Select value={selectedInspection} onValueChange={setSelectedInspection}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Select inspection to cache..." />
                </SelectTrigger>
                <SelectContent>
                  {availableInspections.map((insp) => (
                    <SelectItem key={insp.id} value={insp.id}>
                      {insp.title} ({insp.sites?.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => selectedInspection && cacheInspection(selectedInspection)}
                disabled={!selectedInspection || isLoading}
              >
                <Database className="h-4 w-4 mr-2" />
                Cache
              </Button>
            </div>

            <Button 
              onClick={simulateCaptureImage}
              disabled={!selectedInspection}
            >
              <Camera className="h-4 w-4 mr-2" />
              Simulate Capture
            </Button>

            <Button 
              onClick={testSync}
              disabled={simulatedOffline || isSyncing}
            >
              <Upload className="h-4 w-4 mr-2" />
              Test Sync
            </Button>

            <Button variant="outline" onClick={loadCachedData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>

            <Button variant="destructive" onClick={clearAllCache}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Cache
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="platform">
        <TabsList>
          <TabsTrigger value="platform">
            <Smartphone className="h-4 w-4 mr-2" />
            Platform Tests
          </TabsTrigger>
          <TabsTrigger value="inspections">Cached Inspections</TabsTrigger>
          <TabsTrigger value="images">Offline Images</TabsTrigger>
          <TabsTrigger value="log">Test Log</TabsTrigger>
        </TabsList>

        <TabsContent value="platform">
          <PlatformCapabilityTester />
        </TabsContent>

        <TabsContent value="inspections">
          <Card>
            <CardContent className="pt-6">
              {cachedInspections.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No inspections cached. Select an inspection and click "Cache" to begin testing.
                </p>
              ) : (
                <div className="space-y-4">
                  {cachedInspections.map((inspection) => (
                    <div 
                      key={inspection.id}
                      className="p-4 border rounded-lg space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">{inspection.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {inspection.site_data?.clientName} / {inspection.site_data?.siteName}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {inspection.pending_changes ? (
                            <Badge variant="destructive">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending Changes
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Synced
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <p>ID: {inspection.id}</p>
                        <p>Cached: {new Date(inspection.cached_at).toLocaleString()}</p>
                        <p>Template: {inspection.template?.name || 'None'} ({inspection.template_category})</p>
                        <p>Sections in JSON: {Object.keys(inspection.json_data || {}).join(', ') || 'Empty'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images">
          <Card>
            <CardContent className="pt-6">
              {offlineImages.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No offline images. Use "Simulate Capture" to create test images.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-7 gap-2 p-2 bg-muted rounded text-xs font-medium">
                    <span>File Name</span>
                    <span>Section</span>
                    <span>Item</span>
                    <span>Size</span>
                    <span>Status</span>
                    <span>Created</span>
                    <span>Uploaded URL</span>
                  </div>
                  {offlineImages.map((image) => (
                    <div key={image.id} className="grid grid-cols-7 gap-2 p-2 border-b text-xs">
                      <span className="truncate font-mono">{image.file_name}</span>
                      <span className="truncate">{image.section_key}</span>
                      <span className="truncate">{image.item_key || '-'}</span>
                      <span>{formatBytes(image.blob_size)}</span>
                      <span>
                        {image.synced ? (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Synced
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </span>
                      <span>{new Date(image.created_at).toLocaleString()}</span>
                      <span className="truncate">
                        {image.uploaded_url ? (
                          <a 
                            href={image.uploaded_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            View
                          </a>
                        ) : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log">
          <Card>
            <CardContent className="pt-6">
              <ScrollArea className="h-[400px]">
                {testLog.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No log entries yet. Start testing to see activity.
                  </p>
                ) : (
                  <div className="space-y-1 font-mono text-xs">
                    {testLog.map((entry, idx) => (
                      <div 
                        key={idx}
                        className={`p-1 ${entry.includes('ERROR') ? 'text-red-500' : entry.includes('✓') ? 'text-green-500' : ''}`}
                      >
                        {entry}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
