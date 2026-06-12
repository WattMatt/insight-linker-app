// audit-orphan-photos
// ──────────────────────────────────────────────────────────────────────────────
// Edge Function that returns every orphaned photo reference from
// `inspections.json_data` (URLs that point at a Storage object that no longer
// exists). Thin wrapper around the SQL views created by
// `migrations/2026-04-28_audit_orphan_photos.sql`.
//
// Query parameters (all optional):
//   inspection_id    Filter to a single inspection (uuid).
//   bucket           Filter to a single bucket (e.g. "inspection-photos").
//   include_existing Pass "true" to include rows whose Storage file DOES
//                    exist — useful for full-audit dumps. Default: orphans only.
//   limit            Cap row count (default 1000, max 10000).
//   format           "json" (default) or "csv".
//
// Auth: requires Supabase auth token with read access to the views (any
// authenticated user). Run from CLI:
//   curl -H "Authorization: Bearer $TOKEN" \
//     "https://oltzgidkjxwsukvkomof.functions.supabase.co/audit-orphan-photos?bucket=inspection-photos&limit=200"
//
// Deploy: `supabase functions deploy audit-orphan-photos`
// (See AUDIT_ORPHAN_PHOTOS_README.md for the full guide.)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, OPTIONS"
};
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: CORS_HEADERS
    });
  }
  const url = new URL(req.url);
  const inspectionFilter = url.searchParams.get("inspection_id");
  const bucketFilter = url.searchParams.get("bucket");
  const includeExisting = url.searchParams.get("include_existing") === "true";
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "1000", 10);
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 1000 : limitRaw, 1), 10000);
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonError(500, "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var");
  }
  // Use service role so the function can read storage.objects regardless of
  // bucket-level RLS — the SQL function is `security definer` but the joined
  // view still respects the caller's role for storage.objects.
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  let query = supabase.from("inspection_photo_refs").select("inspection_id,subsection_id,inspection_title,photo_url,bucket,object_path,exists_in_storage").order("inspection_id", {
    ascending: true
  }).limit(limit);
  if (!includeExisting) query = query.eq("exists_in_storage", false);
  if (inspectionFilter) query = query.eq("inspection_id", inspectionFilter);
  if (bucketFilter) query = query.eq("bucket", bucketFilter);
  const { data, error } = await query;
  if (error) return jsonError(500, error.message);
  const rows = data ?? [];
  if (format === "csv") return csvResponse(rows);
  // Group by inspection for the summary view
  const grouped = new Map();
  for (const row of rows){
    const entry = grouped.get(row.inspection_id) ?? {
      inspection_id: row.inspection_id,
      subsection_id: row.subsection_id,
      inspection_title: row.inspection_title,
      orphans: [],
      ok: []
    };
    if (row.exists_in_storage) entry.ok.push(row);
    else entry.orphans.push(row);
    grouped.set(row.inspection_id, entry);
  }
  const inspections = Array.from(grouped.values()).sort((a, b)=>b.orphans.length - a.orphans.length);
  const summary = {
    total_rows_returned: rows.length,
    inspections_returned: inspections.length,
    inspections_with_orphans: inspections.filter((i)=>i.orphans.length > 0).length,
    total_orphans: inspections.reduce((s, i)=>s + i.orphans.length, 0),
    total_ok: inspections.reduce((s, i)=>s + i.ok.length, 0),
    filters: {
      inspection_id: inspectionFilter,
      bucket: bucketFilter,
      include_existing: includeExisting,
      limit
    },
    note: includeExisting ? "Includes both orphans and successfully-resolving refs." : "Orphans only. Pass ?include_existing=true to see all photo refs."
  };
  return jsonResponse(200, {
    summary,
    inspections
  });
});
function jsonResponse(status, body) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json; charset=utf-8"
    }
  });
}
function jsonError(status, message) {
  return jsonResponse(status, {
    error: message
  });
}
function csvResponse(rows) {
  const header = "inspection_id,subsection_id,inspection_title,bucket,object_path,exists_in_storage,photo_url";
  const escape = (v)=>v == null ? "" : `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r)=>[
      r.inspection_id,
      r.subsection_id ?? "",
      r.inspection_title ?? "",
      r.bucket,
      r.object_path,
      r.exists_in_storage,
      r.photo_url
    ].map(escape).join(","));
  const csv = [
    header,
    ...lines
  ].join("\n");
  return new Response(csv, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "content-type": "text/csv; charset=utf-8"
    }
  });
}
