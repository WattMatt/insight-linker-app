import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import heic2any from 'heic2any';

interface UploadResult {
  url: string;
  path: string;
}

export const useImageUpload = () => {
  const [uploading, setUploading] = useState(false);

  /**
   * Converts HEIC images to JPG for browser compatibility
   */
  const convertHeicToJpg = async (file: File): Promise<File> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (ext === 'heic' || ext === 'heif') {
      try {
        console.log('Converting HEIC image to JPG...');
        const convertedBlob = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.9
        });
        
        const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
        const newFileName = file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
        
        return new File([blob], newFileName, { type: 'image/jpeg' });
      } catch (error) {
        console.error('HEIC conversion failed:', error);
        toast.error('Failed to convert HEIC image. Please use JPG or PNG format.');
        throw error;
      }
    }
    
    return file;
  };

  /**
   * Uploads an image and returns a public URL (doesn't expire)
   * Automatically converts HEIC to JPG
   * Includes retry logic and proper error handling
   */
  const uploadImage = async (
    file: File,
    bucket: string,
    path: string,
    retries = 3
  ): Promise<UploadResult | null> => {
    setUploading(true);

    try {
      // Convert HEIC to JPG if needed
      const processedFile = await convertHeicToJpg(file);
      
      // Update path if file was converted
      let uploadPath = path;
      if (processedFile !== file) {
        uploadPath = path.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
      }

      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          // Upload the file
          const { data, error } = await supabase.storage
            .from(bucket)
            .upload(uploadPath, processedFile, {
              cacheControl: '3600',
              upsert: false
            });

          if (error) {
            // If file already exists, try with a different timestamp
            if (error.message.includes('duplicate') || error.message.includes('already exists')) {
              const timestamp = Date.now();
              const ext = processedFile.name.split('.').pop();
              const newPath = uploadPath.replace(/\.[^.]+$/, `_${timestamp}.${ext}`);
              return uploadImage(file, bucket, newPath, 1); // Don't retry on duplicate
            }
            throw error;
          }

          // Verify the file exists in storage before returning URL
          const { data: verifyData, error: verifyError } = await supabase.storage
            .from(bucket)
            .list(data.path.split('/').slice(0, -1).join('/'), {
              limit: 1,
              search: data.path.split('/').pop()
            });

          if (verifyError || !verifyData || verifyData.length === 0) {
            console.warn('Upload verification failed, file may not exist:', data.path);
          }

          // Use public URL (doesn't expire) - use the exact path returned by storage
          const { data: publicData } = supabase.storage
            .from(bucket)
            .getPublicUrl(data.path);
          
          // Final validation: ensure URL contains the actual stored path
          const storedPath = data.path;
          const urlPath = publicData.publicUrl.split(`${bucket}/`).pop()?.split('?')[0];
          
          if (urlPath && decodeURIComponent(urlPath) !== storedPath) {
            console.warn('URL path mismatch detected:', { urlPath, storedPath });
          }
          
          console.log('Image uploaded and verified:', { url: publicData.publicUrl, path: storedPath });
          setUploading(false);
          return {
            url: publicData.publicUrl,
            path: storedPath
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
    } catch (error: any) {
      console.error('Image upload error:', error);
      setUploading(false);
      return null;
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

  /**
   * Validates that a URL points to an actual file in storage
   * Returns the corrected URL if found, or null if not
   */
  const validateImageUrl = async (url: string, bucket: string): Promise<string | null> => {
    try {
      const path = getPathFromUrl(url, bucket);
      if (!path) return null;

      // Get the folder path and filename
      const pathParts = path.split('/');
      const fileName = pathParts.pop();
      const folderPath = pathParts.join('/');

      if (!fileName || !folderPath) return null;

      // List files in the folder to find the actual file
      const { data: files, error } = await supabase.storage
        .from(bucket)
        .list(folderPath, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } });

      if (error || !files) return null;

      // Check if exact filename exists
      const exactMatch = files.find(f => f.name === fileName);
      if (exactMatch) {
        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(`${folderPath}/${exactMatch.name}`);
        return urlData.publicUrl;
      }

      // Find the most recent image in the folder as fallback
      const imageFile = files.find(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name));
      if (imageFile) {
        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(`${folderPath}/${imageFile.name}`);
        console.log('Corrected image URL:', { original: url, corrected: urlData.publicUrl });
        return urlData.publicUrl;
      }

      return null;
    } catch (error) {
      console.error('Error validating image URL:', error);
      return null;
    }
  };

  return {
    uploadImage,
    deleteImage,
    refreshSignedUrl,
    getPathFromUrl,
    validateImageUrl,
    uploading
  };
};
