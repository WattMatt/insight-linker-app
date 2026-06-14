// Hand-written types for the Fortress building-pack tables, faithful to the migrations
// (20260612200000 base + 210000 hardening). These are a PLACEHOLDER scaffold: once the
// migrations are applied to the DB, replace usages with the generated Supabase types
// (`supabase gen types typescript`). Kept minimal to what the scaffolded UI consumes.

export type AssetCondition = "Good" | "Fair" | "Poor" | "N/A";

/** building_assets — the asset & equipment register (spine of the Annual report). */
export interface BuildingAsset {
  id: string;
  site_id: string;
  section_code: string | null; // e.g. '4.1' (Annual report section)
  category: string; // Fire / Electrical / HVAC / Security / Fabric …
  name: string;
  make_model: string | null;
  quantity: string | null;
  install_date: string | null;
  service_freq: string | null;
  last_service: string | null;
  next_service_due: string | null; // raw text as imported
  next_service_date: string | null; // parsed date (210000) — drives the PPM due/overdue KPI
  service_cost: number | null;
  contractor: string | null;
  cost_recovery: string | null; // 'OPS cost' / 'Tenant' / 'Tenant + OPS'
  condition: AssetCondition | null;
  as_built_available: boolean | null;
  inspection_freq: string | null;
  general_comment: string | null;
  meta: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null; // soft-delete (210000) — reads MUST filter deleted_at IS NULL
}

export type OhsAnswer = "Y" | "N" | "N/A";

/** ohs_compliance_items — OHS Act compliance checklist; weighted rollup → building compliance %. */
export interface OhsComplianceItem {
  id: string;
  site_id: string;
  period: string | null; // reporting month
  section: string | null; // '1 Building Compliance', '2 Critical Equipment' …
  item_code: string | null; // '1.1.1', '2.1.4' …
  question: string;
  answer: OhsAnswer | null;
  weight: number | null; // numeric, default 1
  evidence_url: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
}
