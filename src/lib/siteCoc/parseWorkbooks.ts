import { normCert, normCertType, parseFilesCount, parseIssuedDate } from "./normalize";
import { ruleCodeFromHeader, isKnownRuleCode, RuleResult } from "./sansRules";
import type { ParsedScheduleRow, ParsedCertificate } from "./types";

type Grid = unknown[][];
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

/** Header = first row with >= 2 non-empty cells. Returns its index + a name->col map. */
export function findHeader(rows: Grid): { idx: number; col: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const r = rows[i] ?? [];
    const nonEmpty = r.filter(c => str(c) !== "");
    if (nonEmpty.length >= 2) {
      const col: Record<string, number> = {};
      r.forEach((c, j) => { const k = str(c).toLowerCase(); if (k) col[k] = j; });
      return { idx: i, col };
    }
  }
  return null;
}

const get = (row: unknown[], col: Record<string, number>, name: string): string => {
  const j = col[name.toLowerCase()];
  return j === undefined ? "" : str(row[j]);
};
const getRaw = (row: unknown[], col: Record<string, number>, name: string): unknown => {
  const j = col[name.toLowerCase()];
  return j === undefined ? null : row[j];
};

export function parseDbSchedule(rows: Grid): ParsedScheduleRow[] {
  const h = findHeader(rows);
  if (!h) return [];
  const out: ParsedScheduleRow[] = [];
  for (const row of rows.slice(h.idx + 1)) {
    if (!(row ?? []).some(c => str(c) !== "")) continue;
    if (get(row, h.col, "Shop No") === "") continue;
    out.push({
      shop_no_raw: get(row, h.col, "Shop No"),
      trading_name: get(row, h.col, "Trading Name"),
      coc_required: get(row, h.col, "COC Req."),
      initial_cert_nos: get(row, h.col, "Initial COC No(s)"),
      supplementary_cert_nos: get(row, h.col, "Supplementary COC No(s)"),
      unclear: get(row, h.col, "Unclear (no tick)"),
      supp_to_initial_ref: get(row, h.col, "Supp→Initial ref"),
      files_count: parseFilesCount(getRaw(row, h.col, "Files")),
      status: get(row, h.col, "Status"),
      notes: get(row, h.col, "Notes"),
    });
  }
  return out;
}

export function parseCertificateDetail(rows: Grid): ParsedCertificate[] {
  const h = findHeader(rows);
  if (!h) return [];
  const out: ParsedCertificate[] = [];
  for (const row of rows.slice(h.idx + 1)) {
    if (!(row ?? []).some(c => str(c) !== "")) continue;
    const cert_no = get(row, h.col, "Cert No");
    out.push({
      shop_no_raw: get(row, h.col, "Matched"),
      cert_no,
      cert_no_norm: normCert(cert_no),
      cert_type: normCertType(get(row, h.col, "Type")),
      doc_type: get(row, h.col, "Doc type"),
      clause_9_2: get(row, h.col, "9(2)"),
      supp_to_init: get(row, h.col, "Supp→Init"),
      issued_date: parseIssuedDate(getRaw(row, h.col, "Issued")),
      location: get(row, h.col, "Location"),
      confidence: get(row, h.col, "Conf"),
      source_file: get(row, h.col, "File"),
      verdict: "",
      reasons: "",
      rules: {},
      notes: get(row, h.col, "Notes"),
    });
  }
  return out;
}

export function parseVerification(rows: Grid): ParsedCertificate[] {
  const h = findHeader(rows);
  if (!h) return [];
  const ruleCols: Array<{ code: string; j: number }> = [];
  for (const [name, j] of Object.entries(h.col)) {
    const code = ruleCodeFromHeader(name);
    if (code && isKnownRuleCode(code)) ruleCols.push({ code, j });
  }
  const out: ParsedCertificate[] = [];
  for (const row of rows.slice(h.idx + 1)) {
    if (!(row ?? []).some(c => str(c) !== "")) continue;
    const cert_no = get(row, h.col, "Cert No");
    const rules: Record<string, RuleResult> = {};
    for (const rc of ruleCols) {
      const v = str(row[rc.j]).toUpperCase();
      if (v) rules[rc.code] = v as RuleResult;
    }
    out.push({
      shop_no_raw: get(row, h.col, "Shop"),
      cert_no,
      cert_no_norm: normCert(cert_no),
      cert_type: normCertType(get(row, h.col, "Type")),
      doc_type: "",
      clause_9_2: "",
      supp_to_init: "",
      issued_date: null,
      location: "",
      confidence: "",
      source_file: "",
      verdict: get(row, h.col, "Verdict"),
      reasons: get(row, h.col, "Reasons"),
      rules,
      notes: "",
    });
  }
  return out;
}

const mergeKey = (c: ParsedCertificate) =>
  `${c.shop_no_raw.toUpperCase().trim()}|${c.cert_no_norm}|${c.cert_type}`;

/** Merge metadata (detail) with assessment (verification) on (shop, cert_no_norm, type). */
export function mergeCertificates(detail: ParsedCertificate[], verification: ParsedCertificate[]): ParsedCertificate[] {
  const byKey = new Map<string, ParsedCertificate>();
  for (const d of detail) byKey.set(mergeKey(d), { ...d });
  for (const v of verification) {
    const k = mergeKey(v);
    const existing = byKey.get(k);
    if (existing) {
      existing.verdict = v.verdict;
      existing.reasons = v.reasons;
      existing.rules = v.rules;
      if (!existing.notes) existing.notes = v.notes;
    } else {
      byKey.set(k, { ...v });
    }
  }
  return Array.from(byKey.values());
}
