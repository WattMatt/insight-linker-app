/**
 * COC Validation Engine — Strict Empirical Rules
 * Rules defined in docs/COC_VALIDATION_SPEC.md
 * 
 * All pass/fail decisions are deterministic mathematical comparisons
 * against SANS 10142-1:2020/2024 thresholds. Generic text indicators
 * like "OK", "Pass", or checkmarks are legally void per OHS Act 85 of 1993.
 */

// ---------------------------------------------------------------------------
// Data Interfaces
// ---------------------------------------------------------------------------

export type CertificateType = 'initial' | 're-inspection' | 'alteration';

export type RegistrationCategory =
  | 'electrical_tester_single_phase'
  | 'installation_electrician'
  | 'master_installation_electrician';

export type InstallationType = 'residential' | 'commercial' | 'industrial';
export type PhaseConfiguration = 'single_phase' | 'three_phase';

export interface COCData {
  cocReferenceNumber: string;
  certificateType: CertificateType;
  installationAddress: string;
  registeredPersonName: string;
  registrationNumber: string;
  registrationCategory: RegistrationCategory;
  dateOfIssue: string; // ISO date
  installationType: InstallationType;
  phaseConfiguration: PhaseConfiguration;
  supplyVoltage: number; // V
  supplyFrequency: number; // Hz
}

export interface COCTestReport {
  // Empirical measurements — number | null, NEVER boolean/string
  insulationResistance_MOhm: number | null;
  earthLoopImpedance_Zs_Ohm: number | null;
  rcdTripTime_ms: number | null;
  rcdRatedCurrent_mA: number;
  pscc_kA: number | null;
  earthContinuity_Ohm: number | null;
  voltageAtMainDB_V: number | null;

  // Boolean state fields
  polarityCorrect: boolean;
  hasSignature: boolean;
  signatureDate: string | null;

  // SANS 10142-1:2024 renewable / protection
  hasSolarPV: boolean;
  hasBESS: boolean;
  solarGroundingVerified: boolean | null;
  inverterSyncVerified: boolean | null;
  bessFireProtection: boolean | null;
  spdOperational: boolean | null;
  afddInstalled: boolean | null;
}

// ---------------------------------------------------------------------------
// Validation Result Types
// ---------------------------------------------------------------------------

export type ValidationStatus = 'VALID' | 'INVALID' | 'REQUIRES_REVIEW';
export type RuleSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type FraudRiskScore = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ValidationRuleResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  severity: RuleSeverity;
  message: string;
  sansClause?: string;
}

export interface COCValidationResult {
  status: ValidationStatus;
  passedRules: ValidationRuleResult[];
  failedRules: ValidationRuleResult[];
  fraudRiskScore: FraudRiskScore;
  totalRulesChecked: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Generic-mark rejection helper
// ---------------------------------------------------------------------------

const GENERIC_MARKS = new Set([
  'ok', 'pass', 'passed', 'good', 'yes', 'compliant', 'satisfactory',
  'acceptable', 'done', 'checked', 'correct', 'fine',
]);

const CHECKMARK_CODEPOINTS = new Set([
  '\u2713', '\u2714', '\u2705', '\u2611', '\u2612', '\u2610',
]);

/**
 * Returns true if the value is a non-numeric "generic mark" that has no
 * empirical validity — checkmarks, "OK", "Pass", etc.
 * These are legally void per OHS Act 85 of 1993.
 */
export function isGenericMark(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number' && !isNaN(value)) return false;

  const str = String(value).trim();
  if (str.length === 0) return false;

  // Check unicode checkmarks
  if (CHECKMARK_CODEPOINTS.has(str)) return true;

  // Check known generic words
  if (GENERIC_MARKS.has(str.toLowerCase())) return true;

  // Allow infinity — valid insulation resistance reading (∞ MΩ = perfect insulation)
  const lower = str.toLowerCase();
  if (lower === 'infinity' || lower === '∞' || lower === 'inf' || str === '\u221E') return false;

  // If it's a string that cannot be parsed as a finite number, it's generic
  const num = Number(str);
  if (isNaN(num) || !isFinite(num)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Validation Engine
// ---------------------------------------------------------------------------

export function validateCOC(
  data: COCData,
  testReport: COCTestReport,
): COCValidationResult {
  const passed: ValidationRuleResult[] = [];
  const failed: ValidationRuleResult[] = [];

  const addResult = (result: ValidationRuleResult) => {
    (result.passed ? passed : failed).push(result);
  };

  // ── Rule 1: Incomplete Certificate ─────────────────────────────────────
  const mandatoryFields: Array<{ key: keyof COCTestReport; label: string }> = [
    { key: 'insulationResistance_MOhm', label: 'Insulation Resistance' },
    { key: 'earthLoopImpedance_Zs_Ohm', label: 'Earth Loop Impedance (Zs)' },
    { key: 'rcdTripTime_ms', label: 'RCD Trip Time' },
    { key: 'pscc_kA', label: 'Prospective Short-Circuit Current (PSCC)' },
  ];

  const missingFields = mandatoryFields.filter((f) => testReport[f.key] === null);
  const genericFields = mandatoryFields.filter(
    (f) => testReport[f.key] !== null && isGenericMark(testReport[f.key]),
  );

  if (missingFields.length > 0 || genericFields.length > 0) {
    const missingNames = [
      ...missingFields.map((f) => f.label),
      ...genericFields.map((f) => `${f.label} (generic mark rejected)`),
    ];
    addResult({
      ruleId: 'INCOMPLETE-001',
      ruleName: 'Incomplete Certificate',
      passed: false,
      severity: 'CRITICAL',
      message: `Incomplete Certificate — legally void per OHS Act 85 of 1993. Missing empirical data: ${missingNames.join(', ')}`,
      sansClause: 'OHS Act 85/1993',
    });
  } else {
    addResult({
      ruleId: 'INCOMPLETE-001',
      ruleName: 'Incomplete Certificate',
      passed: true,
      severity: 'INFO',
      message: 'All mandatory test measurements present',
      sansClause: 'OHS Act 85/1993',
    });
  }

  // ── Rule 2: Issuer Competency ──────────────────────────────────────────
  const issuerFail =
    data.phaseConfiguration === 'three_phase' &&
    data.registrationCategory === 'electrical_tester_single_phase';

  addResult({
    ruleId: 'ISSUER-001',
    ruleName: 'Issuer Competency',
    passed: !issuerFail,
    severity: 'CRITICAL',
    message: issuerFail
      ? 'Issuer not qualified for 3-phase installation (electrical_tester_single_phase cannot certify 3-phase)'
      : 'Issuer registration category matches installation phase configuration',
    sansClause: 'SANS 10142-1 Clause 4',
  });

  // ── Rule 3: Insulation Resistance ──────────────────────────────────────
  const ir = testReport.insulationResistance_MOhm;
  if (ir !== null && !isGenericMark(ir)) {
    const irPass = ir > 1.0;
    addResult({
      ruleId: 'INSUL-001',
      ruleName: 'Insulation Resistance',
      passed: irPass,
      severity: 'CRITICAL',
      message: irPass
        ? `Insulation resistance ${ir} MΩ exceeds minimum 1.0 MΩ threshold`
        : `Insulation resistance ${ir} MΩ is below minimum 1.0 MΩ threshold — CRITICAL FAIL`,
      sansClause: 'SANS 10142-1 Clause 8.5',
    });
  }

  // ── Rule 4: Earth Loop Impedance (Zs) ──────────────────────────────────
  const zs = testReport.earthLoopImpedance_Zs_Ohm;
  if (zs !== null && !isGenericMark(zs)) {
    const zsValid = zs > 0;
    const zsHigh = zs > 1.67;

    addResult({
      ruleId: 'LOOP-001',
      ruleName: 'Earth Loop Impedance (Zs)',
      passed: zsValid && !zsHigh,
      severity: zsHigh ? 'WARNING' : (zsValid ? 'INFO' : 'CRITICAL'),
      message: !zsValid
        ? `Earth loop impedance ${zs} Ω is invalid (must be > 0)`
        : zsHigh
          ? `Earth loop impedance ${zs} Ω exceeds 1.67 Ω — Type B MCB may not trip within 0.4s at 230V`
          : `Earth loop impedance ${zs} Ω is within acceptable range`,
      sansClause: 'SANS 10142-1 Clause 8.4',
    });
  }

  // ── Rule 5: RCD Trip Time ──────────────────────────────────────────────
  const rcd = testReport.rcdTripTime_ms;
  if (rcd !== null && !isGenericMark(rcd)) {
    const critFail = rcd > 300;
    const warn = rcd > 200 && rcd <= 300;

    addResult({
      ruleId: 'RCD-001',
      ruleName: 'RCD Trip Time',
      passed: !critFail,
      severity: critFail ? 'CRITICAL' : warn ? 'WARNING' : 'INFO',
      message: critFail
        ? `RCD trip time ${rcd} ms exceeds maximum 300 ms — CRITICAL FAIL`
        : warn
          ? `RCD trip time ${rcd} ms is above 200 ms advisory threshold (max 300 ms)`
          : `RCD trip time ${rcd} ms is within acceptable range (≤300 ms)`,
      sansClause: 'SANS 10142-1 Clause 8.8',
    });
  }

  // ── Rule 6: PSCC ───────────────────────────────────────────────────────
  const pscc = testReport.pscc_kA;
  if (pscc !== null && !isGenericMark(pscc)) {
    const psccValid = pscc > 0;
    const psccLow = pscc < 0.5;
    const psccHigh = pscc > 25;
    const needsReview = psccLow || psccHigh;

    addResult({
      ruleId: 'PSCC-001',
      ruleName: 'Prospective Short-Circuit Current',
      passed: psccValid && !needsReview,
      severity: !psccValid ? 'CRITICAL' : needsReview ? 'WARNING' : 'INFO',
      message: !psccValid
        ? `PSCC ${pscc} kA is invalid (must be > 0)`
        : psccLow
          ? `PSCC ${pscc} kA is unusually low (< 0.5 kA) — requires review`
          : psccHigh
            ? `PSCC ${pscc} kA is unusually high (> 25 kA) — verify breaker rating`
            : `PSCC ${pscc} kA is within normal range`,
      sansClause: 'SANS 10142-1 Clause 8.6',
    });
  }

  // ── Rule 7: Signature ─────────────────────────────────────────────────
  const sigFail = !testReport.hasSignature || testReport.signatureDate === null;
  addResult({
    ruleId: 'SIG-001',
    ruleName: 'Signature Verification',
    passed: !sigFail,
    severity: 'CRITICAL',
    message: sigFail
      ? 'Missing legally required signature or signature date'
      : 'Signature and date present',
    sansClause: 'OHS Act 85/1993',
  });

  // ── Rule 8: Solar / BESS (SANS 10142-1:2024) ──────────────────────────
  if (testReport.hasSolarPV) {
    const solarFail =
      testReport.solarGroundingVerified !== true ||
      testReport.inverterSyncVerified !== true;
    addResult({
      ruleId: 'SOLAR-001',
      ruleName: 'Solar PV Compliance',
      passed: !solarFail,
      severity: 'CRITICAL',
      message: solarFail
        ? 'Solar PV installed but grounding/inverter sync verification incomplete'
        : 'Solar PV grounding and inverter sync verified',
      sansClause: 'SANS 10142-1:2024',
    });
  }

  if (testReport.hasBESS) {
    const bessFail = testReport.bessFireProtection !== true;
    addResult({
      ruleId: 'BESS-001',
      ruleName: 'BESS Fire Protection',
      passed: !bessFail,
      severity: 'CRITICAL',
      message: bessFail
        ? 'BESS installed but fire protection not verified'
        : 'BESS fire protection verified',
      sansClause: 'SANS 10142-1:2024',
    });
  }

  // ── Rule 9: SPD ────────────────────────────────────────────────────────
  const spdFail = testReport.spdOperational !== true;
  addResult({
    ruleId: 'SPD-001',
    ruleName: 'Surge Protection Device',
    passed: !spdFail,
    severity: 'CRITICAL',
    message: spdFail
      ? 'SPD not operational — mandatory per SANS 10142-1:2024'
      : 'Surge protection device operational',
    sansClause: 'SANS 10142-1:2024',
  });

  // ── Rule 10: Fraud Risk Scoring ────────────────────────────────────────
  const fraudRiskScore = computeFraudRisk(testReport);

  // ── Compute overall status ─────────────────────────────────────────────
  const hasCriticalFail = failed.some((r) => r.severity === 'CRITICAL');
  const hasWarning = failed.some((r) => r.severity === 'WARNING');

  let status: ValidationStatus = 'VALID';
  if (hasCriticalFail) {
    status = 'INVALID';
  } else if (hasWarning || fraudRiskScore !== 'LOW') {
    status = 'REQUIRES_REVIEW';
  }

  return {
    status,
    passedRules: passed,
    failedRules: failed,
    fraudRiskScore,
    totalRulesChecked: passed.length + failed.length,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Fraud Risk Computation
// ---------------------------------------------------------------------------

function computeFraudRisk(report: COCTestReport): FraudRiskScore {
  const empiricalValues = [
    report.insulationResistance_MOhm,
    report.earthLoopImpedance_Zs_Ohm,
    report.rcdTripTime_ms,
    report.pscc_kA,
  ];

  const nullCount = empiricalValues.filter((v) => v === null).length;
  const presentValues = empiricalValues.filter((v): v is number => v !== null);

  // HIGH: missing signature + missing test values
  if (!report.hasSignature && nullCount > 0) return 'HIGH';

  // HIGH: all present values are suspiciously identical
  if (presentValues.length >= 3) {
    const allIdentical = presentValues.every((v) => v === presentValues[0]);
    if (allIdentical) return 'HIGH';
  }

  // MEDIUM: any single mandatory field missing
  if (nullCount > 0) return 'MEDIUM';

  // MEDIUM: values sit at exact threshold boundaries
  if (presentValues.length > 0) {
    const atBoundary =
      report.insulationResistance_MOhm === 1.0 ||
      report.rcdTripTime_ms === 300 ||
      report.earthLoopImpedance_Zs_Ohm === 1.67;
    if (atBoundary) return 'MEDIUM';
  }

  return 'LOW';
}
