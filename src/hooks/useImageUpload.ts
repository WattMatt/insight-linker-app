import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UploadResult {
  url: string;
  path: string;
}

export const useImageUpload = () => {
  const [uploading, setUploading] = useState(false);

  /**
   * Uploads an image and returns a signed URL (more reliable than public URLs)
   * Includes retry logic and proper error handling
   */
  const uploadImage = async (
    file: File,
    bucket: string,
    path: string,
    retries = 3
  ): Promise<UploadResult | null> => {
    setUploading(true);

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Upload the file
        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          // If file already exists, try with a different timestamp
          if (error.message.includes('duplicate') || error.message.includes('already exists')) {
            const timestamp = Date.now();
            const ext = file.name.split('.').pop();
            const newPath = path.replace(/\.[^.]+$/, `_${timestamp}.${ext}`);
            return uploadImage(file, bucket, newPath, 1); // Don't retry on duplicate
          }
          throw error;
        }

        // Get a signed URL (valid for 1 year)
        const { data: signedData, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(data.path, 31536000); // 365 days

        if (signedError) {
          console.error('Error creating signed URL, falling back to public URL:', signedError);
          // Fallback to public URL
          const { data: publicData } = supabase.storage
            .from(bucket)
            .getPublicUrl(data.path);
          
          return {
            url: publicData.publicUrl,
            path: data.path
          };
        }

        console.log('Image uploaded successfully:', signedData.signedUrl);
        return {
          url: signedData.signedUrl,
          path: data.path
        };

      } catch (error: any) {
        console.error(`Upload attempt ${attempt} failed:`, error);
        
        if (attempt === retries) {
          // Last attempt failed
          if (error?.message?.includes('JWT') || 
              error?.message?.includes('signature verification') ||
              error?.statusCode === '408' ||
              error?.error === 'InvalidJWT') {
            toast.error('Your session has expired. Please refresh the page and try again.');
          } else {
            toast.error(`Failed to upload image after ${retries} attempts: ${error.message || 'Unknown error'}`);
          }
          setUploading(false);
          return null;
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
      }
    }

    setUploading(false);
    return null;
  };

  /**
   * Deletes an image from storage
   */
  const deleteImage = async (bucket: string, path: string): Promise<boolean> => {
    try {
      const { error } = await supabase.storage
        .from(bucket)
        .remove([path]);

      if (error) {
        console.error('Error deleting image:', error);
        toast.error('Failed to delete image');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting image:', error);
      toast.error('Failed to delete image');
      return false;
    }
  };

  /**
   * Refreshes a signed URL if it's close to expiring
   */
  const refreshSignedUrl = async (bucket: string, path: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 31536000); // 365 days

      if (error) {
        console.error('Error refreshing signed URL:', error);
        return null;
      }

      return data.signedUrl;
    } catch (error) {
      console.error('Error refreshing signed URL:', error);
      return null;
    }
  };

  /**
   * Extracts the storage path from a URL
   */
  const getPathFromUrl = (url: string, bucket: string): string | null => {
    try {
      // Handle signed URLs
      if (url.includes('/sign/')) {
        const match = url.match(new RegExp(`${bucket}/sign/([^?]+)`));
        return match ? match[1] : null;
      }
      
      // Handle public URLs
      const match = url.match(new RegExp(`${bucket}/([^?]+)`));
      return match ? match[1] : null;
    } catch (error) {
      console.error('Error extracting path from URL:', error);
      return null;
    }
  };

  return {
    uploadImage,
    deleteImage,
    refreshSignedUrl,
    getPathFromUrl,
    uploading
  };
};
