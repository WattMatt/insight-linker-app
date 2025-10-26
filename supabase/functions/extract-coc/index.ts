import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

// COC extraction edge function - extracts key information from COC without validation
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

**1. Certificate Identification:**
- Certificate No. (e.g., "ECA 642760")
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

Return ONLY this JSON structure with ALL extracted data:

\`\`\`json
{
  "cocNumber": "string",
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
  "extractionNotes": "string"
}
\`\`\`

## ✅ Extraction Rules

1. **Extract EVERYTHING from BOTH pages**
2. **Use null for missing/blank fields**
3. **NO placeholders**: Never use "Not provided", "N/A" as values - use null instead
4. **Exact values**: Copy numbers and text EXACTLY as shown
5. **Date format**: Convert all dates to YYYY-MM-DD (e.g., "18.09.2025" → "2025-09-18")
6. **Measurements**: Include units in the value (e.g., "0.16Ω", ">240 MΩ", "237V")
7. **Confidence**: "high" only if both pages are clear and complete

Now extract ALL data from this ECA COC document:`;

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
    console.log('Downloading document from URL:', documentUrl.substring(0, 100) + '...');
    
    // Download the document using fetch (works for both signed URLs and public URLs)
    const docResponse = await fetch(documentUrl);
    
    if (!docResponse.ok) {
      console.error('Failed to fetch document:', docResponse.status, docResponse.statusText);
      throw new Error(`Failed to download document: ${docResponse.statusText}`);
    }
    
    const fileData = await docResponse.blob();

    // Check if this is a PDF file
    const isPDF = fileName?.toLowerCase().endsWith('.pdf');
    
    if (isPDF) {
      console.log('Processing PDF file with vision');
      
      // Convert PDF blob to base64 for vision processing (process in chunks to avoid stack overflow)
      const arrayBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 0x8000; // Process 32KB at a time
      
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64 = btoa(binary);
      
      console.log('Calling AI with PDF vision...');
      
      // Use Claude Sonnet for PDF vision extraction
      const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: base64
                  }
                },
                {
                  type: 'text',
                  text: EXTRACTION_PROMPT + '\n\nPlease extract the COC data from this PDF and return ONLY the JSON result.'
                }
              ]
            }
          ]
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('Anthropic API error:', aiResponse.status, errorText);
        throw new Error('PDF extraction failed');
      }

      const aiData = await aiResponse.json();
      console.log('AI response received');

      const aiContent = aiData.content[0].text;
      
      // Extract JSON from response
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
    }
    
    // For non-PDF files, use text extraction
    const documentText = await fileData.text();
    console.log('Processing text file');
    const truncatedText = documentText.substring(0, 8000);

    console.log('Document fetched, calling AI for extraction...');

    // Call Lovable AI for extraction
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
        temperature: 0.1, // Very low temperature for precise extraction
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
    console.log('AI response received');

    const aiContent = aiData.choices[0].message.content;
    
    // Extract JSON from response
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
