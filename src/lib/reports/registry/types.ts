// Site report registry: every report a site can produce, its freshness, and how to (re)generate it.
// See docs/superpowers/specs/2026-10-06-site-report-generation-design.md.
import type { SiteKpiBlock } from "@/lib/siteCoc/reportKpis";

export type ReportType = "site-coc" | "fortress-checklist" | "site-summary" | "asset-verification" | "inspection";

/** Run order: cheapest first, so the quick reports are saved before the photo-heavy ones. */
export const REPORT_TYPE_ORDER: ReportType[] = [
  "site-coc",
  "fortress-checklist",
  "site-summary",
  "asset-verification",
  "inspection",
];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  "site-coc": "Site COC Report",
  "fortress-checklist": "Fortress Marking Checklist",
  "site-summary": "Site Summary Report",
  "asset-verification": "Asset Verification Report",
  inspection: "Subsection Inspection Reports",
};

export type ReportStatus = "missing" | "out-of-date" | "current";

export interface ExistingReport {
  id: string;
  createdAt: string;
  /** false = legacy inspection report saved before reports recorded their inspection. */
  linked: boolean;
}

export interface ReportTarget {
  /** Stable key: "inspection:<id>" for inspections, the report type for site reports. */
  key: string;
  type: ReportType;
  label: string;
  subsectionId?: string;
  subsectionName?: string;
  inspectionId?: string;
  templateId?: string;
  /** Latest updated_at across the report's inputs; null when there is no source data. */
  sourceUpdatedAt: string | null;
  existing: ExistingReport | null;
  /** Set when the site has no data for this report (e.g. no COC-required subsections): never pre-ticked. */
  emptyReason?: string;
}

export interface SiteReportContext {
  siteId: string;
  siteName: string;
  clientName?: string | null;
  siteAddress?: string | null;
  siteLogoUrl?: string | null;
  companyLogoUrl?: string | null;
  siteKpis?: SiteKpiBlock;
}

export type GenerateResult =
  | { ok: true; durationMs: number; bytes: number; photoCount?: number; superseded: number; supersedeBlocked: number }
  | { ok: false; durationMs: number; error: string };
