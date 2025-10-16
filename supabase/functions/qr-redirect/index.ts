import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get('path') || url.pathname.replace('/qr-redirect/', '').replace('/qr-redirect', '');

    console.log('QR Redirect received path:', path);
    console.log('Full URL:', req.url);

    if (!path || path === '/') {
      return new Response('Missing path parameter', { 
        status: 400,
        headers: corsHeaders 
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the app origin from Referer header or construct from environment
    const referer = req.headers.get('referer');
    let appOrigin = 'https://7b7a829f-6566-4e31-a58f-428ee0cc1c75.lovableproject.com';
    if (referer) {
      const refererUrl = new URL(referer);
      appOrigin = refererUrl.origin;
    }
    console.log('App origin:', appOrigin);

    // Check if it's a UUID (new Supabase format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(path.replace(/^\//, ''))) {
      const subsectionId = path.replace(/^\//, '');
      console.log('UUID detected, redirecting to:', subsectionId);
      
      // Verify subsection exists
      const { data, error } = await supabase
        .from('subsections')
        .select('id')
        .eq('id', subsectionId)
        .single();

      if (error || !data) {
        console.error('Subsection not found:', error);
        return new Response('Subsection not found', { 
          status: 404,
          headers: corsHeaders 
        });
      }

      // Redirect to public subsection page
      const redirectUrl = `${appOrigin}/public/subsections/${subsectionId}`;
      console.log('Redirecting to:', redirectUrl);
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': redirectUrl
        }
      });
    }

    // Parse Firebase path format: /clients/ClientName/SiteName/SubsectionName
    const cleanPath = path.replace(/^\//, '').replace(/\/$/, '');
    const pathParts = cleanPath.split('/');
    
    console.log('Parsing Firebase path:', pathParts);

    // Try to find by firebase_id first (most reliable)
    const { data: subsectionByFirebaseId, error: fbError } = await supabase
      .from('subsections')
      .select('id, name, site_id, sites(name, client_id, clients(name))')
      .eq('firebase_id', cleanPath)
      .single();

    if (subsectionByFirebaseId && !fbError) {
      console.log('Found subsection by firebase_id:', subsectionByFirebaseId.id);
      const redirectUrl = `${appOrigin}/public/subsections/${subsectionByFirebaseId.id}`;
      console.log('Redirecting to:', redirectUrl);
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': redirectUrl
        }
      });
    }

    // Fallback: Try to match by name structure
    if (pathParts.length >= 3) {
      const [, clientName, siteName, ...subsectionParts] = pathParts;
      const subsectionName = subsectionParts.join('/');

      console.log('Searching for:', { clientName, siteName, subsectionName });

      // Query with joins to find matching subsection
      const { data: subsections, error } = await supabase
        .from('subsections')
        .select('id, name, firebase_id, sites(name, client_id, clients(name))')
        .ilike('name', `%${subsectionName}%`);

      if (error) {
        console.error('Query error:', error);
        return new Response('Database query failed', { 
          status: 500,
          headers: corsHeaders 
        });
      }

      // Filter by client and site names
      const matchedSubsection = subsections?.find(sub => {
        const site = (sub.sites as any);
        const client = site?.clients;
        return site?.name?.toLowerCase().includes(siteName.toLowerCase()) &&
               client?.name?.toLowerCase().includes(clientName.toLowerCase());
      });

      if (matchedSubsection) {
        console.log('Found subsection by name match:', matchedSubsection.id);
        const redirectUrl = `${appOrigin}/public/subsections/${matchedSubsection.id}`;
        console.log('Redirecting to:', redirectUrl);
        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            'Location': redirectUrl
          }
        });
      }
    }

    console.log('No matching subsection found for path:', path);
    return new Response('Subsection not found', { 
      status: 404,
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('Error in qr-redirect function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
