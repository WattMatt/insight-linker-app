import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Camera, RefreshCw, Trash2, WifiOff, Upload, Loader2, MapPin, Clock, Eye, X } from 'lucide-react';
import { useOfflineCOCPhotos } from '@/hooks/useOfflineCOCPhotos';
import type { COCPhotoType, OfflineCOCPhoto } from '@/lib/offlineDB';

const PHOTO_TYPE_LABELS: Record<COCPhotoType, string> = {
  coc_document: 'COC Document',
  test_equipment_reading: 'Test Equipment',
  db_board: 'DB Board',
  installation_overview: 'Installation',
  signature: 'Signature',
  general_evidence: 'General'
};

interface COCPhotoCaptureProps {
  subsectionId: string;
  cocValidationId?: string;
}

export function COCPhotoCapture({ subsectionId, cocValidationId }: COCPhotoCaptureProps) {
  const {
    photos,
    pendingCount,
    isSyncing,
    isCapturing,
    isOnline,
    capturePhoto,
    syncPhotos,
    deletePhoto,
    getPhotoPreviewUrl
  } = useOfflineCOCPhotos(subsectionId);

  const [photoType, setPhotoType] = useState<COCPhotoType>('general_evidence');
  const [notes, setNotes] = useState('');
  const [viewingPhoto, setViewingPhoto] = useState<OfflineCOCPhoto | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  // Generate preview URLs for all photos
  useEffect(() => {
    const urls: Record<string, string> = {};
    photos.forEach(photo => {
      urls[photo.id] = getPhotoPreviewUrl(photo);
    });
    setPreviewUrls(urls);

    return () => {
      // Only revoke blob URLs (not remote URLs)
      Object.values(urls).forEach(url => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
  }, [photos, getPhotoPreviewUrl]);

  const handleCapture = async () => {
    await capturePhoto(photoType, {
      notes: notes.trim() || undefined,
      cocValidationId
    });
    setNotes('');
  };

  const handleRetrySync = async (photo: OfflineCOCPhoto) => {
    // Reset retry count and sync error, then trigger sync
    photo.retry_count = 0;
    photo.sync_error = null;
    const { offlineDB } = await import('@/lib/offlineDB');
    await offlineDB.saveCOCPhoto(photo);
    await syncPhotos();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Evidence Photos
            </CardTitle>
            <CardDescription>Capture photos of COC documents, equipment, and installations</CardDescription>
          </div>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-300">
              {pendingCount} pending sync
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
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={photoType} onValueChange={(v) => setPhotoType(v as COCPhotoType)}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PHOTO_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleCapture}
            disabled={isCapturing}
            className="min-h-[44px] flex-1 sm:flex-none"
          >
            {isCapturing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Camera className="h-4 w-4 mr-2" />
            )}
            {isCapturing ? 'Capturing...' : 'Capture Evidence Photo'}
          </Button>
        </div>

        {/* Optional notes */}
        <Textarea
          placeholder="Add notes about this photo (optional)..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="resize-none"
        />

        {/* Sync controls */}
        {pendingCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncPhotos()}
            disabled={isSyncing || !isOnline}
            className="w-full sm:w-auto"
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {isSyncing ? 'Syncing...' : `Sync Now (${pendingCount})`}
          </Button>
        )}

        {/* Photo grid */}
        {photos.length > 0 && (
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
                {/* Sync status badge */}
                <div className="absolute top-1 right-1">
                  {photo.synced ? (
                    <Badge className="bg-green-500 text-white text-[10px] px-1 py-0">✓</Badge>
                  ) : photo.sync_error ? (
                    <Badge variant="destructive" className="text-[10px] px-1 py-0">!</Badge>
                  ) : (
                    <Badge className="bg-amber-500 text-white text-[10px] px-1 py-0 animate-pulse">⏳</Badge>
                  )}
                </div>
                {/* Photo type badge */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                  <span className="text-[10px] text-white truncate block">
                    {PHOTO_TYPE_LABELS[photo.photo_type]}
                  </span>
                </div>
                {/* Retry button for failed */}
                {photo.sync_error && !photo.synced && (
                  <button
                    className="absolute top-1 left-1 bg-destructive text-white rounded-full p-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRetrySync(photo);
                    }}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {photos.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Camera className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No evidence photos captured yet</p>
          </div>
        )}

        {/* Full-size photo dialog */}
        <Dialog open={!!viewingPhoto} onOpenChange={() => setViewingPhoto(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>{viewingPhoto ? PHOTO_TYPE_LABELS[viewingPhoto.photo_type] : ''}</span>
                <div className="flex gap-2">
                  {viewingPhoto && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (viewingPhoto) {
                          deletePhoto(viewingPhoto.id);
                          setViewingPhoto(null);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  )}
                </div>
              </DialogTitle>
            </DialogHeader>
            {viewingPhoto && (
              <div className="space-y-3">
                <img
                  src={viewingPhoto.remote_url || URL.createObjectURL(viewingPhoto.file_blob)}
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
                  <span>{(viewingPhoto.file_size / 1024).toFixed(0)} KB</span>
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
