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
 * Automatically finds the correct image when URLs don't match actual files
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
  const extractStorageInfo = useCallback((url: string): { bucket: string; path: string } | null => {
    if (!url) return null;
    try {
      const patterns = [
        /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/,
        /supabase\.co\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/
      ];
      
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return { bucket: match[1], path: decodeURIComponent(match[2].split('?')[0]) };
        }
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Find the actual image in the folder (handles renamed files)
  const findActualImage = useCallback(async (url: string): Promise<string | null> => {
    const storageInfo = extractStorageInfo(url);
    if (!storageInfo) return null;
    
    try {
      // Get the folder path (everything except the filename)
      const pathParts = storageInfo.path.split('/');
      const fileName = pathParts.pop(); // Remove filename
      const folderPath = pathParts.join('/');
      
      if (!folderPath) return null;

      // List files in the folder
      const { data: files, error } = await supabase.storage
        .from(storageInfo.bucket)
        .list(folderPath, { limit: 20, sortBy: { column: 'created_at', order: 'desc' } });

      if (error || !files || files.length === 0) return null;

      // Find the most recent image file
      const imageFile = files.find(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name));
      
      if (imageFile) {
        const { data: urlData } = supabase.storage
          .from(storageInfo.bucket)
          .getPublicUrl(`${folderPath}/${imageFile.name}`);
        return urlData.publicUrl;
      }
      
      return null;
    } catch (err) {
      console.error('Error finding actual image:', err);
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
    
    // Strategy 1: Find the actual image in the same folder
    if (!hasAttemptedFix) {
      setHasAttemptedFix(true);
      const foundUrl = await findActualImage(src);
      if (foundUrl && mountedRef.current) {
        console.log('Found actual image at:', foundUrl);
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
    
    // Try finding the actual image first
    const foundUrl = await findActualImage(src);
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
