// Site-wide KPIs for the COC report summary page. Reuses the shared deliverables / aging / expiry
// helpers so the report and the dashboard stay consistent. Pure; no I/O. See reportKpis.test.ts.
import { snagStatusBucket } from "../subsectionStatus";
import { BLOCKING_RISK_LEVELS } from "../siteHealth";
import { snagAging, cocExpiryBuckets, type SubsectionForExpiry, type SnagForAging } from "../kpiMetrics";
import { itemStatusKind, scorePercentage } from "../report/inspectionScore";

export interface SiteKpiBlock {
  readinessPct: number;
  snagsOpen: number;
  snagsHighRisk: number;
  snagsClosed: number;
  oldestOpenDays: number | null;
  inspectionPassPct: number;
  inspectionPass: number;
  inspectionFail: number;
  meteringDone: number;
  meteringTotal: number;
  expiry: { expired: number; within30: number; within90: number };
}

/** Item-level pass rate across every inspection's checklist (pending / N-A excluded). */
export function inspectionPassRate(inspections: { json_data?: { sections?: { items?: { value?: unknown }[] }[] } }[]):
  { pass: number; fail: number; pct: number } {
  let pass = 0, fail = 0;
  for (const ins of inspections) {
    for (const section of ins.json_data?.sections ?? []) {
      for (const item of section.items ?? []) {
        const k = itemStatusKind(item);
        if (k === "pass") pass++;
        else if (k === "fail") fail++;
      }
    }
  }
  return { pass, fail, pct: scorePercentage(pass, fail) };
}

interface DeliverablesLite { completionPct: number; deliverables: { key: string; done: number; total: number }[] }
interface SnagLite extends SnagForAging { status?: string | null; risk_level?: string | null }

export function buildSiteKpiBlock(input: {
  deliverablesSummary: DeliverablesLite;
  snags: SnagLite[];
  subsections: SubsectionForExpiry[];
  inspections: { json_data?: { sections?: { items?: { value?: unknown }[] }[] } }[];
  today: string;
}): SiteKpiBlock {
  const { deliverablesSummary, snags, subsections, inspections, today } = input;

  let snagsOpen = 0, snagsClosed = 0;
  for (const s of snags) {
    if (snagStatusBucket(s.status) === "closed") snagsClosed++;
    else snagsOpen++;
  }
  const aging = snagAging(snags, today);
  const snagsHighRisk = snags.filter(s =>
    snagStatusBucket(s.status) !== "closed" && BLOCKING_RISK_LEVELS.includes(s.risk_level || "")).length;

  const metering = deliverablesSummary.deliverables.find(d => d.key === "metering");
  const ins = inspectionPassRate(inspections);

  return {
    readinessPct: deliverablesSummary.completionPct,
    snagsOpen, snagsHighRisk, snagsClosed,
    oldestOpenDays: aging.oldestOpenDays,
    inspectionPassPct: ins.pct, inspectionPass: ins.pass, inspectionFail: ins.fail,
    meteringDone: metering?.done ?? 0, meteringTotal: metering?.total ?? 0,
    expiry: cocExpiryBuckets(subsections, today),
  };
}
