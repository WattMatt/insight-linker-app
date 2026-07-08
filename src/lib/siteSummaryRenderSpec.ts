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
import { cocComplianceRate, hasValidCocStatus } from "@/lib/complianceCalculations";

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
  // Whether this subsection requires a COC. A `false` value (e.g. a generator
  // marked "does not require a COC") means it must never be reported as COC
  // "Missing" nor counted against COC compliance.
  isCocRequired?: boolean;
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

export interface CalculateMetricsInputs {
  /** Count of is_coc_required subsections; defaults to deriving from the rows. */
  cocRequiredCount?: number;
  /** Open snag count; defaults to summing snagCount off the rows. */
  openSnagCount?: number;
  /**
   * The unified site health number (siteHealth.ts siteHealthScore). Required — a report
   * must always show the same Overall Health the dashboards show; there is deliberately
   * no local fallback formula here.
   */
  overallHealth: number;
}

/**
 * Calculate metrics from subsection data
 */
export function calculateMetrics(
  subsections: SubsectionData[],
  inputs: CalculateMetricsInputs
): SiteSummaryMetrics {
  const subsectionCount = subsections.length;
  const safeDenominator = Math.max(subsections.length, 1);
  // A subsection "requires" a COC when isCocRequired is true. For legacy callers
  // that don't supply the flag, fall back to "has a coc_status" as before.
  const requiresCoc = (s: SubsectionData) => s.isCocRequired ?? (s.cocStatus !== null);
  const cocRequired = inputs.cocRequiredCount ?? subsections.filter(requiresCoc).length;
  // Numerator is required-AND-approved only, so a NOT-required subsection that
  // happens to carry an approved status can never push COC compliance over 100%.
  const cocCompliant = subsections.filter(s => requiresCoc(s) && hasValidCocStatus(s.cocStatus)).length;
  const meteringInstalled = subsections.filter(s =>
    s.meteringStatus === 'Installed' || !!s.meterSerialNumber
  ).length;
  const openSnags = inputs.openSnagCount ?? subsections.reduce((sum, s) => sum + s.snagCount, 0);
  const snagFree = 100 - Math.round((openSnags / safeDenominator) * 100);

  return {
    subsectionCount,
    cocRequired,
    cocCompliant,
    meteringInstalled,
    openSnags,
    overallHealth: inputs.overallHealth,
    cocCompliance: cocComplianceRate(cocCompliant, cocRequired),
    meteringData: Math.round((meteringInstalled / safeDenominator) * 100),
    snagFree: Math.max(0, Math.min(100, snagFree)),
  };
}

/**
 * Calculate health by category.
 *
 * Returns ALL categories present, sorted alphabetically. (Previously this
 * silently capped the result at the first 4 categories, dropping the rest with
 * no indication.) Pass a positive `maxCategories` to cap explicitly.
 */
export function calculateCategoryHealth(
  subsections: SubsectionData[],
  getCategoryAbbr: (cat: string) => string,
  maxCategories?: number
): CategoryHealthData[] {
  const categoryGroups = subsections.reduce((acc, sub) => {
    const cat = sub.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = { total: 0, compliant: 0 };
    acc[cat].total++;
    if (sub.isCompliant) acc[cat].compliant++;
    return acc;
  }, {} as Record<string, { total: number; compliant: number }>);

  const all = Object.entries(categoryGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, data]) => ({
      category,
      abbreviation: getCategoryAbbr(category),
      total: data.total,
      compliant: data.compliant,
      percentage: Math.round((data.compliant / data.total) * 100) || 0,
    }));

  return maxCategories && maxCategories > 0 ? all.slice(0, maxCategories) : all;
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
  files: string[]; // every document filename in this category (sorted)
}

export interface DocumentSummaryMetrics {
  totalDocuments: number;
  categories: DocumentCategoryMetrics[];
}

/**
 * Calculate document summary metrics from site and subsection documents.
 * Groups all documents by category name (to match the Documents tab display)
 * and lists every filename under its category.
 */
export function calculateDocumentMetrics(
  siteDocuments: Array<{
    category: string;
    file_name?: string;
    site_document_categories?: { name: string } | null;
  }>,
  subsectionDocuments: Array<{
    category_id?: string;
    file_name?: string;
    document_categories?: { name: string } | null;
  }>
): DocumentSummaryMetrics {
  const categoryFiles = new Map<string, string[]>();
  const add = (category: string, fileName?: string) => {
    if (!categoryFiles.has(category)) categoryFiles.set(category, []);
    categoryFiles.get(category)!.push(fileName?.trim() || '(unnamed file)');
  };

  // Site documents by category name (joined category or fallback to category field)
  siteDocuments.forEach(doc =>
    add(doc.site_document_categories?.name || doc.category || 'Uncategorized', doc.file_name)
  );

  // Subsection documents by their joined category name
  subsectionDocuments.forEach(doc =>
    add(doc.document_categories?.name || 'Uncategorized', doc.file_name)
  );

  // Sort categories alphabetically (matches the Documents tab); sort filenames within each.
  const categories = Array.from(categoryFiles.entries())
    .map(([categoryName, files]) => ({
      categoryName,
      fileCount: files.length,
      files: [...files].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName));

  const totalDocuments = siteDocuments.length + subsectionDocuments.length;

  return {
    totalDocuments,
    categories,
  };
}
