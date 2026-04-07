/**
 * WYSIWYG PDF Generator
 * Uses html2canvas to capture rendered HTML pages and jsPDF to assemble them into a PDF
 */
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface PdfGeneratorResult {
  success: boolean;
  blob?: Blob;
  url?: string;
  error?: string;
}

export interface GeneratePdfOptions {
  filename?: string;
  scale?: number;
  quality?: number;
  onProgress?: (current: number, total: number) => void;
}

/**
 * Generate a PDF from an array of HTML elements (pages)
 * Each element is captured as a full page in the PDF
 */
export async function generatePdfFromPages(
  pages: HTMLElement[],
  options: GeneratePdfOptions = {}
): Promise<PdfGeneratorResult> {
  const {
    scale = 2, // Higher resolution for crisp output
    quality = 0.95,
    onProgress,
  } = options;

  const pageWidth = 210; // A4 width in mm
  const pageHeight = 297; // A4 height in mm

  try {
    console.log('[WYSIWYG PDF] Starting generation with', pages.length, 'pages');
    
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      
      if (!page) {
        console.warn(`[WYSIWYG PDF] Page ${i} is null, skipping`);
        continue;
      }
      
      console.log(`[WYSIWYG PDF] Capturing page ${i + 1}/${pages.length}`);
      onProgress?.(i + 1, pages.length);
      
      // Capture the page as a canvas
      const canvas = await html2canvas(page, {
        scale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        // Ensure we capture the full page
        height: page.scrollHeight,
        width: page.scrollWidth,
        windowHeight: page.scrollHeight,
        windowWidth: page.scrollWidth,
      });
      
      // Convert canvas to image data
      const imgData = canvas.toDataURL('image/jpeg', quality);
      
      // Calculate dimensions to fit A4 while maintaining aspect ratio
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      
      // If the captured content is taller than A4, we need to handle overflow
      // For now, we'll scale to fit width and let it be as tall as needed
      const finalHeight = Math.min(imgHeight, pageHeight);
      
      // Add new page if not the first
      if (i > 0) {
        pdf.addPage();
      }
      
      // Add the image to the PDF
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, finalHeight);
      
      console.log(`[WYSIWYG PDF] Page ${i + 1} added (${canvas.width}x${canvas.height}px -> ${imgWidth}x${finalHeight}mm)`);
    }
    
    // Generate the final PDF blob
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    
    console.log('[WYSIWYG PDF] Generation complete, blob size:', blob.size);
    
    return {
      success: true,
      blob,
      url,
    };
  } catch (error) {
    console.error('[WYSIWYG PDF] Generation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate PDF',
    };
  }
}

/**
 * Wait for all images in an element to load
 */
export async function waitForImages(container: HTMLElement): Promise<void> {
  const images = container.querySelectorAll('img');
  const promises: Promise<void>[] = [];
  
  images.forEach((img) => {
    if (!img.complete) {
      promises.push(
        new Promise((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => {
            console.warn('[WYSIWYG PDF] Image failed to load:', img.src?.substring(0, 60));
            resolve(); // Resolve anyway to not block
          };
        })
      );
    }
  });
  
  if (promises.length > 0) {
    console.log(`[WYSIWYG PDF] Waiting for ${promises.length} images to load...`);
    await Promise.all(promises);
    console.log('[WYSIWYG PDF] All images loaded');
  }
}

/**
 * Download a PDF blob as a file – delegates to the shared download utility
 * for reliable cross-environment support.
 */
export async function downloadPdf(blob: Blob, filename: string): Promise<void> {
  const { downloadBlob } = await import('@/lib/fileDownload');
  await downloadBlob(blob, filename);
}
