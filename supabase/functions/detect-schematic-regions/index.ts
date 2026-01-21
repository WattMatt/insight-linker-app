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

    // Try Lovable AI Gateway first (Gemini), fall back to Anthropic
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!lovableApiKey && !anthropicApiKey) {
      console.error('[detect-schematic-regions] No API keys configured');
      return new Response(
        JSON.stringify({ error: 'No API keys configured' }),
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

    const prompt = `Analyze this electrical distribution schematic diagram.

The user clicked at ${clickXPercent.toFixed(1)}% from left, ${clickYPercent.toFixed(1)}% from top.

This schematic shows electrical distribution with DATA TABLES containing tenant/equipment info. Each DATA TABLE has:
- Rows labeled: NO, NAME, AREA, RATING, CABLE, SERIAL, CT
- Values in each row (like "DB-13C", "KFC", "311m²", etc.)
- Black border lines forming a rectangular table

Find the DATA TABLE closest to the click position. Return its COMPLETE outer boundary.

DATA TABLES are typically:
- 6-12% of page width
- 12-22% of page height
- Have 7 rows of data

Return ONLY valid JSON:
{"x": <center X as % 0-100>, "y": <center Y as % 0-100>, "width": <width as %>, "height": <height as %>, "label": "<value from NAME or NO row>"}

If no data table found: {"found": false}`;

    let textContent = '';

    // Try Lovable AI Gateway (Gemini) first
    if (lovableApiKey) {
      try {
        console.log('[detect-schematic-regions] Using Lovable AI Gateway (Gemini)');
        
        const lovableResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/png;base64,${pageImageBase64}`,
                    },
                  },
                  {
                    type: 'text',
                    text: prompt,
                  },
                ],
              },
            ],
          }),
        });

        if (lovableResponse.ok) {
          const lovableData = await lovableResponse.json();
          textContent = lovableData.choices?.[0]?.message?.content || '{}';
          console.log('[detect-schematic-regions] Gemini response:', textContent);
        } else {
          const errorText = await lovableResponse.text();
          console.warn('[detect-schematic-regions] Lovable AI error:', lovableResponse.status, errorText);
        }
      } catch (lovableError) {
        console.warn('[detect-schematic-regions] Lovable AI failed:', lovableError);
      }
    }

    // Fall back to Anthropic if Lovable AI didn't work
    if (!textContent && anthropicApiKey) {
      console.log('[detect-schematic-regions] Falling back to Anthropic');
      
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
                  text: prompt,
                },
              ],
            },
          ],
        }),
      });

      if (anthropicResponse.ok) {
        const anthropicData = await anthropicResponse.json();
        textContent = anthropicData.content?.find((c: any) => c.type === 'text')?.text || '{}';
        console.log('[detect-schematic-regions] Anthropic response:', textContent);
      } else {
        const errorText = await anthropicResponse.text();
        console.error('[detect-schematic-regions] Anthropic API error:', anthropicResponse.status, errorText);
      }
    }

    if (!textContent) {
      return new Response(
        JSON.stringify({ found: false, reason: 'AI analysis failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the JSON response
    let result: DetectedRegion | { found: false };
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*?\}/);
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
        
        // Sanity check: if dimensions are too small, likely detected wrong element
        const minWidthPercent = 5;
        const minHeightPercent = 10;
        if (parsed.width < minWidthPercent || parsed.height < minHeightPercent) {
          console.log('[detect-schematic-regions] Detected region too small, adjusting to minimum');
          parsed.width = Math.max(parsed.width, 8);
          parsed.height = Math.max(parsed.height, 15);
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
