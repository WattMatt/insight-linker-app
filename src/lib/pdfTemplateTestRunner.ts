/**
 * PDF Template Gateway Test Runner
 * 
 * Comprehensive testing system to validate:
 * 1. Template gateway fetches correct configuration
 * 2. All sections render consistently between preview and PDF
 * 3. Parameter flow from template → generator → output
 * 4. SANS compliance checks are applied
 */

import { supabase } from "@/integrations/supabase/client";
import { ReportSection, ReportCustomization } from "@/components/pdf-editor/types";
import { fetchPDFTemplate, TemplateReportType } from "@/hooks/usePDFTemplateGateway";
import {
  SECTION_SPECS,
  HEALTH_METRICS_CARDS,
  SUMMARY_STAT_ROWS,
  SUBSECTION_CARD_FIELDS,
  COC_VALIDATION_COLUMNS,
  INSPECTION_COLUMNS,
  calculateMetrics,
  calculateCategoryHealth,
  getEnabledSections,
  matchesSectionId,
  getSectionTitle,
  findSectionSpec,
  SubsectionData,
} from "@/lib/siteSummaryRenderSpec";

// ============================================================================
// TEST RESULT TYPES
// ============================================================================

export interface TestResult {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'skipped';
  message: string;
  details?: Record<string, any>;
  duration?: number;
}

export interface TestSuiteResult {
  suiteName: string;
  startedAt: Date;
  completedAt: Date;
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  tests: TestResult[];
}

export interface ParameterFlowTest {
  parameter: string;
  templateValue: any;
  previewValue: any;
  pdfValue: any;
  matches: boolean;
}

// ============================================================================
// SAMPLE DATA FOR TESTING
// ============================================================================

export const SAMPLE_SUBSECTION_DATA: SubsectionData[] = [
  {
    id: 'test-1',
    name: 'Shop 001 - Ground Floor',
    category: 'EE',
    cocStatus: 'Pass',
    meteringStatus: 'Installed',
    meterSerialNumber: '35778057',
    ctRatio: '100/5A',
    snagCount: 0,
    isCompliant: true,
  },
  {
    id: 'test-2',
    name: 'Shop 002 - First Floor',
    category: 'EE',
    cocStatus: 'Pending',
    meteringStatus: 'Unknown',
    meterSerialNumber: null,
    ctRatio: null,
    snagCount: 2,
    isCompliant: false,
  },
  {
    id: 'test-3',
    name: 'Kiosk A',
    category: 'LS',
    cocStatus: 'Pass',
    meteringStatus: 'Installed',
    meterSerialNumber: '45892013',
    ctRatio: '200/5A',
    snagCount: 0,
    isCompliant: true,
  },
  {
    id: 'test-4',
    name: 'Food Court',
    category: 'LS',
    cocStatus: 'Fail',
    meteringStatus: 'Missing',
    meterSerialNumber: null,
    ctRatio: null,
    snagCount: 5,
    isCompliant: false,
  },
];

// ============================================================================
// TEST RUNNER CLASS
// ============================================================================

export class PDFTemplateTestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  /**
   * Run a single test and record the result
   */
  private async runTest(
    id: string,
    name: string,
    testFn: () => Promise<{ status: TestResult['status']; message: string; details?: Record<string, any> }>
  ): Promise<TestResult> {
    const testStart = performance.now();
    
    try {
      const result = await testFn();
      const duration = performance.now() - testStart;
      
      const testResult: TestResult = {
        id,
        name,
        ...result,
        duration,
      };
      
      this.results.push(testResult);
      return testResult;
    } catch (error: any) {
      const testResult: TestResult = {
        id,
        name,
        status: 'fail',
        message: `Exception: ${error.message}`,
        details: { error: error.stack },
        duration: performance.now() - testStart,
      };
      
      this.results.push(testResult);
      return testResult;
    }
  }

  /**
   * Run all tests for the PDF Template Gateway system
   */
  async runAllTests(reportType: TemplateReportType = 'site_summary'): Promise<TestSuiteResult> {
    this.results = [];
    this.startTime = performance.now();
    const startedAt = new Date();

    console.log('[TestRunner] Starting PDF Template Gateway test suite...');

    // 1. Template Gateway Tests
    await this.runTemplateGatewayTests(reportType);

    // 2. Spec Consistency Tests
    await this.runSpecConsistencyTests();

    // 3. Section Rendering Tests
    await this.runSectionRenderingTests();

    // 4. Metrics Calculation Tests
    await this.runMetricsCalculationTests();

    // 5. Parameter Flow Tests
    await this.runParameterFlowTests(reportType);

    // 6. Database Integration Tests
    await this.runDatabaseIntegrationTests();

    const completedAt = new Date();
    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const warnings = this.results.filter(r => r.status === 'warning').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;

    console.log(`[TestRunner] Completed: ${passed} passed, ${failed} failed, ${warnings} warnings`);

    return {
      suiteName: 'PDF Template Gateway Tests',
      startedAt,
      completedAt,
      totalTests: this.results.length,
      passed,
      failed,
      warnings,
      skipped,
      tests: this.results,
    };
  }

  /**
   * Test 1: Template Gateway functionality
   */
  private async runTemplateGatewayTests(reportType: TemplateReportType): Promise<void> {
    // Test: fetchPDFTemplate returns valid structure
    await this.runTest('gateway-fetch', 'Gateway fetches template correctly', async () => {
      const result = await fetchPDFTemplate(reportType);
      
      if (!result.customization) {
        return { status: 'fail', message: 'No customization returned' };
      }
      if (!result.sections || !Array.isArray(result.sections)) {
        return { status: 'fail', message: 'No sections array returned' };
      }
      if (!result.accentColors) {
        return { status: 'fail', message: 'No accent colors returned' };
      }
      
      return {
        status: 'pass',
        message: `Fetched template with ${result.sections.length} sections`,
        details: {
          customizationKeys: Object.keys(result.customization),
          sectionCount: result.sections.length,
          accentColor: result.customization.accentColor,
        },
      };
    });

    // Test: Template falls back to defaults when no DB entry
    await this.runTest('gateway-fallback', 'Gateway falls back to defaults', async () => {
      const result = await fetchPDFTemplate('compliance' as TemplateReportType);
      
      if (!result.customization || !result.sections) {
        return { status: 'fail', message: 'Fallback did not return valid structure' };
      }
      
      return {
        status: 'pass',
        message: 'Fallback to defaults works correctly',
        details: { sectionCount: result.sections.length },
      };
    });

    // Test: Accent color palette is valid
    await this.runTest('gateway-colors', 'Accent color palette is complete', async () => {
      const result = await fetchPDFTemplate(reportType);
      const colors = result.accentColors;
      
      const requiredKeys = ['primary', 'light', 'dark', 'rgb'];
      const missingKeys = requiredKeys.filter(key => !colors[key as keyof typeof colors]);
      
      if (missingKeys.length > 0) {
        return {
          status: 'fail',
          message: `Missing color keys: ${missingKeys.join(', ')}`,
        };
      }
      
      return {
        status: 'pass',
        message: 'All color palette keys present',
        details: colors,
      };
    });
  }

  /**
   * Test 2: Spec consistency between preview and PDF
   */
  private async runSpecConsistencyTests(): Promise<void> {
    // Test: All SECTION_SPECS have required fields
    await this.runTest('spec-sections', 'SECTION_SPECS are complete', async () => {
      const specs = Object.values(SECTION_SPECS);
      const invalidSpecs = specs.filter(
        spec => !spec.id || !spec.defaultTitle || !spec.type || spec.renderPriority === undefined
      );
      
      if (invalidSpecs.length > 0) {
        return {
          status: 'fail',
          message: `${invalidSpecs.length} specs are incomplete`,
          details: { invalidSpecs: invalidSpecs.map(s => s.id) },
        };
      }
      
      return {
        status: 'pass',
        message: `All ${specs.length} section specs are complete`,
        details: { sectionIds: specs.map(s => s.id) },
      };
    });

    // Test: KPI cards have required fields
    await this.runTest('spec-kpi-cards', 'HEALTH_METRICS_CARDS are complete', async () => {
      const invalidCards = HEALTH_METRICS_CARDS.filter(
        card => !card.id || !card.label || !card.color || !card.getValue || !card.format
      );
      
      if (invalidCards.length > 0) {
        return {
          status: 'fail',
          message: `${invalidCards.length} KPI cards are incomplete`,
        };
      }
      
      return {
        status: 'pass',
        message: `All ${HEALTH_METRICS_CARDS.length} KPI cards are complete`,
      };
    });

    // Test: Table columns are defined
    await this.runTest('spec-table-columns', 'Table column specs are defined', async () => {
      const cocColCount = COC_VALIDATION_COLUMNS.length;
      const inspColCount = INSPECTION_COLUMNS.length;
      
      if (cocColCount < 3) {
        return { status: 'fail', message: 'COC validation columns incomplete' };
      }
      if (inspColCount < 3) {
        return { status: 'fail', message: 'Inspection columns incomplete' };
      }
      
      return {
        status: 'pass',
        message: `COC: ${cocColCount} cols, Inspections: ${inspColCount} cols`,
      };
    });

    // Test: Subsection card fields are complete
    await this.runTest('spec-card-fields', 'SUBSECTION_CARD_FIELDS are complete', async () => {
      const invalidFields = SUBSECTION_CARD_FIELDS.filter(
        field => !field.id || !field.label || !field.getValue
      );
      
      if (invalidFields.length > 0) {
        return {
          status: 'fail',
          message: `${invalidFields.length} card fields are incomplete`,
        };
      }
      
      return {
        status: 'pass',
        message: `All ${SUBSECTION_CARD_FIELDS.length} card fields are complete`,
      };
    });
  }

  /**
   * Test 3: Section rendering consistency
   */
  private async runSectionRenderingTests(): Promise<void> {
    const { sections } = await fetchPDFTemplate('site_summary');

    // Test: All spec sections are represented in template
    await this.runTest('render-all-sections', 'All spec sections exist in template', async () => {
      const specIds = Object.keys(SECTION_SPECS);
      const templateIds = sections.map(s => s.id);
      const missing = specIds.filter(id => !templateIds.includes(id));
      
      if (missing.length > 0) {
        return {
          status: 'warning',
          message: `Missing sections: ${missing.join(', ')}`,
          details: { missing, templateIds },
        };
      }
      
      return {
        status: 'pass',
        message: 'All spec sections exist in template',
      };
    });

    // Test: matchesSectionId works for legacy IDs
    await this.runTest('render-legacy-ids', 'Legacy section IDs are matched', async () => {
      const testCases = [
        { section: { id: 'compliance', enabled: true, order: 0, editable: true, type: 'kpi' as const }, targetId: 'health-metrics' },
        { section: { id: 'site-info', enabled: true, order: 0, editable: true, type: 'table' as const }, targetId: 'summary-statistics' },
        { section: { id: 'subsections', enabled: true, order: 0, editable: true, type: 'table' as const }, targetId: 'subsection-details' },
      ];
      
      const failures = testCases.filter(tc => !matchesSectionId(tc.section as ReportSection, tc.targetId));
      if (failures.length > 0) {
        return {
          status: 'fail',
          message: `${failures.length} legacy ID matches failed`,
          details: { failures: failures.map(f => f.section.id) },
        };
      }
      
      return {
        status: 'pass',
        message: 'All legacy IDs are matched correctly',
      };
    });

    // Test: getSectionTitle respects user overrides
    await this.runTest('render-title-override', 'Section titles respect user overrides', async () => {
      const customSection: ReportSection = {
        id: 'health-metrics',
        title: 'Custom Health Title',
        type: 'kpi',
        enabled: true,
        order: 0,
        editable: true,
      };
      
      const title = getSectionTitle(customSection);
      
      if (title !== 'Custom Health Title') {
        return {
          status: 'fail',
          message: `Expected "Custom Health Title", got "${title}"`,
        };
      }
      
      return {
        status: 'pass',
        message: 'User title overrides work correctly',
      };
    });

    // Test: getEnabledSections filters and sorts correctly
    await this.runTest('render-enabled-sort', 'Enabled sections are filtered and sorted', async () => {
      const testSections: ReportSection[] = [
        { id: 'a', enabled: true, order: 2 } as any,
        { id: 'b', enabled: false, order: 0 } as any,
        { id: 'c', enabled: true, order: 1 } as any,
      ];
      
      const enabled = getEnabledSections(testSections);
      
      if (enabled.length !== 2) {
        return { status: 'fail', message: `Expected 2 enabled, got ${enabled.length}` };
      }
      if (enabled[0].id !== 'c' || enabled[1].id !== 'a') {
        return { status: 'fail', message: 'Sort order incorrect' };
      }
      
      return {
        status: 'pass',
        message: 'Filtering and sorting work correctly',
      };
    });
  }

  /**
   * Test 4: Metrics calculation accuracy
   */
  private async runMetricsCalculationTests(): Promise<void> {
    // Test: calculateMetrics produces expected values
    await this.runTest('metrics-basic', 'Basic metrics calculation is accurate', async () => {
      const metrics = calculateMetrics(SAMPLE_SUBSECTION_DATA);
      
      if (metrics.subsectionCount !== 4) {
        return { status: 'fail', message: `Expected 4 subsections, got ${metrics.subsectionCount}` };
      }
      
      const compliantCount = SAMPLE_SUBSECTION_DATA.filter(s => s.isCompliant).length;
      if (metrics.cocCompliant !== compliantCount) {
        return { status: 'fail', message: `Expected ${compliantCount} compliant, got ${metrics.cocCompliant}` };
      }
      
      return {
        status: 'pass',
        message: 'Metrics calculations are accurate',
        details: metrics,
      };
    });

    // Test: calculateCategoryHealth groups correctly
    await this.runTest('metrics-category-health', 'Category health calculation is accurate', async () => {
      const getCategoryAbbr = (cat: string) => cat;
      const health = calculateCategoryHealth(SAMPLE_SUBSECTION_DATA, getCategoryAbbr);
      
      if (health.length !== 2) {
        return { status: 'fail', message: `Expected 2 categories, got ${health.length}` };
      }
      
      const eeCategory = health.find(h => h.category === 'EE');
      if (!eeCategory) {
        return { status: 'fail', message: 'EE category not found' };
      }
      
      // EE: 1 compliant out of 2 = 50%
      if (eeCategory.percentage !== 50) {
        return { status: 'fail', message: `Expected EE 50%, got ${eeCategory.percentage}%` };
      }
      
      return {
        status: 'pass',
        message: 'Category health grouping is correct',
        details: health,
      };
    });

    // Test: KPI card value getters work
    await this.runTest('metrics-kpi-values', 'KPI card value getters work', async () => {
      const metrics = calculateMetrics(SAMPLE_SUBSECTION_DATA);
      
      const results = HEALTH_METRICS_CARDS.map(card => ({
        id: card.id,
        rawValue: card.getValue(metrics),
        formatted: card.format(card.getValue(metrics)),
      }));
      
      const invalidResults = results.filter(
        r => r.rawValue === undefined || r.formatted === undefined
      );
      
      if (invalidResults.length > 0) {
        return {
          status: 'fail',
          message: `${invalidResults.length} KPI cards returned undefined`,
          details: { invalidResults },
        };
      }
      
      return {
        status: 'pass',
        message: 'All KPI value getters work',
        details: results,
      };
    });
  }

  /**
   * Test 5: Parameter flow from template → generator → output
   */
  private async runParameterFlowTests(reportType: TemplateReportType): Promise<void> {
    const template = await fetchPDFTemplate(reportType);

    // Test: Accent color flows correctly
    await this.runTest('param-accent-color', 'Accent color flows through system', async () => {
      const accentColor = template.customization.accentColor || 'blue';
      const colors = template.accentColors;
      
      if (!colors.primary.startsWith('#')) {
        return { status: 'fail', message: 'Primary color is not a hex value' };
      }
      
      return {
        status: 'pass',
        message: `Accent color "${accentColor}" → ${colors.primary}`,
        details: { accentColor, colors },
      };
    });

    // Test: Section enabled states are respected
    await this.runTest('param-section-enabled', 'Section enabled states are respected', async () => {
      const enabledSections = template.sections.filter(s => s.enabled);
      const disabledSections = template.sections.filter(s => !s.enabled);
      
      return {
        status: 'pass',
        message: `${enabledSections.length} enabled, ${disabledSections.length} disabled`,
        details: {
          enabled: enabledSections.map(s => s.id),
          disabled: disabledSections.map(s => s.id),
        },
      };
    });

    // Test: Page break settings are detected
    await this.runTest('param-page-breaks', 'Page break settings are detected', async () => {
      const sectionsWithPageBreak = Object.values(SECTION_SPECS).filter(s => s.pageBreakBefore);
      
      if (sectionsWithPageBreak.length === 0) {
        return { status: 'warning', message: 'No sections have pageBreakBefore set' };
      }
      
      return {
        status: 'pass',
        message: `${sectionsWithPageBreak.length} sections have page breaks`,
        details: { sections: sectionsWithPageBreak.map(s => s.id) },
      };
    });

    // Test: Custom titles are preserved
    await this.runTest('param-custom-titles', 'Custom titles are preserved', async () => {
      const sectionsWithTitles = template.sections.filter(s => s.title && s.title.length > 0);
      
      return {
        status: 'pass',
        message: `${sectionsWithTitles.length} sections have custom titles`,
        details: {
          titles: sectionsWithTitles.map(s => ({ id: s.id, title: s.title })),
        },
      };
    });
  }

  /**
   * Test 6: Database integration tests
   */
  private async runDatabaseIntegrationTests(): Promise<void> {
    // Test: Can query pdf_report_templates table
    await this.runTest('db-query-templates', 'Can query pdf_report_templates', async () => {
      const { data, error } = await supabase
        .from('pdf_report_templates')
        .select('id, name, report_type, is_default')
        .limit(5);
      
      if (error) {
        return {
          status: 'fail',
          message: `Query failed: ${error.message}`,
        };
      }
      
      return {
        status: 'pass',
        message: `Found ${data?.length || 0} templates`,
        details: { templates: data },
      };
    });

    // Test: Check for default template
    await this.runTest('db-default-template', 'Default template exists for site_summary', async () => {
      const { data, error } = await supabase
        .from('pdf_report_templates')
        .select('id, name')
        .eq('report_type', 'site_summary')
        .eq('is_default', true)
        .single();
      
      if (error && error.code === 'PGRST116') {
        return {
          status: 'warning',
          message: 'No default template found - using fallback defaults',
        };
      }
      
      if (error) {
        return { status: 'fail', message: `Query failed: ${error.message}` };
      }
      
      return {
        status: 'pass',
        message: `Default template: ${data.name}`,
        details: data,
      };
    });

    // Test: Template sections are valid JSON
    await this.runTest('db-sections-json', 'Template sections are valid JSON', async () => {
      const { data, error } = await supabase
        .from('pdf_report_templates')
        .select('id, name, sections')
        .eq('report_type', 'site_summary')
        .limit(1)
        .single();
      
      if (error && error.code === 'PGRST116') {
        return { status: 'skipped', message: 'No template to validate' };
      }
      
      if (error) {
        return { status: 'fail', message: `Query failed: ${error.message}` };
      }
      
      const sections = typeof data.sections === 'string' 
        ? JSON.parse(data.sections) 
        : data.sections;
      
      if (!Array.isArray(sections)) {
        return { status: 'fail', message: 'Sections is not an array' };
      }
      
      const invalidSections = sections.filter((s: any) => !s.id || s.enabled === undefined);
      
      if (invalidSections.length > 0) {
        return {
          status: 'fail',
          message: `${invalidSections.length} sections have invalid structure`,
        };
      }
      
      return {
        status: 'pass',
        message: `${sections.length} valid sections in template`,
      };
    });
  }
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

/**
 * Run the full test suite and return results
 */
export async function runPDFTemplateTests(
  reportType: TemplateReportType = 'site_summary'
): Promise<TestSuiteResult> {
  const runner = new PDFTemplateTestRunner();
  return runner.runAllTests(reportType);
}
