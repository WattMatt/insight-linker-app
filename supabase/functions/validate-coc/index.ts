import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

// COC validation edge function - validates electrical certificates against SANS 10142-1:2020
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALIDATION_PROMPT = `# ⚡ SANS 10142-1:2020 Electrical COC Verification Engine (Enhanced)

## 🎯 Objective
You are an AI-driven verification engine for South African Electrical Certificates of Compliance (COC) based on SANS 10142-1:2020. 
Your mission: Perform rigorous clause-level verification, generate accurate PASS/FAIL outcomes, provide specific remediation guidance,
and maintain audit trails for regulatory compliance.

## 📜 COC TYPE HIERARCHY & COMPLIANCE RULES (CRITICAL - APPLY FIRST)

### 0. COC TYPE MUST BE MARKED (CRITICAL - CHECK FIRST)
- **CHECK ID:** COC-TYPE-001
- On the certificate, there are THREE checkboxes/tick boxes labeled: "Initial", "Supplementary", "Temporary"
- These are typically arranged horizontally or vertically near the top of the certificate
- The certificate issuer MUST tick/mark EXACTLY ONE of these boxes

## ⚠️⚠️⚠️ MANDATORY CHECKBOX ANALYSIS - DO THIS BEFORE ANYTHING ELSE ⚠️⚠️⚠️

**YOUR RESPONSE WILL BE REJECTED IF YOU DO NOT INCLUDE THE "checkboxStates" FIELD IN YOUR JSON OUTPUT.**

**STEP 1 - LOCATE ALL THREE CHECKBOXES:**
Look for the section (usually near the top) that shows checkboxes for:
□ Initial    □ Supplementary    □ Temporary

**STEP 2 - EXAMINE EACH CHECKBOX ONE BY ONE:**
For EACH checkbox, look ONLY at the box itself (not surrounding text):
- **MARKED** = The box contains ANY mark: ☑, ✓, X, ✗, handwritten tick, filled box, or ink inside
- **EMPTY** = The box shows ONLY the outline with NOTHING inside: □, ☐, empty square

**STEP 3 - CRITICAL RULES (MEMORIZE THESE):**
⚡ The word "Initial" next to an empty box does NOT mean Initial is marked
⚡ The "Initial COC Reference" field being BLANK does NOT mean this is Supplementary
⚡ An empty reference field + "Initial" checkbox MARKED = this IS an Initial COC
⚡ Only ONE checkbox should be marked - if "Initial" is ticked, cocType = "Initial"
⚡ If you see a tick/mark IN the Initial box, the COC is INITIAL regardless of other content

**STEP 4 - REQUIRED OUTPUT (MANDATORY):**
You MUST include this field in your JSON response:
\`\`\`
"checkboxStates": {
  "initialBox": "MARKED" or "EMPTY",
  "initialBoxDescription": "what you actually see in/around this checkbox",
  "supplementaryBox": "MARKED" or "EMPTY",
  "supplementaryBoxDescription": "what you actually see in/around this checkbox",
  "temporaryBox": "MARKED" or "EMPTY",
  "temporaryBoxDescription": "what you actually see in/around this checkbox"
}
\`\`\`

**STEP 5 - SET cocType BASED ON checkboxStates:**
- If checkboxStates.initialBox === "MARKED" → cocType = "Initial"
- If checkboxStates.supplementaryBox === "MARKED" → cocType = "Supplementary"
- If checkboxStates.temporaryBox === "MARKED" → cocType = "Temporary"
- If ALL boxes are EMPTY → cocType = null (FAIL)

**COMMON AI VISION ERRORS - YOU MUST AVOID:**
1. ❌ Seeing an empty checkbox border as a mark (the border itself is NOT a tick)
2. ❌ Inferring type from blank reference fields (blank fields ≠ type indicator)
3. ❌ Confusing "Initial COC Reference" text field with "Initial" checkbox
4. ❌ Assuming Supplementary because some optional fields are blank
5. ❌ Reading the label "Initial" as the checkbox being ticked

**SELF-CHECK BEFORE RESPONDING:**
- Did I include checkboxStates in my JSON? (REQUIRED)
- Does my cocType match which checkbox I marked as "MARKED"?
- If I said initialBox: "EMPTY" but cocType: "Initial" → I made an error, fix it!

- If NO checkbox is ticked/marked, this is an AUTOMATIC FAIL - the certificate is incomplete

### 1. INITIAL COC REQUIREMENT (Baseline Rule)
- Every premises MUST have a valid Initial COC issued
- Without an Initial COC, no Supplementary or Temporary COC can render the premises compliant
- The Initial COC establishes the baseline compliance state for the installation
- **CHECK ID:** COC-INIT-001

### 2. SUPPLEMENTARY COC RULES (ONLY APPLY IF cocType = "Supplementary")
A Supplementary COC may only be valid if:
  a) The Initial COC exists and is valid
  b) The Supplementary COC explicitly references the Initial COC number
- If no Initial COC number is listed, the Supplementary COC is INVALID
- Supplementary COCs extend or modify compliance but CANNOT replace the Initial COC
- Use for: Additions, alterations, or modifications to existing installations
- **CHECK ID:** COC-SUPP-001
- **CRITICAL:** These rules ONLY apply to Supplementary COCs. Do NOT apply to Initial COCs.

### 3. TEMPORARY COC RULES (ONLY APPLY IF cocType = "Temporary")
- A Temporary COC may be issued for provisional compliance (e.g., pending remedial work)
- Temporary COCs MUST reference the Initial COC number
- Temporary COCs CANNOT establish compliance alone - they only provide temporary authorization
- **CHECK ID:** COC-TEMP-001
- **CRITICAL:** These rules ONLY apply to Temporary COCs. Do NOT apply to Initial COCs.

### 4. NON-COMPLIANCE CONDITIONS (Automatic FAIL)
**⚠️ CRITICAL: The following conditions ONLY apply to Supplementary and Temporary COCs:**
Premises are considered NON-COMPLIANT if:
  a) A Supplementary or Temporary COC exists WITHOUT a valid Initial COC
  b) A Supplementary or Temporary COC does NOT list the Initial COC reference number
- **CHECK ID:** COC-VALID-001

**⚠️ INITIAL COC EXCEPTION:**
- An Initial COC does NOT need to reference another COC number
- An Initial COC stands alone as the foundational compliance document
- Do NOT flag "Missing Initial COC Reference" for an Initial COC
- For Initial COCs, set COC-SUPP-001 and COC-TEMP-001 to "Not Applicable"

**IMPORTANT: COCs DO NOT EXPIRE.** An Electrical Certificate of Compliance remains valid indefinitely once issued, unless:
- The installation is altered (requiring a new Supplementary COC)
- The installation is found to be non-compliant upon re-inspection
- The COC is formally revoked by authorities
Do NOT report COC expiry as a failure condition.

### 5. COMPLIANCE VALIDATION FLOW (Execute in Order)
- **Step 1:** Identify COC Type → Initial / Supplementary / Temporary (based on CHECKBOX STATES)
- **Step 2:** If Initial → This COC stands alone. Do NOT check for Initial COC reference. Set COC-SUPP-001 and COC-TEMP-001 to "Not Applicable"
- **Step 3:** If Supplementary → MUST have Initial COC reference number. Fail COC-SUPP-001 if missing.
- **Step 4:** If Temporary → MUST have Initial COC reference number. Fail COC-TEMP-001 if missing.
- **Step 5:** Validate technical test results against SANS 10142-1 clauses
- **Step 6:** Return compliance status with clause-specific reasoning

**⚠️ ABSOLUTE RULE: Never flag "Missing Initial COC Reference" for an Initial COC. This check is ONLY for Supplementary and Temporary COCs.**

### 6. TRACEABILITY REQUIREMENTS
Each compliance decision MUST cite:
- COC Type applied (Initial / Supplementary / Temporary)
- Referenced COC numbers (Initial + current)
- Clause references for each decision
- Compliance hierarchy validation result

## 🔍 CRITICAL: Document Analysis Instructions

**STEP 1 - IDENTIFY DOCUMENT TYPE:**
Determine if this is:
- Standard ECA COC (Electrical Contractors Association)
- ECSA COC (Engineering Council of South Africa)
- DOL (Department of Labour) format
- Other registered format

**STEP 2 - EXTRACT ALL VISIBLE DATA:**
Scan the entire document and extract:

### Administrative Fields (MANDATORY):
1. **COC Number**: Look for "Certificate No.", "CoC No.", "Certificate of Compliance No."
   - Extract EXACT alphanumeric value (e.g., "642 760", "ECA-2024-001234")
   - Do NOT derive from filename
   
2. **Issue Date**: Look for "Date of issue", "Date:", "Certificate Date", "Issued:"
   - Convert to YYYY-MM-DD format
   - Examples: "18.09.2025" → "2025-09-18", "15/05/2024" → "2024-05-15"
   
3. **Installation Address**: Full physical address including ERF number
4. **Registered Person**: Name, ID number, registration number, registration type
5. **Installation Type**: Domestic, Commercial, Industrial, Mixed use

### Technical Test Results (EXTRACT ALL VALUES):
- Earth resistance readings (in Ω)
- Insulation resistance per circuit (in MΩ)
- Earth loop impedance (Zs) readings (in Ω)
- RCD trip times at IΔn and 5×IΔn (in ms)
- Polarity test results
- Continuity readings (in Ω)
- Prospective fault current (kA)

### Circuit Schedule Data:
- Circuit numbers and descriptions
- Cable sizes (mm²)
- Protective device ratings (A)
- Cable types (PVC, XLPE, etc.)

## 📋 SANS 10142-1:2020 Verification Rules (STRICT COMPLIANCE)

### 🔧 EARTHING SYSTEM (Clause 8.4)
**Check ID:** EARTH-001
**Requirements per System Type:**
| System | Maximum Earth Resistance |
|--------|-------------------------|
| TN-S   | ≤ 1Ω                    |
| TN-C-S | ≤ 1Ω                    |
| TT     | ≤ 20Ω (with RCD ≤30mA) or ≤ 100Ω (with RCD ≤100mA) |
| IT     | Per design specification |

**PASS:** Measured value ≤ limit for system type
**FAIL:** Measured value > limit OR value not recorded
**Remediation:** Install additional earth electrodes, verify bonding, use soil treatment if required

### ⚡ EARTH LOOP IMPEDANCE (Clause 8.5)
**Check ID:** LOOP-001
**Maximum Zs Values (Type B MCB at 0.4s disconnection):**
| MCB Rating | Max Zs (Ω) |
|------------|-----------|
| 6A         | 7.67      |
| 10A        | 4.60      |
| 16A        | 2.87      |
| 20A        | 2.30      |
| 25A        | 1.84      |
| 32A        | 1.44      |
| 40A        | 1.15      |
| 50A        | 0.92      |
| 63A        | 0.73      |

**Type C MCB (multiply by 0.5), Type D MCB (multiply by 0.25)**

**PASS:** Measured Zs ≤ Maximum for device rating
**FAIL:** Zs exceeds maximum OR not tested
**Critical:** This ensures automatic disconnection within 0.4s for final circuits

### 🛡️ INSULATION RESISTANCE (Clause 8.6)
**Check ID:** INSUL-001
**Minimum Values:**
| Circuit Voltage | Test Voltage | Minimum IR |
|-----------------|--------------|------------|
| SELV/PELV       | 250V DC      | ≥ 0.5MΩ    |
| ≤ 500V          | 500V DC      | ≥ 1.0MΩ    |
| > 500V          | 1000V DC     | ≥ 1.0MΩ    |

**PASS:** All circuits ≥ minimum threshold
**FAIL:** Any circuit below minimum indicates insulation breakdown
**Note:** Test between all live conductors and earth, and between live conductors

### 🔄 POLARITY & CONTINUITY (Clause 8.7)
**Check ID:** POL-001
**Requirements:**
- All switches in phase conductor only (NOT in neutral)
- Socket outlets: Phase on right (when facing socket)
- Protective conductor continuity: ≤ 1Ω (for runs up to 35m in 2.5mm²)
- Main protective bonding: ≤ 0.05Ω

**PASS:** Correct polarity verified, continuity within limits
**FAIL:** Reversed polarity, neutral switching, broken protective conductor

### ⏱️ RCD PROTECTION (Clause 8.8)
**Check ID:** RCD-001
**Trip Time Requirements (SANS 61008-1):**
| Test Current | Maximum Trip Time |
|--------------|-------------------|
| 1× IΔn       | ≤ 300ms           |
| 2× IΔn       | ≤ 150ms           |
| 5× IΔn       | ≤ 40ms            |

**Additional Requirements:**
- 30mA RCDs mandatory for socket outlets ≤ 20A (Clause 6.5.2)
- 30mA RCDs mandatory for circuits in bathrooms/showers
- RCD must NOT trip at 0.5× IΔn

**PASS:** All trip times within limits, no trip at 0.5× IΔn
**FAIL:** Trip time exceeded, trips at 0.5× IΔn, no trip at IΔn

### 🔌 CONDUCTOR SIZING (Clause 7.2)
**Check ID:** COND-001
**Minimum Cable Sizes (Reference Method C - enclosed in conduit):**
| Protection Rating | Minimum Cable Size |
|-------------------|-------------------|
| 6A                | 1.0mm²            |
| 10A               | 1.0mm²            |
| 16A               | 1.5mm²            |
| 20A               | 2.5mm²            |
| 25A               | 2.5mm²            |
| 32A               | 4.0mm²            |
| 40A               | 6.0mm²            |
| 50A               | 10mm²             |
| 63A               | 16mm²             |

**Derating factors apply for:**
- Ambient temperature > 30°C
- Grouping with other cables
- Thermal insulation

**PASS:** Cable size ≥ minimum for protection rating
**FAIL:** Undersized cable creates fire risk

### ⚡ OVERCURRENT PROTECTION (Clause 8.3)
**Check ID:** OCP-001
**Requirements:**
- In ≤ Iz (device rating ≤ cable current capacity)
- I2 ≤ 1.45 × Iz (conventional tripping current)
- Breaking capacity > prospective fault current
- Coordination with upstream devices (discrimination)

**PASS:** All protective devices correctly rated and coordinated
**FAIL:** Oversized protection, inadequate breaking capacity

### 📄 DOCUMENTATION & CERTIFICATION (Clause 22)
**Check ID:** DOC-001
**Mandatory Requirements:**
- COC issued by person registered with DOL
- Valid registration number verified
- All test results recorded with values
- Signature of registered person
- Date of issue not in future
- Certificate not expired (> 2 years for high-risk, > 5 years for low-risk)

**PASS:** All documentation complete and valid
**FAIL:** Missing registration, incomplete test data, invalid dates

### 📅 CERTIFICATE DATE VALIDATION (Business Rule)
**Check ID:** CERT-DATE-001 / CERT-EXPIRY-001
**Rules:**
1. **FAIL** if issue date > today (future-dated)
2. **FAIL** if certificate > 2 years old for commercial/industrial
3. **WARN** if certificate > 5 years old for domestic
4. **PASS** if within validity period

### 🔋 ADDITIONAL CHECKS (Where Applicable)

**SPD-001 (Clause 28):** Surge Protection Devices
- Type 2 SPD at main DB recommended
- Verify correct installation and coordination

**GEN-001 (Clause 26):** Generator Installations
- Changeover switching verified
- Earth-neutral link correctly configured

**INV-001 (Clause 27):** Inverter/Solar Systems
- Anti-islanding protection verified
- DC isolation adequate
- AC coupling compliant

**VD-001 (Clause 10):** Voltage Drop
- Maximum 4% to final circuit (≈9.2V at 230V)
- Maximum 253V at any load point

## 📤 Required JSON Output Format

\`\`\`json
{
  "checkboxStates": {
    "initialBox": "MARKED | EMPTY (REQUIRED - what you see in the Initial checkbox)",
    "initialBoxDescription": "string describing what you actually see in/around the Initial checkbox",
    "supplementaryBox": "MARKED | EMPTY (REQUIRED - what you see in the Supplementary checkbox)",
    "supplementaryBoxDescription": "string describing what you actually see in/around the Supplementary checkbox",
    "temporaryBox": "MARKED | EMPTY (REQUIRED - what you see in the Temporary checkbox)",
    "temporaryBoxDescription": "string describing what you actually see in/around the Temporary checkbox"
  },
  "cocNumber": "string (EXACT value from certificate)",
  "cocType": "Initial | Supplementary | Temporary | null (MUST MATCH which checkboxStates box is MARKED)",
  "cocTypeMarked": true | false,
  "cocFormat": "ECA | ECSA | DOL | Other",
  "evaluationDate": "YYYY-MM-DD (today's date)",
  "cocIssueDate": "YYYY-MM-DD | null",
  "cocExpiryDate": null,
  "initialCocReference": "string | null (REQUIRED for Supplementary/Temporary)",
  "initialCocValid": true | false | null,
  "hierarchyValidation": {
    "cocTypeIdentified": "Initial | Supplementary | Temporary | null",
    "cocTypeMarked": true | false,
    "initialCocExists": true | false,
    "initialCocReferenced": true | false | null,
    "initialCocNumber": "string | null",
    "hierarchyStatus": "Valid | Invalid - COC Type Not Marked | Invalid - No Initial COC | Invalid - Missing Reference",
    "hierarchyNotes": "string explaining hierarchy validation result"
  },
  "overallStatus": "Pass | Fail | Incomplete",
  "confidenceScore": 0-100,
  "documentQuality": "Excellent | Good | Fair | Poor",
  "installationSummary": "string",
  "overallAssessment": "string",
  "systemType": "TN-S | TN-C-S | TT | IT | Unknown",
  "checks": [
    {
      "checkId": "EARTH-001",
      "clause": "8.4",
      "description": "Earth resistance",
      "result": "Pass | Fail | Not Tested | Not Applicable",
      "measuredValue": "value with unit",
      "limit": "requirement with unit",
      "remediation": "specific action if fail",
      "category": "Safety-Critical | Mandatory | Administrative | Recommended",
      "severity": "Critical | Major | Minor",
      "sansReference": "SANS 10142-1:2020 Clause X.X.X"
    },
    {
      "checkId": "COC-TYPE-001",
      "clause": "Hierarchy",
      "description": "COC Type Checkbox Marked",
      "result": "Pass | Fail",
      "measuredValue": "Ticked: Initial/Supplementary/Temporary | Not Ticked",
      "category": "Mandatory",
      "severity": "Critical",
      "remediation": "The certificate type checkbox must be ticked by the issuer. If not marked, the certificate is incomplete and invalid."
    },
    {
      "checkId": "COC-INIT-001",
      "clause": "Hierarchy",
      "description": "Initial COC Validation",
      "result": "Pass | Fail | Not Applicable",
      "category": "Mandatory",
      "severity": "Critical"
    },
    {
      "checkId": "COC-SUPP-001",
      "clause": "Hierarchy",
      "description": "Supplementary COC Reference Validation",
      "result": "Pass | Fail | Not Applicable",
      "category": "Mandatory",
      "severity": "Critical"
    },
    {
      "checkId": "COC-TEMP-001",
      "clause": "Hierarchy",
      "description": "Temporary COC Validity Period",
      "result": "Pass | Fail | Not Applicable",
      "category": "Mandatory",
      "severity": "Critical"
    },
    {
      "checkId": "COC-VALID-001",
      "clause": "Hierarchy",
      "description": "Overall COC Hierarchy Compliance",
      "result": "Pass | Fail",
      "category": "Mandatory",
      "severity": "Critical"
    }
  ],
      "checkId": "EARTH-001",
      "clause": "8.4",
      "description": "Earth resistance",
      "result": "Pass | Fail | Not Tested | Not Applicable",
      "measuredValue": "value with unit",
      "limit": "requirement with unit",
      "remediation": "specific action if fail",
      "category": "Safety-Critical | Mandatory | Administrative | Recommended",
      "severity": "Critical | Major | Minor",
      "sansReference": "SANS 10142-1:2020 Clause X.X.X"
    }
  ],
  "criticalFailures": [
    {
      "category": "Safety | Technical | Administrative",
      "clause": "string",
      "description": "string",
      "reason": "detailed explanation",
      "immediateAction": "what must be done",
      "riskLevel": "High | Medium | Low"
    }
  ],
  "administrativeDetails": {
    "physicalAddress": "string | null",
    "erfNumber": "string | null",
    "registeredPerson": "string | null",
    "idNumber": "string | null (masked for privacy)",
    "registrationNumber": "string | null",
    "registrationType": "string | null",
    "registrationExpiry": "YYYY-MM-DD | null",
    "installationType": "Domestic | Commercial | Industrial | Mixed",
    "supplyPhases": "Single | Three",
    "supplySystem": "TN-S | TN-C-S | TT | IT"
  },
  "technicalEvaluation": [
    {
      "section": "string",
      "clause": "string",
      "requirement": "string",
      "finding": "string",
      "status": "Pass | Fail | Not Applicable | Not Tested",
      "measuredValues": ["string"],
      "notes": "string"
    }
  ],
  "circuitSchedule": [
    {
      "circuitNumber": "string",
      "description": "string",
      "cableSize": "string",
      "protectionRating": "string",
      "rcdProtected": true | false,
      "status": "Pass | Fail"
    }
  ],
  "recommendations": ["string"],
  "complianceNotes": ["string"],
  "auditTrail": [
    {
      "timestamp": "ISO 8601",
      "checkId": "string",
      "clause": "string",
      "action": "Evaluated | Verified | Recorded | Flagged",
      "result": "Pass | Fail | Skipped"
    }
  ],
  "summary": {
    "totalChecks": 0,
    "passedChecks": 0,
    "failedChecks": 0,
    "notTested": 0,
    "notApplicable": 0,
    "criticalFailures": 0,
    "majorIssues": 0,
    "minorIssues": 0
  },
  "extractionNotes": ["Any issues with reading the document"]
}
\`\`\`

## ✅ Verification Logic (STRICT)

1. **COC Hierarchy Validation (EXECUTE FIRST):**
   - Identify COC Type: Initial / Supplementary / Temporary
   - If Supplementary/Temporary: Verify Initial COC reference exists
   - **FAIL IMMEDIATELY if hierarchy is invalid (missing Initial COC reference)**
   - Note: COCs do NOT expire - do not check for expiry

2. **Document Quality Assessment:**
   - Rate image/scan quality
   - Note any unreadable sections
   - Flag missing pages

3. **Mandatory Check Sequence:**
   - COC-INIT-001: Initial COC exists (for Supplementary/Temporary) (CRITICAL)
   - COC-SUPP-001: Supplementary COC references Initial (CRITICAL)
   - COC-TEMP-001: Temporary COC validity period (CRITICAL)
   - COC-VALID-001: Overall hierarchy compliance (CRITICAL)
   - EARTH-001: Earth resistance (CRITICAL)
   - LOOP-001: Earth loop impedance (CRITICAL)
   - INSUL-001: Insulation resistance (CRITICAL)
   - RCD-001: RCD functionality (CRITICAL)
   - POL-001: Polarity and continuity (CRITICAL)
   - COND-001: Conductor sizing (MANDATORY)
   - OCP-001: Overcurrent protection (MANDATORY)
   - DOC-001: Documentation (MANDATORY)
   - CERT-DATE-001: Certificate validity (MANDATORY)

4. **Overall Status Determination:**
   - **PASS:** COC hierarchy valid AND ALL safety-critical checks pass AND ALL mandatory checks pass AND no critical failures
   - **FAIL:** COC hierarchy invalid OR ANY safety-critical failure OR 2+ mandatory failures
   - **INCOMPLETE:** Missing >30% of required test data

5. **Confidence Score:**
   - 90-100: Clear document, all values extracted, high certainty
   - 70-89: Some values unclear but primary checks verifiable
   - 50-69: Several values unclear, moderate uncertainty
   - <50: Poor quality, many values unreadable

6. **Remediation Guidance:**
   - Specific to the failure
   - Reference correct SANS clause or hierarchy rule
   - Include measurement that would constitute pass
   - Suggest corrective actions

## 🚨 Red Flags (Automatic FAIL)
**COC Type & Hierarchy Failures:**
- COC Type checkbox NOT ticked/marked → Non-compliant (certificate incomplete)
- Supplementary COC without Initial COC reference → Non-compliant
- Temporary COC without Initial COC reference → Non-compliant

**Technical Failures:**
- Earth resistance > 5Ω on any system type
- Any insulation resistance < 0.25MΩ
- RCD no-trip at rated current
- Missing signature or registration number
- Future-dated certificate
- Certificate > 5 years old without periodic inspection

## 📋 Notes for PDF Analysis
When analyzing a PDF or image:
- Read ALL text visible on the document
- Look for handwritten values in test result boxes
- Check for stamps and signatures
- Verify all pages are present
- Note any alterations or corrections

Now analyze the provided COC document with strict SANS 10142-1:2020 compliance:`;

// Interface for validation settings from database
interface ValidationSettings {
  earth_continuity_max_ohms: number;
  insulation_resistance_min_mohms: number;
  rcd_trip_1x_max_ms: number;
  rcd_trip_5x_max_ms: number;
  rcd_trip_max_ms: number;
  coc_expiry_domestic_years: number;
  coc_expiry_commercial_years: number;
  ai_confidence_threshold_percent: number;
  hierarchy_check_enabled: boolean;
  earth_continuity_check_enabled: boolean;
  insulation_resistance_check_enabled: boolean;
  protective_conductor_check_enabled: boolean;
  certificate_date_validation_enabled: boolean;
  rcd_function_check_enabled: boolean;
  signature_check_enabled: boolean;
  auto_fail_missing_initial_ref: boolean;
  auto_fail_invalid_certificate: boolean;
  auto_fail_future_dated: boolean;
  auto_fail_earth_resistance_threshold: boolean;
  auto_fail_missing_signature: boolean;
  mandatory_failures_for_fail: number;
  safety_critical_failures_for_fail: number;
  ai_model: string;
  ai_temperature: number;
}

// Default settings matching SANS 10142-1:2020
const DEFAULT_SETTINGS: ValidationSettings = {
  earth_continuity_max_ohms: 5.0,
  insulation_resistance_min_mohms: 0.25,
  rcd_trip_1x_max_ms: 300,
  rcd_trip_5x_max_ms: 150,
  rcd_trip_max_ms: 40,
  coc_expiry_domestic_years: 5,
  coc_expiry_commercial_years: 2,
  ai_confidence_threshold_percent: 30,
  hierarchy_check_enabled: true,
  earth_continuity_check_enabled: true,
  insulation_resistance_check_enabled: true,
  protective_conductor_check_enabled: true,
  certificate_date_validation_enabled: true,
  rcd_function_check_enabled: true,
  signature_check_enabled: true,
  auto_fail_missing_initial_ref: true,
  auto_fail_invalid_certificate: true,
  auto_fail_future_dated: true,
  auto_fail_earth_resistance_threshold: true,
  auto_fail_missing_signature: true,
  mandatory_failures_for_fail: 2,
  safety_critical_failures_for_fail: 1,
  ai_model: 'google/gemini-3-pro-preview',
  ai_temperature: 0.1,
};

// Build dynamic validation prompt based on settings
function buildDynamicPrompt(settings: ValidationSettings): string {
  const skipChecks: string[] = [];
  if (!settings.hierarchy_check_enabled) skipChecks.push('COC Hierarchy checks');
  if (!settings.earth_continuity_check_enabled) skipChecks.push('Earth Continuity checks (Clause 8.4)');
  if (!settings.insulation_resistance_check_enabled) skipChecks.push('Insulation Resistance checks (Clause 8.6)');
  if (!settings.protective_conductor_check_enabled) skipChecks.push('Protective Conductor checks (Clause 8.7)');
  if (!settings.certificate_date_validation_enabled) skipChecks.push('Certificate Date validation');
  if (!settings.rcd_function_check_enabled) skipChecks.push('RCD Function checks (Clause 8.8)');
  if (!settings.signature_check_enabled) skipChecks.push('Signature verification');
  
  const skipSection = skipChecks.length > 0 
    ? `\n\n## ⏭️ SKIPPED CHECKS (Disabled by Configuration)
The following checks are DISABLED and should be marked as "Not Applicable" in your response:
${skipChecks.map(c => `- ${c}`).join('\n')}
`
    : '';

  const configSection = `
## ⚙️ CONFIGURABLE THRESHOLDS (Applied from Settings)
The following thresholds are configured for this validation:

### Technical Thresholds:
- **Earth Continuity Maximum**: ${settings.earth_continuity_max_ohms}Ω (SANS default: 5Ω)
- **Insulation Resistance Minimum**: ${settings.insulation_resistance_min_mohms}MΩ (SANS default: 0.25MΩ)
- **RCD Trip @ 1×IΔn Maximum**: ${settings.rcd_trip_1x_max_ms}ms (SANS default: 300ms)
- **RCD Trip @ 5×IΔn Maximum**: ${settings.rcd_trip_5x_max_ms}ms (SANS default: 40ms)
- **RCD Trip Maximum**: ${settings.rcd_trip_max_ms}ms

### Certificate Validity:
- **Domestic COC Expiry**: ${settings.coc_expiry_domestic_years} years
- **Commercial COC Expiry**: ${settings.coc_expiry_commercial_years} years

### Confidence Threshold:
- **Minimum AI Confidence**: ${settings.ai_confidence_threshold_percent}%
${skipSection}
`;

  // Insert the configuration section after the objective in the main prompt
  return VALIDATION_PROMPT.replace(
    '## 📜 COC TYPE HIERARCHY',
    `${configSection}\n## 📜 COC TYPE HIERARCHY`
  );
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Accept approvedCocType and testSettings as optional parameters
    const { documentId, documentUrl, subsectionId, approvedCocType, testSettings } = await req.json();
    
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
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(storagePath);
    
    if (downloadError || !fileData) {
      console.error('Storage download error:', downloadError);
      throw new Error(`Failed to download document: ${downloadError?.message || 'Unknown error'}`);
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
              text: `Please analyze this COC document image/PDF and validate it against SANS 10142-1:2020 standards. Extract ALL visible information including handwritten test values, stamps, and signatures. Return ONLY the JSON validation result.`
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
        
        // ===== USER-APPROVED COC TYPE OVERRIDE (HIGHEST PRIORITY) =====
        // If the user approved a cocType from extraction UI, use that instead of AI detection
        if (approvedCocType) {
          const normalizedApproved = approvedCocType.charAt(0).toUpperCase() + approvedCocType.slice(1).toLowerCase();
          console.log('🎯 USER-APPROVED COC TYPE OVERRIDE');
          console.log(`   AI detected cocType: ${validationResult.cocType}`);
          console.log(`   User approved cocType: ${normalizedApproved}`);
          console.log(`   USING user-approved type: ${normalizedApproved}`);
          
          if (!validationResult.extractionNotes) {
            validationResult.extractionNotes = [];
          }
          validationResult.extractionNotes.push(
            `USER OVERRIDE: cocType set to "${normalizedApproved}" from extraction approval (AI detected: "${validationResult.cocType}")`
          );
          
          // Apply the user-approved override
          validationResult.cocType = normalizedApproved;
          
          // Update hierarchyValidation if present
          if (validationResult.hierarchyValidation) {
            validationResult.hierarchyValidation.cocTypeIdentified = normalizedApproved;
          }
          
          // Skip checkbox analysis since user already confirmed the type
          console.log('   Skipping checkbox analysis - user approval takes precedence');
        } else {
          // ===== CHECKBOX STATES VALIDATION & LOGGING =====
          // Log the raw checkbox states for debugging
          console.log('=== CHECKBOX STATES DEBUG ===');
          console.log('Raw checkboxStates:', JSON.stringify(validationResult.checkboxStates, null, 2));
          console.log('Reported cocType:', validationResult.cocType);
          
          // Validate checkbox states match cocType - SERVER-SIDE OVERRIDE if mismatch
          if (validationResult.checkboxStates) {
            const cs = validationResult.checkboxStates;
            const initialMarked = cs.initialBox?.toUpperCase() === 'MARKED';
            const supplementaryMarked = cs.supplementaryBox?.toUpperCase() === 'MARKED';
            const temporaryMarked = cs.temporaryBox?.toUpperCase() === 'MARKED';
            
            console.log('Checkbox analysis:', {
              initialMarked,
              supplementaryMarked,
              temporaryMarked,
              initialDesc: cs.initialBoxDescription,
              supplementaryDesc: cs.supplementaryBoxDescription,
              temporaryDesc: cs.temporaryBoxDescription
            });
            
            // Determine correct cocType from checkbox states
            let correctCocType: string | null = null;
            if (initialMarked && !supplementaryMarked && !temporaryMarked) {
              correctCocType = 'Initial';
            } else if (supplementaryMarked && !initialMarked && !temporaryMarked) {
              correctCocType = 'Supplementary';
            } else if (temporaryMarked && !initialMarked && !supplementaryMarked) {
              correctCocType = 'Temporary';
            } else if (!initialMarked && !supplementaryMarked && !temporaryMarked) {
              correctCocType = null; // No checkbox marked
            } else {
              // Multiple marked - unusual, log and use AI's decision
              console.log('WARNING: Multiple checkboxes reported as marked, using AI decision');
              correctCocType = validationResult.cocType;
            }
            
            // Check for mismatch and OVERRIDE if necessary
            if (correctCocType !== validationResult.cocType) {
              console.log('🚨 COC TYPE MISMATCH DETECTED!');
              console.log(`   AI reported cocType: ${validationResult.cocType}`);
              console.log(`   Checkbox states indicate: ${correctCocType}`);
              console.log(`   OVERRIDING cocType to: ${correctCocType}`);
              
              // Add extraction note about the override
              if (!validationResult.extractionNotes) {
                validationResult.extractionNotes = [];
              }
              validationResult.extractionNotes.push(
                `SERVER OVERRIDE: cocType changed from "${validationResult.cocType}" to "${correctCocType}" based on checkboxStates analysis`
              );
              
              // Apply the override
              validationResult.cocType = correctCocType;
              
              // Also update hierarchyValidation if present
              if (validationResult.hierarchyValidation) {
                validationResult.hierarchyValidation.cocTypeIdentified = correctCocType;
              }
            } else {
              console.log('✓ cocType matches checkboxStates - no override needed');
            }
          } else {
            console.log('⚠️ WARNING: checkboxStates field missing from AI response');
            if (!validationResult.extractionNotes) {
              validationResult.extractionNotes = [];
            }
            validationResult.extractionNotes.push('WARNING: AI did not provide checkboxStates field');
          }
        }
        
        // ===== LOG FINAL COC TYPE BEFORE POST-PROCESSING =====
        console.log('=== FINAL COC TYPE BEFORE POST-PROCESSING ===');
        console.log('Final cocType:', validationResult.cocType);
        
        // ===== POST-PROCESSING: REMOVE INVALID VIOLATIONS FOR INITIAL COCs =====
        // If this is an Initial COC, remove any "Missing Initial COC Reference" violations
        // because Initial COCs do NOT need to reference another COC
        const currentCocType = validationResult.cocType?.toLowerCase();
        console.log('=== POST-PROCESSING VIOLATIONS ===');
        console.log('Current COC Type:', currentCocType);
        console.log('Current COC Type:', currentCocType);
        
        if (currentCocType === 'initial') {
          console.log('🔧 Initial COC detected - filtering out invalid hierarchy violations');
          
          // Filter criticalFailures to remove invalid violations
          if (validationResult.criticalFailures && Array.isArray(validationResult.criticalFailures)) {
            const originalCount = validationResult.criticalFailures.length;
            validationResult.criticalFailures = validationResult.criticalFailures.filter((failure: any) => {
              const description = (failure.description || '').toLowerCase();
              const reason = (failure.reason || '').toLowerCase();
              const clause = (failure.clause || '').toLowerCase();
              
              // Check if this is a "Missing Initial COC Reference" violation
              const isMissingRefViolation = 
                description.includes('missing initial coc') ||
                description.includes('does not reference') ||
                description.includes('without referencing') ||
                description.includes('initial coc reference') ||
                reason.includes('missing initial coc') ||
                reason.includes('does not reference') ||
                reason.includes('without referencing') ||
                reason.includes('initial coc reference') ||
                (clause.includes('hierarchy') && (description.includes('supplementary') || description.includes('reference')));
              
              if (isMissingRefViolation) {
                console.log('  ❌ REMOVED invalid violation:', failure.description || failure.reason);
                return false; // Remove this violation
              }
              return true; // Keep this violation
            });
            
            const removedCount = originalCount - validationResult.criticalFailures.length;
            if (removedCount > 0) {
              console.log(`  ✓ Removed ${removedCount} invalid violation(s) for Initial COC`);
              if (!validationResult.extractionNotes) {
                validationResult.extractionNotes = [];
              }
              validationResult.extractionNotes.push(
                `SERVER FILTER: Removed ${removedCount} "Missing Initial COC Reference" violation(s) - Initial COCs do not need to reference another COC`
              );
            }
          }
          
          // Also filter checks array if present
          if (validationResult.checks && Array.isArray(validationResult.checks)) {
            validationResult.checks = validationResult.checks.map((check: any) => {
              const checkDesc = (check.description || check.check || '').toLowerCase();
              if (
                check.result === 'Fail' && 
                (checkDesc.includes('initial coc reference') || 
                 checkDesc.includes('missing initial coc') ||
                 checkDesc.includes('supplementary coc') && checkDesc.includes('reference'))
              ) {
                console.log('  🔧 Changed check result to Not Applicable:', check.description || check.check);
                return {
                  ...check,
                  result: 'Not Applicable',
                  notes: (check.notes || '') + ' [SERVER: Not applicable for Initial COC]'
                };
              }
              return check;
            });
          }
          
          // Update hierarchyValidation if this incorrect violation was reported
          if (validationResult.hierarchyValidation) {
            if (validationResult.hierarchyValidation.issues && Array.isArray(validationResult.hierarchyValidation.issues)) {
              validationResult.hierarchyValidation.issues = validationResult.hierarchyValidation.issues.filter((issue: any) => {
                const issueStr = (issue || '').toLowerCase();
                return !issueStr.includes('missing initial') && 
                       !issueStr.includes('does not reference') &&
                       !issueStr.includes('without referencing');
              });
            }
            // Recalculate if valid based on remaining issues
            if (validationResult.hierarchyValidation.issues?.length === 0) {
              validationResult.hierarchyValidation.isValid = true;
            }
          }
          
          // Recalculate summary counts
          if (validationResult.criticalFailures?.length === 0 && validationResult.checks) {
            const passCount = validationResult.checks.filter((c: any) => c.result === 'Pass').length;
            const failCount = validationResult.checks.filter((c: any) => c.result === 'Fail').length;
            if (failCount === 0 && passCount > 0) {
              validationResult.overallStatus = 'Pass';
              console.log('  ✓ Updated overallStatus to Pass after removing invalid violations');
            }
          }
          
          // Update summary
          if (validationResult.summary) {
            validationResult.summary.criticalFailures = validationResult.criticalFailures?.length || 0;
            validationResult.summary.failedChecks = validationResult.checks?.filter((c: any) => c.result === 'Fail').length || 0;
            validationResult.summary.notApplicable = validationResult.checks?.filter((c: any) => c.result === 'Not Applicable').length || 0;
          }
        }
        // ===== END POST-PROCESSING =====
        // ===== END CHECKBOX STATES VALIDATION =====
        
        // ===== APPLY AUTO-FAIL RULES FROM SETTINGS =====
        console.log('=== APPLYING AUTO-FAIL RULES ===');
        if (!validationResult.criticalFailures) {
          validationResult.criticalFailures = [];
        }
        
        // Check auto-fail conditions based on settings
        if (validationSettings.auto_fail_future_dated && validationResult.cocIssueDate) {
          const issueDate = new Date(validationResult.cocIssueDate);
          const today = new Date();
          if (issueDate > today) {
            console.log('🚨 AUTO-FAIL: Future-dated certificate detected');
            validationResult.criticalFailures.push({
              category: 'Administrative',
              clause: 'CERT-DATE-001',
              description: 'Future-dated certificate',
              reason: `Certificate issue date (${validationResult.cocIssueDate}) is in the future`,
              immediateAction: 'Verify the certificate date with the issuer',
              riskLevel: 'Critical'
            });
          }
        }
        
        if (validationSettings.auto_fail_missing_signature) {
          const signatureCheck = validationResult.checks?.find((c: any) => 
            c.checkId === 'SIG-001' || c.description?.toLowerCase().includes('signature')
          );
          if (signatureCheck?.result === 'Fail') {
            console.log('🚨 AUTO-FAIL: Missing signature detected');
          }
        }
        
        // Apply mandatory/safety-critical failure thresholds
        const mandatoryFailures = validationResult.checks?.filter((c: any) => 
          c.result === 'Fail' && c.category === 'Mandatory'
        ).length || 0;
        
        const safetyCriticalFailures = validationResult.checks?.filter((c: any) => 
          c.result === 'Fail' && c.category === 'Safety-Critical'
        ).length || 0;
        
        console.log('Failure counts:', { mandatoryFailures, safetyCriticalFailures });
        
        // Determine if status should be FAIL based on thresholds
        if (safetyCriticalFailures >= validationSettings.safety_critical_failures_for_fail) {
          console.log(`🚨 FAIL: ${safetyCriticalFailures} safety-critical failures >= threshold ${validationSettings.safety_critical_failures_for_fail}`);
          validationResult.overallStatus = 'Fail';
        } else if (mandatoryFailures >= validationSettings.mandatory_failures_for_fail) {
          console.log(`🚨 FAIL: ${mandatoryFailures} mandatory failures >= threshold ${validationSettings.mandatory_failures_for_fail}`);
          validationResult.overallStatus = 'Fail';
        }
        
        // Add settings used to extraction notes for transparency
        if (!validationResult.extractionNotes) {
          validationResult.extractionNotes = [];
        }
        validationResult.extractionNotes.push(
          `Settings Applied: AI Model=${validationSettings.ai_model}, ` +
          `Earth Max=${validationSettings.earth_continuity_max_ohms}Ω, ` +
          `IR Min=${validationSettings.insulation_resistance_min_mohms}MΩ, ` +
          `Mandatory Fail Threshold=${validationSettings.mandatory_failures_for_fail}`
        );
        // ===== END AUTO-FAIL RULES =====
        
        // Validate required fields
        if (!validationResult.overallStatus) {
          validationResult.overallStatus = 'Incomplete';
        }
        if (!validationResult.checks) {
          validationResult.checks = [];
        }
        if (!validationResult.summary) {
          validationResult.summary = {
            totalChecks: validationResult.checks?.length || 0,
            passedChecks: validationResult.checks?.filter((c: any) => c.result === 'Pass').length || 0,
            failedChecks: validationResult.checks?.filter((c: any) => c.result === 'Fail').length || 0,
            notTested: validationResult.checks?.filter((c: any) => c.result === 'Not Tested').length || 0,
            notApplicable: validationResult.checks?.filter((c: any) => c.result === 'Not Applicable').length || 0,
            criticalFailures: validationResult.criticalFailures?.length || 0
          };
        }
        
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
    // Sync coc_type from AI extraction - this ensures the stored type matches what's on the certificate
    if (validationResult.cocType) {
      documentUpdateData.coc_type = validationResult.cocType;
      console.log('Syncing coc_type from AI extraction:', validationResult.cocType);
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
      // Update if: no current COC, or this one is valid and current is not, or this is newer
      const statusPriority: Record<string, number> = {
        'valid': 4,
        'Approved': 4,
        'invalid': 3,
        'Failed': 3,
        'pending': 2,
        'Missing': 1,
        '': 0
      };
      
      const currentPriority = statusPriority[currentSubsection?.coc_status || ''] || 0;
      const newPriority = statusPriority[mappedSubsectionStatus] || 0;
      
      // Update subsection if: no current data, new is higher priority, or same priority but newer date
      const shouldUpdate = !currentSubsection?.coc_number || 
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
          validationEngine: 'SANS-10142-1-2020-v3',
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
        administrativeDetails: validationResult.administrativeDetails,
        technicalEvaluation: validationResult.technicalEvaluation,
        recommendations: validationResult.recommendations,
        extractionNotes: validationResult.extractionNotes,
        report: validationResult,
        settingsApplied: {
          ai_model: validationSettings.ai_model,
          ai_temperature: validationSettings.ai_temperature,
          earth_continuity_max_ohms: validationSettings.earth_continuity_max_ohms,
          insulation_resistance_min_mohms: validationSettings.insulation_resistance_min_mohms,
          mandatory_failures_for_fail: validationSettings.mandatory_failures_for_fail,
          safety_critical_failures_for_fail: validationSettings.safety_critical_failures_for_fail
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
