import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, ImageOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';

interface RobustImageProps {
  src: string;
  alt: string;
  className?: string;
  onError?: () => void;
  onClick?: () => void;
  retryCount?: number;
}

/**
 * A robust image component that handles loading states, errors, and retries
 * Finds the correct image file when URL doesn't match actual storage filename
 */
export const RobustImage = ({ 
  src, 
  alt, 
  className = '', 
  onError,
  onClick,
  retryCount = 2 
}: RobustImageProps) => {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retries, setRetries] = useState(0);
  const [imageSrc, setImageSrc] = useState(src);
  const [hasAttemptedFix, setHasAttemptedFix] = useState(false);
  const mountedRef = useRef(true);

  // Extract bucket and path from Supabase storage URL
  const extractStorageInfo = useCallback((url: string): { bucket: string; path: string; fileName: string } | null => {
    if (!url) return null;
    try {
      const patterns = [
        /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/,
        /supabase\.co\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/
      ];
      
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          const fullPath = decodeURIComponent(match[2].split('?')[0]);
          const pathParts = fullPath.split('/');
          const fileName = pathParts.pop() || '';
          return { bucket: match[1], path: fullPath, fileName };
        }
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Find the correct image file in the folder based on the expected filename pattern
  const findCorrectImage = useCallback(async (url: string): Promise<string | null> => {
    const storageInfo = extractStorageInfo(url);
    if (!storageInfo) return null;
    
    try {
      // Get the folder path (everything except the filename)
      const pathParts = storageInfo.path.split('/');
      pathParts.pop(); // Remove filename
      const folderPath = pathParts.join('/');
      
      if (!folderPath) return null;

      // Extract the unique identifier from the expected filename
      // Pattern: ..._SECTION_ITEM_TIMESTAMP_INDEX.jpg
      // e.g., YARONA_CENTRE_YARONA_CENTRE_LV_ROOM_0_0_1767777711001_1.jpg
      const fileNameMatch = storageInfo.fileName.match(/_(\d+)_(\d+)_(\d+)_(\d+)\.(jpg|jpeg|png|webp|gif)$/i);
      
      // List files in the folder
      const { data: files, error } = await supabase.storage
        .from(storageInfo.bucket)
        .list(folderPath, { limit: 100, sortBy: { column: 'created_at', order: 'asc' } });

      if (error || !files || files.length === 0) return null;

      // Filter to only image files
      const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name));
      
      if (imageFiles.length === 0) return null;

      // If we found the pattern, try to match by the index number (the _1, _2, _3 at the end)
      if (fileNameMatch) {
        const expectedIndex = parseInt(fileNameMatch[4], 10);
        // Get the image at the expected index (0-based, but filenames use 1-based)
        const targetIndex = expectedIndex - 1;
        if (targetIndex >= 0 && targetIndex < imageFiles.length) {
          const targetFile = imageFiles[targetIndex];
          const { data: urlData } = supabase.storage
            .from(storageInfo.bucket)
            .getPublicUrl(`${folderPath}/${targetFile.name}`);
          return urlData.publicUrl;
        }
      }

      // Fallback: return the first image if only one exists
      if (imageFiles.length === 1) {
        const { data: urlData } = supabase.storage
          .from(storageInfo.bucket)
          .getPublicUrl(`${folderPath}/${imageFiles[0].name}`);
        return urlData.publicUrl;
      }
      
      return null;
    } catch (err) {
      console.error('Error finding correct image:', err);
      return null;
    }
  }, [extractStorageInfo]);

  useEffect(() => {
    mountedRef.current = true;
    setImageState('loading');
    setRetries(0);
    setImageSrc(src);
    setHasAttemptedFix(false);
    
    return () => {
      mountedRef.current = false;
    };
  }, [src]);

  const handleError = async () => {
    if (!mountedRef.current) return;
    
    // Strategy 1: Find the correct image in the same folder
    if (!hasAttemptedFix) {
      setHasAttemptedFix(true);
      const foundUrl = await findCorrectImage(src);
      if (foundUrl && mountedRef.current) {
        console.log('Found correct image at:', foundUrl);
        setImageSrc(foundUrl);
        setImageState('loading');
        return;
      }
    }
    
    // Strategy 2: Simple retry with cache busting
    if (retries < retryCount) {
      setTimeout(() => {
        if (!mountedRef.current) return;
        setRetries(prev => prev + 1);
        const baseUrl = imageSrc.split('?')[0];
        setImageSrc(`${baseUrl}?t=${Date.now()}`);
        setImageState('loading');
      }, 500 * (retries + 1));
      return;
    }
    
    // All strategies failed
    if (mountedRef.current) {
      setImageState('error');
      onError?.();
    }
  };

  const handleLoad = () => {
    if (mountedRef.current) {
      setImageState('loaded');
    }
  };

  const handleManualRetry = async () => {
    setImageState('loading');
    setRetries(0);
    setHasAttemptedFix(false);
    
    // Try finding the correct image first
    const foundUrl = await findCorrectImage(src);
    if (foundUrl) {
      setImageSrc(foundUrl);
    } else {
      setImageSrc(`${src.split('?')[0]}?t=${Date.now()}`);
    }
  };

  if (imageState === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted gap-1 p-2 min-h-[60px] ${className}`}>
        <ImageOff className="h-5 w-5 text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground">Image unavailable</p>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-5 text-[10px] px-2"
          onClick={handleManualRetry}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {imageState === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      <img
        key={imageSrc}
        src={imageSrc}
        alt={alt}
        className={`w-full h-full object-cover ${onClick ? 'cursor-pointer' : ''} ${imageState !== 'loaded' ? 'opacity-0' : 'opacity-100'}`}
        onLoad={handleLoad}
        onError={handleError}
        onClick={onClick}
      />
    </div>
  );
};
