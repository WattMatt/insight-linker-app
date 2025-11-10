import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

interface RobustImageProps {
  src: string;
  alt: string;
  className?: string;
  onError?: () => void;
  retryCount?: number;
}

/**
 * A robust image component that handles loading states, errors, and retries
 */
export const RobustImage = ({ 
  src, 
  alt, 
  className = '', 
  onError,
  retryCount = 3 
}: RobustImageProps) => {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retries, setRetries] = useState(0);
  const [imageSrc, setImageSrc] = useState(src);

  useEffect(() => {
    // Reset state when src changes
    setImageState('loading');
    setRetries(0);
    setImageSrc(src);
  }, [src]);

  const handleError = () => {
    console.error('Image failed to load:', imageSrc, 'Retries:', retries);
    
    if (retries < retryCount) {
      // Retry with exponential backoff
      setTimeout(() => {
        console.log(`Retrying image load (attempt ${retries + 1}/${retryCount}):`, src);
        setRetries(prev => prev + 1);
        setImageSrc(`${src}?retry=${retries + 1}&t=${Date.now()}`);
        setImageState('loading');
      }, Math.pow(2, retries) * 500);
    } else {
      console.error('Image failed after all retries:', src);
      setImageState('error');
      onError?.();
    }
  };

  const handleLoad = () => {
    console.log('Image loaded successfully:', src);
    setImageState('loaded');
  };

  if (imageState === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted ${className}`}>
        <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-xs text-muted-foreground text-center px-2">Failed to load</p>
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
              <p className="text-xs text-muted-foreground">Retry {retries}</p>
            )}
          </div>
        </div>
      )}
      <img
        src={imageSrc}
        alt={alt}
        className={className}
        onLoad={handleLoad}
        onError={handleError}
        style={{ display: imageState === 'loaded' ? 'block' : 'none' }}
      />
    </>
  );
};
