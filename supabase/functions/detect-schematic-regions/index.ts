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
    const { pdfUrl, clickX, clickY, pageWidth, pageHeight, pageImageBase64 } = await req.json();
    
    if (clickX === undefined || clickY === undefined) {
      return new Response(
        JSON.stringify({ error: 'clickX and clickY are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[detect-schematic-regions] Smart snap request at:', { clickX, clickY, pageWidth, pageHeight });

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

    // Check if we have a base64 image from the client
    if (!pageImageBase64) {
      console.log('[detect-schematic-regions] No page image provided, cannot analyze');
      return new Response(
        JSON.stringify({ found: false, reason: 'No page image provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[detect-schematic-regions] Image data length:', pageImageBase64.length);

    // Use image-based vision API (more reliable than PDF documents)
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: pageImageBase64,
                },
              },
              {
                type: 'text',
                text: `You are analyzing an electrical distribution schematic diagram.

The user clicked at approximately ${clickXPercent.toFixed(1)}% from the left edge, ${clickYPercent.toFixed(1)}% from the top edge.

This schematic contains RECTANGULAR TABLE BLOCKS representing electrical distribution boards. Each block is a TABLE with:
- A visible BLACK BORDER forming a RECTANGLE around the entire table
- Multiple rows including: NO (DB identifier), NAME (tenant name), AREA, RATING, CABLE, SERIAL, CT
- The ENTIRE TABLE including ALL rows is the block you need to detect

IMPORTANT: You must find the COMPLETE OUTER BOUNDARY of the nearest table block - from the top-left corner of the table border to the bottom-right corner. Do NOT just detect the label text - detect the FULL TABLE RECTANGLE.

The tables are typically about 8-15% of the page width and 15-25% of the page height.

Return the EXACT OUTER boundaries of the nearest complete table block as percentages of the image dimensions.

CRITICAL: Return ONLY a JSON object:
{
  "x": <CENTER X position of the FULL table as percentage 0-100>,
  "y": <CENTER Y position of the FULL table as percentage 0-100>,
  "width": <FULL WIDTH of the table as percentage of page>,
  "height": <FULL HEIGHT of the table as percentage of page>,
  "label": "<the DB number from NO: field OR the NAME field value>"
}

If no table block is found near the click point, return:
{"found": false}

Only return valid JSON.`,
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
        JSON.stringify({ error: 'Failed to analyze image', details: errorText, found: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropicData = await anthropicResponse.json();
    console.log('[detect-schematic-regions] API response received');
    
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
        
        // Validate we have required fields
        if (parsed.x === undefined || parsed.y === undefined || 
            parsed.width === undefined || parsed.height === undefined) {
          console.log('[detect-schematic-regions] Missing required fields in response');
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
