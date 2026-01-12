/**
 * COC Test Runner
 * 
 * Automated test execution framework for COC validation testing.
 * Runs test suites against the validate-coc edge function and reports results.
 */

import { supabase } from '@/integrations/supabase/client';
import { 
  COCTestData, 
  generateTestSuite, 
  getExpectedResult,
  validateEarthResistance,
  validateLoopImpedance,
  validateInsulationResistance,
  validateRCDTripTime,
  validateConductorSizing,
  isCOCExpired
} from './cocTestUtils';

// ============= Type Definitions =============

export interface TestResult {
  testId: string;
  testName: string;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  expected: {
    status: 'Pass' | 'Fail' | 'Incomplete';
    failedChecks?: string[];
  };
  actual?: {
    status: string;
    failedChecks?: string[];
    confidenceScore?: number;
  };
  duration: number;
  error?: string;
  details?: string;
}

export interface TestSuiteResult {
  suiteName: string;
  startTime: string;
  endTime: string;
  totalDuration: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    skipped: number;
    passRate: number;
  };
  results: TestResult[];
}

export interface ValidationResponse {
  success: boolean;
  overallStatus: string;
  checks?: Array<{
    checkId: string;
    result: string;
    measuredValue?: string;
    limit?: string;
  }>;
  confidenceScore?: number;
  error?: string;
}

// ============= Test Runner Class =============

export class COCTestRunner {
  private results: TestResult[] = [];
  private startTime: Date | null = null;
  private useLocalValidation: boolean;

  constructor(options: { useLocalValidation?: boolean } = {}) {
    this.useLocalValidation = options.useLocalValidation ?? false;
  }

  /**
   * Run a single test case
   */
  async runTest(testId: string, testData: COCTestData): Promise<TestResult> {
    const startTime = Date.now();
    const expected = getExpectedResult(testId);
    
    try {
      let response: ValidationResponse;

      if (this.useLocalValidation) {
        // Run local validation (faster, no API call)
        response = this.validateLocally(testData);
      } else {
        // Call the edge function
        response = await this.callValidationAPI(testData);
      }

      const actual = {
        status: response.overallStatus || 'Unknown',
        failedChecks: response.checks
          ?.filter(c => c.result === 'Fail')
          .map(c => c.checkId) || [],
        confidenceScore: response.confidenceScore
      };

      // Compare results
      const statusMatch = actual.status.toLowerCase() === expected.status.toLowerCase();
      const checksMatch = this.compareFailedChecks(expected.failedChecks, actual.failedChecks);
      const passed = statusMatch && checksMatch;

      return {
        testId,
        testName: testId.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()),
        status: passed ? 'passed' : 'failed',
        expected,
        actual,
        duration: Date.now() - startTime,
        details: !passed ? `Expected ${expected.status}, got ${actual.status}` : undefined
      };
    } catch (error) {
      return {
        testId,
        testName: testId.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()),
        status: 'error',
        expected,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Run all tests in the test suite
   */
  async runAllTests(): Promise<TestSuiteResult> {
    this.startTime = new Date();
    this.results = [];

    const testSuite = generateTestSuite();
    
    for (const [testId, testData] of Object.entries(testSuite)) {
      const result = await this.runTest(testId, testData);
      this.results.push(result);
    }

    return this.generateReport();
  }

  /**
   * Run tests matching a pattern
   */
  async runTestsMatching(pattern: string): Promise<TestSuiteResult> {
    this.startTime = new Date();
    this.results = [];

    const testSuite = generateTestSuite();
    const regex = new RegExp(pattern, 'i');
    
    for (const [testId, testData] of Object.entries(testSuite)) {
      if (regex.test(testId)) {
        const result = await this.runTest(testId, testData);
        this.results.push(result);
      }
    }

    return this.generateReport();
  }

  /**
   * Run only passing tests
   */
  async runPassingTests(): Promise<TestSuiteResult> {
    return this.runTestsMatching('^PASS-');
  }

  /**
   * Run only failing tests
   */
  async runFailingTests(): Promise<TestSuiteResult> {
    return this.runTestsMatching('^FAIL-');
  }

  /**
   * Run hierarchy tests only
   */
  async runHierarchyTests(): Promise<TestSuiteResult> {
    return this.runTestsMatching('(initial|supplementary|temporary|hierarchy)');
  }

  /**
   * Run safety-critical tests only
   */
  async runSafetyCriticalTests(): Promise<TestSuiteResult> {
    return this.runTestsMatching('(earth|loop|insulation|rcd|polarity|continuity)');
  }

  /**
   * Call the validate-coc edge function
   */
  private async callValidationAPI(testData: COCTestData): Promise<ValidationResponse> {
    const { data, error } = await supabase.functions.invoke('validate-coc', {
      body: {
        testData,
        mode: 'structured', // Use structured data validation
        skipDocumentAnalysis: true
      }
    });

    if (error) {
      throw new Error(`API Error: ${error.message}`);
    }

    return data as ValidationResponse;
  }

  /**
   * Perform local validation (for faster testing)
   */
  private validateLocally(testData: COCTestData): ValidationResponse {
    const checks: Array<{ checkId: string; result: string; measuredValue?: string; limit?: string }> = [];
    let hasFailures = false;
    let hasIncomplete = false;

    // Check earth resistance
    if (testData.testResults.earthResistance?.measured !== undefined) {
      const result = validateEarthResistance(
        testData.testResults.earthResistance.measured,
        testData.premise.supplyType
      );
      checks.push({
        checkId: 'EARTH-001',
        result: result.pass ? 'Pass' : 'Fail',
        measuredValue: `${testData.testResults.earthResistance.measured}Ω`,
        limit: `≤${result.limit}Ω`
      });
      if (!result.pass) hasFailures = true;
    } else {
      hasIncomplete = true;
    }

    // Check loop impedance
    const loopData = Object.values(testData.testResults.earthLoopImpedance || {})[0];
    if (loopData) {
      const result = validateLoopImpedance(
        loopData.measured,
        parseInt(loopData.protectiveDevice.match(/\d+/)?.[0] || '40'),
        (loopData.protectiveDevice.match(/Type ([BCD])/)?.[1] || 'B') as 'B' | 'C' | 'D'
      );
      checks.push({
        checkId: 'LOOP-001',
        result: result.pass ? 'Pass' : 'Fail',
        measuredValue: `${loopData.measured}Ω`,
        limit: `≤${result.limit}Ω`
      });
      if (!result.pass) hasFailures = true;
    }

    // Check insulation resistance
    for (const [circuitId, ir] of Object.entries(testData.testResults.insulationResistance || {})) {
      const result = validateInsulationResistance(ir.measured, ir.testVoltage);
      checks.push({
        checkId: 'INSUL-001',
        result: result.pass ? 'Pass' : 'Fail',
        measuredValue: `${ir.measured}MΩ`,
        limit: `≥${result.limit}MΩ`
      });
      if (!result.pass) hasFailures = true;
    }

    // Check RCD trip times
    for (const [rcdId, rcd] of Object.entries(testData.testResults.rcdTests || {})) {
      const result1x = validateRCDTripTime(rcd.tripTimeAt1x, 1);
      checks.push({
        checkId: 'RCD-001',
        result: result1x.pass ? 'Pass' : 'Fail',
        measuredValue: `${rcd.tripTimeAt1x}ms @1×IΔn`,
        limit: `≤${result1x.limit}ms`
      });
      if (!result1x.pass) hasFailures = true;

      if (rcd.tripTimeAt5x) {
        const result5x = validateRCDTripTime(rcd.tripTimeAt5x, 5);
        checks.push({
          checkId: 'RCD-001',
          result: result5x.pass ? 'Pass' : 'Fail',
          measuredValue: `${rcd.tripTimeAt5x}ms @5×IΔn`,
          limit: `≤${result5x.limit}ms`
        });
        if (!result5x.pass) hasFailures = true;
      }
    }

    // Check polarity
    if (testData.testResults.polarity) {
      const pass = testData.testResults.polarity.allCircuits === 'Correct';
      checks.push({
        checkId: 'POL-001',
        result: pass ? 'Pass' : 'Fail',
        measuredValue: testData.testResults.polarity.allCircuits
      });
      if (!pass) hasFailures = true;
    }

    // Check continuity
    if (testData.testResults.continuity) {
      const pass = testData.testResults.continuity.protectiveConductor <= 0.5;
      checks.push({
        checkId: 'POL-001',
        result: pass ? 'Pass' : 'Fail',
        measuredValue: `${testData.testResults.continuity.protectiveConductor}Ω`,
        limit: '≤0.5Ω'
      });
      if (!pass) hasFailures = true;
    }

    // Check conductor sizing
    for (const circuit of testData.circuits) {
      const mcbRating = parseInt(circuit.protectiveDevice.match(/\d+/)?.[0] || '16');
      const result = validateConductorSizing(circuit.cableSize, mcbRating);
      checks.push({
        checkId: 'COND-001',
        result: result.pass ? 'Pass' : 'Fail',
        measuredValue: `${circuit.cableSize}mm² for ${mcbRating}A`,
        limit: `≥${result.limit}mm²`
      });
      if (!result.pass) hasFailures = true;
    }

    // Check COC hierarchy
    if (testData.cocType !== 'Initial') {
      const hasReference = !!testData.initialCocReference;
      checks.push({
        checkId: testData.cocType === 'Supplementary' ? 'COC-SUPP-001' : 'COC-TEMP-001',
        result: hasReference ? 'Pass' : 'Fail',
        measuredValue: testData.initialCocReference || 'Not provided'
      });
      if (!hasReference) hasFailures = true;
    }

    // Check expiry
    const expiryCheck = isCOCExpired(testData.cocIssueDate, testData.installationType);
    checks.push({
      checkId: 'CERT-EXPIRY-001',
      result: expiryCheck.expired ? 'Fail' : 'Pass',
      measuredValue: `Issued: ${testData.cocIssueDate}`,
      limit: `Expires: ${expiryCheck.expiryDate}`
    });
    if (expiryCheck.expired) hasFailures = true;

    // Determine overall status
    let overallStatus: string;
    if (hasIncomplete && checks.length < 5) {
      overallStatus = 'Incomplete';
    } else if (hasFailures) {
      overallStatus = 'Fail';
    } else {
      overallStatus = 'Pass';
    }

    return {
      success: true,
      overallStatus,
      checks,
      confidenceScore: 95
    };
  }

  /**
   * Compare failed checks arrays
   */
  private compareFailedChecks(expected?: string[], actual?: string[]): boolean {
    if (!expected || expected.length === 0) {
      return !actual || actual.length === 0;
    }
    if (!actual) return false;
    
    // Check if all expected failed checks are in actual
    return expected.every(check => actual.includes(check));
  }

  /**
   * Generate test report
   */
  private generateReport(): TestSuiteResult {
    const endTime = new Date();
    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const errors = this.results.filter(r => r.status === 'error').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;
    const total = this.results.length;

    return {
      suiteName: 'COC Validation Test Suite',
      startTime: this.startTime?.toISOString() || endTime.toISOString(),
      endTime: endTime.toISOString(),
      totalDuration: endTime.getTime() - (this.startTime?.getTime() || endTime.getTime()),
      summary: {
        total,
        passed,
        failed,
        errors,
        skipped,
        passRate: total > 0 ? Math.round((passed / total) * 100) : 0
      },
      results: this.results
    };
  }
}

// ============= Utility Functions =============

/**
 * Format test results as markdown
 */
export function formatResultsAsMarkdown(report: TestSuiteResult): string {
  const lines: string[] = [
    `# ${report.suiteName}`,
    '',
    `**Run Time:** ${report.startTime} - ${report.endTime}`,
    `**Duration:** ${report.totalDuration}ms`,
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Tests | ${report.summary.total} |`,
    `| Passed | ${report.summary.passed} |`,
    `| Failed | ${report.summary.failed} |`,
    `| Errors | ${report.summary.errors} |`,
    `| Skipped | ${report.summary.skipped} |`,
    `| Pass Rate | ${report.summary.passRate}% |`,
    '',
    '## Results',
    '',
    '| Test ID | Status | Duration | Details |',
    '|---------|--------|----------|---------|'
  ];

  for (const result of report.results) {
    const statusIcon = {
      passed: '✅',
      failed: '❌',
      error: '⚠️',
      skipped: '⏭️'
    }[result.status];
    
    const details = result.error || result.details || '-';
    lines.push(`| ${result.testId} | ${statusIcon} ${result.status} | ${result.duration}ms | ${details} |`);
  }

  return lines.join('\n');
}

/**
 * Format test results as JSON
 */
export function formatResultsAsJSON(report: TestSuiteResult): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Quick test runner for console
 */
export async function runQuickTests(): Promise<void> {
  console.log('🧪 Starting COC Test Suite...\n');
  
  const runner = new COCTestRunner({ useLocalValidation: true });
  const report = await runner.runAllTests();
  
  console.log(`\n📊 Results: ${report.summary.passed}/${report.summary.total} passed (${report.summary.passRate}%)`);
  
  if (report.summary.failed > 0 || report.summary.errors > 0) {
    console.log('\n❌ Failed/Error Tests:');
    report.results
      .filter(r => r.status === 'failed' || r.status === 'error')
      .forEach(r => {
        console.log(`  - ${r.testId}: ${r.error || r.details}`);
      });
  }
}

export default COCTestRunner;
