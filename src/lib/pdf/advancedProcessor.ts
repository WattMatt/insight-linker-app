/**
 * Advanced PDF Processor
 * Combines OCR, text extraction, and image extraction into a unified processing pipeline
 */

import * as pdfjsLib from 'pdfjs-dist';
import { processPageWithOCR, OCRPageResult, OCROptions } from './ocrEngine';
import { extractDocumentContent, PageTextContent, DetectedTable, TextBlock } from './textExtractor';
import { extractAllImages, extractCoverPageImages, ExtractedImage, ImageExtractionOptions } from './imageExtractor';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ProcessingOptions {
  maxPages?: number;
  enableOCR?: boolean;
  extractImages?: boolean;
  extractTables?: boolean;
  detectStructure?: boolean;
  ocrOptions?: OCROptions;
  imageOptions?: ImageExtractionOptions;
}

export interface DocumentSection {
  id: string;
  title: string;
  content: string;
  pageStart: number;
  pageEnd: number;
  level: number;
  subsections: DocumentSection[];
}

export interface ProcessedDocument {
  fileName: string;
  pageCount: number;
  totalProcessingTime: number;
  
  // Content
  pages: PageTextContent[];
  fullText: string;
  sections: DocumentSection[];
  tables: DetectedTable[];
  
  // Images
  images: ExtractedImage[];
  logo: ExtractedImage | null;
  
  // OCR results (if enabled)
  ocrResults?: OCRPageResult[];
  
  // Metadata
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
    creationDate?: Date;
    modificationDate?: Date;
  };
  
  // Quality metrics
  quality: {
    textConfidence: number;
    hasOCRContent: boolean;
    tableCount: number;
    imageCount: number;
    averageWordsPerPage: number;
  };
}

const DEFAULT_OPTIONS: ProcessingOptions = {
  maxPages: 50,
  enableOCR: true,
  extractImages: true,
  extractTables: true,
  detectStructure: true
};

/**
 * Detect document sections based on headers and structure
 */
function detectSections(pages: PageTextContent[]): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let currentSection: DocumentSection | null = null;
  let sectionId = 0;
  
  for (const page of pages) {
    for (const block of page.blocks) {
      // Check if block is a header
      if (block.isHeader || block.isBold) {
        const text = block.text.trim();
        
        // Skip very short or numeric-only headers
        if (text.length < 3 || /^\d+\.?\d*$/.test(text)) continue;
        
        // Determine section level based on font size
        const level = block.fontSize >= 18 ? 1 : block.fontSize >= 14 ? 2 : 3;
        
        const newSection: DocumentSection = {
          id: `section_${sectionId++}`,
          title: text,
          content: '',
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber,
          level,
          subsections: []
        };
        
        if (!currentSection || level === 1) {
          sections.push(newSection);
          currentSection = newSection;
        } else if (level > currentSection.level) {
          currentSection.subsections.push(newSection);
        } else {
          sections.push(newSection);
          currentSection = newSection;
        }
      } else if (currentSection) {
        // Add content to current section
        currentSection.content += block.text + ' ';
        currentSection.pageEnd = page.pageNumber;
      }
    }
  }
  
  // Trim content
  for (const section of sections) {
    section.content = section.content.trim();
    for (const sub of section.subsections) {
      sub.content = sub.content.trim();
    }
  }
  
  return sections;
}

/**
 * Extract metadata from PDF document
 */
async function extractMetadata(pdf: pdfjsLib.PDFDocumentProxy): Promise<ProcessedDocument['metadata']> {
  try {
    const metadata = await pdf.getMetadata();
    const info = metadata?.info as any;
    
    return {
      title: info?.Title || undefined,
      author: info?.Author || undefined,
      subject: info?.Subject || undefined,
      keywords: info?.Keywords?.split(',').map((k: string) => k.trim()) || undefined,
      creationDate: info?.CreationDate ? new Date(info.CreationDate) : undefined,
      modificationDate: info?.ModDate ? new Date(info.ModDate) : undefined
    };
  } catch {
    return {};
  }
}

/**
 * Calculate document quality metrics
 */
function calculateQualityMetrics(
  pages: PageTextContent[],
  ocrResults?: OCRPageResult[]
): ProcessedDocument['quality'] {
  const totalWords = pages.reduce((sum, p) => 
    sum + p.rawText.split(/\s+/).filter(w => w.length > 0).length, 0
  );
  
  const tableCount = pages.reduce((sum, p) => sum + p.tables.length, 0);
  
  const hasOCRContent = ocrResults?.some(r => 
    r.textBlocks.some(b => b.confidence < 1)
  ) || false;
  
  const avgConfidence = ocrResults 
    ? ocrResults.reduce((sum, r) => {
        const pageAvg = r.textBlocks.length > 0
          ? r.textBlocks.reduce((s, b) => s + b.confidence, 0) / r.textBlocks.length
          : 1;
        return sum + pageAvg;
      }, 0) / ocrResults.length
    : 1;
  
  return {
    textConfidence: avgConfidence,
    hasOCRContent,
    tableCount,
    imageCount: 0, // Set later
    averageWordsPerPage: pages.length > 0 ? totalWords / pages.length : 0
  };
}

/**
 * Process a PDF file with all extraction capabilities
 */
export async function processDocument(
  file: File,
  options: ProcessingOptions = DEFAULT_OPTIONS,
  onProgress?: (stage: string, current: number, total: number) => void
): Promise<ProcessedDocument> {
  const startTime = performance.now();
  
  // Load PDF
  onProgress?.('loading', 0, 1);
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const pageCount = Math.min(pdf.numPages, options.maxPages || 50);
  
  // Extract text content
  onProgress?.('extracting_text', 0, pageCount);
  const pages = await extractDocumentContent(pdf, pageCount, (current, total) => {
    onProgress?.('extracting_text', current, total);
  });
  
  // Extract metadata
  const metadata = await extractMetadata(pdf);
  
  // OCR processing (if enabled and needed)
  let ocrResults: OCRPageResult[] | undefined;
  if (options.enableOCR) {
    onProgress?.('ocr_processing', 0, pageCount);
    ocrResults = [];
    
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const result = await processPageWithOCR(page, i, options.ocrOptions);
      ocrResults.push(result);
      onProgress?.('ocr_processing', i, pageCount);
    }
  }
  
  // Extract images
  let images: ExtractedImage[] = [];
  let logo: ExtractedImage | null = null;
  
  if (options.extractImages) {
    onProgress?.('extracting_images', 0, pageCount);
    images = await extractAllImages(pdf, options.imageOptions, (current, total) => {
      onProgress?.('extracting_images', current, total);
    });
    
    const coverImages = await extractCoverPageImages(pdf);
    logo = coverImages.logo;
  }
  
  // Detect sections
  const sections = options.detectStructure ? detectSections(pages) : [];
  
  // Collect all tables
  const tables = options.extractTables 
    ? pages.flatMap(p => p.tables)
    : [];
  
  // Build full text
  const fullText = pages.map(p => p.structuredText).join('\n\n');
  
  // Calculate quality metrics
  const quality = calculateQualityMetrics(pages, ocrResults);
  quality.imageCount = images.length;
  
  const totalProcessingTime = performance.now() - startTime;
  
  onProgress?.('complete', 1, 1);
  
  return {
    fileName: file.name,
    pageCount,
    totalProcessingTime,
    pages,
    fullText,
    sections,
    tables,
    images,
    logo,
    ocrResults,
    metadata,
    quality
  };
}

/**
 * Quick text extraction without full processing
 */
export async function quickExtractText(
  file: File,
  maxPages: number = 10
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const pageCount = Math.min(pdf.numPages, maxPages);
  let text = '';
  
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(' ') + '\n\n';
  }
  
  return text.trim();
}

/**
 * Check if a PDF file appears to be scanned/image-based
 */
export async function detectScannedDocument(file: File): Promise<boolean> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  // Check first few pages
  const pagesToCheck = Math.min(pdf.numPages, 3);
  let scannedPages = 0;
  
  for (let i = 1; i <= pagesToCheck; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join('').trim();
    
    // Get image count
    const ops = await page.getOperatorList();
    let imageCount = 0;
    for (const op of ops.fnArray) {
      if (op === pdfjsLib.OPS.paintImageXObject || op === pdfjsLib.OPS.paintXObject) {
        imageCount++;
      }
    }
    
    // Page is likely scanned if minimal text and has images
    if (text.length < 100 && imageCount > 0) {
      scannedPages++;
    }
  }
  
  return scannedPages >= pagesToCheck / 2;
}

/**
 * Extract specific pages from a document
 */
export async function extractPageRange(
  file: File,
  startPage: number,
  endPage: number,
  options: ProcessingOptions = DEFAULT_OPTIONS
): Promise<PageTextContent[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const actualStart = Math.max(1, startPage);
  const actualEnd = Math.min(pdf.numPages, endPage);
  
  const results: PageTextContent[] = [];
  
  for (let i = actualStart; i <= actualEnd; i++) {
    const page = await pdf.getPage(i);
    const { extractPageContent } = await import('./textExtractor');
    const content = await extractPageContent(page, i);
    results.push(content);
  }
  
  return results;
}

// Re-export types for convenience
export type { OCRPageResult, OCROptions } from './ocrEngine';
export type { PageTextContent, DetectedTable, TextBlock, TextLine } from './textExtractor';
export type { ExtractedImage, ImageExtractionOptions } from './imageExtractor';
