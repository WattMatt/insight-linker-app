import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

// COC extraction edge function - extracts key information from COC using Google Gemini 3 Pro Preview
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============ ENHANCED VISUAL ANCHOR PROMPTS ============

// Page 1 specific extraction - Certificate and Declaration details
const PAGE_1_PROMPT = `# PAGE 1 EXTRACTION - Certificate of Compliance Front Page

Focus ONLY on PAGE 1 of this ECA Certificate of Compliance document.

## VISUAL SEARCH LOCATIONS (with exact positions):

### 1. CERTIFICATE NUMBER (TOP PRIORITY - LOOK VERY CAREFULLY)
📍 LOCATION: TOP RIGHT corner of page 1
- Look for "Certificate No." or "Cert No." or just a 6-digit number
- Common formats: "ECA 1738009", "1738009", "ECA-2024-001234"
- READ EACH DIGIT EXTREMELY CAREFULLY: 0≠6≠8, 1≠7, 2≠3, 4≠9, 5≠6
- This is a UNIQUE identifier - each document has a DIFFERENT number

### 2. CERTIFICATE TYPE (CRITICAL - DETERMINES VALIDATION RULES)
📍 LOCATION: Near certificate number or in header area
- THREE POSSIBLE TYPES - Look for checkboxes ☐ ☑ or text indicating:
  a) "Initial Certificate" - First/original COC for installation (most common)
  b) "Supplementary Certificate" - Additional work on existing installation
  c) "Temporary Certificate" - Provisional compliance, time-limited
- IF SUPPLEMENTARY: MUST find reference to Initial COC number
- IF TEMPORARY: Look for expiry date or validity period

### 3. INSTALLATION IDENTIFICATION SECTION
📍 LOCATION: Upper portion of page, labeled section
- Physical address: Full street address
- Name of building/shop/unit: Building or tenant name
- GPS Coordinates: If present (lat/long)
- Suburb/Township: Area name
- District/Town/City: Municipality
- Erf/Lot No.: Property number

### 4. DECLARATION BY REGISTERED PERSON
📍 LOCATION: Left side of lower half of page 1
- Full name: The electrician's name
- ID Number: South African ID (13 digits)
- Registration regulations: Look for checked boxes 9(2)(a), 9(2)(b), or 9(2)(c)
- Registration number: Format like "ECSA/XXXXX" or 5-6 digits
- Date of registration: When registered as electrician
- Type: Installation electrician / Master / Tester
- SIGNATURE DATE: Date next to signature (THIS IS COC ISSUE DATE!)
- Contact: Address, Tel, Fax, Cell, Email

### 5. DECLARATION BY ELECTRICAL CONTRACTOR
📍 LOCATION: Right side of lower half of page 1
- Full name: Company or person name
- ID Number: ID or registration number
- Registration number: Contractor registration
- Contact details: Address, Tel, Fax, Cell, Email

### 6. RECIPIENT SECTION
📍 LOCATION: Bottom of page 1
- Recipient name: Who receives the certificate
- Date: When received

## OUTPUT JSON FOR PAGE 1:
\`\`\`json
{
  "cocNumber": "EXACT certificate number from top right",
  "cocType": "Initial | Supplementary | Temporary",
  "cocIssueDate": "YYYY-MM-DD from registered person signature section",
  "supplementDetails": {
    "supplementNo": "sequence number if supplementary (e.g., 1, 2, 3)",
    "initialCertificateNo": "REQUIRED if Supplementary/Temporary - the original COC number this references",
    "issuedOn": "date of initial certificate if supplementary"
  },
  "temporaryDetails": {
    "expiryDate": "YYYY-MM-DD if temporary certificate",
    "validityPeriod": "e.g., '30 days' or '3 months'",
    "reason": "why temporary was issued"
  },
  "administrativeDetails": {
    "physicalAddress": "full address",
    "buildingName": "building/shop name",
    "gpsCoordinates": "coordinates if present",
    "suburb": "suburb name",
    "poleNumber": "if present",
    "district": "district/city",
    "erfNumber": "erf/lot number",
    "registeredPerson": "FULL NAME of registered person",
    "idNumber": "ID number",
    "registrationNumber": "registration number",
    "registrationType": "type of registration",
    "dateOfRegistration": "YYYY-MM-DD"
  },
  "registeredPersonContact": {
    "address": "contact address",
    "telNo": "telephone",
    "faxNo": "fax",
    "cellNo": "cell phone",
    "email": "email"
  },
  "electricalContractor": {
    "name": "contractor name",
    "idNumber": "ID",
    "registrationNumber": "registration",
    "dateOfRegistration": "YYYY-MM-DD",
    "address": "address",
    "telNo": "tel",
    "faxNo": "fax",
    "cellNo": "cell",
    "email": "email"
  },
  "recipient": {
    "name": "recipient name",
    "signatureDate": "YYYY-MM-DD"
  },
  "page1Confidence": "high | medium | low",
  "page1Notes": "any issues extracting page 1"
}
\`\`\`

Extract ALL data from PAGE 1 now. BE EXTREMELY PRECISE with the Certificate Number!`;

// Page 2 specific extraction - Test Report details
const PAGE_2_PROMPT = `# PAGE 2 EXTRACTION - Test Report

Focus ONLY on PAGE 2 (Test Report) of this ECA Certificate of Compliance.

## VISUAL SEARCH LOCATIONS:

### 1. TEST REPORT HEADER
📍 LOCATION: Top of page 2
- Date of issue: Usually in header area
- Test Report for: DB/Supply description
- Additional pages: Yes/No checkbox

### 2. SECTION 2 - INSTALLATION DETAILS
📍 LOCATION: Upper section of page 2
- Installation type: Temporary / Permanent (checkboxes)
- Electricity supply system: TN-S / TN-C-S / TN-C / TT / IT
- Voltage: 230V / 400V / 525V / Other
- Number of phases: One / Two / Three
- Frequency: 50 Hz / Other / d.c.
- Main switch details:
  - Type: Fuse switch / Switch disconnector / Circuit-breaker / ELCB
  - Number of poles: 2P, 3P, 4P
  - Current rating: e.g., "80A", "100A"
  - Short-circuit rating: e.g., "6 kA", "10 kA"
  - Earth leakage rating IΔn: e.g., "30 mA", "100 mA", or "N/A"

### 3. SECTION 3 - INSTALLATION DESCRIPTION TABLE
📍 LOCATION: Table with "New" and "Existing" columns
- Look for circuit/point counts in each row
- Common items: Lighting circuits, Socket outlets, A/C circuits, etc.

### 4. SECTION 4 - INSPECTION AND TESTS
📍 LOCATION: Main body of page 2
INITIAL CHECKS (Yes/No/N/A):
1. Conductors correct rating and capacity
2. Components correctly selected and installed
3. Disconnecting devices correctly located
4. Circuits, fuses, switches correctly marked/labelled

TEST RESULTS WITH READINGS:
- Row 1: Continuity of bonding (result)
- Row 2: Earth continuity resistance (Ω value)
- Row 3: Ring circuits continuity (result or N/A)
- Row 4: Earth loop impedance (Ω value, e.g., "0.16Ω")
- Row 5: Neutral loop impedance (Ω value)
- Row 6: PSCC - Prospective short-circuit current (kA, e.g., "2.4 kA")
- Row 7: Elevated voltage neutral-earth (V value)
- Row 8: Insulation resistance (MΩ, often "∞" or ">∞" or ">500MΩ")
- Row 9: Voltage at DB no load (V values per phase)
- Row 10: Voltage at DB full load (V values)
- Row 11: Earth leakage operation (mA and %, e.g., "18mA / 60%")
- Row 12: Earth leakage test button (OK / Satisfactory)
- Row 13: Polarity of points (OK / Correct)
- Row 14: Phase rotation (Clockwise / OK)
- Row 15: Switching devices operation (OK / Correct)

### 5. SECTION 5 - RESPONSIBILITY
📍 LOCATION: Bottom of page 2
- Name of registered person
- Registration Certificate No.
- Type: Installation electrician / Master / Tester
- Tel No.
- Signature and DATE

## OUTPUT JSON FOR PAGE 2:
\`\`\`json
{
  "testReport": {
    "issueDate": "YYYY-MM-DD",
    "testReportFor": "description",
    "additionalPages": "Yes | No",
    "numberOfPagesAdded": "number if any"
  },
  "installationDetails": {
    "installationType": "Temporary | Permanent",
    "electricitySupplySystem": "TN-S | TN-C-S | TN-C | TT | IT",
    "voltage": "230V | 400V | 525V | Other",
    "numberOfPhases": "One | Two | Three",
    "phaseRotation": "Clockwise | Anticlockwise",
    "frequency": "50 Hz | Other | d.c.",
    "mainSwitchType": "type description",
    "numberOfPoles": "2 | 3 | 4",
    "currentRating": "e.g., 80A",
    "shortCircuitRating": "e.g., 6 kA",
    "earthLeakageRating": "e.g., 30 mA or N/A",
    "surgeProtectionInstalled": "Yes | No",
    "lightningProtectionInstalled": "Yes | No",
    "alternativePowerSupply": "Yes | No",
    "specializedInstallation": "Yes | No",
    "voltageAbove1kV": "Yes | No"
  },
  "inspectionChecks": {
    "conductorsCorrect": "Yes | No | N/A",
    "componentsCorrect": "Yes | No | N/A",
    "disconnectingDevicesCorrect": "Yes | No | N/A",
    "markingAndLabelling": "Yes | No | N/A"
  },
  "testResults": {
    "continuityOfBonding": "result",
    "earthContinuityResistance": "Ω value",
    "ringCircuitsContinuity": "result or N/A",
    "earthLoopImpedance": "Ω value",
    "neutralLoopImpedance": "Ω value",
    "prospectiveShortCircuitCurrent": "kA value",
    "elevatedVoltage": "V value",
    "insulationResistance": "MΩ value or ∞",
    "voltageNoLoad": "V values",
    "voltageFullLoad": "V values",
    "earthLeakageOperation": "mA and %",
    "earthLeakageTestButton": "result",
    "polarityOfPoints": "result",
    "phaseRotation": "result",
    "switchingDevices": "result"
  },
  "responsibility": {
    "name": "person name",
    "registrationCertNo": "registration number",
    "registrationType": "type",
    "telNo": "telephone",
    "signatureDate": "YYYY-MM-DD"
  },
  "comments": "any comments from document",
  "page2Confidence": "high | medium | low",
  "page2Notes": "any issues extracting page 2"
}
\`\`\`

Extract ALL data from PAGE 2 now. Include EXACT test readings with units!`;

// Targeted extraction prompt for missing fields
const TARGETED_EXTRACTION_PROMPT = `# TARGETED FIELD EXTRACTION

You MUST find these specific missing fields. Look VERY carefully at the document.

MISSING FIELDS TO EXTRACT:
{MISSING_FIELDS}

## VISUAL HINTS FOR COMMON FIELDS:

### COC Number
📍 TOP RIGHT corner of page 1, after "Certificate No." or "Cert No."
- Format: 6-7 digits, sometimes with "ECA" prefix
- READ DIGIT BY DIGIT: Check if it's 0 or 6, 1 or 7, 3 or 8

### COC Issue Date
📍 PAGE 1 - In "Declaration by Registered Person" section
- Look for "Date:" next to a signature at the bottom of that section
- Format usually: DD.MM.YYYY or DD/MM/YYYY

### Physical Address
📍 PAGE 1 - Under "INSTALLATION IDENTIFICATION"
- First line in that section
- Full street address with number

### Registered Person
📍 PAGE 1 - "Declaration by Registered Person" section
- First field, usually labeled "Full name:" or just the name
- This is the electrician who inspected

### Registration Number
📍 PAGE 1 - "Declaration by Registered Person" section
- Look for "Registered person registration number" or similar
- Format: Usually 5-6 digits or with prefix like "ECSA/"

Return ONLY the missing fields in this JSON format:
\`\`\`json
{
  "fieldName": "extracted value",
  "fieldName2": "extracted value"
}
\`\`\`

Focus on finding THESE SPECIFIC FIELDS. They ARE in the document - look more carefully!`;

// Full combined extraction prompt (used as fallback)
const FULL_EXTRACTION_PROMPT = `# 📋 ECA Certificate of Compliance - Complete Data Extraction

## 🎯 Objective
Extract ALL information from this TWO-PAGE ECA Certificate of Compliance document.
Use EXTREME care when reading numbers and dates.

## CRITICAL EXTRACTION PRIORITIES (in order):

### PRIORITY 1: Certificate Number (cocNumber)
📍 TOP RIGHT of page 1 - "Certificate No." or "Cert No."
- This is a UNIQUE 6-7 digit number
- READ EACH DIGIT VERY CAREFULLY: 0≠6≠8, 1≠7, 2≠3
- Common format: "ECA 1738009" or just "1738009"

### PRIORITY 2: Certificate Type (CRITICAL - 3 TYPES EXIST)
📍 Near certificate number or in header area
- Look for checkboxes or text indicating:
  a) "Initial" or "Initial Certificate" - First COC for installation
  b) "Supplementary" or "Supplementary Certificate" - Additional work referencing Initial
  c) "Temporary" or "Temporary Certificate" - Provisional compliance with expiry
- IF SUPPLEMENTARY: You MUST find the Initial COC number it references
- IF TEMPORARY: Look for expiry date and the Initial COC it references

### PRIORITY 3: Issue Date (cocIssueDate) 
📍 PAGE 1 - Declaration section, date next to registered person's signature
- Usually at the bottom of "Declaration by Registered Person"
- Format: DD.MM.YYYY → convert to YYYY-MM-DD

### PRIORITY 4: Physical Address
📍 PAGE 1 - Under "INSTALLATION IDENTIFICATION"
- Full street address including building/shop info

### PRIORITY 5: Registered Person Details
📍 PAGE 1 - "Declaration by Registered Person" section
- Full name, ID number, registration number, type

### PRIORITY 6: Test Results (from Page 2)
📍 PAGE 2 - Section 4 table
- Earth loop impedance (Ω), Insulation resistance (MΩ), etc.

## JSON OUTPUT FORMAT:
\`\`\`json
{
  "cocNumber": "string - CERTIFICATE NUMBER FROM TOP RIGHT",
  "cocType": "Initial | Supplementary | Temporary",
  "cocIssueDate": "YYYY-MM-DD",
  "supplementDetails": {
    "supplementNo": "sequence number if supplementary (1, 2, 3) or null",
    "initialCertificateNo": "REQUIRED if Supplementary/Temporary - original COC number or null",
    "issuedOn": "date of initial certificate or null"
  },
  "temporaryDetails": {
    "expiryDate": "YYYY-MM-DD if temporary or null",
    "validityPeriod": "e.g., '30 days' if temporary or null",
    "reason": "reason for temporary if stated or null"
  },
  "administrativeDetails": {
    "physicalAddress": "full address string",
    "buildingName": "building/shop name or null",
    "gpsCoordinates": "string or null",
    "suburb": "string or null",
    "poleNumber": "string or null",
    "district": "string or null",
    "erfNumber": "string or null",
    "registeredPerson": "FULL NAME string",
    "idNumber": "string or null",
    "registrationNumber": "string - REQUIRED",
    "registrationType": "string",
    "dateOfRegistration": "string or null"
  },
  "registeredPersonContact": {
    "address": "string or null",
    "telNo": "string or null",
    "faxNo": "string or null",
    "cellNo": "string or null",
    "email": "string or null"
  },
  "electricalContractor": {
    "name": "string or null",
    "idNumber": "string or null",
    "registrationNumber": "string or null",
    "dateOfRegistration": "string or null",
    "address": "string or null",
    "telNo": "string or null",
    "faxNo": "string or null",
    "cellNo": "string or null",
    "email": "string or null"
  },
  "recipient": {
    "name": "string or null",
    "signatureDate": "string or null"
  },
  "testReport": {
    "issueDate": "YYYY-MM-DD",
    "testReportFor": "string or null",
    "additionalPages": "Yes | No | null",
    "numberOfPagesAdded": "string or null"
  },
  "testReportLocation": {
    "physicalAddress": "string or null",
    "buildingName": "string or null"
  },
  "installationDetails": {
    "physicalAddress": "string",
    "buildingName": "string or null",
    "installationType": "Temporary | Permanent | null",
    "electricitySupplySystem": "TN-S | TN-C-S | TN-C | TT | IT | null",
    "voltage": "230V | 400V | 525V | Other",
    "numberOfPhases": "One | Two | Three",
    "phaseRotation": "Clockwise | Anticlockwise | null",
    "frequency": "50 Hz | Other | d.c.",
    "mainSwitchType": "string",
    "numberOfPoles": "string or null",
    "currentRating": "string",
    "shortCircuitRating": "string or null",
    "earthLeakageRating": "string or null",
    "surgeProtectionInstalled": "Yes | No | null",
    "lightningProtectionInstalled": "Yes | No | null",
    "alternativePowerSupply": "Yes | No | null",
    "specializedInstallation": "Yes | No | null",
    "voltageAbove1kV": "Yes | No | null",
    "supplyInstalled": "Yes | No | null",
    "supplyTested": "Yes | No | null",
    "supplyOperational": "Yes | No | null"
  },
  "installationDescription": {
    "lightingCircuits": {"new": "string", "existing": "string"},
    "lightingPoints": {"new": "string", "existing": "string"},
    "socketOutletCircuits": {"new": "string", "existing": "string"},
    "socketOutlets": {"new": "string", "existing": "string"},
    "airConditioningCircuits": {"new": "string", "existing": "string"},
    "transformerCircuitsLighting": {"new": "string", "existing": "string"},
    "heatingCircuits": {"new": "string", "existing": "string"},
    "otherCircuits": {"new": "string", "existing": "string"}
  },
  "inspectionChecks": {
    "conductorsCorrect": "Yes | No | N/A",
    "componentsCorrect": "Yes | No | N/A",
    "disconnectingDevicesCorrect": "Yes | No | N/A",
    "markingAndLabelling": "Yes | No | N/A"
  },
  "testResults": {
    "continuityOfBonding": "string or null",
    "earthContinuityResistance": "string or null",
    "ringCircuitsContinuity": "string or null",
    "earthLoopImpedance": "string or null",
    "neutralLoopImpedance": "string or null",
    "prospectiveShortCircuitCurrent": "string or null",
    "elevatedVoltage": "string or null",
    "insulationResistance": "string or null",
    "voltageNoLoad": "string or null",
    "voltageFullLoad": "string or null",
    "earthLeakageOperation": "string or null",
    "earthLeakageTestButton": "string or null",
    "polarityOfPoints": "string or null",
    "phaseRotation": "string or null",
    "switchingDevices": "string or null"
  },
  "comments": "string or null",
  "responsibility": {
    "name": "string",
    "registrationCertNo": "string or null",
    "registrationType": "string",
    "telNo": "string or null",
    "signatureDate": "YYYY-MM-DD"
  },
  "scopeOfWork": "string or null",
  "confidence": "high | medium | low",
  "extractionNotes": "string describing any issues"
}
\`\`\`

## EXTRACTION RULES:
1. Use null for missing/blank fields - NEVER use "Not provided" or "N/A" as values
2. Convert ALL dates to YYYY-MM-DD format
3. Include units with measurements (e.g., "0.16Ω", "∞ MΩ")
4. Set confidence to "low" if key fields are missing
5. READ NUMBERS VERY CAREFULLY - especially the COC Number

Extract now:`;

// Helper function to convert PDF to base64 in chunks
async function pdfToBase64(fileData: Blob): Promise<string> {
  const arrayBuffer = await fileData.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// Helper function to validate and parse dates
function parseAndValidateDate(rawDate: string): string | null {
  if (!rawDate) return null;
  
  const cleaned = rawDate.trim().replace(/\s+/g, ' ');
  
  const patterns = [
    /^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})$/,
    /^(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/,
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2})$/,
  ];
  
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      let year: number, month: number, day: number;
      
      if (pattern.source.startsWith('^(\\d{4})')) {
        [, year, month, day] = match.map(Number) as [unknown, number, number, number];
      } else {
        [, day, month, year] = match.map(Number) as [unknown, number, number, number];
        if (year < 100) year += 2000;
      }
      
      if (year >= 2000 && year <= 2035 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  
  return null;
}

// Check which required fields are missing
function getMissingRequiredFields(data: any): string[] {
  const missing: string[] = [];
  
  if (!data?.cocNumber?.trim()) missing.push('COC Number (cocNumber)');
  if (!data?.cocIssueDate?.trim() && !data?.testReport?.issueDate?.trim()) missing.push('Issue Date (cocIssueDate)');
  if (!data?.administrativeDetails?.physicalAddress?.trim()) missing.push('Physical Address (administrativeDetails.physicalAddress)');
  if (!data?.administrativeDetails?.registeredPerson?.trim()) missing.push('Registered Person (administrativeDetails.registeredPerson)');
  if (!data?.administrativeDetails?.registrationNumber?.trim()) missing.push('Registration Number (administrativeDetails.registrationNumber)');
  
  return missing;
}

// Merge two extraction results, preferring non-null values
function mergeExtractionResults(first: any, second: any): any {
  if (!second) return first;
  if (!first) return second;
  
  const merged = JSON.parse(JSON.stringify(first));
  
  // Deep merge function
  function deepMerge(target: any, source: any) {
    for (const key in source) {
      if (source[key] === null || source[key] === undefined || source[key] === '') continue;
      
      if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        deepMerge(target[key], source[key]);
      } else {
        // Only overwrite if target is null/undefined/empty
        if (!target[key] || target[key] === null || target[key] === '') {
          target[key] = source[key];
        }
      }
    }
  }
  
  deepMerge(merged, second);
  return merged;
}

// Parse AI response to extract JSON
function parseAIResponse(content: string): any {
  if (!content) return null;
  
  // Try to extract JSON from markdown code blocks
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                   content.match(/```\s*([\s\S]*?)\s*```/);
  
  let jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
  
  // Clean up common issues
  jsonStr = jsonStr.replace(/^\s*\{/, '{').replace(/\}\s*$/, '}');
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('JSON parse error:', e);
    // Try to fix common JSON issues
    try {
      // Remove trailing commas
      jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(jsonStr);
    } catch (e2) {
      console.error('JSON parse retry failed:', e2);
      return null;
    }
  }
}

// Call AI for extraction
async function callGeminiExtraction(
  base64: string, 
  prompt: string, 
  apiKey: string,
  model: string = 'google/gemini-3-pro-preview'
): Promise<any> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${base64}`
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', response.status, errorText);
    throw { status: response.status, message: errorText };
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentUrl, fileName, retryFields, documentId, subsectionId, forceReextract, userId } = await req.json();
    
    if (!documentUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: documentUrl' }),
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

    // ============ CHECK FOR EXISTING EXTRACTION (CACHING) ============
    if (documentId && !forceReextract && !retryFields) {
      console.log('Checking for existing extraction for document:', documentId);
      
      const { data: existingExtraction, error: fetchError } = await supabase
        .from('coc_extractions')
        .select('*')
        .eq('document_id', documentId)
        .maybeSingle();
      
      if (!fetchError && existingExtraction) {
        console.log('Found existing extraction, returning cached data');
        return new Response(
          JSON.stringify({
            success: true,
            extractedData: existingExtraction.extracted_data,
            model: existingExtraction.extraction_method,
            cached: true,
            extractedAt: existingExtraction.extracted_at,
            extractionId: existingExtraction.id,
            confidence: existingExtraction.confidence
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Starting enhanced COC extraction for:', fileName);
    console.log('Using model: google/gemini-3-pro-preview for best document analysis');
    
    // Download document
    let fileData: Blob;
    
    try {
      const urlParts = documentUrl.split('/documents/');
      if (urlParts.length === 2) {
        const filePath = decodeURIComponent(urlParts[1]);
        console.log('Downloading from storage path:', filePath);
        
        const { data, error } = await supabase.storage
          .from('documents')
          .download(filePath);
        
        if (error) {
          console.error('Supabase storage download error:', error);
          throw new Error(`Failed to download from storage: ${error.message}`);
        }
        
        fileData = data;
        console.log('Document downloaded successfully from storage');
      } else {
        console.log('Using direct fetch for URL');
        const docResponse = await fetch(documentUrl);
        
        if (!docResponse.ok) {
          throw new Error(`Failed to download document: ${docResponse.statusText}`);
        }
        
        fileData = await docResponse.blob();
      }
    } catch (downloadError: any) {
      console.error('Download error:', downloadError);
      throw new Error(`Failed to download document: ${downloadError?.message || 'Unknown error'}`);
    }

    const isPDF = fileName?.toLowerCase().endsWith('.pdf');
    
    if (!isPDF) {
      // For non-PDF files, use simple text extraction
      const documentText = await fileData.text();
      console.log('Processing text file with Gemini 3 Flash');
      
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { 
              role: 'system', 
              content: FULL_EXTRACTION_PROMPT
            },
            { 
              role: 'user', 
              content: `Document content:\n\n${documentText.substring(0, 10000)}\n\nExtract the COC data as JSON.`
            }
          ],
          temperature: 0.1,
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        if (aiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (aiResponse.status === 402) {
          return new Response(
            JSON.stringify({ error: 'Payment required. Please add credits.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        throw new Error('Text extraction failed: ' + errorText);
      }

      const aiData = await aiResponse.json();
      const extractedData = parseAIResponse(aiData.choices?.[0]?.message?.content) || {
        confidence: 'low',
        extractionNotes: 'Failed to parse response'
      };

      return new Response(
        JSON.stringify({ success: true, extractedData, model: 'google/gemini-3-flash-preview' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PDF EXTRACTION - Enhanced Two-Pass Approach
    console.log('Processing PDF with enhanced two-pass extraction');
    
    const base64 = await pdfToBase64(fileData);
    console.log('PDF converted to base64, size:', base64.length);

    // Check if this is a targeted retry for specific fields
    if (retryFields && Array.isArray(retryFields) && retryFields.length > 0) {
      console.log('Targeted retry for fields:', retryFields);
      
      const targetedPrompt = TARGETED_EXTRACTION_PROMPT.replace(
        '{MISSING_FIELDS}',
        retryFields.map(f => `- ${f}`).join('\n')
      );
      
      try {
        const content = await callGeminiExtraction(base64, targetedPrompt, LOVABLE_API_KEY);
        const targetedData = parseAIResponse(content);
        
        return new Response(
          JSON.stringify({
            success: true,
            extractedData: targetedData,
            model: 'google/gemini-3-pro-preview',
            isRetry: true
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: any) {
        if (error.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (error.status === 402) {
          return new Response(
            JSON.stringify({ error: 'Payment required. Please add credits.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        throw error;
      }
    }

    // ============ PASS 1: Full Extraction with Enhanced Prompt ============
    console.log('PASS 1: Full extraction with enhanced prompts...');
    
    let extractedData: any = null;
    
    try {
      const content = await callGeminiExtraction(base64, FULL_EXTRACTION_PROMPT, LOVABLE_API_KEY);
      extractedData = parseAIResponse(content);
      
      if (!extractedData) {
        console.error('Failed to parse PASS 1 response');
        extractedData = {
          confidence: 'low',
          extractionNotes: 'Failed to parse initial extraction'
        };
      }
    } catch (error: any) {
      console.error('PASS 1 error:', error);
      if (error.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (error.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw error;
    }

    // Validate dates
    if (extractedData.cocIssueDate) {
      const validated = parseAndValidateDate(extractedData.cocIssueDate);
      if (validated) extractedData.cocIssueDate = validated;
    }
    if (extractedData.testReport?.issueDate) {
      const validated = parseAndValidateDate(extractedData.testReport.issueDate);
      if (validated) extractedData.testReport.issueDate = validated;
    }
    if (extractedData.responsibility?.signatureDate) {
      const validated = parseAndValidateDate(extractedData.responsibility.signatureDate);
      if (validated) extractedData.responsibility.signatureDate = validated;
    }

    // ============ Check for Missing Fields ============
    const missingFields = getMissingRequiredFields(extractedData);
    console.log('After PASS 1 - Missing fields:', missingFields);

    // ============ PASS 2: Targeted Retry if Needed ============
    if (missingFields.length > 0) {
      console.log('PASS 2: Targeted extraction for missing fields...');
      
      const targetedPrompt = TARGETED_EXTRACTION_PROMPT.replace(
        '{MISSING_FIELDS}',
        missingFields.map(f => `- ${f}`).join('\n')
      );
      
      try {
        const content = await callGeminiExtraction(base64, targetedPrompt, LOVABLE_API_KEY);
        const targetedData = parseAIResponse(content);
        
        if (targetedData) {
          console.log('PASS 2 extracted:', JSON.stringify(targetedData));
          
          // Map targeted results back to proper structure
          if (targetedData.cocNumber && !extractedData.cocNumber) {
            extractedData.cocNumber = targetedData.cocNumber;
          }
          if (targetedData.cocIssueDate && !extractedData.cocIssueDate) {
            const validated = parseAndValidateDate(targetedData.cocIssueDate);
            extractedData.cocIssueDate = validated || targetedData.cocIssueDate;
          }
          if (targetedData.physicalAddress && !extractedData.administrativeDetails?.physicalAddress) {
            if (!extractedData.administrativeDetails) extractedData.administrativeDetails = {};
            extractedData.administrativeDetails.physicalAddress = targetedData.physicalAddress;
          }
          if (targetedData.registeredPerson && !extractedData.administrativeDetails?.registeredPerson) {
            if (!extractedData.administrativeDetails) extractedData.administrativeDetails = {};
            extractedData.administrativeDetails.registeredPerson = targetedData.registeredPerson;
          }
          if (targetedData.registrationNumber && !extractedData.administrativeDetails?.registrationNumber) {
            if (!extractedData.administrativeDetails) extractedData.administrativeDetails = {};
            extractedData.administrativeDetails.registrationNumber = targetedData.registrationNumber;
          }
        }
      } catch (error) {
        console.error('PASS 2 error (non-fatal):', error);
        // Continue with PASS 1 results
      }
    }

    // ============ Final Confidence Assessment ============
    const finalMissing = getMissingRequiredFields(extractedData);
    if (finalMissing.length === 0) {
      extractedData.confidence = 'high';
      extractedData.extractionNotes = 'All required fields extracted successfully';
    } else if (finalMissing.length <= 2) {
      extractedData.confidence = 'medium';
      extractedData.extractionNotes = `Missing ${finalMissing.length} field(s): ${finalMissing.join(', ')}`;
    } else {
      extractedData.confidence = 'low';
      extractedData.extractionNotes = `Missing ${finalMissing.length} required field(s): ${finalMissing.join(', ')}`;
    }

    console.log('Extraction completed. Confidence:', extractedData.confidence);
    console.log('COC Number:', extractedData.cocNumber);
    console.log('Issue Date:', extractedData.cocIssueDate);

    // ============ SAVE EXTRACTION TO DATABASE ============
    let extractionId: string | null = null;
    
    if (documentId && subsectionId) {
      console.log('Saving extraction to database for document:', documentId);
      
      // Upsert extraction (update if exists, insert if not)
      const { data: savedExtraction, error: saveError } = await supabase
        .from('coc_extractions')
        .upsert({
          document_id: documentId,
          subsection_id: subsectionId,
          extracted_data: extractedData,
          confidence: extractedData.confidence || 'medium',
          extraction_method: 'google/gemini-3-pro-preview',
          extraction_notes: extractedData.extractionNotes,
          extracted_at: new Date().toISOString(),
          extracted_by: userId || null
        }, {
          onConflict: 'document_id',
          ignoreDuplicates: false
        })
        .select('id')
        .single();
      
      if (saveError) {
        console.error('Error saving extraction:', saveError);
        // Non-fatal - continue to return the extraction data
      } else {
        extractionId = savedExtraction?.id;
        console.log('Extraction saved successfully with ID:', extractionId);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        extractedData,
        model: 'google/gemini-3-pro-preview',
        missingFields: finalMissing,
        extractionId,
        cached: false
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error during COC extraction:', error);
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
