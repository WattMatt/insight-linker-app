import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, RefreshCw, ImageOff } from 'lucide-react';
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
 * Attempts to find similar files in storage when exact path fails
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

  // Try to find a similar file in the same folder
  const findSimilarFile = useCallback(async (url: string): Promise<string | null> => {
    const storageInfo = extractStorageInfo(url);
    if (!storageInfo) return null;
    
    try {
      const pathParts = storageInfo.path.split('/');
      const fileName = pathParts.pop() || '';
      const folderPath = pathParts.join('/');
      
      // List files in the folder
      const { data: files, error } = await supabase.storage
        .from(storageInfo.bucket)
        .list(folderPath, { limit: 100 });
      
      if (error || !files || files.length === 0) return null;
      
      // Look for any jpg/png file in the folder (prioritize files with similar index)
      const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name));
      
      if (imageFiles.length === 0) return null;
      
      // Extract the index from original filename (e.g., "_1.jpg" -> "1")
      const indexMatch = fileName.match(/_(\d+)\.(jpg|jpeg|png|webp)$/i);
      const targetIndex = indexMatch ? indexMatch[1] : '1';
      
      // Find file with same index or just use first available
      let matchedFile = imageFiles.find(f => f.name.includes(`_${targetIndex}.`));
      if (!matchedFile) {
        matchedFile = imageFiles[0];
      }
      
      const newPath = `${folderPath}/${matchedFile.name}`;
      const { data: urlData } = supabase.storage
        .from(storageInfo.bucket)
        .getPublicUrl(newPath);
      
      return urlData.publicUrl;
    } catch (err) {
      console.error('Error finding similar file:', err);
      return null;
    }
  }, [extractStorageInfo]);

  // Get signed URL as fallback
  const getSignedUrl = useCallback(async (url: string): Promise<string | null> => {
    const storageInfo = extractStorageInfo(url);
    if (!storageInfo) return null;
    
    try {
      const { data, error } = await supabase.storage
        .from(storageInfo.bucket)
        .createSignedUrl(storageInfo.path, 3600);
      
      if (error) return null;
      return data.signedUrl;
    } catch {
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
    
    const currentAttempt = attemptedFixes.length;
    
    // Strategy 1: Try finding a similar file in the same folder
    if (currentAttempt === 0 && !attemptedFixes.includes('similar')) {
      const similarUrl = await findSimilarFile(src);
      if (similarUrl && mountedRef.current) {
        console.log('Found similar file:', similarUrl);
        setAttemptedFixes(prev => [...prev, 'similar']);
        setImageSrc(similarUrl);
        setImageState('loading');
        return;
      }
    }
    
    // Strategy 2: Try signed URL
    if (!attemptedFixes.includes('signed')) {
      const signedUrl = await getSignedUrl(imageSrc);
      if (signedUrl && mountedRef.current) {
        console.log('Trying signed URL');
        setAttemptedFixes(prev => [...prev, 'signed']);
        setImageSrc(signedUrl);
        setImageState('loading');
        return;
      }
    }
    
    // Strategy 3: Simple retry with cache busting
    if (retries < retryCount) {
      setTimeout(() => {
        if (!mountedRef.current) return;
        setRetries(prev => prev + 1);
        const baseUrl = src.split('?')[0];
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
    setAttemptedFixes([]);
    
    // Try finding similar file first on manual retry
    const similarUrl = await findSimilarFile(src);
    if (similarUrl) {
      setImageSrc(similarUrl);
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
