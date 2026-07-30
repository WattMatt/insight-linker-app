# D04 — db-platform-config

- unit id: D04
- slug: db-platform-config
- spec mode: aggregate
- date: 2026-07-29
- file count: 3

Files covered (authoritative set from `review/unit-files.json` key "D04"):

1. `supabase/config.toml` (66 lines)
2. `supabase/seeds/fortress_abaqulusi_seed.sql` (525 lines)
3. `supabase/templates/recovery.html` (79 lines)

---

## 1. supabase/config.toml

### 1.1 Contents

The file contains exactly two kinds of content: a project id and per-function `verify_jwt` flags. `project_id = "oltzgidkjxwsukvkomof"` (supabase/config.toml:1); the remainder is twenty `[functions.<name>]` blocks each carrying a single `verify_jwt` boolean. There are no other sections — no `[auth]`, `[db]`, `[api]`, `[storage]`, or email-template blocks appear anywhere in the file (verified by full read of all 66 lines).

The same project ref appears in the frontend in two places: as a hardcoded URL string `"https://oltzgidkjxwsukvkomof.supabase.co"` (src/views/APIClients.tsx:122) and in a doc comment (src/hooks/useUnresolvedOrphans.ts:5). The runtime client itself builds its URL from `process.env.NEXT_PUBLIC_SUPABASE_URL` (src/integrations/supabase/client.ts:5), with `.env.example` shipping the placeholder `https://YOUR_PROJECT.supabase.co` (.env.example:1).

### 1.2 Full verify_jwt registry as declared (line cites)

| # | function | verify_jwt | declared at | directory exists under supabase/functions/? |
|---|---|---|---|---|
| 1 | invite-user | true | config.toml:3-4 | yes (F01) |
| 2 | delete-user | true | config.toml:6-7 | yes (F01) |
| 3 | qr-redirect | false | config.toml:9-10 | yes (F02) |
| 4 | report-issue | false | config.toml:12-13 | yes (F02) |
| 5 | validate-coc | true | config.toml:15-16 | **no** |
| 6 | extract-coc | true | config.toml:18-19 | **no** |
| 7 | send-email | true | config.toml:21-22 | yes (F01) |
| 8 | offline-review | false | config.toml:24-25 | yes (F05) |
| 9 | verify-fix | true | config.toml:27-28 | **no** |
| 10 | templates | false | config.toml:30-31 | yes (F03) |
| 11 | save-template | false | config.toml:33-34 | yes (F03) |
| 12 | fix-tenant-images | true | config.toml:36-37 | yes (F04) |
| 13 | api-reports | false | config.toml:39-40 | yes (F03) |
| 14 | template-sync | false | config.toml:42-43 | yes (F03) |
| 15 | detect-schematic-regions | false | config.toml:46-47 | **no** |
| 16 | fix-inspection-photos | false | config.toml:49-50 | yes (F04) |
| 17 | compress-image | true | config.toml:52-53 | yes (F04) |
| 18 | batch-compress-images | true | config.toml:55-56 | yes (F04) |
| 19 | oauth-token | false | config.toml:58-59 | yes (F03) |
| 20 | log-auth-event | false | config.toml:65-66 | yes (F01) |

Tally: 20 declared entries; 9 declared `verify_jwt = true`, 11 declared `verify_jwt = false`.

### 1.3 Declared vs actual `supabase/functions/` directories

Actual directories on disk: 17 (`ls supabase/functions/`): api-reports, batch-compress-images, compress-image, delete-user, fix-inspection-photos, fix-tenant-images, invite-user, log-auth-event, oauth-token, offline-review, qr-redirect, report-issue, save-template, send-email, send-password-reset, template-sync, templates.

- **Declared but absent (4)** — registry entries with no corresponding function directory (verified via `comm -23` of the two sorted lists): `validate-coc` (config.toml:15), `extract-coc` (config.toml:18), `verify-fix` (config.toml:27), `detect-schematic-regions` (config.toml:46).
- **Present but undeclared (1)**: `send-password-reset` — the directory `supabase/functions/send-password-reset/` exists (part of unit F01) but has no `[functions.send-password-reset]` block in config.toml.
- The remaining 16 directories are all declared; 16 declared + 1 undeclared = 17 dirs; 16 + 4 absent = 20 declared entries. The arithmetic reconciles exactly.

### 1.4 Auth settings

There are none in this file. config.toml carries no `[auth]` section, no site_url, no OTP/expiry settings, and no email-template wiring (full read, 66 lines). The only auth-adjacent content is the prose comment above the `log-auth-event` entry (config.toml:61-64), which states the function is anon-callable so pre-session events ("password_reset_requested, magic_link_requested, and lockout") can land in the `auth_events` audit trail, with `user_id` "inferred from the JWT when present and left NULL otherwise". Auth email templates are instead handled manually — see §3.

### 1.5 uses -> / used by <-

- uses -> nothing in-repo at runtime; it names the function directories of F01 edge-auth-user-lifecycle, F02 edge-public-qr, F03 edge-docbuilder-api, F04 edge-media-maintenance, F05 edge-ai-review (per the table in §1.2), plus the 4 absent names.
- used by <- none found (grep-verified: `grep -rn "config.toml" src supabase package.json vercel.json` returns zero hits). No script, code, or config in the repo references this file by name.

---

## 2. supabase/seeds/fortress_abaqulusi_seed.sql

### 2.1 What it is

A single-transaction (`BEGIN;` line 4 … `COMMIT;` line 525) seed of one real shopping-centre dataset. Its own header states: "Fortress Building Pack — Abaqulusi Plaza seed (real data from the 3 workbooks)", "Generated; safe to re-run (ON CONFLICT DO NOTHING on fixed UUIDs)", and "NOT applied to live DB. Review then load via supabase" (fortress_abaqulusi_seed.sql:1-3). Every INSERT uses fixed UUIDs and ends `ON CONFLICT (id) DO NOTHING` (e.g. lines 9, 63, 124, 266, 523).

### 2.2 Content summary

463 insert tuples total (verified: `grep -c "^  ('"` = 463), matching the per-section header comments exactly:

| table | rows | header cite | content |
|---|---|---|---|
| public.clients | 1 | :6 | "Fortress / Capital Propfund (managed by Broll)" (:8) |
| public.sites | 1 | :11 | "Abaqulusi Plaza (Vryheid Plaza)", Cnr Utrecht & Mason Street, Vryheid; GLA 16,811 m², 46 tenants (:13) |
| public.building_assets | 45 | :16 | Fire/Security/Electrical/Lighting/Building-Fabric/etc. asset register with service dates, costs, contractor names (:18-62) |
| public.ohs_compliance_items | 57 | :65 | OHS checklist Q&A for period 2025-10-01, item codes 1.1.1–3.1.2 (:67-123) |
| public.building_condition_items | 138 | :126 | Building condition walk, inspected_on 2025-08-12, inspector recorded per row (:128-265) |
| public.utilities_readings | 1 | :268 | Water/electricity/solar/borehole figures for 2025-10-01 (:270) |
| public.ppm_tasks | 25 | :273 | Planned-maintenance tasks scheduled 2025-10-21, status due/done (:275-299) |
| public.masterfile_index | 42 | :302 | Document register (zoning cert, COCs, evacuation plan …) with `responsible` person per row (:304-345) |
| public.expense_recoveries | 6 | :348 | YTD expense vs recovery per service for 2025-10-01 (:350-355) |
| public.tenants | 69 | :358 | Tenant schedule — BOXER, SHOPRITE, PEP, ACKERMANS as anchors, plus line shops, kiosks, ATMs (:360-428) |
| public.tenant_shop_specs | 58 | :431 | Per-shop electrical/HVAC/finish specs keyed to tenant ids (:433-490) |
| public.tenant_trading | 11 | :493 | Turnover/trading-density rows for 2025-12-01, incl. centre total R75,479,367 (:495-505) |
| public.tenant_movements | 3 | :508 | New-tenant movements (STANDARD BANK, SANLAM, KFC) (:510-512) |
| public.security_incidents | 6 | :515 | Monthly incident counts Jul–Dec 2025 with narratives (:517-522) |

All 14 target tables are created in migration `supabase/migrations/20260612200000_fortress_building_layer.sql` (unit D03) — e.g. `CREATE TABLE IF NOT EXISTS public.building_assets` at :53, `tenant_shop_specs` at :204, `expense_recoveries` at :308 of that migration (clients/sites predate it, from the D01 era).

### 2.3 Real-PII content (factual)

The seed contains named real individuals: contact person "Donovan De Lange" (also asset_manager, :8, :13), ops manager / inspector "Wesley Sykes" (:13 and as `inspector` on all 138 building_condition_items rows, :128-265), centre manager "Sibusiso Mabaso" (:13), and first names in the masterfile `responsible` column — Mina, Deon, Sibu, Tanya, Neli (:305-344). It also carries per-tenant commercial figures: turnover, trading density, annual growth, arrears (:495-505), and security-incident narratives naming tenant stores (:517-522). The clients row has `email` and `phone` as NULL (:8) — no email addresses or phone numbers appear in the file.

### 2.4 uses -> / used by <-

- uses -> tables defined by D03 migration `20260612200000_fortress_building_layer.sql` (see §2.2); consumed at query time by nothing in this file itself.
- used by <- no code or config references (grep-verified: `grep -rn "fortress_abaqulusi" src supabase package.json` — zero hits). Referenced by documentation only: X04 docs-fortress-and-sessions (docs/fortress-spec/README.md:31, docs/fortress-spec/BUILD-PROMPT.md:60,104, docs/fortress-spec/04-abaqulusi-ingest-review.md:13, docs/fortress-spec/02-build-roadmap.html:366, docs/sessions/fortress-abaqulusi-INGEST-REVIEW.md:13, docs/sessions/fortress-build-roadmap-2026-06-12.html:366) and X03 docs-superpowers (docs/superpowers/specs/2026-06-20-fortress-asset-register-pdf-spec.md:62,367). The docs' claim of "463 rows of real Abaqulusi data" matches the verified tuple count.

---

## 3. supabase/templates/recovery.html

### 3.1 What it is

A hand-authored HTML email template for the Supabase "Reset Password" (recovery) email. Its header comment (recovery.html:1-14) states the rationale: `src/views/auth/ForgotPassword.tsx` is OTP-first and calls `verifyOtp({ type: "recovery" })`, which only works if the template renders `{{ .Token }}` (the 6-digit code); Supabase's default template ships only a `{{ .ConfirmationURL }}` link. This claim about the view checks out against the code: ForgotPassword.tsx calls `supabase.auth.resetPasswordForEmail` (src/views/auth/ForgotPassword.tsx:72) and then `supabase.auth.verifyOtp({ ..., type: "recovery" })` (src/views/auth/ForgotPassword.tsx:99-102) — that view belongs to unit V05 auth-views.

### 3.2 Structure

Inline-styled table layout branded "WM Compliance" (:30). The body leads with the 6-digit code rendered from `{{ .Token }}` in a 34px monospace block (:48), states a 1-hour expiry (:54, :70), and keeps `{{ .ConfirmationURL }}` as a secondary fallback link (:60). Those are the only two Supabase template variables used (:11).

### 3.3 How it deploys

Manually, per its own instructions: "Paste into: Dashboard → Authentication → Emails → 'Reset Password' → Message body", suggested subject "Your WM Compliance password reset code" (recovery.html:12-13). Nothing wires it automatically: config.toml has no auth/email-template section (§1.4), and no build script, function, or config references the file.

### 3.4 uses -> / used by <-

- uses -> Supabase template variables `{{ .Token }}` and `{{ .ConfirmationURL }}` (:48, :60); pairs behaviorally with V05 auth-views (src/views/auth/ForgotPassword.tsx:72,99-102).
- used by <- none found (grep-verified: `grep -rn "recovery.html\|supabase/templates" src supabase package.json docs README.md` — zero hits outside the file itself).

---

## ASSUMED (inferred, not verified in-repo)

1. `supabase/config.toml` is consumed by the Supabase CLI at deploy time (`supabase functions deploy` reading per-function `verify_jwt`, `supabase link` using `project_id`). This is standard Supabase CLI behavior; no in-repo evidence exists since nothing references the file (§1.5).
2. The four declared-but-absent function entries are leftovers from functions that once existed or were planned; the repo contains no record in this unit's files of which.
3. Because `send-password-reset` has no config.toml entry, its effective `verify_jwt` value is whatever the platform default / dashboard setting is — not determinable from the repo.
4. The seed being under `supabase/seeds/` (not the CLI-default `supabase/seed.sql` path) means the CLI would not auto-apply it on `db reset` without explicit configuration; consistent with, but only asserted by, the file's own "NOT applied to live DB" header (fortress_abaqulusi_seed.sql:3).
5. Whether the deployed Supabase project's actual "Reset Password" email currently matches recovery.html cannot be verified from the repo (manual-paste deploy, §3.3).
