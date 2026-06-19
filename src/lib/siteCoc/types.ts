import type { RuleResult } from "./sansRules";

/** A row parsed from the DB Schedule sheet (pre-match). */
export interface ParsedScheduleRow {
  shop_no_raw: string;
  trading_name: string;
  coc_required: string;
  initial_cert_nos: string;
  supplementary_cert_nos: string;
  unclear: string;
  supp_to_initial_ref: string;
  files_count: number | null;
  status: string;
  notes: string;
}

/** A merged certificate (Certificate Detail + Verification), pre-match. */
export interface ParsedCertificate {
  shop_no_raw: string;
  cert_no: string;
  cert_no_norm: string;
  cert_type: "Initial" | "Supplementary" | "Unclear";
  doc_type: string;
  clause_9_2: string;
  supp_to_init: string;
  issued_date: string | null;
  location: string;
  confidence: string;
  source_file: string;
  verdict: string;
  reasons: string;
  rules: Record<string, RuleResult>;
  notes: string;
}

export interface SubsectionLite { id: string; name: string; tenant_name?: string | null; }

export interface ImportSummary {
  shops_imported: number;
  certs_imported: number;
  matched_count: number;
  unmatched_count: number;
}
