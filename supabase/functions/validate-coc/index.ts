import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

// COC validation edge function - validates electrical certificates against SANS 10142-1
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALIDATION_PROMPT = `# ⚡ SANS 10142-1 Electrical COC Verification Engine

## 🎯 Objective
You are an AI-driven verification engine for Electrical Certificates of Compliance (COC) based on SANS 10142-1:2020. 
Your mission: Map all verification steps to specific clauses, generate clear PASS/FAIL outcomes, provide remediation guidance, 
and ignore trivial items that do not affect safety or legal compliance.

## 🔍 CRITICAL: COC Data Extraction Instructions
**Before analyzing technical compliance, you MUST extract these administrative fields accurately:**

1. **COC Number**: Look for a field labeled "Certificate of Compliance (CoC) No." or "COC No." or similar
   - Extract the EXACT number shown (e.g., "642 760", "ECA-2024-001234")
   - DO NOT use the filename or any derived value
   
2. **Issue Date**: Look for a field labeled "Date of issue:" or "Issue Date:" or "Certificate Date:"
   - Extract the EXACT date shown
   - Convert to YYYY-MM-DD format:
     * "18.09.2025" becomes "2025-09-18"
     * "15/05/2024" becomes "2024-05-15"
   - If date is not clearly visible, set to null

3. **Other Administrative Details**: Extract registered person, registration number, address, erf number from certificate fields

## 🔍 Scope & Exclusions
**INCLUDE:**
- Mandatory SANS 10142-1 clauses (earthing, conductor sizing, protective devices, insulation resistance, polarity, continuity)
- Safety-critical checks (earth loop impedance, RCD functionality, fault protection)
- Statutory requirements (certification, testing records, competent person signature)

**EXCLUDE:**
- Cosmetic items (cable dress neatness, aesthetic finish of enclosures)
- Non-critical labeling style (unless affects safety identification)
- Minor administrative formatting (unless impacts traceability)
- Optional/recommendatory clauses (unless installation explicitly requires them)
- Overly strict tolerances beyond standard specifications

## 📋 SANS 10142-1 Clause-Level Verification Rules

### 🔧 EARTHING SYSTEM (Clause 7.4)
**Check ID:** EARTH-001  
**Requirement:** Earth continuity verified, resistance ≤ 1Ω for TN systems, ≤ 100Ω for TT systems  
**Test Method:** Earth resistance measurement with approved tester  
**PASS Criteria:** Measured value within limits, all bonding in place  
**FAIL Criteria:** Resistance exceeds limits, missing bonding conductors  
**Remediation:** Install additional earth electrodes, verify all bonding connections, re-measure until compliant

### 🔌 CONDUCTOR SIZING (Clause 7.2)
**Check ID:** COND-001  
**Requirement:** Minimum cross-section per current rating (e.g., 1.5mm² for 16A lighting, 2.5mm² for 20A socket circuits)  
**PASS Criteria:** Cable size ≥ calculated minimum for load and fault conditions  
**FAIL Criteria:** Undersized conductors for circuit current  
**Remediation:** Replace with correctly sized conductors per SANS 10142-1 Table 52B

### ⚡ OVERCURRENT PROTECTION (Clause 8.3)
**Check ID:** OCP-001  
**Requirement:** MCB/fuse rated for circuit, breaking capacity > prospective fault current  
**PASS Criteria:** Device rating matches cable size, In ≤ Iz, disconnection time ≤ 0.4s (final circuits)  
**FAIL Criteria:** Device oversized, inadequate breaking capacity, slow disconnection  
**Remediation:** Install correctly rated protective device, verify fault loop impedance, ensure Zs ≤ Zs(max)

### 🛡️ INSULATION RESISTANCE (Clause 8.6)
**Check ID:** INSUL-001  
**Requirement:** Minimum 1MΩ for SELV/PELV, 0.5MΩ for circuits ≤ 500V, 1MΩ for circuits > 500V  
**Test Method:** Insulation tester at 500V DC (250V for SELV/PELV)  
**PASS Criteria:** Measured resistance ≥ threshold  
**FAIL Criteria:** Resistance below minimum, indicating insulation breakdown  
**Remediation:** Locate and repair damaged insulation, check for moisture ingress, re-test circuits

### 🔄 POLARITY & CONTINUITY (Clause 8.7)
**Check ID:** POL-001  
**Requirement:** Correct phase/neutral/earth connections, protective conductor continuity ≤ 0.5Ω  
**PASS Criteria:** All poles correctly connected, continuity verified  
**FAIL Criteria:** Reversed polarity, broken protective conductor  
**Remediation:** Correct wiring connections, repair continuity faults, label circuits correctly

### ⏱️ RCD FUNCTIONAL TEST (Clause 8.8)
**Check ID:** RCD-001  
**Requirement:** Trip time ≤ 300ms at rated residual current (30mA for personnel protection), ≤ 40ms at 5× IΔn  
**Test Method:** RCD tester with calibrated currents  
**PASS Criteria:** Trip times within limits, mechanical operation functional  
**FAIL Criteria:** No trip, delayed trip > 300ms, mechanical failure  
**Remediation:** Replace defective RCD, verify installation per manufacturer specs, re-test until compliant

### 🔋 EARTH LOOP IMPEDANCE (Clause 8.5)
**Check ID:** LOOP-001  
**Requirement:** Zs ≤ maximum permitted for protective device type (e.g., 1.15Ω for 30A Type B MCB)  
**PASS Criteria:** Measured Zs below limit ensuring disconnection time ≤ 0.4s  
**FAIL Criteria:** High impedance preventing automatic disconnection  
**Remediation:** Improve earthing system, reduce circuit length, verify supply earth integrity

### 📄 CERTIFICATION & DOCUMENTATION
**Check ID:** DOC-001  
**Requirement:** COC issued by registered electrician, test results recorded  
**PASS Criteria:** Valid registration number, all test results present, signature  
**FAIL Criteria:** Unregistered person, missing test data, unsigned document  
**Remediation:** Obtain COC from competent registered person, complete all test records

### 📅 BUSINESS RULE: CERTIFICATE DATE VALIDATION
**This is NOT a SANS 10142-1 clause** - it is a regulatory-process check to ensure certificates are properly dated.

**Check ID:** CERT-DATE-001 (for future-dated) or CERT-EXPIRY-001 (for expired)  
**Business Rules:**
1. **Reject (Fail)** if certificateDate > today (future-dated certificate)
   - Clause: "Business Rule"
   - Category: "Administrative"
   - Remediation: "Certificate is future-dated and cannot be accepted. Issue date must not be after today's date."

2. **Warn (Fail)** if certificateDate + 12 months < today (expired certificate)
   - Clause: "Business Rule"
   - Category: "Administrative"
   - Remediation: "Certificate has expired (more than 12 months old). A new COC must be issued."

3. **Pass** if certificate date is valid (not future-dated and not expired)

## 📤 Required JSON Output Format

**CRITICAL: Ensure cocNumber and cocIssueDate are extracted from the exact fields on the certificate, not from filenames or derived data.**

\`\`\`json
{
  "cocNumber": "string (exact value from 'Certificate of Compliance (CoC) No.' field)",
  "cocType": "ECA | ECSA | Other",
  "evaluationDate": "YYYY-MM-DD",
  "cocIssueDate": "YYYY-MM-DD (converted from 'Date of issue:' field, e.g. 18.09.2025 -> 2025-09-18)",
  "overallStatus": "Pass | Fail | Incomplete",
  "installationSummary": "string",
  "overallAssessment": "string",
  "checks": [
    {
      "checkId": "EARTH-001",
      "clause": "7.4",
      "description": "Earth continuity and resistance",
      "result": "Pass | Fail | Not Tested",
      "measuredValue": "0.85Ω",
      "limit": "≤ 1Ω (TN system)",
      "remediation": "N/A for pass, specific guidance for fail",
      "category": "Safety-Critical | Mandatory | Administrative",
      "timestamp": "ISO 8601 timestamp"
    }
  ],
  "criticalFailures": [
    {
      "category": "Technical | Administrative | Safety",
      "clause": "string",
      "description": "string",
      "reason": "string"
    }
  ],
  "administrativeDetails": {
    "physicalAddress": "string",
    "erfNumber": "string",
    "registeredPerson": "string",
    "idNumber": "string",
    "registrationNumber": "string",
    "registrationType": "string",
    "registrationDate": "YYYY-MM-DD",
    "cocIssueDate": "YYYY-MM-DD"
  },
  "technicalEvaluation": [
    {
      "section": "string",
      "clause": "string",
      "requirement": "string",
      "finding": "string",
      "status": "Pass | Fail | Not Applicable",
      "notes": "string"
    }
  ],
  "recommendations": ["string"],
  "auditTrail": [
    {
      "timestamp": "ISO 8601",
      "checkId": "string",
      "clause": "string",
      "action": "Evaluated | Verified | Recorded",
      "result": "Pass | Fail"
    }
  ],
  "summary": {
    "totalChecks": 0,
    "passedChecks": 0,
    "failedChecks": 0,
    "notApplicable": 0,
    "criticalFailures": 0
  }
}
\`\`\`

## ✅ Verification Logic

1. **For each mandatory check:**
   - Map to specific SANS 10142-1 clause
   - Extract measured value from document
   - Compare against clause threshold
   - Determine PASS/FAIL
   - Log to audit trail with timestamp

2. **Overall Status Determination:**
   - **PASS:** All safety-critical checks pass, no critical failures
   - **FAIL:** Any safety violation or critical check failure
   - **INCOMPLETE:** Missing mandatory test data or certification details

3. **Administrative Data Extraction (HIGHEST PRIORITY):**
   - **CRITICAL:** Extract the EXACT COC number from the field labeled "Certificate of Compliance (CoC) No." or similar
   - **CRITICAL:** Extract the EXACT date from the field labeled "Date of issue:" or "Issue Date:" or "Certificate Date:"
   - Do NOT use filenames, derived values, or inferred data for COC number - use only what's printed on the certificate
   - Convert dates to YYYY-MM-DD format with these examples:
     * "18.09.2025" → "2025-09-18"
     * "15/05/2024" → "2024-05-15" 
     * "2024-03-10" → "2024-03-10" (already correct)
     * "18 September 2025" → "2025-09-18"
   - Extract registered person name and registration number from certificate
   - Extract physical address and erf number from installation details
   - If a field is not clearly visible on the document, set it to null rather than using placeholder text like "Not provided on COC"

4. **Ignore Non-Critical Items:**
   - Do not flag aesthetic issues
   - Do not enforce optional clauses unless relevant
   - Focus on safety, legal compliance, and technical adequacy

5. **Remediation Guidance:**
   - Provide specific, actionable steps for each failure
   - Reference clause requirements
   - Suggest corrective actions (replace, repair, re-test, verify)

## 🚨 Mandatory Checks (Must All Pass for Overall PASS)

1. Earth resistance (Clause 7.4): EARTH-001
2. Conductor sizing (Clause 7.2): COND-001
3. Overcurrent protection (Clause 8.3): OCP-001
4. Insulation resistance (Clause 8.6): INSUL-001
5. Polarity & continuity (Clause 8.7): POL-001
6. RCD functional test (Clause 8.8): RCD-001
7. Earth loop impedance (Clause 8.5): LOOP-001
8. Valid certification (DOC-001)
9. Certificate date validation (Business Rule): CERT-DATE-001 / CERT-EXPIRY-001

Now validate the following COC document:`;

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

    console.log('Starting COC validation for document:', documentId);

    // Extract the storage path from the signed URL
    // Format: /storage/v1/object/sign/documents/{path}?token={token}
    let storagePath: string;
    
    if (documentUrl.includes('/storage/v1/object/sign/documents/')) {
      const pathPart = documentUrl.split('/storage/v1/object/sign/documents/')[1];
      // Remove the token query parameter
      storagePath = pathPart.split('?token=')[0];
      storagePath = decodeURIComponent(storagePath);
    } else if (documentUrl.includes('/storage/v1/object/public/documents/')) {
      storagePath = documentUrl.split('/storage/v1/object/public/documents/')[1];
      storagePath = decodeURIComponent(storagePath);
    } else {
      throw new Error('Invalid document URL format');
    }
    
    console.log('Downloading document from storage:', storagePath);
    
    // Download the document using Supabase client (works with private buckets)
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(storagePath);
    
    if (downloadError || !fileData) {
      console.error('Storage download error:', downloadError);
      throw new Error(`Failed to download document: ${downloadError?.message || 'Unknown error'}`);
    }

    // Check if this is a PDF file
    const fileName = storagePath.split('/').pop() || '';
    const isPDF = fileName.toLowerCase().endsWith('.pdf');
    
    let documentText = '';
    
    if (isPDF) {
      // For PDF files, we'll need to indicate it's a PDF and let AI know
      // In production, you'd use a PDF parsing library here
      documentText = `[PDF Document: ${fileName}]\n\nNote: This is a PDF Certificate of Compliance document. Please analyze this as a COC document and extract all relevant information for validation against SANS 10142-1 standards.`;
      console.log('Processing PDF file:', fileName);
    } else {
      // For text-based files, extract text directly
      documentText = await fileData.text();
      console.log('Processing text file:', fileName);
    }
    
    const truncatedText = documentText.substring(0, 8000); // Limit context size

    console.log('Document fetched, calling AI for validation...');

    // Call Lovable AI for validation
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-preview',
        messages: [
          { 
            role: 'system', 
            content: VALIDATION_PROMPT
          },
          { 
            role: 'user', 
            content: `Document content:\n\n${truncatedText}\n\nPlease validate this COC document and return ONLY the JSON validation result. If this is a PDF that cannot be read, return status "Error" with appropriate message in criticalFailures.`
          }
        ],
        temperature: 0.3, // Lower temperature for more consistent validation
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
      
      throw new Error('AI validation failed');
    }

    const aiData = await aiResponse.json();
    console.log('AI response received:', JSON.stringify(aiData));

    const aiContent = aiData.choices[0].message.content;
    
    // Extract JSON from response (handle markdown code blocks)
    let validationResult;
    try {
      const jsonMatch = aiContent.match(/```json\n([\s\S]*?)\n```/) || 
                       aiContent.match(/```\n([\s\S]*?)\n```/) ||
                       [null, aiContent];
      const jsonStr = jsonMatch[1] || aiContent;
      validationResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      validationResult = {
        status: 'Error',
        violations: [{
          clause: 'N/A',
          description: 'Failed to parse validation response',
          evidence: 'AI response could not be interpreted'
        }],
        summary: 'Validation could not be completed due to parsing error'
      };
    }

    console.log('Parsed validation result:', JSON.stringify(validationResult));

    // Store validation result in database with full report details
    const { error: dbError } = await supabase
      .from('coc_validations')
      .upsert({
        document_id: documentId,
        subsection_id: subsectionId,
        status: validationResult.overallStatus || validationResult.status,
        violations: validationResult.criticalFailures || validationResult.violations || [],
        validated_by: userId,
        validated_at: new Date().toISOString(),
        report_data: validationResult // Store full report for later retrieval
      }, {
        onConflict: 'document_id'
      });

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    console.log('Validation result saved to database');

    return new Response(
      JSON.stringify({
        success: true,
        validation: validationResult
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in validate-coc function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
