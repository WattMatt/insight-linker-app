import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

// COC validation edge function - validates electrical certificates against SANS 10142-1:2020
// Rules defined in docs/COC_VALIDATION_SPEC.md
// Prompt defined in supabase/functions/validate-coc/prompt.ts

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { VALIDATION_PROMPT, ValidationSettings, DEFAULT_SETTINGS, buildDynamicPrompt } from "./prompt.ts";

// ============= DETERMINISTIC VALIDATION ENGINE =============
// This runs AFTER the AI extraction to apply mathematical rules server-side.
// The AI is treated as an extractor only; pass/fail decisions are made here.

// Text-based pass values commonly written on South African COC forms
// IMPORTANT: These are acceptable for non-empirical checks (POL-001, SIG-001, EARTH-001).
// For empirical measurement fields (INSUL-001, RCD-001, LOOP-001, PSCC-001),
// text-based values are LEGALLY INSUFFICIENT — numeric measurements are required.
const TEXT_PASS_VALUES = [
  'compliant', 'pass', 'passed', 'satisfactory', 'ok', 'good', 'acceptable',
  'correct', 'verified', 'confirmed', 'yes', 'tick', 'ticked', '✓', '✔',
  'within limits', 'within range', 'safe', 'adequate'
];

// Earth Loop Impedance Zs lookup table — Type B MCB at 0.4s disconnection (SANS 10142-1)
const ZS_LOOKUP_TYPE_B: Record<number, number> = {
  6: 7.67,
  10: 4.60,
  16: 2.87,
  20: 2.30,
  25: 1.84,
  32: 1.44,
  40: 1.15,
  50: 0.92,
  63: 0.73,
};

// Type C = Type B × 0.5, Type D = Type B × 0.25
function getMaxZs(mcbRating: number, mcbType: string = 'B'): number | null {
  const baseZs = ZS_LOOKUP_TYPE_B[mcbRating];
  if (!baseZs) return null;
  const typeUpper = mcbType.toUpperCase();
  if (typeUpper === 'C') return baseZs * 0.5;
  if (typeUpper === 'D') return baseZs * 0.25;
  return baseZs; // Default Type B
}

function parseNumericValue(value: string | undefined | null): number | null | 'N/A' | 'TEXT_PASS' {
  if (!value) return null;
  const str = value.toString().trim().toLowerCase();
  
  // Not Applicable values - valid when test doesn't apply to this installation
  if (['n/a', 'not applicable', 'na', 'n.a.', 'n.a', 'not required', 'not tested'].some(v => str.includes(v))) {
    return 'N/A';
  }
  
  // Text-based pass values (common on SA COC forms)
  if (TEXT_PASS_VALUES.some(v => str.includes(v))) {
    return 'TEXT_PASS';
  }
  
  // Infinity values (always pass for insulation resistance)
  if (['∞', '>∞', 'ol', '>500', '>999', '>500mω', 'infinite', 'over limit', '>500mohm'].some(v => str.includes(v))) {
    return Infinity;
  }
  
  // Extract numeric value, ignoring units — handle SA comma-as-decimal notation
  const cleaned = str.replace(/,/g, '.'); // "1,5" → "1.5"
  const match = cleaned.match(/([\d]+\.?\d*)/);
  return match ? parseFloat(match[1]) : null;
}

interface DeterministicCheckResult {
  checkId: string;
  result: 'Pass' | 'Fail' | 'Not Tested' | 'Not Applicable' | 'Skipped';
  measuredValue: string;
  limit: string;
  remediation: string;
  overrideReason?: string;
}

function applyDeterministicValidation(
  aiResult: any, 
  settings: ValidationSettings
): { checks: DeterministicCheckResult[]; overallStatus: string; criticalFailures: any[] } {
  
  const deterministicChecks: DeterministicCheckResult[] = [];
  const criticalFailures: any[] = [];
  let hasSafetyCriticalFail = false;
  let mandatoryFailCount = 0;
  
  const aiChecks: any[] = aiResult.checks || [];
  const cocType = (aiResult.cocType || '').toLowerCase();
  
  console.log('=== DETERMINISTIC VALIDATION ENGINE ===');
  console.log('COC Type:', cocType);

  // --- 1. COC TYPE CHECKBOX ---
  if (settings.hierarchy_check_enabled) {
    const typeCheck = aiChecks.find((c: any) => c.checkId === 'COC-TYPE-001');
    const isMarked = aiResult.cocTypeMarked !== false && 
                     aiResult.cocType && 
                     !['not marked', 'unknown', 'null'].includes(cocType);
    
    deterministicChecks.push({
      checkId: 'COC-TYPE-001',
      result: isMarked ? 'Pass' : 'Fail',
      measuredValue: isMarked ? `Marked: ${aiResult.cocType}` : 'Not marked',
      limit: 'One checkbox must be marked',
      remediation: isMarked ? '' : 'Certificate type checkbox must be ticked by the issuer.'
    });
    if (!isMarked) {
      hasSafetyCriticalFail = true;
      criticalFailures.push({
        category: 'Administrative',
        clause: 'COC-TYPE-001',
        description: 'COC type checkbox not marked',
        reason: 'No certificate type checkbox (Initial/Supplementary/Temporary) is ticked on this certificate.',
        immediateAction: 'The issuer must mark exactly one certificate type.',
        riskLevel: 'Critical'
      });
    }
  }

  // --- 2. HIERARCHY VALIDATION (only for Supplementary/Temporary) ---
  if (settings.hierarchy_check_enabled) {
    if (cocType === 'initial') {
      // Initial COCs don't need a reference — always pass hierarchy
      deterministicChecks.push({
        checkId: 'COC-SUPP-001', result: 'Not Applicable',
        measuredValue: 'N/A — Initial COC', limit: 'N/A', remediation: ''
      });
      deterministicChecks.push({
        checkId: 'COC-TEMP-001', result: 'Not Applicable',
        measuredValue: 'N/A — Initial COC', limit: 'N/A', remediation: ''
      });
    } else if (cocType === 'supplementary') {
      const hasRef = !!aiResult.initialCocReference;
      deterministicChecks.push({
        checkId: 'COC-SUPP-001',
        result: hasRef ? 'Pass' : 'Fail',
        measuredValue: hasRef ? `Ref: ${aiResult.initialCocReference}` : 'No reference provided',
        limit: 'Must reference Initial COC number',
        remediation: hasRef ? '' : 'Supplementary COC must list the Initial COC reference number.'
      });
      if (!hasRef && settings.auto_fail_missing_initial_ref) {
        hasSafetyCriticalFail = true;
        criticalFailures.push({
          category: 'Administrative',
          clause: 'COC-SUPP-001',
          description: 'Supplementary COC missing Initial COC reference',
          reason: 'This Supplementary COC does not reference an Initial COC number, making it invalid.',
          immediateAction: 'Obtain and reference the valid Initial COC number.',
          riskLevel: 'Critical'
        });
      }
    } else if (cocType === 'temporary') {
      const hasRef = !!aiResult.initialCocReference;
      deterministicChecks.push({
        checkId: 'COC-TEMP-001',
        result: hasRef ? 'Pass' : 'Fail',
        measuredValue: hasRef ? `Ref: ${aiResult.initialCocReference}` : 'No reference provided',
        limit: 'Must reference Initial COC number',
        remediation: hasRef ? '' : 'Temporary COC must list the Initial COC reference number.'
      });
      if (!hasRef && settings.auto_fail_missing_initial_ref) {
        hasSafetyCriticalFail = true;
        criticalFailures.push({
          category: 'Administrative',
          clause: 'COC-TEMP-001',
          description: 'Temporary COC missing Initial COC reference',
          reason: 'This Temporary COC does not reference an Initial COC number.',
          immediateAction: 'Obtain and reference the valid Initial COC number.',
          riskLevel: 'Critical'
        });
      }
    }
  }

  // --- 3. EARTH RESISTANCE (Clause 8.4) ---
  if (settings.earth_continuity_check_enabled) {
    const earthCheck = aiChecks.find((c: any) => c.checkId === 'EARTH-001');
    if (earthCheck) {
      const measured = parseNumericValue(earthCheck.measuredValue);
      const limit = settings.earth_continuity_max_ohms;
      
      if (measured === 'N/A') {
        deterministicChecks.push({
          checkId: 'EARTH-001', result: 'Not Applicable',
          measuredValue: earthCheck.measuredValue || 'N/A',
          limit: `≤ ${limit}Ω`,
          remediation: '',
          overrideReason: 'Test marked as Not Applicable for this installation'
        });
      } else if (measured === 'TEXT_PASS') {
        // Earth resistance: Accept text-based pass values (e.g. "Compliant", "Pass")
        // Common practice on SA COC forms and accepted by regulatory bodies
        deterministicChecks.push({
          checkId: 'EARTH-001', result: 'Pass',
          measuredValue: earthCheck.measuredValue,
          limit: `≤ ${limit}Ω`,
          remediation: '',
          overrideReason: 'Accepted: Text-based pass value for earth resistance'
        });
      } else if (measured === null) {
        deterministicChecks.push({
          checkId: 'EARTH-001', result: 'Fail',
          measuredValue: earthCheck.measuredValue || 'Not recorded',
          limit: `≤ ${limit}Ω`,
          remediation: 'Earth resistance value must be recorded.',
          overrideReason: 'No numeric or text-pass value found'
        });
        mandatoryFailCount++;
      } else {
        const pass = measured <= limit;
        deterministicChecks.push({
          checkId: 'EARTH-001', result: pass ? 'Pass' : 'Fail',
          measuredValue: `${measured}Ω`,
          limit: `≤ ${limit}Ω`,
          remediation: pass ? '' : `Measured ${measured}Ω exceeds maximum ${limit}Ω. Install additional earth electrodes.`,
          overrideReason: earthCheck.result !== (pass ? 'Pass' : 'Fail') ? `Server override: ${measured}Ω vs ${limit}Ω limit` : undefined
        });
        if (!pass) {
          hasSafetyCriticalFail = true;
          criticalFailures.push({
            category: 'Safety-Critical', clause: 'EARTH-001',
            description: `Earth resistance ${measured}Ω exceeds ${limit}Ω limit`,
            reason: `SANS 10142-1 Clause 8.4: Measured ${measured}Ω > maximum ${limit}Ω`,
            immediateAction: 'Install additional earth electrodes and verify bonding.',
            riskLevel: 'Critical'
          });
        }
      }
    }
  } else {
    deterministicChecks.push({
      checkId: 'EARTH-001', result: 'Skipped',
      measuredValue: 'Check disabled', limit: 'N/A', remediation: ''
    });
  }

  // --- 4. INSULATION RESISTANCE (Clause 8.6) ---
  if (settings.insulation_resistance_check_enabled) {
    const insulChecks = aiChecks.filter((c: any) => 
      c.checkId === 'INSUL-001' || (c.clause === '8.6' && c.description?.toLowerCase().includes('insulation'))
    );
    
    for (const check of insulChecks) {
      const measured = parseNumericValue(check.measuredValue);
      const limit = settings.insulation_resistance_min_mohms;
      
      if (measured === 'N/A') {
        deterministicChecks.push({
          checkId: 'INSUL-001', result: 'Not Applicable',
          measuredValue: check.measuredValue || 'N/A',
          limit: `≥ ${limit}MΩ`,
          remediation: '',
          overrideReason: 'Test marked as Not Applicable for this installation'
        });
      } else if (measured === 'TEXT_PASS') {
        // STRICT: Empirical measurement REQUIRED for insulation resistance
        deterministicChecks.push({
          checkId: 'INSUL-001', result: 'Fail',
          measuredValue: check.measuredValue,
          limit: `≥ ${limit}MΩ`,
          remediation: 'Empirical measurement required — generic text like "OK" or "Pass" is not legally acceptable for insulation resistance. A numeric value in MΩ or ∞/OL must be recorded.',
          overrideReason: 'FAIL: Text-based value rejected — SANS 10142-1 requires empirical measurement in MΩ'
        });
        mandatoryFailCount++;
        criticalFailures.push({
          category: 'Safety-Critical', clause: 'INSUL-001',
          description: `Insulation resistance recorded as "${check.measuredValue}" — empirical measurement required`,
          reason: `SANS 10142-1 Clause 8.6 requires a numeric insulation resistance value in MΩ. "${check.measuredValue}" is not a valid measurement.`,
          immediateAction: 'Re-test insulation resistance and record the actual measured value in MΩ.',
          riskLevel: 'Critical'
        });
      } else if (measured === Infinity) {
        deterministicChecks.push({
          checkId: 'INSUL-001', result: 'Pass',
          measuredValue: check.measuredValue || '∞ MΩ',
          limit: `≥ ${limit}MΩ`,
          remediation: '',
          overrideReason: check.result !== 'Pass' ? 'Server override: ∞ reading = automatic pass' : undefined
        });
      } else if (measured === null) {
        // Check if the AI description mentions "blank" but the value might actually be ∞
        const desc = (check.description || '').toLowerCase();
        const mv = (check.measuredValue || '').toLowerCase();
        const mightBeInfinity = desc.includes('blank') || desc.includes('empty') || mv.includes('blank') || mv.includes('empty');
        
        // If the AI says blank but this is a common misread of ∞, treat as informational only
        if (mightBeInfinity) {
          deterministicChecks.push({
            checkId: 'INSUL-001', result: 'Not Tested',
            measuredValue: check.measuredValue || 'Possibly ∞ (AI reported blank)',
            limit: `≥ ${limit}MΩ`,
            remediation: 'AI may have misread an infinity symbol (∞) as a blank field. Manual verification recommended.',
            overrideReason: 'Downgraded from Fail: common AI misread of ∞ symbol'
          });
        } else {
          deterministicChecks.push({
            checkId: 'INSUL-001', result: 'Fail',
            measuredValue: check.measuredValue || 'Not recorded',
            limit: `≥ ${limit}MΩ`,
            remediation: 'Insulation resistance must be recorded with a numeric measurement.'
          });
          mandatoryFailCount++;
        }
      } else {
        const pass = measured >= limit;
        deterministicChecks.push({
          checkId: 'INSUL-001', result: pass ? 'Pass' : 'Fail',
          measuredValue: `${measured}MΩ`,
          limit: `≥ ${limit}MΩ`,
          remediation: pass ? '' : `Measured ${measured}MΩ below minimum ${limit}MΩ. Check for cable damage or moisture.`,
          overrideReason: check.result !== (pass ? 'Pass' : 'Fail') ? `Server override: ${measured}MΩ vs ${limit}MΩ minimum` : undefined
        });
        if (!pass) {
          hasSafetyCriticalFail = true;
          criticalFailures.push({
            category: 'Safety-Critical', clause: 'INSUL-001',
            description: `Insulation resistance ${measured}MΩ below ${limit}MΩ minimum`,
            reason: `SANS 10142-1 Clause 8.6: Measured ${measured}MΩ < minimum ${limit}MΩ — insulation breakdown risk`,
            immediateAction: 'Identify and replace damaged cable insulation. Check for moisture ingress.',
            riskLevel: 'Critical'
          });
        }
      }
    }
    // If AI didn't extract any insulation checks
    if (insulChecks.length === 0) {
      deterministicChecks.push({
        checkId: 'INSUL-001', result: 'Not Tested',
        measuredValue: 'No insulation resistance data extracted',
        limit: `≥ ${settings.insulation_resistance_min_mohms}MΩ`,
        remediation: 'Insulation resistance test results not found in document.'
      });
    }
  } else {
    deterministicChecks.push({
      checkId: 'INSUL-001', result: 'Skipped',
      measuredValue: 'Check disabled', limit: 'N/A', remediation: ''
    });
  }

  // --- 5. RCD TRIP TIMES (Clause 8.8) ---
  if (settings.rcd_function_check_enabled) {
    const rcdChecks = aiChecks.filter((c: any) => 
      c.checkId === 'RCD-001' || (c.clause === '8.8' && c.description?.toLowerCase().includes('rcd'))
    );
    
    for (const check of rcdChecks) {
      const measured = parseNumericValue(check.measuredValue);
      
      // Determine which limit to apply based on test multiplier
      const desc = (check.measuredValue || '').toLowerCase();
      let limit: number;
      let limitLabel: string;
      if (desc.includes('5×') || desc.includes('5x') || desc.includes('@5')) {
        limit = settings.rcd_trip_5x_max_ms;
        limitLabel = `≤ ${limit}ms @5×IΔn`;
      } else if (desc.includes('2×') || desc.includes('2x') || desc.includes('@2')) {
        limit = settings.rcd_trip_max_ms;
        limitLabel = `≤ ${limit}ms @2×IΔn`;
      } else {
        limit = settings.rcd_trip_1x_max_ms;
        limitLabel = `≤ ${limit}ms @1×IΔn`;
      }
      
      if (measured === 'N/A') {
        deterministicChecks.push({
          checkId: 'RCD-001', result: 'Not Applicable',
          measuredValue: check.measuredValue || 'N/A',
          limit: limitLabel,
          remediation: ''
        });
      } else if (measured === 'TEXT_PASS') {
        // STRICT: Empirical measurement REQUIRED for RCD trip times
        deterministicChecks.push({
          checkId: 'RCD-001', result: 'Fail',
          measuredValue: check.measuredValue,
          limit: limitLabel,
          remediation: 'Empirical measurement required — generic text like "OK" or "Pass" is not legally acceptable for RCD trip times. A numeric value in ms must be recorded.',
          overrideReason: 'FAIL: Text-based value rejected — SANS 10142-1 requires empirical measurement in ms'
        });
        mandatoryFailCount++;
        criticalFailures.push({
          category: 'Safety-Critical', clause: 'RCD-001',
          description: `RCD trip time recorded as "${check.measuredValue}" — empirical measurement required`,
          reason: `SANS 10142-1 Clause 8.8 requires a numeric RCD trip time in ms. "${check.measuredValue}" is not a valid measurement.`,
          immediateAction: 'Re-test RCD and record the actual trip time in ms.',
          riskLevel: 'Critical'
        });
      } else if (typeof measured === 'number' && measured !== Infinity) {
        const pass = measured <= limit;
        deterministicChecks.push({
          checkId: 'RCD-001', result: pass ? 'Pass' : 'Fail',
          measuredValue: `${measured}ms`,
          limit: limitLabel,
          remediation: pass ? '' : `RCD trip time ${measured}ms exceeds ${limit}ms. Replace or service RCD.`,
          overrideReason: check.result !== (pass ? 'Pass' : 'Fail') ? `Server override: ${measured}ms vs ${limit}ms` : undefined
        });
        if (!pass) {
          hasSafetyCriticalFail = true;
          criticalFailures.push({
            category: 'Safety-Critical', clause: 'RCD-001',
            description: `RCD trip time ${measured}ms exceeds ${limit}ms limit`,
            reason: `SANS 10142-1 Clause 8.8: Measured ${measured}ms > maximum ${limit}ms`,
            immediateAction: 'Replace or service the RCD immediately.',
            riskLevel: 'Critical'
          });
        }
      } else {
        // Preserve AI result for non-numeric RCD checks (e.g., "Trip" or "No Trip")
        deterministicChecks.push({
          checkId: 'RCD-001',
          result: check.result || 'Not Tested',
          measuredValue: check.measuredValue || 'Not recorded',
          limit: limitLabel,
          remediation: check.remediation || ''
        });
      }
    }
  } else {
    deterministicChecks.push({
      checkId: 'RCD-001', result: 'Skipped',
      measuredValue: 'Check disabled', limit: 'N/A', remediation: ''
    });
  }

  // --- 6. POLARITY & CONTINUITY (Clause 8.7) ---
  if (settings.protective_conductor_check_enabled) {
    const polCheck = aiChecks.find((c: any) => c.checkId === 'POL-001');
    if (polCheck) {
      // For polarity, trust AI extraction (it's text-based, not numeric threshold)
      deterministicChecks.push({
        checkId: 'POL-001',
        result: polCheck.result || 'Not Tested',
        measuredValue: polCheck.measuredValue || 'Not recorded',
        limit: polCheck.limit || 'Correct polarity, continuity ≤ 1Ω',
        remediation: polCheck.remediation || ''
      });
      if (polCheck.result === 'Fail') mandatoryFailCount++;
    }
  } else {
    deterministicChecks.push({
      checkId: 'POL-001', result: 'Skipped',
      measuredValue: 'Check disabled', limit: 'N/A', remediation: ''
    });
  }

  // --- 7. CERTIFICATE DATE VALIDATION ---
  if (settings.certificate_date_validation_enabled && settings.auto_fail_future_dated && aiResult.cocIssueDate) {
    const issueDate = new Date(aiResult.cocIssueDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today for generous comparison
    
    if (issueDate > today) {
      deterministicChecks.push({
        checkId: 'CERT-DATE-001', result: 'Fail',
        measuredValue: `Issue date: ${aiResult.cocIssueDate}`,
        limit: `Must not be after ${today.toISOString().split('T')[0]}`,
        remediation: 'Certificate issue date is in the future. Verify with the issuer.'
      });
      criticalFailures.push({
        category: 'Administrative', clause: 'CERT-DATE-001',
        description: 'Future-dated certificate',
        reason: `Certificate issue date (${aiResult.cocIssueDate}) is after today's date.`,
        immediateAction: 'Verify the certificate date with the issuer.',
        riskLevel: 'Critical'
      });
      mandatoryFailCount++;
    } else {
      deterministicChecks.push({
        checkId: 'CERT-DATE-001', result: 'Pass',
        measuredValue: `Issue date: ${aiResult.cocIssueDate}`,
        limit: `Not future-dated`,
        remediation: ''
      });
    }
  }

  // --- 8. SIGNATURE CHECK ---
  // Signatures are hard for AI to assess accurately. Only fail if the AI explicitly
  // confirms the signature block is completely blank/empty. Any mark = pass.
  if (settings.signature_check_enabled) {
    const sigCheck = aiChecks.find((c: any) => 
      c.checkId === 'SIG-001' || c.checkId === 'DOC-001' || c.description?.toLowerCase().includes('signature')
    );
    
    // Only fail if AI says Fail AND the measured value explicitly says blank/empty/missing
    const measuredVal = (sigCheck?.measuredValue || '').toLowerCase();
    const isExplicitlyBlank = measuredVal.includes('blank') || measuredVal.includes('empty') || 
      measuredVal.includes('no signature') || measuredVal.includes('missing') || 
      measuredVal.includes('not signed') || measuredVal.includes('unsigned');
    
    if (sigCheck?.result === 'Fail' && isExplicitlyBlank && settings.auto_fail_missing_signature) {
      deterministicChecks.push({
        checkId: 'SIG-001', result: 'Fail',
        measuredValue: sigCheck.measuredValue || 'Missing signature',
        limit: 'Registered person must sign',
        remediation: 'Certificate must be signed by the registered person.'
      });
      criticalFailures.push({
        category: 'Administrative', clause: 'SIG-001',
        description: 'Missing signature on certificate',
        reason: 'Signature block area is completely blank/empty.',
        immediateAction: 'Have the registered person sign the certificate.',
        riskLevel: 'High'
      });
      mandatoryFailCount++;
    } else {
      // Default to pass - any mark in signature area counts
      deterministicChecks.push({
        checkId: 'SIG-001',
        result: 'Pass',
        measuredValue: sigCheck?.measuredValue || 'Signature present',
        limit: 'Registered person must sign',
        remediation: ''
      });
    }
  }

  // --- 9. EARTH LOOP IMPEDANCE (Clause 8.5) — LOOP-001 ---
  {
    const loopChecks = aiChecks.filter((c: any) => 
      c.checkId === 'LOOP-001' || (c.clause === '8.5' && c.description?.toLowerCase().includes('loop'))
    );
    
    for (const check of loopChecks) {
      const measured = parseNumericValue(check.measuredValue);
      
      if (measured === 'N/A') {
        deterministicChecks.push({
          checkId: 'LOOP-001', result: 'Not Applicable',
          measuredValue: check.measuredValue || 'N/A',
          limit: 'Per MCB rating',
          remediation: '',
          overrideReason: 'Test marked as Not Applicable for this installation'
        });
      } else if (measured === 'TEXT_PASS') {
        // STRICT: Empirical measurement REQUIRED for earth loop impedance
        deterministicChecks.push({
          checkId: 'LOOP-001', result: 'Fail',
          measuredValue: check.measuredValue,
          limit: 'Numeric Zs value required',
          remediation: 'Empirical measurement required — generic text like "OK" or "Pass" is not legally acceptable for earth loop impedance. A numeric Zs value in Ω must be recorded.',
          overrideReason: 'FAIL: Text-based value rejected — SANS 10142-1 requires empirical Zs measurement in Ω'
        });
        mandatoryFailCount++;
        criticalFailures.push({
          category: 'Safety-Critical', clause: 'LOOP-001',
          description: `Earth loop impedance recorded as "${check.measuredValue}" — empirical measurement required`,
          reason: `SANS 10142-1 Clause 8.5 requires a numeric earth loop impedance (Zs) value in Ω. "${check.measuredValue}" is not a valid measurement.`,
          immediateAction: 'Re-test earth loop impedance and record the actual measured Zs value in Ω.',
          riskLevel: 'Critical'
        });
      } else if (typeof measured === 'number') {
        // Try to find MCB rating from the check or circuit schedule
        const mcbMatch = (check.limit || check.measuredValue || '').match(/(\d+)\s*[aA]/);
        const mcbRating = mcbMatch ? parseInt(mcbMatch[1]) : null;
        const mcbTypeMatch = (check.limit || check.measuredValue || '').match(/type\s*([BbCcDd])/i);
        const mcbType = mcbTypeMatch ? mcbTypeMatch[1].toUpperCase() : 'B';
        
        if (mcbRating) {
          const maxZs = getMaxZs(mcbRating, mcbType);
          if (maxZs) {
            const pass = measured <= maxZs;
            deterministicChecks.push({
              checkId: 'LOOP-001', result: pass ? 'Pass' : 'Fail',
              measuredValue: `${measured}Ω`,
              limit: `≤ ${maxZs}Ω (${mcbRating}A Type ${mcbType})`,
              remediation: pass ? '' : `Measured Zs ${measured}Ω exceeds ${maxZs}Ω for ${mcbRating}A Type ${mcbType} MCB. Automatic disconnection within 0.4s not guaranteed.`,
              overrideReason: check.result !== (pass ? 'Pass' : 'Fail') ? `Server override: ${measured}Ω vs ${maxZs}Ω limit` : undefined
            });
            if (!pass) {
              hasSafetyCriticalFail = true;
              criticalFailures.push({
                category: 'Safety-Critical', clause: 'LOOP-001',
                description: `Earth loop impedance ${measured}Ω exceeds ${maxZs}Ω for ${mcbRating}A Type ${mcbType} MCB`,
                reason: `SANS 10142-1 Clause 8.5: Zs ${measured}Ω > max ${maxZs}Ω — automatic disconnection not guaranteed`,
                immediateAction: 'Investigate high loop impedance. Check cable runs, connections, and earth path.',
                riskLevel: 'Critical'
              });
            }
          } else {
            // MCB rating not in lookup table — pass through AI result
            deterministicChecks.push({
              checkId: 'LOOP-001',
              result: check.result || 'Not Tested',
              measuredValue: `${measured}Ω`,
              limit: check.limit || `MCB ${mcbRating}A not in Zs lookup table`,
              remediation: check.remediation || ''
            });
          }
        } else {
          // No MCB rating found — record the value, pass through AI result
          deterministicChecks.push({
            checkId: 'LOOP-001',
            result: check.result || 'Not Tested',
            measuredValue: `${measured}Ω`,
            limit: check.limit || 'MCB rating not extracted — manual review needed',
            remediation: check.remediation || ''
          });
        }
      } else {
        deterministicChecks.push({
          checkId: 'LOOP-001',
          result: check.result || 'Not Tested',
          measuredValue: check.measuredValue || 'Not recorded',
          limit: check.limit || 'Per MCB rating',
          remediation: check.remediation || ''
        });
      }
    }
    // If AI didn't extract any loop impedance checks
    if (loopChecks.length === 0) {
      deterministicChecks.push({
        checkId: 'LOOP-001', result: 'Not Tested',
        measuredValue: 'No earth loop impedance data extracted',
        limit: 'Per MCB rating (Zs lookup table)',
        remediation: 'Earth loop impedance test results not found in document.'
      });
    }
  }

  // --- 10. ISSUER COMPETENCY CHECK — REG-001 ---
  {
    const adminDetails = aiResult.administrativeDetails || {};
    const regType = (adminDetails.registrationType || '').toLowerCase();
    const supplyPhases = (adminDetails.supplyPhases || '').toLowerCase();
    
    if (regType && supplyPhases) {
      const isSinglePhaseTester = regType.includes('single phase') || regType === 'ets';
      const isThreePhaseInstall = supplyPhases.includes('three') || supplyPhases === '3';
      
      if (isSinglePhaseTester && isThreePhaseInstall) {
        deterministicChecks.push({
          checkId: 'REG-001', result: 'Fail',
          measuredValue: `Issuer: ${adminDetails.registrationType}, Supply: ${adminDetails.supplyPhases}`,
          limit: 'Issuer registration must match installation type',
          remediation: 'An Electrical Tester for Single Phase cannot sign off a Three Phase installation. An IE or MIE is required.',
          overrideReason: 'Issuer competency mismatch — Single Phase tester on Three Phase installation'
        });
        mandatoryFailCount++;
        criticalFailures.push({
          category: 'Administrative', clause: 'REG-001',
          description: 'Issuer registration category insufficient for this installation',
          reason: `Issuer registered as "${adminDetails.registrationType}" but installation is ${adminDetails.supplyPhases} phase. An IE or MIE registration is required for Three Phase installations.`,
          immediateAction: 'Certificate must be re-issued by a person with appropriate registration (IE or MIE).',
          riskLevel: 'Critical'
        });
      } else {
        deterministicChecks.push({
          checkId: 'REG-001', result: 'Pass',
          measuredValue: `Issuer: ${adminDetails.registrationType || 'Not specified'}, Supply: ${adminDetails.supplyPhases || 'Not specified'}`,
          limit: 'Issuer registration must match installation type',
          remediation: ''
        });
      }
    } else {
      deterministicChecks.push({
        checkId: 'REG-001', result: 'Not Tested',
        measuredValue: `Issuer type: ${adminDetails.registrationType || 'Not extracted'}, Supply: ${adminDetails.supplyPhases || 'Not extracted'}`,
        limit: 'Issuer registration must match installation type',
        remediation: 'Could not verify issuer competency — registration type or supply phases not extracted from document.'
      });
    }
  }

  // --- 11. PROSPECTIVE SHORT-CIRCUIT CURRENT — PSCC-001 ---
  {
    const psccChecks = aiChecks.filter((c: any) => 
      c.checkId === 'PSCC-001' || 
      (c.description?.toLowerCase().includes('prospective') || c.description?.toLowerCase().includes('pscc') ||
       (c.description?.toLowerCase().includes('short-circuit') && c.description?.toLowerCase().includes('current')) ||
       (c.description?.toLowerCase().includes('short circuit') && c.description?.toLowerCase().includes('current')))
    );
    
    if (psccChecks.length > 0) {
      const check = psccChecks[0];
      const measured = parseNumericValue(check.measuredValue || '');
      
      if (measured === 'N/A') {
        deterministicChecks.push({
          checkId: 'PSCC-001', result: 'Not Applicable',
          measuredValue: check.measuredValue || 'N/A',
          limit: 'PSCC must be less than breaker breaking capacity',
          remediation: ''
        });
      } else if (measured === 'TEXT_PASS') {
        // STRICT: Empirical measurement REQUIRED for PSCC
        deterministicChecks.push({
          checkId: 'PSCC-001', result: 'Fail',
          measuredValue: check.measuredValue,
          limit: 'Numeric kA value required',
          remediation: 'Empirical measurement required — generic text like "OK" or "Pass" is not legally acceptable for prospective short-circuit current.',
          overrideReason: 'FAIL: Text-based value rejected for empirical PSCC measurement'
        });
        mandatoryFailCount++;
        criticalFailures.push({
          category: 'Safety-Critical', clause: 'PSCC-001',
          description: `PSCC recorded as "${check.measuredValue}" — empirical kA measurement required`,
          reason: `SANS 10142-1 Clause 8.3 requires a numeric prospective short-circuit current value in kA.`,
          immediateAction: 'Measure and record the actual PSCC value in kA at the point of supply.',
          riskLevel: 'High'
        });
      } else if (typeof measured === 'number') {
        // Extract breaker breaking capacity from AI data
        // Look for breaking capacity in check limit, or in other OCP checks
        let breakerCapacity: number | null = null;
        
        // Try to extract from the check's limit field
        const limitStr = (check.limit || '').toLowerCase();
        const breakerMatch = limitStr.match(/(\d+(?:\.\d+)?)\s*ka/i);
        if (breakerMatch) {
          breakerCapacity = parseFloat(breakerMatch[1]);
        }
        
        // Also look in OCP checks for breaking capacity info
        if (!breakerCapacity) {
          for (const ocpCheck of aiChecks) {
            const desc = (ocpCheck.description || '').toLowerCase();
            const val = (ocpCheck.measuredValue || '').toLowerCase();
            if (desc.includes('breaking capacity') || desc.includes('breaker capacity')) {
              const capMatch = val.match(/(\d+(?:\.\d+)?)\s*ka/i);
              if (capMatch) {
                breakerCapacity = parseFloat(capMatch[1]);
                break;
              }
            }
          }
        }

        // Default breaking capacities if not extracted
        // Domestic MCBs typically 6kA, commercial 10kA
        if (!breakerCapacity) {
          const installationType = (aiResult.administrativeDetails?.installationType || '').toLowerCase();
          breakerCapacity = (installationType.includes('commercial') || installationType.includes('industrial')) ? 10 : 6;
        }

        const pass = measured < breakerCapacity;
        deterministicChecks.push({
          checkId: 'PSCC-001', result: pass ? 'Pass' : 'Fail',
          measuredValue: `${measured}kA`,
          limit: `< ${breakerCapacity}kA (breaker breaking capacity)`,
          remediation: pass ? '' : `PSCC ${measured}kA exceeds breaker breaking capacity of ${breakerCapacity}kA. Install breakers with adequate breaking capacity or reduce fault level.`,
          overrideReason: pass ? undefined : `FAIL: PSCC ${measured}kA ≥ breaker capacity ${breakerCapacity}kA`
        });

        if (!pass) {
          hasSafetyCriticalFail = true;
          criticalFailures.push({
            category: 'Safety-Critical', clause: 'PSCC-001',
            description: `Prospective short-circuit current ${measured}kA exceeds breaker breaking capacity ${breakerCapacity}kA`,
            reason: `SANS 10142-1 Clause 8.3: PSCC ${measured}kA ≥ breaker rated capacity ${breakerCapacity}kA — breaker cannot safely interrupt a fault.`,
            immediateAction: `Replace protective devices with units rated for at least ${measured}kA breaking capacity, or install current-limiting device upstream.`,
            riskLevel: 'Critical'
          });
        }
      } else {
        deterministicChecks.push({
          checkId: 'PSCC-001',
          result: check.result || 'Not Tested',
          measuredValue: check.measuredValue || 'Not recorded',
          limit: 'PSCC must be less than breaker breaking capacity (kA)',
          remediation: check.remediation || ''
        });
      }
    } else {
      deterministicChecks.push({
        checkId: 'PSCC-001', result: 'Not Tested',
        measuredValue: 'No PSCC data extracted',
        limit: 'PSCC must be less than breaker breaking capacity (kA)',
        remediation: 'Prospective short-circuit current (PSCC) test results not found in document.'
      });
    }
  }

  // --- 12. INCOMPLETE CERTIFICATE DETECTION — CERT-INCOMPLETE-001 ---
  {
    const empiricalCheckIds = ['EARTH-001', 'INSUL-001', 'RCD-001', 'LOOP-001', 'PSCC-001'];
    const missingTests: string[] = [];
    
    for (const checkId of empiricalCheckIds) {
      const check = deterministicChecks.find(c => c.checkId === checkId);
      if (check && (check.result === 'Not Tested' || check.result === 'Skipped')) {
        // Only count as missing if the check is enabled
        if (checkId === 'EARTH-001' && !settings.earth_continuity_check_enabled) continue;
        if (checkId === 'INSUL-001' && !settings.insulation_resistance_check_enabled) continue;
        if (checkId === 'RCD-001' && !settings.rcd_function_check_enabled) continue;
        // LOOP-001 doesn't have a dedicated enable flag — always check
        missingTests.push(checkId);
      }
    }
    
    if (missingTests.length > 0) {
      deterministicChecks.push({
        checkId: 'CERT-INCOMPLETE-001', result: 'Fail',
        measuredValue: `Missing: ${missingTests.join(', ')}`,
        limit: 'All mandatory instrumental tests must be recorded',
        remediation: `Incomplete certificate — mandatory test(s) not recorded: ${missingTests.join(', ')}. An incomplete certificate is legally void.`,
        overrideReason: 'Incomplete Certificate — mandatory empirical test data missing'
      });
      // Don't double-count as safety-critical if already failing; just ensure Incomplete status
      console.log(`📋 Incomplete certificate: missing tests ${missingTests.join(', ')}`);
    } else {
      deterministicChecks.push({
        checkId: 'CERT-INCOMPLETE-001', result: 'Pass',
        measuredValue: 'All mandatory tests present',
        limit: 'All mandatory instrumental tests must be recorded',
        remediation: ''
      });
    }
  }

  // --- 12. PASS-THROUGH remaining AI checks not handled above ---
  // IMPORTANT: Pass-through checks are informational only.
  // They do NOT influence the overall pass/fail status.
  // The deterministic engine (steps 1-12 above) is the SOLE authority for safety-critical decisions.
  const handledIds = new Set(['EARTH-001', 'INSUL-001', 'RCD-001', 'LOOP-001', 'PSCC-001', 'POL-001', 'COC-TYPE-001', 
    'COC-INIT-001', 'COC-SUPP-001', 'COC-TEMP-001', 'COC-VALID-001', 'SIG-001', 'DOC-001', 
    'CERT-DATE-001', 'REG-001', 'CERT-INCOMPLETE-001']);
  for (const check of aiChecks) {
    if (!handledIds.has(check.checkId)) {
      deterministicChecks.push({
        checkId: check.checkId,
        result: check.result || 'Not Tested',
        measuredValue: check.measuredValue || '',
        limit: check.limit || '',
        remediation: check.remediation || ''
      });
      // DO NOT set hasSafetyCriticalFail from AI pass-through checks.
      // Only deterministic engine checks (steps 1-8) can trigger safety-critical failures.
      // AI pass-through failures are logged as informational only.
      if (check.result === 'Fail') {
        console.log(`  ℹ️ AI pass-through check ${check.checkId} failed (informational, not safety-critical override)`);
      }
    }
  }

  // --- ALSO pass through AI critical failures that are evidence-based (not overridden) ---
  const deterministicClauseSet = new Set(criticalFailures.map((f: any) => f.clause));
  for (const aiFailure of (aiResult.criticalFailures || [])) {
    // Skip hierarchy violations for Initial COCs (already handled deterministically)
    if (cocType === 'initial') {
      const desc = (aiFailure.description || '').toLowerCase();
      const reason = (aiFailure.reason || '').toLowerCase();
      if (desc.includes('initial coc reference') || reason.includes('missing initial') || 
          reason.includes('does not reference') || reason.includes('without referencing')) {
        console.log('  ❌ FILTERED invalid AI failure for Initial COC:', aiFailure.description);
        continue;
      }
    }
    // Don't duplicate failures already added deterministically
    if (!deterministicClauseSet.has(aiFailure.clause)) {
      criticalFailures.push(aiFailure);
    }
  }

  // --- DETERMINE OVERALL STATUS ---
  let overallStatus = 'Pass';
  
  if (hasSafetyCriticalFail) {
    overallStatus = 'Fail';
    console.log(`🚨 FAIL: Safety-critical failure detected`);
  } else if (mandatoryFailCount >= settings.mandatory_failures_for_fail) {
    overallStatus = 'Fail';
    console.log(`🚨 FAIL: ${mandatoryFailCount} mandatory failures >= threshold ${settings.mandatory_failures_for_fail}`);
  }

  // Incomplete Certificate → Incomplete (unless already Fail)
  const certIncomplete = deterministicChecks.find(c => c.checkId === 'CERT-INCOMPLETE-001');
  if (certIncomplete?.result === 'Fail' && overallStatus !== 'Fail') {
    overallStatus = 'Incomplete';
    console.log(`📋 INCOMPLETE: Certificate missing mandatory empirical tests`);
  }

  // Low confidence → Incomplete
  if (aiResult.confidenceScore && aiResult.confidenceScore < settings.ai_confidence_threshold_percent) {
    if (overallStatus !== 'Fail') {
      overallStatus = 'Incomplete';
    }
    console.log(`⚠️ Low confidence: ${aiResult.confidenceScore}% < ${settings.ai_confidence_threshold_percent}%`);
  }

  const passCount = deterministicChecks.filter(c => c.result === 'Pass').length;
  const failCount = deterministicChecks.filter(c => c.result === 'Fail').length;
  console.log(`Deterministic results: ${passCount} pass, ${failCount} fail, ${criticalFailures.length} critical → ${overallStatus}`);

  return { checks: deterministicChecks, overallStatus, criticalFailures };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Accept approvedCocType, testSettings, and revalidateFailedOnly as optional parameters
    const { documentId, documentUrl, subsectionId, approvedCocType, testSettings, revalidateFailedOnly } = await req.json();
    
    if (!documentId || !documentUrl || !subsectionId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Log if user-approved cocType was provided
    if (approvedCocType) {
      console.log('📋 User-approved COC type provided:', approvedCocType);
      console.log('   This will OVERRIDE any AI checkbox analysis');
    }

    // Log revalidation mode
    if (revalidateFailedOnly) {
      console.log('🔄 RE-VALIDATION MODE: Only re-checking previously failed checks');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch validation settings from database or use testSettings if provided
    let validationSettings: ValidationSettings = { ...DEFAULT_SETTINGS };
    
    if (testSettings) {
      console.log('📋 Using test settings from request');
      validationSettings = { ...DEFAULT_SETTINGS, ...testSettings };
    } else {
      // Fetch from database
      const { data: dbSettings, error: settingsError } = await supabase
        .from('coc_validation_settings')
        .select('*')
        .limit(1)
        .single();
      
      if (settingsError) {
        console.log('⚠️ Could not fetch settings from database, using defaults:', settingsError.message);
      } else if (dbSettings) {
        console.log('✅ Loaded validation settings from database');
        validationSettings = { ...DEFAULT_SETTINGS, ...dbSettings };
      }
    }
    
    console.log('🔧 Validation settings:', {
      ai_model: validationSettings.ai_model,
      ai_temperature: validationSettings.ai_temperature,
      earth_continuity_max_ohms: validationSettings.earth_continuity_max_ohms,
      insulation_resistance_min_mohms: validationSettings.insulation_resistance_min_mohms,
      hierarchy_check_enabled: validationSettings.hierarchy_check_enabled,
      mandatory_failures_for_fail: validationSettings.mandatory_failures_for_fail
    });

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    console.log('Starting enhanced COC validation for document:', documentId);

    // Extract the storage path from the signed URL
    let storagePath: string;
    
    if (documentUrl.includes('/storage/v1/object/sign/documents/')) {
      const pathPart = documentUrl.split('/storage/v1/object/sign/documents/')[1];
      storagePath = pathPart.split('?token=')[0];
      storagePath = decodeURIComponent(storagePath);
    } else if (documentUrl.includes('/storage/v1/object/public/documents/')) {
      storagePath = documentUrl.split('/storage/v1/object/public/documents/')[1];
      storagePath = decodeURIComponent(storagePath);
    } else {
      throw new Error('Invalid document URL format');
    }
    
    console.log('Downloading document from storage:', storagePath);
    
    // Download the document using Supabase client
    let fileData: Blob | null = null;
    
    // Try download with the extracted path
    const { data: downloadData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(storagePath);
    
    if (downloadError || !downloadData) {
      console.error('Storage download error:', JSON.stringify(downloadError));
      
      // Fallback: try fetching the original URL directly with service role key
      console.log('Attempting direct URL fetch as fallback...');
      try {
        // Create a signed URL for the path
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(storagePath, 300);
        
        if (signedUrlError || !signedUrlData?.signedUrl) {
          console.error('Signed URL creation failed:', signedUrlError?.message);
          
          // Last resort: try the public URL
          const { data: publicUrlData } = supabase.storage
            .from('documents')
            .getPublicUrl(storagePath);
          
          console.log('Trying public URL:', publicUrlData.publicUrl);
          const publicResp = await fetch(publicUrlData.publicUrl);
          if (!publicResp.ok) {
            await publicResp.text(); // consume body
            throw new Error(`Document not found at path: ${storagePath} (HTTP ${publicResp.status})`);
          }
          fileData = await publicResp.blob();
        } else {
          const signedResp = await fetch(signedUrlData.signedUrl);
          if (!signedResp.ok) {
            await signedResp.text();
            throw new Error(`Failed to download via signed URL (HTTP ${signedResp.status})`);
          }
          fileData = await signedResp.blob();
        }
      } catch (fallbackErr) {
        const errMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        console.error(`Document not found in storage: ${storagePath}`);
        
        // Return a graceful "file not found" response instead of crashing
        return new Response(
          JSON.stringify({ 
            success: false,
            error: `Document file not found in storage. It may have been deleted or moved. Path: ${storagePath}`,
            status: 'FileNotFound',
            complianceStatus: 'Skipped',
            violations: [],
            checks: []
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      fileData = downloadData;
    }
    
    if (!fileData) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Document download returned empty data. Path: ${storagePath}`,
          status: 'FileNotFound',
          complianceStatus: 'Skipped',
          violations: [],
          checks: []
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is a PDF or image file
    const fileName = storagePath.split('/').pop() || '';
    const fileExtension = fileName.toLowerCase().split('.').pop();
    const isPDF = fileExtension === 'pdf';
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExtension || '');
    
    console.log(`Processing ${isPDF ? 'PDF' : isImage ? 'image' : 'text'} file:`, fileName);

    // Prepare the AI request with vision capabilities for PDFs and images
    let messages: any[];
    
    if (isPDF || isImage) {
      // Convert file to base64 for vision processing
      const arrayBuffer = await fileData.arrayBuffer();
      const base64Data = encodeBase64(new Uint8Array(arrayBuffer));
      const mimeType = isPDF ? 'application/pdf' : `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`;
      
      console.log('Using vision model for document analysis, size:', arrayBuffer.byteLength);
      
      // Build dynamic prompt with configured thresholds
      const dynamicPrompt = buildDynamicPrompt(validationSettings);
      
      messages = [
        { 
          role: 'system', 
          content: dynamicPrompt
        },
        { 
          role: 'user', 
          content: [
            {
              type: 'text',
              text: `Analyze this COC document against SANS 10142-1:2020. Extract ALL visible information.

📅 CURRENT DATE: ${new Date().toISOString().split('T')[0]} (use this as "today" for all date comparisons)

⚠️ DATE VALIDATION RULES:
- A COC issue date is "future-dated" ONLY if it is AFTER ${new Date().toISOString().split('T')[0]}
- Common date formats on COCs: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY
- Example: 18/03/2025 means March 18, 2025 - this is BEFORE today, so it is VALID (not future-dated)
- Only flag as future-dated if the date is genuinely in the future relative to ${new Date().toISOString().split('T')[0]}

⚠️ ZERO-TOLERANCE ANTI-HALLUCINATION RULES:
1. ONLY report what you can DIRECTLY SEE - no fabrication, invention, or inference
2. For ANY failure you report, you MUST be able to quote the EXACT visible text/value as evidence
3. NEVER create quotes like "Annexure states..." unless you can read those EXACT words
4. If content is unclear/missing → say "not visible" or "unclear", do NOT guess
5. Every criticalFailure MUST have directly visible evidence you can point to
6. When in doubt, leave it out - fewer accurate findings > fabricated issues

Return ONLY the JSON validation result.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`
              }
            }
          ]
        }
      ];
    } else {
      // For text-based files, extract text directly
      const documentText = await fileData.text();
      const truncatedText = documentText.substring(0, 15000); // Increased context for better extraction
      
      // Build dynamic prompt with configured thresholds
      const dynamicPrompt = buildDynamicPrompt(validationSettings);
      
      messages = [
        { 
          role: 'system', 
          content: dynamicPrompt
        },
        { 
          role: 'user', 
          content: `Document content:\n\n${truncatedText}\n\nPlease validate this COC document and return ONLY the JSON validation result.`
        }
      ];
    }

    console.log('Calling AI for enhanced validation with vision capabilities...');

    // Retry logic for AI calls
    let validationResult: any = null;
    let lastError: Error | null = null;
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Call Lovable AI with vision model for better document analysis
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: validationSettings.ai_model || 'google/gemini-3-pro-preview',
            messages,
            temperature: validationSettings.ai_temperature ?? 0.1,
            max_tokens: 16384, // Ensure complete JSON response
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error('AI gateway error:', aiResponse.status, errorText);
          
          if (aiResponse.status === 429) {
            return new Response(
              JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
              { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          if (aiResponse.status === 402) {
            return new Response(
              JSON.stringify({ error: 'Payment required. Please add credits to your Lovable AI workspace.' }),
              { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          throw new Error(`AI validation failed: ${errorText}`);
        }

        const aiData = await aiResponse.json();
        console.log('AI response received successfully');

        const aiContent = aiData.choices?.[0]?.message?.content;
        
        if (!aiContent) {
          throw new Error('Empty response from AI');
        }
        
        // Extract JSON from response (handle markdown code blocks)
        // Try multiple patterns to extract JSON
        const jsonMatch = aiContent.match(/```json\n([\s\S]*?)\n```/) || 
                         aiContent.match(/```\n([\s\S]*?)\n```/) ||
                         aiContent.match(/\{[\s\S]*\}/);
        
        let jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiContent;
        
        // Clean up common JSON issues
        jsonStr = jsonStr.trim();
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
        }
        
        // Remove trailing commas before closing brackets
        jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
        
        validationResult = JSON.parse(jsonStr);
        
        // ===== USER-APPROVED COC TYPE OVERRIDE =====
        if (approvedCocType) {
          const normalizedApproved = approvedCocType.charAt(0).toUpperCase() + approvedCocType.slice(1).toLowerCase();
          console.log(`🎯 USER OVERRIDE: cocType "${validationResult.cocType}" → "${normalizedApproved}"`);
          if (!validationResult.extractionNotes) validationResult.extractionNotes = [];
          validationResult.extractionNotes.push(
            `USER OVERRIDE: cocType set to "${normalizedApproved}" (AI detected: "${validationResult.cocType}")`
          );
          validationResult.cocType = normalizedApproved;
          if (validationResult.hierarchyValidation) {
            validationResult.hierarchyValidation.cocTypeIdentified = normalizedApproved;
          }
        } else if (validationResult.checkboxStates) {
          // SERVER-SIDE CHECKBOX CORRECTION
          const cs = validationResult.checkboxStates;
          const initialMarked = cs.initialBox?.toUpperCase() === 'MARKED';
          const supplementaryMarked = cs.supplementaryBox?.toUpperCase() === 'MARKED';
          const temporaryMarked = cs.temporaryBox?.toUpperCase() === 'MARKED';
          
          console.log('Checkbox analysis:', { initialMarked, supplementaryMarked, temporaryMarked });
          
          let correctCocType: string | null = null;
          if (initialMarked && !supplementaryMarked && !temporaryMarked) correctCocType = 'Initial';
          else if (supplementaryMarked && !initialMarked && !temporaryMarked) correctCocType = 'Supplementary';
          else if (temporaryMarked && !initialMarked && !supplementaryMarked) correctCocType = 'Temporary';
          else if (!initialMarked && !supplementaryMarked && !temporaryMarked) correctCocType = null;
          else correctCocType = validationResult.cocType; // Multiple marked — use AI
          
          if (correctCocType !== validationResult.cocType) {
            console.log(`🔧 Checkbox override: "${validationResult.cocType}" → "${correctCocType}"`);
            if (!validationResult.extractionNotes) validationResult.extractionNotes = [];
            validationResult.extractionNotes.push(
              `SERVER OVERRIDE: cocType changed from "${validationResult.cocType}" to "${correctCocType}" based on checkboxStates`
            );
            validationResult.cocType = correctCocType;
            if (validationResult.hierarchyValidation) {
              validationResult.hierarchyValidation.cocTypeIdentified = correctCocType;
            }
          }
        }
        
        // ===== DETERMINISTIC VALIDATION ENGINE =====
        // AI is the extractor; pass/fail decisions are made by mathematical rules
        console.log('=== APPLYING DETERMINISTIC VALIDATION ENGINE ===');
        const deterministicResult = applyDeterministicValidation(validationResult, validationSettings);
        
        // Replace AI checks and critical failures with deterministic results
        validationResult.checks = deterministicResult.checks;
        validationResult.criticalFailures = deterministicResult.criticalFailures;
        validationResult.overallStatus = deterministicResult.overallStatus;
        
        // ===== CRITICAL FIX: Override AI hierarchy fields with deterministic results =====
        // The AI often sets hierarchyValidation incorrectly for Initial COCs.
        // The deterministic engine is authoritative — sync these fields.
        const normalizedCocType = (validationResult.cocType || '').toLowerCase();
        if (normalizedCocType === 'initial') {
          // Initial COCs don't need hierarchy references — force valid
          validationResult.initialCocValid = true;
          validationResult.cocTypeMarked = true;
          if (validationResult.hierarchyValidation) {
            validationResult.hierarchyValidation.hierarchyStatus = 'Valid';
            validationResult.hierarchyValidation.cocTypeMarked = true;
            validationResult.hierarchyValidation.initialCocExists = true;
            validationResult.hierarchyValidation.initialCocReferenced = null; // N/A for Initial
          }
          console.log('🔧 Overrode AI hierarchy fields for Initial COC → Valid');
        } else if (normalizedCocType === 'supplementary' || normalizedCocType === 'temporary') {
          // Check deterministic engine result for hierarchy
          const hierCheck = deterministicResult.checks.find(
            (c: DeterministicCheckResult) => c.checkId === 'COC-SUPP-001' || c.checkId === 'COC-TEMP-001'
          );
          const hierPassed = hierCheck?.result === 'Pass';
          validationResult.initialCocValid = hierPassed;
          if (validationResult.hierarchyValidation) {
            validationResult.hierarchyValidation.hierarchyStatus = hierPassed ? 'Valid' : 'Invalid - Missing Reference';
            validationResult.hierarchyValidation.initialCocReferenced = hierPassed;
          }
        }
        
        // Add settings transparency
        if (!validationResult.extractionNotes) validationResult.extractionNotes = [];
        validationResult.extractionNotes.push(
          `Deterministic Engine Applied: Model=${validationSettings.ai_model}, ` +
          `Earth≤${validationSettings.earth_continuity_max_ohms}Ω, IR≥${validationSettings.insulation_resistance_min_mohms}MΩ, ` +
          `RCD@1x≤${validationSettings.rcd_trip_1x_max_ms}ms, MandatoryFailThreshold=${validationSettings.mandatory_failures_for_fail}`
        );
        
        // Build summary from deterministic checks
        validationResult.summary = {
          totalChecks: validationResult.checks.length,
          passedChecks: validationResult.checks.filter((c: any) => c.result === 'Pass').length,
          failedChecks: validationResult.checks.filter((c: any) => c.result === 'Fail').length,
          notTested: validationResult.checks.filter((c: any) => c.result === 'Not Tested').length,
          notApplicable: validationResult.checks.filter((c: any) => c.result === 'Not Applicable' || c.result === 'Skipped').length,
          criticalFailures: validationResult.criticalFailures.length,
        };
        
        // Successfully parsed, break out of retry loop
        console.log('Validation parsed successfully on attempt', attempt + 1);
        break;
        
      } catch (parseError) {
        lastError = parseError as Error;
        console.error(`Attempt ${attempt + 1} failed:`, parseError);
        
        if (attempt < MAX_RETRIES) {
          console.log(`Retrying validation (attempt ${attempt + 2})...`);
          // Brief delay before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // If all retries failed, return error result
    if (!validationResult) {
      console.error('All validation attempts failed:', lastError);
      validationResult = {
        overallStatus: 'Error',
        confidenceScore: 0,
        documentQuality: 'Poor',
        checks: [],
        criticalFailures: [{
          category: 'Technical',
          clause: 'N/A',
          description: 'Failed to parse validation response',
          reason: lastError?.message || 'The AI response could not be interpreted as valid JSON',
          immediateAction: 'Please try validating the document again',
          riskLevel: 'Medium'
        }],
        summary: {
          totalChecks: 0,
          passedChecks: 0,
          failedChecks: 0,
          notTested: 0,
          notApplicable: 0,
          criticalFailures: 1
        },
        extractionNotes: ['Parsing error occurred - please retry validation']
      };
    }

    console.log('Validation result - Status:', validationResult.overallStatus, 
                'Confidence:', validationResult.confidenceScore,
                'Checks:', validationResult.summary?.totalChecks);

    // Map overall status to coc_status
    // STANDARDIZE: All statuses should be lowercase for database, UI normalizes them
    // Documents: pending, approved, rejected
    // Subsections: Approved, Failed, pending
    const getDocumentStatus = (status: string): string => {
      const s = status.toLowerCase();
      if (s === 'pass' || s === 'passed' || s === 'approved' || s === 'valid') return 'approved';
      if (s === 'fail' || s === 'failed' || s === 'rejected' || s === 'invalid') return 'rejected';
      return 'pending';
    };
    
    const getSubsectionStatus = (status: string): string => {
      const s = status.toLowerCase();
      if (s === 'pass' || s === 'passed' || s === 'approved' || s === 'valid') return 'Approved';
      if (s === 'fail' || s === 'failed' || s === 'rejected' || s === 'invalid') return 'Failed';
      return 'pending';
    };
    
    const mappedDocumentStatus = getDocumentStatus(validationResult.overallStatus);
    const mappedSubsectionStatus = getSubsectionStatus(validationResult.overallStatus);

    // CRITICAL: Update the DOCUMENT with extracted COC details (per-document data)
    // This ensures each document retains its own extracted data
    // Now also syncs coc_type from AI extraction to ensure consistency
    const documentUpdateData: any = {};
    if (validationResult.cocNumber) {
      documentUpdateData.coc_number = validationResult.cocNumber;
    }
    if (validationResult.cocIssueDate) {
      documentUpdateData.coc_issue_date = validationResult.cocIssueDate;
    }
    // Sync coc_type from AI extraction - normalize to match DB check constraint
    if (validationResult.cocType) {
      const rawType = validationResult.cocType.toLowerCase().trim();
      let normalizedCocType: string | null = null;
      if (rawType.startsWith('initial')) normalizedCocType = 'Initial';
      else if (rawType.startsWith('supplementary')) normalizedCocType = 'Supplementary';
      else if (rawType.startsWith('temporary')) normalizedCocType = 'Temporary';
      else normalizedCocType = 'Not Marked';
      documentUpdateData.coc_type = normalizedCocType;
      console.log('Syncing coc_type from AI extraction:', validationResult.cocType, '→ normalized:', normalizedCocType);
    }
    documentUpdateData.coc_status = mappedDocumentStatus;

    if (Object.keys(documentUpdateData).length > 0) {
      const { error: docUpdateError } = await supabase
        .from('subsection_documents')
        .update(documentUpdateData)
        .eq('id', documentId);
      
      if (docUpdateError) {
        console.error('Failed to update document with COC details:', docUpdateError);
      } else {
        console.log('Updated document', documentId, 'with COC details:', documentUpdateData);
      }
    }

    // Update subsection with COC details - only if this is a VALID/better COC
    // Priority: valid > invalid > pending > missing
    // Also update if subsection has no COC data yet
    if (validationResult.cocNumber || validationResult.cocIssueDate) {
      const { data: currentSubsection } = await supabase
        .from('subsections')
        .select('coc_number, coc_status, coc_issue_date')
        .eq('id', subsectionId)
        .single();

      // Determine if we should update the subsection
      // CRITICAL: Failed validations should ALWAYS update the subsection status to Failed
      // This ensures failed COC validations properly mark the subsection as non-compliant
      // 
      // Priority Logic:
      // - Failed validations ALWAYS update status (even if current is Approved)
      // - Pass validations update if no current data or current is Failed/pending/Missing
      // - Same status: newer date wins
      const statusPriority: Record<string, number> = {
        'Approved': 4,
        'valid': 4,
        'Failed': 3,
        'invalid': 3,
        'pending': 2,
        'Missing': 1,
        '': 0
      };
      
      const currentPriority = statusPriority[currentSubsection?.coc_status || ''] || 0;
      const newPriority = statusPriority[mappedSubsectionStatus] || 0;
      
      // ALWAYS update if validation failed (ensures Failed overrides Approved)
      // This is the key fix: failed validations must always update status
      const isNewValidationFailed = mappedSubsectionStatus === 'Failed';
      
      // Update subsection if: 
      // 1. Validation failed (always update to Failed), OR
      // 2. No current COC data, OR
      // 3. New priority is higher, OR
      // 4. Same priority but newer date
      const shouldUpdate = isNewValidationFailed ||
                          !currentSubsection?.coc_number || 
                          newPriority > currentPriority ||
                          (newPriority === currentPriority && validationResult.cocIssueDate > (currentSubsection?.coc_issue_date || ''));

      if (shouldUpdate) {
        const subsectionUpdateData: any = {};
        if (validationResult.cocNumber) {
          subsectionUpdateData.coc_number = validationResult.cocNumber;
        }
        if (validationResult.cocIssueDate) {
          subsectionUpdateData.coc_issue_date = validationResult.cocIssueDate;
        }
        // REMOVED: coc_type update - user-approved value should NOT be overwritten by validation
        // The coc_type is set during extraction approval in handleApproveAndVerify
        subsectionUpdateData.coc_status = mappedSubsectionStatus;
        
        // CRITICAL: Set is_compliant based on validation result AND hierarchy rules
        // A subsection is ONLY compliant if:
        // 1. The COC Type checkbox was marked on the certificate
        // 2. The COC validation passed (status = Approved)
        // 3. Hierarchy rules are satisfied (Initial COC exists and is valid for Supplementary/Temporary)
        // 
        // IMPORTANT: "Not Marked" means NO checkbox was ticked - this is a FAIL condition
        const cocTypeIsValid = validationResult.cocType && 
                               validationResult.cocType !== 'Not Marked' &&
                               validationResult.cocType.toLowerCase() !== 'not marked' &&
                               validationResult.cocType.toLowerCase() !== 'unknown';
        const cocTypeMarked = validationResult.cocTypeMarked !== false && 
                              validationResult.hierarchyValidation?.cocTypeMarked !== false &&
                              cocTypeIsValid;
        const hierarchyValid = validationResult.hierarchyValidation?.hierarchyStatus !== 'Invalid - Missing Reference' &&
                               validationResult.hierarchyValidation?.hierarchyStatus !== 'Invalid' &&
                               validationResult.hierarchyValidation?.hierarchyStatus !== 'Invalid - COC Type Not Marked' &&
                               validationResult.initialCocValid !== false;
        const validationPassed = mappedSubsectionStatus === 'Approved';
        const hasCriticalFailures = (validationResult.criticalFailures?.length || 0) > 0;
        
        // is_compliant = COC type marked AND validation passed AND hierarchy valid AND no critical failures
        subsectionUpdateData.is_compliant = cocTypeMarked && validationPassed && hierarchyValid && !hasCriticalFailures;
        
        console.log('Compliance determination:', {
          cocTypeMarked,
          validationPassed,
          hierarchyValid,
          hasCriticalFailures,
          finalIsCompliant: subsectionUpdateData.is_compliant,
          hierarchyStatus: validationResult.hierarchyValidation?.hierarchyStatus,
          initialCocValid: validationResult.initialCocValid
        });
        
        const { error: updateError } = await supabase
          .from('subsections')
          .update(subsectionUpdateData)
          .eq('id', subsectionId);
        
        if (updateError) {
          console.error('Failed to update subsection with COC details:', updateError);
        } else {
          console.log('Updated subsection with best COC details:', subsectionUpdateData);
        }
      } else {
        // Even if we don't update COC details, we should still update is_compliant if this validation failed
        // This ensures failed validations always mark the subsection as non-compliant
        // IMPORTANT: "Not Marked" means NO checkbox was ticked - this is a FAIL condition
        const cocTypeIsValid2 = validationResult.cocType && 
                                validationResult.cocType !== 'Not Marked' &&
                                validationResult.cocType.toLowerCase() !== 'not marked' &&
                                validationResult.cocType.toLowerCase() !== 'unknown';
        const cocTypeMarked = validationResult.cocTypeMarked !== false && 
                              validationResult.hierarchyValidation?.cocTypeMarked !== false &&
                              cocTypeIsValid2;
        const hierarchyValid = validationResult.hierarchyValidation?.hierarchyStatus !== 'Invalid - Missing Reference' &&
                               validationResult.hierarchyValidation?.hierarchyStatus !== 'Invalid' &&
                               validationResult.hierarchyValidation?.hierarchyStatus !== 'Invalid - COC Type Not Marked' &&
                               validationResult.initialCocValid !== false;
        const validationPassed = mappedSubsectionStatus === 'Approved';
        const hasCriticalFailures = (validationResult.criticalFailures?.length || 0) > 0;
        const isCompliant = cocTypeMarked && validationPassed && hierarchyValid && !hasCriticalFailures;
        
        // If this validation failed, mark as non-compliant regardless of other COC data
        if (!isCompliant) {
          const { error: updateError } = await supabase
            .from('subsections')
            .update({ is_compliant: false })
            .eq('id', subsectionId);
          
          if (updateError) {
            console.error('Failed to update is_compliant:', updateError);
          } else {
            console.log('Marked subsection as non-compliant due to validation failure');
          }
        }
        console.log('Subsection already has better/newer COC data, but updated is_compliant:', isCompliant);
      }
    }

    // Store validation result in database with full report details including settings used
    const { error: dbError } = await supabase
      .from('coc_validations')
      .upsert({
        document_id: documentId,
        subsection_id: subsectionId,
        status: validationResult.overallStatus || 'Error',
        violations: validationResult.criticalFailures || [],
        validated_by: userId,
        validated_at: new Date().toISOString(),
        report_data: {
          ...validationResult,
          validatedAt: new Date().toISOString(),
          validationEngine: 'SANS-10142-1-2020-v4-strict-empirical',
          modelUsed: validationSettings.ai_model,
          settingsApplied: {
            ai_model: validationSettings.ai_model,
            ai_temperature: validationSettings.ai_temperature,
            earth_continuity_max_ohms: validationSettings.earth_continuity_max_ohms,
            insulation_resistance_min_mohms: validationSettings.insulation_resistance_min_mohms,
            rcd_trip_1x_max_ms: validationSettings.rcd_trip_1x_max_ms,
            rcd_trip_5x_max_ms: validationSettings.rcd_trip_5x_max_ms,
            mandatory_failures_for_fail: validationSettings.mandatory_failures_for_fail,
            safety_critical_failures_for_fail: validationSettings.safety_critical_failures_for_fail,
            hierarchy_check_enabled: validationSettings.hierarchy_check_enabled,
            earth_continuity_check_enabled: validationSettings.earth_continuity_check_enabled,
            insulation_resistance_check_enabled: validationSettings.insulation_resistance_check_enabled,
            rcd_function_check_enabled: validationSettings.rcd_function_check_enabled
          }
        }
      }, {
        onConflict: 'document_id'
      });

    if (dbError) {
      console.error('Database error storing validation:', dbError);
      throw new Error(`Failed to store validation result: ${dbError.message}`);
    }

    console.log('Validation completed and stored successfully');

    return new Response(
      JSON.stringify({
        success: true,
        status: validationResult.overallStatus,
        confidenceScore: validationResult.confidenceScore,
        documentQuality: validationResult.documentQuality,
        violations: validationResult.criticalFailures || [],
        summary: validationResult.summary,
        checks: validationResult.checks,
        skippedChecks: validationResult.skippedChecks || [],
        administrativeDetails: validationResult.administrativeDetails,
        technicalEvaluation: validationResult.technicalEvaluation,
        recommendations: validationResult.recommendations,
        extractionNotes: validationResult.extractionNotes,
        report: validationResult,
        settingsApplied: {
          ai_model: validationSettings.ai_model,
          ai_temperature: validationSettings.ai_temperature,
          ai_confidence_threshold_percent: validationSettings.ai_confidence_threshold_percent,
          earth_continuity_max_ohms: validationSettings.earth_continuity_max_ohms,
          insulation_resistance_min_mohms: validationSettings.insulation_resistance_min_mohms,
          rcd_trip_1x_max_ms: validationSettings.rcd_trip_1x_max_ms,
          rcd_trip_5x_max_ms: validationSettings.rcd_trip_5x_max_ms,
          mandatory_failures_for_fail: validationSettings.mandatory_failures_for_fail,
          safety_critical_failures_for_fail: validationSettings.safety_critical_failures_for_fail,
          hierarchy_check_enabled: validationSettings.hierarchy_check_enabled,
          earth_continuity_check_enabled: validationSettings.earth_continuity_check_enabled,
          insulation_resistance_check_enabled: validationSettings.insulation_resistance_check_enabled,
          rcd_function_check_enabled: validationSettings.rcd_function_check_enabled,
          signature_check_enabled: validationSettings.signature_check_enabled,
          certificate_date_validation_enabled: validationSettings.certificate_date_validation_enabled,
          protective_conductor_check_enabled: validationSettings.protective_conductor_check_enabled
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('COC validation error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        status: 'Error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
