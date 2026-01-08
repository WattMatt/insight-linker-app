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

  // Search for matching image file in the inspection folder - now with proper path matching
  const findMatchingImage = useCallback(async (url: string): Promise<string | null> => {
    const storageInfo = extractStorageInfo(url);
    if (!storageInfo) return null;
    
    try {
      const pathParts = storageInfo.path.split('/');
      const inspectionId = pathParts[0];
      
      if (!inspectionId) return null;

      // Extract what we're looking for from the old path format (e.g., "2/1" means section 2, item 1)
      const oldSectionIndex = pathParts[1];
      const oldItemIndex = pathParts[2];

      // Map old section indexes to semantic folder names
      const sectionMap: Record<string, string> = {
        '0': 'normalBoardImages',
        '1': 'emergencyBoardImages', 
        '2': 'componentImages',
        '3': 'normalWiringImages',
        '4': 'emergencyWiringImages'
      };

      // Try to find the file in the semantic folder structure
      const semanticSection = sectionMap[oldSectionIndex];
      if (semanticSection) {
        // List contents of the semantic section folder
        const { data: sectionItems } = await supabase.storage
          .from(storageInfo.bucket)
          .list(`${inspectionId}/${semanticSection}`, { limit: 50 });

        if (sectionItems) {
          // Look for item folders or direct images
          for (const item of sectionItems) {
            // If it's an image file at this level, return it
            if (/\.(jpg|jpeg|png|webp)$/i.test(item.name)) {
              const { data: urlData } = supabase.storage
                .from(storageInfo.bucket)
                .getPublicUrl(`${inspectionId}/${semanticSection}/${item.name}`);
              return urlData.publicUrl;
            }
            
            // If it's a subfolder, look inside it
            if (item.id === null) {
              const { data: subFiles } = await supabase.storage
                .from(storageInfo.bucket)
                .list(`${inspectionId}/${semanticSection}/${item.name}`, { limit: 20 });
              
              if (subFiles) {
                const imageFile = subFiles.find(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name));
                if (imageFile) {
                  const { data: urlData } = supabase.storage
                    .from(storageInfo.bucket)
                    .getPublicUrl(`${inspectionId}/${semanticSection}/${item.name}/${imageFile.name}`);
                  return urlData.publicUrl;
                }
              }
            }
          }
        }
      }

      // Fallback: search all semantic folders for any image
      const semanticFolders = ['normalBoardImages', 'emergencyBoardImages', 'componentImages', 'normalWiringImages', 'emergencyWiringImages'];
      
      for (const folder of semanticFolders) {
        const { data: items } = await supabase.storage
          .from(storageInfo.bucket)
          .list(`${inspectionId}/${folder}`, { limit: 20 });

        if (items) {
          for (const item of items) {
            if (/\.(jpg|jpeg|png|webp)$/i.test(item.name)) {
              const { data: urlData } = supabase.storage
                .from(storageInfo.bucket)
                .getPublicUrl(`${inspectionId}/${folder}/${item.name}`);
              return urlData.publicUrl;
            }
            
            if (item.id === null) {
              const { data: subFiles } = await supabase.storage
                .from(storageInfo.bucket)
                .list(`${inspectionId}/${folder}/${item.name}`, { limit: 10 });
              
              if (subFiles) {
                const imageFile = subFiles.find(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name));
                if (imageFile) {
                  const { data: urlData } = supabase.storage
                    .from(storageInfo.bucket)
                    .getPublicUrl(`${inspectionId}/${folder}/${item.name}/${imageFile.name}`);
                  return urlData.publicUrl;
                }
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
    
    // Strategy 1: Try finding matching image in the inspection folder
    if (!attemptedFixes.includes('search')) {
      const foundUrl = await findMatchingImage(src);
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
    
    // Try finding matching image first on manual retry
    const foundUrl = await findMatchingImage(src);
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
