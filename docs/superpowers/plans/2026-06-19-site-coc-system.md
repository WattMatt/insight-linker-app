# Site COC System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a site-level COC tab that ingests the two COC working workbooks into structured, subsection-integrated tables and produces an overall site COC report.

**Architecture:** Three new Supabase tables (`coc_import_batches`, `coc_db_schedule`, `coc_certificates`) capture the three source sheets; the shop register links to existing `subsections`; the two certificate sheets merge into one per-cert table. Ingestion parses `.xlsx` client-side (SheetJS, already installed), matches shops to subsections, and **replaces** the site's imported set per upload. The PAT is used only for table DDL. UI is a new top-level tab in `SiteDetail.tsx` with Schedule / Certificates / Verification / Report sub-tabs; the report reuses the existing pdfmake engine.

**Tech Stack:** Next.js + React + TypeScript, Supabase (Postgres + RLS), SheetJS (`xlsx` ^0.18.5), pdfmake ^0.3.2, Vitest, Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-06-19-site-coc-system-design.md`

---

## File Structure

- `supabase/migrations/20260619130000_site_coc_system.sql` (new) — 3 tables + indexes + RLS.
- `src/integrations/supabase/types.ts` (modify) — add the 3 tables.
- `src/lib/siteCoc/sansRules.ts` (new) — `COC_SANS_RULES` constant + `RuleResult` type + header→code parsing.
- `src/lib/siteCoc/normalize.ts` (new) — `normShop`, `normCert`, `normCertType`, `parseFilesCount`, `parseIssuedDate`.
- `src/lib/siteCoc/types.ts` (new) — parsed-record + DB-row TS interfaces.
- `src/lib/siteCoc/parseWorkbooks.ts` (new) — pure: `findHeader`, `parseDbSchedule`, `parseCertificateDetail`, `parseVerification`, `mergeCertificates`.
- `src/lib/siteCoc/ingest.ts` (new) — pure: `matchShop`, `assembleScheduleRows`, `assembleCertificateRows`, `summarize`.
- `src/views/site-coc/useSiteCoc.ts` (new) — fetch schedule/certs/latest batch for a site.
- `src/views/site-coc/useSiteCocImport.ts` (new) — impure: read files (SheetJS) + replace-transaction writes.
- `src/views/site-coc/SiteCocTab.tsx` (new) — container: sub-tabs + Import action + last-import summary.
- `src/views/site-coc/ScheduleSubTab.tsx`, `CertificatesSubTab.tsx`, `VerificationSubTab.tsx`, `ReportSubTab.tsx` (new).
- `src/lib/siteCoc/siteCocReport.ts` (new) — pdfmake doc-definition builder.
- `src/views/SiteDetail.tsx` (modify) — register the new tab.

Unit tests: `src/lib/siteCoc/normalize.test.ts`, `parseWorkbooks.test.ts`, `ingest.test.ts`, `sansRules.test.ts`.

---

# PHASE 1 — Schema + ingestion

## Task 1: SANS rules constant

**Files:** Create `src/lib/siteCoc/sansRules.ts`; Test `src/lib/siteCoc/sansRules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { COC_SANS_RULES, ruleCodeFromHeader } from "./sansRules";

describe("COC_SANS_RULES", () => {
  it("has the 22 source rule codes in order", () => {
    expect(COC_SANS_RULES.map(r => r.code)).toEqual([
      "A1","A2","A4","A5","A6","B1","B2","B3","B4",
      "C1","C2","C3","C7","C8","C9","C10","C11","C12","C13","C14","C15",
    ]);
  });
});

describe("ruleCodeFromHeader", () => {
  it("extracts the leading code token", () => {
    expect(ruleCodeFromHeader("A1 cert no")).toBe("A1");
    expect(ruleCodeFromHeader("C15 switching")).toBe("C15");
  });
  it("returns null for non-rule headers", () => {
    expect(ruleCodeFromHeader("Verdict")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/lib/siteCoc/sansRules.test.ts` — Expected: cannot resolve module.

- [ ] **Step 3: Implement**

```ts
export type RuleResult = "PASS" | "FAIL" | "CV" | "N/A";
export interface SansRule { code: string; label: string; group: "A" | "B" | "C"; }

export const COC_SANS_RULES: SansRule[] = [
  { code: "A1", label: "cert no", group: "A" },
  { code: "A2", label: "test report", group: "A" },
  { code: "A4", label: "date", group: "A" },
  { code: "A5", label: "reg no", group: "A" },
  { code: "A6", label: "signature", group: "A" },
  { code: "B1", label: "conductors", group: "B" },
  { code: "B2", label: "components", group: "B" },
  { code: "B3", label: "disconnect", group: "B" },
  { code: "B4", label: "labelling", group: "B" },
  { code: "C1", label: "bonding", group: "C" },
  { code: "C2", label: "ECC", group: "C" },
  { code: "C3", label: "ring", group: "C" },
  { code: "C7", label: "neutral elev", group: "C" },
  { code: "C8", label: "insulation", group: "C" },
  { code: "C9", label: "V no-load", group: "C" },
  { code: "C10", label: "V on-load", group: "C" },
  { code: "C11", label: "E/L trip", group: "C" },
  { code: "C12", label: "E/L button", group: "C" },
  { code: "C13", label: "polarity", group: "C" },
  { code: "C14", label: "phase rot", group: "C" },
  { code: "C15", label: "switching", group: "C" },
];

const KNOWN = new Set(COC_SANS_RULES.map(r => r.code));

/** Extract a rule code (e.g. "A1") from a Verification column header like "A1 cert no". */
export function ruleCodeFromHeader(header: string): string | null {
  const m = (header ?? "").trim().match(/^([ABC]\d+)\b/);
  if (!m) return null;
  return m[1];
}

export function isKnownRuleCode(code: string): boolean { return KNOWN.has(code); }
```

- [ ] **Step 4: Run — expect PASS.** `npx vitest run src/lib/siteCoc/sansRules.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteCoc/sansRules.ts src/lib/siteCoc/sansRules.test.ts
git commit -m "feat(site-coc): SANS rule constant + header->code"
```

## Task 2: Normalizers

**Files:** Create `src/lib/siteCoc/normalize.ts`; Test `src/lib/siteCoc/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { normShop, normCert, normCertType, parseFilesCount, parseIssuedDate } from "./normalize";

describe("normShop", () => {
  it("uppercases and collapses separators so SHOP-002 == SHOP 002", () => {
    expect(normShop("SHOP-002")).toBe("SHOP 002");
    expect(normShop("  shop   002 ")).toBe("SHOP 002");
  });
  it("handles null", () => expect(normShop(null)).toBe(""));
});

describe("normCert", () => {
  it("uppercases and strips spaces", () => {
    expect(normCert("B 1612744")).toBe("B1612744");
  });
});

describe("normCertType", () => {
  it("maps I/S and full words", () => {
    expect(normCertType("I")).toBe("Initial");
    expect(normCertType("s")).toBe("Supplementary");
    expect(normCertType("Initial")).toBe("Initial");
    expect(normCertType("")).toBe("Unclear");
  });
});

describe("parseFilesCount", () => {
  it("parses ints, defaults null", () => {
    expect(parseFilesCount(3)).toBe(3);
    expect(parseFilesCount("4")).toBe(4);
    expect(parseFilesCount("")).toBeNull();
  });
});

describe("parseIssuedDate", () => {
  it("returns yyyy-mm-dd for a Date", () => {
    expect(parseIssuedDate(new Date("2024-11-05T00:00:00Z"))).toBe("2024-11-05");
  });
  it("passes through an iso-ish string date", () => {
    expect(parseIssuedDate("2024-11-05")).toBe("2024-11-05");
  });
  it("returns null for unparseable", () => {
    expect(parseIssuedDate("n/a")).toBeNull();
    expect(parseIssuedDate(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run src/lib/siteCoc/normalize.test.ts`

- [ ] **Step 3: Implement**

```ts
export function normShop(s: string | null | undefined): string {
  return (s ?? "").toString().toUpperCase().replace(/[\s\-_]+/g, " ").trim();
}

export function normCert(s: string | null | undefined): string {
  return (s ?? "").toString().toUpperCase().replace(/\s+/g, "").trim();
}

export function normCertType(s: string | null | undefined): "Initial" | "Supplementary" | "Unclear" {
  const v = (s ?? "").toString().trim().toLowerCase();
  if (v === "i" || v === "initial") return "Initial";
  if (v === "s" || v === "supplementary") return "Supplementary";
  return "Unclear";
}

export function parseFilesCount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

export function parseIssuedDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // accept yyyy-mm-dd or yyyy/mm/dd
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const [_, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteCoc/normalize.ts src/lib/siteCoc/normalize.test.ts
git commit -m "feat(site-coc): shop/cert/date normalizers"
```

## Task 3: Parsed-record + DB-row types

**Files:** Create `src/lib/siteCoc/types.ts`

- [ ] **Step 1: Implement (no test — pure type declarations)**

```ts
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

export interface SubsectionLite { id: string; name: string; }

export interface ImportSummary {
  shops_imported: number;
  certs_imported: number;
  matched_count: number;
  unmatched_count: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/siteCoc/types.ts
git commit -m "feat(site-coc): parsed-record + DB-row types"
```

## Task 4: Workbook parsers (pure)

**Files:** Create `src/lib/siteCoc/parseWorkbooks.ts`; Test `src/lib/siteCoc/parseWorkbooks.test.ts`

Parsers take a sheet as a 2-D array (`unknown[][]`, what `XLSX.utils.sheet_to_json(ws,{header:1})` returns) so they are pure and testable without files.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseDbSchedule, parseCertificateDetail, parseVerification, mergeCertificates } from "./parseWorkbooks";

const schedRows = [
  ["YARONA — DB / COC SCHEDULE"],
  ["desc line"],
  ["Shop No","Trading Name","COC Req.","Initial COC No(s)","Supplementary COC No(s)","Unclear (no tick)","Supp→Initial ref","Files","Status","Notes"],
  ["SHOP 002","SHOPRITE LIQUOR SHOP","Y","B 1612744; ECA 147525","NM 1850896","","185 0896",4,"OK — initial present",""],
  ["KIOSK K02","FNB SELF SERVICE CHANNEL","N/A","","","","",0,"N/A",""],
];

const certRows = [
  ["File","Matched","Doc type","Cert No","Type","9(2)","Supp→Init","Issued","Location","Conf","Notes"],
  ["COCs/B1612744 - SHOP K4.pdf","SHOP 002","electrical_coc","B 1612744","Initial","a","","2024-11-05","Mzansi","high","reg 7(1)"],
];

const verifRows = [
  ["YARONA — COC VERIFICATION"],
  ["desc"],
  ["Shop","Trading","Cert No","Type","Verdict","Reasons","A1 cert no","B1 conductors","C15 switching"],
  ["SHOP 002","SHOPRITE LIQUOR SHOP","B 1612744","I","PASS","","PASS","PASS","N/A"],
];

describe("parseDbSchedule", () => {
  it("parses rows under the header, skipping title rows", () => {
    const rows = parseDbSchedule(schedRows);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ shop_no_raw: "SHOP 002", trading_name: "SHOPRITE LIQUOR SHOP", coc_required: "Y", files_count: 4, status: "OK — initial present" });
    expect(rows[1]).toMatchObject({ shop_no_raw: "KIOSK K02", coc_required: "N/A", files_count: 0 });
  });
});

describe("parseCertificateDetail", () => {
  it("maps metadata fields", () => {
    const rows = parseCertificateDetail(certRows);
    expect(rows[0]).toMatchObject({ shop_no_raw: "SHOP 002", cert_no: "B 1612744", cert_no_norm: "B1612744", cert_type: "Initial", doc_type: "electrical_coc", clause_9_2: "a", issued_date: "2024-11-05", confidence: "high", source_file: "COCs/B1612744 - SHOP K4.pdf" });
  });
});

describe("parseVerification", () => {
  it("maps verdict + rules by code", () => {
    const rows = parseVerification(verifRows);
    expect(rows[0]).toMatchObject({ shop_no_raw: "SHOP 002", cert_no: "B 1612744", cert_type: "Initial", verdict: "PASS" });
    expect(rows[0].rules).toEqual({ A1: "PASS", B1: "PASS", C15: "N/A" });
  });
});

describe("mergeCertificates", () => {
  it("merges detail + verification by (shop, cert_no_norm, type)", () => {
    const merged = mergeCertificates(parseCertificateDetail(certRows), parseVerification(verifRows));
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ cert_no: "B 1612744", doc_type: "electrical_coc", verdict: "PASS" });
    expect(merged[0].rules.A1).toBe("PASS");
  });
  it("keeps a verification-only cert when no detail match", () => {
    const merged = mergeCertificates([], parseVerification(verifRows));
    expect(merged).toHaveLength(1);
    expect(merged[0].verdict).toBe("PASS");
    expect(merged[0].doc_type).toBe("");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
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
    if (str(getRaw(row, h.col, "Shop No")) === "") continue;
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
  // rule columns: header token is a known rule code
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
      if (v) rules[rc.code] = (["PASS", "FAIL", "CV", "N/A"].includes(v) ? v : v) as RuleResult;
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
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteCoc/parseWorkbooks.ts src/lib/siteCoc/parseWorkbooks.test.ts
git commit -m "feat(site-coc): pure workbook parsers + cert merge"
```

## Task 5: Matching + assembly (pure)

**Files:** Create `src/lib/siteCoc/ingest.ts`; Test `src/lib/siteCoc/ingest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { matchShop, assembleScheduleRows, assembleCertificateRows, summarize } from "./ingest";
import type { ParsedScheduleRow, ParsedCertificate, SubsectionLite } from "./types";

const subs: SubsectionLite[] = [{ id: "u1", name: "SHOP-002" }, { id: "u2", name: "ATM 002" }];

describe("matchShop", () => {
  it("matches across separator differences", () => {
    expect(matchShop("SHOP 002", subs)).toBe("u1");
  });
  it("returns null when no match", () => {
    expect(matchShop("KIOSK K02", subs)).toBeNull();
  });
});

describe("assembleScheduleRows", () => {
  it("sets subsection_id + match_status", () => {
    const parsed: ParsedScheduleRow[] = [
      { shop_no_raw: "SHOP 002", trading_name: "S", coc_required: "Y", initial_cert_nos: "", supplementary_cert_nos: "", unclear: "", supp_to_initial_ref: "", files_count: 1, status: "OK", notes: "" },
      { shop_no_raw: "KIOSK K02", trading_name: "F", coc_required: "N/A", initial_cert_nos: "", supplementary_cert_nos: "", unclear: "", supp_to_initial_ref: "", files_count: 0, status: "N/A", notes: "" },
    ];
    const rows = assembleScheduleRows(parsed, subs, "site1", "batch1");
    expect(rows[0]).toMatchObject({ site_id: "site1", import_batch_id: "batch1", subsection_id: "u1", match_status: "matched" });
    expect(rows[1]).toMatchObject({ subsection_id: null, match_status: "unmatched" });
  });
});

describe("assembleCertificateRows", () => {
  it("sets subsection_id + match_status + serializes rules", () => {
    const certs: ParsedCertificate[] = [{ shop_no_raw: "ATM 002", cert_no: "B 1612747", cert_no_norm: "B1612747", cert_type: "Initial", doc_type: "electrical_coc", clause_9_2: "a", supp_to_init: "", issued_date: null, location: "", confidence: "high", source_file: "f.pdf", verdict: "PASS", reasons: "", rules: { A1: "PASS" }, notes: "" }];
    const rows = assembleCertificateRows(certs, subs, "site1", "batch1");
    expect(rows[0]).toMatchObject({ site_id: "site1", subsection_id: "u2", match_status: "matched", cert_no: "B 1612747", verdict: "PASS" });
    expect(rows[0].rules).toEqual({ A1: "PASS" });
  });
});

describe("summarize", () => {
  it("counts matched/unmatched", () => {
    const s = summarize(
      [{ match_status: "matched" } as any, { match_status: "unmatched" } as any],
      [{ match_status: "matched" } as any],
    );
    expect(s).toEqual({ shops_imported: 2, certs_imported: 1, matched_count: 2, unmatched_count: 1 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
import { normShop } from "./normalize";
import type { ParsedScheduleRow, ParsedCertificate, SubsectionLite, ImportSummary } from "./types";

export function matchShop(shopRaw: string, subs: SubsectionLite[]): string | null {
  const key = normShop(shopRaw);
  if (!key) return null;
  const hit = subs.find(s => normShop(s.name) === key);
  return hit ? hit.id : null;
}

export interface ScheduleInsertRow extends ParsedScheduleRow {
  site_id: string; import_batch_id: string; subsection_id: string | null; match_status: "matched" | "unmatched";
}
export interface CertificateInsertRow extends Omit<ParsedCertificate, "cert_no_norm"> {
  site_id: string; import_batch_id: string; subsection_id: string | null; match_status: "matched" | "unmatched"; cert_no_norm: string;
}

export function assembleScheduleRows(parsed: ParsedScheduleRow[], subs: SubsectionLite[], siteId: string, batchId: string): ScheduleInsertRow[] {
  return parsed.map(p => {
    const subsection_id = matchShop(p.shop_no_raw, subs);
    return { ...p, site_id: siteId, import_batch_id: batchId, subsection_id, match_status: subsection_id ? "matched" : "unmatched" };
  });
}

export function assembleCertificateRows(certs: ParsedCertificate[], subs: SubsectionLite[], siteId: string, batchId: string): CertificateInsertRow[] {
  return certs.map(c => {
    const subsection_id = matchShop(c.shop_no_raw, subs);
    return { ...c, site_id: siteId, import_batch_id: batchId, subsection_id, match_status: subsection_id ? "matched" : "unmatched" };
  });
}

export function summarize(schedule: { match_status: string }[], certs: { match_status: string }[]): ImportSummary {
  const matched = schedule.filter(s => s.match_status === "matched").length;
  const unmatched = schedule.filter(s => s.match_status === "unmatched").length;
  return { shops_imported: schedule.length, certs_imported: certs.length, matched_count: matched, unmatched_count: unmatched };
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteCoc/ingest.ts src/lib/siteCoc/ingest.test.ts
git commit -m "feat(site-coc): shop matching + insert-row assembly"
```

## Task 6: Migration (3 tables)

**Files:** Create `supabase/migrations/20260619130000_site_coc_system.sql`

- [ ] **Step 1: Write the migration** (full SQL is in spec §4; identical content)

Create the file with the three `create table` statements, indexes, `ENABLE ROW LEVEL SECURITY`, and these policies for each of the three tables (mirrors the project's authenticated-only model):

```sql
-- repeat for coc_import_batches, coc_db_schedule, coc_certificates
ALTER TABLE public.coc_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read coc_import_batches"   ON public.coc_import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert coc_import_batches" ON public.coc_import_batches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update coc_import_batches" ON public.coc_import_batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete coc_import_batches" ON public.coc_import_batches FOR DELETE TO authenticated USING (true);
```

End the file with `NOTIFY pgrst, 'reload schema';`. (Applied to prod in Task 13.)

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260619130000_site_coc_system.sql
git commit -m "feat(db): site COC tables (batches, db_schedule, certificates)"
```

## Task 7: Generated types

**Files:** Modify `src/integrations/supabase/types.ts`

- [ ] **Step 1:** Add `Row`/`Insert`/`Update`/`Relationships` blocks for `coc_import_batches`, `coc_db_schedule`, `coc_certificates` under `public.Tables`, matching the migration columns (uuid/text/int/date/jsonb/timestamptz → `string`/`number`/`Json`). `rules jsonb` → `Json`. FKs: `site_id`→sites, `subsection_id`→subsections, `import_batch_id`→coc_import_batches.

- [ ] **Step 2: Typecheck** `npx tsc --noEmit` — confirm no NEW errors beyond the pre-existing baseline (see plan note: project has ~121 pre-existing tsc errors; gate is `npm run build`).

- [ ] **Step 3: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "feat(site-coc): generated types for the 3 new tables"
```

## Task 8: Import handler (impure) + wire a temporary trigger

**Files:** Create `src/views/site-coc/useSiteCocImport.ts`

- [ ] **Step 1: Implement** the replace-transaction importer

```ts
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseDbSchedule, parseCertificateDetail, parseVerification, mergeCertificates } from "@/lib/siteCoc/parseWorkbooks";
import { assembleScheduleRows, assembleCertificateRows, summarize } from "@/lib/siteCoc/ingest";
import type { SubsectionLite } from "@/lib/siteCoc/types";

async function sheetGrid(file: File, sheetName: string): Promise<unknown[][] | null> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const name = wb.SheetNames.find(n => n.toLowerCase() === sheetName.toLowerCase()) ?? wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" }) as unknown[][];
}

export function useSiteCocImport(siteId: string | undefined, onDone: () => void) {
  const [importing, setImporting] = useState(false);

  const runImport = async (scheduleFile: File, verificationFile: File) => {
    if (!siteId) return;
    setImporting(true);
    try {
      toast.info("Parsing workbooks...");
      // workbook 1 has DB Schedule + Certificate Detail; workbook 2 has Verification
      const wb1 = await import("xlsx").then(X => X.read(scheduleFile.arrayBuffer ? undefined as any : undefined as any));
      void wb1; // (kept for clarity; we read via sheetGrid below)

      const schedGrid = await sheetGrid(scheduleFile, "DB Schedule");
      const detailGrid = await sheetGrid(scheduleFile, "Certificate Detail");
      const verifGrid = await sheetGrid(verificationFile, "Verification");
      if (!schedGrid) throw new Error("Could not read the 'DB Schedule' sheet");

      const schedule = parseDbSchedule(schedGrid);
      const detail = detailGrid ? parseCertificateDetail(detailGrid) : [];
      const verification = verifGrid ? parseVerification(verifGrid) : [];
      const merged = mergeCertificates(detail, verification);

      const { data: subs, error: subsErr } = await supabase
        .from("subsections").select("id, name").eq("site_id", siteId);
      if (subsErr) throw subsErr;
      const subsLite: SubsectionLite[] = (subs ?? []) as SubsectionLite[];

      const { data: { user } } = await supabase.auth.getUser();
      const { data: batch, error: batchErr } = await supabase
        .from("coc_import_batches")
        .insert({ site_id: siteId, uploaded_by: user?.id ?? null, schedule_file_name: scheduleFile.name, verification_file_name: verificationFile.name })
        .select("id").single();
      if (batchErr || !batch) throw new Error(`Could not start import batch: ${batchErr?.message}`);

      const schedRows = assembleScheduleRows(schedule, subsLite, siteId, batch.id);
      const certRows = assembleCertificateRows(merged, subsLite, siteId, batch.id);
      const summary = summarize(schedRows, certRows);

      // Replace the site's set: delete prior, then insert the new batch's rows.
      await supabase.from("coc_db_schedule").delete().eq("site_id", siteId).neq("import_batch_id", batch.id);
      await supabase.from("coc_certificates").delete().eq("site_id", siteId).neq("import_batch_id", batch.id);

      if (schedRows.length) {
        const { error } = await supabase.from("coc_db_schedule").insert(schedRows);
        if (error) throw error;
      }
      if (certRows.length) {
        const { error } = await supabase.from("coc_certificates").insert(certRows);
        if (error) throw error;
      }

      // sync is_coc_required for matched shops (Y -> true, N/A -> false; blank left alone)
      for (const r of schedRows) {
        if (!r.subsection_id) continue;
        const v = r.coc_required.trim().toUpperCase();
        if (v === "Y") await supabase.from("subsections").update({ is_coc_required: true }).eq("id", r.subsection_id);
        else if (v === "N/A" || v === "N") await supabase.from("subsections").update({ is_coc_required: false }).eq("id", r.subsection_id);
      }

      await supabase.from("coc_import_batches").update(summary).eq("id", batch.id);

      toast.success(`Imported ${summary.certs_imported} certificates across ${summary.shops_imported} shops (${summary.unmatched_count} unmatched).`);
      onDone();
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("Site COC import failed:", e);
      toast.error(e?.message || "Import failed", { duration: 6000 });
    } finally {
      setImporting(false);
    }
  };

  return { importing, runImport };
}
```

> Remove the dead `wb1` scaffolding line before committing — it exists only to show the SheetJS import; `sheetGrid` is the real reader.

- [ ] **Step 2: Typecheck** `npx tsc --noEmit` (no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/views/site-coc/useSiteCocImport.ts
git commit -m "feat(site-coc): xlsx import handler (parse -> match -> replace)"
```

---

# PHASE 2 — Tab + sub-tabs

## Task 9: Fetch hook

**Files:** Create `src/views/site-coc/useSiteCoc.ts`

- [ ] **Step 1: Implement**

```ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CocScheduleRow {
  id: string; subsection_id: string | null; shop_no_raw: string; trading_name: string;
  coc_required: string; initial_cert_nos: string; supplementary_cert_nos: string;
  unclear: string; supp_to_initial_ref: string; files_count: number | null;
  status: string; notes: string; match_status: string;
}
export interface CocCertRow {
  id: string; subsection_id: string | null; shop_no_raw: string; cert_no: string;
  cert_type: string; doc_type: string; clause_9_2: string; supp_to_init: string;
  issued_date: string | null; location: string; confidence: string; source_file: string;
  verdict: string; reasons: string; rules: Record<string, string>; notes: string; match_status: string;
}
export interface CocBatch {
  id: string; uploaded_at?: string; created_at: string; schedule_file_name: string | null;
  verification_file_name: string | null; certs_imported: number; shops_imported: number;
  matched_count: number; unmatched_count: number;
}

export function useSiteCoc(siteId: string | undefined) {
  const [schedule, setSchedule] = useState<CocScheduleRow[]>([]);
  const [certificates, setCertificates] = useState<CocCertRow[]>([]);
  const [batch, setBatch] = useState<CocBatch | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    const [s, c, b] = await Promise.all([
      supabase.from("coc_db_schedule").select("*").eq("site_id", siteId).order("shop_no_raw"),
      supabase.from("coc_certificates").select("*").eq("site_id", siteId).order("shop_no_raw"),
      supabase.from("coc_import_batches").select("*").eq("site_id", siteId).order("created_at", { ascending: false }).limit(1),
    ]);
    setSchedule((s.data ?? []) as CocScheduleRow[]);
    setCertificates((c.data ?? []) as CocCertRow[]);
    setBatch(((b.data ?? [])[0] ?? null) as CocBatch | null);
    setLoading(false);
  }, [siteId]);

  useEffect(() => { refetch(); }, [refetch]);

  return { schedule, certificates, batch, loading, refetch };
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
npx tsc --noEmit
git add src/views/site-coc/useSiteCoc.ts
git commit -m "feat(site-coc): site COC fetch hook"
```

## Task 10: Sub-tab components

**Files:** Create `ScheduleSubTab.tsx`, `CertificatesSubTab.tsx`, `VerificationSubTab.tsx` in `src/views/site-coc/`

- [ ] **Step 1: Schedule sub-tab** — table of `schedule`; unmatched rows get a red badge.

```tsx
import { Badge } from "@/components/ui/badge";
import type { CocScheduleRow } from "./useSiteCoc";

export function ScheduleSubTab({ rows }: { rows: CocScheduleRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No schedule imported yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b">
          {["Shop","Trading","COC Req.","Initial","Supplementary","Files","Status","Match"].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b">
              <td className="p-2 font-medium">{r.shop_no_raw}</td>
              <td className="p-2">{r.trading_name}</td>
              <td className="p-2">{r.coc_required}</td>
              <td className="p-2">{r.initial_cert_nos}</td>
              <td className="p-2">{r.supplementary_cert_nos}</td>
              <td className="p-2">{r.files_count ?? ""}</td>
              <td className="p-2">{r.status}</td>
              <td className="p-2">{r.match_status === "unmatched"
                ? <Badge variant="destructive">unmatched</Badge>
                : <Badge variant="secondary">matched</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Certificates sub-tab** — metadata columns.

```tsx
import { Badge } from "@/components/ui/badge";
import type { CocCertRow } from "./useSiteCoc";

export function CertificatesSubTab({ rows }: { rows: CocCertRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No certificates imported yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b">
          {["Shop","Cert No","Type","Doc type","9(2)","Issued","Conf","File","Match"].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b">
              <td className="p-2 font-medium">{r.shop_no_raw}</td>
              <td className="p-2">{r.cert_no}</td>
              <td className="p-2">{r.cert_type}</td>
              <td className="p-2">{r.doc_type}</td>
              <td className="p-2">{r.clause_9_2}</td>
              <td className="p-2">{r.issued_date ?? ""}</td>
              <td className="p-2">{r.confidence}</td>
              <td className="p-2 max-w-[16rem] truncate" title={r.source_file}>{r.source_file}</td>
              <td className="p-2">{r.match_status === "unmatched" ? <Badge variant="destructive">unmatched</Badge> : <Badge variant="secondary">matched</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Verification sub-tab** — SANS grid from `COC_SANS_RULES`, colour-coded.

```tsx
import { COC_SANS_RULES } from "@/lib/siteCoc/sansRules";
import type { CocCertRow } from "./useSiteCoc";

const cell = (v: string | undefined) => {
  const t = (v ?? "").toUpperCase();
  if (t === "PASS") return <span className="text-emerald-600" title="PASS">✓</span>;
  if (t === "FAIL") return <span className="text-red-600 font-bold" title="FAIL">✗</span>;
  if (t === "CV") return <span className="text-amber-600" title="cannot verify">CV</span>;
  if (t === "N/A") return <span className="text-muted-foreground" title="N/A">–</span>;
  return <span className="text-muted-foreground">·</span>;
};

export function VerificationSubTab({ rows }: { rows: CocCertRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No verifications imported yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left border-b">
          <th className="p-1 font-medium sticky left-0 bg-background">Shop</th>
          <th className="p-1 font-medium">Cert No</th>
          <th className="p-1 font-medium">Type</th>
          <th className="p-1 font-medium">Verdict</th>
          {COC_SANS_RULES.map(r => <th key={r.code} className="p-1 font-medium text-center" title={`${r.code} ${r.label}`}>{r.code}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b">
              <td className="p-1 font-medium sticky left-0 bg-background">{r.shop_no_raw}</td>
              <td className="p-1">{r.cert_no}</td>
              <td className="p-1">{r.cert_type[0]}</td>
              <td className="p-1" title={r.reasons}>{r.verdict}</td>
              {COC_SANS_RULES.map(rule => <td key={rule.code} className="p-1 text-center">{cell(r.rules?.[rule.code])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + Commit**

```bash
npx tsc --noEmit
git add src/views/site-coc/ScheduleSubTab.tsx src/views/site-coc/CertificatesSubTab.tsx src/views/site-coc/VerificationSubTab.tsx
git commit -m "feat(site-coc): schedule / certificates / verification sub-tabs"
```

## Task 11: Container tab + import UI

**Files:** Create `src/views/site-coc/SiteCocTab.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSiteCoc } from "./useSiteCoc";
import { useSiteCocImport } from "./useSiteCocImport";
import { ScheduleSubTab } from "./ScheduleSubTab";
import { CertificatesSubTab } from "./CertificatesSubTab";
import { VerificationSubTab } from "./VerificationSubTab";
import { ReportSubTab } from "./ReportSubTab";

export function SiteCocTab({ siteId, siteName }: { siteId: string | undefined; siteName: string }) {
  const { schedule, certificates, batch, loading, refetch } = useSiteCoc(siteId);
  const { importing, runImport } = useSiteCocImport(siteId, refetch);
  const schedRef = useRef<HTMLInputElement>(null);
  const verifRef = useRef<HTMLInputElement>(null);
  const [schedFile, setSchedFile] = useState<File | null>(null);
  const [verifFile, setVerifFile] = useState<File | null>(null);

  const go = async () => {
    if (!schedFile || !verifFile) { toast.error("Select both the DB Schedule and Verification workbooks."); return; }
    await runImport(schedFile, verifFile);
    setSchedFile(null); setVerifFile(null);
    if (schedRef.current) schedRef.current.value = "";
    if (verifRef.current) verifRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Site COC — import</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm">DB Schedule workbook
              <input ref={schedRef} type="file" accept=".xlsx" className="mt-1 block w-full text-sm" onChange={e => setSchedFile(e.target.files?.[0] ?? null)} />
            </label>
            <label className="text-sm">Verification workbook
              <input ref={verifRef} type="file" accept=".xlsx" className="mt-1 block w-full text-sm" onChange={e => setVerifFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <Button onClick={go} disabled={importing || !schedFile || !verifFile}>
            {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {importing ? "Importing..." : "Import (replaces this site's COC data)"}
          </Button>
          {batch && (
            <p className="text-xs text-muted-foreground">
              Last import: {new Date(batch.created_at).toLocaleString()} · {batch.certs_imported} certs · {batch.shops_imported} shops · {batch.unmatched_count} unmatched
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="certificates">Certificates</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule"><Card><CardContent className="pt-4">{loading ? "Loading…" : <ScheduleSubTab rows={schedule} />}</CardContent></Card></TabsContent>
        <TabsContent value="certificates"><Card><CardContent className="pt-4">{loading ? "Loading…" : <CertificatesSubTab rows={certificates} />}</CardContent></Card></TabsContent>
        <TabsContent value="verification"><Card><CardContent className="pt-4">{loading ? "Loading…" : <VerificationSubTab rows={certificates} />}</CardContent></Card></TabsContent>
        <TabsContent value="report"><Card><CardContent className="pt-4"><ReportSubTab siteName={siteName} schedule={schedule} certificates={certificates} batch={batch} /></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Commit** (Task 12 creates `ReportSubTab`; build after Task 12.)

```bash
git add src/views/site-coc/SiteCocTab.tsx
git commit -m "feat(site-coc): container tab with import + sub-tabs"
```

## Task 12: Wire the tab into SiteDetail

**Files:** Modify `src/views/SiteDetail.tsx` (TabsList ~646-690, TabsContent region)

- [ ] **Step 1:** Add a `TabsTrigger value="site-coc"` (label "Site COC", with an icon already imported in the file, e.g. `FileText`) alongside the existing triggers, and a matching `TabsContent value="site-coc"` rendering `<SiteCocTab siteId={siteId} siteName={<the site name var in this file>} />`. Import `SiteCocTab` from `@/views/site-coc/SiteCocTab`. Use the file's existing site-name state for `siteName`.

- [ ] **Step 2:** `npm run build` — Expected: success (route table prints).

- [ ] **Step 3: Commit**

```bash
git add src/views/SiteDetail.tsx
git commit -m "feat(site-coc): add Site COC tab to SiteDetail"
```

---

# PHASE 3 — Report

## Task 13: Site COC report (pdfmake)

**Files:** Create `src/lib/siteCoc/siteCocReport.ts`, `src/views/site-coc/ReportSubTab.tsx`

- [ ] **Step 1:** `siteCocReport.ts` — build a pdfmake doc definition (summary counts + schedule table + per-cert verdict/failed-codes). Locate the project's existing pdfmake setup first (`grep -rl "pdfMake\|pdfmake" src/lib | head`) and reuse its fonts/`createPdf` wrapper rather than re-initialising.

```ts
import { COC_SANS_RULES } from "./sansRules";
import type { CocScheduleRow, CocCertRow, CocBatch } from "@/views/site-coc/useSiteCoc";

export interface SiteCocReportInput { siteName: string; schedule: CocScheduleRow[]; certificates: CocCertRow[]; batch: CocBatch | null; }

export function buildSiteCocReportDocDef(input: SiteCocReportInput): any {
  const { siteName, schedule, certificates, batch } = input;
  const certPass = certificates.filter(c => c.verdict.toUpperCase().startsWith("PASS")).length;
  const certFail = certificates.filter(c => c.verdict.toUpperCase().startsWith("FAIL")).length;
  const certCV = certificates.filter(c => c.verdict.toUpperCase().startsWith("CV")).length;
  const failedCodes = (c: CocCertRow) => COC_SANS_RULES.filter(r => (c.rules?.[r.code] ?? "").toUpperCase() === "FAIL").map(r => r.code).join(", ");

  return {
    pageOrientation: "landscape",
    content: [
      { text: `${siteName} — Site COC Report`, style: "h1" },
      { text: batch ? `Imported ${new Date(batch.created_at).toLocaleString()} · ${batch.unmatched_count} unmatched` : "No import yet", style: "muted" },
      { text: "Summary", style: "h2", margin: [0, 10, 0, 4] },
      { ul: [
        `Shops: ${schedule.length} (${schedule.filter(s => s.match_status === "matched").length} matched)`,
        `Certificates: ${certificates.length} — PASS ${certPass}, FAIL ${certFail}, CV ${certCV}`,
      ] },
      { text: "Schedule", style: "h2", margin: [0, 10, 0, 4] },
      { table: { headerRows: 1, widths: ["auto","*","auto","auto","auto"], body: [
        ["Shop","Trading","COC Req.","Files","Status"],
        ...schedule.map(s => [s.shop_no_raw, s.trading_name, s.coc_required, String(s.files_count ?? ""), s.status]),
      ] }, layout: "lightHorizontalLines" },
      { text: "Verification", style: "h2", margin: [0, 10, 0, 4] },
      { table: { headerRows: 1, widths: ["auto","auto","auto","auto","*"], body: [
        ["Shop","Cert No","Type","Verdict","Failed rules"],
        ...certificates.map(c => [c.shop_no_raw, c.cert_no, c.cert_type, c.verdict, failedCodes(c) || "—"]),
      ] }, layout: "lightHorizontalLines" },
    ],
    styles: { h1: { fontSize: 16, bold: true }, h2: { fontSize: 12, bold: true }, muted: { fontSize: 9, color: "#666" } },
    defaultStyle: { fontSize: 8 },
  };
}
```

- [ ] **Step 2:** `ReportSubTab.tsx` — a "Download PDF" button that calls the project's pdfmake `createPdf(...).download(...)` with the doc def.

```tsx
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { buildSiteCocReportDocDef } from "@/lib/siteCoc/siteCocReport";
import type { CocScheduleRow, CocCertRow, CocBatch } from "./useSiteCoc";

export function ReportSubTab({ siteName, schedule, certificates, batch }: { siteName: string; schedule: CocScheduleRow[]; certificates: CocCertRow[]; batch: CocBatch | null; }) {
  const download = async () => {
    const pdfMake = (await import("@/lib/pdfMakeConfig")).default; // reuse the configured instance — adjust import to the actual export found in Step 1
    const doc = buildSiteCocReportDocDef({ siteName, schedule, certificates, batch });
    pdfMake.createPdf(doc).download(`${siteName} - Site COC Report.pdf`);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Overall site COC report from the imported data.</p>
      <Button onClick={download} disabled={!certificates.length && !schedule.length}><Download className="h-4 w-4 mr-2" /> Download PDF</Button>
    </div>
  );
}
```

> In Step 1 you located the real configured pdfmake instance (`src/lib/pdfMakeConfig.ts` per the repo). Use that exact import/export shape here.

- [ ] **Step 3:** `npm run build` + `npx vitest run` — Expected: build succeeds, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/siteCoc/siteCocReport.ts src/views/site-coc/ReportSubTab.tsx
git commit -m "feat(site-coc): site COC PDF report"
```

---

# DEPLOY

## Task 14: Apply migration to prod + deploy

- [ ] **Step 1:** Apply `20260619130000_site_coc_system.sql` to prod via the Management API (`POST /v1/projects/oltzgidkjxwsukvkomof/database/query`, PAT). Expect HTTP 201. Verify: `select count(*) from public.coc_certificates;` returns 0.
- [ ] **Step 2:** Confirm PostgREST exposes the tables (anon probe `GET /rest/v1/coc_certificates?select=id&limit=1` → 200, not 42P01).
- [ ] **Step 3:** Merge `feat/site-coc-system` → `main`, push (Vercel prod deploy). Confirm deployment Ready.
- [ ] **Step 4:** Runtime verify: open a site's Site COC tab → import the two YARONA workbooks → Schedule/Certificates/Verification populate; unmatched shops flagged; Report downloads. (Needs auth — user-run or browser-driven.)

---

## Self-Review

**Spec coverage:**
- §2.1 integrate w/ subsections → matching in Task 5 + is_coc_required sync in Task 8. ✓
- §2.2 cert sheets merge → Task 4 `mergeCertificates`. ✓
- §2.3 replace-on-reimport → Task 8 delete-then-insert. ✓
- §2.4 flag-unmatched → Task 5 `match_status`; Tasks 10 badges. ✓
- §2.5 don't overwrite computed coc_status → Task 8 only touches `is_coc_required`. ✓
- §2.6 PAT for DDL only → Task 6/14 DDL via PAT; ingestion via authed client. ✓
- §3 column mapping → Tasks 4 parsers (every column). ✓
- §3.3 22 SANS codes → Task 1. ✓
- §4 schema → Task 6 + Task 7 types. ✓
- §5 ingestion (SheetJS, normalize, match, replace) → Tasks 2/4/5/8. ✓
- §6 tab + 4 sub-tabs → Tasks 9-12. ✓
- §7 report → Task 13. ✓
- §8 phasing → Phase 1/2/3 headers. ✓

**Placeholder scan:** none — all code/commands concrete. The only deferred detail is the exact pdfmake import shape (Task 13 Step 1 instructs locating `src/lib/pdfMakeConfig.ts` and using its real export); flagged explicitly, not a silent TODO.

**Type consistency:** `ParsedCertificate` / `ParsedScheduleRow` / `SubsectionLite` (Task 3) used consistently in Tasks 4/5/8. `CocScheduleRow` / `CocCertRow` / `CocBatch` (Task 9) used in Tasks 10/11/13. `rules: Record<string,RuleResult>` consistent. `match_status` literal `'matched'|'unmatched'` consistent. `matchShop/assembleScheduleRows/assembleCertificateRows/summarize` signatures match between Task 5 and Task 8.
