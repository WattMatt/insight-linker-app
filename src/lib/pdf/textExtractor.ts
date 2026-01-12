/**
 * Advanced PDF Text Extraction Engine
 * Handles complex document structures, tables, and multi-column layouts
 */

import * as pdfjsLib from 'pdfjs-dist';

export interface TextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  pageNumber: number;
  isHeader: boolean;
  isBold: boolean;
  column?: number;
}

export interface TextLine {
  text: string;
  y: number;
  blocks: TextBlock[];
  isTableRow: boolean;
}

export interface ExtractedColumn {
  index: number;
  xStart: number;
  xEnd: number;
  blocks: TextBlock[];
}

export interface TableCell {
  text: string;
  row: number;
  col: number;
  x: number;
  y: number;
}

export interface DetectedTable {
  rows: TableCell[][];
  headers: string[];
  startY: number;
  endY: number;
  pageNumber: number;
}

export interface PageTextContent {
  pageNumber: number;
  blocks: TextBlock[];
  lines: TextLine[];
  tables: DetectedTable[];
  columns: ExtractedColumn[];
  rawText: string;
  structuredText: string;
}

// Tolerance for grouping text on same line
const LINE_TOLERANCE = 3;
const COLUMN_GAP_THRESHOLD = 50;
const TABLE_CELL_PATTERN = /^[\d.,\-$%]+$|^[A-Z]{1,4}$/;

/**
 * Extract text blocks with position and style information
 */
export async function extractTextBlocks(
  page: pdfjsLib.PDFPageProxy,
  pageNumber: number
): Promise<TextBlock[]> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const blocks: TextBlock[] = [];
  
  for (const item of textContent.items as any[]) {
    if (!item.str || item.str.trim() === '') continue;
    
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
    
    blocks.push({
      text: item.str,
      x: tx[4],
      y: viewport.height - tx[5],
      width: item.width || fontSize * item.str.length * 0.6,
      height: fontSize,
      fontSize,
      fontName: item.fontName || '',
      pageNumber,
      isHeader: fontSize > 14,
      isBold: item.fontName?.toLowerCase().includes('bold') || false
    });
  }
  
  return blocks.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Group text blocks into lines based on Y position
 */
export function groupBlocksIntoLines(blocks: TextBlock[]): TextLine[] {
  if (blocks.length === 0) return [];
  
  const lines: TextLine[] = [];
  let currentLine: TextBlock[] = [blocks[0]];
  let currentY = blocks[0].y;
  
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    
    if (Math.abs(block.y - currentY) <= LINE_TOLERANCE) {
      currentLine.push(block);
    } else {
      // Sort blocks in line by X position
      currentLine.sort((a, b) => a.x - b.x);
      
      lines.push({
        text: currentLine.map(b => b.text).join(' '),
        y: currentY,
        blocks: currentLine,
        isTableRow: detectTableRow(currentLine)
      });
      
      currentLine = [block];
      currentY = block.y;
    }
  }
  
  // Add last line
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.x - b.x);
    lines.push({
      text: currentLine.map(b => b.text).join(' '),
      y: currentY,
      blocks: currentLine,
      isTableRow: detectTableRow(currentLine)
    });
  }
  
  return lines;
}

/**
 * Detect if a line appears to be a table row
 */
function detectTableRow(blocks: TextBlock[]): boolean {
  if (blocks.length < 2) return false;
  
  // Check for consistent spacing between blocks
  const gaps: number[] = [];
  for (let i = 1; i < blocks.length; i++) {
    gaps.push(blocks[i].x - (blocks[i-1].x + blocks[i-1].width));
  }
  
  // If gaps are relatively uniform and significant, likely a table row
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const hasUniformGaps = gaps.every(g => Math.abs(g - avgGap) < avgGap * 0.5);
  
  // Check for tabular content patterns
  const hasTabularContent = blocks.some(b => TABLE_CELL_PATTERN.test(b.text.trim()));
  
  return hasUniformGaps && avgGap > 20 && (hasTabularContent || blocks.length >= 3);
}

/**
 * Detect multi-column layout
 */
export function detectColumns(blocks: TextBlock[]): ExtractedColumn[] {
  if (blocks.length < 10) return [];
  
  // Find X positions where text commonly starts
  const xPositions = blocks.map(b => Math.round(b.x / 10) * 10);
  const xCounts = new Map<number, number>();
  
  for (const x of xPositions) {
    xCounts.set(x, (xCounts.get(x) || 0) + 1);
  }
  
  // Find significant column starts (positions with many blocks)
  const threshold = blocks.length * 0.05;
  const columnStarts = Array.from(xCounts.entries())
    .filter(([_, count]) => count > threshold)
    .map(([x, _]) => x)
    .sort((a, b) => a - b);
  
  // Check for significant gaps between column starts
  const columns: ExtractedColumn[] = [];
  let colIndex = 0;
  
  for (let i = 0; i < columnStarts.length; i++) {
    const start = columnStarts[i];
    const end = columnStarts[i + 1] || Infinity;
    
    if (i > 0 && start - columnStarts[i - 1] < COLUMN_GAP_THRESHOLD) {
      continue; // Skip if too close to previous
    }
    
    const columnBlocks = blocks.filter(b => b.x >= start && b.x < end);
    
    if (columnBlocks.length > blocks.length * 0.1) {
      columns.push({
        index: colIndex++,
        xStart: start,
        xEnd: end,
        blocks: columnBlocks
      });
    }
  }
  
  return columns.length > 1 ? columns : [];
}

/**
 * Detect and extract tables from text lines
 */
export function detectTables(lines: TextLine[]): DetectedTable[] {
  const tables: DetectedTable[] = [];
  let currentTableRows: TextLine[] = [];
  
  for (const line of lines) {
    if (line.isTableRow) {
      currentTableRows.push(line);
    } else if (currentTableRows.length >= 2) {
      // End of table detected
      const table = buildTable(currentTableRows);
      if (table) tables.push(table);
      currentTableRows = [];
    } else {
      currentTableRows = [];
    }
  }
  
  // Check for remaining table
  if (currentTableRows.length >= 2) {
    const table = buildTable(currentTableRows);
    if (table) tables.push(table);
  }
  
  return tables;
}

/**
 * Build table structure from detected rows
 */
function buildTable(rows: TextLine[]): DetectedTable | null {
  if (rows.length < 2) return null;
  
  // Find column boundaries based on first row
  const firstRow = rows[0].blocks;
  const columnBoundaries = firstRow.map(b => ({
    start: b.x,
    end: b.x + b.width
  }));
  
  const tableRows: TableCell[][] = [];
  
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const cells: TableCell[] = [];
    
    for (let colIdx = 0; colIdx < columnBoundaries.length; colIdx++) {
      const boundary = columnBoundaries[colIdx];
      const matchingBlocks = row.blocks.filter(b => 
        b.x >= boundary.start - 10 && b.x <= boundary.end + 10
      );
      
      cells.push({
        text: matchingBlocks.map(b => b.text).join(' '),
        row: rowIdx,
        col: colIdx,
        x: boundary.start,
        y: row.y
      });
    }
    
    tableRows.push(cells);
  }
  
  return {
    rows: tableRows,
    headers: tableRows[0]?.map(c => c.text) || [],
    startY: rows[0].y,
    endY: rows[rows.length - 1].y,
    pageNumber: rows[0].blocks[0]?.pageNumber || 1
  };
}

/**
 * Extract complete page content with structure analysis
 */
export async function extractPageContent(
  page: pdfjsLib.PDFPageProxy,
  pageNumber: number
): Promise<PageTextContent> {
  const blocks = await extractTextBlocks(page, pageNumber);
  const lines = groupBlocksIntoLines(blocks);
  const tables = detectTables(lines);
  const columns = detectColumns(blocks);
  
  const rawText = blocks.map(b => b.text).join(' ');
  
  // Build structured text respecting columns
  let structuredText = '';
  if (columns.length > 1) {
    // Multi-column layout - read column by column
    for (const col of columns) {
      const colLines = groupBlocksIntoLines(col.blocks);
      structuredText += colLines.map(l => l.text).join('\n') + '\n\n';
    }
  } else {
    // Single column - read top to bottom
    structuredText = lines.map(l => l.text).join('\n');
  }
  
  return {
    pageNumber,
    blocks,
    lines,
    tables,
    columns,
    rawText,
    structuredText
  };
}

/**
 * Extract all content from a PDF document
 */
export async function extractDocumentContent(
  pdf: pdfjsLib.PDFDocumentProxy,
  maxPages?: number,
  onProgress?: (current: number, total: number) => void
): Promise<PageTextContent[]> {
  const pageCount = Math.min(pdf.numPages, maxPages || pdf.numPages);
  const results: PageTextContent[] = [];
  
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await extractPageContent(page, i);
    results.push(content);
    onProgress?.(i, pageCount);
  }
  
  return results;
}
