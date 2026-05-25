/**
 * PDF Template Extractor
 * Extracts structure and content from uploaded PDFs to create editable templates
 */

import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export interface ExtractedSection {
  id: string;
  name: string;
  order_index: number;
  type: 'header' | 'table' | 'text' | 'image' | 'list';
  content?: string;
  items?: ExtractedItem[];
  tableData?: {
    headers: string[];
    rows: string[][];
  };
}

export interface ExtractedItem {
  id: string;
  name: string;
  type: 'text' | 'checkbox' | 'select' | 'textarea' | 'image' | 'number';
  value?: string;
  required: boolean;
}

export interface ExtractedTemplate {
  name: string;
  category: string;
  description: string;
  cover_page?: {
    title: string;
    subtitle: string;
    company_name: string;
    date?: string;
  };
  sections: ExtractedSection[];
  metadata: {
    pageCount: number;
    extractedAt: string;
    sourceFileName: string;
  };
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

interface TextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  page: number;
}

/**
 * Extract template structure from a PDF file
 */
export async function extractTemplateFromPDF(
  file: File
): Promise<ExtractedTemplate> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const textBlocks: TextBlock[] = [];
  const pageCount = pdf.numPages;
  
  // Extract text from all pages
  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        const textItem = item as TextItem;
        const [scaleX, , , scaleY, x, y] = textItem.transform;
        
        textBlocks.push({
          text: textItem.str.trim(),
          x: x,
          y: viewport.height - y, // Invert Y coordinate
          width: textItem.width * scaleX,
          height: Math.abs(scaleY),
          fontSize: Math.abs(scaleY),
          fontWeight: textItem.fontName?.toLowerCase().includes('bold') ? 'bold' : 'normal',
          page: pageNum,
        });
      }
    }
  }
  
  // Analyze structure
  const template = analyzeStructure(textBlocks, file.name, pageCount);
  
  return template;
}

/**
 * Analyze text blocks to identify document structure
 */
function analyzeStructure(
  textBlocks: TextBlock[],
  fileName: string,
  pageCount: number
): ExtractedTemplate {
  // Sort by page, then by Y position, then by X position
  const sortedBlocks = [...textBlocks].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (Math.abs(a.y - b.y) > 5) return a.y - b.y;
    return a.x - b.x;
  });
  
  // Group blocks by lines
  const lines = groupBlocksIntoLines(sortedBlocks);
  
  // Identify sections based on text patterns
  const sections: ExtractedSection[] = [];
  let currentSection: ExtractedSection | null = null;
  let sectionIndex = 0;
  
  // Extract cover page info from first page
  const coverPageBlocks = sortedBlocks.filter(b => b.page === 1);
  const coverPage = extractCoverPageInfo(coverPageBlocks);
  
  // Process remaining pages for sections
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineText = line.map(b => b.text).join(' ').trim();
    const avgFontSize = line.reduce((sum, b) => sum + b.fontSize, 0) / line.length;
    const isBold = line.some(b => b.fontWeight === 'bold');
    
    // Detect section headers (larger font, bold, or numbered patterns)
    const isSectionHeader = 
      (avgFontSize > 12 && isBold) ||
      /^(\d+\.|\d+\)|[A-Z]\.|[A-Z]\)|Section|SECTION)/i.test(lineText) ||
      (lineText === lineText.toUpperCase() && lineText.length > 3 && lineText.length < 50);
    
    if (isSectionHeader && lineText.length > 2) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }
      
      // Start new section
      currentSection = {
        id: `section-${sectionIndex}`,
        name: cleanSectionTitle(lineText),
        order_index: sectionIndex,
        type: 'text',
        content: '',
        items: [],
      };
      sectionIndex++;
    } else if (currentSection) {
      // Add content to current section
      if (isChecklistItem(lineText)) {
        currentSection.items = currentSection.items || [];
        currentSection.items.push({
          id: `item-${currentSection.id}-${currentSection.items.length}`,
          name: cleanChecklistText(lineText),
          type: detectItemType(lineText),
          required: false,
        });
      } else if (lineText.length > 0) {
        currentSection.content = (currentSection.content || '') + lineText + '\n';
      }
    }
  }
  
  // Add last section
  if (currentSection) {
    sections.push(currentSection);
  }
  
  // If no sections found, create a default one
  if (sections.length === 0) {
    sections.push({
      id: 'section-0',
      name: 'General Information',
      order_index: 0,
      type: 'text',
      content: sortedBlocks.map(b => b.text).join(' '),
      items: [],
    });
  }
  
  // Detect and parse tables
  const enhancedSections = detectTables(sections, sortedBlocks);
  
  return {
    name: cleanFileName(fileName),
    category: detectCategory(coverPage.title, sections),
    description: `Extracted from ${fileName}`,
    cover_page: coverPage,
    sections: enhancedSections,
    metadata: {
      pageCount,
      extractedAt: new Date().toISOString(),
      sourceFileName: fileName,
    },
  };
}

/**
 * Group text blocks into lines based on Y position
 */
function groupBlocksIntoLines(blocks: TextBlock[]): TextBlock[][] {
  const lines: TextBlock[][] = [];
  let currentLine: TextBlock[] = [];
  let lastY = -1;
  let lastPage = -1;
  
  for (const block of blocks) {
    const isNewLine = 
      block.page !== lastPage ||
      (lastY !== -1 && Math.abs(block.y - lastY) > 5);
    
    if (isNewLine && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [];
    }
    
    currentLine.push(block);
    lastY = block.y;
    lastPage = block.page;
  }
  
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * Extract cover page information
 */
function extractCoverPageInfo(blocks: TextBlock[]): ExtractedTemplate['cover_page'] {
  // Sort by font size (largest first) to find title
  const sortedBySize = [...blocks].sort((a, b) => b.fontSize - a.fontSize);
  
  const title = sortedBySize[0]?.text || 'Untitled Document';
  const subtitle = sortedBySize[1]?.text || '';
  
  // Look for company name patterns
  const companyBlock = blocks.find(b => 
    /company|ltd|inc|llc|corp|pty|prepared by|watson|fortress/i.test(b.text)
  );
  
  // Look for date patterns
  const dateBlock = blocks.find(b => 
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(b.text)
  );
  
  return {
    title: cleanSectionTitle(title),
    subtitle: cleanSectionTitle(subtitle),
    company_name: companyBlock?.text || 'Watson Mattheus',
    date: dateBlock?.text,
  };
}

/**
 * Clean section title
 */
function cleanSectionTitle(text: string): string {
  return text
    .replace(/^(\d+\.|\d+\)|[A-Z]\.|\-|\*)\s*/i, '')
    .replace(/[:]+$/, '')
    .trim();
}

/**
 * Check if text looks like a checklist item
 */
function isChecklistItem(text: string): boolean {
  return /^([\[\]☐☑✓✗□■●○•\-\*]|\d+\.|[a-z]\))/i.test(text.trim());
}

/**
 * Clean checklist item text
 */
function cleanChecklistText(text: string): string {
  return text
    .replace(/^[\[\]☐☑✓✗□■●○•\-\*]\s*/, '')
    .replace(/^(\d+\.|[a-z]\))\s*/i, '')
    .trim();
}

/**
 * Detect item type from text content
 */
function detectItemType(text: string): ExtractedItem['type'] {
  const lowerText = text.toLowerCase();
  
  if (/photo|image|picture|attachment/i.test(lowerText)) return 'image';
  if (/yes\/no|pass\/fail|✓|✗|☐|☑/i.test(lowerText)) return 'checkbox';
  if (/select|choose|option/i.test(lowerText)) return 'select';
  if (/notes|comments|description|remarks|details/i.test(lowerText)) return 'textarea';
  if (/number|qty|quantity|count|amount|reading|value/i.test(lowerText)) return 'number';
  
  return 'text';
}

/**
 * Detect document category
 */
function detectCategory(title: string, sections: ExtractedSection[]): string {
  const fullText = (title + ' ' + sections.map(s => s.name).join(' ')).toLowerCase();
  
  if (/solar|pv|photovoltaic|panel/i.test(fullText)) return 'Solar';
  if (/generator|genset|standby|backup/i.test(fullText)) return 'Generator';
  if (/medium\s*voltage|mv|11kv|22kv|substation/i.test(fullText)) return 'Medium Voltage';
  if (/low\s*voltage|lv|distribution|db|circuit/i.test(fullText)) return 'Low Voltage';
  if (/progress|snag|defect|punch/i.test(fullText)) return 'Progress';
  if (/drawing|site\s*plan|layout|floor/i.test(fullText)) return 'Site Drawing';
  
  return 'General';
}

/**
 * Clean file name for template name
 */
function cleanFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '') // Remove extension
    .replace(/[_-]/g, ' ')   // Replace separators with spaces
    .replace(/\s+/g, ' ')    // Normalize spaces
    .trim();
}

/**
 * Detect and parse tables from text blocks
 */
function detectTables(
  sections: ExtractedSection[],
  blocks: TextBlock[]
): ExtractedSection[] {
  // Simple table detection - look for aligned columns
  return sections.map(section => {
    if (section.content?.includes('|') || hasTabularStructure(section.content || '')) {
      const tableData = parseSimpleTable(section.content || '');
      if (tableData.headers.length > 1) {
        return {
          ...section,
          type: 'table' as const,
          tableData,
        };
      }
    }
    return section;
  });
}

/**
 * Check if content has tabular structure
 */
function hasTabularStructure(content: string): boolean {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return false;
  
  // Check if lines have consistent delimiter patterns
  const delimiterCounts = lines.map(line => 
    (line.match(/\t|  +|\|/g) || []).length
  );
  
  return delimiterCounts.filter(c => c > 1).length >= lines.length * 0.7;
}

/**
 * Parse simple table from content
 */
function parseSimpleTable(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  
  // Use tabs, multiple spaces, or pipes as delimiters
  const splitLine = (line: string): string[] => {
    if (line.includes('|')) {
      return line.split('|').map(c => c.trim()).filter(c => c);
    }
    if (line.includes('\t')) {
      return line.split('\t').map(c => c.trim()).filter(c => c);
    }
    return line.split(/\s{2,}/).map(c => c.trim()).filter(c => c);
  };
  
  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(splitLine);
  
  return { headers, rows };
}

/**
 * Generate PDF preview from extracted template
 */
export async function generateTemplatePreviewPDF(
  template: ExtractedTemplate
): Promise<Blob> {
  const { generatePdfBlob, createBaseDocDefinition } = await import('./pdfMakeConfig');
  
  const content: any[] = [];
  
  // Cover page
  if (template.cover_page) {
    content.push(
      { text: template.cover_page.title, style: 'coverTitle', margin: [0, 50, 0, 10] },
      { text: template.cover_page.subtitle, style: 'coverSubtitle', margin: [0, 0, 0, 30] },
      { text: template.cover_page.company_name, style: 'coverMeta', margin: [0, 0, 0, 10] },
      { text: template.cover_page.date || new Date().toLocaleDateString(), style: 'coverMeta' },
      { text: '', pageBreak: 'after' }
    );
  }
  
  // Sections
  for (const section of template.sections) {
    content.push({
      text: section.name,
      style: 'h2',
      margin: [0, 10, 0, 10],
    });
    
    if (section.type === 'table' && section.tableData) {
      content.push({
        table: {
          headerRows: 1,
          widths: section.tableData.headers.map(() => '*'),
          body: [
            section.tableData.headers.map(h => ({ text: h, style: 'tableHeader' })),
            ...section.tableData.rows.map(row => 
              row.map(cell => ({ text: cell, style: 'tableBody' }))
            ),
          ],
        },
        margin: [0, 0, 0, 15],
      });
    } else if (section.items && section.items.length > 0) {
      for (const item of section.items) {
        content.push({
          columns: [
            { width: 20, text: '☐', style: 'body' },
            { width: '*', text: item.name, style: 'body' },
          ],
          margin: [0, 2, 0, 2],
        });
      }
    } else if (section.content) {
      content.push({
        text: section.content.trim(),
        style: 'body',
        margin: [0, 0, 0, 10],
      });
    }
  }
  
  const docDefinition = createBaseDocDefinition(content, {
    title: template.name,
    author: template.cover_page?.company_name,
  });
  
  return generatePdfBlob(docDefinition);
}
