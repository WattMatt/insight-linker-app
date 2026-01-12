import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

// COC extraction edge function - extracts key information from COC using Google Gemini 2.5 Pro
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Step 1: Extract ALL dates found in the document with their exact context/location
const DATE_EXTRACTION_PROMPT = `# Date Extraction from COC Document

Your ONLY task is to find and extract ALL dates visible in this document. 

For EACH date you find, provide:
1. The exact date as written (e.g., "01 09 2023", "2023-09-01", "01/09/2023")
2. The exact location/context where you found it (e.g., "Next to 'Signature:' in Declaration section", "Under 'Date of registration'", "Test Report header")
3. The page number (1 or 2)

Return ONLY this JSON:
\`\`\`json
{
  "dates": [
    {
      "rawDate": "exact date as written",
      "location": "exact description of where this date appears",
      "page": 1,
      "nearbyText": "text immediately before or after the date"
    }
  ]
}
\`\`\`

CRITICAL RULES:
- Extract EVERY date you can see
- Be EXTREMELY precise about reading each digit: 0 vs 6 vs 8, 2 vs 3, 1 vs 7
- Include the EXACT nearby text that helps identify what the date is for
- Common date locations in COC:
  * Page 1: "Date:" next to registered person's signature (THIS IS THE COC ISSUE DATE)
  * Page 1: "Date of registration" for the registered person
  * Page 1: "Date of registration" for the electrical contractor
  * Page 2: "Date of issue" in the test report header
  * Page 2: "Date" in Section 5 (Responsibility)

Extract ALL dates now:`;

// Step 2: Full data extraction prompt
const EXTRACTION_PROMPT = `# 📋 ECA Certificate of Compliance - Complete Data Extraction

## 🎯 Objective
Extract ALL information from this TWO-PAGE ECA Certificate of Compliance document.

## 📄 Document Structure
**PAGE 1 - Certificate of Compliance (Front Page):**
- Certificate header and number
- Installation identification
- Declaration by registered person
- Declaration by electrical contractor

**PAGE 2 - Test Report:**
- Test report header
- Section 2: Installation details
- Section 4: Inspection and tests
- Section 5: Responsibility

---

## 📊 FIELDS TO EXTRACT

### PAGE 1: Certificate Details

**1. Certificate Identification (MOST CRITICAL - READ VERY CAREFULLY):**
- **Certificate No. (REQUIRED)**: Look for "Certificate No." or "Cert No." typically in the TOP RIGHT corner of page 1
  - This is a UNIQUE identifier for this specific certificate
  - Common formats: "ECA 642760", "642 760", "ECA-2024-001234"
  - READ EACH DIGIT EXTREMELY CAREFULLY: 0≠6≠8, 1≠7, 2≠3, 4≠9
  - The number is usually 6 digits, sometimes with "ECA" prefix
  - DO NOT use numbers from any other field - only the Certificate Number field
- Certificate type: "Initial Certificate" or "Supplementary Certificate"
- Supplement No. (if supplementary)
- Initial Certificate No. it supplements (if applicable)
- Date issued (if supplementary)

**2. Installation Identification:**
- Physical address
- Name of building/shop
- GPS Coordinates
- Suburb/Township
- Pole number
- District/Town/City
- Erf/Lot No.

**3. Declaration by Registered Person:**
- Full name
- ID Number
- Registration regulations: 9(2)(a) new / 9(2)(b) existing / 9(2)(c) new part to existing
- Registered person registration number
- Date of registration
- Type of registration: Installation electrician / Master installation electrician / Electrical tester for single phase
- Signature date
- Contact details:
  - Address
  - Tel. No.
  - Fax No.
  - Cell No.
  - Email

**4. Declaration by Electrical Contractor:**
- Full name
- ID Number
- Electrical contractor registration number
- Date of registration
- Contact details:
  - Address
  - Tel. No.
  - Fax No.
  - Cell No.
  - Email

**5. Recipient Information:**
- Recipient name
- Signature
- Date

---

### PAGE 2: Test Report

**Header Information:**
- Date of issue
- Test Report for (DB/Supply description)
- Additional pages added: Yes/No
- Number added

**Section 1 - Location (Only required if not provided on Certificate of Compliance):**
- Physical address
- Name of building (including shop/unit number)

**Section 2 - Installation Details:**
- Physical address
- Name of building
- Installation type: Temporary / Permanent
- **Type of electricity supply system:** TN-S / TN-C-S / TN-C / TT / IT
- **Characteristics of supply:**
  - Voltage: 230V / 400V / 525V / Other
  - Number of phases: One / Two / Three
  - Phase rotation: Clockwise / Anticlockwise
  - Frequency: 50 Hz / Other / d.c.
- **Main switch details:**
  - Type: Fuse switch / Switch disconnector / Circuit-breaker / Earth leakage circuit-breaker / Earth leakage switch disconnector
  - Number of poles
  - Current rating (e.g., "80A")
  - Short-circuit/withstand rating (e.g., "6 KA")
  - Rated earth leakage tripping current IΔn (e.g., "30 mA" or "N/A")
- **Additional Installation Questions:**
  - Is surge protection installed (see 6.7.6 and annex I): Yes/No
  - Is lightning protection installed (see 6.7.7 and annex I): Yes/No
  - Is alternative power supply installed? (See 7.12.): Yes/No
  - Is any part of the installation a specialized electrical installation?: Yes/No
  - Is any part of the installation at a voltage above 1 kV?: Yes/No
- Connection to supply: Installed Yes/No, Tested Yes/No, Operational Yes/No

**Section 3 - Description of Installation Covered by This Report:**
Extract the circuit/point counts from the table. Each item has "New" and "Existing" columns:
- Lighting circuits (New/Existing)
- Lighting points (New/Existing)
- Socket-outlet circuits (New/Existing)
- Socket-outlets (New/Existing)
- Air-conditioning circuits (New/Existing)
- Transformer circuits: Lighting/Bell/Other (New/Existing)
- Heating circuits (New/Existing)
- Alternative power supply connections (New/Existing)
- Other circuits or points (New/Existing)
- Fan circuits (New/Existing)
- Fan circuits - Cooking (New/Existing)
- Fan circuits - Geyser (New/Existing)
- Fixed appliance circuits - Pool pump (New/Existing)
- Fixed appliance circuits - Borehole pump (New/Existing)
- Fixed appliance circuits - Other (New/Existing)
- Earth leakage protects: Complete installation / Only part of installation (New/Existing)
- Other circuits or points (additional rows) (New/Existing)

**Section 4 - Inspection and Tests:**

*Initial Checks (Mark Yes/No/N/A):*
1. Conductors correct rating and capacity
2. Components correctly selected and installed
3. Disconnecting devices correctly located
4. Circuits, fuses, switches, terminals, earth leakage units, circuit-breakers, distribution boards correctly and permanently marked or labelled

*Test Results with Readings:*
1. Continuity of bonding (result)
2. Resistance of earth continuity conductor (result)
3. Continuity of ring circuits (result or N/A)
4. Earth loop impedance at main/local switch (Ω value)
5. Neutral loop impedance at main/local switch (Ω value)
6. Prospective short-circuit current PSCC (KA value, Calculated/Measured)
7. Elevated voltage between neutral and earth (V value)
8. Insulation resistance (MΩ value - often shown as infinity symbol ∞ or >∞, extract as "∞" or ">∞")
9. Voltage at DB no load for each phase to neutral (V values)
10. Voltage at DB with full load for each phase to neutral (V values)
11. Earth leakage unit operation value (mA and % or N/A)
12. Earth leakage test button operation (result)
13. Polarity of points of consumption (result)
14. Phase rotation consistency (result)
15. All switching devices operation (result)

*Comments:*
- Any comments on parts not covered

**Section 5 - Responsibility:**
- Name of registered person
- Registration Certificate No.
- Type: Installation electrician / Master installation electrician / Single-phase tester
- Tel no.
- Signature
- Date

---

## 📤 JSON Output Format

CRITICAL: The cocNumber field MUST contain the UNIQUE Certificate Number from this specific document.
- Look in the TOP RIGHT area of page 1 for "Certificate No." or "Cert No."
- Each COC has a different number - verify you are reading THIS document's number, not a cached or generic value
- Common format: 6 digits, optionally prefixed with "ECA" (e.g., "642760", "ECA 642760")

Return ONLY this JSON structure with ALL extracted data:

\`\`\`json
{
  "cocNumber": "string - THE UNIQUE CERTIFICATE NUMBER FROM THIS DOCUMENT",
  "cocType": "Initial Certificate | Supplementary Certificate",
  "cocIssueDate": "YYYY-MM-DD",
  "supplementDetails": {
    "supplementNo": "string or null",
    "initialCertificateNo": "string or null",
    "issuedOn": "YYYY-MM-DD or null"
  },
  "administrativeDetails": {
    "physicalAddress": "string",
    "buildingName": "string or null",
    "gpsCoordinates": "string or null",
    "suburb": "string or null",
    "poleNumber": "string or null",
    "district": "string or null",
    "erfNumber": "string or null",
    "registeredPerson": "string",
    "idNumber": "string or null",
    "registrationNumber": "string",
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
    "transformerCircuitsBell": {"new": "string", "existing": "string"},
    "transformerCircuitsOther": {"new": "string", "existing": "string"},
    "heatingCircuits": {"new": "string", "existing": "string"},
    "alternativePowerSupply": {"new": "string", "existing": "string"},
    "otherCircuits": {"new": "string", "existing": "string"},
    "fanCircuits": {"new": "string", "existing": "string"},
    "fanCircuitsCooking": {"new": "string", "existing": "string"},
    "fanCircuitsGeyser": {"new": "string", "existing": "string"},
    "fixedAppliancePoolPump": {"new": "string", "existing": "string"},
    "fixedApplianceBoreholeP": {"new": "string", "existing": "string"},
    "fixedApplianceOther": {"new": "string", "existing": "string"},
    "earthLeakageCompleteInstallation": {"new": "string", "existing": "string"},
    "earthLeakagePartOfInstallation": {"new": "string", "existing": "string"}
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
  "extractionNotes": "string",
  "allDatesFound": [
    {
      "rawDate": "original date as shown",
      "convertedDate": "YYYY-MM-DD",
      "location": "where in document",
      "usedFor": "which field this date was used for"
    }
  ]
}
\`\`\`

## ✅ Extraction Rules

1. **Extract EVERYTHING from BOTH pages**
2. **Use null for missing/blank fields**
3. **NO placeholders**: Never use "Not provided", "N/A" as values - use null instead
4. **Exact values**: Copy numbers and text EXACTLY as shown
5. **Date format**: Convert all dates to YYYY-MM-DD
   - **READ EACH DIGIT EXTREMELY CAREFULLY**: 0≠6≠8, 1≠7, 2≠3
   - **COMMON FORMATS**: DD.MM.YYYY, DD/MM/YYYY, DD MM YYYY
   - Example: "01 09 2023" = Day 01, Month 09, Year 2023 → "2023-09-01"
   - **cocIssueDate**: The date next to the registered person's signature in the Declaration section on PAGE 1
   - **testReport.issueDate**: The "Date of issue" in the test report header on PAGE 2
6. **Measurements**: Include units in the value (e.g., "0.16Ω", ">240 MΩ", "237V")
7. **Confidence**: "high" only if both pages are clear and complete
8. **allDatesFound**: List ALL dates you found in the document with their locations

Now extract ALL data from this ECA COC document:`;

// Helper function to convert PDF to base64 in chunks
async function pdfToBase64(fileData: Blob): Promise<string> {
  const arrayBuffer = await fileData.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000; // Process 32KB at a time
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// Helper function to validate and parse dates
function parseAndValidateDate(rawDate: string): string | null {
  if (!rawDate) return null;
  
  // Clean up the date string
  const cleaned = rawDate.trim().replace(/\s+/g, ' ');
  
  // Try various date formats
  const patterns = [
    // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
    /^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})$/,
    // DD MM YYYY (with spaces)
    /^(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/,
    // YYYY-MM-DD (already ISO format)
    /^(\d{4})-(\d{2})-(\d{2})$/,
  ];
  
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      let year: number, month: number, day: number;
      
      if (pattern.source.startsWith('^(\\d{4})')) {
        // YYYY-MM-DD format
        [, year, month, day] = match.map(Number) as [unknown, number, number, number];
      } else {
        // DD.MM.YYYY format
        [, day, month, year] = match.map(Number) as [unknown, number, number, number];
      }
      
      // Validate ranges
      if (year >= 2000 && year <= 2030 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  
  return null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentUrl, fileName } = await req.json();
    
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

    console.log('Starting COC data extraction for:', fileName);
    console.log('Using model: google/gemini-2.5-pro for best visual document analysis');
    
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
    
    if (isPDF) {
      console.log('Processing PDF with Gemini 2.5 Pro vision for accurate extraction');
      
      const base64 = await pdfToBase64(fileData);
      console.log('PDF converted to base64, size:', base64.length);

      // Use Gemini 2.5 Pro for best visual understanding
      // Note: Gemini accepts PDF as base64 with inline_data
      console.log('Calling Gemini 2.5 Pro for extraction...');
      
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-pro',
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
                  text: EXTRACTION_PROMPT + `

CRITICAL EXTRACTION RULES:
1. COC NUMBER: Look in the TOP RIGHT corner of page 1 for "Certificate No." or "Cert No." - this is UNIQUE to this document
2. READ EACH DIGIT CAREFULLY: 0≠6≠8, 1≠7, 2≠3, 4≠9
3. Each COC has a DIFFERENT certificate number - make sure you extract THIS document's number
4. COC ISSUE DATE: From the signature section on page 1
5. Do NOT reuse data from other documents - extract fresh from THIS PDF`
                }
              ]
            }
          ],
          temperature: 0.1,
          max_tokens: 8192,
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('Gemini API error:', aiResponse.status, errorText);
        
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
        
        throw new Error('PDF extraction failed: ' + errorText);
      }

      const aiData = await aiResponse.json();
      console.log('Gemini response received');

      const aiContent = aiData.choices?.[0]?.message?.content;
      if (!aiContent) {
        throw new Error('Empty response from AI');
      }
      
      // Extract JSON from response
      let extractedData;
      try {
        const jsonMatch = aiContent.match(/```json\n([\s\S]*?)\n```/) || 
                         aiContent.match(/```\n([\s\S]*?)\n```/) ||
                         [null, aiContent];
        const jsonStr = jsonMatch[1] || aiContent;
        extractedData = JSON.parse(jsonStr);
        
        // Validate and fix dates
        if (extractedData.cocIssueDate) {
          const validated = parseAndValidateDate(extractedData.cocIssueDate);
          if (validated) {
            extractedData.cocIssueDate = validated;
          }
        }
        if (extractedData.testReport?.issueDate) {
          const validated = parseAndValidateDate(extractedData.testReport.issueDate);
          if (validated) {
            extractedData.testReport.issueDate = validated;
          }
        }
        if (extractedData.responsibility?.signatureDate) {
          const validated = parseAndValidateDate(extractedData.responsibility.signatureDate);
          if (validated) {
            extractedData.responsibility.signatureDate = validated;
          }
        }
        
      } catch (parseError) {
        console.error('Failed to parse AI response as JSON:', parseError);
        console.error('Raw response:', aiContent.substring(0, 500));
        extractedData = {
          cocNumber: null,
          cocType: 'Unknown',
          cocIssueDate: null,
          administrativeDetails: {},
          confidence: 'low',
          extractionNotes: 'Failed to parse extraction response'
        };
      }

      console.log('Extraction completed. COC Issue Date:', extractedData.cocIssueDate);
      console.log('All dates found:', JSON.stringify(extractedData.allDatesFound || []));

      return new Response(
        JSON.stringify({
          success: true,
          extractedData,
          model: 'google/gemini-2.5-pro'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // For non-PDF files, use text extraction
    const documentText = await fileData.text();
    console.log('Processing text file');
    const truncatedText = documentText.substring(0, 8000);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: EXTRACTION_PROMPT
          },
          { 
            role: 'user', 
            content: `Document content:\n\n${truncatedText}\n\nPlease extract the COC data and return ONLY the JSON result.`
          }
        ],
        temperature: 0.1,
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
      
      throw new Error('AI extraction failed');
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;
    
    let extractedData;
    try {
      const jsonMatch = aiContent.match(/```json\n([\s\S]*?)\n```/) || 
                       aiContent.match(/```\n([\s\S]*?)\n```/) ||
                       [null, aiContent];
      const jsonStr = jsonMatch[1] || aiContent;
      extractedData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      extractedData = {
        cocNumber: null,
        cocType: 'Unknown',
        cocIssueDate: null,
        administrativeDetails: {},
        confidence: 'low',
        extractionNotes: 'Failed to parse extraction response'
      };
    }

    console.log('Extraction completed:', JSON.stringify(extractedData));

    return new Response(
      JSON.stringify({
        success: true,
        extractedData
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
