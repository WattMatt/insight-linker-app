import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

// COC validation edge function - validates electrical certificates against SANS 10142-1:2020
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALIDATION_PROMPT = `# ⚡ SANS 10142-1:2020 Electrical COC Verification Engine (v4 — Strict Empirical)

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
6. **Registration Category**: Extract the issuer's registration category:
   - "Electrical Tester for Single Phase" / "ETS"
   - "Installation Electrician" / "IE"
   - "Master Installation Electrician" / "MIE"
7. **Supply Phases**: "Single" or "Three" (extract from installation details)

### ⚠️ NUMERIC STANDARDIZATION RULES (CRITICAL):
When extracting test values, apply these normalization rules:
- Convert "1,5 Meg" → "1.5" (comma = decimal in SA notation)
- Convert "1.5 MΩ" → "1.5" (strip units, keep numeric)
- Convert "OL" or "∞" → "∞" (infinity = beyond meter range)
- Convert ">500" → "∞" (beyond meter range)
- Convert "OK", "Pass", "✓", "Satisfactory" → report AS-IS (the server will handle these)

### ⚠️ HANDWRITING RECOGNITION GUIDANCE:
Pay special attention to these commonly handwritten electrical symbols:
- V (volts), A (amps), mA (milliamps)
- MΩ (megaohms) — often written as "M Ω", "Meg", "Mohm"
- Zs (earth loop impedance in ohms)
- ms (milliseconds for RCD times)
- kA (kiloamps for PSCC)
- ∞ (infinity — often a sideways "8" or loop shape)

### Technical Test Results (EXTRACT ALL VALUES):
- Earth resistance readings (in Ω)
- Insulation resistance per circuit (in MΩ)
- Earth loop impedance (Zs) readings (in Ω)
- RCD trip times at IΔn and 5×IΔn (in ms)
- Polarity test results
- Continuity readings (in Ω)
- Prospective short-circuit current / PSCC (in kA) — MANDATORY
- MCB/breaker ratings for each circuit (in A)
- MCB type if visible (Type B, C, or D)

### ⚠️ EMPIRICAL MEASUREMENT MANDATE (LEGALLY REQUIRED):
For the following test fields, a NUMERIC VALUE is LEGALLY REQUIRED by SANS 10142-1.
Generic text marks like "OK", "Pass", "Good", "Satisfactory", or checkmarks (✓) are
NOT legally acceptable substitutes for empirical measurements:

1. **Earth Resistance** (EARTH-001): Must be a number in Ω (e.g., "2.3Ω")
2. **Insulation Resistance** (INSUL-001): Must be a number in MΩ or ∞/OL (e.g., "1.5MΩ", "∞")
3. **Earth Loop Impedance** (LOOP-001): Must be a number in Ω (e.g., "0.85Ω")
4. **RCD Trip Time** (RCD-001): Must be a number in ms (e.g., "28ms")
5. **PSCC** (PSCC-001): Must be a number in kA (e.g., "4.5kA") — PSCC must not exceed breaker breaking capacity

If any of these fields contain ONLY text like "OK", "Pass", "Satisfactory", "Compliant",
or a checkmark instead of a measurement, extract the value AS-IS and the server will flag it.

### QR Code Data (Informational):
If a QR code is present on the certificate, note its presence.
Extract any embedded URL if visible (informational only, not validated).

### Circuit Schedule Data:
- Circuit numbers and descriptions
- Cable sizes (mm²)
- Protective device ratings (A)
- MCB types (B, C, D) if visible
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

### 🛡️ INSULATION RESISTANCE (Clause 8.6) ⚠️ CRITICAL SAFETY CHECK ⚠️
**Check ID:** INSUL-001

**⚡⚡⚡ MANDATORY THRESHOLD - NO EXCEPTIONS ⚡⚡⚡**

**Minimum Values (STRICT ENFORCEMENT):**
| Circuit Voltage | Test Voltage | Minimum IR     | Rule                    |
|-----------------|--------------|----------------|-------------------------|
| SELV/PELV       | 250V DC      | ≥ 0.5MΩ        | FAIL if < 0.5MΩ         |
| ≤ 500V          | 500V DC      | ≥ 1.0MΩ        | FAIL if < 1.0MΩ         |
| > 500V          | 1000V DC     | ≥ 1.0MΩ        | FAIL if < 1.0MΩ         |

**🟢 AUTOMATIC PASS CONDITIONS:**
- Numeric value ≥ 1.0MΩ (e.g., "1.5MΩ", "2.0MΩ", "500MΩ")
- Infinity symbols: ∞, >∞, OL, >500, >999, >500MΩ, "infinite", "over limit"
- These indicate resistance beyond meter range (excellent insulation)

**🔴 AUTOMATIC FAIL CONDITIONS (NO EXCEPTIONS - SAFETY CRITICAL):**
- ANY numeric value BELOW the threshold is an IMMEDIATE FAIL
- Examples that MUST FAIL: 0.1MΩ, 0.3MΩ, 0.5MΩ, 0.6MΩ, 0.8MΩ, 0.9MΩ, 0.99MΩ
- Specifically: 0.6MΩ < 1.0MΩ → FAIL (insulation breakdown risk)
- Missing/blank values → FAIL (test not performed)

**⚠️ CRITICAL: INFINITY SYMBOL RECOGNITION ⚠️**
The infinity symbol (∞) is commonly handwritten on COCs as a sideways "8" or a loop shape.
It may also appear as "OL" (overload), ">500", or ">999".
These are NOT blank fields — they indicate the meter could not measure a finite value (excellent insulation).
If you see ANY mark in a test result field that could be ∞, OL, or a loop/figure-8 shape, report it as "∞" NOT as "blank" or "missing".

**⚠️ DO NOT CONFUSE:**
- "∞" (infinity) = PASS (excellent insulation, beyond meter range)
- "0.6MΩ" = FAIL (below 1.0MΩ threshold, dangerous)

**Remediation for FAIL:** Identify and replace damaged cable insulation, check for moisture ingress, verify correct test procedure was followed.
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

### ⚡ OVERCURRENT PROTECTION & PSCC (Clause 8.3)
**Check ID:** OCP-001 / PSCC-001
**Requirements:**
- In ≤ Iz (device rating ≤ cable current capacity)
- I2 ≤ 1.45 × Iz (conventional tripping current)
- Breaking capacity > prospective fault current (PSCC)
- Coordination with upstream devices (discrimination)

**PSCC-001 Specific:**
- Extract the PSCC value (in kA) from the test results
- Extract the main breaker/incomer breaking capacity (in kA) — typically 6kA for domestic, 10-25kA for commercial
- **PASS:** PSCC < breaker breaking capacity
- **FAIL:** PSCC ≥ breaker breaking capacity (inadequate protection)
- Common domestic MCBs: 6kA breaking capacity
- Common commercial MCBs: 10kA or 25kA breaking capacity

**PASS:** All protective devices correctly rated and coordinated
**FAIL:** Oversized protection, inadequate breaking capacity, PSCC exceeds rated capacity

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
      "remediation": "The certificate type checkbox must be ticked by the issuer."
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
  "criticalFailures": [
    {
      "category": "Safety | Technical | Administrative",
      "clause": "string",
      "section": "string (Page X) - REQUIRED: Include page number",
      "description": "string - what is wrong",
      "reason": "detailed explanation with EXACT quoted evidence",
      "evidence": "Page X, Section Y shows: '[exact quoted text or value]'",
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
    - PSCC-001: Prospective short-circuit current vs breaker capacity (CRITICAL)
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

## 🚫🚫🚫 ANTI-HALLUCINATION RULES (CRITICAL - ZERO TOLERANCE) 🚫🚫🚫

**VIOLATION OF THESE RULES RENDERS THE ENTIRE VALIDATION INVALID.**

### RULE 1: ABSOLUTE TRUTH REQUIREMENT
You MUST NOT fabricate, invent, assume, or infer ANY information that is NOT directly visible and readable in the document.

**FORBIDDEN BEHAVIORS:**
❌ Inventing quotes: "Annexure 1 states..." "The document indicates..." "Section X shows..."
❌ Fabricating measurements: "Cable size is 50mm²" when no such value is visible
❌ Creating technical details: "neutral wire reduced to 16mm²" without visible evidence
❌ Inferring conditions: "compromised current carrying capacity" without stated evidence
❌ Assuming content exists: Describing content from sections you cannot see
❌ Making up annexure content: Annexures often don't exist or contain different information

### RULE 2: EVIDENCE-FIRST FAILURES
Every failure MUST be supported by DIRECT, VISIBLE evidence:

**REQUIRED FORMAT for criticalFailures:**
\`\`\`json
{
  "clause": "8.6",
  "section": "Test Results - Insulation Resistance (Page 2)",
  "description": "MUST describe only what IS visible, not what should be",
  "reason": "MUST quote or reference EXACT visible text/values from document",
  "evidence": "Page 2, Row 3 shows: '[exact quoted text or value]'"
}
\`\`\`

⚠️ CRITICAL: The "section" field MUST include the page number in parentheses (e.g., "(Page 1)", "(Page 2)") so users can navigate directly to the issue location.

**FORBIDDEN in failure descriptions:**
❌ "Document states..." → Only if you can quote the EXACT text
❌ "Annexure indicates..." → Only if Annexure is visible AND you quote it
❌ "Testing shows..." → Only if test values are visible AND you cite them
❌ Narrative descriptions of technical issues not directly stated

**ALLOWED in failure descriptions:**
✅ "Test result field shows '0.15 MΩ' which is below 0.25 MΩ minimum"
✅ "Registration number field is blank/empty"
✅ "Date field shows '2026-05-15' which is a future date"
✅ "No visible signature in signature block area"
✅ "Value unclear/unreadable in this field"

### RULE 2b: SIGNATURE DETECTION GUIDANCE
A signature IS present if ANY of these appear in the signature area:
- Handwritten signature (cursive, initials, or any pen mark)
- Rubber stamp with name/registration number
- Digital/electronic signature
- Printed name with a mark or initial beside it
- Any ink mark that is clearly intentional in the signature block

A signature is ONLY "missing" if the signature block area is **completely blank/empty** with NO marks whatsoever.
⚠️ If you see ANY mark in the signature area, report the signature as PRESENT.
⚠️ Do NOT fail signatures just because they are hard to read or partially obscured.

### RULE 3: VISIBILITY VERIFICATION
Before including ANY information in your response, verify:

1. **CAN I SEE IT?**
   - Can I point to the exact pixel/area where this appears? → YES = Include
   - Am I inferring from context or assumptions? → YES = DO NOT Include
   
2. **CAN I QUOTE IT?**
   - Can I provide the EXACT text/value I'm reading? → YES = Include
   - Am I paraphrasing or summarizing unseen content? → YES = DO NOT Include

3. **IS IT REAL?**
   - Is this value actually printed/written on the document? → YES = Include
   - Am I generating content that "should be" or "typically is" there? → YES = DO NOT Include

### RULE 4: HANDLING MISSING/UNCLEAR INFORMATION
When information is missing or unclear:

**DO:**
✅ Set value to null in JSON
✅ Add note to extractionNotes: "Field X not visible/readable"
✅ Mark relevant check as "Not Tested" with reason "Value not visible in document"
✅ Report the ABSENCE of required information (not fabricated presence)

**DO NOT:**
❌ Guess what the value might be
❌ Use typical/expected values
❌ Describe what the content "should" contain
❌ Generate plausible-sounding technical descriptions

### RULE 5: ANNEXURE AND SUPPLEMENTARY PAGE RULES
**SPECIAL WARNING:** Annexures are the #1 source of AI hallucination.

1. If you CANNOT see an Annexure → DO NOT reference its content
2. If an Annexure IS visible → Quote ONLY text you can directly read
3. NEVER generate statements like:
   - "Annexure 1 states: '[made-up content]'"
   - "According to the attached Annexure..."
   - "The installation notes indicate..."
4. If Annexure exists but is unclear → say "Annexure visible but content unreadable"

### RULE 6: FAILURE GENERATION RESTRICTIONS
You may ONLY generate failures for:

1. **Missing required fields** (field is blank/empty - VISIBLE absence)
2. **Out-of-range values** (VISIBLE value compared to stated threshold)
3. **Invalid dates** (VISIBLE date is in future or formatted incorrectly)
4. **Checkbox status** (VISIBLE checkbox is unmarked when required)
5. **Missing signatures** (signature area is VISIBLY empty)

You may NOT generate failures for:
❌ Technical issues you "detected" but cannot directly quote
❌ Cable sizing issues without visible cable size AND protection rating
❌ Installation quality issues not stated in visible test results
❌ Any issue requiring you to infer or assume information

### RULE 7: SELF-VERIFICATION CHECKLIST
Before submitting your response, verify EACH criticalFailure:

□ Can I screenshot the exact evidence? (If NO → DELETE THIS FAILURE)
□ Is my description factual without narrative embellishment? (If NO → REWRITE)
□ Did I quote actual visible text/values? (If NO → ADD QUOTES OR DELETE)
□ Am I describing what IS rather than what SHOULD BE? (If NO → REWRITE)
□ Would another person looking at this document reach the same conclusion from visible evidence? (If NO → DELETE)

### RULE 8: CONFIDENCE SCORE CORRELATION
Your confidence score MUST reflect evidence quality:

- **90-100:** Every failure has direct visible evidence with exact quotes
- **70-89:** Most evidence is visible, some fields unclear
- **50-69:** Significant portions unclear, limited direct evidence
- **<50:** Document quality prevents reliable extraction

**If you generate failures with low confidence → YOU ARE LIKELY HALLUCINATING**

### RULE 9: WHEN IN DOUBT, LEAVE IT OUT
If you are uncertain whether something is visible or accurate:
- DO NOT include it as a failure
- DO add it to extractionNotes with uncertainty flag
- DO reduce confidence score
- DO NOT try to be helpful by guessing

**REMEMBER: A validation with fewer accurate findings is infinitely more valuable than one with fabricated issues that waste everyone's time and undermine trust.**

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
- **RCD Trip @ 5×IΔn Maximum**: ${settings.rcd_trip_5x_max_ms}ms (SANS default: 150ms)
- **RCD Trip Maximum (for 2×IΔn)**: ${settings.rcd_trip_max_ms}ms (SANS default: 40ms)

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

// ============= DETERMINISTIC VALIDATION ENGINE =============
// This runs AFTER the AI extraction to apply mathematical rules server-side.
// The AI is treated as an extractor only; pass/fail decisions are made here.

// Text-based pass values commonly written on South African COC forms
// IMPORTANT: These are ONLY acceptable for non-empirical checks (POL-001, SIG-001).
// For empirical measurement fields (EARTH-001, INSUL-001, RCD-001, LOOP-001),
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
        // STRICT: Empirical measurement REQUIRED for earth resistance — text like "OK"/"Pass" is legally insufficient
        deterministicChecks.push({
          checkId: 'EARTH-001', result: 'Fail',
          measuredValue: earthCheck.measuredValue,
          limit: `≤ ${limit}Ω`,
          remediation: 'Empirical measurement required — generic text like "OK" or "Pass" is not legally acceptable for earth resistance. A numeric value in Ω must be recorded.',
          overrideReason: 'FAIL: Text-based value rejected — SANS 10142-1 requires empirical measurement in Ω'
        });
        mandatoryFailCount++;
        criticalFailures.push({
          category: 'Safety-Critical', clause: 'EARTH-001',
          description: `Earth resistance recorded as "${earthCheck.measuredValue}" — empirical measurement required`,
          reason: `SANS 10142-1 Clause 8.4 requires a numeric earth resistance value in Ω. "${earthCheck.measuredValue}" is not a valid measurement.`,
          immediateAction: 'Re-test earth resistance and record the actual measured value in Ω.',
          riskLevel: 'Critical'
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

  // --- 11. INCOMPLETE CERTIFICATE DETECTION — CERT-INCOMPLETE-001 ---
  {
    const empiricalCheckIds = ['EARTH-001', 'INSUL-001', 'RCD-001', 'LOOP-001'];
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
  // The deterministic engine (steps 1-11 above) is the SOLE authority for safety-critical decisions.
  const handledIds = new Set(['EARTH-001', 'INSUL-001', 'RCD-001', 'LOOP-001', 'POL-001', 'COC-TYPE-001', 
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
