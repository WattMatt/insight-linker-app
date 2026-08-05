import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accepted image types only — SVG is deliberately excluded (stored-XSS risk
// via a publicly fetchable/rendered URL). Value is the file extension to use.
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Best-effort per-instance throttle (edge instances are ephemeral; this is a
// speed bump, not a guarantee — Turnstile is the real gate). Accepted v1
// limits: per-instance only; persisted per-subsection counters are a
// documented follow-up.
const recent = new Map<string, number[]>();
const throttled = (ip: string) => {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > 5;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
    if (throttled(ip)) return json(429, { error: 'Too many reports — please wait a minute.' });

    const form = await req.formData();
    const token = String(form.get('turnstile_token') ?? '');
    const subsectionId = String(form.get('subsection_id') ?? '');
    const title = String(form.get('title') ?? '').trim().slice(0, 200);
    const description = String(form.get('description') ?? '').trim().slice(0, 2000);
    const photos = form.getAll('photos').filter((p): p is File => p instanceof File).slice(0, 3);

    if (!uuidRegex.test(subsectionId) || !title) {
      return json(400, { error: 'Missing subsection or title.' });
    }

    // Server-side Turnstile verification — the whole point of this function.
    const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
    if (!secret) throw new Error('TURNSTILE_SECRET_KEY not configured');
    const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    }).then((r) => r.json());
    if (!verify.success) return json(403, { error: 'Captcha verification failed.' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: sub, error: subErr } = await supabase
      .from('subsections').select('id, qr_disabled').eq('id', subsectionId).single();
    if (subErr || !sub) return json(404, { error: 'Subsection not found.' });
    // Retired QR codes must not accept public reports. Response is
    // deliberately indistinguishable from "not found" — no info leak.
    if ((sub as any).qr_disabled) return json(404, { error: 'Subsection not found.' });

    const photoPaths: string[] = [];
    for (const photo of photos) {
      const ext = ALLOWED_IMAGE_TYPES[photo.type];
      if (!ext || photo.size > 5 * 1024 * 1024) continue;
      // Public bucket + full URL matches the app-wide snag-photo convention;
      // every renderer treats photos entries as fetchable URLs.
      const path = `public-issue-reports/${subsectionId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('inspection-photos')
        .upload(path, photo, { contentType: photo.type });
      if (upErr) {
        console.error('photo upload failed (continuing):', upErr);
      } else {
        const { data: publicUrl } = supabase.storage.from('inspection-photos').getPublicUrl(path);
        photoPaths.push(publicUrl.publicUrl);
      }
    }

    const { error: insErr } = await supabase.from('snags').insert({
      subsection_id: subsectionId,
      title,
      description: description || null,
      status: 'Open',
      photos: photoPaths,
      reported_channel: 'public_qr',
    });
    if (insErr) throw insErr;

    return json(200, { ok: true, photosSaved: photoPaths.length });
  } catch (error) {
    console.error('report-issue error:', error);
    return json(500, { error: 'Could not submit the report. Please try again.' });
  }
});
