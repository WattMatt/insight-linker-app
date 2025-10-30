import { useState, useEffect } from 'react';
import { AlertCircle, ImageIcon } from 'lucide-react';

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
    // Add cache busting parameter
    const cacheBuster = `cb=${Date.now()}`;
    const separator = src.includes('?') ? '&' : '?';
    setImageSrc(`${src}${separator}${cacheBuster}`);
  }, [src]);

  const handleError = () => {
    console.error('Image failed to load:', imageSrc);
    
    if (retries < retryCount) {
      // Retry with exponential backoff
      setTimeout(() => {
        console.log(`Retrying image load (attempt ${retries + 1}/${retryCount})`);
        setRetries(prev => prev + 1);
        const cacheBuster = `cb=${Date.now()}_retry${retries + 1}`;
        const separator = src.includes('?') ? '&' : '?';
        setImageSrc(`${src}${separator}${cacheBuster}`);
        setImageState('loading');
      }, Math.pow(2, retries) * 500);
    } else {
      setImageState('error');
      onError?.();
    }
  };

  const handleLoad = () => {
    console.log('Image loaded successfully:', imageSrc);
    setImageState('loaded');
  };

  if (imageState === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center bg-gray-100 rounded ${className}`}>
        <AlertCircle className="h-8 w-8 text-gray-400 mb-2" />
        <p className="text-xs text-gray-500 text-center px-2">Failed to load image</p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {imageState === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded z-10">
          <div className="flex flex-col items-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-2"></div>
            {retries > 0 && (
              <p className="text-xs text-gray-500">Retry {retries}/{retryCount}</p>
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
        style={{ opacity: imageState === 'loaded' ? 1 : 0 }}
      />
    </div>
  );
};
