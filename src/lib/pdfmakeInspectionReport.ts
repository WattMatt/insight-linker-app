/**
 * PDFMAKE-BASED INSPECTION REPORT GENERATOR
 * 
 * Professional engineering-style inspection reports with:
 * - Cover page with company branding
 * - Table of contents with page numbers
 * - Quality score dashboard with visual indicators
 * - Photo grid layouts (2-3 columns)
 * - SANS-compliant section formatting
 * - Clean technical layout with clear section headers
 */

import {
  generateReport,
  loadImageAsDataUrl,
  COLORS,
  CONTENT_WIDTH_PT,
  CoverPageOptions,
  createCoverPage,
} from './pdfEngine';
import { supabase } from '@/integrations/supabase/client';
import { mmToPt } from './pdfMakeConfig';

// Type definitions
type Content = any;

// Engineering report color palette
const REPORT_COLORS = {
  primary: '#1e3a5f',      // Navy blue - professional header
  secondary: '#1a7a8a',    // Teal - section banners
  accent: '#2563eb',       // Bright blue - highlights
  success: '#16a34a',      // Green - pass
  warning: '#d97706',      // Amber - pending
  error: '#dc2626',        // Red - fail
  lightBg: '#f8fafc',      // Light gray background
  border: '#e2e8f0',       // Border color
  textPrimary: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
};

export interface InspectionSection {
  title: string;
  items: Array<{
    label: string;
    value: string | boolean | number;
    type?: string;
    notes?: string;
    photos?: string[];
  }>;
}

export interface InspectionSnag {
  title: string;
  description?: string;
  status: string;
  riskLevel?: string;
  photos?: string[];
}

export interface InspectionSignature {
  name: string;
  role?: string;
  signatureUrl?: string;
  signedAt?: string;
}

export interface InspectionTenant {
  shopName: string;
  shopNumber?: string;
  meterSerialNumber?: string;
  breakerSize?: string;
  ctSizeAndRatio?: string;
  meterImage?: string;
  breakerImage?: string;
  ctRatioImage?: string;
}

export interface InspectionReportData {
  inspectionId: string;
  templateName?: string;
  inspectorName?: string;
  inspectionDate?: string;
  status?: string;
  qualityRating?: number;
  generalInfo?: Record<string, any>;
  sections?: InspectionSection[];
  tenants?: InspectionTenant[];
  snags?: InspectionSnag[];
  signatures?: InspectionSignature[];
  subsectionName?: string;
}

export interface GenerateInspectionReportOptions {
  inspection: InspectionReportData;
  siteName: string;
  clientName?: string;
  siteLogoUrl?: string | null;
  accentColor?: 'blue' | 'green' | 'orange' | 'red' | 'purple';
}

export interface GenerateInspectionReportResult {
  success: boolean;
  blob?: Blob;
  previewUrl?: string;
  filename?: string;
  error?: string;
}

// ============================================================================
// IMAGE UTILITIES
// ============================================================================

async function loadImagesAsDataUrls(urls: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  const loadPromises = urls.map(async (url) => {
    if (!url) return;
    try {
      const dataUrl = await loadImageAsDataUrl(url);
      if (dataUrl) {
        results.set(url, dataUrl);
      }
    } catch (error) {
      console.warn(`Failed to load image: ${url}`, error);
    }
  });
  
  await Promise.all(loadPromises);
  return results;
}

function collectImageUrls(inspection: InspectionReportData): string[] {
  const urls: string[] = [];
  
  inspection.sections?.forEach(section => {
    section.items?.forEach(item => {
      if (item.photos?.length) {
        urls.push(...item.photos.filter(Boolean));
      }
    });
  });
  
  inspection.tenants?.forEach(tenant => {
    if (tenant.meterImage) urls.push(tenant.meterImage);
    if (tenant.breakerImage) urls.push(tenant.breakerImage);
    if (tenant.ctRatioImage) urls.push(tenant.ctRatioImage);
  });
  
  inspection.snags?.forEach(snag => {
    if (snag.photos?.length) {
      urls.push(...snag.photos.filter(Boolean));
    }
  });
  
  inspection.signatures?.forEach(sig => {
    if (sig.signatureUrl && !sig.signatureUrl.startsWith('data:')) {
      urls.push(sig.signatureUrl);
    }
  });
  
  return [...new Set(urls)];
}

// ============================================================================
// STATUS UTILITIES
// ============================================================================

function getStatusColor(status: string): string {
  const statusLower = status.toLowerCase();
  if (['pass', 'passed', 'yes', 'compliant', 'ok', 'good', 'complete', 'completed'].includes(statusLower)) {
    return REPORT_COLORS.success;
  }
  if (['fail', 'failed', 'no', 'non-compliant', 'bad', 'critical'].includes(statusLower)) {
    return REPORT_COLORS.error;
  }
  if (['pending', 'in progress', 'partial', 'warning', 'n/a'].includes(statusLower)) {
    return REPORT_COLORS.warning;
  }
  return REPORT_COLORS.textMuted;
}

function isPassStatus(status: string): boolean {
  const statusLower = status.toLowerCase();
  return ['pass', 'passed', 'yes', 'compliant', 'ok', 'good', 'complete', 'completed'].includes(statusLower);
}

function isFailStatus(status: string): boolean {
  const statusLower = status.toLowerCase();
  return ['fail', 'failed', 'no', 'non-compliant', 'bad', 'critical'].includes(statusLower);
}

// ============================================================================
// STATISTICS CALCULATION
// ============================================================================

interface InspectionStats {
  totalItems: number;
  passCount: number;
  failCount: number;
  pendingCount: number;
  passPercentage: number;
  totalPhotos: number;
  totalSections: number;
  sectionStats: Array<{
    title: string;
    passCount: number;
    failCount: number;
    totalItems: number;
    photoCount: number;
  }>;
}

function calculateStats(inspection: InspectionReportData): InspectionStats {
  let totalItems = 0;
  let passCount = 0;
  let failCount = 0;
  let pendingCount = 0;
  let totalPhotos = 0;
  const sectionStats: InspectionStats['sectionStats'] = [];

  inspection.sections?.forEach(section => {
    let sectionPass = 0;
    let sectionFail = 0;
    let sectionPhotos = 0;
    
    section.items?.forEach(item => {
      totalItems++;
      const status = typeof item.value === 'boolean'
        ? (item.value ? 'pass' : 'fail')
        : String(item.value || '');
      
      if (isPassStatus(status)) {
        passCount++;
        sectionPass++;
      } else if (isFailStatus(status)) {
        failCount++;
        sectionFail++;
      } else {
        pendingCount++;
      }
      
      if (item.photos?.length) {
        totalPhotos += item.photos.length;
        sectionPhotos += item.photos.length;
      }
    });
    
    sectionStats.push({
      title: section.title,
      passCount: sectionPass,
      failCount: sectionFail,
      totalItems: section.items?.length || 0,
      photoCount: sectionPhotos,
    });
  });

  // Add snag photos
  inspection.snags?.forEach(snag => {
    if (snag.photos?.length) {
      totalPhotos += snag.photos.length;
    }
  });

  // Add tenant photos
  inspection.tenants?.forEach(tenant => {
    if (tenant.meterImage) totalPhotos++;
    if (tenant.breakerImage) totalPhotos++;
    if (tenant.ctRatioImage) totalPhotos++;
  });

  return {
    totalItems,
    passCount,
    failCount,
    pendingCount,
    passPercentage: totalItems > 0 ? Math.round((passCount / totalItems) * 100) : 0,
    totalPhotos,
    totalSections: inspection.sections?.length || 0,
    sectionStats,
  };
}

// ============================================================================
// COVER PAGE (Engineering Style)
// ============================================================================

function createEngineeringCoverPage(
  inspection: InspectionReportData,
  siteName: string,
  clientName?: string,
  logoDataUrl?: string | null,
  accentColor: string = 'blue'
): Content[] {
  const formattedDate = inspection.inspectionDate
    ? new Date(inspection.inspectionDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

  const content: Content[] = [];

  // Top accent bar
  content.push({
    canvas: [{
      type: 'rect',
      x: 0,
      y: 0,
      w: 595,
      h: 15,
      color: REPORT_COLORS.primary,
    }],
    absolutePosition: { x: 0, y: 0 },
  });

  // Logo section
  if (logoDataUrl) {
    content.push({
      image: logoDataUrl,
      height: 60,
      alignment: 'center',
      margin: [0, 50, 0, 20],
    });
  } else {
    content.push({
      text: '',
      margin: [0, 60, 0, 0],
    });
  }

  // Main title with dashed border box
  content.push({
    table: {
      widths: ['*'],
      body: [[
        {
          stack: [
            {
              text: inspection.templateName || 'Inspection Report',
              fontSize: 28,
              bold: true,
              color: REPORT_COLORS.primary,
              alignment: 'center',
              margin: [0, 15, 0, 10],
            },
            {
              text: inspection.subsectionName || '',
              fontSize: 16,
              color: REPORT_COLORS.secondary,
              alignment: 'center',
              margin: [0, 0, 0, 15],
            },
          ],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => REPORT_COLORS.border,
      vLineColor: () => REPORT_COLORS.border,
      hLineStyle: () => ({ dash: { length: 3, space: 2 } }),
      vLineStyle: () => ({ dash: { length: 3, space: 2 } }),
      paddingLeft: () => 20,
      paddingRight: () => 20,
      paddingTop: () => 10,
      paddingBottom: () => 10,
    },
    margin: [40, 20, 40, 50],
  });

  // Site info box with prominent left border accent (no emojis)
  const infoRows: Content[][] = [];
  
  infoRows.push([
    { text: 'Site:', fontSize: 10, color: REPORT_COLORS.textSecondary, width: 70 },
    { text: siteName, fontSize: 11, bold: true, color: REPORT_COLORS.textPrimary },
  ]);

  if (clientName) {
    infoRows.push([
      { text: 'Client:', fontSize: 10, color: REPORT_COLORS.textSecondary, width: 70 },
      { text: clientName, fontSize: 11, color: REPORT_COLORS.textPrimary },
    ]);
  }

  if (inspection.inspectorName) {
    infoRows.push([
      { text: 'Inspector:', fontSize: 10, color: REPORT_COLORS.textSecondary, width: 70 },
      { text: inspection.inspectorName, fontSize: 11, color: REPORT_COLORS.textPrimary },
    ]);
  }

  infoRows.push([
    { text: 'Date:', fontSize: 10, color: REPORT_COLORS.textSecondary, width: 70 },
    { text: formattedDate, fontSize: 11, color: REPORT_COLORS.textPrimary },
  ]);

  content.push({
    table: {
      widths: [70, '*'],
      body: infoRows,
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 4 : 0),
      vLineColor: () => REPORT_COLORS.secondary,
      paddingLeft: () => 15,
      paddingRight: () => 12,
      paddingTop: () => 8,
      paddingBottom: () => 8,
    },
    margin: [60, 0, 60, 0],
  });

  // No page break - Quality Score Dashboard will continue on same page
  return content;
}

// ============================================================================
// TABLE OF CONTENTS
// ============================================================================

function createTableOfContents(
  inspection: InspectionReportData,
  stats: InspectionStats
): Content[] {
  const content: Content[] = [];

  // Header
  content.push({
    table: {
      widths: ['*'],
      body: [[{
        text: 'TABLE OF CONTENTS',
        fontSize: 16,
        bold: true,
        color: '#FFFFFF',
        margin: [0, 10, 0, 10],
      }]],
    },
    layout: {
      fillColor: () => REPORT_COLORS.primary,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 15,
    },
    margin: [0, 0, 0, 20],
  });

  const tocItems: Array<{ title: string; page: string; level: number }> = [];
  
  // Standard sections
  tocItems.push({ title: 'Quality Score Dashboard', page: '2', level: 0 });
  tocItems.push({ title: 'General Information', page: '2', level: 0 });

  // Dynamic sections based on inspection data
  let pageNum = 3;
  inspection.sections?.forEach((section, idx) => {
    tocItems.push({ title: section.title, page: pageNum.toString(), level: 0 });
    // Estimate page increment based on items and photos
    const sectionStats = stats.sectionStats[idx];
    const itemCount = sectionStats?.totalItems || 0;
    const photoCount = sectionStats?.photoCount || 0;
    pageNum += Math.ceil((itemCount + photoCount * 2) / 6) || 1;
  });

  if (inspection.snags?.length) {
    tocItems.push({ title: 'Observations & Snag List', page: pageNum.toString(), level: 0 });
    pageNum++;
  }

  if (inspection.tenants?.length) {
    tocItems.push({ title: 'Tenant / Meter Verification', page: pageNum.toString(), level: 0 });
    pageNum++;
  }

  if (inspection.signatures?.length) {
    tocItems.push({ title: 'Sign-Off & Approvals', page: pageNum.toString(), level: 0 });
  }

  // Build TOC table
  const tocRows = tocItems.map(item => [{
    columns: [
      {
        text: item.title,
        fontSize: 11,
        color: REPORT_COLORS.textPrimary,
        margin: [item.level * 15, 0, 0, 0],
      },
      {
        text: '.' .repeat(80),
        fontSize: 8,
        color: REPORT_COLORS.border,
        margin: [5, 4, 5, 0],
      },
      {
        text: item.page,
        fontSize: 11,
        color: REPORT_COLORS.textSecondary,
        alignment: 'right',
        width: 30,
      },
    ],
    margin: [0, 6, 0, 6],
  }]);

  content.push({
    stack: tocRows.map(row => row[0]),
    margin: [0, 0, 0, 30],
  });

  content.push({ text: '', pageBreak: 'after' });

  return content;
}

// ============================================================================
// QUALITY SCORE DASHBOARD
// ============================================================================

function createQualityDashboard(stats: InspectionStats, qualityRating?: number): Content[] {
  const content: Content[] = [];

  // Section header
  content.push({
    table: {
      widths: ['*'],
      body: [[{
        text: 'QUALITY SCORE DASHBOARD',
        fontSize: 12,
        bold: true,
        color: '#FFFFFF',
        margin: [0, 8, 0, 8],
      }]],
    },
    layout: {
      fillColor: () => REPORT_COLORS.secondary,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 12,
    },
    margin: [0, 0, 0, 15],
  });

  // Main score circle with KPI boxes
  const scoreColor = stats.passPercentage >= 80 ? REPORT_COLORS.success 
    : stats.passPercentage >= 60 ? REPORT_COLORS.warning 
    : REPORT_COLORS.error;

  content.push({
    columns: [
      // Overall score
      {
        stack: [
          {
            canvas: [
              // Background circle
              { type: 'ellipse', x: 60, y: 60, r1: 55, r2: 55, lineWidth: 8, lineColor: REPORT_COLORS.border },
              // Progress arc (simplified as colored ring)
              { type: 'ellipse', x: 60, y: 60, r1: 55, r2: 55, lineWidth: 8, lineColor: scoreColor },
            ],
          },
          {
            text: `${stats.passPercentage}%`,
            fontSize: 28,
            bold: true,
            color: scoreColor,
            alignment: 'center',
            relativePosition: { x: 0, y: -75 },
          },
          {
            text: 'OVERALL',
            fontSize: 8,
            color: REPORT_COLORS.textMuted,
            alignment: 'center',
            relativePosition: { x: 0, y: -52 },
          },
        ],
        width: 140,
        alignment: 'center',
      },
      // KPI grid
      {
        table: {
          widths: ['*', '*'],
          body: [
            [
              {
                stack: [
                  { text: stats.passCount.toString(), fontSize: 24, bold: true, color: REPORT_COLORS.success },
                  { text: 'Items Passed', fontSize: 9, color: REPORT_COLORS.textSecondary },
                ],
                fillColor: '#f0fdf4',
                margin: [12, 10, 12, 10],
              },
              {
                stack: [
                  { text: stats.failCount.toString(), fontSize: 24, bold: true, color: REPORT_COLORS.error },
                  { text: 'Items Failed', fontSize: 9, color: REPORT_COLORS.textSecondary },
                ],
                fillColor: '#fef2f2',
                margin: [12, 10, 12, 10],
              },
            ],
            [
              {
                stack: [
                  { text: stats.pendingCount.toString(), fontSize: 24, bold: true, color: REPORT_COLORS.warning },
                  { text: 'Pending Review', fontSize: 9, color: REPORT_COLORS.textSecondary },
                ],
                fillColor: '#fffbeb',
                margin: [12, 10, 12, 10],
              },
              {
                stack: [
                  { text: stats.totalPhotos.toString(), fontSize: 24, bold: true, color: REPORT_COLORS.accent },
                  { text: 'Photos Captured', fontSize: 9, color: REPORT_COLORS.textSecondary },
                ],
                fillColor: '#eff6ff',
                margin: [12, 10, 12, 10],
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => REPORT_COLORS.border,
          vLineColor: () => REPORT_COLORS.border,
        },
        width: '*',
      },
    ],
    margin: [0, 0, 0, 20],
  });

  // Section breakdown table
  if (stats.sectionStats.length > 0) {
    content.push({
      text: 'Section Breakdown',
      fontSize: 11,
      bold: true,
      color: REPORT_COLORS.textPrimary,
      margin: [0, 10, 0, 8],
    });

    const breakdownRows: Content[][] = [
      [
        { text: 'Section', bold: true, fontSize: 9, color: REPORT_COLORS.textSecondary },
        { text: 'Items', bold: true, fontSize: 9, color: REPORT_COLORS.textSecondary, alignment: 'center' },
        { text: 'Pass', bold: true, fontSize: 9, color: REPORT_COLORS.textSecondary, alignment: 'center' },
        { text: 'Fail', bold: true, fontSize: 9, color: REPORT_COLORS.textSecondary, alignment: 'center' },
        { text: 'Photos', bold: true, fontSize: 9, color: REPORT_COLORS.textSecondary, alignment: 'center' },
        { text: 'Score', bold: true, fontSize: 9, color: REPORT_COLORS.textSecondary, alignment: 'center' },
      ],
    ];

    stats.sectionStats.forEach(section => {
      const score = section.totalItems > 0 
        ? Math.round((section.passCount / section.totalItems) * 100) 
        : 0;
      const scoreColor = score >= 80 ? REPORT_COLORS.success 
        : score >= 60 ? REPORT_COLORS.warning 
        : REPORT_COLORS.error;

      breakdownRows.push([
        { text: section.title, fontSize: 9, color: REPORT_COLORS.textPrimary },
        { text: section.totalItems.toString(), fontSize: 9, alignment: 'center' },
        { text: section.passCount.toString(), fontSize: 9, color: REPORT_COLORS.success, alignment: 'center' },
        { text: section.failCount.toString(), fontSize: 9, color: section.failCount > 0 ? REPORT_COLORS.error : REPORT_COLORS.textMuted, alignment: 'center' },
        { text: section.photoCount.toString(), fontSize: 9, alignment: 'center' },
        { text: `${score}%`, fontSize: 9, bold: true, color: scoreColor, alignment: 'center' },
      ]);
    });

    content.push({
      table: {
        headerRows: 1,
        widths: ['*', 45, 40, 40, 45, 50],
        body: breakdownRows,
      },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.5 : 0.25,
        vLineWidth: () => 0,
        hLineColor: () => REPORT_COLORS.border,
        fillColor: (rowIndex: number) => rowIndex === 0 ? REPORT_COLORS.lightBg : null,
        paddingTop: () => 6,
        paddingBottom: () => 6,
        paddingLeft: () => 8,
        paddingRight: () => 8,
      },
      margin: [0, 0, 0, 20],
    });
  }

  return content;
}

// ============================================================================
// GENERAL INFO SECTION
// ============================================================================

function createGeneralInfoSection(
  inspection: InspectionReportData,
  siteName: string,
  clientName?: string
): Content[] {
  const content: Content[] = [];

  // Section header
  content.push({
    table: {
      widths: ['*'],
      body: [[{
        text: 'GENERAL INFORMATION',
        fontSize: 12,
        bold: true,
        color: '#FFFFFF',
        margin: [0, 8, 0, 8],
      }]],
    },
    layout: {
      fillColor: () => REPORT_COLORS.secondary,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 12,
    },
    margin: [0, 10, 0, 15],
  });

  // Info grid
  const infoRows: Content[][] = [];
  
  infoRows.push([
    { text: 'Site Name', fontSize: 10, color: REPORT_COLORS.textSecondary },
    { text: siteName, fontSize: 10, bold: true, color: REPORT_COLORS.textPrimary },
  ]);

  if (inspection.subsectionName) {
    infoRows.push([
      { text: 'Subsection', fontSize: 10, color: REPORT_COLORS.textSecondary },
      { text: inspection.subsectionName, fontSize: 10, color: REPORT_COLORS.textPrimary },
    ]);
  }

  if (clientName) {
    infoRows.push([
      { text: 'Client', fontSize: 10, color: REPORT_COLORS.textSecondary },
      { text: clientName, fontSize: 10, color: REPORT_COLORS.textPrimary },
    ]);
  }

  if (inspection.inspectionDate) {
    infoRows.push([
      { text: 'Inspection Date', fontSize: 10, color: REPORT_COLORS.textSecondary },
      { 
        text: new Date(inspection.inspectionDate).toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }), 
        fontSize: 10, 
        color: REPORT_COLORS.textPrimary 
      },
    ]);
  }

  if (inspection.inspectorName) {
    infoRows.push([
      { text: 'Inspector', fontSize: 10, color: REPORT_COLORS.textSecondary },
      { text: inspection.inspectorName, fontSize: 10, color: REPORT_COLORS.textPrimary },
    ]);
  }

  if (inspection.templateName) {
    infoRows.push([
      { text: 'Template', fontSize: 10, color: REPORT_COLORS.textSecondary },
      { text: inspection.templateName, fontSize: 10, color: REPORT_COLORS.textPrimary },
    ]);
  }

  // Add any custom general info fields
  if (inspection.generalInfo) {
    Object.entries(inspection.generalInfo)
      .filter(([key]) => !['inspectorName', 'date', 'inspectionDate'].includes(key))
      .forEach(([key, value]) => {
        if (value) {
          infoRows.push([
            { 
              text: key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()), 
              fontSize: 10, 
              color: REPORT_COLORS.textSecondary 
            },
            { text: String(value), fontSize: 10, color: REPORT_COLORS.textPrimary },
          ]);
        }
      });
  }

  content.push({
    table: {
      widths: [120, '*'],
      body: infoRows,
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 0.5 : 0.25,
      vLineWidth: (i: number) => (i === 0 || i === 2) ? 0.5 : 0,
      hLineColor: () => REPORT_COLORS.border,
      vLineColor: () => REPORT_COLORS.border,
      paddingTop: () => 8,
      paddingBottom: () => 8,
      paddingLeft: () => 10,
      paddingRight: () => 10,
      fillColor: (rowIndex: number) => rowIndex % 2 === 0 ? REPORT_COLORS.lightBg : null,
    },
    margin: [0, 0, 0, 20],
  });

  return content;
}

// ============================================================================
// SECTION WITH PHOTO GRID - KEEPS HEADERS WITH CONTENT
// ============================================================================

function createSectionWithPhotoGrid(
  section: InspectionSection,
  imageCache: Map<string, string>,
  sectionIndex: number
): Content[] {
  const content: Content[] = [];
  const items = section.items || [];

  // Build section header
  const sectionHeader = {
    table: {
      widths: ['auto', '*'],
      body: [[
        {
          text: `${sectionIndex + 1}`,
          fontSize: 14,
          bold: true,
          color: '#FFFFFF',
          alignment: 'center',
          margin: [8, 6, 8, 6],
        },
        {
          text: section.title.toUpperCase(),
          fontSize: 12,
          bold: true,
          color: '#FFFFFF',
          margin: [10, 8, 0, 8],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: (rowIndex: number, node: any, colIndex: number) => 
        colIndex === 0 ? REPORT_COLORS.primary : REPORT_COLORS.secondary,
    },
    margin: [0, 15, 0, 12],
  };

  // Handle empty sections - keep header with "no items" message
  if (items.length === 0) {
    content.push({
      unbreakable: true,
      stack: [
        sectionHeader,
        {
          text: 'No items recorded for this section',
          fontSize: 10,
          italics: true,
          color: REPORT_COLORS.textMuted,
          margin: [0, 10, 0, 20],
        },
      ],
    });
    return content;
  }

  // Build first item content to bind with header
  const firstItem = items[0];
  const firstItemContent = createInspectionItemContent(firstItem, 0, imageCache);

  // Create unbreakable block with header + first item (prevents orphaned headers)
  content.push({
    unbreakable: true,
    stack: [
      sectionHeader,
      firstItemContent,
    ],
  });

  // Process remaining items - each as its own unbreakable block
  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    const itemContent = createInspectionItemContent(item, i, imageCache);
    
    content.push({
      unbreakable: true,
      stack: [itemContent],
    });
  }

  return content;
}

/**
 * Creates content for a single inspection item with its photos
 * Returns a stack that can be wrapped in unbreakable
 */
function createInspectionItemContent(
  item: InspectionSection['items'][0],
  itemIndex: number,
  imageCache: Map<string, string>
): Content {
  const itemStack: Content[] = [];

  const statusText = typeof item.value === 'boolean'
    ? (item.value ? 'Pass' : 'Fail')
    : String(item.value || 'N/A');
  
  const statusColor = getStatusColor(statusText);
  const statusBg = isPassStatus(statusText) ? '#f0fdf4' 
    : isFailStatus(statusText) ? '#fef2f2' 
    : '#fffbeb';

  // Item header row with status badge
  itemStack.push({
    table: {
      widths: ['*', 80],
      body: [[
        {
          text: item.label,
          fontSize: 11,
          bold: true,
          color: REPORT_COLORS.textPrimary,
          margin: [0, 0, 0, 0],
        },
        {
          table: {
            widths: ['*'],
            body: [[{
              text: statusText.toUpperCase(),
              fontSize: 8,
              bold: true,
              color: statusColor,
              alignment: 'center',
              margin: [0, 3, 0, 3],
            }]],
          },
          layout: {
            fillColor: () => statusBg,
            hLineWidth: () => 0,
            vLineWidth: () => 0,
          },
        },
      ]],
    },
    layout: 'noBorders',
    margin: [0, itemIndex > 0 ? 12 : 0, 0, 4],
  });

  // Notes if present
  if (item.notes) {
    itemStack.push({
      text: item.notes,
      fontSize: 9,
      italics: true,
      color: REPORT_COLORS.textSecondary,
      margin: [0, 0, 0, 6],
    });
  }

  // Photos in grid layout (2 columns) - kept with item
  // Using larger size (250x200) with subtle border for professional look
  const photos = item.photos?.filter(Boolean) || [];
  if (photos.length > 0) {
    const photoRows: Content[][] = [];
    
    for (let i = 0; i < photos.length; i += 2) {
      const rowPhotos: Content[] = [];
      
      // First photo with border frame
      const photo1 = imageCache.get(photos[i]);
      if (photo1) {
        rowPhotos.push({
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                {
                  image: photo1,
                  fit: [250, 200],
                  alignment: 'center',
                },
                {
                  text: `Photo ${i + 1}`,
                  fontSize: 8,
                  color: REPORT_COLORS.textSecondary,
                  alignment: 'center',
                  margin: [0, 4, 0, 0],
                },
              ],
              margin: [5, 5, 5, 5],
            }]],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => REPORT_COLORS.border,
            vLineColor: () => REPORT_COLORS.border,
          },
        });
      } else {
        rowPhotos.push({ text: '' });
      }
      
      // Second photo (if exists)
      if (i + 1 < photos.length) {
        const photo2 = imageCache.get(photos[i + 1]);
        if (photo2) {
          rowPhotos.push({
            table: {
              widths: ['*'],
              body: [[{
                stack: [
                  {
                    image: photo2,
                    fit: [250, 200],
                    alignment: 'center',
                  },
                  {
                    text: `Photo ${i + 2}`,
                    fontSize: 8,
                    color: REPORT_COLORS.textSecondary,
                    alignment: 'center',
                    margin: [0, 4, 0, 0],
                  },
                ],
                margin: [5, 5, 5, 5],
              }]],
            },
            layout: {
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => REPORT_COLORS.border,
              vLineColor: () => REPORT_COLORS.border,
            },
          });
        } else {
          rowPhotos.push({ text: '' });
        }
      } else {
        rowPhotos.push({ text: '' }); // Empty cell for odd number of photos
      }
      
      photoRows.push(rowPhotos);
    }

    if (photoRows.length > 0) {
      itemStack.push({
        table: {
          widths: ['*', '*'],
          body: photoRows,
        },
        layout: 'noBorders',
        margin: [0, 8, 0, 12],
      });
    }
  }

  // Add bottom spacing
  itemStack.push({ text: '', margin: [0, 0, 0, 5] });

  return { stack: itemStack };
}

// ============================================================================
// SNAGS SECTION - KEEPS EACH SNAG CARD WITH ITS PHOTOS
// ============================================================================

function createSnagsSection(
  snags: InspectionSnag[],
  imageCache: Map<string, string>
): Content[] {
  if (!snags?.length) return [];

  const content: Content[] = [];

  // Section header
  const sectionHeader = {
    table: {
      widths: ['auto', '*'],
      body: [[
        {
          text: '⚠️',
          fontSize: 14,
          alignment: 'center',
          margin: [8, 6, 8, 6],
        },
        {
          text: 'OBSERVATIONS & SNAG LIST',
          fontSize: 12,
          bold: true,
          color: '#FFFFFF',
          margin: [10, 8, 0, 8],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: (rowIndex: number, node: any, colIndex: number) => 
        colIndex === 0 ? REPORT_COLORS.warning : REPORT_COLORS.secondary,
    },
    margin: [0, 20, 0, 15],
  };

  // Build first snag content to bind with header
  const firstSnagContent = createSnagCardContent(snags[0], 0, imageCache);

  // Create unbreakable block with header + first snag
  content.push({
    unbreakable: true,
    stack: [sectionHeader, firstSnagContent],
  });

  // Process remaining snags
  for (let i = 1; i < snags.length; i++) {
    const snagContent = createSnagCardContent(snags[i], i, imageCache);
    content.push({
      unbreakable: true,
      stack: [snagContent],
    });
  }

  return content;
}

/**
 * Creates content for a single snag card with its photos
 */
function createSnagCardContent(
  snag: InspectionSnag,
  idx: number,
  imageCache: Map<string, string>
): Content {
  const snagStack: Content[] = [];

  const riskColor = snag.riskLevel === 'critical' || snag.riskLevel === 'high' 
    ? REPORT_COLORS.error 
    : snag.riskLevel === 'medium' 
    ? REPORT_COLORS.warning 
    : REPORT_COLORS.textMuted;

  // Snag card
  snagStack.push({
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          // Header row
          {
            columns: [
              {
                text: `${idx + 1}. ${snag.title}`,
                fontSize: 11,
                bold: true,
                color: REPORT_COLORS.textPrimary,
                width: '*',
              },
              snag.riskLevel ? {
                table: {
                  widths: ['auto'],
                  body: [[{
                    text: snag.riskLevel.toUpperCase(),
                    fontSize: 7,
                    bold: true,
                    color: riskColor,
                    margin: [6, 2, 6, 2],
                  }]],
                },
                layout: {
                  fillColor: () => riskColor === REPORT_COLORS.error ? '#fef2f2' : '#fffbeb',
                  hLineWidth: () => 0,
                  vLineWidth: () => 0,
                },
                width: 'auto',
              } : { text: '', width: 0 },
            ],
            margin: [0, 0, 0, 5],
          },
          // Status
          {
            text: `Status: ${snag.status}`,
            fontSize: 9,
            color: getStatusColor(snag.status),
            margin: [0, 0, 0, 5],
          },
          // Description
          snag.description ? {
            text: snag.description,
            fontSize: 9,
            color: REPORT_COLORS.textSecondary,
            margin: [0, 0, 0, 8],
          } : { text: '' },
        ],
        margin: [10, 10, 10, 10],
      }]],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => REPORT_COLORS.border,
      vLineColor: () => REPORT_COLORS.border,
      fillColor: () => REPORT_COLORS.lightBg,
    },
    margin: [0, 0, 0, 10],
  });

  // Snag photos (2-column grid) - larger size with professional borders
  const photos = snag.photos?.filter(Boolean) || [];
  if (photos.length > 0) {
    const photoRows: Content[][] = [];
    for (let i = 0; i < photos.length; i += 2) {
      const row: Content[] = [];
      
      const photo1 = imageCache.get(photos[i]);
      if (photo1) {
        row.push({
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                { image: photo1, fit: [250, 190], alignment: 'center' },
                { text: `Evidence ${i + 1}`, fontSize: 8, color: REPORT_COLORS.textSecondary, alignment: 'center', margin: [0, 4, 0, 0] },
              ],
              margin: [5, 5, 5, 5],
            }]],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => REPORT_COLORS.border,
            vLineColor: () => REPORT_COLORS.border,
          },
        });
      } else {
        row.push({ text: '' });
      }
      
      if (i + 1 < photos.length) {
        const photo2 = imageCache.get(photos[i + 1]);
        if (photo2) {
          row.push({
            table: {
              widths: ['*'],
              body: [[{
                stack: [
                  { image: photo2, fit: [250, 190], alignment: 'center' },
                  { text: `Evidence ${i + 2}`, fontSize: 8, color: REPORT_COLORS.textSecondary, alignment: 'center', margin: [0, 4, 0, 0] },
                ],
                margin: [5, 5, 5, 5],
              }]],
            },
            layout: {
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => REPORT_COLORS.border,
              vLineColor: () => REPORT_COLORS.border,
            },
          });
        } else {
          row.push({ text: '' });
        }
      } else {
        row.push({ text: '' });
      }
      
      photoRows.push(row);
    }

    snagStack.push({
      table: { widths: ['*', '*'], body: photoRows },
      layout: 'noBorders',
      margin: [0, 5, 0, 15],
    });
  }

  return { stack: snagStack };
}

// ============================================================================
// TENANT SECTION - KEEPS EACH TENANT WITH ITS PHOTOS
// ============================================================================

function createTenantSection(
  tenants: InspectionTenant[],
  imageCache: Map<string, string>
): Content[] {
  if (!tenants?.length) return [];

  const content: Content[] = [];

  // Section header
  const sectionHeader = {
    table: {
      widths: ['*'],
      body: [[{
        text: 'TENANT / METER VERIFICATION',
        fontSize: 12,
        bold: true,
        color: '#FFFFFF',
        margin: [12, 8, 0, 8],
      }]],
    },
    layout: {
      fillColor: () => REPORT_COLORS.secondary,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
    },
    margin: [0, 20, 0, 15],
  };

  // Build first tenant content to bind with header
  const firstTenantContent = createTenantCardContent(tenants[0], 0, imageCache);

  // Create unbreakable block with header + first tenant
  content.push({
    unbreakable: true,
    stack: [sectionHeader, firstTenantContent],
  });

  // Process remaining tenants
  for (let i = 1; i < tenants.length; i++) {
    const tenantContent = createTenantCardContent(tenants[i], i, imageCache);
    content.push({
      unbreakable: true,
      stack: [tenantContent],
    });
  }

  return content;
}

/**
 * Creates content for a single tenant card with their meter photos
 */
function createTenantCardContent(
  tenant: InspectionTenant,
  idx: number,
  imageCache: Map<string, string>
): Content {
  const tenantStack: Content[] = [];

  // Tenant header
  tenantStack.push({
    text: `${idx + 1}. ${tenant.shopName}${tenant.shopNumber ? ` (${tenant.shopNumber})` : ''}`,
    fontSize: 12,
    bold: true,
    color: REPORT_COLORS.primary,
    margin: [0, idx > 0 ? 15 : 0, 0, 8],
  });

  // Info grid
  const infoItems: Content[] = [];
  if (tenant.meterSerialNumber) {
    infoItems.push({ text: `Meter S/N: ${tenant.meterSerialNumber}`, fontSize: 9 });
  }
  if (tenant.breakerSize) {
    infoItems.push({ text: `Breaker: ${tenant.breakerSize}`, fontSize: 9 });
  }
  if (tenant.ctSizeAndRatio) {
    infoItems.push({ text: `CT Ratio: ${tenant.ctSizeAndRatio}`, fontSize: 9 });
  }

  if (infoItems.length > 0) {
    tenantStack.push({
      columns: infoItems.map(item => ({ ...item, width: '*' })),
      margin: [0, 0, 0, 10],
    });
  }

  // Photos in 3-column grid - larger with professional borders
  const photoData: Array<{ url: string; label: string }> = [];
  if (tenant.breakerImage) photoData.push({ url: tenant.breakerImage, label: 'Breaker' });
  if (tenant.ctRatioImage) photoData.push({ url: tenant.ctRatioImage, label: 'CT Ratio' });
  if (tenant.meterImage) photoData.push({ url: tenant.meterImage, label: 'Meter' });

  if (photoData.length > 0) {
    const photoColumns = photoData.map(photo => {
      const dataUrl = imageCache.get(photo.url);
      return dataUrl ? {
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              { image: dataUrl, fit: [160, 150], alignment: 'center' as const },
              { 
                text: photo.label, 
                fontSize: 9, 
                bold: true, 
                color: REPORT_COLORS.textPrimary,
                alignment: 'center' as const, 
                margin: [0, 5, 0, 0] 
              },
            ],
            margin: [4, 4, 4, 4],
          }]],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => REPORT_COLORS.border,
          vLineColor: () => REPORT_COLORS.border,
          fillColor: () => REPORT_COLORS.lightBg,
        },
        width: '*',
      } : { text: '', width: '*' };
    });

    tenantStack.push({
      columns: photoColumns,
      columnGap: 8,
      margin: [0, 5, 0, 15],
    });
  }

  return { stack: tenantStack };
}

// ============================================================================
// SIGNATURES SECTION - KEEPS HEADER WITH SIGNATURES
// ============================================================================

function createSignaturesSection(
  signatures: InspectionSignature[],
  imageCache: Map<string, string>
): Content[] {
  if (!signatures?.length) return [];

  const content: Content[] = [];

  // Section header
  const sectionHeader = {
    table: {
      widths: ['*'],
      body: [[{
        text: 'SIGN-OFF & APPROVALS',
        fontSize: 12,
        bold: true,
        color: '#FFFFFF',
        margin: [12, 8, 0, 8],
      }]],
    },
    layout: {
      fillColor: () => REPORT_COLORS.primary,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
    },
    margin: [0, 20, 0, 15],
  };

  const sigColumns: Content[] = signatures.map(sig => {
    const sigContent: Content[] = [
      { text: sig.name, fontSize: 11, bold: true },
      { text: sig.role || 'Signatory', fontSize: 9, color: REPORT_COLORS.textSecondary },
    ];

    // Signature image
    if (sig.signatureUrl) {
      const dataUrl = sig.signatureUrl.startsWith('data:') 
        ? sig.signatureUrl 
        : imageCache.get(sig.signatureUrl);
      
      if (dataUrl) {
        sigContent.push({
          image: dataUrl,
          width: 120,
          height: 50,
          margin: [0, 8, 0, 0],
        });
      }
    }

    if (sig.signedAt) {
      sigContent.push({
        text: `Signed: ${new Date(sig.signedAt).toLocaleDateString('en-GB')}`,
        fontSize: 8,
        color: REPORT_COLORS.textMuted,
        margin: [0, 5, 0, 0],
      });
    }

    return {
      stack: sigContent,
      width: '*',
      margin: [0, 0, 20, 0],
    };
  });

  // Keep header and all signatures together
  content.push({
    unbreakable: true,
    stack: [
      sectionHeader,
      {
        columns: sigColumns,
        margin: [0, 10, 0, 20],
      },
    ],
  });

  return content;
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

export async function generateInspectionReportPdf(
  options: GenerateInspectionReportOptions
): Promise<GenerateInspectionReportResult> {
  const { inspection, siteName, clientName, siteLogoUrl, accentColor = 'blue' } = options;

  try {
    console.log('[pdfmake] Starting professional inspection report generation');

    // Collect and load all images
    const imageUrls = collectImageUrls(inspection);
    console.log(`[pdfmake] Loading ${imageUrls.length} images...`);
    
    const imageCache = await loadImagesAsDataUrls(imageUrls);
    console.log(`[pdfmake] Loaded ${imageCache.size} images successfully`);

    // Load logo
    let logoDataUrl: string | null = null;
    if (siteLogoUrl) {
      logoDataUrl = await loadImageAsDataUrl(siteLogoUrl);
    }

    // Calculate statistics
    const stats = calculateStats(inspection);

    // Build document content
    const content: Content[] = [];

    // 1. Cover Page (TOC removed - cover page now contains all summary info)
    content.push(...createEngineeringCoverPage(inspection, siteName, clientName, logoDataUrl, accentColor));

    // 2. Quality Score Dashboard (now page 2, directly after cover)
    content.push(...createQualityDashboard(stats, inspection.qualityRating));

    // 3. General Information
    content.push(...createGeneralInfoSection(inspection, siteName, clientName));

    // 4. Inspection Sections with Photo Grids
    inspection.sections?.forEach((section, idx) => {
      content.push(...createSectionWithPhotoGrid(section, imageCache, idx));
    });

    // 5. Snags Section
    if (inspection.snags?.length) {
      content.push(...createSnagsSection(inspection.snags, imageCache));
    }

    // 6. Tenant Verification
    if (inspection.tenants?.length) {
      content.push(...createTenantSection(inspection.tenants, imageCache));
    }

    // 7. Signatures
    if (inspection.signatures?.length) {
      content.push(...createSignaturesSection(inspection.signatures, imageCache));
    }

    // Generate PDF
    const result = await generateReport({
      type: 'inspection',
      title: inspection.templateName || 'Inspection Report',
      content,
      options: {
        includeCoverPage: false, // We're using our custom cover page
        logoDataUrl,
        filename: `${siteName}_${inspection.subsectionName || 'Inspection'}_Report.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_'),
      },
    });

    console.log('[pdfmake] Professional report generated successfully');

    return {
      success: true,
      blob: result.blob,
      previewUrl: result.previewUrl,
      filename: result.filename,
    };
  } catch (error) {
    console.error('[pdfmake] Error generating inspection report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate report',
    };
  }
}

// ============================================================================
// SAVE TO STORAGE
// ============================================================================

export async function generateAndSaveInspectionReportPdfmake(
  options: GenerateInspectionReportOptions & { 
    subsectionId: string;
    siteId?: string;
  }
): Promise<{
  success: boolean;
  documentId?: string;
  fileName?: string;
  fileUrl?: string;
  error?: string;
}> {
  const { subsectionId } = options;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Generate PDF
    const result = await generateInspectionReportPdf(options);
    if (!result.success || !result.blob) {
      return { success: false, error: result.error || 'Failed to generate PDF' };
    }

    // Upload to storage
    const fileName = result.filename || 'Inspection_Report.pdf';
    const storagePath = `inspection-reports/${subsectionId}/${Date.now()}_${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, result.blob, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { success: false, error: 'Failed to upload PDF to storage' };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);

    const fileUrl = urlData.publicUrl;

    // Find or create category
    const { data: categories } = await supabase
      .from('document_categories')
      .select('id, name')
      .eq('subsection_id', subsectionId);

    let categoryId = categories?.find(c => c.name === 'Inspection Reports')?.id;

    if (!categoryId) {
      const { data: newCategory } = await supabase
        .from('document_categories')
        .insert({
          name: 'Inspection Reports',
          subsection_id: subsectionId,
          order_index: (categories?.length || 0) + 1,
        })
        .select()
        .single();

      if (newCategory) {
        categoryId = newCategory.id;
      }
    }

    // Create document record
    const { data: docData, error: docError } = await supabase
      .from('subsection_documents')
      .insert({
        subsection_id: subsectionId,
        category_id: categoryId,
        file_name: fileName,
        file_url: fileUrl,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (docError) {
      console.warn('Could not create document record:', docError);
    }

    return {
      success: true,
      documentId: docData?.id,
      fileName,
      fileUrl,
    };
  } catch (error) {
    console.error('Error saving inspection report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save report',
    };
  }
}
