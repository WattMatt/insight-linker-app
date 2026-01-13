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
- On the certificate, there are checkboxes/tick boxes for: Initial, Supplementary, Temporary
- The certificate issuer MUST tick/mark ONE of these boxes to indicate the certificate type
- If NO checkbox is ticked/marked, this is an AUTOMATIC FAIL - the certificate is incomplete
- Do NOT guess or infer the type from other information - look for an EXPLICIT tick/mark
- If cocType cannot be determined from a visible tick/mark, set cocType to null and FAIL

### 1. INITIAL COC REQUIREMENT (Baseline Rule)
- Every premises MUST have a valid Initial COC issued
- Without an Initial COC, no Supplementary or Temporary COC can render the premises compliant
- The Initial COC establishes the baseline compliance state for the installation
- **CHECK ID:** COC-INIT-001

### 2. SUPPLEMENTARY COC RULES
A Supplementary COC may only be valid if:
  a) The Initial COC exists and is valid
  b) The Supplementary COC explicitly references the Initial COC number
- If no Initial COC number is listed, the Supplementary COC is INVALID
- Supplementary COCs extend or modify compliance but CANNOT replace the Initial COC
- Use for: Additions, alterations, or modifications to existing installations
- **CHECK ID:** COC-SUPP-001

### 3. TEMPORARY COC RULES
- A Temporary COC may be issued for provisional compliance (e.g., pending remedial work)
- Temporary COCs MUST reference the Initial COC number
- Temporary COCs CANNOT establish compliance alone - they only provide temporary authorization
- **CHECK ID:** COC-TEMP-001

### 4. NON-COMPLIANCE CONDITIONS (Automatic FAIL)
Premises are considered NON-COMPLIANT if:
  a) A Supplementary or Temporary COC exists WITHOUT a valid Initial COC
  b) A Supplementary or Temporary COC does NOT list the Initial COC reference number
- **CHECK ID:** COC-VALID-001

**IMPORTANT: COCs DO NOT EXPIRE.** An Electrical Certificate of Compliance remains valid indefinitely once issued, unless:
- The installation is altered (requiring a new Supplementary COC)
- The installation is found to be non-compliant upon re-inspection
- The COC is formally revoked by authorities
Do NOT report COC expiry as a failure condition.

### 5. COMPLIANCE VALIDATION FLOW (Execute in Order)
- **Step 1:** Identify COC Type → Initial / Supplementary / Temporary
- **Step 2:** If Initial → Validate that it exists and was properly issued
- **Step 3:** If Supplementary/Temporary → Confirm Initial COC reference number exists
- **Step 4:** Validate Initial COC reference is legitimate
- **Step 5:** Confirm scope aligns with Initial COC baseline
- **Step 6:** Return compliance status with clause-specific reasoning

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
  "cocNumber": "string (EXACT value from certificate)",
  "cocType": "Initial | Supplementary | Temporary | null (null if checkbox NOT ticked)",
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, documentUrl, subsectionId } = await req.json();
    
    if (!documentId || !documentUrl || !subsectionId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
      
      messages = [
        { 
          role: 'system', 
          content: VALIDATION_PROMPT
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
      
      messages = [
        { 
          role: 'system', 
          content: VALIDATION_PROMPT
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
            model: 'google/gemini-3-pro-preview',
            messages,
            temperature: 0.1, // Very low temperature for consistent, accurate validation
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
    const documentUpdateData: any = {};
    if (validationResult.cocNumber) {
      documentUpdateData.coc_number = validationResult.cocNumber;
    }
    if (validationResult.cocIssueDate) {
      documentUpdateData.coc_issue_date = validationResult.cocIssueDate;
    }
    if (validationResult.cocType) {
      // Map to DB constraint values: 'initial' or 'supplementary'
      const cocType = (validationResult.cocType || '').toLowerCase();
      documentUpdateData.coc_type = cocType.includes('supplementary') ? 'supplementary' : 'initial';
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
        if (validationResult.cocType) {
          subsectionUpdateData.coc_type = validationResult.cocType;
        }
        subsectionUpdateData.coc_status = mappedSubsectionStatus;
        
        // CRITICAL: Set is_compliant based on validation result AND hierarchy rules
        // A subsection is ONLY compliant if:
        // 1. The COC Type checkbox was marked on the certificate
        // 2. The COC validation passed (status = Approved)
        // 3. Hierarchy rules are satisfied (Initial COC exists and is valid for Supplementary/Temporary)
        const cocTypeMarked = validationResult.cocTypeMarked !== false && 
                              validationResult.hierarchyValidation?.cocTypeMarked !== false &&
                              validationResult.cocType !== null;
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
        const cocTypeMarked = validationResult.cocTypeMarked !== false && 
                              validationResult.hierarchyValidation?.cocTypeMarked !== false &&
                              validationResult.cocType !== null;
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

    // Store validation result in database with full report details
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
          validationEngine: 'SANS-10142-1-2020-v2',
          modelUsed: 'google/gemini-3-pro-preview'
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
        report: validationResult
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
