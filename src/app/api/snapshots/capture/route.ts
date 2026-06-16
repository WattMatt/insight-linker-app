import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { computeSiteDeliverables, categoryMatches, THERMAL_CATEGORY_PATTERNS, type SiteDeliverablesInput } from "@/lib/siteDeliverables";
import { factorScores, siteHealthScore, readiness } from "@/lib/siteHealth";
import { isSnagOpen } from "@/lib/subsectionStatus";
import { toSnapshotRow } from "@/lib/snapshotMetrics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Page through a table so a >1000-row table is never silently truncated (capture must be exact).
async function fetchAll(supabase: SupabaseClient, table: string, columns: string): Promise<any[]> {
  const rows: any[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return rows;
}

function groupBy<T>(rows: T[], key: (r: T) => string | undefined | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "missing supabase env" }, { status: 500 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const capturedAt = new Date().toISOString().slice(0, 10);

  try {
    const [sites, subs, snags, insps, schematics, assets, docs, subDocs] = await Promise.all([
      fetchAll(supabase, "sites", "id, name, client_id"),
      fetchAll(supabase, "subsections", "id, site_id, name, coc_status, is_coc_required, is_thermal_required, metering_status, meter_serial_number"),
      fetchAll(supabase, "snags", "id, subsection_id, status, risk_level, title"),
      fetchAll(supabase, "inspections", "subsection_id, status, site_id"),
      fetchAll(supabase, "site_schematics", "site_id"),
      fetchAll(supabase, "site_assets", "site_id"),
      fetchAll(supabase, "site_documents", "site_id, category"),
      fetchAll(supabase, "subsection_documents", "subsection_id, document_categories(name)"),
    ]);

    const subToSite = new Map<string, string>(subs.map((s) => [s.id, s.site_id]));
    const schematicSites = new Set(schematics.map((r) => r.site_id));
    const assetSites = new Set(assets.map((r) => r.site_id));
    const subsBySite = groupBy(subs, (s) => s.site_id);
    const snagsBySite = groupBy(snags, (n) => subToSite.get(n.subsection_id));
    const inspBySite = groupBy(insps, (i) => i.site_id);
    const docsBySite = groupBy(docs, (d) => d.site_id);
    const thermalDocSubsectionIds = subDocs
      .filter((d: any) => categoryMatches([d.document_categories?.name], THERMAL_CATEGORY_PATTERNS))
      .map((d: any) => d.subsection_id);

    const rows = sites.map((site) => {
      const input: SiteDeliverablesInput = {
        siteId: site.id,
        siteName: site.name,
        subsections: subsBySite.get(site.id) || [],
        snags: snagsBySite.get(site.id) || [],
        inspections: inspBySite.get(site.id) || [],
        hasSchematic: schematicSites.has(site.id),
        assetCount: assetSites.has(site.id) ? 1 : 0,
        documentCategories: (docsBySite.get(site.id) || []).map((d: any) => d.category),
        thermalDocSubsectionIds,
      };
      const summary = computeSiteDeliverables(input);
      const rd = readiness(input.subsections, input.snags, input.inspections);
      const healthScore = siteHealthScore(factorScores(input.subsections, input.snags, input.inspections));
      const openSnags = input.snags.filter((s) => isSnagOpen(s.status)).length;
      return toSnapshotRow({ siteId: site.id, capturedAt, summary, readiness: rd, healthScore, openSnags });
    });

    const { error } = await supabase
      .from("site_health_snapshots")
      .upsert(rows, { onConflict: "site_id,captured_at" });
    if (error) throw error;

    return NextResponse.json({ ok: true, captured: rows.length, capturedAt });
  } catch (e: any) {
    console.error("snapshot capture failed:", e);
    return NextResponse.json({ error: e?.message ?? "capture failed" }, { status: 500 });
  }
}
