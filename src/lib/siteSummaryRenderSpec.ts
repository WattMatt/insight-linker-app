/**
 * SITE SUMMARY RENDER SPECIFICATION
 * 
 * This is the SINGLE SOURCE OF TRUTH for Site Summary report layout.
 * Both the preview component and PDF generator use this spec to ensure
 * exact WYSIWYG matching between preview and final output.
 * 
 * Architecture:
 * ┌─────────────────────────────────────┐
 * │     siteSummaryRenderSpec.ts        │ ← This file
 * │     (Data structures & helpers)     │
 * └──────────────┬──────────────────────┘
 *                │
 *     ┌──────────┴──────────┐
 *     ▼                     ▼
 * ┌─────────────┐    ┌─────────────────┐
 * │  Preview    │    │  PDF Generator  │
 * │  (HTML/CSS) │    │  (pdfMake)      │
 * └─────────────┘    └─────────────────┘
 */

import { ReportSection, ReportCustomization } from "@/components/pdf-editor/types";

// ============================================================================
// COLOR PALETTES - Exact match between preview and PDF
// ============================================================================

export const ACCENT_PALETTES = {
  blue: { primary: '#2563eb', light: '#dbeafe', dark: '#1e40af', rgb: '37, 99, 235' },
  green: { primary: '#16a34a', light: '#dcfce7', dark: '#166534', rgb: '22, 163, 74' },
  orange: { primary: '#ea580c', light: '#ffedd5', dark: '#c2410c', rgb: '234, 88, 12' },
  red: { primary: '#dc2626', light: '#fee2e2', dark: '#b91c1c', rgb: '220, 38, 38' },
  purple: { primary: '#9333ea', light: '#f3e8ff', dark: '#7e22ce', rgb: '147, 51, 234' },
} as const;

export const STATUS_COLORS = {
  success: '#16a34a',
  warning: '#ea580c',
  error: '#dc2626',
  info: '#2563eb',
  muted: '#6b7280',
} as const;

export type AccentColorKey = keyof typeof ACCENT_PALETTES;

export function getAccentPalette(color: string = 'blue') {
  return ACCENT_PALETTES[color as AccentColorKey] || ACCENT_PALETTES.blue;
}

// ============================================================================
// KPI CARD SPECIFICATIONS
// ============================================================================

export interface KpiCardSpec {
  id: string;
  label: string;
  color: string;
  getValue: (metrics: SiteSummaryMetrics) => number;
  format: (value: number) => string;
}

export const HEALTH_METRICS_CARDS: KpiCardSpec[] = [
  { 
    id: 'overall-health', 
    label: 'Overall Health', 
    color: STATUS_COLORS.success,
    getValue: (m) => m.overallHealth,
    format: (v) => `${v}%`,
  },
  { 
    id: 'coc-compliance', 
    label: 'COC Compliance', 
    color: STATUS_COLORS.warning,
    getValue: (m) => m.cocCompliance,
    format: (v) => `${v}%`,
  },
  { 
    id: 'metering-data', 
    label: 'Metering Data', 
    color: STATUS_COLORS.info,
    getValue: (m) => m.meteringData,
    format: (v) => `${v}%`,
  },
  { 
    id: 'snag-free', 
    label: 'Snag Free', 
    color: STATUS_COLORS.error,
    getValue: (m) => m.snagFree,
    format: (v) => `${v}%`,
  },
];

// ============================================================================
// SECTION SPECIFICATIONS
// ============================================================================

export interface SectionSpec {
  id: string;
  legacyIds: string[]; // For backwards compatibility with legacy section IDs
  defaultTitle: string;
  type: 'summary' | 'table' | 'kpi' | 'text' | 'chart'; // Must match ReportSection type
  pageBreakBefore?: boolean;
  renderPriority: number; // Order for sections without explicit order
}

export const SECTION_SPECS: Record<string, SectionSpec> = {
  'health-metrics': {
    id: 'health-metrics',
    legacyIds: ['compliance'],
    defaultTitle: 'Health Metrics',
    type: 'kpi',
    renderPriority: 0,
  },
  'health-by-category': {
    id: 'health-by-category',
    legacyIds: [],
    defaultTitle: 'Health by Category',
    type: 'kpi',
    renderPriority: 1,
  },
  'summary-statistics': {
    id: 'summary-statistics',
    legacyIds: ['site-info'],
    defaultTitle: 'Summary Statistics',
    type: 'table',
    renderPriority: 2,
  },
  'subsection-details': {
    id: 'subsection-details',
    legacyIds: ['subsections'],
    defaultTitle: 'Subsection Details',
    type: 'summary', // 'cards' displayed as summary type
    pageBreakBefore: true,
    renderPriority: 3,
  },
  'subsection-qr-codes': {
    id: 'subsection-qr-codes',
    legacyIds: [],
    defaultTitle: 'Subsection QR Codes',
    type: 'table',
    renderPriority: 4,
  },
  'coc-validations': {
    id: 'coc-validations',
    legacyIds: ['documents'],
    defaultTitle: 'COC Validation Summary',
    type: 'table',
    pageBreakBefore: true,
    renderPriority: 5,
  },
  'inspections': {
    id: 'inspections',
    legacyIds: [],
    defaultTitle: 'Recent Inspections',
    type: 'table',
    pageBreakBefore: true,
    renderPriority: 6,
  },
  'asset-verification': {
    id: 'asset-verification',
    legacyIds: ['asset-summary'],
    defaultTitle: 'Asset Verification Summary',
    type: 'kpi',
    renderPriority: 7,
  },
  'fortress-checklist': {
    id: 'fortress-checklist',
    legacyIds: [],
    defaultTitle: 'Fortress Compliance Checklist',
    type: 'table',
    pageBreakBefore: true,
    renderPriority: 8,
  },
  'documents-summary': {
    id: 'documents-summary',
    legacyIds: [],
    defaultTitle: 'Documents Summary',
    type: 'table',
    renderPriority: 1.5, // After health-metrics, before summary-statistics
  },
};

// ============================================================================
// SUMMARY STATISTICS ROWS
// ============================================================================

export interface StatRowSpec {
  id: string;
  label: string;
  getValue: (metrics: SiteSummaryMetrics) => string;
}

export const SUMMARY_STAT_ROWS: StatRowSpec[] = [
  { id: 'total-subsections', label: 'Total Subsections', getValue: (m) => m.subsectionCount.toString() },
  { id: 'coc-required', label: 'COC Required', getValue: (m) => m.cocRequired.toString() },
  { id: 'coc-compliant', label: 'COC Compliant', getValue: (m) => m.cocCompliant.toString() },
  { id: 'metering-installed', label: 'Metering Installed', getValue: (m) => m.meteringInstalled.toString() },
  { id: 'open-snags', label: 'Open Snags', getValue: (m) => m.openSnags.toString() },
  { id: 'health-rate', label: 'Overall Health Rate', getValue: (m) => `${m.overallHealth}%` },
];

// ============================================================================
// TABLE COLUMN SPECIFICATIONS
// ============================================================================

export interface TableColumnSpec {
  id: string;
  header: string;
  width: number | string;
  alignment?: 'left' | 'center' | 'right';
}

export const COC_VALIDATION_COLUMNS: TableColumnSpec[] = [
  { id: 'subsection', header: 'Subsection', width: '*' },
  { id: 'cocNumber', header: 'COC Number', width: 100 },
  { id: 'status', header: 'Status', width: 70, alignment: 'center' },
  { id: 'date', header: 'Date', width: 80 },
];

export const INSPECTION_COLUMNS: TableColumnSpec[] = [
  { id: 'title', header: 'Title', width: '*' },
  { id: 'status', header: 'Status', width: 80 },
  { id: 'inspector', header: 'Inspector', width: 100 },
  { id: 'date', header: 'Date', width: 80 },
];

// Asset Verification KPI cards
export interface AssetKpiCardSpec {
  id: string;
  label: string;
  color: string;
  getValue: (metrics: AssetVerificationMetrics) => number;
  format: (value: number) => string;
}

export const ASSET_VERIFICATION_CARDS: AssetKpiCardSpec[] = [
  { 
    id: 'total-assets', 
    label: 'Electrical Meters', 
    color: STATUS_COLORS.info,
    getValue: (m) => m.totalAssets,
    format: (v) => v.toString(),
  },
  { 
    id: 'verified', 
    label: 'Verified', 
    color: STATUS_COLORS.success,
    getValue: (m) => m.verified,
    format: (v) => v.toString(),
  },
  { 
    id: 'discrepancies', 
    label: 'Discrepancies', 
    color: STATUS_COLORS.warning,
    getValue: (m) => m.discrepancies,
    format: (v) => v.toString(),
  },
  { 
    id: 'pending', 
    label: 'Pending', 
    color: STATUS_COLORS.muted,
    getValue: (m) => m.unverified,
    format: (v) => v.toString(),
  },
];

// ============================================================================
// SUBSECTION CARD FIELD SPECIFICATIONS
// ============================================================================

export interface CardFieldSpec {
  id: string;
  label: string;
  getValue: (sub: SubsectionData) => string;
  getColor?: (sub: SubsectionData) => string;
  showIf?: (sub: SubsectionData) => boolean;
}

export const SUBSECTION_CARD_FIELDS: CardFieldSpec[] = [
  { 
    id: 'coc-status', 
    label: 'COC Status', 
    getValue: (s) => s.cocStatus || 'Not Set',
    getColor: (s) => s.cocStatus === 'Approved' || s.cocStatus === 'Pass' ? STATUS_COLORS.success : STATUS_COLORS.muted,
  },
  { 
    id: 'metering', 
    label: 'Metering', 
    getValue: (s) => s.meteringStatus || 'Unknown',
  },
  { 
    id: 'meter-sn', 
    label: 'Meter S/N', 
    getValue: (s) => s.meterSerialNumber || '-',
    showIf: (s) => !!s.meterSerialNumber,
  },
  { 
    id: 'ct-ratio', 
    label: 'CT Ratio', 
    getValue: (s) => s.ctRatio || '-',
    showIf: (s) => !!s.ctRatio,
  },
  { 
    id: 'snags', 
    label: 'Snags', 
    getValue: (s) => s.snagCount.toString(),
    getColor: (s) => s.snagCount > 0 ? STATUS_COLORS.error : STATUS_COLORS.success,
  },
  { 
    id: 'compliance', 
    label: 'Compliance', 
    getValue: (s) => s.isCompliant ? '✓ Compliant' : '✗ Non-Compliant',
    getColor: (s) => s.isCompliant ? STATUS_COLORS.success : STATUS_COLORS.error,
  },
];

// ============================================================================
// DATA INTERFACES
// ============================================================================

export interface SiteSummaryMetrics {
  subsectionCount: number;
  cocRequired: number;
  cocCompliant: number;
  meteringInstalled: number;
  openSnags: number;
  overallHealth: number;
  cocCompliance: number;
  meteringData: number;
  snagFree: number;
}

// Asset verification metrics for site summary
export interface AssetVerificationMetrics {
  totalAssets: number;
  verified: number;
  discrepancies: number;
  unverified: number;
  verificationRate: number;
}

// Individual snag details
export interface SnagData {
  id: string;
  title: string;
  riskLevel: 'High' | 'Medium' | 'Low' | null;
  status: string;
  description?: string | null;
}

export interface SubsectionData {
  id: string;
  name: string;
  category: string | null;
  cocStatus: string | null;
  meteringStatus: string | null;
  meterSerialNumber: string | null;
  ctRatio: string | null;
  snagCount: number;
  isCompliant: boolean;
  qrCodeUrl?: string | null;
  // Actual snag list for detail cards
  snags?: SnagData[];
}

export interface CategoryHealthData {
  category: string;
  abbreviation: string;
  total: number;
  compliant: number;
  percentage: number;
}

export interface CocValidationData {
  subsectionName: string;
  cocNumber: string;
  status: string;
  date: string;
}

export interface InspectionData {
  title: string;
  status: string;
  inspectorName: string;
  date: string;
}

// ============================================================================
// LAYOUT SPECIFICATIONS (in points for PDF, scaled for preview)
// ============================================================================

export const LAYOUT = {
  // Page dimensions (A4 in points)
  page: {
    width: 595.28,
    height: 841.89,
    marginTop: 40,
    marginBottom: 40,
    marginLeft: 50,
    marginRight: 50,
  },
  // Cover page
  cover: {
    accentBarHeight: 8,
    logoHeight: 60,
    logoPadding: 20,
    titleSize: 24,
    subtitleSize: 14,
  },
  // Section headers
  sectionHeader: {
    fontSize: 14,
    borderWidth: 2,
    paddingBottom: 4,
    marginBottom: 12,
  },
  // KPI cards
  kpiCard: {
    valueSize: 18,
    labelSize: 8,
    padding: 8,
    borderRadius: 4,
  },
  // Data tables
  table: {
    headerFontSize: 10,
    bodyFontSize: 9,
    cellPadding: 6,
  },
  // Subsection cards
  subsectionCard: {
    nameFontSize: 11,
    fieldFontSize: 9,
    categoryFontSize: 8,
    qrCodeSize: 55,
    padding: 8,
    gap: 10,
  },
  // Footer
  footer: {
    fontSize: 8,
    marginTop: 10,
  },
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find section spec by ID (including legacy IDs)
 */
export function findSectionSpec(sectionId: string): SectionSpec | null {
  const direct = SECTION_SPECS[sectionId];
  if (direct) return direct;
  
  // Search in legacy IDs
  for (const spec of Object.values(SECTION_SPECS)) {
    if (spec.legacyIds.includes(sectionId)) {
      return spec;
    }
  }
  return null;
}

/**
 * Get the effective title for a section (user override or default)
 */
export function getSectionTitle(section: ReportSection): string {
  if (section.title && section.title.trim().length > 0) {
    return section.title;
  }
  const spec = findSectionSpec(section.id);
  return spec?.defaultTitle || section.id;
}

/**
 * Check if a section ID matches (including legacy IDs)
 */
export function matchesSectionId(section: ReportSection, targetId: string): boolean {
  if (section.id === targetId) return true;
  const spec = SECTION_SPECS[targetId];
  if (spec?.legacyIds.includes(section.id)) return true;
  return false;
}

/**
 * Sort sections by order, with fallback to render priority
 */
export function sortSections(sections: ReportSection[]): ReportSection[] {
  return [...sections].sort((a, b) => {
    const orderDiff = a.order - b.order;
    if (orderDiff !== 0) return orderDiff;
    
    const specA = findSectionSpec(a.id);
    const specB = findSectionSpec(b.id);
    return (specA?.renderPriority ?? 99) - (specB?.renderPriority ?? 99);
  });
}

/**
 * Get enabled sections sorted and ready for rendering
 */
export function getEnabledSections(sections: ReportSection[]): ReportSection[] {
  return sortSections(sections.filter(s => s.enabled));
}

/**
 * Calculate metrics from subsection data
 */
export function calculateMetrics(
  subsections: SubsectionData[],
  cocRequiredCount?: number,
  openSnagCount?: number
): SiteSummaryMetrics {
  const subsectionCount = Math.max(subsections.length, 1);
  const cocRequired = cocRequiredCount ?? subsections.filter(s => s.cocStatus !== null).length;
  const cocCompliant = subsections.filter(s => 
    ['Approved', 'Valid', 'Pass'].includes(s.cocStatus || '')
  ).length;
  const meteringInstalled = subsections.filter(s => 
    s.meteringStatus === 'Installed' || !!s.meterSerialNumber
  ).length;
  const openSnags = openSnagCount ?? subsections.reduce((sum, s) => sum + s.snagCount, 0);
  const compliantCount = subsections.filter(s => s.isCompliant).length;
  
  const overallHealth = Math.round((compliantCount / subsectionCount) * 100);
  const cocCompliance = cocRequired > 0 ? Math.round((cocCompliant / cocRequired) * 100) : 0;
  const meteringData = Math.round((meteringInstalled / subsectionCount) * 100);
  const snagFree = 100 - Math.round((openSnags / subsectionCount) * 100);
  
  return {
    subsectionCount,
    cocRequired,
    cocCompliant,
    meteringInstalled,
    openSnags,
    overallHealth,
    cocCompliance,
    meteringData,
    snagFree: Math.max(0, Math.min(100, snagFree)),
  };
}

/**
 * Calculate health by category
 */
export function calculateCategoryHealth(
  subsections: SubsectionData[],
  getCategoryAbbr: (cat: string) => string,
  maxCategories: number = 4
): CategoryHealthData[] {
  const categoryGroups = subsections.reduce((acc, sub) => {
    const cat = sub.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = { total: 0, compliant: 0 };
    acc[cat].total++;
    if (sub.isCompliant) acc[cat].compliant++;
    return acc;
  }, {} as Record<string, { total: number; compliant: number }>);
  
  return Object.entries(categoryGroups)
    .slice(0, maxCategories)
    .map(([category, data]) => ({
      category,
      abbreviation: getCategoryAbbr(category),
      total: data.total,
      compliant: data.compliant,
      percentage: Math.round((data.compliant / data.total) * 100) || 0,
    }));
}

/**
 * Normalize meter serial for matching (same logic as AssetVerification)
 */
function normalizeMeterSerial(serial: string | null | undefined): string {
  return (serial || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

/**
 * Compare two values for discrepancy detection
 */
function compareValues(
  assetValue: string | null | undefined,
  inspectionValue: string | null | undefined
): "match" | "mismatch" | "na" {
  const normAsset = (assetValue || "").toUpperCase().replace(/[^A-Z0-9/]/g, "").trim();
  const normInspection = (inspectionValue || "").toUpperCase().replace(/[^A-Z0-9/]/g, "").trim();

  if ((!normAsset || normAsset === "NA" || normAsset === "TBC") && 
      (!normInspection || normInspection === "NA" || normInspection === "TBC")) {
    return "na";
  }

  if (!normAsset || normAsset === "NA" || normAsset === "TBC") return "na";
  if (!normInspection || normInspection === "NA" || normInspection === "TBC") return "na";

  return normAsset === normInspection ? "match" : "mismatch";
}

interface InspectionTenantData {
  meterSerialNumber?: string;
  ctSizeAndRatio?: string;
  breakerSize?: string;
  shopNumber?: string;
  shopName?: string;
}

/**
 * Asset verification schedule row for detailed table
 */
export interface AssetScheduleRow {
  premisesId: string;
  meterSerial: string;
  breakerSize: string;
  ctRatio: string;
  inspectedSerial: string;
  inspectedBreaker: string;
  inspectedCT: string;
  status: 'verified' | 'discrepancy' | 'pending';
  discrepancyFields: string[];
}

/**
 * Calculate asset verification metrics using inspection json_data
 * Matches the same logic as the AssetVerification component
 */
export function calculateAssetMetrics(
  assets: Array<{ id: string; meter_serial_number: string | null; ct_ratio: string | null; breaker_size?: string | null; premises_id: string }>,
  inspections: Array<{ json_data?: unknown }>
): AssetVerificationMetrics {
  const totalAssets = assets.length;
  
  if (totalAssets === 0) {
    return { totalAssets: 0, verified: 0, discrepancies: 0, unverified: 0, verificationRate: 0 };
  }

  // Build inspection meter matches map from json_data (same as AssetVerification)
  const inspectionMeterMatches = new Map<string, InspectionTenantData>();
  
  inspections.forEach(inspection => {
    const jsonData = inspection.json_data as { 
      tenants?: Array<InspectionTenantData>
    };
    
    const tenants = jsonData?.tenants || [];
    tenants.forEach(tenant => {
      if (!tenant.meterSerialNumber) return;
      
      const normalizedSerial = normalizeMeterSerial(tenant.meterSerialNumber);
      if (!normalizedSerial || normalizedSerial === 'NA' || normalizedSerial === 'TBC') return;
      
      // Keep first match
      if (!inspectionMeterMatches.has(normalizedSerial)) {
        inspectionMeterMatches.set(normalizedSerial, tenant);
      }
    });
  });

  let verified = 0;
  let discrepancies = 0;

  assets.forEach(asset => {
    const normalizedSerial = normalizeMeterSerial(asset.meter_serial_number);
    const inspectionMatch = normalizedSerial && normalizedSerial !== "NA" && normalizedSerial !== "TBC"
      ? inspectionMeterMatches.get(normalizedSerial) || null
      : null;

    if (inspectionMatch) {
      const ctMatch = compareValues(asset.ct_ratio, inspectionMatch.ctSizeAndRatio);
      const breakerMatch = compareValues(asset.breaker_size, inspectionMatch.breakerSize);
      const hasDiscrepancy = ctMatch === "mismatch" || breakerMatch === "mismatch";
      
      if (hasDiscrepancy) {
        discrepancies++;
      } else {
        verified++;
      }
    }
  });

  const unverified = totalAssets - verified - discrepancies;
  const verificationRate = Math.round(((verified + discrepancies) / totalAssets) * 100);

  return { totalAssets, verified, discrepancies, unverified, verificationRate };
}

/**
 * Generate detailed asset verification schedule for PDF table
 */
export function generateAssetSchedule(
  assets: Array<{ id: string; meter_serial_number: string | null; ct_ratio: string | null; breaker_size?: string | null; premises_id: string }>,
  inspections: Array<{ json_data?: unknown }>
): AssetScheduleRow[] {
  // Build inspection meter matches map from json_data
  const inspectionMeterMatches = new Map<string, InspectionTenantData>();
  
  inspections.forEach(inspection => {
    const jsonData = inspection.json_data as { 
      tenants?: Array<InspectionTenantData>
    };
    
    const tenants = jsonData?.tenants || [];
    tenants.forEach(tenant => {
      if (!tenant.meterSerialNumber) return;
      
      const normalizedSerial = normalizeMeterSerial(tenant.meterSerialNumber);
      if (!normalizedSerial || normalizedSerial === 'NA' || normalizedSerial === 'TBC') return;
      
      if (!inspectionMeterMatches.has(normalizedSerial)) {
        inspectionMeterMatches.set(normalizedSerial, tenant);
      }
    });
  });

  return assets.map(asset => {
    const normalizedSerial = normalizeMeterSerial(asset.meter_serial_number);
    const inspectionMatch = normalizedSerial && normalizedSerial !== "NA" && normalizedSerial !== "TBC"
      ? inspectionMeterMatches.get(normalizedSerial) || null
      : null;

    const discrepancyFields: string[] = [];
    let status: 'verified' | 'discrepancy' | 'pending' = 'pending';

    if (inspectionMatch) {
      const ctMatch = compareValues(asset.ct_ratio, inspectionMatch.ctSizeAndRatio);
      const breakerMatch = compareValues(asset.breaker_size, inspectionMatch.breakerSize);
      
      if (ctMatch === 'mismatch') discrepancyFields.push('CT Ratio');
      if (breakerMatch === 'mismatch') discrepancyFields.push('Breaker');
      
      status = discrepancyFields.length > 0 ? 'discrepancy' : 'verified';
    }

    return {
      premisesId: asset.premises_id || 'N/A',
      meterSerial: asset.meter_serial_number || 'N/A',
      breakerSize: asset.breaker_size || 'N/A',
      ctRatio: asset.ct_ratio || 'N/A',
      inspectedSerial: inspectionMatch?.meterSerialNumber || '-',
      inspectedBreaker: inspectionMatch?.breakerSize || '-',
      inspectedCT: inspectionMatch?.ctSizeAndRatio || '-',
      status,
      discrepancyFields,
    };
  });
}

// ============================================================================
// FORTRESS CHECKLIST TYPES AND HELPERS
// ============================================================================

/**
 * Fortress checklist section progress data
 */
export interface FortressSectionProgress {
  sectionName: string;
  shortName: string;
  totalItems: number;
  completedItems: number;
  notApplicableItems: number;
  progressPercent: number;
}

/**
 * Fortress checklist overall metrics
 */
export interface FortressChecklistMetrics {
  totalItems: number;
  completedItems: number;
  notApplicableItems: number;
  pendingItems: number;
  overallProgress: number;
  sections: FortressSectionProgress[];
}

/**
 * Get a shortened section name for display
 */
function getShortenedSectionName(sectionName: string): string {
  const shortNames: Record<string, string> = {
    '1. RMU Compliance Inspections & Annual Maintenance': 'RMU Compliance',
    '2. Miniature Substations Compliance Inspections & Annual Maintenance': 'Mini Substations',
    '3. Main Distribution Boards Compliance Inspections & Annual Maintenance': 'Main DB',
    '4. Earthing & Lightning Protection Resistance & Impedance Testing': 'Earthing & Lightning',
    '5. Electrical Meter Installation Recording & Compliance Verification': 'Meter Installation',
    '6. Line Shop Boards Compliance Inspections & Annual Maintenance': 'Line Shop Boards',
    '7. General Area Lighting & Power Compliance Inspections & Annual Maintenance': 'Lighting & Power',
    '8. Issue Resolution & Close-Out': 'Close-Out',
  };
  
  return shortNames[sectionName] || sectionName.split('.').pop()?.trim().substring(0, 20) || sectionName;
}

/**
 * Calculate Fortress checklist metrics from database data
 */
export function calculateFortressMetrics(
  checklistItems: Array<{
    section_name: string;
    is_checked: boolean | null;
    status: string | null;
  }>
): FortressChecklistMetrics {
  if (!checklistItems || checklistItems.length === 0) {
    return {
      totalItems: 0,
      completedItems: 0,
      notApplicableItems: 0,
      pendingItems: 0,
      overallProgress: 0,
      sections: [],
    };
  }

  // Group by section
  const sectionMap = new Map<string, { total: number; completed: number; notApplicable: number }>();

  checklistItems.forEach(item => {
    const section = item.section_name;
    if (!sectionMap.has(section)) {
      sectionMap.set(section, { total: 0, completed: 0, notApplicable: 0 });
    }
    
    const data = sectionMap.get(section)!;
    data.total++;
    
    if (item.status === 'not_applicable') {
      data.notApplicable++;
    } else if (item.status === 'completed' || item.is_checked) {
      data.completed++;
    }
  });

  // Calculate section progress
  const sections: FortressSectionProgress[] = [];
  let totalItems = 0;
  let completedItems = 0;
  let notApplicableItems = 0;

  // Sort sections by their number prefix
  const sortedSections = Array.from(sectionMap.entries()).sort((a, b) => {
    const numA = parseInt(a[0].match(/^(\d+)/)?.[1] || '0');
    const numB = parseInt(b[0].match(/^(\d+)/)?.[1] || '0');
    return numA - numB;
  });

  sortedSections.forEach(([sectionName, data]) => {
    const applicableItems = data.total - data.notApplicable;
    const progressPercent = applicableItems > 0 
      ? Math.round((data.completed / applicableItems) * 100) 
      : 100;

    sections.push({
      sectionName,
      shortName: getShortenedSectionName(sectionName),
      totalItems: data.total,
      completedItems: data.completed,
      notApplicableItems: data.notApplicable,
      progressPercent,
    });

    totalItems += data.total;
    completedItems += data.completed;
    notApplicableItems += data.notApplicable;
  });

  const applicableTotal = totalItems - notApplicableItems;
  const overallProgress = applicableTotal > 0 
    ? Math.round((completedItems / applicableTotal) * 100) 
    : 0;

  return {
    totalItems,
    completedItems,
    notApplicableItems,
    pendingItems: totalItems - completedItems - notApplicableItems,
    overallProgress,
    sections,
  };
}

// ============================================================================
// DOCUMENTS SUMMARY METRICS
// ============================================================================

export interface DocumentCategoryMetrics {
  categoryName: string;
  fileCount: number;
}

export interface DocumentSummaryMetrics {
  totalDocuments: number;
  categories: DocumentCategoryMetrics[];
}

/**
 * Calculate document summary metrics from site and subsection documents
 */
export function calculateDocumentMetrics(
  siteDocuments: Array<{ category: string; file_name?: string }>,
  subsectionDocuments: Array<{ category_id?: string; file_name?: string }>
): DocumentSummaryMetrics {
  const categoryMap = new Map<string, number>();
  
  // Count site documents by category
  siteDocuments.forEach(doc => {
    const category = doc.category || 'Uncategorized';
    categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
  });
  
  // Subsection documents are already counted via category IDs
  // We'll show the total count
  const totalSubsectionDocs = subsectionDocuments.length;
  if (totalSubsectionDocs > 0 && !categoryMap.has('Subsection Documents')) {
    categoryMap.set('Subsection Documents', totalSubsectionDocs);
  }
  
  // Convert to sorted array
  const categories = Array.from(categoryMap.entries())
    .map(([categoryName, fileCount]) => ({ categoryName, fileCount }))
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  
  const totalDocuments = siteDocuments.length + subsectionDocuments.length;
  
  return {
    totalDocuments,
    categories,
  };
}
