import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// log-auth-event — writes a single row to public.auth_events.
//
// Called by browser code via supabase.functions.invoke('log-auth-event', { body }).
// The browser cannot write to auth_events directly (no INSERT policy); this
// function uses the service-role client to bypass RLS.
//
// Inputs:
//   event_type  — one of the 11 whitelisted values (see migration
//                 20260525120000_auth_events_audit.sql)
//   metadata    — optional JSON payload (method, error_code, etc.)
//
// user_id, ip_address, user_agent are inferred from the request:
//   - user_id: JWT (Authorization header), null if anon
//   - ip_address: x-forwarded-for header (first hop)
//   - user_agent: user-agent header
//
// Returns 204 on success, never reveals whether the user existed.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_EVENTS = new Set([
  'login',
  'logout',
  'password_changed',
  'password_reset_requested',
  'magic_link_requested',
  'lockout',
  'mfa_enrolled',
  'mfa_unenrolled',
  'account_deleted',
  'account_email_changed',
  'user_created',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const eventType = typeof body?.event_type === 'string' ? body.event_type : null;
    const metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {};

    if (!eventType || !ALLOWED_EVENTS.has(eventType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid event_type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Best-effort user_id resolution from the caller's JWT.
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data } = await supabase.auth.getUser(token);
      userId = data.user?.id ?? null;
    }

    const forwardedFor = req.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor?.split(',')[0]?.trim() || null;
    const userAgent = req.headers.get('user-agent') || null;

    const { error } = await supabase.from('auth_events').insert({
      user_id: userId,
      event_type: eventType,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata,
    });

    if (error) {
      console.error('log-auth-event insert error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to log event' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(null, { status: 204, headers: corsHeaders });
  } catch (err) {
    console.error('log-auth-event handler error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
