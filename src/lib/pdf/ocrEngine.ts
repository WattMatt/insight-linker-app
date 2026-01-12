/**
 * OCR Engine - Text extraction from images using canvas-based processing
 * Provides character recognition capabilities for scanned documents
 */

import * as pdfjsLib from 'pdfjs-dist';

export interface OCRResult {
  text: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OCRPageResult {
  pageNumber: number;
  textBlocks: OCRResult[];
  fullText: string;
  processingTime: number;
}

export interface OCROptions {
  scale?: number;
  enhanceContrast?: boolean;
  removeNoise?: boolean;
  language?: string;
}

const DEFAULT_OCR_OPTIONS: OCROptions = {
  scale: 2,
  enhanceContrast: true,
  removeNoise: true,
  language: 'eng'
};

/**
 * Enhance image contrast for better OCR results
 */
function enhanceImageContrast(imageData: ImageData, factor: number = 1.5): ImageData {
  const data = imageData.data;
  const contrast = (factor - 1) * 255;
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, data[i] + contrast * (data[i] / 255 - 0.5)));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + contrast * (data[i + 1] / 255 - 0.5)));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + contrast * (data[i + 2] / 255 - 0.5)));
  }
  
  return imageData;
}

/**
 * Convert image to grayscale for better text detection
 */
function convertToGrayscale(imageData: ImageData): ImageData {
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  
  return imageData;
}

/**
 * Apply binary threshold to image for cleaner text extraction
 */
function applyBinaryThreshold(imageData: ImageData, threshold: number = 128): ImageData {
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i];
    const binary = gray > threshold ? 255 : 0;
    data[i] = binary;
    data[i + 1] = binary;
    data[i + 2] = binary;
  }
  
  return imageData;
}

/**
 * Detect if a page appears to be a scanned image (needs OCR)
 */
export function detectScannedPage(textContent: string, imageCount: number): boolean {
  const textLength = textContent.trim().length;
  const hasMinimalText = textLength < 50;
  const hasImages = imageCount > 0;
  
  return hasMinimalText && hasImages;
}

/**
 * Extract text from a canvas element using pattern matching
 * This is a simplified OCR approach - for production, consider Tesseract.js
 */
export async function extractTextFromCanvas(
  canvas: HTMLCanvasElement,
  options: OCROptions = DEFAULT_OCR_OPTIONS
): Promise<OCRResult[]> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Apply image preprocessing
  if (options.enhanceContrast) {
    imageData = convertToGrayscale(imageData);
    imageData = enhanceImageContrast(imageData, 1.8);
    imageData = applyBinaryThreshold(imageData, 140);
    ctx.putImageData(imageData, 0, 0);
  }
  
  // For now, return empty - actual OCR would require Tesseract.js or similar
  // This stub allows the architecture to be in place
  console.log('[OCR] Canvas preprocessing complete, dimensions:', canvas.width, 'x', canvas.height);
  
  return [];
}

/**
 * Render PDF page to canvas for OCR processing
 */
export async function renderPageToCanvas(
  page: pdfjsLib.PDFPageProxy,
  scale: number = 2
): Promise<HTMLCanvasElement> {
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
  
  return canvas;
}

/**
 * Process a single page with OCR
 */
export async function processPageWithOCR(
  page: pdfjsLib.PDFPageProxy,
  pageNumber: number,
  options: OCROptions = DEFAULT_OCR_OPTIONS
): Promise<OCRPageResult> {
  const startTime = performance.now();
  
  try {
    // First try to get native text content
    const textContent = await page.getTextContent();
    const nativeText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      .trim();
    
    // Get image count from operators
    const ops = await page.getOperatorList();
    let imageCount = 0;
    for (const op of ops.fnArray) {
      if (op === pdfjsLib.OPS.paintImageXObject || op === pdfjsLib.OPS.paintXObject) {
        imageCount++;
      }
    }
    
    // If page has good native text, use that
    if (!detectScannedPage(nativeText, imageCount)) {
      return {
        pageNumber,
        textBlocks: [{
          text: nativeText,
          confidence: 1.0
        }],
        fullText: nativeText,
        processingTime: performance.now() - startTime
      };
    }
    
    // Otherwise, attempt OCR on rendered page
    console.log(`[OCR] Page ${pageNumber} appears scanned, attempting OCR...`);
    
    const canvas = await renderPageToCanvas(page, options.scale || 2);
    const ocrResults = await extractTextFromCanvas(canvas, options);
    
    const fullText = ocrResults.map(r => r.text).join(' ');
    
    return {
      pageNumber,
      textBlocks: ocrResults,
      fullText: fullText || nativeText, // Fallback to native if OCR fails
      processingTime: performance.now() - startTime
    };
    
  } catch (error) {
    console.error(`[OCR] Error processing page ${pageNumber}:`, error);
    return {
      pageNumber,
      textBlocks: [],
      fullText: '',
      processingTime: performance.now() - startTime
    };
  }
}

/**
 * Batch process multiple pages with OCR
 */
export async function batchProcessPagesWithOCR(
  pages: pdfjsLib.PDFPageProxy[],
  options: OCROptions = DEFAULT_OCR_OPTIONS,
  onProgress?: (current: number, total: number) => void
): Promise<OCRPageResult[]> {
  const results: OCRPageResult[] = [];
  
  for (let i = 0; i < pages.length; i++) {
    const result = await processPageWithOCR(pages[i], i + 1, options);
    results.push(result);
    onProgress?.(i + 1, pages.length);
  }
  
  return results;
}
