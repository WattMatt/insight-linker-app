import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

// COC validation edge function - validates electrical certificates against SANS 10142-1
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALIDATION_PROMPT = `# 🧠 AI Validation Prompt: SANS 10142-1 Compliance Rule Set for Electrical COCs

## 🎯 Objective
You are an AI system responsible for validating Electrical Certificates of Compliance (COCs) against the South African National Standard SANS 10142-1. Your task is to apply clause-specific compliance rules to structured COC data and return a detailed validation report indicating pass/fail status, clause violations, and supporting evidence.

## 🧩 SANS 10142-1 Rule Set

### Clauses 1-10 (Foundation)
1. **Scope**: Installation must fall within defined scope
2. **Normative References**: All referenced standards must be current
3. **Definitions**: Consistent terminology usage
4. **Fundamental Requirements**: Safety, Accessibility, Maintainability
5. **General Characteristics**: Environmental, load, usage factors
6. **Protection for Safety**: Earth leakage, overcurrent, insulation
7. **Equipment Selection**: Voltage rating, IP rating, compatibility
8. **Wiring Systems**: Cable type, routing, mechanical protection
9. **Earthing**: TN-S/TT/TN-C-S systems, bonding mandatory
10. **Circuit Design**: Load calculation, fault current, voltage drop

### Clauses 11-20 (Protection & Safety)
11. **Switchgear**: Rated current, breaking capacity, isolation
12. **Overcurrent Protection**: MCB/Fuse coordination required
13. **Fault Current**: Earth leakage/RCD/RCBO < 300ms response
14. **Overvoltage**: Surge arrestor/SPD at DB and generator
15. **Isolation**: Functional, emergency, maintenance switching
16. **Terminations**: Ferrules, lugs, crimping with visual + tug test
17. **Identification**: Circuit ID, voltage, source labels (UV resistant)
18. **Accessibility**: Minimum 600mm clearance, no obstructions
19. **Environmental**: IP ≥ 54, temperature range -10°C to 50°C
20. **Special Locations**: Zone 0/1/2 certification required

### Clauses 21-31 (Testing & Documentation)
21. **Inspection & Testing**: Visual, continuity, polarity, earth resistance
22. **Initial Verification**: Test report, diagram, CoC by registered person
23. **Periodic Inspection**: Every 3 years (visual, functional, safety)
24. **Documentation**: PDF/hard copy, 5-year retention
25. **Certification**: Issued by registered electrician, ECA database check
26. **Generator Integration**: Changeover switch, neutral isolation, backfeed prevention
27. **Inverter Systems**: DC isolation, AC coupling, earthing (SANS approved)
28. **Surge Protection**: Type 2 SPD at main DB, sub DB, generator
29. **Lightning Protection**: SANS 62305 compliance
30. **Remote Monitoring**: Modbus/MQTT with encrypted transmission
31. **Battery Storage**: DC sizing, ventilation, short-circuit protection, isolation

## 📤 Expected Input Format
You will receive COC document text extracted from uploaded files. Analyze the content for compliance.

## 📄 Required Output Format
Return ONLY a valid JSON object with this exact structure:

\`\`\`json
{
  "status": "Pass" | "Fail" | "Incomplete",
  "violations": [
    {
      "clause": "clause_number",
      "description": "what rule was violated",
      "evidence": "specific text or measurement from document"
    }
  ],
  "summary": "brief overall assessment"
}
\`\`\`

## ✅ Validation Rules
- All critical clauses must pass for status "Pass"
- Missing information = "Incomplete" status
- Any safety violation = "Fail" status
- Include specific evidence from document for each violation
- Be strict but fair in interpretation

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

    // Extract the storage path from the URL
    const urlParts = documentUrl.split('/storage/v1/object/public/documents/')[1];
    const storagePath = decodeURIComponent(urlParts);
    
    console.log('Downloading document from storage:', storagePath);
    
    // Download the document using Supabase client (works with private buckets)
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(storagePath);
    
    if (downloadError || !fileData) {
      console.error('Storage download error:', downloadError);
      throw new Error(`Failed to download document: ${downloadError?.message || 'Unknown error'}`);
    }

    // For now, we'll work with text-based analysis
    // In production, you'd want to add PDF parsing here
    const docText = await fileData.text();
    const truncatedText = docText.substring(0, 8000); // Limit context size

    console.log('Document fetched, calling AI for validation...');

    // Call Lovable AI for validation
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
            content: VALIDATION_PROMPT
          },
          { 
            role: 'user', 
            content: `Document content:\n\n${truncatedText}\n\nPlease validate this COC document and return ONLY the JSON validation result.`
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

    // Store validation result in database
    const { error: dbError } = await supabase
      .from('coc_validations')
      .upsert({
        document_id: documentId,
        subsection_id: subsectionId,
        status: validationResult.status,
        violations: validationResult.violations || [],
        validated_by: userId,
        validated_at: new Date().toISOString()
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
