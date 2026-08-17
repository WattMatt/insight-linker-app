import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { applyExtension, normaliseImageForUpload } from '@/lib/uploadImageNormaliser';

interface UploadResult {
  url: string;
  path: string;
}

export const useImageUpload = () => {
  const [uploading, setUploading] = useState(false);

  /**
   * Uploads an image and returns a public URL (doesn't expire)
   *
   * HEIC conversion, downscaling and re-encoding all happen in
   * normaliseImageForUpload, which guarantees the stored bytes are genuinely
   * JPEG or PNG and that the extension and Content-Type describe them
   * truthfully. Previously this relabelled every upload `image/jpeg` and `.jpg`
   * even when compression had silently fallen back to the original bytes, so a
   * source the canvas could not rasterise was stored lying about its own format.
   *
   * Includes retry logic and proper error handling.
   * Optionally triggers server-side compression for optimal PDF generation.
   */
  const uploadImage = async (
    file: File,
    bucket: string,
    path: string,
    retries = 3,
    options?: { skipServerCompression?: boolean }
  ): Promise<UploadResult | null> => {
    setUploading(true);

    try {
      const normalised = await normaliseImageForUpload(file);
      if (!normalised.ok) {
        // Refuse rather than store something no report can embed.
        toast.error(normalised.error.reason);
        setUploading(false);
        return null;
      }

      const { blob, mime, extension } = normalised.image;
      const finalFileName = applyExtension(file.name, extension);
      const finalFile = new File([blob], finalFileName, { type: mime });

      const uploadPath = applyExtension(path, extension);

      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          // Upload the compressed file
          const { data, error } = await supabase.storage
            .from(bucket)
            .upload(uploadPath, finalFile, {
              cacheControl: '3600',
              upsert: false
            });

          if (error) {
            // If file already exists, try with a different timestamp. Keeps the
            // normalised extension rather than forcing .jpg.
            if (error.message.includes('duplicate') || error.message.includes('already exists')) {
              const timestamp = Date.now();
              const newPath = applyExtension(`${uploadPath.replace(/\.[^.]+$/, '')}_${timestamp}`, extension);
              return uploadImage(file, bucket, newPath, 1, options); // Don't retry on duplicate
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
            if (process.env.NODE_ENV === 'development') console.warn('Upload verification failed, file may not exist:', data.path);
          }

          // Use public URL (doesn't expire) - use the exact path returned by storage
          const { data: publicData } = supabase.storage
            .from(bucket)
            .getPublicUrl(data.path);
          
          // Final validation: ensure URL contains the actual stored path
          const storedPath = data.path;
          const urlPath = publicData.publicUrl.split(`${bucket}/`).pop()?.split('?')[0];
          
          if (urlPath && decodeURIComponent(urlPath) !== storedPath) {
            if (process.env.NODE_ENV === 'development') console.warn('URL path mismatch detected:', { urlPath, storedPath });
          }
          
          
          // Trigger server-side compression for PDF optimization (non-blocking)
          if (!options?.skipServerCompression && bucket === 'inspection-photos') {
            triggerServerCompression(storedPath, bucket);
          }
          
          setUploading(false);
          return {
            url: publicData.publicUrl,
            path: storedPath
          };

        } catch (error: any) {
          if (process.env.NODE_ENV === 'development') console.error(`Upload attempt ${attempt} failed:`, error);
          
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
      if (process.env.NODE_ENV === 'development') console.error('Image upload error:', error);
      setUploading(false);
      return null;
    }

    setUploading(false);
    return null;
  };

  /**
   * Triggers server-side image compression for optimal PDF generation
   * This runs in the background and doesn't block the upload
   */
  const triggerServerCompression = async (path: string, bucket: string) => {
    try {
      // Fire and forget - don't await
      supabase.functions.invoke('compress-image', {
        body: {
          sourcePath: path,
          bucket,
          maxWidth: 800,
          quality: 70
        }
      }).then(({ data, error }) => {
        if (error) {
          if (process.env.NODE_ENV === 'development') console.warn('[ServerCompression] Failed:', error.message);
        } else if (data?.success) {
        }
      }).catch(err => {
        if (process.env.NODE_ENV === 'development') console.warn('[ServerCompression] Error:', err);
      });
    } catch (err) {
      // Silently ignore - this is a background optimization
      if (process.env.NODE_ENV === 'development') console.warn('[ServerCompression] Trigger failed:', err);
    }
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
        if (process.env.NODE_ENV === 'development') console.error('Error deleting image:', error);
        toast.error('Failed to delete image');
        return false;
      }

      return true;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error deleting image:', error);
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
        if (process.env.NODE_ENV === 'development') console.error('Error refreshing signed URL:', error);
        return null;
      }

      return data.signedUrl;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error refreshing signed URL:', error);
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
      if (process.env.NODE_ENV === 'development') console.error('Error extracting path from URL:', error);
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
        return urlData.publicUrl;
      }

      return null;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error validating image URL:', error);
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
