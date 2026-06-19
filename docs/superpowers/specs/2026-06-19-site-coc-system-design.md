# Site COC system — design

**Date:** 2026-06-19
**Surface:** Site detail (`SiteDetail.tsx`) → new top-level **Site COC** tab with sub-tabs
**Status:** Design (awaiting user review before plan)

## 1. Goal

Give each site an overall **COC tab** that ingests the COC working files (Excel), stores their
contents in a structured database, integrates with the site's existing subsections, and produces
an **overall site COC report**. The source files are produced by an external (vision/manual)
review process; this system only ingests, stores, displays, and reports — it does not re-run any
SANS assessment.

Two input workbooks (per site), reviewed in full:

- **`<SITE> - DB COC Schedule.xlsx`**
  - sheet **`DB Schedule`** — per shop/tenant register.
  - sheet **`Certificate Detail`** — per certificate/file inventory.
- **`<SITE> - COC Verification.xlsx`**
  - sheet **`Verification`** — per certificate SANS 10142-1 result grid.

## 2. Decisions (locked with user)

1. **Integrate with subsections** — single source of truth; reuse existing `subsections` +
   the per-subsection COC work. The shop register links to real subsections.
2. **`Certificate Detail` + `Verification` merge** into one per-certificate table (same grain,
   keyed by Cert No + Shop): metadata + assessment together.
3. **Replace the site's imported set on each upload** — every import deletes this site's prior
   imported schedule/certificate rows and inserts the new file's contents.
4. **Flag, don't create** — Shop No that doesn't match a subsection is imported but marked
   `unmatched` for manual resolution; ingestion never auto-creates subsections.
5. **Never overwrite computed live data** — ingestion sets `subsections.is_coc_required` but does
   not touch `coc_status` / `is_compliant` (driven by the rollup from
   `2026-06-12-coc-hierarchy-per-document` + the per-COC work).
6. **PAT for DDL only** — the Supabase Management API PAT creates the new tables; row ingestion
   runs in the app via the authenticated Supabase client (RLS).

## 3. Source-sheet column mapping (every column accounted for)

### 3.1 `DB Schedule` → `coc_db_schedule` (+ `subsections.is_coc_required`)
| Sheet column | Target |
|---|---|
| Shop No | `shop_no_raw`; matched to `subsections.id` → `subsection_id` |
| Trading Name | `trading_name` |
| COC Req. (Y / N/A) | `coc_required` (text as-imported); also sync `subsections.is_coc_required` (Y→true, N/A→false, blank→leave) |
| Initial COC No(s) | `initial_cert_nos` (raw `;`-separated string) |
| Supplementary COC No(s) | `supplementary_cert_nos` (raw `;`-separated string) |
| Unclear (no tick) | `unclear` |
| Supp→Initial ref | `supp_to_initial_ref` |
| Files | `files_count` (int) |
| Status | `status` (the register's imported roll-up verdict) |
| Notes | `notes` |

### 3.2 `Certificate Detail` + `Verification` → `coc_certificates`
| Sheet column | Source | Target |
|---|---|---|
| File | Cert Detail | `source_file` |
| Matched | Cert Detail | `shop_no_raw`; matched → `subsection_id` |
| Doc type | Cert Detail | `doc_type` (electrical_coc / other / completion_cert / …) |
| Cert No | both | `cert_no` (raw) + `cert_no_norm` (matching key) |
| Type | both | `cert_type` (Initial / Supplementary / Unclear; Verification uses I/S — normalized) |
| 9(2) | Cert Detail | `clause_9_2` |
| Supp→Init | Cert Detail | `supp_to_init` |
| Issued | Cert Detail | `issued_date` (date; null if unparseable) |
| Location | Cert Detail | `location` |
| Conf | Cert Detail | `confidence` (high / med / low) |
| Notes | both | `notes` |
| Verdict | Verification | `verdict` (PASS / FAIL / CV / N/A + free text) |
| Reasons | Verification | `reasons` |
| A1…C15 (22 cells) | Verification | `rules` jsonb `{ code: "PASS"|"FAIL"|"CV"|"N/A" }` |

Merge key: `(site_id, normalized shop, cert_no_norm, cert_type)`. A cert present in only one sheet
still yields a row (metadata-only or verification-only); both present → one merged row.

### 3.3 SANS rule codes (single TS constant `COC_SANS_RULES`)
The 22 columns, in order, code → label:
`A1` cert no · `A2` test report · `A4` date · `A5` reg no · `A6` signature ·
`B1` conductors · `B2` components · `B3` disconnect · `B4` labelling ·
`C1` bonding · `C2` ECC · `C3` ring · `C7` neutral elev · `C8` insulation · `C9` V no-load ·
`C10` V on-load · `C11` E/L trip · `C12` E/L button · `C13` polarity · `C14` phase rot · `C15` switching.
(The source omits A3 and C4–C6; we capture exactly these 22. New codes appearing in a future
file are stored in `rules` jsonb and surfaced as extra columns — jsonb makes this non-breaking.)

## 4. Schema (3 new tables)

All tables: `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`,
`updated_at timestamptz default now()`. RLS enabled; **authenticated-only** access scoped to the
site (mirror existing site-scoped table policies; no anon access — prod RLS is hardened).

```sql
create table public.coc_import_batches (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  uploaded_by uuid references auth.users(id),
  schedule_file_name text,
  verification_file_name text,
  certs_imported int default 0,
  shops_imported int default 0,
  matched_count int default 0,
  unmatched_count int default 0,
  created_at timestamptz default now()
);

create table public.coc_db_schedule (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  subsection_id uuid references public.subsections(id) on delete set null,
  import_batch_id uuid references public.coc_import_batches(id) on delete cascade,
  shop_no_raw text,
  trading_name text,
  coc_required text,
  initial_cert_nos text,
  supplementary_cert_nos text,
  unclear text,
  supp_to_initial_ref text,
  files_count int,
  status text,
  notes text,
  match_status text not null default 'matched',  -- 'matched' | 'unmatched'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.coc_certificates (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  subsection_id uuid references public.subsections(id) on delete set null,
  import_batch_id uuid references public.coc_import_batches(id) on delete cascade,
  shop_no_raw text,
  cert_no text,
  cert_no_norm text,
  cert_type text,            -- Initial | Supplementary | Unclear
  doc_type text,             -- electrical_coc | other | completion_cert | ...
  clause_9_2 text,
  supp_to_init text,
  issued_date date,
  location text,
  confidence text,           -- high | med | low
  source_file text,
  verdict text,              -- PASS | FAIL | CV | N/A (+ free text)
  reasons text,
  rules jsonb not null default '{}'::jsonb,   -- { "A1":"PASS", ... }
  notes text,
  match_status text not null default 'matched',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_coc_db_schedule_site on public.coc_db_schedule(site_id);
create index idx_coc_db_schedule_subsection on public.coc_db_schedule(subsection_id);
create index idx_coc_certificates_site on public.coc_certificates(site_id);
create index idx_coc_certificates_subsection on public.coc_certificates(subsection_id);
```

Applied to prod via the Management API SQL endpoint (PAT), not `db push`. Generated
`src/integrations/supabase/types.ts` updated to include the three tables.

## 5. Ingestion

- **Parsing:** client-side with SheetJS (`xlsx`). Add the dependency if not present.
- **Inputs:** two file pickers — Schedule workbook and Verification workbook. Sheets resolved by
  name (`DB Schedule`, `Certificate Detail`, `Verification`) with a header-row scan fallback
  (header = first row with ≥2 non-empty cells; pre-header title/description rows skipped, as in
  the reviewed files).
- **Normalization:** `normShop(s)` = uppercase, collapse runs of space/hyphen/underscore to a
  single space, trim (so `SHOP-002` == `SHOP 002`). `normCert(s)` = uppercase, strip spaces.
  `cert_type`: `I`→Initial, `S`→Supplementary, else Unclear.
- **Matching:** for each shop, match `normShop(shop_no_raw)` against `normShop(subsections.name)`
  within the site; on hit set `subsection_id` + `match_status='matched'`, else `'unmatched'`.
  Certificates inherit the match from their shop.
- **Replace transaction (per upload):**
  1. insert a `coc_import_batches` row;
  2. delete this `site_id`'s existing `coc_db_schedule` + `coc_certificates` rows;
  3. insert parsed schedule + merged certificate rows referencing the new batch;
  4. sync `subsections.is_coc_required` for matched shops;
  5. record counts on the batch.
- Runs via the authenticated Supabase client; failures surface a toast and leave the prior import
  intact (delete+insert wrapped so a parse error before step 2 changes nothing).
- The imported per-cert `verdict` is an assessment record; it does **not** overwrite the manual
  per-subsection COC verdict.

## 6. UI — Site COC tab (new top-level tab in `SiteDetail.tsx`)

Inner sub-tabs:
- **Schedule** — `coc_db_schedule` grid; columns per §3.1; `match_status='unmatched'` rows
  highlighted with a resolve affordance (links to the subsection list). Live `is_coc_required`
  shown from the subsection.
- **Certificates** — `coc_certificates` metadata view (source_file, doc_type, cert_no, cert_type,
  clause_9_2, issued_date, location, confidence, matched shop, notes).
- **Verification** — SANS grid view of `coc_certificates`: shop, cert_no, type, verdict, then the
  22 rule cells rendered from `COC_SANS_RULES`, colour-coded ✓ PASS (green) / ✗ FAIL (red) /
  CV (amber) / – N/A. Verdict free-text shown on hover/expand.
- **Report** — see §7.

Top of the tab: an **Import** action (the two file pickers) + last-import summary
(from `coc_import_batches`: when, by whom, counts, unmatched count).

## 7. Site COC report

Reuse the existing client-side pdfmake report engine (all reports are pdfmake per the
report-system-redesign work). Contents:
- Header: site, generated date, last-import metadata.
- Summary: shops (total / COC-required / matched / unmatched), certificates
  (total / PASS / FAIL / CV / N/A), by-type counts.
- Schedule table (per shop, status + flags).
- Verification summary (per cert: verdict + failed/CV rule codes).
Exported from the Report sub-tab.

## 8. Phasing (one spec, phased plan)

1. **Schema + ingestion** — 3 tables (PAT DDL) + types + SheetJS parse/match/replace; verify
   counts land. Pure parse/normalize/merge helpers are unit-tested.
2. **Tab + sub-tabs** — Site COC tab with Schedule / Certificates / Verification grids.
3. **Report** — site COC PDF from the ingested data.

## 9. Out of scope (YAGNI)

- Re-running SANS assessment or editing rule cells in-app (import is the source of truth).
- Auto-creating subsections from unmatched shops.
- Syncing the imported per-cert verdict into the manual per-subsection COC verdict.
- Versioned/comparable import history (replace-on-reimport keeps only the latest, plus the batch log).

## 10. Open items for review
1. Confirm 3-table schema + `rules` as jsonb (vs 22 columns).
2. Confirm four sub-tabs (Schedule / Certificates / Verification / Report).
3. Confirm import accepts the two workbooks as separate pickers.
