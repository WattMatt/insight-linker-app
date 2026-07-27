# QR Platform Expansion — Design Spec

**Date:** 2026-07-27
**Branch:** `feat/qr-platform` (cut from `origin/main` — independent of PR #59; see Sequencing)
**Status:** Awaiting user approval

## Locked product decisions (user, 2026-07-27)

1. **Verdict visibility: fully public.** Pass, expiring-hint, and fail all visible to any anonymous scanner. Fail is worded neutrally and raw failure reasons are NOT exposed (see W2).
2. **Scope: the "recommended set"** — scan logging + analytics, live verdict landing, verification QR (pivoted, see W3), scan-to-action for contractor/inspector/public, print & trust upgrades. Out of scope: lifecycle-aware landing, asset-level register, NFC, emergency-info landing, scan-to-login.
3. **Sequencing: build now, publish after PR #59 lands.** Review evidence showed the register-truth branch touches zero QR files, so this branch cuts from `main` with an independent PR (not stacked). Only the *go-live* of verdict display is sequenced after #59's migration is applied in prod, so public verdicts never show pre-register-truth expiry semantics.
4. **Publishing: production.** End state is live on watsonmattheus.com: targeted migrations applied via Supabase Management API (NEVER `supabase db push` — prod schema is ahead of `schema_migrations`), edge functions deployed, verified live. This includes landing PR #59 first (its migration + post-deploy E2E).

## Verified current state (evidence-backed, 5-agent review 2026-07-27)

- QR PNGs encode the permanent `qr-redirect` edge function URL (`verify_jwt=false`, service-role client) which 302s to `${settings.qr_base_url}/public/subsections/<id>` (`src/lib/qrBaseUrl.ts`, `supabase/functions/qr-redirect/index.ts`).
- The landing page `src/views/PublicSubsection.tsx` fetches everything via one anon-granted SECURITY DEFINER RPC `get_public_subsection` (`supabase/migrations/20260610113000_public_rpcs_phase1.sql:22-50`) returning curated branding/subsection/site/documents/snags. COC data is deliberately absent from every public surface today.
- `qr_scans` exists on main (`20251014140001`: id, subsection_id FK CASCADE, scanned_at, scanned_by nullable, ip_address, user_agent, created_at; anon INSERT `WITH CHECK (true)`, authenticated SELECT, **no DELETE policy, no secondary indexes**) and **nothing has ever written to it**. The two `.delete()` calls in app code are RLS no-ops.
- Verdict truth: `subsections.coc_status` ∈ `Missing|Pending|Pass|Fail|N/A`, computed by `rollup_subsection_coc_status` + triggers. PR #59's migration `20260725100000_coc_register_truth.sql` removes expiry auto-fail (expiry becomes display-only) and backfills doc statuses from register verdicts. No issuer-name column and no failed-on date exist anywhere (nearest proxy: `coc_reviewed_at`).
- **COCs are contractor-uploaded files** (`src/lib/coc/uploadCocFiles.ts`); the app never generates a certificate PDF. WM-generated PDFs: Site COC Report (`src/lib/siteCoc/siteCocReport.ts` — zero QR today), Site Summary Report (subsection cards already embed per-subsection QRs), report covers (unused `qrCodeDataUrl` slot in `createCoverPage`). Dead scaffolding: `pdfEngine.ts` `'qr-sheet'` ReportType + `createQRCodeGrid` (no callers). All QR output is raster PNG; label text is rasterized (renames leave stored PNGs stale — confirmed: `handleSaveEdit` never regenerates).
- Contractor portal has **no COC upload UI** (`ContractorSubsectionDetail.tsx` is read-only). Ingestion pipe `poolRouteFile(siteId, file)` needs only `siteId`; assignment is register-driven from the cert number. Admin deep links exist (`?tab=coc-metering`, `?create=1` via `buildActionHref.ts`).
- Public pages have **zero session detection**; login has **no returnTo** (pure role redirect). "Issue reports" = the `snags` table; **no anonymous INSERT path exists** (correct today). Turnstile captcha is already integrated in Login. `documents` bucket was flipped public (`20251027082859`); `issue-screenshots` bucket is private.
- Deploy reality: no CI; Vercel auto-builds frontend from `main`; migrations applied manually via Management API (`database/query`, project `oltzgidkjxwsukvkomof`); edge functions via `supabase functions deploy <name>`. The tier-2 anon-read lockdown was applied **only in prod** (`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`) — repo migrations do not reproduce live RLS; verify against prod, not local resets.

## Workstreams

### W1 — Scan logging + analytics

**Capture.** `qr-redirect` inserts a `qr_scans` row (service role) before every 302: validated `subsection_id`, `user_agent` from request header, `ip_address` **truncated to /24** (POPIA-conscious), `source='redirect'`. Failures to log never block the redirect (best-effort, try/catch). Also fix the existing settings read to `ORDER BY created_at LIMIT 1` to match the RPCs.

**Presence.** Once W4 makes the landing session-aware: signed-in visitors log a second row `source='landing'` with `scanned_by = auth.uid()` via a new authenticated INSERT policy. Analytics counts `source='redirect'`; proof-of-presence queries `scanned_by IS NOT NULL`.

**Migration `qr_scans_hardening`:**
- `ADD COLUMN source text NOT NULL DEFAULT 'redirect' CHECK (source IN ('redirect','landing'))`
- Indexes: `(subsection_id, scanned_at DESC)` and `(scanned_at DESC)`
- **Drop** `"Anyone can insert scans"` (closes the open spam surface — redirect writes via service role and doesn't need it); add INSERT policy `TO authenticated WITH CHECK (scanned_by = auth.uid() AND source = 'landing')`
- Add Admin DELETE policy (makes the existing cleanup calls real instead of silent no-ops)

**Surfacing.**
- Site-scoped: new `src/components/site/QRScanActivity.tsx` in a `SiteDetail` tab next to the existing generate/download tab; per-subsection last-scan + 30d counts + never-scanned list. Rename the misnamed `QRAnalytics.tsx` → `QRCodeManager.tsx` (it generates/downloads; it has no analytics).
- Global: `src/views/QRActivity.tsx` + `src/app/(admin)/qr-activity/page.tsx` + sidebar entry (reuses `QrCode` icon), cross-site rollup.
- Dashboard: one stat tile (scans last 30d) added to the existing `Promise.all` fetch pattern.
- Reads use the existing authenticated SELECT policy; no RPC needed.

**Accepted risk:** no per-IP rate limiting on scan inserts in v1 (service-role insert, bounded row size, indexed). Revisit if abuse appears.

### W2 — Live verdict on the public landing page

**Endpoint.** Extend `get_public_subsection` (CREATE OR REPLACE, same migration discipline: curated whitelist only) with a `verdict` object:

| field | source | note |
|---|---|---|
| `coc_required` | `subsections.is_coc_required` | card hidden when false |
| `status` | `subsections.coc_status` | `Missing\|Pending\|Pass\|Fail\|N/A` |
| `cert_number` | `subsections.coc_number` | |
| `issue_date` | `subsections.coc_issue_date` | |
| `expiry_date` | latest COC doc `coc_expiry_date` | display-only, never changes the badge state |
| `reviewed_at` | `subsections.coc_reviewed_at` | shown as "verified on" |

**Deliberately NOT exposed:** `coc_failure_reasons` / register `reasons` (may contain internal language), issuer identity (no column exists), SANS rule grid. Neutral public fail copy is fixed in the frontend: *"Not compliant — remedial work in progress."*

**UI states** (banner atop `PublicSubsection`, evidence list below):
- `Pass` → green "✓ Compliant", cert no + issued + expiry dates
- `Pass` with `expiry_date < today + 30d` → green badge with amber sub-line *"COC expiry date approaching — re-verification pending"* (register-truth: expiry is a hint, not a verdict)
- `Fail` → red "✕ Not compliant — remedial work in progress", reviewed-on date, Report-an-issue button (W4)
- `Pending` → grey "Verification in progress"
- `Missing` (and required) → grey "No COC on record yet"
- not required / `N/A` → no verdict card (today's page)

**Go-live gate:** ships in the same release train but only *after* `20260725100000_coc_register_truth.sql` is applied in prod (release order, below). The RPC extension is additive and backward-compatible, so migration-before-frontend ordering is safe.

### W3 — Verification QR (pivoted: COCs are uploaded, not generated)

The original "QR printed on the COC itself" is infeasible — WM does not author the certificate document. The pivot has three parts:

1. **Free upgrade via W2:** every already-printed subsection QR *becomes* a verification QR the moment W2 ships — scanning yields the live register verdict for that subsection. No reprints.
2. **Site register page:** new public route `/public/sites/[siteId]/register` (+ view) backed by new anon RPC `get_public_site_register(p_site_id uuid)`: site name, per-status counts (pass/fail/pending/missing over COC-required subsections), last register import date. Answers "is this printed report still current?" at site level. Same SECURITY DEFINER/whitelist discipline; UUID-scoped, no token.
3. **Cover QRs on WM reports:** wire the existing unused `qrCodeDataUrl` cover slot for the **Site COC Report** and **Site Summary Report**, encoding a new site-level redirect (`qr-redirect?site=<uuid>` branch added to the edge function → 302 to the register page) so printed reports stay domain-change-proof like subsection codes.

**Dropped from D (with rationale, surfaced for approval):** HMAC-signed QR payloads. Signing only prevents forging *valid URLs on our domain* — which unguessable UUIDs already prevent. It cannot stop a forged sticker pointing at an attacker's look-alike domain (no signature scheme can). No threat model remains that HMAC addresses; documented as a non-goal.

### W4 — Scan-to-action

**Session-aware landing.** `PublicSubsection` gains `useAuthSession` + `useUserRole` (non-blocking; anonymous render unchanged). Signed-in users see a role banner:
- **Contractor** → "Upload COC for this subsection" → `/contractor/subsections/<id>?tab=upload`
- **Admin/Staff** → "Open in admin" → existing `buildActionHref` targets (`?tab=coc-metering`, `?tab=inspections&create=1`)
- **Client** → link to their portal site view

**Contractor upload panel (new build).** `ContractorSubsectionDetail` gains an upload card wired to `poolRouteFile(subsection.site_id, file)` — the existing single-pipe ingestion; assignment stays register-driven. Status feedback mirrors the admin `CocMeteringTab` result copy ("Assigned to…", "Needs attention: …").

**Login bridge (`returnTo`).** Guards (`ProtectedRoute`, `ContractorProtectedRoute`, `ClientProtectedRoute`) redirect to `/auth/login?next=<path>`; `Login.tsx` honors `next` after `redirectByRole` **only if** it is a same-origin relative path with an allow-listed prefix (`/contractor/`, `/clients/`, `/client-portal/`, `/dashboard`, `/sites/`). Anything else falls back to role redirect.

**Public issue report.** "Report an issue" on the landing page opens a minimal form (title, description, optional photos, Turnstile). Submission goes to a **new edge function `report-issue`** (`verify_jwt=false`) that: verifies the Turnstile token server-side, validates the subsection UUID exists, stores photos in the private `issue-screenshots` bucket via service role, inserts a `snags` row (`status='Open'`, `created_by=NULL`, new column `snags.reported_channel text NOT NULL DEFAULT 'internal'` set to `'public_qr'`), and applies a light per-IP throttle (in-function, e.g. 5/minute). Admin views badge public reports via `reported_channel`. No anon RLS on `snags` is ever opened — the function is the only write path.

### W5 — Print & trust

1. **Vector pipeline:** new `src/lib/qrSvg.ts` — `QRCode.toString(..., {type:'svg'})` composed with logo + **real text labels** as SVG elements (kills the rasterized-label staleness class). PDF side consumes pdfmake `svg` nodes. Canvas/PNG path retained for the stored `qr_code_url` thumbnails.
2. **Sticker sheets:** wire the dormant `'qr-sheet'` ReportType + `createQRCodeGrid` in `pdfEngine.ts` into a real "Print sticker sheet" action (A4 grid, fixed physical sizes, cut margins) in the renamed `QRCodeManager` and the global QR Codes page.
3. **Kill-switch:** migration adds `subsections.qr_disabled boolean NOT NULL DEFAULT false`; `qr-redirect` checks it and 302s to a new lightweight `/public/qr-retired` page; admin toggle in the QR manager.
4. **Rename regeneration:** `handleSaveEdit` in `useSubsectionDetail.ts` fires `generateAndUploadQRCode` when `name` changed (same fire-and-forget pattern as create).
5. HMAC signing: dropped (see W3 rationale).

## Schema/deploy inventory (all applied via Management API, files in repo for record)

| # | Migration | Contents |
|---|---|---|
| 1 | `qr_scans_hardening` | source col, 2 indexes, drop anon INSERT, authenticated INSERT policy, Admin DELETE policy |
| 2 | `public_verdict_rpc` | CREATE OR REPLACE `get_public_subsection` (+verdict), new `get_public_site_register` |
| 3 | `qr_killswitch_and_snag_channel` | `subsections.qr_disabled`, `snags.reported_channel` |

Edge functions touched: `qr-redirect` (scan logging, site branch, kill-switch, ORDER BY fix), new `report-issue`. Both `verify_jwt=false` (config.toml).

## Release order (production)

1. Land **PR #59**: apply `20260725100000_coc_register_truth.sql` via Management API → merge → post-deploy E2E (already owed).
2. Apply QR migrations 1–3 via Management API (additive; old frontend unaffected).
3. Merge `feat/qr-platform` PR → Vercel auto-deploys frontend.
4. `supabase functions deploy qr-redirect` and `supabase functions deploy report-issue`.
5. Live E2E: curl the redirect (assert 302 + scan row), scan a real printed code, verify all five verdict states via seeded/known subsections, submit a Turnstile-gated public issue, confirm analytics tiles populate, verify kill-switch and sticker-sheet print.

## Testing

- Vitest for lib-level logic: verdict-state mapping (incl. expiry-hint boundary), `next` param allow-list, qrSvg label composition, sticker-sheet layout math.
- Manual dev-server verification of the landing states, role banners, contractor upload, and public form (Turnstile test keys) before PR.
- Migration SQL reviewed against **live prod RLS state** (tier-2 lockdown is prod-only; local resets lie).

## Out-of-scope security observations (flagged separately, not in this build)

- `settings` write policies regressed to any Staff user (Admin-only intent) — `qr_base_url` is a redirect-integrity vector.
- Open signup defaults every new user to Staff (`'User'` role).
- `qr-redirect` legacy name-match branch does a cross-tenant `ilike` on subsection names.

## Non-goals

Lifecycle-aware landing, asset-level QR register, NFC tags, emergency-info landing, scan-to-login/pairing, HMAC payload signing, issuer-name or failed-on-date schema additions, per-certificate QRs inside the Site COC Report table (site-level cover QR instead).
