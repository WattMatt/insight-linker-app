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
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfUrl, clickX, clickY, pageWidth, pageHeight } = await req.json();
    
    if (!pdfUrl || clickX === undefined || clickY === undefined) {
      return new Response(
        JSON.stringify({ error: 'pdfUrl, clickX, and clickY are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[detect-schematic-regions] Smart snap request at:', { clickX, clickY, pageWidth, pageHeight });
    console.log('[detect-schematic-regions] PDF URL:', pdfUrl);

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!anthropicApiKey) {
      console.error('[detect-schematic-regions] ANTHROPIC_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert click coordinates to percentages for the AI prompt
    const clickXPercent = (clickX / pageWidth) * 100;
    const clickYPercent = (clickY / pageHeight) * 100;

    console.log('[detect-schematic-regions] Click position:', { clickXPercent: clickXPercent.toFixed(1), clickYPercent: clickYPercent.toFixed(1) });

    // Use PDF document support with the correct API version
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2025-01-01', // Required for PDF document support
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
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
                text: `You are analyzing an electrical distribution schematic diagram PDF.

The user clicked at position: ${clickXPercent.toFixed(1)}% from the left edge, ${clickYPercent.toFixed(1)}% from the top edge.

Find the NEAREST rectangular box/block to this click point. Look for:
- Distribution boards (DB boxes)
- Tenant/shop electrical connection boxes
- Main switchboards
- Any labeled rectangular section

Return the EXACT boundaries of the nearest rectangle as percentages of the page dimensions.

CRITICAL: Return ONLY a JSON object, nothing else:
{
  "x": <center X position as percentage 0-100>,
  "y": <center Y position as percentage 0-100>,
  "width": <width as percentage of page>,
  "height": <height as percentage of page>,
  "label": "<any text visible in or near this rectangle, or null>"
}

If no clear rectangle is found near the click point, return:
{"found": false}

Only return valid JSON, no explanations.`,
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error('[detect-schematic-regions] Anthropic API error:', anthropicResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to analyze PDF', details: errorText, found: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropicData = await anthropicResponse.json();
    console.log('[detect-schematic-regions] Full AI response:', JSON.stringify(anthropicData).substring(0, 500));
    
    const textContent = anthropicData.content?.find((c: any) => c.type === 'text')?.text || '{}';
    console.log('[detect-schematic-regions] AI text response:', textContent);

    // Parse the JSON response
    let result: DetectedRegion | { found: false };
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('[detect-schematic-regions] Parsed JSON:', parsed);
        
        if (parsed.found === false) {
          return new Response(
            JSON.stringify({ found: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Convert percentage-based coordinates to pixel coordinates
        result = {
          x: (parsed.x / 100) * pageWidth,
          y: (parsed.y / 100) * pageHeight,
          width: (parsed.width / 100) * pageWidth,
          height: (parsed.height / 100) * pageHeight,
          label: parsed.label || null,
        };
      } else {
        console.log('[detect-schematic-regions] No JSON match found in response');
        return new Response(
          JSON.stringify({ found: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (parseError) {
      console.error('[detect-schematic-regions] Failed to parse:', parseError);
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[detect-schematic-regions] Detected region:', result);

    return new Response(
      JSON.stringify({ 
        found: true, 
        region: result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[detect-schematic-regions] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage, found: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
