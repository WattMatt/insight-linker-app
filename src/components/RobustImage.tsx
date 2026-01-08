import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
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
 * Falls back to signed URLs when public URLs fail
 */
export const RobustImage = ({ 
  src, 
  alt, 
  className = '', 
  onError,
  onClick,
  retryCount = 3 
}: RobustImageProps) => {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retries, setRetries] = useState(0);
  const [imageSrc, setImageSrc] = useState(src);
  const [usedSignedUrl, setUsedSignedUrl] = useState(false);

  // Extract bucket and path from Supabase storage URL
  const extractStorageInfo = useCallback((url: string): { bucket: string; path: string } | null => {
    try {
      // Handle different Supabase URL formats
      // Format 1: /storage/v1/object/public/bucket/path
      // Format 2: /storage/v1/object/sign/bucket/path
      const patterns = [
        /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/,
        /supabase\.co\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/
      ];
      
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return { bucket: match[1], path: decodeURIComponent(match[2]) };
        }
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Get signed URL as fallback
  const getSignedUrl = useCallback(async (url: string): Promise<string | null> => {
    const storageInfo = extractStorageInfo(url);
    if (!storageInfo) return null;
    
    try {
      const { data, error } = await supabase.storage
        .from(storageInfo.bucket)
        .createSignedUrl(storageInfo.path, 3600); // 1 hour expiry
      
      if (error) {
        console.error('Failed to create signed URL:', error);
        return null;
      }
      
      return data.signedUrl;
    } catch (err) {
      console.error('Error creating signed URL:', err);
      return null;
    }
  }, [extractStorageInfo]);

  // Check if file exists in storage
  const checkFileExists = useCallback(async (url: string): Promise<boolean> => {
    const storageInfo = extractStorageInfo(url);
    if (!storageInfo) return false;
    
    try {
      // Try to get file metadata
      const pathParts = storageInfo.path.split('/');
      const fileName = pathParts.pop() || '';
      const folderPath = pathParts.join('/');
      
      const { data, error } = await supabase.storage
        .from(storageInfo.bucket)
        .list(folderPath, {
          search: fileName
        });
      
      if (error) return false;
      return data?.some(file => file.name === fileName) || false;
    } catch {
      return false;
    }
  }, [extractStorageInfo]);

  useEffect(() => {
    // Reset state when src changes
    setImageState('loading');
    setRetries(0);
    setImageSrc(src);
    setUsedSignedUrl(false);
  }, [src]);

  const handleError = async () => {
    console.warn('Image failed to load:', imageSrc, 'Retries:', retries);
    
    // First, try signed URL if we haven't already
    if (!usedSignedUrl && retries === 0) {
      console.log('Trying signed URL for:', src);
      const signedUrl = await getSignedUrl(src);
      if (signedUrl) {
        setUsedSignedUrl(true);
        setImageSrc(signedUrl);
        setImageState('loading');
        return;
      }
    }
    
    if (retries < retryCount) {
      // Check if file exists before retrying
      const exists = await checkFileExists(src);
      if (!exists) {
        console.warn('File does not exist in storage:', src);
        setImageState('error');
        onError?.();
        return;
      }
      
      // Retry with exponential backoff
      setTimeout(() => {
        console.log(`Retrying image load (attempt ${retries + 1}/${retryCount}):`, src);
        setRetries(prev => prev + 1);
        // Add cache busting
        const baseUrl = usedSignedUrl ? imageSrc.split('?')[0] : src;
        setImageSrc(`${baseUrl}${baseUrl.includes('?') ? '&' : '?'}retry=${retries + 1}&t=${Date.now()}`);
        setImageState('loading');
      }, Math.pow(2, retries) * 500);
    } else {
      console.error('Image failed after all retries:', src);
      setImageState('error');
      onError?.();
    }
  };

  const handleLoad = () => {
    setImageState('loaded');
  };

  const handleManualRetry = async () => {
    setImageState('loading');
    setRetries(0);
    setUsedSignedUrl(false);
    
    // Try signed URL first on manual retry
    const signedUrl = await getSignedUrl(src);
    if (signedUrl) {
      setUsedSignedUrl(true);
      setImageSrc(signedUrl);
    } else {
      setImageSrc(`${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`);
    }
  };

  if (imageState === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted gap-2 p-2 ${className}`}>
        <AlertCircle className="h-6 w-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground text-center">Failed to load</p>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 text-xs"
          onClick={handleManualRetry}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      {imageState === 'loading' && (
        <div className={`flex items-center justify-center bg-muted ${className}`}>
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
            {retries > 0 && (
              <p className="text-xs text-muted-foreground">Retry {retries}/{retryCount}</p>
            )}
          </div>
        </div>
      )}
      <img
        src={imageSrc}
        alt={alt}
        className={`${className} ${onClick ? 'cursor-pointer' : ''}`}
        onLoad={handleLoad}
        onError={handleError}
        onClick={onClick}
        style={{ display: imageState === 'loaded' ? 'block' : 'none' }}
        loading="lazy"
        crossOrigin="anonymous"
      />
    </>
  );
};
