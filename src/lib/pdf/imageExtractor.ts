/**
 * PDF Image Extraction Engine
 * Extracts embedded images, logos, and graphics from PDF documents
 */

import * as pdfjsLib from 'pdfjs-dist';

export interface ExtractedImage {
  id: string;
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
  x: number;
  y: number;
  type: 'jpeg' | 'png' | 'unknown';
  sizeBytes: number;
  isLogo: boolean;
  isPhoto: boolean;
  isIcon: boolean;
}

export interface ImageExtractionOptions {
  minWidth?: number;
  minHeight?: number;
  maxImages?: number;
  extractLogos?: boolean;
  extractPhotos?: boolean;
  quality?: number;
}

const DEFAULT_OPTIONS: ImageExtractionOptions = {
  minWidth: 20,
  minHeight: 20,
  maxImages: 100,
  extractLogos: true,
  extractPhotos: true,
  quality: 0.92
};

// Logo detection heuristics
const LOGO_MAX_SIZE = 300;
const LOGO_ASPECT_RATIO_RANGE = { min: 0.3, max: 3 };

// Photo detection heuristics
const PHOTO_MIN_SIZE = 200;

/**
 * Classify an image as logo, photo, or icon
 */
function classifyImage(width: number, height: number): { isLogo: boolean; isPhoto: boolean; isIcon: boolean } {
  const aspectRatio = width / height;
  const area = width * height;
  
  // Icons are very small
  const isIcon = width < 50 && height < 50;
  
  // Logos are small-medium with typical aspect ratios
  const isLogo = !isIcon && 
    width <= LOGO_MAX_SIZE && 
    height <= LOGO_MAX_SIZE &&
    aspectRatio >= LOGO_ASPECT_RATIO_RANGE.min && 
    aspectRatio <= LOGO_ASPECT_RATIO_RANGE.max;
  
  // Photos are larger
  const isPhoto = !isIcon && !isLogo && 
    (width >= PHOTO_MIN_SIZE || height >= PHOTO_MIN_SIZE);
  
  return { isLogo, isPhoto, isIcon };
}

/**
 * Convert image data to data URL
 */
function imageDataToDataUrl(
  imageData: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  format: 'jpeg' | 'png' = 'png',
  quality: number = 0.92
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  
  // Create ImageData from raw data
  const imgData = ctx.createImageData(width, height);
  
  // Handle different image data formats
  if (imageData.length === width * height * 4) {
    // RGBA format
    imgData.data.set(imageData);
  } else if (imageData.length === width * height * 3) {
    // RGB format - convert to RGBA
    for (let i = 0, j = 0; i < imageData.length; i += 3, j += 4) {
      imgData.data[j] = imageData[i];
      imgData.data[j + 1] = imageData[i + 1];
      imgData.data[j + 2] = imageData[i + 2];
      imgData.data[j + 3] = 255;
    }
  } else if (imageData.length === width * height) {
    // Grayscale format
    for (let i = 0, j = 0; i < imageData.length; i++, j += 4) {
      imgData.data[j] = imageData[i];
      imgData.data[j + 1] = imageData[i];
      imgData.data[j + 2] = imageData[i];
      imgData.data[j + 3] = 255;
    }
  }
  
  ctx.putImageData(imgData, 0, 0);
  
  return canvas.toDataURL(`image/${format}`, quality);
}

/**
 * Extract images from a single PDF page
 */
export async function extractImagesFromPage(
  page: pdfjsLib.PDFPageProxy,
  pageNumber: number,
  options: ImageExtractionOptions = DEFAULT_OPTIONS
): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  const ops = await page.getOperatorList();
  const viewport = page.getViewport({ scale: 1 });
  
  let imageIndex = 0;
  
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    
    // Check for image operators
    if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintXObject) {
      try {
        const imageName = ops.argsArray[i]?.[0];
        if (!imageName) continue;
        
        // Get image object from page resources
        const objs = page.objs as any;
        const img = await new Promise<any>((resolve) => {
          objs.get(imageName, resolve);
        });
        
        if (!img || !img.data) continue;
        
        const width = img.width;
        const height = img.height;
        
        // Apply size filters
        if (width < (options.minWidth || 20) || height < (options.minHeight || 20)) {
          continue;
        }
        
        // Check max images limit
        if (images.length >= (options.maxImages || 100)) {
          break;
        }
        
        const classification = classifyImage(width, height);
        
        // Apply type filters
        if (!options.extractLogos && classification.isLogo) continue;
        if (!options.extractPhotos && classification.isPhoto) continue;
        
        // Convert to data URL - default to png for all extracted images
        const format = 'png';
        const dataUrl = imageDataToDataUrl(
          img.data,
          width,
          height,
          format,
          options.quality || 0.92
        );
        
        if (!dataUrl) continue;
        
        images.push({
          id: `page${pageNumber}_img${imageIndex++}`,
          pageNumber,
          dataUrl,
          width,
          height,
          x: 0, // Position tracking would require transform matrix analysis
          y: 0,
          type: format as 'jpeg' | 'png',
          sizeBytes: Math.round(dataUrl.length * 0.75), // Approximate
          ...classification
        });
        
      } catch (error) {
        console.warn(`[ImageExtractor] Failed to extract image ${i} from page ${pageNumber}:`, error);
      }
    }
  }
  
  return images;
}

/**
 * Capture full page as an image
 */
export async function capturePageAsImage(
  page: pdfjsLib.PDFPageProxy,
  pageNumber: number,
  scale: number = 1.5
): Promise<ExtractedImage> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Could not get canvas context');
  
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  await page.render({
    canvasContext: ctx,
    viewport,
    canvas
  }).promise;
  
  const dataUrl = canvas.toDataURL('image/png', 0.92);
  
  return {
    id: `page${pageNumber}_screenshot`,
    pageNumber,
    dataUrl,
    width: viewport.width,
    height: viewport.height,
    x: 0,
    y: 0,
    type: 'png',
    sizeBytes: Math.round(dataUrl.length * 0.75),
    isLogo: false,
    isPhoto: true,
    isIcon: false
  };
}

/**
 * Extract all images from a PDF document
 */
export async function extractAllImages(
  pdf: pdfjsLib.PDFDocumentProxy,
  options: ImageExtractionOptions = DEFAULT_OPTIONS,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedImage[]> {
  const allImages: ExtractedImage[] = [];
  const pageCount = pdf.numPages;
  
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const pageImages = await extractImagesFromPage(page, i, options);
    allImages.push(...pageImages);
    onProgress?.(i, pageCount);
    
    // Check total limit
    if (allImages.length >= (options.maxImages || 100)) {
      break;
    }
  }
  
  return allImages;
}

/**
 * Find the most likely logo image in a document
 */
export async function findDocumentLogo(
  pdf: pdfjsLib.PDFDocumentProxy
): Promise<ExtractedImage | null> {
  // Check first page only for logo (most common location)
  const page = await pdf.getPage(1);
  const images = await extractImagesFromPage(page, 1, {
    extractLogos: true,
    extractPhotos: false,
    maxImages: 10
  });
  
  // Return first logo-classified image, preferring top of page
  const logos = images.filter(img => img.isLogo);
  return logos.length > 0 ? logos[0] : null;
}

/**
 * Extract images suitable for a cover page
 */
export async function extractCoverPageImages(
  pdf: pdfjsLib.PDFDocumentProxy
): Promise<{ logo: ExtractedImage | null; hero: ExtractedImage | null }> {
  const page = await pdf.getPage(1);
  const images = await extractImagesFromPage(page, 1, {
    extractLogos: true,
    extractPhotos: true,
    maxImages: 20
  });
  
  const logo = images.find(img => img.isLogo) || null;
  const hero = images.find(img => img.isPhoto && img.width > 300) || null;
  
  return { logo, hero };
}
