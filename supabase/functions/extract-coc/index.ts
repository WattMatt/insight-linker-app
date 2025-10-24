import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

// COC extraction edge function - extracts key information from COC without validation
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXTRACTION_PROMPT = `# 📋 Electrical COC Data Extraction

## 🎯 Objective
Extract key information from an Electrical Certificate of Compliance (COC) document.
DO NOT perform validation or compliance checking - only extract the data as shown on the document.

## 📊 Data to Extract

### 1. Certificate Information (HIGHEST PRIORITY)
- **COC Number**: Look for "Certificate of Compliance (CoC) No." or "COC No." or similar field
  - Extract the EXACT number as shown (e.g., "642 760", "ECA-2024-001234")
  - DO NOT use filename or derived values
  
- **COC Type**: Determine if this is ECA, ECSA, or other type of certificate
  - Look for issuing organization name/logo
  
- **Issue Date**: Look for "Date of issue:" or "Issue Date:" or "Certificate Date:"
  - Extract the EXACT date shown
  - Convert to YYYY-MM-DD format:
    * "18.09.2025" → "2025-09-18"
    * "15/05/2024" → "2024-05-15"
  - If not clearly visible, set to null

### 2. Administrative Details
- **Physical Address**: Installation address from the certificate
- **Erf/Lot Number**: Property identification number
- **Registered Person**: Name of the registered electrician who issued the certificate
- **Registration Number**: The electrician's registration/license number
- **Registration Type**: Type of registration (e.g., "Electrical Contractor", "Master Electrician")
- **ID Number**: ID number of the registered person (if shown)

### 3. Installation Summary
- Brief description of the electrical installation (if provided on certificate)
- Type of work performed (new installation, alteration, maintenance, etc.)

## 📤 Required JSON Output Format

Return ONLY valid JSON in this exact format:

\`\`\`json
{
  "cocNumber": "string (exact value from certificate field) or null",
  "cocType": "ECA | ECSA | Other | Unknown",
  "cocIssueDate": "YYYY-MM-DD or null",
  "administrativeDetails": {
    "physicalAddress": "string or null",
    "erfNumber": "string or null",
    "registeredPerson": "string or null",
    "idNumber": "string or null",
    "registrationNumber": "string or null",
    "registrationType": "string or null"
  },
  "installationSummary": "string or null",
  "confidence": "high | medium | low",
  "extractionNotes": "Any issues or uncertainties during extraction"
}
\`\`\`

## ✅ Extraction Rules

1. **Be Precise**: Extract EXACTLY what is shown on the document
2. **Use Null for Missing Data**: If a field is not visible or unclear, set it to null
3. **No Placeholders**: Never use "Not provided", "N/A", or similar - use null instead
4. **Confidence Assessment**:
   - "high": All critical fields clearly visible and extracted
   - "medium": Most fields extracted, some unclear
   - "low": Significant fields missing or unclear

5. **Date Conversion Examples**:
   - "18.09.2025" → "2025-09-18"
   - "15/05/2024" → "2024-05-15"
   - "2024-03-10" → "2024-03-10" (already correct)
   - "18 September 2025" → "2025-09-18"

Now extract the data from the following COC document:`;

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
      
      // Convert PDF blob to base64 for vision processing
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
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
