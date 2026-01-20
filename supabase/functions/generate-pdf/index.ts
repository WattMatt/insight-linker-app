import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReportData {
  reportType: 'site-summary' | 'compliance' | 'inspection' | 'floor-plan';
  siteId: string;
  siteName: string;
  clientName?: string;
  clientLogoUrl?: string;
  companyLogoUrl?: string;
  accentColor?: string;
  subsections?: SubsectionData[];
  summaryStats?: SummaryStats;
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
  openSnagsCount: number;
  resolvedSnagsCount: number;
}

// Generate HTML template for Site Summary Report
function generateSiteSummaryHTML(data: ReportData): string {
  const {
    siteName,
    clientName,
    clientLogoUrl,
    companyLogoUrl,
    accentColor = '#6366f1',
    subsections = [],
    summaryStats,
    generatedAt = new Date().toLocaleDateString()
  } = data;

  const complianceRate = summaryStats 
    ? Math.round((summaryStats.compliantCount / Math.max(summaryStats.totalSubsections, 1)) * 100)
    : 0;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${siteName} - Site Summary Report</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 10pt;
      color: #1f2937;
      line-height: 1.4;
      background: white;
    }
    
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 15mm 20mm;
      margin: 0 auto;
      background: white;
    }
    
    .page-break {
      page-break-before: always;
    }
    
    /* Header Styles */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 3px solid ${accentColor};
      margin-bottom: 20px;
    }
    
    .header-left {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    
    .logo {
      max-height: 50px;
      max-width: 120px;
      object-fit: contain;
    }
    
    .header-title {
      font-size: 18pt;
      font-weight: 700;
      color: ${accentColor};
    }
    
    .header-subtitle {
      font-size: 10pt;
      color: #6b7280;
    }
    
    .header-right {
      text-align: right;
    }
    
    .header-date {
      font-size: 9pt;
      color: #6b7280;
    }
    
    /* Section Headers */
    .section-header {
      background: ${accentColor};
      color: white;
      padding: 8px 12px;
      font-size: 11pt;
      font-weight: 600;
      margin: 15px 0 10px 0;
      border-radius: 4px;
    }
    
    /* KPI Cards */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    
    .kpi-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      text-align: center;
    }
    
    .kpi-value {
      font-size: 24pt;
      font-weight: 700;
      color: ${accentColor};
    }
    
    .kpi-value.success { color: #10b981; }
    .kpi-value.warning { color: #f59e0b; }
    .kpi-value.danger { color: #ef4444; }
    
    .kpi-label {
      font-size: 8pt;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }
    
    /* Stats Table */
    .stats-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    
    .stats-table th,
    .stats-table td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .stats-table th {
      background: #f3f4f6;
      font-weight: 600;
      font-size: 9pt;
      color: #374151;
    }
    
    .stats-table tr:nth-child(even) {
      background: #f9fafb;
    }
    
    /* Subsection Cards */
    .subsection-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 15px;
    }
    
    .subsection-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    
    .subsection-header {
      background: linear-gradient(135deg, ${accentColor}, ${adjustColor(accentColor, -20)});
      color: white;
      padding: 10px 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .subsection-title {
      font-size: 11pt;
      font-weight: 600;
    }
    
    .subsection-tenant {
      font-size: 9pt;
      opacity: 0.9;
    }
    
    .subsection-body {
      padding: 12px 15px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 15px;
    }
    
    .subsection-details {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    
    .detail-item {
      font-size: 9pt;
    }
    
    .detail-label {
      color: #6b7280;
      font-weight: 500;
    }
    
    .detail-value {
      color: #1f2937;
    }
    
    .qr-code {
      width: 60px;
      height: 60px;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
    }
    
    /* Status Badges */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 8pt;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .badge-success {
      background: #d1fae5;
      color: #065f46;
    }
    
    .badge-warning {
      background: #fef3c7;
      color: #92400e;
    }
    
    .badge-danger {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .badge-info {
      background: #dbeafe;
      color: #1e40af;
    }
    
    /* Snags List */
    .snags-list {
      margin-top: 10px;
      border-top: 1px solid #e5e7eb;
      padding-top: 10px;
    }
    
    .snag-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px dashed #e5e7eb;
      font-size: 9pt;
    }
    
    .snag-item:last-child {
      border-bottom: none;
    }
    
    /* Footer */
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: #6b7280;
    }
    
    @media print {
      .page {
        margin: 0;
        padding: 10mm 15mm;
      }
      
      .page-break {
        page-break-before: always;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        ${companyLogoUrl ? `<img src="${companyLogoUrl}" alt="Company Logo" class="logo" />` : ''}
        <div>
          <div class="header-title">${siteName}</div>
          <div class="header-subtitle">Site Summary Report${clientName ? ` • ${clientName}` : ''}</div>
        </div>
      </div>
      <div class="header-right">
        ${clientLogoUrl ? `<img src="${clientLogoUrl}" alt="Client Logo" class="logo" />` : ''}
        <div class="header-date">Generated: ${generatedAt}</div>
      </div>
    </div>
    
    <!-- Summary Statistics -->
    <div class="section-header">Summary Statistics</div>
    
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-value">${summaryStats?.totalSubsections || 0}</div>
        <div class="kpi-label">Total Units</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value success">${complianceRate}%</div>
        <div class="kpi-label">Compliance Rate</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value success">${summaryStats?.cocValidCount || 0}</div>
        <div class="kpi-label">Valid COCs</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value danger">${summaryStats?.openSnagsCount || 0}</div>
        <div class="kpi-label">Open Snags</div>
      </div>
    </div>
    
    <table class="stats-table">
      <thead>
        <tr>
          <th>Metric</th>
          <th>Count</th>
          <th>Percentage</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Compliant Units</td>
          <td>${summaryStats?.compliantCount || 0}</td>
          <td>${summaryStats ? Math.round((summaryStats.compliantCount / Math.max(summaryStats.totalSubsections, 1)) * 100) : 0}%</td>
        </tr>
        <tr>
          <td>Non-Compliant Units</td>
          <td>${summaryStats?.nonCompliantCount || 0}</td>
          <td>${summaryStats ? Math.round((summaryStats.nonCompliantCount / Math.max(summaryStats.totalSubsections, 1)) * 100) : 0}%</td>
        </tr>
        <tr>
          <td>Pending Review</td>
          <td>${summaryStats?.pendingCount || 0}</td>
          <td>${summaryStats ? Math.round((summaryStats.pendingCount / Math.max(summaryStats.totalSubsections, 1)) * 100) : 0}%</td>
        </tr>
        <tr>
          <td>COC Expired/Missing</td>
          <td>${(summaryStats?.cocExpiredCount || 0) + (summaryStats?.cocMissingCount || 0)}</td>
          <td>-</td>
        </tr>
      </tbody>
    </table>
    
    <!-- Subsections -->
    <div class="section-header">Subsection Details</div>
    
    <div class="subsection-grid">
      ${subsections.map((sub, index) => `
        ${index > 0 && index % 4 === 0 ? '</div><div class="page page-break"><div class="section-header">Subsection Details (continued)</div><div class="subsection-grid">' : ''}
        <div class="subsection-card">
          <div class="subsection-header">
            <div>
              <div class="subsection-title">${sub.name}</div>
              ${sub.tenantName ? `<div class="subsection-tenant">${sub.tenantName}</div>` : ''}
            </div>
            <span class="badge ${getComplianceBadgeClass(sub.isCompliant)}">
              ${sub.isCompliant === true ? 'Compliant' : sub.isCompliant === false ? 'Non-Compliant' : 'Pending'}
            </span>
          </div>
          <div class="subsection-body">
            <div class="subsection-details">
              <div class="detail-item">
                <span class="detail-label">Category:</span>
                <span class="detail-value">${sub.category || 'N/A'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">COC Status:</span>
                <span class="badge ${getCocBadgeClass(sub.cocStatus)}">${sub.cocStatus || 'Missing'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">COC Number:</span>
                <span class="detail-value">${sub.cocNumber || 'N/A'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Issue Date:</span>
                <span class="detail-value">${sub.cocIssueDate || 'N/A'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Meter:</span>
                <span class="detail-value">${sub.meterSerialNumber || 'N/A'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">CT Ratio:</span>
                <span class="detail-value">${sub.ctRatio || 'N/A'}</span>
              </div>
            </div>
            ${sub.qrCodeUrl ? `<img src="${sub.qrCodeUrl}" alt="QR Code" class="qr-code" />` : ''}
          </div>
          ${sub.snags && sub.snags.length > 0 ? `
            <div class="snags-list">
              <div style="font-weight: 600; font-size: 9pt; margin-bottom: 5px;">Open Snags (${sub.snags.length})</div>
              ${sub.snags.slice(0, 3).map(snag => `
                <div class="snag-item">
                  <span>${snag.title}</span>
                  <span class="badge ${getRiskBadgeClass(snag.riskLevel)}">${snag.riskLevel || 'Medium'}</span>
                </div>
              `).join('')}
              ${sub.snags.length > 3 ? `<div style="font-size: 8pt; color: #6b7280;">+${sub.snags.length - 3} more snags</div>` : ''}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <div>Generated by WM Compliance System</div>
      <div>Page 1</div>
    </div>
  </div>
</body>
</html>
  `;
}

function getComplianceBadgeClass(isCompliant: boolean | undefined): string {
  if (isCompliant === true) return 'badge-success';
  if (isCompliant === false) return 'badge-danger';
  return 'badge-warning';
}

function getCocBadgeClass(status: string | undefined): string {
  if (!status) return 'badge-warning';
  const s = status.toLowerCase();
  if (s.includes('valid') || s.includes('pass')) return 'badge-success';
  if (s.includes('expired') || s.includes('fail')) return 'badge-danger';
  return 'badge-warning';
}

function getRiskBadgeClass(level: string | undefined): string {
  if (!level) return 'badge-warning';
  const l = level.toLowerCase();
  if (l === 'high' || l === 'critical') return 'badge-danger';
  if (l === 'low') return 'badge-success';
  return 'badge-warning';
}

function adjustColor(hex: string, percent: number): string {
  // Simple color adjustment
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
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
    console.log('Generating PDF for:', body.siteName, 'Type:', body.reportType);

    // Generate HTML based on report type
    let html: string;
    switch (body.reportType) {
      case 'site-summary':
        html = generateSiteSummaryHTML(body);
        break;
      default:
        html = generateSiteSummaryHTML(body); // Default to site summary for now
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
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        },
        css: '@page { size: A4; margin: 0; }',
        wait_for: 'network',
        sandbox: true,
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

    // Return the PDF as base64
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

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
