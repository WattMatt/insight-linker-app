import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface CameraOptions {
  quality?: number;
  allowEditing?: boolean;
  resultType?: CameraResultType;
  source?: CameraSource;
  preferCamera?: boolean;
  multiple?: boolean;
}

/**
 * Converts HEIC/HEIF files to JPEG for better cross-browser compatibility
 */
const convertHeicToJpeg = async (file: File): Promise<File> => {
  const inputFileName = file.name.toLowerCase();
  const isHEIC = file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    (file.type === '' && (inputFileName.endsWith('.heic') || inputFileName.endsWith('.heif'))) ||
    inputFileName.endsWith('.heic') ||
    inputFileName.endsWith('.heif');

  if (isHEIC) {
    try {
      console.log('HEIC/HEIF file detected, converting to JPEG...');
      const heic2any = (await import('heic2any')).default;
      const convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9
      });

      const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
      return new File([blob], newFileName, { type: 'image/jpeg' });
    } catch (error) {
      console.error("Error converting HEIC image:", error);
      return file; // Return original file if conversion fails
    }
  }
  return file;
};

// Web fallback: Create file input and trigger file picker
const capturePhotoWeb = (options: CameraOptions = {}): Promise<File[]> => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    if (options.multiple) {
      input.multiple = true;
    }

    // Hint at camera if preferred
    if (options.preferCamera) {
      input.setAttribute('capture', 'environment');
    }

    input.onchange = async (e) => {
      const filesList = (e.target as HTMLInputElement).files;
      if (filesList && filesList.length > 0) {
        const files = Array.from(filesList);
        // Process each file with HEIC conversion
        const processedFiles = await Promise.all(files.map(convertHeicToJpeg));
        resolve(processedFiles);
      } else {
        resolve([]);
      }
    };

    input.oncancel = () => {
      resolve([]); // User cancelled
    };

    // Add a small delay to ensure the dialog appears across all browsers
    setTimeout(() => {
      input.click();
    }, 100);
  });
};

export const useCamera = () => {
  const isNative = Capacitor.isNativePlatform();

  const takePicture = async (options: CameraOptions = {}): Promise<File | null> => {
    if (!isNative) {
      try {
        const files = await capturePhotoWeb({ ...options, multiple: false });
        return files.length > 0 ? files[0] : null;
      } catch (error) {
        console.error('Error capturing photo on web:', error);
        return null;
      }
    }

    try {
      // Request permissions first on Android/iOS
      const permissions = await Camera.checkPermissions();
      if (permissions.camera === 'denied' || permissions.photos === 'denied') {
        const requested = await Camera.requestPermissions();
        if (requested.camera === 'denied' || requested.photos === 'denied') {
          throw new Error('Camera permissions denied. Please enable camera access in your device settings.');
        }
      }

      const image = await Camera.getPhoto({
        quality: options.quality || 90,
        allowEditing: options.allowEditing || false,
        resultType: CameraResultType.Uri,
        // If preferCamera is true, default to camera, otherwise prompt
        source: options.preferCamera ? CameraSource.Camera : (options.source || CameraSource.Prompt),
        saveToGallery: false,
        correctOrientation: true,
      });

      if (!image.webPath) {
        throw new Error('No image path returned');
      }

      // Convert the image to a File object
      const response = await fetch(image.webPath);
      const blob = await response.blob();
      const fileName = `photo_${Date.now()}.${image.format || 'jpg'}`;
      const file = new File([blob], fileName, { type: `image/${image.format || 'jpeg'}` });

      return file;
    } catch (error: any) {
      console.error('Error taking picture:', error);
      if (error.message?.includes('User cancelled') || error.message?.includes('cancelled')) {
        return null; // User cancelled, don't throw
      }
      throw error;
    }
  };

  const selectImages = async (options: CameraOptions = {}): Promise<File[]> => {
    if (!isNative) {
      try {
        return await capturePhotoWeb({ ...options, multiple: true });
      } catch (error) {
        console.error('Error selecting images on web:', error);
        return [];
      }
    }

    try {
      // Request permissions first
      const permissions = await Camera.checkPermissions();
      if (permissions.photos === 'denied') {
        const requested = await Camera.requestPermissions();
        if (requested.photos === 'denied') {
          throw new Error('Photo library access denied. Please enable photo access in your device settings.');
        }
      }

      const images = await Camera.pickImages({
        quality: options.quality || 90,
        limit: 10,
      });

      const files: File[] = [];

      for (const photo of images.photos) {
        if (photo.webPath) {
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          const fileName = `photo_${Date.now()}_${files.length}.${photo.format || 'jpg'}`;
          const file = new File([blob], fileName, { type: `image/${photo.format || 'jpeg'}` });
          files.push(file);
        }
      }

      return files;
    } catch (error: any) {
      console.error('Error selecting images:', error);
      if (error.message?.includes('User cancelled') || error.message?.includes('cancelled')) {
        return []; // User cancelled, don't throw
      }
      throw error;
    }
  };

  return {
    isNative,
    takePicture,
    selectImages,
  };
};
