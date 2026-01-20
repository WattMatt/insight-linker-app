import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
// HTML TEMPLATE GENERATORS
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
    <div class="cover-page">
      <!-- Top accent bar -->
      <div class="accent-bar" style="background: ${accentColor};"></div>
      
      <!-- Header with logos -->
      <div class="cover-header">
        <div class="logo-left">
          ${clientLogoUrl ? `<img src="${clientLogoUrl}" alt="Client Logo" class="cover-logo" />` : ''}
        </div>
        <div class="logo-right">
          ${companyLogoUrl ? `<img src="${companyLogoUrl}" alt="Company Logo" class="cover-logo" />` : ''}
        </div>
      </div>
      
      <!-- Main title section -->
      <div class="cover-content">
        <h1 class="cover-title">Site Summary Report</h1>
        <p class="cover-subtitle">Comprehensive Site Health & Compliance Overview</p>
        
        <!-- Site info box -->
        <div class="site-info-box" style="border-color: ${accentColor};">
          <h2 class="site-name">${siteName}</h2>
          ${clientName ? `<p class="client-name">${clientName}</p>` : ''}
          ${siteAddress ? `<p class="site-address">${siteAddress}</p>` : ''}
          <p class="report-date">${generatedAt}</p>
        </div>
      </div>
      
      <!-- Footer -->
      <div class="cover-footer">
        <p>CONFIDENTIAL - For authorized use only</p>
        <p>Watson Mattheus Consulting Electrical Engineers (Pty) Ltd</p>
      </div>
    </div>
  `;
}

function generatePageHeader(siteName: string, accentColor: string): string {
  return `
    <div class="page-header">
      <span class="header-title">Site Summary Report</span>
      <span class="header-site">${siteName}</span>
    </div>
  `;
}

function generatePageFooter(pageNum: number, totalPages: string, generatedAt: string): string {
  return `
    <div class="page-footer">
      <span class="footer-confidential">CONFIDENTIAL - For authorized use only</span>
      <span class="footer-page">Page ${pageNum} of ${totalPages}</span>
      <span class="footer-date">${generatedAt}</span>
    </div>
  `;
}

function generateSectionHeader(title: string, accentColor: string): string {
  return `
    <div class="section-header" style="background: ${accentColor};">
      <h2>${title}</h2>
    </div>
  `;
}

function generateHealthMetrics(metrics: HealthMetrics, accentColor: string): string {
  const cards = [
    { label: 'Overall Health', value: `${metrics.overallHealth}%`, color: COLORS.success },
    { label: 'COC Compliance', value: `${metrics.cocCompliance}%`, color: COLORS.warning },
    { label: 'Metering Data', value: `${metrics.meteringData}%`, color: COLORS.info },
    { label: 'Snag Free', value: `${Math.max(0, metrics.snagFree)}%`, color: COLORS.error },
  ];

  return `
    ${generateSectionHeader('Health Metrics', accentColor)}
    <div class="kpi-grid">
      ${cards.map(card => `
        <div class="kpi-card">
          <div class="kpi-value" style="color: ${card.color};">${card.value}</div>
          <div class="kpi-label">${card.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function generateCategoryHealth(categories: CategoryHealthData[], accentColor: string): string {
  if (!categories || categories.length === 0) return '';

  return `
    ${generateSectionHeader('Health by Category', accentColor)}
    <div class="kpi-grid category-grid">
      ${categories.map(cat => `
        <div class="kpi-card">
          <div class="kpi-value" style="color: ${cat.percentage >= 50 ? COLORS.success : COLORS.error};">${cat.percentage}%</div>
          <div class="kpi-label">${cat.abbreviation}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function generateDocumentsSummary(docs: DocumentCategoryData[], accentColor: string): string {
  if (!docs || docs.length === 0) return '';

  const totalDocs = docs.reduce((sum, d) => sum + d.count, 0);
  const totalCategories = docs.length;

  return `
    ${generateSectionHeader('Documents Summary', accentColor)}
    <div class="kpi-grid docs-kpi">
      <div class="kpi-card">
        <div class="kpi-value" style="color: ${COLORS.info};">${totalDocs}</div>
        <div class="kpi-label">Total Documents</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value" style="color: ${COLORS.muted};">${totalCategories}</div>
        <div class="kpi-label">Categories</div>
      </div>
    </div>
    <table class="data-table">
      <thead>
        <tr>
          <th>Category</th>
          <th style="text-align: right;">Files</th>
        </tr>
      </thead>
      <tbody>
        ${docs.map(doc => `
          <tr>
            <td>${doc.category}</td>
            <td style="text-align: right;">${doc.count}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function generateSummaryStatistics(stats: SummaryStats, accentColor: string): string {
  const rows = [
    { label: 'Total Subsections', value: stats.totalSubsections },
    { label: 'COC Required', value: stats.cocRequired || stats.totalSubsections },
    { label: 'COC Compliant', value: stats.cocValidCount },
    { label: 'Metering Installed', value: stats.meteringInstalled || stats.totalSubsections },
    { label: 'Open Snags', value: stats.openSnagsCount },
    { label: 'Overall Health Rate', value: `${Math.round((stats.compliantCount / Math.max(stats.totalSubsections, 1)) * 100)}%` },
  ];

  return `
    ${generateSectionHeader('Summary Statistics', accentColor)}
    <table class="summary-table">
      <tbody>
        ${rows.map(row => `
          <tr>
            <td class="stat-label">${row.label}</td>
            <td class="stat-value">${row.value}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function generateSubsectionCard(sub: SubsectionData, accentColor: string): string {
  const complianceClass = sub.isCompliant === true ? 'compliant' : sub.isCompliant === false ? 'non-compliant' : 'pending';
  const complianceText = sub.isCompliant === true ? 'Compliant' : sub.isCompliant === false ? 'Non-Compliant' : 'Pending';
  
  const cocStatusClass = getCocStatusClass(sub.cocStatus);
  const cocStatusText = sub.cocStatus || 'Missing';
  
  const openSnags = sub.snags?.filter(s => s.status !== 'resolved' && s.status !== 'Resolved') || [];
  
  return `
    <div class="subsection-card">
      <!-- Header -->
      <div class="card-header" style="background: linear-gradient(135deg, ${accentColor}, ${adjustColor(accentColor, -20)});">
        <div class="card-header-content">
          <div class="card-title">${sub.name}</div>
          ${sub.category ? `<div class="card-category">${sub.category}</div>` : ''}
        </div>
        <div class="card-qr">
          ${sub.qrCodeUrl ? `<img src="${sub.qrCodeUrl}" alt="QR" class="qr-code" />` : '<div class="qr-placeholder">Scan for details</div>'}
        </div>
      </div>
      
      <!-- Body -->
      <div class="card-body">
        <div class="card-details">
          <div class="detail-row">
            <span class="detail-label">COC Status:</span>
            <span class="status-badge ${cocStatusClass}">${cocStatusText}</span>
          </div>
          ${sub.cocNumber ? `
            <div class="detail-row">
              <span class="detail-label">COC #:</span>
              <span class="detail-value">${sub.cocNumber}</span>
            </div>
          ` : ''}
          ${sub.breakerSize ? `
            <div class="detail-row">
              <span class="detail-label">Breaker Size:</span>
              <span class="detail-value">${sub.breakerSize}</span>
            </div>
          ` : ''}
          <div class="detail-row">
            <span class="detail-label">Metering:</span>
            <span class="detail-value">${sub.meterSerialNumber ? 'Installed' : 'N/A'} ${sub.meterSerialNumber ? `S/N: ${sub.meterSerialNumber}` : ''} ${sub.ctRatio ? `CT: ${sub.ctRatio}` : ''}</span>
          </div>
        </div>
        
        <!-- Snags -->
        ${openSnags.length > 0 ? `
          <div class="snags-section">
            <div class="snags-header">Snags:</div>
            ${openSnags.slice(0, 3).map(snag => `
              <div class="snag-item">
                <span class="snag-risk ${getRiskClass(snag.riskLevel)}">${snag.riskLevel?.toUpperCase() || 'MEDIUM'}</span>
                <span class="snag-title">${snag.title}</span>
              </div>
            `).join('')}
            ${openSnags.length > 3 ? `<div class="snags-more">+${openSnags.length - 3} more snags</div>` : ''}
          </div>
        ` : '<div class="snags-section"><span class="no-snags">Snags: No open snags</span></div>'}
      </div>
      
      <!-- Footer -->
      <div class="card-footer ${complianceClass}">
        <span>Compliance: ${complianceText}</span>
      </div>
    </div>
  `;
}

function generateSubsectionPages(subsections: SubsectionData[], accentColor: string, generatedAt: string): string {
  if (!subsections || subsections.length === 0) return '';
  
  const pages: string[] = [];
  const cardsPerPage = 2;
  
  for (let i = 0; i < subsections.length; i += cardsPerPage) {
    const pageSubsections = subsections.slice(i, i + cardsPerPage);
    const pageNum = Math.floor(i / cardsPerPage) + 3; // Start after cover and summary pages
    const isFirstPage = i === 0;
    
    pages.push(`
      <div class="page ${!isFirstPage ? 'page-break' : ''}">
        ${generatePageHeader('Site Summary Report', accentColor)}
        
        ${isFirstPage ? generateSectionHeader('Subsection Details', accentColor) : 
          `<div class="section-header" style="background: ${accentColor};"><h2>Subsection Details (continued)</h2></div>`}
        
        <div class="subsection-grid">
          ${pageSubsections.map(sub => generateSubsectionCard(sub, accentColor)).join('')}
        </div>
        
        ${generatePageFooter(pageNum, '{{TOTAL_PAGES}}', generatedAt)}
      </div>
    `);
  }
  
  return pages.join('');
}

function getCocStatusClass(status: string | undefined): string {
  if (!status) return 'status-missing';
  const s = status.toLowerCase();
  if (s.includes('approved') || s.includes('valid') || s.includes('pass')) return 'status-valid';
  if (s.includes('failed') || s.includes('invalid') || s.includes('expired')) return 'status-invalid';
  return 'status-pending';
}

function getRiskClass(level: string | undefined): string {
  if (!level) return 'risk-medium';
  const l = level.toLowerCase();
  if (l === 'high' || l === 'critical') return 'risk-high';
  if (l === 'low') return 'risk-low';
  return 'risk-medium';
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
// CSS STYLES
// ============================================================================

function getStyles(accentColor: string): string {
  return `
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
      font-size: 9pt;
      color: ${COLORS.text};
      line-height: 1.4;
      background: white;
    }
    
    /* Page structure */
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 12mm 15mm 20mm 15mm;
      position: relative;
      background: white;
    }
    
    .page-break {
      page-break-before: always;
    }
    
    /* Cover page */
    .cover-page {
      width: 210mm;
      height: 297mm;
      position: relative;
      background: white;
      display: flex;
      flex-direction: column;
    }
    
    .accent-bar {
      height: 8px;
      width: 100%;
    }
    
    .cover-header {
      display: flex;
      justify-content: space-between;
      padding: 20mm 20mm 0 20mm;
    }
    
    .cover-logo {
      max-height: 60px;
      max-width: 150px;
      object-fit: contain;
    }
    
    .cover-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20mm;
      text-align: center;
    }
    
    .cover-title {
      font-size: 28pt;
      font-weight: 700;
      color: ${COLORS.primary};
      margin-bottom: 8px;
    }
    
    .cover-subtitle {
      font-size: 12pt;
      color: ${COLORS.textMuted};
      margin-bottom: 40px;
    }
    
    .site-info-box {
      border: 2px solid ${accentColor};
      border-radius: 8px;
      padding: 30px 50px;
      background: ${COLORS.lightGray};
    }
    
    .site-name {
      font-size: 22pt;
      font-weight: 700;
      color: ${COLORS.primary};
      margin-bottom: 8px;
    }
    
    .client-name {
      font-size: 12pt;
      color: ${COLORS.textMuted};
      margin-bottom: 4px;
    }
    
    .site-address {
      font-size: 10pt;
      color: ${COLORS.textMuted};
      margin-bottom: 8px;
    }
    
    .report-date {
      font-size: 11pt;
      font-weight: 600;
      color: ${accentColor};
    }
    
    .cover-footer {
      padding: 15mm 20mm;
      text-align: center;
      font-size: 8pt;
      color: ${COLORS.textMuted};
    }
    
    .cover-footer p {
      margin-bottom: 4px;
    }
    
    /* Page header and footer */
    .page-header {
      display: flex;
      justify-content: space-between;
      padding-bottom: 8px;
      border-bottom: 2px solid ${accentColor};
      margin-bottom: 15px;
      font-size: 10pt;
    }
    
    .header-title {
      font-weight: 600;
      color: ${COLORS.primary};
    }
    
    .header-site {
      color: ${COLORS.textMuted};
    }
    
    .page-footer {
      position: absolute;
      bottom: 10mm;
      left: 15mm;
      right: 15mm;
      display: flex;
      justify-content: space-between;
      font-size: 7pt;
      color: ${COLORS.textMuted};
      border-top: 1px solid ${COLORS.border};
      padding-top: 5px;
    }
    
    /* Section headers */
    .section-header {
      background: ${accentColor};
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      margin: 12px 0 10px 0;
    }
    
    .section-header h2 {
      font-size: 11pt;
      font-weight: 600;
      margin: 0;
    }
    
    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 15px;
    }
    
    .category-grid {
      grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    }
    
    .docs-kpi {
      grid-template-columns: repeat(2, 1fr);
    }
    
    .kpi-card {
      background: ${COLORS.lightGray};
      border: 1px solid ${COLORS.border};
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    
    .kpi-value {
      font-size: 20pt;
      font-weight: 700;
    }
    
    .kpi-label {
      font-size: 7pt;
      color: ${COLORS.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }
    
    /* Tables */
    .data-table, .summary-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    
    .data-table th {
      background: ${COLORS.primary};
      color: white;
      padding: 8px 12px;
      text-align: left;
      font-weight: 600;
      font-size: 9pt;
    }
    
    .data-table td {
      padding: 8px 12px;
      border-bottom: 1px solid ${COLORS.border};
      font-size: 9pt;
    }
    
    .data-table tr:nth-child(even) td {
      background: ${COLORS.lightGray};
    }
    
    .summary-table td {
      padding: 10px 15px;
      border-bottom: 1px solid ${COLORS.border};
    }
    
    .summary-table .stat-label {
      font-weight: 500;
      color: ${COLORS.textMuted};
    }
    
    .summary-table .stat-value {
      text-align: right;
      font-weight: 600;
      color: ${COLORS.primary};
    }
    
    /* Subsection cards */
    .subsection-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .subsection-card {
      border: 1px solid ${COLORS.border};
      border-radius: 8px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    
    .card-header {
      color: white;
      padding: 12px 15px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    
    .card-header-content {
      flex: 1;
    }
    
    .card-title {
      font-size: 13pt;
      font-weight: 700;
    }
    
    .card-category {
      font-size: 9pt;
      opacity: 0.9;
      margin-top: 2px;
    }
    
    .card-qr {
      width: 55px;
      height: 55px;
      background: white;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
    }
    
    .qr-code {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    
    .qr-placeholder {
      font-size: 6pt;
      color: ${COLORS.textMuted};
      text-align: center;
    }
    
    .card-body {
      padding: 12px 15px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 15px;
    }
    
    .card-details {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    
    .detail-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 9pt;
    }
    
    .detail-label {
      color: ${COLORS.textMuted};
      min-width: 85px;
    }
    
    .detail-value {
      color: ${COLORS.text};
    }
    
    /* Status badges */
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 8pt;
      font-weight: 600;
    }
    
    .status-valid {
      background: #d1fae5;
      color: #065f46;
    }
    
    .status-invalid {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .status-pending, .status-missing {
      background: #fef3c7;
      color: #92400e;
    }
    
    /* Snags */
    .snags-section {
      grid-column: 1 / -1;
      border-top: 1px solid ${COLORS.border};
      padding-top: 10px;
      margin-top: 5px;
    }
    
    .snags-header {
      font-weight: 600;
      font-size: 9pt;
      margin-bottom: 6px;
    }
    
    .snag-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      font-size: 8pt;
    }
    
    .snag-risk {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 7pt;
      font-weight: 700;
      min-width: 50px;
      text-align: center;
    }
    
    .risk-high {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .risk-medium {
      background: #fef3c7;
      color: #92400e;
    }
    
    .risk-low {
      background: #d1fae5;
      color: #065f46;
    }
    
    .snag-title {
      color: ${COLORS.text};
    }
    
    .snags-more {
      font-size: 7pt;
      color: ${COLORS.textMuted};
      margin-top: 4px;
    }
    
    .no-snags {
      color: ${COLORS.success};
      font-size: 9pt;
    }
    
    /* Card footer */
    .card-footer {
      padding: 8px 15px;
      font-weight: 600;
      font-size: 9pt;
    }
    
    .card-footer.compliant {
      background: #d1fae5;
      color: #065f46;
    }
    
    .card-footer.non-compliant {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .card-footer.pending {
      background: #fef3c7;
      color: #92400e;
    }
    
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

// ============================================================================
// MAIN HTML GENERATOR
// ============================================================================

function generateSiteSummaryHTML(data: ReportData): string {
  const accentColor = data.accentColor || '#2563eb';
  const generatedAt = data.generatedAt || new Date().toLocaleDateString('en-ZA');
  
  // Calculate health metrics if not provided
  const healthMetrics = data.healthMetrics || calculateHealthMetrics(data);
  
  // Calculate total pages
  const summaryPages = 2;
  const subsectionPages = Math.ceil((data.subsections?.length || 0) / 2);
  const totalPages = summaryPages + subsectionPages;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.siteName} - Site Summary Report</title>
  <style>${getStyles(accentColor)}</style>
</head>
<body>
  <!-- Cover Page -->
  ${generateCoverPage(data, accentColor)}
  
  <!-- Summary Page -->
  <div class="page page-break">
    ${generatePageHeader('Site Summary Report', accentColor)}
    
    ${generateHealthMetrics(healthMetrics, accentColor)}
    
    ${data.categoryHealth ? generateCategoryHealth(data.categoryHealth, accentColor) : ''}
    
    ${data.documentsSummary ? generateDocumentsSummary(data.documentsSummary, accentColor) : ''}
    
    ${generatePageFooter(1, totalPages.toString(), generatedAt)}
  </div>
  
  <!-- Statistics Page -->
  <div class="page page-break">
    ${generatePageHeader('Site Summary Report', accentColor)}
    
    ${data.summaryStats ? generateSummaryStatistics(data.summaryStats, accentColor) : ''}
    
    ${generatePageFooter(2, totalPages.toString(), generatedAt)}
  </div>
  
  <!-- Subsection Pages -->
  ${generateSubsectionPages(data.subsections || [], accentColor, generatedAt)}
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

    // Generate HTML
    let html: string;
    switch (body.reportType) {
      case 'site-summary':
        html = generateSiteSummaryHTML(body);
        break;
      default:
        html = generateSiteSummaryHTML(body);
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

    console.log('PDF generated successfully');

    // Return the PDF as base64 - chunked encoding
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const uint8Array = new Uint8Array(pdfBuffer);
    
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64Pdf = btoa(binary);

    return new Response(
      JSON.stringify({ 
        success: true, 
        pdf: base64Pdf,
        filename: `${body.siteName.replace(/[^a-zA-Z0-9]/g, '_')}_Report.pdf`
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
