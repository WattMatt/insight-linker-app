import { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Trash2, Cloud, CloudOff, Loader2, X, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RobustImage } from '@/components/RobustImage';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { useCamera } from '@/hooks/useCamera';
import { toast } from 'sonner';

interface OfflineImage {
  id: string;
  blobUrl: string;
  synced: boolean;
}

interface OfflineImageGalleryProps {
  onlineImages: string[];
  offlineImages: OfflineImage[];
  onAddImage: (file: File | Blob) => Promise<string | null>;
  onDeleteOfflineImage?: (imageId: string) => Promise<boolean>;
  onDeleteOnlineImage?: (imageUrl: string) => Promise<boolean>;
  isOnline: boolean;
  disabled?: boolean;
  maxImages?: number;
  title?: string;
}

export function OfflineImageGallery({
  onlineImages,
  offlineImages,
  onAddImage,
  onDeleteOfflineImage,
  onDeleteOnlineImage,
  isOnline,
  disabled = false,
  maxImages = 50,
  title = 'Images'
}: OfflineImageGalleryProps) {
  const { isNative, takePicture, selectImages } = useCamera();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => {
      offlineImages.forEach(img => {
        if (img.blobUrl.startsWith('blob:')) {
          URL.revokeObjectURL(img.blobUrl);
        }
      });
    };
  }, []);

  const totalImages = onlineImages.length + offlineImages.length;

  const handleCapture = async () => {
    if (disabled) return;

    try {
      setIsUploading(true);

      if (isNative) {
        const result = await takePicture();
        if (result) {
          await onAddImage(result);
          toast.success('Photo captured');
        }
      } else {
        // Fallback to file input for web
        fileInputRef.current?.click();
      }
    } catch (error) {
      console.error('Error capturing image:', error);
      toast.error('Failed to capture image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsUploading(true);
    
    try {
      const files = Array.from(e.target.files);
      const remainingSlots = maxImages - totalImages;
      const filesToAdd = files.slice(0, remainingSlots);
      
      if (files.length > remainingSlots) {
        toast.warning(`Only ${remainingSlots} more image(s) can be added`);
      }

      for (const file of filesToAdd) {
        await onAddImage(file);
      }

      if (filesToAdd.length > 0) {
        toast.success(`${filesToAdd.length} image(s) added`);
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      toast.error('Failed to upload images');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteOffline = async (imageId: string) => {
    if (!onDeleteOfflineImage) return;
    
    setDeletingIds(prev => new Set(prev).add(imageId));
    
    try {
      const success = await onDeleteOfflineImage(imageId);
      if (success) {
        toast.success('Image removed');
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      toast.error('Failed to delete image');
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
    }
  };

  const handleDeleteOnline = async (imageUrl: string) => {
    if (!onDeleteOnlineImage) return;
    if (!confirm('Delete this image? This cannot be undone.')) return;
    
    try {
      const success = await onDeleteOnlineImage(imageUrl);
      if (success) {
        toast.success('Image deleted');
      }
    } catch (error) {
      console.error('Error deleting online image:', error);
      toast.error('Failed to delete image');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{title}</h3>
          <Badge variant="secondary" className="text-xs">
            {totalImages} / {maxImages}
          </Badge>
          {offlineImages.filter(img => !img.synced).length > 0 && (
            <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive">
              <CloudOff className="h-3 w-3 mr-1" />
              {offlineImages.filter(img => !img.synced).length} pending sync
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCapture}
            disabled={disabled || isUploading || totalImages >= maxImages}
            className="gap-1"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {isNative ? 'Take Photo' : 'Add Photo'}
          </Button>
          
          {!isNative && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading || totalImages >= maxImages}
              className="gap-1"
            >
              <Upload className="h-4 w-4" />
              Upload
            </Button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      {totalImages === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
          <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No images yet</p>
          <p className="text-xs mt-1">
            {isNative ? 'Tap "Take Photo" to capture an image' : 'Click "Add Photo" or drag images here'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {/* Online images */}
          {onlineImages.map((url, index) => (
            <div
              key={`online-${index}`}
              className="relative aspect-square rounded-lg overflow-hidden group border bg-muted"
            >
              <RobustImage
                src={url}
                alt={`Image ${index + 1}`}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setViewingImage(url)}
              />
              
              <div className="absolute top-2 left-2">
                <Badge variant="secondary" className="text-xs bg-accent text-accent-foreground">
                  <Cloud className="h-3 w-3 mr-1" />
                  Synced
                </Badge>
              </div>

              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8"
                  onClick={() => setViewingImage(url)}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                {onDeleteOnlineImage && isOnline && (
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-8 w-8"
                    onClick={() => handleDeleteOnline(url)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {/* Offline images */}
          {offlineImages.map((img) => (
            <div
              key={img.id}
              className="relative aspect-square rounded-lg overflow-hidden group border bg-muted"
            >
              <img
                src={img.blobUrl}
                alt="Offline image"
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setViewingImage(img.blobUrl)}
              />
              
              <div className="absolute top-2 left-2">
                <Badge 
                  variant="secondary" 
                  className={`text-xs ${
                    img.synced 
                      ? 'bg-accent text-accent-foreground' 
                      : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {img.synced ? (
                    <>
                      <Cloud className="h-3 w-3 mr-1" />
                      Synced
                    </>
                  ) : (
                    <>
                      <CloudOff className="h-3 w-3 mr-1" />
                      Offline
                    </>
                  )}
                </Badge>
              </div>

              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8"
                  onClick={() => setViewingImage(img.blobUrl)}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                {onDeleteOfflineImage && !img.synced && (
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-8 w-8"
                    onClick={() => handleDeleteOffline(img.id)}
                    disabled={deletingIds.has(img.id)}
                  >
                    {deletingIds.has(img.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingImage && (
        <FullscreenImageViewer
          src={viewingImage}
          onClose={() => setViewingImage(null)}
        />
      )}
    </div>
  );
}
