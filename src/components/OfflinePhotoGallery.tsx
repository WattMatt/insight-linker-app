import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Camera, RefreshCw, Trash2, WifiOff, Upload, Loader2,
  MapPin, Clock, Pause, Play, HardDrive
} from 'lucide-react';
import { useOfflinePhotos } from '@/hooks/useOfflinePhotos';
import type { OfflinePhotoType, OfflinePhotoContextType, OfflinePhoto } from '@/lib/offlineDB';

const ALL_PHOTO_TYPE_LABELS: Record<string, string> = {
  coc_document: 'COC Document',
  test_equipment_reading: 'Test Equipment',
  db_board: 'DB Board',
  installation_overview: 'Installation',
  signature: 'Signature',
  general_evidence: 'General Evidence',
  inspection_finding: 'Inspection Finding',
  inspection_snag: 'Snag / Defect',
  floor_plan_pin: 'Floor Plan Pin',
  floor_plan_overview: 'Floor Plan Overview',
  site_progress: 'Site Progress',
  document_scan: 'Document Scan',
};

interface OfflinePhotoGalleryProps {
  contextType: OfflinePhotoContextType;
  contextId: string;
  secondaryContextId?: string;
  photoTypes?: OfflinePhotoType[];
  allowCapture?: boolean;
  maxPhotos?: number;
  onPhotoLinked?: (photoId: string, remoteUrl: string) => void;
  title?: string;
  description?: string;
}

export function OfflinePhotoGallery({
  contextType,
  contextId,
  secondaryContextId,
  photoTypes,
  allowCapture = true,
  maxPhotos = 50,
  onPhotoLinked,
  title = 'Evidence Photos',
  description,
}: OfflinePhotoGalleryProps) {
  const {
    photos: allPhotos,
    pendingCount,
    pendingSizeBytes,
    isSyncing,
    isCapturing,
    isOnline,
    syncPaused,
    capturePhoto,
    syncPhotos,
    deletePhoto,
    getPhotoPreviewUrl,
    pauseSync,
    resumeSync,
  } = useOfflinePhotos(contextType, contextId);

  // Filter by secondaryContextId and photoTypes
  const photos = useMemo(() => {
    let filtered = allPhotos;
    if (secondaryContextId) {
      filtered = filtered.filter(p => p.secondary_context_id === secondaryContextId);
    }
    if (photoTypes && photoTypes.length > 0) {
      filtered = filtered.filter(p => photoTypes.includes(p.photo_type));
    }
    return filtered;
  }, [allPhotos, secondaryContextId, photoTypes]);

  const availableTypes = useMemo(() => {
    if (photoTypes && photoTypes.length > 0) return photoTypes;
    const contextDefaults: Record<OfflinePhotoContextType, OfflinePhotoType[]> = {
      coc: ['coc_document', 'test_equipment_reading', 'db_board', 'installation_overview', 'signature', 'general_evidence'],
      inspection: ['inspection_finding', 'inspection_snag', 'general_evidence'],
      floor_plan: ['floor_plan_pin', 'floor_plan_overview', 'general_evidence'],
      site: ['site_progress', 'general_evidence'],
      document: ['document_scan', 'general_evidence'],
    };
    return contextDefaults[contextType] || ['general_evidence'];
  }, [contextType, photoTypes]);

  const [selectedType, setSelectedType] = useState<OfflinePhotoType>(() => availableTypes[0] as OfflinePhotoType);
  const [notes, setNotes] = useState('');
  const [viewingPhoto, setViewingPhoto] = useState<OfflinePhoto | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  // FIX MEDIUM 5: Manage full-size viewer URL in useEffect with proper cleanup
  const [fullSizeUrl, setFullSizeUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!viewingPhoto) {
      setFullSizeUrl(null);
      return;
    }
    if (viewingPhoto.remote_url) {
      setFullSizeUrl(viewingPhoto.remote_url);
      return;
    }
    const url = URL.createObjectURL(viewingPhoto.file_blob);
    setFullSizeUrl(url);
    return () => { URL.revokeObjectURL(url); };
  }, [viewingPhoto]);

  useEffect(() => {
    const urls: Record<string, string> = {};
    photos.forEach(photo => { urls[photo.id] = getPhotoPreviewUrl(photo); });
    setPreviewUrls(urls);
    return () => {
      Object.values(urls).forEach(url => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
  }, [photos, getPhotoPreviewUrl]);

  // FIX MEDIUM 6: Track already-reported synced photo IDs to avoid repeated onPhotoLinked calls
  const reportedSyncIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!onPhotoLinked) return;
    photos.forEach(p => {
      if (p.synced && p.remote_url && !reportedSyncIds.current.has(p.id)) {
        reportedSyncIds.current.add(p.id);
        onPhotoLinked(p.id, p.remote_url);
      }
    });
  }, [photos, onPhotoLinked]);

  const handleCapture = async () => {
    if (photos.length >= maxPhotos) {
      return;
    }
    await capturePhoto(selectedType, { notes: notes.trim() || undefined, secondaryContextId });
    setNotes('');
  };

  const handleRetrySync = async (photo: OfflinePhoto) => {
    photo.retry_count = 0;
    photo.sync_error = null;
    const { offlineDB } = await import('@/lib/offlineDB');
    await offlineDB.saveOfflinePhoto(photo);
    await syncPhotos();
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Camera className="h-5 w-5" />
              {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-300">
              {pendingCount} pending
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Offline banner */}
        {!isOnline && (
          <Alert className="border-amber-300 bg-amber-500/10">
            <WifiOff className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700">
              Photos will sync automatically when connection is restored
            </AlertDescription>
          </Alert>
        )}

        {/* Capture controls */}
        {allowCapture && (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={selectedType} onValueChange={(v) => setSelectedType(v as OfflinePhotoType)}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {ALL_PHOTO_TYPE_LABELS[type] || type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleCapture}
                disabled={isCapturing || photos.length >= maxPhotos}
                className="min-h-[44px] flex-1 sm:flex-none"
              >
                {isCapturing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4 mr-2" />
                )}
                {isCapturing ? 'Capturing...' : 'Capture Photo'}
              </Button>
            </div>
            <Textarea
              placeholder="Add notes about this photo (optional)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </>
        )}

        {/* Sync controls */}
        {pendingCount > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncPhotos()}
              disabled={isSyncing || !isOnline || syncPaused}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {isSyncing ? 'Syncing...' : `Sync Now (${pendingCount})`}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={syncPaused ? resumeSync : pauseSync}
            >
              {syncPaused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
              {syncPaused ? 'Resume' : 'Pause'}
            </Button>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              ~{formatSize(pendingSizeBytes)} waiting
            </span>
          </div>
        )}

        {/* Photo grid */}
        {photos.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {photos.map(photo => (
              <div
                key={photo.id}
                className="relative aspect-square rounded-lg overflow-hidden border bg-muted cursor-pointer group"
                onClick={() => setViewingPhoto(photo)}
              >
                <img
                  src={previewUrls[photo.id] || ''}
                  alt={photo.file_name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute top-1 right-1">
                  {photo.synced ? (
                    <Badge className="bg-green-500 text-white text-[10px] px-1 py-0">✓</Badge>
                  ) : photo.sync_error ? (
                    <Badge variant="destructive" className="text-[10px] px-1 py-0">!</Badge>
                  ) : (
                    <Badge className="bg-amber-500 text-white text-[10px] px-1 py-0 animate-pulse">⏳</Badge>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                  <span className="text-[10px] text-white truncate block">
                    {ALL_PHOTO_TYPE_LABELS[photo.photo_type] || photo.photo_type}
                  </span>
                </div>
                {photo.sync_error && !photo.synced && (
                  <button
                    className="absolute top-1 left-1 bg-destructive text-white rounded-full p-0.5"
                    onClick={(e) => { e.stopPropagation(); handleRetrySync(photo); }}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Camera className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No photos captured yet</p>
          </div>
        )}

        {/* Full-size photo viewer dialog */}
        <Dialog open={!!viewingPhoto} onOpenChange={() => setViewingPhoto(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>{viewingPhoto ? (ALL_PHOTO_TYPE_LABELS[viewingPhoto.photo_type] || viewingPhoto.photo_type) : ''}</span>
                <div className="flex gap-2">
                  {viewingPhoto && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (viewingPhoto) { deletePhoto(viewingPhoto.id); setViewingPhoto(null); }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  )}
                </div>
              </DialogTitle>
            </DialogHeader>
            {viewingPhoto && fullSizeUrl && (
              <div className="space-y-3">
                <img
                  src={fullSizeUrl}
                  alt={viewingPhoto.file_name}
                  className="w-full rounded-lg max-h-[60vh] object-contain"
                />
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(viewingPhoto.captured_at).toLocaleString()}
                  </span>
                  {viewingPhoto.latitude && viewingPhoto.longitude && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {viewingPhoto.latitude.toFixed(5)}, {viewingPhoto.longitude.toFixed(5)}
                    </span>
                  )}
                  <span>{formatSize(viewingPhoto.file_size)}</span>
                  {viewingPhoto.synced ? (
                    <Badge className="bg-green-500 text-white text-[10px]">Synced</Badge>
                  ) : (
                    <Badge className="bg-amber-500 text-white text-[10px]">Pending</Badge>
                  )}
                </div>
                {viewingPhoto.notes && (
                  <p className="text-sm border-l-2 border-primary pl-3">{viewingPhoto.notes}</p>
                )}
                {viewingPhoto.sync_error && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs">
                      Sync error: {viewingPhoto.sync_error} (Retry {viewingPhoto.retry_count}/3)
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
