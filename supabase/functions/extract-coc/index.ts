import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

// COC extraction edge function - extracts key information from COC without validation
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXTRACTION_PROMPT = `# 📋 Complete Electrical COC Data Extraction

## 🎯 Objective
Extract ALL information from an Electrical Certificate of Compliance (COC) document.
Extract EVERY field that appears on the certificate - do not skip any data.

## 📊 Data to Extract (Extract ALL Fields Present)

### 1. Certificate Information (REQUIRED)
- **COC Number**: Extract EXACT certificate number (e.g., "642760", "ECA-2024-001234")
- **COC Type**: ECA, ECSA, or other certificate type
- **Issue Date**: Convert to YYYY-MM-DD format (e.g., "18.09.2025" → "2025-09-18")

### 2. Administrative Details (REQUIRED)
- **Physical Address**: Complete installation address
- **Erf Number**: Property identification number
- **Registered Person**: Name of registered electrician/contractor
- **ID Number**: ID number if shown
- **Registration Number**: Electrician's registration/license number
- **Registration Type**: Type (e.g., "Electrical Contractor", "Installation Electrician")

### 3. Installation Details (REQUIRED)
- **Supply Type**: Single phase or Three phase
- **Supply Voltage**: e.g., "230V", "400V"
- **Main Switch Rating**: e.g., "80A", "100A"
- **Distribution Board Type**: Type of DB
- **Number of Circuits**: Total circuits

### 4. Scope of Work (REQUIRED)
- Complete description of work performed (new installation, alterations, etc.)

### 5. Test Results (EXTRACT ALL TEST DATA)
Extract ALL test results shown on the certificate:

**5.1 Earth Electrode System:**
- Resistance value in Ohms
- Test method used
- Result: Pass/Fail

**5.2 Insulation Resistance (in MΩ):**
- Phase 1 to Earth
- Phase 2 to Earth (if applicable)
- Phase 3 to Earth (if applicable)
- Phase to Phase
- Neutral to Earth
- Result: Pass/Fail

**5.3 Polarity Test:**
- Verified: Yes/No
- Result: Pass/Fail

**5.4 Earth Continuity:**
- Main bonding verified
- Circuit conductors tested
- Result: Pass/Fail

**5.5 Circuit Protection Devices:**
- Breaker ratings
- Tested: Yes/No
- Result: Pass/Fail

**5.6 RCD Tests:**
- Rated current (mA)
- Trip time (ms)
- Test current
- Result: Pass/Fail or N/A if no RCD

**5.7 Short Circuit Capacity (if shown):**
- Prospective fault current
- Verified: Yes/No
- Result: Pass/Fail

### 6. Declaration & Certification (REQUIRED)
- **Certified By**: Name of person certifying
- **Inspector Registration Number**: Registration number
- **Certification Date**: Date certificate was signed

## 📤 Required JSON Output Format

Return ONLY valid JSON with ALL fields:

\`\`\`json
{
  "cocNumber": "string or null",
  "cocType": "string or null",
  "cocIssueDate": "YYYY-MM-DD or null",
  "administrativeDetails": {
    "physicalAddress": "string or null",
    "erfNumber": "string or null",
    "registeredPerson": "string or null",
    "idNumber": "string or null",
    "registrationNumber": "string or null",
    "registrationType": "string or null"
  },
  "installationDetails": {
    "supplyType": "string or null",
    "supplyVoltage": "string or null",
    "mainSwitchRating": "string or null",
    "distributionBoardType": "string or null",
    "numberOfCircuits": "string or null"
  },
  "scopeOfWork": "string or null",
  "testResults": {
    "earthElectrode": {
      "resistance": "string or null",
      "method": "string or null",
      "result": "string or null"
    },
    "insulationResistance": {
      "phase1ToEarth": "string or null",
      "phase2ToEarth": "string or null",
      "phase3ToEarth": "string or null",
      "phaseToPhase": "string or null",
      "neutralToEarth": "string or null",
      "result": "string or null"
    },
    "polarity": {
      "verified": "string or null",
      "result": "string or null"
    },
    "earthContinuity": {
      "mainBonding": "string or null",
      "circuitConductors": "string or null",
      "result": "string or null"
    },
    "circuitBreakers": {
      "ratings": "string or null",
      "tested": "string or null",
      "result": "string or null"
    },
    "rcdTests": {
      "ratedCurrent": "string or null",
      "tripTime": "string or null",
      "testCurrent": "string or null",
      "result": "string or null"
    },
    "shortCircuitCapacity": {
      "prospectiveFaultCurrent": "string or null",
      "verified": "string or null",
      "result": "string or null"
    }
  },
  "declarationAndSignature": {
    "certifiedBy": "string or null",
    "inspectorRegistrationNumber": "string or null",
    "date": "YYYY-MM-DD or null"
  },
  "installationSummary": "string or null",
  "confidence": "high | medium | low",
  "extractionNotes": "string"
}
\`\`\`

## ✅ Critical Extraction Rules

1. **Extract EVERYTHING**: Extract ALL data visible on the certificate
2. **Use null for Missing**: If a field is not on the certificate, set to null
3. **NO Placeholders**: Never use "Not provided", "N/A", "TBD" - use null
4. **Exact Values**: Extract numbers and text EXACTLY as shown
5. **All Test Results**: Extract EVERY test result shown on the certificate

Now extract ALL data from this COC document:`;

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
