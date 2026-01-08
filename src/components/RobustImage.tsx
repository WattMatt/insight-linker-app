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
 * Handles public bucket URLs directly without needing signed URLs
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
  const [attemptedFixes, setAttemptedFixes] = useState<string[]>([]);
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

  // Search for any image file in the inspection folder
  const findAnyImageInInspection = useCallback(async (url: string): Promise<string | null> => {
    const storageInfo = extractStorageInfo(url);
    if (!storageInfo) return null;
    
    try {
      const pathParts = storageInfo.path.split('/');
      const inspectionId = pathParts[0]; // First part is the inspection ID
      
      if (!inspectionId) return null;

      // List all folders under the inspection ID
      const { data: folders, error: folderError } = await supabase.storage
        .from(storageInfo.bucket)
        .list(inspectionId, { limit: 50 });

      if (folderError || !folders) return null;

      // Look through each folder for images
      for (const folder of folders) {
        if (folder.id === null) continue; // Skip if it's a file, not a folder
        
        const folderPath = `${inspectionId}/${folder.name}`;
        const { data: subFolders } = await supabase.storage
          .from(storageInfo.bucket)
          .list(folderPath, { limit: 50 });

        if (subFolders) {
          for (const subItem of subFolders) {
            // Check if it's an image file
            if (/\.(jpg|jpeg|png|webp)$/i.test(subItem.name)) {
              const filePath = `${folderPath}/${subItem.name}`;
              const { data: urlData } = supabase.storage
                .from(storageInfo.bucket)
                .getPublicUrl(filePath);
              return urlData.publicUrl;
            }
            
            // If it's a subfolder, check inside it
            if (subItem.id === null) continue;
            const subFolderPath = `${folderPath}/${subItem.name}`;
            const { data: files } = await supabase.storage
              .from(storageInfo.bucket)
              .list(subFolderPath, { limit: 20 });
            
            if (files) {
              const imageFile = files.find(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name));
              if (imageFile) {
                const filePath = `${subFolderPath}/${imageFile.name}`;
                const { data: urlData } = supabase.storage
                  .from(storageInfo.bucket)
                  .getPublicUrl(filePath);
                return urlData.publicUrl;
              }
            }
          }
        }
      }
      
      return null;
    } catch (err) {
      console.error('Error finding image in inspection:', err);
      return null;
    }
  }, [extractStorageInfo]);

  useEffect(() => {
    mountedRef.current = true;
    setImageState('loading');
    setRetries(0);
    setImageSrc(src);
    setAttemptedFixes([]);
    
    return () => {
      mountedRef.current = false;
    };
  }, [src]);

  const handleError = async () => {
    if (!mountedRef.current) return;
    
    // Strategy 1: Try finding any image in the inspection folder
    if (!attemptedFixes.includes('search')) {
      const foundUrl = await findAnyImageInInspection(src);
      if (foundUrl && mountedRef.current) {
        console.log('Found alternative image:', foundUrl);
        setAttemptedFixes(prev => [...prev, 'search']);
        setImageSrc(foundUrl);
        setImageState('loading');
        return;
      }
    }
    
    // Strategy 2: Simple retry with cache busting
    if (retries < retryCount && !attemptedFixes.includes('retry')) {
      setTimeout(() => {
        if (!mountedRef.current) return;
        setRetries(prev => prev + 1);
        const baseUrl = src.split('?')[0];
        setImageSrc(`${baseUrl}?t=${Date.now()}`);
        setImageState('loading');
      }, 500 * (retries + 1));
      setAttemptedFixes(prev => [...prev, 'retry']);
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
    setAttemptedFixes([]);
    
    // Try finding any image first on manual retry
    const foundUrl = await findAnyImageInInspection(src);
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
