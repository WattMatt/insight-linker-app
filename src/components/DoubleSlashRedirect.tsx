import { useEffect } from 'react';
import { useNavigate, useLocation } from '@/lib/navigation';

/**
 * Component to handle and redirect URLs with double slashes (from legacy QR codes)
 * Wraps the app to check and fix any malformed URLs on navigation
 */
export const DoubleSlashRedirect = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Get the full path including any leading slashes
    const fullPath = window.location.pathname;
    
    // Check if the URL has double slashes or starts with extra slashes
    if (fullPath.includes('//')) {
      // Clean up the path by removing consecutive slashes
      const cleanPath = fullPath.replace(/\/+/g, '/');
      console.log('Redirecting from malformed URL:', fullPath, 'to:', cleanPath);
      
      // Replace the current URL with the cleaned version
      window.location.replace(cleanPath + window.location.search + window.location.hash);
    }
  }, [location.pathname]);

  return <>{children}</>;
};
