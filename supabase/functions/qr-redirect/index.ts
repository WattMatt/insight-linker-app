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
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const appOrigin = (settingsRow?.qr_base_url?.trim() || 'https://insight-linker-app.vercel.app').replace(/\/$/, '');
    console.log('App origin:', appOrigin);

    // Best-effort scan log — must NEVER block or fail the redirect.
    // IP is truncated to /24 (POPIA: no precise-IP retention). IPv6 sources
    // yield null (v1 accepted trade-off; /64 truncation is a possible follow-up).
    const logScan = async (subsectionId: string) => {
      try {
        const rawIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
        const truncatedIp = /^\d+\.\d+\.\d+\.\d+$/.test(rawIp)
          ? rawIp.replace(/\.\d+$/, '.0')
          : null;
        await supabase.from('qr_scans').insert({
          subsection_id: subsectionId,
          user_agent: req.headers.get('user-agent') ?? null,
          ip_address: truncatedIp,
          source: 'redirect',
        });
      } catch (e) {
        console.error('scan log failed (non-blocking):', e);
      }
    };

    // Single exit point for subsection redirects: honors the kill-switch and logs.
    // Scan logging is deferred via EdgeRuntime.waitUntil so it never delays the
    // 302 response; falls back to awaited if that hook isn't present.
    const redirectToSubsection = async (subsectionId: string, qrDisabled: boolean) => {
      if (qrDisabled) {
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders, 'Location': `${appOrigin}/public/qr-retired` },
        });
      }
      const scanPromise = logScan(subsectionId);
      // Supabase Edge Runtime keeps the isolate alive to finish this after the
      // response is sent; logScan never rejects (see its try/catch) so this is
      // safe to fire without awaiting. Falls back to awaiting if the hook is absent.
      // @ts-ignore -- EdgeRuntime is injected by the Supabase edge runtime
      if (typeof EdgeRuntime !== 'undefined') {
        // @ts-ignore
        EdgeRuntime.waitUntil(scanPromise);
      } else {
        await scanPromise;
      }
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': `${appOrigin}/public/subsections/${subsectionId}` },
      });
    };

    const siteParam = url.searchParams.get('site');
    if (siteParam && uuidRegex.test(siteParam)) {
      const { data: siteRow, error: siteErr } = await supabase
        .from('sites').select('id').eq('id', siteParam).single();
      if (siteErr || !siteRow) {
        console.error('Site not found:', siteParam, siteErr);
        return new Response('Site not found', { status: 404, headers: corsHeaders });
      }
      console.log('Site QR redirecting to register:', siteParam);
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': `${appOrigin}/public/sites/${siteParam}/register` },
      });
    }

    // Handle malformed URLs with double slashes (from old QR codes)
    // e.g., //public/subsections/xxx should redirect to /public/subsections/xxx
    if (path.startsWith('//public/subsections/') || path.startsWith('/public/subsections/')) {
      const cleanPath = path.replace(/^\/+/, ''); // Remove leading slashes
      const subsectionId = cleanPath.replace('public/subsections/', '');

      if (subsectionId && uuidRegex.test(subsectionId)) {
        const { data: malformedRow } = await supabase
          .from('subsections')
          .select('id, qr_disabled')
          .eq('id', subsectionId)
          .maybeSingle();

        if (malformedRow) {
          console.log('Redirecting malformed URL to subsection:', subsectionId);
          return await redirectToSubsection(subsectionId, malformedRow.qr_disabled);
        }
        // Not found: this path shape (/public/subsections/<uuid>) is unambiguous —
        // firebase_id/name-match can never match it, so 404 directly instead of
        // falling through to checks that cannot succeed.
        console.error('Malformed-path subsection not found:', subsectionId);
        return new Response('Subsection not found', { status: 404, headers: corsHeaders });
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
        .select('id, qr_disabled')
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
      return await redirectToSubsection(subsectionId, data.qr_disabled);
    }

    // Parse Firebase path format: /clients/ClientName/SiteName/SubsectionName
    const cleanPath = path.replace(/^\//, '').replace(/\/$/, '');
    const pathParts = cleanPath.split('/');
    
    console.log('Parsing Firebase path:', pathParts);

    // Try to find by firebase_id first (most reliable)
    const { data: subsectionByFirebaseId, error: fbError } = await supabase
      .from('subsections')
      .select('id, name, site_id, qr_disabled, sites(name, client_id, clients(name))')
      .eq('firebase_id', cleanPath)
      .single();

    if (subsectionByFirebaseId && !fbError) {
      console.log('Found subsection by firebase_id:', subsectionByFirebaseId.id);
      return await redirectToSubsection(subsectionByFirebaseId.id, subsectionByFirebaseId.qr_disabled);
    }

    // Fallback: Try to match by name structure
    if (pathParts.length >= 3) {
      const [, clientName, siteName, ...subsectionParts] = pathParts;
      const subsectionName = subsectionParts.join('/');

      console.log('Searching for:', { clientName, siteName, subsectionName });

      // Guard against an empty subsectionName producing `ilike '%%'`, which
      // would match every row in the table.
      if (subsectionName) {
        // Query with joins to find matching subsection
        const { data: subsections, error } = await supabase
          .from('subsections')
          .select('id, name, firebase_id, qr_disabled, sites(name, client_id, clients(name))')
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
          // Cast needed: qr_disabled is a plain column but TS widens the result
          // to `any` alongside the untyped joined `sites` relation above.
          return await redirectToSubsection(matchedSubsection.id, (matchedSubsection as any).qr_disabled);
        }
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
