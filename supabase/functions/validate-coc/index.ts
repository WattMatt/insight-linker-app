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
  "cocType": "ECA | ECSA | DOL | Other",
  "evaluationDate": "YYYY-MM-DD (today's date)",
  "cocIssueDate": "YYYY-MM-DD | null",
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

1. **Document Quality Assessment:**
   - Rate image/scan quality
   - Note any unreadable sections
   - Flag missing pages

2. **Mandatory Check Sequence:**
   - EARTH-001: Earth resistance (CRITICAL)
   - LOOP-001: Earth loop impedance (CRITICAL)
   - INSUL-001: Insulation resistance (CRITICAL)
   - RCD-001: RCD functionality (CRITICAL)
   - POL-001: Polarity and continuity (CRITICAL)
   - COND-001: Conductor sizing (MANDATORY)
   - OCP-001: Overcurrent protection (MANDATORY)
   - DOC-001: Documentation (MANDATORY)
   - CERT-DATE-001: Certificate validity (MANDATORY)

3. **Overall Status Determination:**
   - **PASS:** ALL safety-critical checks pass, ALL mandatory checks pass, no critical failures
   - **FAIL:** ANY safety-critical failure OR 2+ mandatory failures
   - **INCOMPLETE:** Missing >30% of required test data

4. **Confidence Score:**
   - 90-100: Clear document, all values extracted, high certainty
   - 70-89: Some values unclear but primary checks verifiable
   - 50-69: Several values unclear, moderate uncertainty
   - <50: Poor quality, many values unreadable

5. **Remediation Guidance:**
   - Specific to the failure
   - Reference correct SANS clause
   - Include measurement that would constitute pass
   - Suggest corrective actions

## 🚨 Red Flags (Automatic FAIL)
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

    const aiContent = aiData.choices[0].message.content;
    
    // Extract JSON from response (handle markdown code blocks)
    let validationResult;
    try {
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
      
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Raw AI content:', aiContent.substring(0, 500));
      
      validationResult = {
        overallStatus: 'Error',
        confidenceScore: 0,
        documentQuality: 'Poor',
        checks: [],
        criticalFailures: [{
          category: 'Technical',
          clause: 'N/A',
          description: 'Failed to parse validation response',
          reason: 'The AI response could not be interpreted as valid JSON',
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

    // Update subsection with COC details if extracted
    if (validationResult.cocNumber || validationResult.cocIssueDate) {
      const updateData: any = {};
      if (validationResult.cocNumber) {
        updateData.coc_number = validationResult.cocNumber;
      }
      if (validationResult.cocIssueDate) {
        updateData.coc_issue_date = validationResult.cocIssueDate;
      }
      if (validationResult.cocType) {
        updateData.coc_type = validationResult.cocType;
      }
      // Map overall status to coc_status
      if (validationResult.overallStatus) {
        const statusMap: Record<string, string> = {
          'Pass': 'valid',
          'Fail': 'invalid',
          'Incomplete': 'pending',
          'Error': 'pending'
        };
        updateData.coc_status = statusMap[validationResult.overallStatus] || 'pending';
      }
      
      const { error: updateError } = await supabase
        .from('subsections')
        .update(updateData)
        .eq('id', subsectionId);
      
      if (updateError) {
        console.error('Failed to update subsection with COC details:', updateError);
      } else {
        console.log('Updated subsection with COC details:', updateData);
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
