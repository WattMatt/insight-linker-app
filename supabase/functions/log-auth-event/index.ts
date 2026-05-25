import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// log-auth-event — writes a single row to public.auth_events.
//
// Hardened in response to security-review HIGH #2. Two event buckets:
//
//   ANON_EVENTS — pre-session events that happen before a JWT exists.
//                 Caller may be anonymous; user_id is FORCED to NULL on
//                 the inserted row (we never trust an attacker-supplied
//                 user_id when there's no session).
//
//   AUTHED_EVENTS — known-user events. Require a valid JWT in the
//                   Authorization header; user_id is derived from the
//                   JWT after Supabase validates the signature. Any
//                   call with no/invalid JWT is rejected 401.
//
// Anything outside both lists is rejected 400. Metadata is restricted to
// a small shape — unexpected keys are dropped silently.
//
// Per-IP rate limit: 20 req/min per Deno isolate. NOT shared across
// regions or after a cold start; this is defence-against-naive-flooding
// only. For stronger guarantees move to a Postgres-backed counter.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANON_EVENTS = new Set([
  'password_reset_requested',
  'magic_link_requested',
  'lockout',
]);

const AUTHED_EVENTS = new Set([
  'login',
  'logout',
  'password_changed',
  'mfa_enrolled',
  'mfa_unenrolled',
  'account_deleted',
  'account_email_changed',
  'user_created',
]);

// Allowlist of metadata keys we'll persist. Anything else is dropped.
const METADATA_ALLOWED_KEYS = new Set(['method', 'reason', 'error_code']);

// In-memory per-IP rate limit (per Deno isolate).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
type RateEntry = { count: number; resetAt: number };
const rateLimits = new Map<string, RateEntry>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Periodic light cleanup so the map doesn't grow forever.
function maybeCleanup() {
  if (rateLimits.size < 10_000) return;
  const now = Date.now();
  for (const [k, v] of rateLimits) {
    if (v.resetAt < now) rateLimits.delete(k);
  }
}

function sanitizeMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (METADATA_ALLOWED_KEYS.has(k) && typeof v === 'string' && v.length <= 200) {
      out[k] = v;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const forwardedFor = req.headers.get('x-forwarded-for');
  const ipAddress = forwardedFor?.split(',')[0]?.trim() || 'unknown';

  if (!checkRateLimit(ipAddress)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  maybeCleanup();

  try {
    const body = await req.json();
    const eventType = typeof body?.event_type === 'string' ? body.event_type : null;
    const metadata = sanitizeMetadata(body?.metadata);

    if (!eventType) {
      return badRequest('event_type required');
    }

    const isAnon = ANON_EVENTS.has(eventType);
    const isAuthed = AUTHED_EVENTS.has(eventType);
    if (!isAnon && !isAuthed) {
      return badRequest('Unknown event_type');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let userId: string | null = null;

    if (isAuthed) {
      // Require a valid session. user_id comes from the verified JWT.
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return unauthorized('JWT required for this event_type');
      }
      const token = authHeader.slice(7);
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        return unauthorized('Invalid or expired JWT');
      }
      userId = data.user.id;
    }
    // For ANON_EVENTS we deliberately ignore any Authorization header
    // and persist user_id as NULL — never trust an attacker-supplied
    // identity when no session is required.

    const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null;
    const ipForStore = ipAddress === 'unknown' ? null : ipAddress;

    const { error: insertError } = await supabase.from('auth_events').insert({
      user_id: userId,
      event_type: eventType,
      ip_address: ipForStore,
      user_agent: userAgent,
      metadata,
    });

    if (insertError) {
      console.error('log-auth-event insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to log event' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(null, { status: 204, headers: corsHeaders });
  } catch (err) {
    console.error('log-auth-event handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function unauthorized(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
