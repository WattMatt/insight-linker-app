// List every report a site can produce, with what is needed to judge its freshness.
// Queries are shared across report types and loaded once per listing.
import { supabase } from "@/integrations/supabase/client";
import { getReportCategoryName } from "@/lib/pdfDocumentSaver";
import { isSystemReportCategory } from "@/lib/documents/reportCategories";
import { latestTimestamp } from "./status";
import type { ExistingReport, ReportTarget, ReportType, SiteReportContext } from "./types";
import { REPORT_TYPE_LABELS } from "./types";

const ID_CHUNK = 100;
const PAGE = 1000;
const INSPECTION_CATEGORY = getReportCategoryName("inspection");

const SITE_REPORT_CATEGORY: Record<Exclude<ReportType, "inspection">, string> = {
  "site-coc": getReportCategoryName("site-coc"),
  "fortress-checklist": getReportCategoryName("fortress-checklist"),
  "site-summary": getReportCategoryName("site-summary"),
  "asset-verification": getReportCategoryName("asset-verification"),
};

type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
interface RangeQuery<T> { range(from: number, to: number): QueryResult<T> }

/** Run an `.in(ids)` query in id chunks, paging past PostgREST's row cap. */
async function selectForIds<T>(ids: string[], build: (chunk: string[]) => RangeQuery<T>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build(chunk).range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

type SiteScopedTable = "site_assets" | "site_marking_checklist" | "coc_db_schedule" | "coc_certificates";

/** Latest updated_at (and row count) for a site-scoped table. */
async function siteTableFreshness(table: SiteScopedTable, siteId: string): Promise<{ latest: string | null; count: number }> {
  const { data, error, count } = await (supabase.from(table) as unknown as {
    select: (cols: string, opts: { count: "exact" }) => {
      eq: (c: string, v: string) => {
        order: (c: string, o: { ascending: boolean; nullsFirst: boolean }) => {
          limit: (n: number) => PromiseLike<{ data: { updated_at: string | null }[] | null; error: { message: string } | null; count: number | null }>;
        };
      };
    };
  })
    .select("updated_at", { count: "exact" })
    .eq("site_id", siteId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw new Error(`${table}: ${error.message}`);
  return { latest: data?.[0]?.updated_at ?? null, count: count ?? 0 };
}

const once = <T,>(load: () => Promise<T>) => {
  let p: Promise<T> | null = null;
  return () => (p ??= load());
};

interface InspectionRow {
  id: string;
  template_id: string | null;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  inspection_templates: { name: string | null } | null;
}
interface SubsectionRow {
  id: string;
  name: string;
  updated_at: string | null;
  is_coc_required: boolean | null;
  inspections: InspectionRow[] | null;
}

export interface SiteReportListing {
  targets: ReportTarget[];
  /** Report types whose listing failed, with the reason; the other types still list. */
  errors: Partial<Record<ReportType, string>>;
}

export async function listSiteReportTargets(ctx: SiteReportContext): Promise<SiteReportListing> {
  const { siteId } = ctx;

  const loadSubsections = once(async () => {
    const { data, error } = await supabase
      .from("subsections")
      .select("id, name, updated_at, is_coc_required, inspections(id, template_id, title, created_at, updated_at, deleted_at, inspection_templates(name))")
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .order("name");
    if (error) throw new Error(`subsections: ${error.message}`);
    return (data ?? []) as unknown as SubsectionRow[];
  });

  const liveInspections = (subs: SubsectionRow[]) =>
    subs.flatMap((s) => (s.inspections ?? []).filter((i) => !i.deleted_at).map((i) => ({ sub: s, insp: i })));

  const loadSnagFreshness = once(async () => {
    const subs = await loadSubsections();
    const rows = await selectForIds<{ subsection_id: string; updated_at: string | null }>(subs.map((s) => s.id), (chunk) =>
      supabase.from("snags").select("subsection_id, updated_at").in("subsection_id", chunk).order("id"));
    const bySubsection = new Map<string, string | null>();
    for (const r of rows) bySubsection.set(r.subsection_id, latestTimestamp(bySubsection.get(r.subsection_id), r.updated_at));
    return { bySubsection, latest: latestTimestamp(...bySubsection.values()) };
  });

  const loadSiteDocuments = once(async () => {
    const { data, error } = await supabase
      .from("site_documents")
      .select("id, category, created_at, updated_at")
      .eq("site_id", siteId);
    if (error) throw new Error(`site_documents: ${error.message}`);
    return data ?? [];
  });

  const loadSiteRow = once(async () => {
    const { data, error } = await supabase.from("sites").select("updated_at").eq("id", siteId).single();
    if (error) throw new Error(`sites: ${error.message}`);
    return data;
  });

  const freshness = {
    assets: once(() => siteTableFreshness("site_assets", siteId)),
    checklist: once(() => siteTableFreshness("site_marking_checklist", siteId)),
    cocSchedule: once(() => siteTableFreshness("coc_db_schedule", siteId)),
    cocCerts: once(() => siteTableFreshness("coc_certificates", siteId)),
  };

  const latestInspectionUpdate = async () =>
    latestTimestamp(...liveInspections(await loadSubsections()).map(({ insp }) => insp.updated_at));
  const latestSubsectionUpdate = async () =>
    latestTimestamp(...(await loadSubsections()).map((s) => s.updated_at));

  const existingSiteReport = async (type: Exclude<ReportType, "inspection">): Promise<ExistingReport | null> => {
    const category = SITE_REPORT_CATEGORY[type];
    const latest = (await loadSiteDocuments())
      .filter((d) => d.category === category)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    return latest ? { id: latest.id, createdAt: latest.created_at, linked: true } : null;
  };

  const siteTarget = async (
    type: Exclude<ReportType, "inspection">,
    sourceUpdatedAt: string | null,
    emptyReason?: string,
  ): Promise<ReportTarget> => ({
    key: type,
    type,
    label: REPORT_TYPE_LABELS[type],
    sourceUpdatedAt,
    existing: await existingSiteReport(type),
    emptyReason,
  });

  const builders: Record<ReportType, () => Promise<ReportTarget[]>> = {
    "site-coc": async () => {
      const [subs, schedule, certs, snags] = await Promise.all([
        loadSubsections(), freshness.cocSchedule(), freshness.cocCerts(), loadSnagFreshness(),
      ]);
      const source = latestTimestamp(schedule.latest, certs.latest, await latestSubsectionUpdate(), await latestInspectionUpdate(), snags.latest);
      const empty = subs.some((s) => s.is_coc_required) ? undefined : "No subsections require a COC";
      return [await siteTarget("site-coc", source, empty)];
    },
    "fortress-checklist": async () => {
      const checklist = await freshness.checklist();
      return [await siteTarget("fortress-checklist", checklist.latest, checklist.count === 0 ? "Checklist not started" : undefined)];
    },
    "site-summary": async () => {
      const [site, snags, assets, checklist, docs] = await Promise.all([
        loadSiteRow(), loadSnagFreshness(), freshness.assets(), freshness.checklist(), loadSiteDocuments(),
      ]);
      // Generated reports are excluded, otherwise saving any report would stale the summary.
      const uploadedDocs = latestTimestamp(...docs.filter((d) => !isSystemReportCategory(d.category)).map((d) => d.updated_at));
      const source = latestTimestamp(
        site?.updated_at, await latestSubsectionUpdate(), await latestInspectionUpdate(),
        snags.latest, assets.latest, checklist.latest, uploadedDocs,
      );
      return [await siteTarget("site-summary", source)];
    },
    "asset-verification": async () => {
      const assets = await freshness.assets();
      const source = latestTimestamp(assets.latest, await latestInspectionUpdate(), await latestSubsectionUpdate());
      return [await siteTarget("asset-verification", source, assets.count === 0 ? "No asset register imported" : undefined)];
    },
    inspection: async () => {
      const subs = await loadSubsections();
      const [snags, reports] = await Promise.all([
        loadSnagFreshness(),
        selectForIds<{ id: string; subsection_id: string; uploaded_at: string; source_inspection_id: string | null }>(
          subs.map((s) => s.id),
          (chunk) => supabase
            .from("subsection_documents")
            .select("id, subsection_id, uploaded_at, source_inspection_id, document_categories!inner(name)")
            .in("subsection_id", chunk)
            .eq("document_categories.name", INSPECTION_CATEGORY)
            .order("id") as unknown as RangeQuery<{ id: string; subsection_id: string; uploaded_at: string; source_inspection_id: string | null }>,
        ),
      ]);

      const newest = <R extends { uploaded_at: string }>(rows: R[]) =>
        rows.sort((a, b) => Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at))[0];

      return liveInspections(subs)
        .filter(({ insp }) => !!insp.template_id)
        .map(({ sub, insp }) => {
          const linked = newest(reports.filter((r) => r.source_inspection_id === insp.id));
          const legacy = linked ? undefined : newest(reports.filter((r) => r.subsection_id === sub.id && r.source_inspection_id == null));
          const found = linked ?? legacy;
          const templateName = insp.inspection_templates?.name || insp.title || "Inspection";
          const date = insp.created_at ? new Date(insp.created_at).toLocaleDateString() : "";
          return {
            key: `inspection:${insp.id}`,
            type: "inspection" as const,
            label: `${sub.name} · ${templateName}${date ? ` · ${date}` : ""}`,
            subsectionId: sub.id,
            subsectionName: sub.name,
            inspectionId: insp.id,
            templateId: insp.template_id ?? undefined,
            sourceUpdatedAt: latestTimestamp(insp.updated_at, snags.bySubsection.get(sub.id)),
            existing: found ? { id: found.id, createdAt: found.uploaded_at, linked: !!linked } : null,
          };
        });
    },
  };

  const entries = Object.entries(builders) as Array<[ReportType, () => Promise<ReportTarget[]>]>;
  const settled = await Promise.allSettled(entries.map(([, build]) => build()));

  const targets: ReportTarget[] = [];
  const errors: SiteReportListing["errors"] = {};
  settled.forEach((res, i) => {
    const type = entries[i][0];
    if (res.status === "fulfilled") targets.push(...res.value);
    else errors[type] = res.reason instanceof Error ? res.reason.message : String(res.reason);
  });
  return { targets, errors };
}
