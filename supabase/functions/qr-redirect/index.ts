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
    let path = url.searchParams.get('path') || url.pathname.replace('/qr-redirect/', '').replace('/qr-redirect', '');

    console.log('QR Redirect received path:', path);
    console.log('Full URL:', req.url);

    // Define UUID regex at the top for reuse
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Initialize Supabase client with the service role. The tier-2 lockdown
    // removed anon SELECT on subsections; these reads are safe to privilege —
    // the function never returns row data, only resolves an id and 302-redirects.
    // Also resolve the public origin from settings.qr_base_url (fallback: prod
    // domain) — the SAME canonical origin QR generation uses (src/lib/qrBaseUrl.ts),
    // so legacy redirects always land on the live app.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: settingsRow } = await supabase
      .from('settings')
      .select('qr_base_url')
      .limit(1)
      .maybeSingle();
    const appOrigin = (settingsRow?.qr_base_url?.trim() || 'https://watsonmattheus.com').replace(/\/$/, '');
    console.log('App origin:', appOrigin);

    // Handle malformed URLs with double slashes (from old QR codes)
    // e.g., //public/subsections/xxx should redirect to /public/subsections/xxx
    if (path.startsWith('//public/subsections/') || path.startsWith('/public/subsections/')) {
      const cleanPath = path.replace(/^\/+/, ''); // Remove leading slashes
      const subsectionId = cleanPath.replace('public/subsections/', '');

      if (subsectionId && uuidRegex.test(subsectionId)) {
        const redirectUrl = `${appOrigin}/public/subsections/${subsectionId}`;
        console.log('Redirecting malformed URL to:', redirectUrl);
        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            'Location': redirectUrl
          }
        });
      }
    }

    if (!path || path === '/') {
      return new Response('Missing path parameter', { 
        status: 400,
        headers: corsHeaders 
      });
    }

    // Check if it's a UUID (new Supabase format)
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
