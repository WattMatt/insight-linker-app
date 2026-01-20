import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import QRCode from 'https://esm.sh/qrcode@1.5.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate QR code as SVG data URI (works in Deno without canvas)
async function generateQRCodeSvgDataUri(url: string): Promise<string> {
  try {
    const svg = await QRCode.toString(url, {
      type: 'svg',
      width: 120,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    // Convert SVG to data URI
    const base64Svg = btoa(svg);
    return `data:image/svg+xml;base64,${base64Svg}`;
  } catch (error) {
    console.error('QR generation error:', error);
    return '';
  }
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ReportData {
  reportType: 'site-summary' | 'compliance' | 'inspection' | 'floor-plan';
  siteId: string;
  siteName: string;
  siteAddress?: string;
  clientName?: string;
  clientLogoUrl?: string;
  companyLogoUrl?: string;
  accentColor?: string;
  qrBaseUrl?: string;
  subsections?: SubsectionData[];
  summaryStats?: SummaryStats;
  healthMetrics?: HealthMetrics;
  categoryHealth?: CategoryHealthData[];
  documentsSummary?: DocumentCategoryData[];
  assetVerification?: AssetVerificationData;
  fortressChecklist?: FortressChecklistData;
  generatedAt?: string;
}

interface SubsectionData {
  id: string;
  name: string;
  tenantName?: string;
  category?: string;
  cocStatus?: string;
  cocNumber?: string;
  cocType?: string;
  cocIssueDate?: string;
  meterSerialNumber?: string;
  ctRatio?: string;
  breakerSize?: string;
  isCompliant?: boolean;
  qrCodeUrl?: string;
  snags?: SnagData[];
}

interface SnagData {
  id: string;
  title: string;
  status: string;
  riskLevel?: string;
  description?: string;
}

interface SummaryStats {
  totalSubsections: number;
  compliantCount: number;
  nonCompliantCount: number;
  pendingCount: number;
  cocValidCount: number;
  cocExpiredCount: number;
  cocMissingCount: number;
  cocRequired: number;
  meteringInstalled: number;
  openSnagsCount: number;
  resolvedSnagsCount: number;
}

interface HealthMetrics {
  overallHealth: number;
  cocCompliance: number;
  meteringData: number;
  snagFree: number;
}

interface CategoryHealthData {
  category: string;
  abbreviation: string;
  percentage: number;
}

interface DocumentCategoryData {
  category: string;
  count: number;
}

interface AssetVerificationData {
  totalAssets: number;
  verified: number;
  discrepancies: number;
  pending: number;
  schedule?: AssetScheduleRow[];
}

interface AssetScheduleRow {
  premisesId: string;
  meterSerial: string;
  breakerSize: string;
  ctRatio: string;
  inspectedSerial: string;
  inspectedBreaker: string;
  status: 'verified' | 'discrepancy' | 'pending';
}

interface FortressChecklistData {
  completed: number;
  pending: number;
  notApplicable: number;
  sections?: { name: string; progress: number }[];
}

// ============================================================================
// COLOR CONSTANTS
// ============================================================================

const COLORS = {
  primary: '#1e3a5f',
  accent: '#2563eb',
  success: '#16a34a',
  warning: '#ea580c',
  error: '#dc2626',
  info: '#2563eb',
  muted: '#6b7280',
  white: '#ffffff',
  lightGray: '#f3f4f6',
  border: '#e5e7eb',
  text: '#1f2937',
  textMuted: '#6b7280',
};

// ============================================================================
// HTML TEMPLATE GENERATORS - TABLE BASED LAYOUT FOR PDF RELIABILITY
// ============================================================================

function generateCoverPage(data: ReportData, accentColor: string): string {
  const {
    siteName,
    siteAddress,
    clientName,
    clientLogoUrl,
    companyLogoUrl,
    generatedAt = new Date().toLocaleDateString('en-ZA'),
  } = data;

  return `
    <div style="width: 210mm; height: 297mm; position: relative; background: white; page-break-after: always;">
      <!-- Top accent bar -->
      <div style="height: 8px; width: 100%; background: ${accentColor};"></div>
      
      <!-- Header with logos -->
      <table style="width: 100%; padding: 40px 40px 0 40px;">
        <tr>
          <td style="width: 50%; vertical-align: top;">
            ${clientLogoUrl ? `<img src="${clientLogoUrl}" style="max-height: 60px; max-width: 150px;" />` : ''}
          </td>
          <td style="width: 50%; text-align: right; vertical-align: top;">
            ${companyLogoUrl ? `<img src="${companyLogoUrl}" style="max-height: 60px; max-width: 150px;" />` : ''}
          </td>
        </tr>
      </table>
      
      <!-- Main content centered -->
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; width: 80%;">
        <h1 style="font-size: 32pt; font-weight: 700; color: ${COLORS.primary}; margin: 0 0 10px 0;">Site Summary Report</h1>
        <p style="font-size: 14pt; color: ${COLORS.textMuted}; margin: 0 0 50px 0;">Comprehensive Site Health & Compliance Overview</p>
        
        <!-- Site info box -->
        <div style="border: 3px solid ${accentColor}; border-radius: 12px; padding: 40px 60px; background: ${COLORS.lightGray}; display: inline-block;">
          <h2 style="font-size: 26pt; font-weight: 700; color: ${COLORS.primary}; margin: 0 0 10px 0;">${siteName}</h2>
          ${clientName ? `<p style="font-size: 14pt; color: ${COLORS.textMuted}; margin: 0 0 8px 0;">${clientName}</p>` : ''}
          ${siteAddress ? `<p style="font-size: 12pt; color: ${COLORS.textMuted}; margin: 0 0 12px 0;">${siteAddress}</p>` : ''}
          <p style="font-size: 14pt; font-weight: 600; color: ${accentColor}; margin: 0;">${generatedAt}</p>
        </div>
      </div>
      
      <!-- Footer -->
      <div style="position: absolute; bottom: 30px; left: 0; right: 0; text-align: center;">
        <p style="font-size: 9pt; color: ${COLORS.textMuted}; margin: 0 0 5px 0;">CONFIDENTIAL - For authorized use only</p>
        <p style="font-size: 9pt; color: ${COLORS.textMuted}; margin: 0;">Watson Mattheus Consulting Electrical Engineers (Pty) Ltd</p>
      </div>
    </div>
  `;
}

function generatePageHeader(title: string, accentColor: string): string {
  return `
    <table style="width: 100%; border-bottom: 3px solid ${accentColor}; margin-bottom: 20px;">
      <tr>
        <td style="font-size: 14pt; font-weight: 700; color: ${COLORS.primary}; padding-bottom: 10px;">${title}</td>
      </tr>
    </table>
  `;
}

function generatePageFooter(pageNum: number, totalPages: string, generatedAt: string): string {
  return `
    <table style="width: calc(100% - 36mm); position: absolute; bottom: 10mm; left: 18mm; right: 18mm; border-top: 1px solid ${COLORS.border}; padding-top: 6px; font-size: 8pt; color: ${COLORS.textMuted};">
      <tr>
        <td style="width: 33%;">CONFIDENTIAL - For authorized use only</td>
        <td style="width: 33%; text-align: center;">Page ${pageNum} of ${totalPages}</td>
        <td style="width: 33%; text-align: right;">${generatedAt}</td>
      </tr>
    </table>
  `;
}

function generateSectionHeader(title: string, accentColor: string): string {
  return `
    <div style="background: ${accentColor}; color: white; padding: 10px 15px; border-radius: 6px; margin: 0 0 15px 0; display: inline-block;">
      <span style="font-size: 13pt; font-weight: 600;">${title}</span>
    </div>
  `;
}

function generateHealthMetrics(metrics: HealthMetrics, accentColor: string): string {
  const getColor = (value: number) => value >= 70 ? COLORS.success : value >= 40 ? COLORS.warning : COLORS.error;
  
  return `
    ${generateSectionHeader('Health Metrics', accentColor)}
    <table style="width: 100%; border-collapse: separate; border-spacing: 12px;">
      <tr>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 28pt; font-weight: 700; color: ${getColor(metrics.overallHealth)};">${metrics.overallHealth}%</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 8px;">Overall Health</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 28pt; font-weight: 700; color: ${getColor(metrics.cocCompliance)};">${metrics.cocCompliance}%</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 8px;">COC Compliance</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 28pt; font-weight: 700; color: ${getColor(metrics.meteringData)};">${metrics.meteringData}%</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 8px;">Metering Data</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 28pt; font-weight: 700; color: ${getColor(Math.max(0, metrics.snagFree))};">${Math.max(0, metrics.snagFree)}%</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 8px;">Snag Free</div>
        </td>
      </tr>
    </table>
  `;
}

function generateCategoryHealth(categories: CategoryHealthData[], accentColor: string): string {
  if (!categories || categories.length === 0) return '';

  const categoryCards = categories.map(cat => `
    <td style="background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 15px; text-align: center;">
      <div style="font-size: 20pt; font-weight: 700; color: ${cat.percentage >= 50 ? COLORS.success : COLORS.error};">${cat.percentage}%</div>
      <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 6px;">${cat.abbreviation}</div>
    </td>
  `).join('');

  return `
    ${generateSectionHeader('Health by Category', accentColor)}
    <table style="width: 100%; border-collapse: separate; border-spacing: 10px;">
      <tr>${categoryCards}</tr>
    </table>
  `;
}

function generateSummaryStatistics(stats: SummaryStats, accentColor: string): string {
  const overallHealth = Math.round((stats.compliantCount / Math.max(stats.totalSubsections, 1)) * 100);
  
  const rows = [
    { label: 'Total Subsections', value: stats.totalSubsections.toString() },
    { label: 'COC Required', value: (stats.cocRequired || stats.totalSubsections).toString() },
    { label: 'COC Compliant', value: stats.cocValidCount.toString() },
    { label: 'Metering Installed', value: (stats.meteringInstalled || stats.totalSubsections).toString() },
    { label: 'Open Snags', value: stats.openSnagsCount.toString() },
    { label: 'Overall Health Rate', value: `${overallHealth}%` },
  ];

  return `
    ${generateSectionHeader('Summary Statistics', accentColor)}
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      ${rows.map((row, i) => `
        <tr style="background: ${i % 2 === 0 ? COLORS.lightGray : 'white'};">
          <td style="padding: 14px 20px; border-bottom: 1px solid ${COLORS.border}; font-size: 11pt; color: ${COLORS.textMuted};">${row.label}</td>
          <td style="padding: 14px 20px; border-bottom: 1px solid ${COLORS.border}; text-align: right; font-size: 11pt; font-weight: 600; color: ${COLORS.primary};">${row.value}</td>
        </tr>
      `).join('')}
    </table>
  `;
}

function generateDocumentsSummary(docs: DocumentCategoryData[], accentColor: string): string {
  if (!docs || docs.length === 0) return '';

  const totalDocs = docs.reduce((sum, d) => sum + d.count, 0);

  // Sort documents by category name (handles numeric prefixes like "01 COC", "02 Metering")
  const sortedDocs = [...docs].sort((a, b) => {
    // Extract numeric prefix if exists
    const numA = parseInt(a.category.match(/^(\d+)/)?.[1] || '999');
    const numB = parseInt(b.category.match(/^(\d+)/)?.[1] || '999');
    if (numA !== numB) return numA - numB;
    // Fallback to alphabetical
    return a.category.localeCompare(b.category);
  });

  return `
    ${generateSectionHeader('Documents Summary', accentColor)}
    <table style="width: 100%; border-collapse: separate; border-spacing: 10px; margin-bottom: 15px;">
      <tr>
        <td style="width: 50%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 24pt; font-weight: 700; color: ${COLORS.info};">${totalDocs}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 6px;">Total Documents</div>
        </td>
        <td style="width: 50%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 24pt; font-weight: 700; color: ${COLORS.muted};">${sortedDocs.length}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 6px;">Categories</div>
        </td>
      </tr>
    </table>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: ${COLORS.primary};">
          <th style="padding: 12px 15px; text-align: left; color: white; font-size: 10pt;">Category</th>
          <th style="padding: 12px 15px; text-align: right; color: white; font-size: 10pt;">Files</th>
        </tr>
      </thead>
      <tbody>
        ${sortedDocs.map((doc, i) => `
          <tr style="background: ${i % 2 === 0 ? 'white' : COLORS.lightGray};">
            <td style="padding: 10px 15px; border-bottom: 1px solid ${COLORS.border}; font-size: 10pt;">${doc.category}</td>
            <td style="padding: 10px 15px; border-bottom: 1px solid ${COLORS.border}; text-align: right; font-size: 10pt; font-weight: 600;">${doc.count}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function generateAssetVerification(data: AssetVerificationData, accentColor: string): string {
  const getStatusStyle = (status: string) => {
    if (status === 'verified') return { color: COLORS.success, text: '✓ Verified' };
    if (status === 'discrepancy') return { color: COLORS.error, text: '✗ Discrepancy' };
    return { color: COLORS.muted, text: '○ Pending' };
  };

  return `
    ${generateSectionHeader('Asset Verification Schedule', accentColor)}
    <table style="width: 100%; border-collapse: separate; border-spacing: 10px; margin-bottom: 15px;">
      <tr>
        <td style="width: 33%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${COLORS.success};">${data.verified}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">Verified</div>
        </td>
        <td style="width: 33%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${COLORS.error};">${data.discrepancies}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">Discrepancies</div>
        </td>
        <td style="width: 33%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${COLORS.muted};">${data.pending}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">Pending</div>
        </td>
      </tr>
    </table>
    ${data.schedule && data.schedule.length > 0 ? `
      <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
        <thead>
          <tr style="background: ${COLORS.primary};">
            <th style="padding: 10px 10px; text-align: left; color: white; width: 24%;">Premises</th>
            <th style="padding: 10px 10px; text-align: left; color: white; width: 13%;">Meter S/N</th>
            <th style="padding: 10px 10px; text-align: left; color: white; width: 11%;">Breaker</th>
            <th style="padding: 10px 10px; text-align: left; color: white; width: 11%;">CT Ratio</th>
            <th style="padding: 10px 10px; text-align: left; color: white; width: 13%;">Inspected S/N</th>
            <th style="padding: 10px 10px; text-align: left; color: white; width: 11%;">Insp. Breaker</th>
            <th style="padding: 10px 10px; text-align: center; color: white; width: 17%;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.schedule.map(row => {
            const style = getStatusStyle(row.status);
            return `
              <tr style="background: white; border-bottom: 0.5pt solid ${COLORS.border};">
                <td style="padding: 8px 10px;">${row.premisesId || '-'}</td>
                <td style="padding: 8px 10px;">${row.meterSerial || '-'}</td>
                <td style="padding: 8px 10px;">${row.breakerSize || '-'}</td>
                <td style="padding: 8px 10px;">${row.ctRatio || '-'}</td>
                <td style="padding: 8px 10px;">${row.inspectedSerial || '-'}</td>
                <td style="padding: 8px 10px;">${row.inspectedBreaker || '-'}</td>
                <td style="padding: 8px 10px; text-align: center; color: ${style.color}; font-weight: 600;">${style.text}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : ''}
  `;
}

function generateFortressChecklist(data: FortressChecklistData, accentColor: string): string {
  const total = data.completed + data.pending + data.notApplicable;
  const progressPercent = total > 0 ? Math.round((data.completed / (data.completed + data.pending)) * 100) : 0;

  return `
    ${generateSectionHeader('Fortress Checklist', accentColor)}
    <table style="width: 100%; border-collapse: separate; border-spacing: 10px; margin-bottom: 15px;">
      <tr>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${COLORS.success};">${data.completed}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">Completed</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${COLORS.warning};">${data.pending}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">Pending</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${COLORS.muted};">${data.notApplicable}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">N/A</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${accentColor};">${progressPercent}%</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">Progress</div>
        </td>
      </tr>
    </table>
    ${data.sections && data.sections.length > 0 ? `
      <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
        <thead>
          <tr style="background: ${COLORS.primary};">
            <th style="padding: 10px 15px; text-align: left; color: white;">Section</th>
            <th style="padding: 10px 15px; text-align: right; color: white; width: 100px;">Progress</th>
          </tr>
        </thead>
        <tbody>
          ${data.sections.map(section => `
            <tr style="background: white; border-bottom: 0.5pt solid ${COLORS.border};">
              <td style="padding: 8px 15px;">${section.name}</td>
              <td style="padding: 8px 15px; text-align: right;">
                <span style="display: inline-block; width: 60px; height: 8px; background: ${COLORS.lightGray}; border-radius: 4px; margin-right: 8px; vertical-align: middle;">
                  <span style="display: block; width: ${section.progress}%; height: 100%; background: ${section.progress >= 100 ? COLORS.success : section.progress >= 50 ? COLORS.info : COLORS.warning}; border-radius: 4px;"></span>
                </span>
                <span style="font-weight: 600;">${section.progress}%</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}
  `;
}

function getCocStatusStyle(status: string | undefined): { bg: string; color: string; text: string } {
  if (!status) return { bg: '#fef3c7', color: '#92400e', text: 'Missing' };
  const s = status.toLowerCase();
  if (s.includes('approved') || s.includes('valid') || s.includes('pass')) {
    return { bg: '#d1fae5', color: '#065f46', text: 'Valid' };
  }
  if (s.includes('failed') || s.includes('invalid') || s.includes('expired')) {
    return { bg: '#fee2e2', color: '#991b1b', text: 'Invalid' };
  }
  return { bg: '#fef3c7', color: '#92400e', text: status };
}

function getRiskBadgeStyle(level: string | undefined): { bg: string; color: string } {
  if (!level) return { bg: '#fef3c7', color: '#92400e' };
  const l = level.toLowerCase();
  if (l === 'high' || l === 'critical') return { bg: '#fee2e2', color: '#991b1b' };
  if (l === 'low') return { bg: '#d1fae5', color: '#065f46' };
  return { bg: '#fef3c7', color: '#92400e' };
}

async function generateSubsectionCard(sub: SubsectionData, accentColor: string, qrBaseUrl: string): Promise<string> {
  const cocStyle = getCocStatusStyle(sub.cocStatus);
  const complianceColor = sub.isCompliant === true ? '#d1fae5' : sub.isCompliant === false ? '#fee2e2' : '#fef3c7';
  const complianceTextColor = sub.isCompliant === true ? '#065f46' : sub.isCompliant === false ? '#991b1b' : '#92400e';
  const complianceText = sub.isCompliant === true ? 'Compliant' : sub.isCompliant === false ? 'Non-Compliant' : 'Pending';
  
  const openSnags = sub.snags?.filter(s => s.status !== 'resolved' && s.status !== 'Resolved') || [];
  
  // Generate QR code - use stored URL if image, otherwise generate SVG
  let qrCodeDataUri = '';
  if (sub.qrCodeUrl && (sub.qrCodeUrl.includes('storage') || sub.qrCodeUrl.includes('supabase'))) {
    // Use existing image URL from storage
    qrCodeDataUri = sub.qrCodeUrl;
  } else {
    // Generate QR code server-side as SVG
    const qrTargetUrl = `${qrBaseUrl}/public/subsections/${sub.id}`;
    qrCodeDataUri = await generateQRCodeSvgDataUri(qrTargetUrl);
  }
  
  const snagRows = openSnags.slice(0, 3).map(snag => {
    const riskStyle = getRiskBadgeStyle(snag.riskLevel);
    return `
      <tr>
        <td style="padding: 4px 0; vertical-align: top;">
          <span style="display: inline-block; background: ${riskStyle.bg}; color: ${riskStyle.color}; padding: 3px 8px; border-radius: 4px; font-size: 8pt; font-weight: 700; min-width: 55px; text-align: center;">${(snag.riskLevel || 'MEDIUM').toUpperCase()}</span>
        </td>
        <td style="padding: 4px 8px; font-size: 9pt; color: ${COLORS.text};">${snag.title}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="border: 1px solid ${COLORS.border}; border-radius: 8px; overflow: hidden; margin-bottom: 12px; page-break-inside: avoid; position: relative;">
      <!-- QR Code positioned top-right -->
      ${qrCodeDataUri ? `
        <div style="position: absolute; top: 8px; right: 8px; background: white; border-radius: 4px; padding: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); z-index: 10;">
          <img src="${qrCodeDataUri}" style="width: 55px; height: 55px; display: block;" />
        </div>
      ` : ''}
      
      <!-- Card Header - Compact -->
      <div style="background: ${accentColor}; color: white; padding: 8px 14px; padding-right: 75px;">
        <div style="font-size: 11pt; font-weight: 600; line-height: 1.3;">${sub.name}</div>
        ${sub.category ? `<span style="font-size: 8pt; opacity: 0.85;">${sub.category}</span>` : ''}
        ${sub.tenantName && sub.tenantName !== sub.name ? `<span style="font-size: 8pt; opacity: 0.75; margin-left: 8px;">${sub.tenantName}</span>` : ''}
      </div>
      
      <!-- Card Body -->
      <table style="width: 100%; padding: 10px 14px;">
        <tr>
          <td style="width: 90px; font-size: 9pt; color: ${COLORS.textMuted}; padding: 3px 0;">COC Status:</td>
          <td style="padding: 3px 0;">
            <span style="display: inline-block; background: ${cocStyle.bg}; color: ${cocStyle.color}; padding: 2px 10px; border-radius: 10px; font-size: 8pt; font-weight: 600;">${cocStyle.text}</span>
          </td>
        </tr>
        ${sub.cocNumber ? `
          <tr>
            <td style="font-size: 9pt; color: ${COLORS.textMuted}; padding: 3px 0;">COC #:</td>
            <td style="font-size: 9pt; color: ${COLORS.text}; padding: 3px 0;">${sub.cocNumber}</td>
          </tr>
        ` : ''}
        ${sub.breakerSize ? `
          <tr>
            <td style="font-size: 9pt; color: ${COLORS.textMuted}; padding: 3px 0;">Breaker Size:</td>
            <td style="font-size: 9pt; color: ${COLORS.text}; padding: 3px 0;">${sub.breakerSize}</td>
          </tr>
        ` : ''}
        <tr>
          <td style="font-size: 9pt; color: ${COLORS.textMuted}; padding: 3px 0;">Metering:</td>
          <td style="font-size: 9pt; color: ${COLORS.text}; padding: 3px 0;">
            ${sub.meterSerialNumber ? `S/N: ${sub.meterSerialNumber}` : 'N/A'}
            ${sub.ctRatio ? ` | CT: ${sub.ctRatio}` : ''}
          </td>
        </tr>
      </table>
      
      <!-- Snags Section -->
      <div style="border-top: 1px solid ${COLORS.border}; padding: 8px 14px;">
        <div style="font-size: 9pt; font-weight: 600; margin-bottom: 5px; color: ${COLORS.text};">Snags:</div>
        ${openSnags.length > 0 ? `
          <table style="width: 100%;">
            ${snagRows}
            ${openSnags.length > 3 ? `<tr><td colspan="2" style="font-size: 7pt; color: ${COLORS.textMuted}; padding-top: 3px;">+ ${openSnags.length - 3} more</td></tr>` : ''}
          </table>
        ` : `<span style="color: ${COLORS.success}; font-size: 9pt;">No open snags</span>`}
      </div>
      
      <!-- Card Footer -->
      <div style="background: ${complianceColor}; padding: 6px 14px;">
        <span style="font-size: 9pt; font-weight: 600; color: ${complianceTextColor};">${complianceText}</span>
      </div>
    </div>
  `;
}

async function generateSubsectionPages(subsections: SubsectionData[], accentColor: string, generatedAt: string, startPage: number, qrBaseUrl: string): Promise<string> {
  if (!subsections || subsections.length === 0) return '';
  
  const pages: string[] = [];
  const cardsPerPage = 2;
  const totalContentPages = Math.ceil(subsections.length / cardsPerPage);
  const totalPages = startPage + totalContentPages - 1;
  
  for (let i = 0; i < subsections.length; i += cardsPerPage) {
    const pageSubsections = subsections.slice(i, i + cardsPerPage);
    const currentPage = startPage + Math.floor(i / cardsPerPage);
    const isFirstPage = i === 0;
    
    // Generate cards for this page (await each since QR generation is async)
    const cardsHtml: string[] = [];
    for (const sub of pageSubsections) {
      const cardHtml = await generateSubsectionCard(sub, accentColor, qrBaseUrl);
      cardsHtml.push(cardHtml);
    }
    
    // Join cards with spacer to push second card to mid-page
    // A4 content area is ~267mm (297-15-15). Header+section header ~50mm. Each card ~100mm. Spacer fills gap.
    const cardsSpacer = cardsHtml.length === 2 
      ? `<div style="height: 15mm;"></div>` 
      : '';
    const cardsWithSpacing = cardsHtml.length === 2 
      ? cardsHtml[0] + cardsSpacer + cardsHtml[1]
      : cardsHtml.join('');
    
    pages.push(`
      <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
        ${generatePageHeader('Site Summary Report', accentColor)}
        
        <div style="text-align: left;">
          ${isFirstPage ? generateSectionHeader('Subsection Details', accentColor) : generateSectionHeader('Subsection Details (continued)', accentColor)}
        </div>
        
        ${cardsWithSpacing}
        
        ${generatePageFooter(currentPage, '{{TOTAL_PAGES}}', generatedAt)}
      </div>
    `);
  }
  
  return pages.join('');
}

function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, (num >> 8 & 0x00FF) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// ============================================================================
// MAIN HTML GENERATOR
// ============================================================================

async function generateSiteSummaryHTML(data: ReportData): Promise<string> {
  const accentColor = data.accentColor || '#2563eb';
  const generatedAt = data.generatedAt || new Date().toLocaleDateString('en-ZA');
  const qrBaseUrl = data.qrBaseUrl || 'https://watsonmattheus.com';
  
  // Calculate health metrics if not provided
  const healthMetrics = data.healthMetrics || calculateHealthMetrics(data);
  
  // Calculate total pages: 1 cover + 4 summary pages (health, docs, assets, fortress) + subsection pages
  const subsectionPages = Math.ceil((data.subsections?.length || 0) / 2);
  const hasAssetVerification = !!data.assetVerification;
  const hasFortressChecklist = !!data.fortressChecklist;
  const summaryPagesCount = 2 + (hasAssetVerification ? 1 : 0) + (hasFortressChecklist ? 1 : 0);
  const totalPages = 1 + summaryPagesCount + subsectionPages;
  
  // Calculate page numbers for subsection pages
  const subsectionStartPage = 1 + summaryPagesCount + 1;
  
  // Generate subsection pages (async for QR generation)
  const subsectionPagesHtml = await generateSubsectionPages(data.subsections || [], accentColor, generatedAt, subsectionStartPage, qrBaseUrl);
  
  // Track current page number for summary pages
  let currentPage = 1;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.siteName} - Site Summary Report</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      color: ${COLORS.text};
      line-height: 1.4;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    table {
      border-collapse: collapse;
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  ${generateCoverPage(data, accentColor)}
  
  <!-- Page ${currentPage}: Health Metrics & Category Health -->
  <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
    ${generatePageHeader('Site Summary Report', accentColor)}
    ${generateHealthMetrics(healthMetrics, accentColor)}
    ${data.categoryHealth ? generateCategoryHealth(data.categoryHealth, accentColor) : ''}
    ${generateSummaryStatistics(data.summaryStats || { totalSubsections: 0, compliantCount: 0, nonCompliantCount: 0, pendingCount: 0, cocValidCount: 0, cocExpiredCount: 0, cocMissingCount: 0, cocRequired: 0, meteringInstalled: 0, openSnagsCount: 0, resolvedSnagsCount: 0 }, accentColor)}
    ${generatePageFooter(currentPage++, '{{TOTAL_PAGES}}', generatedAt)}
  </div>
  
  <!-- Page ${currentPage}: Documents Summary -->
  <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
    ${generatePageHeader('Site Summary Report', accentColor)}
    ${data.documentsSummary ? generateDocumentsSummary(data.documentsSummary, accentColor) : '<div style="padding: 20px; color: ' + COLORS.textMuted + '; text-align: center;">No documents available</div>'}
    ${generatePageFooter(currentPage++, '{{TOTAL_PAGES}}', generatedAt)}
  </div>
  
  ${hasAssetVerification ? `
  <!-- Page ${currentPage}: Asset Verification -->
  <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
    ${generatePageHeader('Site Summary Report', accentColor)}
    ${generateAssetVerification(data.assetVerification!, accentColor)}
    ${generatePageFooter(currentPage++, '{{TOTAL_PAGES}}', generatedAt)}
  </div>
  ` : ''}
  
  ${hasFortressChecklist ? `
  <!-- Page ${currentPage}: Fortress Checklist -->
  <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
    ${generatePageHeader('Site Summary Report', accentColor)}
    ${generateFortressChecklist(data.fortressChecklist!, accentColor)}
    ${generatePageFooter(currentPage++, '{{TOTAL_PAGES}}', generatedAt)}
  </div>
  ` : ''}
  
  <!-- Subsection Pages -->
  ${subsectionPagesHtml}
</body>
</html>
  `;
  
  // Replace page number placeholders
  return html.replace(/\{\{TOTAL_PAGES\}\}/g, totalPages.toString());
}

function calculateHealthMetrics(data: ReportData): HealthMetrics {
  const subsections = data.subsections || [];
  const total = Math.max(subsections.length, 1);
  const stats = data.summaryStats;
  
  const compliant = stats?.compliantCount || subsections.filter(s => s.isCompliant === true).length;
  const cocValid = stats?.cocValidCount || subsections.filter(s => 
    s.cocStatus?.toLowerCase().includes('valid') || 
    s.cocStatus?.toLowerCase().includes('approved') ||
    s.cocStatus?.toLowerCase().includes('pass')
  ).length;
  const metered = subsections.filter(s => s.meterSerialNumber).length;
  const openSnags = stats?.openSnagsCount || subsections.reduce((acc, s) => 
    acc + (s.snags?.filter(sn => sn.status !== 'resolved' && sn.status !== 'Resolved').length || 0), 0);
  
  return {
    overallHealth: Math.round((compliant / total) * 100),
    cocCompliance: Math.round((cocValid / total) * 100),
    meteringData: Math.round((metered / total) * 100),
    snagFree: Math.round(((total - Math.min(openSnags, total)) / total) * 100),
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PDFSHIFT_API_KEY = Deno.env.get('PDFSHIFT_API_KEY');
    
    if (!PDFSHIFT_API_KEY) {
      console.error('PDFSHIFT_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'PDF generation service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json() as ReportData;
    console.log('Generating PDF for:', body.siteName, 'Type:', body.reportType, 'Subsections:', body.subsections?.length || 0);
    console.log('Asset Verification:', body.assetVerification ? `${body.assetVerification.totalAssets} assets, ${body.assetVerification.schedule?.length || 0} schedule rows` : 'NONE');
    console.log('Fortress Checklist:', body.fortressChecklist ? `${body.fortressChecklist.completed} completed, ${body.fortressChecklist.sections?.length || 0} sections` : 'NONE');
    console.log('Documents Summary:', body.documentsSummary?.length || 0, 'categories');
    console.log('Category Health:', body.categoryHealth?.length || 0, 'categories');

    // Generate HTML (async for QR code generation)
    let html: string;
    switch (body.reportType) {
      case 'site-summary':
        html = await generateSiteSummaryHTML(body);
        break;
      default:
        html = await generateSiteSummaryHTML(body);
    }

    console.log('HTML generated, calling PDFShift API...');

    // Call PDFShift API
    const pdfResponse = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`api:${PDFSHIFT_API_KEY}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: html,
        landscape: false,
        format: 'A4',
        margin: {
          top: '0mm',
          right: '0mm',
          bottom: '0mm',
          left: '0mm'
        },
        use_print: true,
      }),
    });

    if (!pdfResponse.ok) {
      const errorText = await pdfResponse.text();
      console.error('PDFShift API error:', pdfResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'PDF generation failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('PDF generated successfully, uploading to storage...');

    // Get PDF as buffer
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const uint8Array = new Uint8Array(pdfBuffer);
    
    // Create Supabase client for storage upload
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const sanitizedSiteName = body.siteName.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Site_Summary_Report_${sanitizedSiteName}_${timestamp}.pdf`;
    const storagePath = `site-reports/${body.siteId}/${filename}`;
    
    // Upload to Supabase Storage (documents bucket)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, uint8Array, {
        contentType: 'application/pdf',
        upsert: false,
      });
    
    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to save PDF to storage', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);
    
    console.log('PDF saved to storage:', urlData.publicUrl);

    // Create a record in site_documents table so it appears in the Reports list
    const { error: dbError } = await supabase
      .from('site_documents')
      .insert({
        site_id: body.siteId,
        file_name: filename,
        file_url: urlData.publicUrl,
        category: 'Site Summary Reports',
      });
    
    if (dbError) {
      console.error('Database insert error:', dbError);
      // Don't fail the request - the file is saved, just log the error
    } else {
      console.log('Report record created in site_documents');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        url: urlData.publicUrl,
        filename,
        storagePath,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error generating PDF:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
