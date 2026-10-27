// Plan links from unlinked COC certificate rows (subsection_id null) to a site's shops.
// Pure: no I/O. Evidence per row, strongest first:
//   schedule  — a coc_db_schedule row linked to a shop lists this certificate number
//   shop_no   — the row's shop_no_raw equals a shop's shop number or name
//   name      — the folder name of source_file, db_name or location ranks one shop clearly above the rest
// Anything weaker is reported with its candidates and left for a person.
import { normCert, normShop } from "./normalize";
import { rankSubsectionCandidates } from "./rankCandidates";

export interface LinkSub { id: string; name: string; tenant_name?: string | null; shop_number?: string | null }
export interface LinkCert { id: string; cert_no: string | null; cert_no_norm?: string | null; shop_no_raw?: string | null; source_file?: string | null; db_name?: string | null; location?: string | null }
export interface LinkSchedule { subsection_id: string | null; initial_cert_nos?: string | null; supplementary_cert_nos?: string | null }

export type LinkMethod = "schedule" | "shop_no" | "name";
export interface LinkDecision {
  id: string; cert_no: string | null;
  outcome: "assign" | "review" | "unmatched";
  method?: LinkMethod; subsection_id?: string; shop?: string; score?: number; query?: string;
  candidates?: { subsection_id: string; shop: string; score: number }[];
}

export const AUTO_MIN = 0.9;     // top score needed to link by name
export const AUTO_MARGIN = 0.15; // top must beat the runner-up by this much
export const REVIEW_MIN = 0.6;   // below this, nothing worth showing

const split = (s: string | null | undefined) => (s ?? "").split(/[;,/|]+/).map((x) => normCert(x)).filter(Boolean);

/** Tenant-ish text from a source path: the folder under COCs/, else the file name, minus COC noise. */
export function folderQuery(sourceFile: string | null | undefined): string {
  const p = (sourceFile ?? "").replace(/\\/g, "/");
  const parts = p.split("/").filter(Boolean);
  let s = "";
  const i = parts.findIndex((x) => /^cocs?$/i.test(x));
  if (i >= 0 && parts.length > i + 2) s = parts[i + 1];
  else s = (parts[parts.length - 1] ?? "").replace(/\.[a-z0-9]{2,4}$/i, "");
  return s
    .replace(/\b(elec(trical)?|coc'?s?|certificate|compliance|initial|supplementary|supp|test report|report|scan|copy|new|old|final|signed)\b/gi, " ")
    .replace(/\b\d{1,2}[-._ ]\d{1,2}[-._ ](19|20)\d{2}\b/g, " ")
    .replace(/\b(19|20)\d{2}([-._ ]\d{1,2}){0,2}\b/g, " ")
    .replace(/\(\d+\)|_\d{3,}|\b\d{6,}\b/g, " ")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function planCertLinks(certs: LinkCert[], subs: LinkSub[], schedule: LinkSchedule[] = []): LinkDecision[] {
  const byId = new Map(subs.map((s) => [s.id, s]));
  const label = (s: LinkSub) => (s.tenant_name && normShop(s.tenant_name) !== normShop(s.name) ? `${s.name} (${s.tenant_name})` : s.name);
  // schedule: cert_no_norm -> set of subsection ids
  const sched = new Map<string, Set<string>>();
  for (const r of schedule) {
    if (!r.subsection_id) continue;
    for (const c of [...split(r.initial_cert_nos), ...split(r.supplementary_cert_nos)]) {
      if (!sched.has(c)) sched.set(c, new Set());
      sched.get(c)!.add(r.subsection_id);
    }
  }
  // shop number / name index
  const byShopKey = new Map<string, Set<string>>();
  for (const s of subs) {
    for (const k of [normShop(s.shop_number), normShop(s.name)]) {
      if (!k) continue;
      if (!byShopKey.has(k)) byShopKey.set(k, new Set());
      byShopKey.get(k)!.add(s.id);
    }
  }
  const one = (set: Set<string> | undefined) => (set && set.size === 1 ? [...set][0] : undefined);

  return certs.map((c): LinkDecision => {
    const base = { id: c.id, cert_no: c.cert_no };
    const key = normCert(c.cert_no_norm || c.cert_no);
    const viaSched = key ? one(sched.get(key)) : undefined;
    if (viaSched && byId.has(viaSched)) return { ...base, outcome: "assign", method: "schedule", subsection_id: viaSched, shop: label(byId.get(viaSched)!), score: 1 };
    const shopKey = normShop(c.shop_no_raw);
    const viaShop = shopKey ? one(byShopKey.get(shopKey)) : undefined;
    if (viaShop) return { ...base, outcome: "assign", method: "shop_no", subsection_id: viaShop, shop: label(byId.get(viaShop)!), score: 1, query: c.shop_no_raw ?? undefined };

    const queries = [folderQuery(c.source_file), c.db_name ?? "", c.location ?? ""].map((q) => q.trim()).filter((q) => q.length >= 3);
    let best: { q: string; ranked: { id: string; name: string; score: number }[] } | null = null;
    for (const q of queries) {
      const ranked = rankSubsectionCandidates(q, subs, 3);
      if (!ranked.length) continue;
      if (!best || ranked[0].score > best.ranked[0].score) best = { q, ranked };
    }
    if (!best) return { ...base, outcome: "unmatched" };
    const [top, second] = best.ranked;
    const cands = best.ranked.map((r) => ({ subsection_id: r.id, shop: r.name, score: Math.round(r.score * 100) / 100 }));
    if (top.score >= AUTO_MIN && (!second || top.score - second.score >= AUTO_MARGIN)) {
      return { ...base, outcome: "assign", method: "name", subsection_id: top.id, shop: top.name, score: Math.round(top.score * 100) / 100, query: best.q, candidates: cands };
    }
    if (top.score >= REVIEW_MIN) return { ...base, outcome: "review", query: best.q, candidates: cands };
    return { ...base, outcome: "unmatched", query: best.q, candidates: cands };
  });
}
