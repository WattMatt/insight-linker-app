import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface CameraOptions {
  quality?: number;
  allowEditing?: boolean;
  resultType?: CameraResultType;
  source?: CameraSource;
}

// Web fallback: Create file input and trigger camera
const capturePhotoWeb = (multiple: boolean = false): Promise<File[]> => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // Request rear camera on mobile
    if (multiple) {
      input.multiple = true;
    }

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        resolve(Array.from(files));
      } else {
        resolve([]);
      }
    };

    input.oncancel = () => {
      resolve([]); // User cancelled
    };

    // Trigger the file picker
    input.click();
  });
};

export const useCamera = () => {
  const isNative = Capacitor.isNativePlatform();

  const takePicture = async (options: CameraOptions = {}): Promise<File | null> => {
    if (!isNative) {
      // Web fallback with camera capture
      try {
        const files = await capturePhotoWeb(false);
        return files.length > 0 ? files[0] : null;
      } catch (error) {
        console.error('Error capturing photo on web:', error);
        return null;
      }
    }

    try {
      // Request permissions first on Android
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
        source: options.source || CameraSource.Prompt, // Let user choose camera or gallery
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
      if (error.message?.includes('User cancelled')) {
        return null; // User cancelled, don't throw
      }
      throw error;
    }
  };

  const selectImages = async (options: CameraOptions = {}): Promise<File[]> => {
    if (!isNative) {
      // Web fallback with multiple image selection
      try {
        return await capturePhotoWeb(true);
      } catch (error) {
        console.error('Error selecting images on web:', error);
        return [];
      }
    }

    try {
      // Request permissions first on Android
      const permissions = await Camera.checkPermissions();
      if (permissions.photos === 'denied') {
        const requested = await Camera.requestPermissions();
        if (requested.photos === 'denied') {
          throw new Error('Photo library access denied. Please enable photo access in your device settings.');
        }
      }

      const images = await Camera.pickImages({
        quality: options.quality || 90,
        limit: 10, // Allow selecting multiple images
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
      if (error.message?.includes('User cancelled')) {
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
