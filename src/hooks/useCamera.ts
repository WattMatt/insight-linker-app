import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface CameraOptions {
  quality?: number;
  allowEditing?: boolean;
  resultType?: CameraResultType;
  source?: CameraSource;
}

export const useCamera = () => {
  const isNative = Capacitor.isNativePlatform();

  const takePicture = async (options: CameraOptions = {}): Promise<File | null> => {
    if (!isNative) {
      return null; // Fall back to file input on web
    }

    try {
      const image = await Camera.getPhoto({
        quality: options.quality || 90,
        allowEditing: options.allowEditing || false,
        resultType: options.resultType || CameraResultType.Uri,
        source: options.source || CameraSource.Camera,
      });

      if (!image.webPath) {
        throw new Error('No image path returned');
      }

      // Convert the image to a File object
      const response = await fetch(image.webPath);
      const blob = await response.blob();
      const fileName = `photo_${Date.now()}.${image.format}`;
      const file = new File([blob], fileName, { type: `image/${image.format}` });

      return file;
    } catch (error) {
      console.error('Error taking picture:', error);
      throw error;
    }
  };

  const selectImages = async (options: CameraOptions = {}): Promise<File[]> => {
    if (!isNative) {
      return []; // Fall back to file input on web
    }

    try {
      const images = await Camera.pickImages({
        quality: options.quality || 90,
        limit: 10, // Allow selecting multiple images
      });

      const files: File[] = [];
      
      for (const photo of images.photos) {
        if (photo.webPath) {
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          const fileName = `photo_${Date.now()}_${files.length}.${photo.format}`;
          const file = new File([blob], fileName, { type: `image/${photo.format}` });
          files.push(file);
        }
      }

      return files;
    } catch (error) {
      console.error('Error selecting images:', error);
      throw error;
    }
  };

  return {
    isNative,
    takePicture,
    selectImages,
  };
};
