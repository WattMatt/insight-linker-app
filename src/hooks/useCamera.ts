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

// Detect mobile device for appropriate fallback behavior
const isMobileDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i.test(userAgent.toLowerCase());
};

// Detect if device likely has a camera
const hasCamera = async (): Promise<boolean> => {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return isMobileDevice();
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(device => device.kind === 'videoinput');
  } catch {
    // Fallback: assume mobile devices have cameras
    return isMobileDevice();
  }
};

// Web fallback: Create file input and trigger file picker
const capturePhotoWeb = (options: CameraOptions = {}): Promise<File[]> => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.heic,.heif'; // Explicitly include HEIC/HEIF for iOS

    if (options.multiple) {
      input.multiple = true;
    }

    // On mobile devices, prefer camera capture
    // The 'capture' attribute opens camera directly on mobile browsers
    if (options.preferCamera && isMobileDevice()) {
      input.setAttribute('capture', 'environment'); // Back camera
    }

    // Ensure input is in DOM for iOS Safari compatibility
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    const cleanup = () => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
    };

    input.onchange = async (e) => {
      const filesList = (e.target as HTMLInputElement).files;
      if (filesList && filesList.length > 0) {
        const files = Array.from(filesList);
        // Process each file with HEIC conversion
        const processedFiles = await Promise.all(files.map(convertHeicToJpeg));
        cleanup();
        resolve(processedFiles);
      } else {
        cleanup();
        resolve([]);
      }
    };

    input.oncancel = () => {
      cleanup();
      resolve([]); // User cancelled
    };

    // Handle cases where oncancel doesn't fire (older browsers)
    const handleFocusBack = () => {
      setTimeout(() => {
        if (input.files?.length === 0) {
          cleanup();
          resolve([]);
        }
      }, 500);
    };
    window.addEventListener('focus', handleFocusBack, { once: true });

    // Add a small delay to ensure the dialog appears across all browsers
    setTimeout(() => {
      input.click();
    }, 100);
  });
};

export const useCamera = () => {
  const isNative = Capacitor.isNativePlatform();
  const isMobile = isMobileDevice();

  const takePicture = async (options: CameraOptions = {}): Promise<File | null> => {
    if (!isNative) {
      try {
        // On web mobile, prefer camera by default
        const files = await capturePhotoWeb({ 
          ...options, 
          multiple: false,
          preferCamera: options.preferCamera ?? isMobile 
        });
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
        // On mobile web, if preferCamera is set, open camera for single image
        if (options.preferCamera && isMobile) {
          const file = await takePicture({ ...options, preferCamera: true });
          return file ? [file] : [];
        }
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
    isMobile,
    takePicture,
    selectImages,
    hasCamera,
  };
};
