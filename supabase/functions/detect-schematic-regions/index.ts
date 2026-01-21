import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DetectedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  confidence?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { schematicId, pdfUrl, pageWidth, pageHeight } = await req.json();
    
    if (!schematicId || !pdfUrl) {
      return new Response(
        JSON.stringify({ error: 'schematicId and pdfUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[detect-schematic-regions] Starting detection for:', schematicId);
    console.log('[detect-schematic-regions] PDF URL:', pdfUrl);
    console.log('[detect-schematic-regions] Dimensions:', { pageWidth, pageHeight });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!anthropicApiKey) {
      console.error('[detect-schematic-regions] ANTHROPIC_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update status to processing
    await supabase
      .from('site_schematics')
      .update({ detection_status: 'processing' })
      .eq('id', schematicId);

    // For PDFs, we need to convert to image first. Let's use the existing public URL
    // and ask Claude to analyze the electrical schematic
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'url',
                  url: pdfUrl,
                },
              },
              {
                type: 'text',
                text: `Analyze this electrical distribution schematic diagram. 

Your task is to detect ALL rectangular boxes/blocks in the diagram that represent:
- Distribution boards (DB)
- Tenant/shop electrical connections
- Main switchboards
- Sub-distribution panels
- Any labeled rectangular sections

For each detected rectangle, provide its position and dimensions as a percentage of the total page dimensions.

IMPORTANT: Return ONLY a valid JSON array, no other text. Each object should have:
- x: horizontal center position as percentage (0-100) from left edge
- y: vertical center position as percentage (0-100) from top edge  
- width: width as percentage of page width (0-100)
- height: height as percentage of page height (0-100)
- label: any text label visible in or near the rectangle (e.g., "DB-001", "Shop 1", etc.)

Example response format:
[
  {"x": 25.5, "y": 30.2, "width": 8.5, "height": 5.2, "label": "DB-001"},
  {"x": 50.0, "y": 45.0, "width": 10.0, "height": 6.0, "label": "Main DB"}
]

If no rectangles are found, return an empty array: []

Only return the JSON array, nothing else.`,
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error('[detect-schematic-regions] Anthropic API error:', errorText);
      
      await supabase
        .from('site_schematics')
        .update({ detection_status: 'failed' })
        .eq('id', schematicId);
        
      return new Response(
        JSON.stringify({ error: 'Failed to analyze PDF', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropicData = await anthropicResponse.json();
    console.log('[detect-schematic-regions] Anthropic response received');

    // Extract the text content from Claude's response
    const textContent = anthropicData.content?.find((c: any) => c.type === 'text')?.text || '[]';
    console.log('[detect-schematic-regions] Raw response:', textContent.substring(0, 500));

    // Parse the JSON response
    let detectedRegions: DetectedRegion[] = [];
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = textContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsedRegions = JSON.parse(jsonMatch[0]);
        
        // Convert percentage-based coordinates to pixel coordinates
        detectedRegions = parsedRegions.map((region: any) => ({
          x: (region.x / 100) * (pageWidth || 1000),
          y: (region.y / 100) * (pageHeight || 700),
          width: (region.width / 100) * (pageWidth || 1000),
          height: (region.height / 100) * (pageHeight || 700),
          label: region.label || null,
          confidence: region.confidence || 0.8,
        }));
      }
    } catch (parseError) {
      console.error('[detect-schematic-regions] Failed to parse regions:', parseError);
      console.error('[detect-schematic-regions] Raw text was:', textContent);
    }

    console.log('[detect-schematic-regions] Detected regions:', detectedRegions.length);

    // Store the detected regions
    const { error: updateError } = await supabase
      .from('site_schematics')
      .update({
        detected_regions: detectedRegions,
        regions_detected_at: new Date().toISOString(),
        detection_status: 'completed',
      })
      .eq('id', schematicId);

    if (updateError) {
      console.error('[detect-schematic-regions] Failed to save regions:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to save detected regions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[detect-schematic-regions] Successfully saved', detectedRegions.length, 'regions');

    return new Response(
      JSON.stringify({ 
        success: true, 
        regions: detectedRegions,
        count: detectedRegions.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[detect-schematic-regions] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
