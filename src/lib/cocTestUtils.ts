/**
 * COC Test Utilities
 * 
 * Comprehensive test data generators and validation utilities for
 * Electrical Certificate of Compliance (COC) testing against SANS 10142-1:2020.
 */

// ============= Type Definitions =============

export interface COCTestData {
  cocNumber: string;
  cocType: 'Initial' | 'Supplementary' | 'Temporary';
  cocFormat: 'ECA' | 'ECSA' | 'DOL' | 'Other';
  cocIssueDate: string;
  initialCocReference?: string | null;
  installationType: string;
  premise: PremiseData;
  registeredPerson: RegisteredPersonData;
  testResults: TestResultsData;
  circuits: CircuitData[];
  installationDate: string;
  testDate: string;
  specialConditions?: SpecialConditions;
}

export interface PremiseData {
  address: string;
  erfNumber?: string;
  supplyType: 'TN-S' | 'TN-C' | 'TN-C-S' | 'TT' | 'IT';
  nominalVoltage: number;
  phases: 1 | 3;
}

export interface RegisteredPersonData {
  name: string;
  idNumber?: string;
  registrationNumber: string;
  registrationType: string;
  registrationDate: string;
}

export interface TestResultsData {
  earthResistance: {
    measured: number;
    unit: string;
    testVoltage?: number;
    testMethod?: string;
  };
  insulationResistance: Record<string, {
    measured: number;
    unit: string;
    testVoltage: number;
  }>;
  earthLoopImpedance: Record<string, {
    measured: number;
    unit: string;
    protectiveDevice: string;
    maxPermitted: number;
  }>;
  rcdTests: Record<string, {
    ratedCurrent: number;
    unit: string;
    tripTimeAt1x: number;
    tripTimeAt5x?: number;
  }>;
  polarity: {
    allCircuits: 'Correct' | 'Incorrect';
    notes?: string;
  };
  continuity: {
    protectiveConductor: number;
    unit: string;
  };
}

export interface CircuitData {
  circuitNumber: number;
  description: string;
  cableSize: number;
  cableSizeUnit: string;
  cableType?: string;
  protectiveDevice: string;
  load: number;
  loadUnit: string;
  rcdProtected?: boolean;
}

export interface SpecialConditions {
  generator?: {
    installed: boolean;
    rating?: number;
    changeoverSwitch?: boolean;
    backfeedPrevention?: boolean;
  };
  solarPV?: {
    installed: boolean;
    capacity?: number;
    inverterType?: string;
    dcIsolation?: boolean;
  };
  batteryStorage?: {
    installed: boolean;
    capacity?: number;
    type?: string;
    ventilation?: boolean;
  };
  surgeProt?: {
    installed: boolean;
    type?: string;
    locations?: string[];
  };
}

export interface TestScenarioOptions {
  cocType?: 'Initial' | 'Supplementary' | 'Temporary';
  installationType?: string;
  supplySystem?: 'TN-S' | 'TN-C' | 'TN-C-S' | 'TT' | 'IT';
  failureType?: FailureType;
  measuredValue?: number;
  includeSpecialConditions?: boolean;
  isExpired?: boolean;
  expiryDays?: number;
}

export type FailureType = 
  | 'earth-resistance'
  | 'loop-impedance'
  | 'insulation-resistance'
  | 'rcd-trip-time'
  | 'polarity'
  | 'continuity'
  | 'conductor-sizing'
  | 'hierarchy-missing-initial'
  | 'hierarchy-expired-initial'
  | 'hierarchy-expired-temporary';

// ============= Constants =============

export const ZS_MAX_VALUES: Record<string, Record<number, number>> = {
  'B': { 6: 7.67, 10: 4.60, 16: 2.87, 20: 2.30, 25: 1.84, 32: 1.44, 40: 1.15, 50: 0.92, 63: 0.73 },
  'C': { 6: 3.84, 10: 2.30, 16: 1.44, 20: 1.15, 25: 0.92, 32: 0.72, 40: 0.58, 50: 0.46, 63: 0.37 },
  'D': { 6: 1.92, 10: 1.15, 16: 0.72, 20: 0.58, 25: 0.46, 32: 0.36, 40: 0.29, 50: 0.23, 63: 0.18 }
};

export const CABLE_SIZE_LIMITS: Record<number, number> = {
  6: 1.0, 10: 1.0, 16: 1.5, 20: 2.5, 25: 2.5, 32: 4.0, 40: 6.0, 50: 10, 63: 16
};

export const EARTH_RESISTANCE_LIMITS: Record<string, number> = {
  'TN-S': 1.0,
  'TN-C': 1.0,
  'TN-C-S': 1.0,
  'TT': 20.0, // With 30mA RCD
  'IT': 50.0  // Per design spec
};

export const RCD_TRIP_TIME_LIMITS = {
  at1x: 300,  // ms at 1× IΔn
  at2x: 150,  // ms at 2× IΔn
  at5x: 40    // ms at 5× IΔn
};

// ============= Generator Functions =============

/**
 * Generate a unique COC number
 */
export function generateCOCNumber(format: 'ECA' | 'ECSA' | 'DOL' = 'ECA'): string {
  const year = new Date().getFullYear();
  const sequence = Math.floor(Math.random() * 999999).toString().padStart(6, '0');
  return `${format}-${year}-${sequence}`;
}

/**
 * Generate a random South African ID number
 */
export function generateSAIDNumber(): string {
  const year = (50 + Math.floor(Math.random() * 40)).toString().padStart(2, '0');
  const month = (1 + Math.floor(Math.random() * 12)).toString().padStart(2, '0');
  const day = (1 + Math.floor(Math.random() * 28)).toString().padStart(2, '0');
  const sequence = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  const citizenship = Math.random() > 0.9 ? '1' : '0';
  const checkDigit = Math.floor(Math.random() * 10).toString();
  return `${year}${month}${day}${sequence}${citizenship}8${checkDigit}`;
}

/**
 * Generate a registration number
 */
export function generateRegistrationNumber(format: 'ECA' | 'ECSA' = 'ECA'): string {
  const sequence = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
  return `${format}-${sequence}`;
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Generate a date relative to today
 */
export function getRelativeDate(daysOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return formatDate(date);
}

/**
 * Generate passing COC test data
 */
export function generatePassingCOC(options: TestScenarioOptions = {}): COCTestData {
  const {
    cocType = 'Initial',
    installationType = 'Domestic Single Phase',
    supplySystem = 'TN-S',
    includeSpecialConditions = false
  } = options;

  const cocFormat = 'ECA' as const;
  const today = getRelativeDate(0);
  const installDate = getRelativeDate(-30);
  
  const data: COCTestData = {
    cocNumber: generateCOCNumber(cocFormat),
    cocType,
    cocFormat,
    cocIssueDate: today,
    installationType,
    premise: {
      address: '123 Test Street, Johannesburg, 2000',
      erfNumber: 'ERF 456',
      supplyType: supplySystem,
      nominalVoltage: 230,
      phases: 1
    },
    registeredPerson: {
      name: 'John Test Smith',
      idNumber: generateSAIDNumber(),
      registrationNumber: generateRegistrationNumber(cocFormat),
      registrationType: 'Electrical Installation Contractor',
      registrationDate: '2015-03-15'
    },
    testResults: {
      earthResistance: {
        measured: 0.85,
        unit: 'Ω',
        testVoltage: 500,
        testMethod: '4-pole earth tester'
      },
      insulationResistance: {
        circuit1: { measured: 150, unit: 'MΩ', testVoltage: 500 },
        circuit2: { measured: 98, unit: 'MΩ', testVoltage: 500 },
        circuit3: { measured: 120, unit: 'MΩ', testVoltage: 500 }
      },
      earthLoopImpedance: {
        mainIncomer: {
          measured: 0.42,
          unit: 'Ω',
          protectiveDevice: '40A Type B MCB',
          maxPermitted: 1.15
        }
      },
      rcdTests: {
        rcd1: {
          ratedCurrent: 30,
          unit: 'mA',
          tripTimeAt1x: 28,
          tripTimeAt5x: 18
        }
      },
      polarity: {
        allCircuits: 'Correct',
        notes: 'Phase, neutral, earth correctly connected throughout'
      },
      continuity: {
        protectiveConductor: 0.32,
        unit: 'Ω'
      }
    },
    circuits: [
      {
        circuitNumber: 1,
        description: 'Lighting',
        cableSize: 1.5,
        cableSizeUnit: 'mm²',
        cableType: 'PVC/PVC',
        protectiveDevice: '16A Type B MCB',
        load: 12,
        loadUnit: 'A',
        rcdProtected: true
      },
      {
        circuitNumber: 2,
        description: 'Socket outlets',
        cableSize: 2.5,
        cableSizeUnit: 'mm²',
        cableType: 'PVC/PVC',
        protectiveDevice: '20A Type B MCB',
        load: 16,
        loadUnit: 'A',
        rcdProtected: true
      },
      {
        circuitNumber: 3,
        description: 'Geyser',
        cableSize: 4.0,
        cableSizeUnit: 'mm²',
        cableType: 'PVC/PVC',
        protectiveDevice: '32A Type B MCB',
        load: 25,
        loadUnit: 'A',
        rcdProtected: true
      }
    ],
    installationDate: installDate,
    testDate: today
  };

  // Add initial reference for Supplementary/Temporary
  if (cocType !== 'Initial') {
    data.initialCocReference = generateCOCNumber(cocFormat);
  }

  // Add special conditions if requested
  if (includeSpecialConditions) {
    data.specialConditions = {
      surgeProt: {
        installed: true,
        type: 'Type 2',
        locations: ['Main DB']
      }
    };
  }

  return data;
}

/**
 * Generate failing COC test data
 */
export function generateFailingCOC(options: TestScenarioOptions): COCTestData {
  const baseData = generatePassingCOC(options);
  const { failureType, measuredValue } = options;

  switch (failureType) {
    case 'earth-resistance':
      baseData.testResults.earthResistance.measured = measuredValue ?? 2.3;
      break;

    case 'loop-impedance':
      baseData.testResults.earthLoopImpedance.mainIncomer.measured = measuredValue ?? 1.5;
      break;

    case 'insulation-resistance':
      baseData.testResults.insulationResistance.circuit1.measured = measuredValue ?? 0.3;
      break;

    case 'rcd-trip-time':
      baseData.testResults.rcdTests.rcd1.tripTimeAt1x = measuredValue ?? 450;
      break;

    case 'polarity':
      baseData.testResults.polarity.allCircuits = 'Incorrect';
      baseData.testResults.polarity.notes = 'Phase and neutral reversed on circuit 2';
      break;

    case 'continuity':
      baseData.testResults.continuity.protectiveConductor = measuredValue ?? 0.8;
      break;

    case 'conductor-sizing':
      baseData.circuits[2].cableSize = 2.5; // Too small for 32A protection
      break;

    case 'hierarchy-missing-initial':
      baseData.cocType = 'Supplementary';
      baseData.initialCocReference = null;
      break;

    case 'hierarchy-expired-initial':
      baseData.cocType = 'Supplementary';
      baseData.initialCocReference = 'ECA-2020-000001'; // Old reference
      break;

    case 'hierarchy-expired-temporary':
      baseData.cocType = 'Temporary';
      baseData.cocIssueDate = getRelativeDate(-120); // 4 months ago
      baseData.initialCocReference = generateCOCNumber('ECA');
      break;
  }

  return baseData;
}

/**
 * Generate incomplete COC data (missing >30% of required fields)
 */
export function generateIncompleteData(options: TestScenarioOptions = {}): Partial<COCTestData> {
  const baseData = generatePassingCOC(options);
  
  // Remove multiple required test results
  delete (baseData.testResults as Partial<TestResultsData>).earthResistance;
  delete (baseData.testResults as Partial<TestResultsData>).rcdTests;
  delete (baseData.testResults as Partial<TestResultsData>).earthLoopImpedance;
  
  // Remove circuits
  baseData.circuits = [];
  
  return baseData;
}

/**
 * Generate hierarchy violation test data
 */
export function generateHierarchyViolation(violationType: 'missing-initial' | 'expired-initial' | 'expired-temporary'): COCTestData {
  switch (violationType) {
    case 'missing-initial':
      return generateFailingCOC({ failureType: 'hierarchy-missing-initial' });
    case 'expired-initial':
      return generateFailingCOC({ failureType: 'hierarchy-expired-initial' });
    case 'expired-temporary':
      return generateFailingCOC({ failureType: 'hierarchy-expired-temporary' });
  }
}

/**
 * Generate expired COC data
 */
export function generateExpiredCOC(installationType: 'Domestic' | 'Commercial' = 'Commercial'): COCTestData {
  const baseData = generatePassingCOC({ installationType: `${installationType} Single Phase` });
  
  // Set issue date based on installation type
  const expiryDays = installationType === 'Commercial' ? -730 : -1825; // 2 years or 5 years
  baseData.cocIssueDate = getRelativeDate(expiryDays - 30); // Beyond expiry
  baseData.testDate = getRelativeDate(expiryDays - 30);
  baseData.installationDate = getRelativeDate(expiryDays - 60);
  
  return baseData;
}

/**
 * Generate COC with special conditions
 */
export function generateCOCWithSpecialConditions(conditionType: 'generator' | 'solar' | 'battery' | 'spd'): COCTestData {
  const baseData = generatePassingCOC({ includeSpecialConditions: false });
  
  switch (conditionType) {
    case 'generator':
      baseData.specialConditions = {
        generator: {
          installed: true,
          rating: 10,
          changeoverSwitch: true,
          backfeedPrevention: true
        }
      };
      break;

    case 'solar':
      baseData.specialConditions = {
        solarPV: {
          installed: true,
          capacity: 5,
          inverterType: 'Deye 5kW Hybrid',
          dcIsolation: true
        }
      };
      break;

    case 'battery':
      baseData.specialConditions = {
        batteryStorage: {
          installed: true,
          capacity: 10.24,
          type: 'LiFePO4',
          ventilation: true
        }
      };
      break;

    case 'spd':
      baseData.specialConditions = {
        surgeProt: {
          installed: true,
          type: 'Type 2',
          locations: ['Main DB', 'Sub DB']
        }
      };
      break;
  }
  
  return baseData;
}

// ============= Validation Functions =============

/**
 * Validate earth resistance against limits
 */
export function validateEarthResistance(measured: number, supplySystem: string): { pass: boolean; limit: number } {
  const limit = EARTH_RESISTANCE_LIMITS[supplySystem] ?? 1.0;
  return { pass: measured <= limit, limit };
}

/**
 * Validate earth loop impedance
 */
export function validateLoopImpedance(measured: number, mcbRating: number, mcbType: 'B' | 'C' | 'D' = 'B'): { pass: boolean; limit: number } {
  const limit = ZS_MAX_VALUES[mcbType]?.[mcbRating] ?? 1.0;
  return { pass: measured <= limit, limit };
}

/**
 * Validate insulation resistance
 */
export function validateInsulationResistance(measured: number, testVoltage: number): { pass: boolean; limit: number } {
  const limit = testVoltage <= 250 ? 0.5 : 1.0;
  return { pass: measured >= limit, limit };
}

/**
 * Validate RCD trip time
 */
export function validateRCDTripTime(tripTimeMs: number, testMultiplier: 1 | 2 | 5): { pass: boolean; limit: number } {
  const limits: Record<number, number> = { 1: 300, 2: 150, 5: 40 };
  const limit = limits[testMultiplier];
  return { pass: tripTimeMs <= limit, limit };
}

/**
 * Validate conductor sizing
 */
export function validateConductorSizing(cableSizeMm2: number, mcbRating: number): { pass: boolean; limit: number } {
  const limit = CABLE_SIZE_LIMITS[mcbRating] ?? 1.0;
  return { pass: cableSizeMm2 >= limit, limit };
}

/**
 * Check if COC is expired
 */
export function isCOCExpired(issueDate: string, installationType: string): { expired: boolean; expiryDate: string; daysOverdue: number } {
  const issue = new Date(issueDate);
  const today = new Date();
  
  // Commercial: 2 years, Domestic: 5 years
  const yearsValid = installationType.toLowerCase().includes('commercial') || 
                     installationType.toLowerCase().includes('industrial') ? 2 : 5;
  
  const expiry = new Date(issue);
  expiry.setFullYear(expiry.getFullYear() + yearsValid);
  
  const expired = today > expiry;
  const daysOverdue = expired ? Math.floor((today.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  
  return { expired, expiryDate: formatDate(expiry), daysOverdue };
}

// ============= Test Suite Generators =============

/**
 * Generate a complete test suite for all check types
 */
export function generateTestSuite(): Record<string, COCTestData> {
  return {
    // Passing tests
    'PASS-001-initial-compliant': generatePassingCOC({ cocType: 'Initial' }),
    'PASS-002-supplementary-with-ref': generatePassingCOC({ cocType: 'Supplementary' }),
    'PASS-003-temporary-with-ref': generatePassingCOC({ cocType: 'Temporary' }),
    'PASS-004-with-generator': generateCOCWithSpecialConditions('generator'),
    'PASS-005-with-solar': generateCOCWithSpecialConditions('solar'),
    'PASS-006-with-battery': generateCOCWithSpecialConditions('battery'),
    'PASS-007-tt-system': generatePassingCOC({ supplySystem: 'TT' }),
    
    // Failing tests - Safety Critical
    'FAIL-001-earth-resistance': generateFailingCOC({ failureType: 'earth-resistance', measuredValue: 2.3 }),
    'FAIL-002-loop-impedance': generateFailingCOC({ failureType: 'loop-impedance', measuredValue: 1.5 }),
    'FAIL-003-insulation': generateFailingCOC({ failureType: 'insulation-resistance', measuredValue: 0.3 }),
    'FAIL-004-rcd-trip': generateFailingCOC({ failureType: 'rcd-trip-time', measuredValue: 450 }),
    'FAIL-005-polarity': generateFailingCOC({ failureType: 'polarity' }),
    'FAIL-006-continuity': generateFailingCOC({ failureType: 'continuity', measuredValue: 0.8 }),
    'FAIL-007-conductor-size': generateFailingCOC({ failureType: 'conductor-sizing' }),
    
    // Failing tests - Hierarchy
    'FAIL-008-missing-initial': generateHierarchyViolation('missing-initial'),
    'FAIL-009-expired-initial': generateHierarchyViolation('expired-initial'),
    'FAIL-010-expired-temporary': generateHierarchyViolation('expired-temporary'),
    
    // Failing tests - Expiry
    'FAIL-011-expired-commercial': generateExpiredCOC('Commercial'),
    'FAIL-012-expired-domestic': generateExpiredCOC('Domestic'),
    
    // Incomplete data
    'INCOMPLETE-001-missing-data': generateIncompleteData() as COCTestData
  };
}

/**
 * Get expected result for a test case
 */
export function getExpectedResult(testId: string): { status: 'Pass' | 'Fail' | 'Incomplete'; failedChecks?: string[] } {
  const expectations: Record<string, { status: 'Pass' | 'Fail' | 'Incomplete'; failedChecks?: string[] }> = {
    'PASS-001-initial-compliant': { status: 'Pass' },
    'PASS-002-supplementary-with-ref': { status: 'Pass' },
    'PASS-003-temporary-with-ref': { status: 'Pass' },
    'PASS-004-with-generator': { status: 'Pass' },
    'PASS-005-with-solar': { status: 'Pass' },
    'PASS-006-with-battery': { status: 'Pass' },
    'PASS-007-tt-system': { status: 'Pass' },
    
    'FAIL-001-earth-resistance': { status: 'Fail', failedChecks: ['EARTH-001'] },
    'FAIL-002-loop-impedance': { status: 'Fail', failedChecks: ['LOOP-001'] },
    'FAIL-003-insulation': { status: 'Fail', failedChecks: ['INSUL-001'] },
    'FAIL-004-rcd-trip': { status: 'Fail', failedChecks: ['RCD-001'] },
    'FAIL-005-polarity': { status: 'Fail', failedChecks: ['POL-001'] },
    'FAIL-006-continuity': { status: 'Fail', failedChecks: ['POL-001'] },
    'FAIL-007-conductor-size': { status: 'Fail', failedChecks: ['COND-001'] },
    
    'FAIL-008-missing-initial': { status: 'Fail', failedChecks: ['COC-SUPP-001', 'COC-VALID-001'] },
    'FAIL-009-expired-initial': { status: 'Fail', failedChecks: ['COC-VALID-001'] },
    'FAIL-010-expired-temporary': { status: 'Fail', failedChecks: ['COC-TEMP-001', 'COC-VALID-001'] },
    
    'FAIL-011-expired-commercial': { status: 'Fail', failedChecks: ['CERT-EXPIRY-001'] },
    'FAIL-012-expired-domestic': { status: 'Fail', failedChecks: ['CERT-EXPIRY-001'] },
    
    'INCOMPLETE-001-missing-data': { status: 'Incomplete' }
  };
  
  return expectations[testId] ?? { status: 'Pass' };
}

/**
 * Export all test utilities
 */
export const COCTestUtils = {
  generateCOCNumber,
  generateSAIDNumber,
  generateRegistrationNumber,
  formatDate,
  getRelativeDate,
  generatePassingCOC,
  generateFailingCOC,
  generateIncompleteData,
  generateHierarchyViolation,
  generateExpiredCOC,
  generateCOCWithSpecialConditions,
  validateEarthResistance,
  validateLoopImpedance,
  validateInsulationResistance,
  validateRCDTripTime,
  validateConductorSizing,
  isCOCExpired,
  generateTestSuite,
  getExpectedResult,
  ZS_MAX_VALUES,
  CABLE_SIZE_LIMITS,
  EARTH_RESISTANCE_LIMITS,
  RCD_TRIP_TIME_LIMITS
};

export default COCTestUtils;
