/**
 * PDF Template Exporter
 * Generates PDFs from templates with full customization support
 */

import { 
  createBaseDocDefinition, 
  generatePdfBlob, 
  downloadPdf,
  COLORS, 
  DEFAULT_STYLES,
  getStandardTableLayout,
  mmToPt,
  CONTENT_WIDTH_PT,
} from './pdfMakeConfig';
import { DOCUMENT_DESIGN_STANDARDS } from './documentDesignStandards';

export interface TemplateData {
  name: string;
  category: string;
  description?: string;
  sections: TemplateSection[];
  cover_page?: {
    title: string;
    subtitle: string;
    company_name: string;
    logo_url?: string;
  };
  tenants?: TenantData[];
}

export interface TemplateSection {
  id: string;
  name: string;
  order_index: number;
  items?: TemplateItem[];
  content?: string;
  type?: 'header' | 'table' | 'text' | 'checklist' | 'image';
}

export interface TemplateItem {
  id: string;
  name: string;
  type: 'text' | 'checkbox' | 'select' | 'textarea' | 'image' | 'document' | 'number' | 'checklist';
  value?: string;
  options?: string[];
  required?: boolean;
}

export interface TenantData {
  id: string;
  shopNumber: string;
  shopName: string;
  breakerSize?: string;
  ctSizeAndRatio?: string;
}

export interface ExportOptions {
  includeHeader: boolean;
  includeFooter: boolean;
  includeCoverPage: boolean;
  includeTableOfContents: boolean;
  accentColor: 'blue' | 'green' | 'orange' | 'red' | 'purple';
  watermark?: string;
  logoUrl?: string;
  companyName?: string;
  reportDate?: Date;
  referenceNumber?: string;
}

const ACCENT_COLORS = {
  blue: { primary: '#2563eb', light: '#dbeafe', text: '#1e40af' },
  green: { primary: '#16a34a', light: '#dcfce7', text: '#166534' },
  orange: { primary: '#ea580c', light: '#ffedd5', text: '#c2410c' },
  red: { primary: '#dc2626', light: '#fee2e2', text: '#b91c1c' },
  purple: { primary: '#9333ea', light: '#f3e8ff', text: '#7e22ce' },
};

/**
 * Export a template to PDF with full customization
 */
export async function exportTemplateToPDF(
  template: TemplateData,
  options: ExportOptions
): Promise<Blob> {
  const colors = ACCENT_COLORS[options.accentColor];
  const content: any[] = [];
  
  // Cover page
  if (options.includeCoverPage) {
    content.push(...buildCoverPage(template, options, colors));
  }
  
  // Table of Contents
  if (options.includeTableOfContents) {
    content.push(...buildTableOfContents(template.sections));
  }
  
  // Sections
  for (const section of template.sections.sort((a, b) => a.order_index - b.order_index)) {
    content.push(...buildSection(section, colors));
  }
  
  // Tenants section
  if (template.tenants && template.tenants.length > 0) {
    content.push(...buildTenantsSection(template.tenants, colors));
  }
  
  // Build document definition
  const docDefinition = createBaseDocDefinition(content, {
    title: template.name,
    author: options.companyName || template.cover_page?.company_name,
    subject: template.description,
    header: options.includeHeader ? buildHeader(template.name, colors) : undefined,
    footer: options.includeFooter ? buildFooter(options) : undefined,
    background: options.watermark ? buildWatermark(options.watermark) : undefined,
  });
  
  return generatePdfBlob(docDefinition);
}

/**
 * Download template as PDF
 */
export function downloadTemplatePDF(
  template: TemplateData,
  options: ExportOptions,
  filename?: string
): void {
  const colors = ACCENT_COLORS[options.accentColor];
  const content: any[] = [];
  
  if (options.includeCoverPage) {
    content.push(...buildCoverPage(template, options, colors));
  }
  
  if (options.includeTableOfContents) {
    content.push(...buildTableOfContents(template.sections));
  }
  
  for (const section of template.sections.sort((a, b) => a.order_index - b.order_index)) {
    content.push(...buildSection(section, colors));
  }
  
  if (template.tenants && template.tenants.length > 0) {
    content.push(...buildTenantsSection(template.tenants, colors));
  }
  
  const docDefinition = createBaseDocDefinition(content, {
    title: template.name,
    author: options.companyName || template.cover_page?.company_name,
    header: options.includeHeader ? buildHeader(template.name, colors) : undefined,
    footer: options.includeFooter ? buildFooter(options) : undefined,
    background: options.watermark ? buildWatermark(options.watermark) : undefined,
  });
  
  const safeName = (filename || template.name).replace(/[^a-zA-Z0-9-_]/g, '_');
  downloadPdf(docDefinition, `${safeName}.pdf`);
}

/**
 * Build cover page content
 */
function buildCoverPage(
  template: TemplateData,
  options: ExportOptions,
  colors: typeof ACCENT_COLORS['blue']
): any[] {
  const content: any[] = [];
  
  // Top accent bar
  content.push({
    canvas: [
      {
        type: 'rect',
        x: -42.5,
        y: -50,
        w: 595.28,
        h: 8,
        color: colors.primary,
      },
    ],
  });
  
  // Logo or company name
  if (options.logoUrl) {
    content.push({
      image: options.logoUrl,
      width: 120,
      alignment: 'center',
      margin: [0, 40, 0, 20],
    });
  } else {
    content.push({
      text: options.companyName || template.cover_page?.company_name || 'Company Name',
      style: 'h3',
      color: colors.text,
      alignment: 'center',
      margin: [0, 40, 0, 20],
    });
  }
  
  // Report type badge
  content.push({
    table: {
      widths: ['auto'],
      body: [[{ text: template.category.toUpperCase(), style: 'caption', color: colors.text }]],
    },
    layout: {
      fillColor: colors.light,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 15,
      paddingRight: () => 15,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    alignment: 'center',
    margin: [0, 0, 0, 20],
  });
  
  // Title
  content.push({
    text: template.cover_page?.title || template.name,
    style: 'coverTitle',
    color: colors.primary,
    margin: [0, 20, 0, 10],
  });
  
  // Subtitle
  if (template.cover_page?.subtitle || template.description) {
    content.push({
      text: template.cover_page?.subtitle || template.description,
      style: 'coverSubtitle',
      margin: [0, 0, 0, 30],
    });
  }
  
  // Decorative line
  content.push({
    canvas: [
      {
        type: 'line',
        x1: 200,
        y1: 0,
        x2: 360,
        y2: 0,
        lineWidth: 2,
        lineColor: colors.primary,
      },
    ],
    margin: [0, 10, 0, 30],
  });
  
  // Date
  const reportDate = options.reportDate || new Date();
  content.push({
    text: reportDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    style: 'coverMeta',
    margin: [0, 20, 0, 5],
  });
  
  // Reference number
  if (options.referenceNumber) {
    content.push({
      text: `Reference: ${options.referenceNumber}`,
      style: 'caption',
      alignment: 'center',
      margin: [0, 0, 0, 0],
    });
  }
  
  // Page break
  content.push({ text: '', pageBreak: 'after' });
  
  return content;
}

/**
 * Build table of contents
 */
function buildTableOfContents(sections: TemplateSection[]): any[] {
  const content: any[] = [
    { text: 'Table of Contents', style: 'h2', margin: [0, 0, 0, 20] },
  ];
  
  const tocItems = sections
    .sort((a, b) => a.order_index - b.order_index)
    .map((section, idx) => ({
      columns: [
        { width: 'auto', text: `${idx + 1}.`, style: 'body', margin: [0, 0, 10, 0] },
        { width: '*', text: section.name, style: 'body' },
        { width: 'auto', text: `${idx + 3}`, style: 'muted', alignment: 'right' },
      ],
      margin: [0, 5, 0, 5],
    }));
  
  content.push(...tocItems);
  content.push({ text: '', pageBreak: 'after' });
  
  return content;
}

/**
 * Build section content
 */
function buildSection(
  section: TemplateSection,
  colors: typeof ACCENT_COLORS['blue']
): any[] {
  const content: any[] = [];
  
  // Section header
  content.push({
    table: {
      widths: ['*'],
      body: [[{ text: section.name, style: 'h3', color: '#ffffff' }]],
    },
    layout: {
      fillColor: colors.primary,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: () => 8,
      paddingBottom: () => 8,
    },
    margin: [0, 15, 0, 15],
  });
  
  // Section content
  if (section.content) {
    content.push({
      text: section.content,
      style: 'body',
      margin: [0, 0, 0, 10],
    });
  }
  
  // Section items (checklist)
  if (section.items && section.items.length > 0) {
    const itemRows = section.items.map((item, idx) => {
      const checkbox = { text: '☐', fontSize: 14, margin: [0, 2, 0, 0] };
      const itemName = { text: item.name, style: 'body' };
      const itemValue = item.type === 'checkbox' 
        ? { text: '[ Pass / Fail / N/A ]', style: 'muted', alignment: 'right' }
        : { text: item.value || '________________', style: 'muted', alignment: 'right' };
      
      return [checkbox, itemName, itemValue];
    });
    
    content.push({
      table: {
        widths: [20, '*', 100],
        body: itemRows,
      },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 0 : 0.5,
        vLineWidth: () => 0,
        hLineColor: () => '#e2e8f0',
        paddingTop: () => 6,
        paddingBottom: () => 6,
      },
      margin: [0, 0, 0, 15],
    });
  }
  
  return content;
}

/**
 * Build tenants section
 */
function buildTenantsSection(
  tenants: TenantData[],
  colors: typeof ACCENT_COLORS['blue']
): any[] {
  const content: any[] = [];
  
  // Section header
  content.push({
    table: {
      widths: ['*'],
      body: [[{ text: 'Tenant Information', style: 'h3', color: '#ffffff' }]],
    },
    layout: {
      fillColor: colors.primary,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: () => 8,
      paddingBottom: () => 8,
    },
    margin: [0, 15, 0, 15],
    pageBreak: 'before',
  });
  
  // Tenants table
  const tableBody = [
    [
      { text: 'Shop #', style: 'tableHeader' },
      { text: 'Tenant Name', style: 'tableHeader' },
      { text: 'Breaker Size', style: 'tableHeader' },
      { text: 'CT Ratio', style: 'tableHeader' },
    ],
    ...tenants.map(tenant => [
      { text: tenant.shopNumber || '-', style: 'tableBody' },
      { text: tenant.shopName || '-', style: 'tableBody' },
      { text: tenant.breakerSize || '-', style: 'tableBody' },
      { text: tenant.ctSizeAndRatio || '-', style: 'tableBody' },
    ]),
  ];
  
  content.push({
    table: {
      headerRows: 1,
      widths: ['auto', '*', 'auto', 'auto'],
      body: tableBody,
    },
    layout: getStandardTableLayout(),
    margin: [0, 0, 0, 15],
  });
  
  return content;
}

/**
 * Build page header
 */
function buildHeader(
  title: string,
  colors: typeof ACCENT_COLORS['blue']
): (currentPage: number, pageCount: number) => any {
  return (currentPage: number, pageCount: number) => {
    if (currentPage === 1) return null; // Skip cover page
    
    return {
      columns: [
        { text: title, style: 'caption', color: colors.primary },
        { text: `Page ${currentPage} of ${pageCount}`, style: 'caption', alignment: 'right' },
      ],
      margin: [40, 20, 40, 0],
    };
  };
}

/**
 * Build page footer
 */
function buildFooter(options: ExportOptions): (currentPage: number, pageCount: number) => any {
  return (currentPage: number, pageCount: number) => {
    if (currentPage === 1) return null; // Skip cover page
    
    const date = (options.reportDate || new Date()).toLocaleDateString('en-GB');
    
    return {
      columns: [
        { text: 'Confidential', style: 'footer', color: '#a0aec0' },
        { text: options.companyName || 'Watson Mattheus', style: 'footer', alignment: 'center', color: '#a0aec0' },
        { text: date, style: 'footer', alignment: 'right', color: '#a0aec0' },
      ],
      margin: [40, 0, 40, 20],
    };
  };
}

/**
 * Build watermark background
 */
function buildWatermark(text: string): (currentPage: number) => any {
  return (currentPage: number) => {
    return {
      text: text,
      color: '#f0f0f0',
      fontSize: 60,
      bold: true,
      opacity: 0.3,
      absolutePosition: { x: 150, y: 400 },
      rotation: 315,
    };
  };
}
