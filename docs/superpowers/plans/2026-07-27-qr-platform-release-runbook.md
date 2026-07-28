# QR Platform — Production Release Runbook

**Branch:** `feat/qr-platform` · **Target:** production (watsonmattheus.com, Supabase project `oltzgidkjxwsukvkomof`)
**Prepared:** 2026-07-27 · Depends on: PR #59 (`feat/coc-register-truth`) landing first.

## Pre-flight (all green as of prep)

- `npx tsc --noEmit` → 171 errors (pre-existing baseline; QR work adds none)
- `npx vitest run` → 495 tests pass (incl. new `publicVerdict`, `loginNext`, `qrSvg` suites)
- `npm run build` → succeeds; new routes present: `/public/sites/[siteId]/register`, `/public/qr-retired`, `/qr-activity`
- Two-stage review complete on every task; 12 review-found issues fixed (4 would have been prod/security incidents).

## Migrations to apply (Management API `database/query`, NOT `supabase db push`)

Apply in timestamp order. All are idempotent (safe to re-run). Files are in `supabase/migrations/` for record only.

1. `20260727100000_qr_scans_hardening.sql` — source column, indexes, RLS rework on `qr_scans`.
2. `20260727101000_public_verdict_rpcs.sql` — extends `get_public_subsection`, adds `get_public_site_register`. **Order gate:** apply only AFTER PR #59's `20260725100000_coc_register_truth.sql` is live, so public verdicts reflect expiry-is-display-only semantics.
3. `20260727102000_qr_killswitch_snag_channel.sql` — `subsections.qr_disabled`, `snags.reported_channel`.

Each is additive and backward-compatible with the currently-deployed frontend, so migrations-before-merge is safe.

## Edge-function secret (before deploying report-issue)

```bash
supabase secrets set TURNSTILE_SECRET_KEY=<value> --project-ref oltzgidkjxwsukvkomof
```
Value = the Cloudflare Turnstile **secret** key (server-side pair of `NEXT_PUBLIC_TURNSTILE_SITE_KEY`). Do NOT commit it. Also confirm `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set in the Vercel **Production and Preview** environments — the public issue form is captcha-gated only when that var is present (it degrades to disabled otherwise).

## Release order

1. **Land PR #59:** apply its `20260725100000_coc_register_truth.sql` via Management API → merge → run its owed post-deploy E2E.
2. **Apply QR migrations 1–3** (above) via Management API in order.
3. **Set the Turnstile secret** (above).
4. **Merge `feat/qr-platform`** → Vercel auto-builds/deploys the frontend from `main`.
5. **Deploy edge functions:**
   ```bash
   supabase functions deploy qr-redirect --project-ref oltzgidkjxwsukvkomof
   supabase functions deploy report-issue --project-ref oltzgidkjxwsukvkomof
   ```
   (Both are `verify_jwt = false` per `supabase/config.toml`.)

## Post-deploy live E2E checklist

- [ ] `curl -sI "https://oltzgidkjxwsukvkomof.supabase.co/functions/v1/qr-redirect?path=<known-subsection-uuid>"` → `302` with `Location: .../public/subsections/<id>`.
- [ ] Confirm a `qr_scans` row appeared for that scan (`source='redirect'`, `ip_address` truncated to /24).
- [ ] Load a **Pass**, a **Fail**, and a **Pending** subsection's public page → verdict card renders the right state with neutral fail copy (no raw failure reasons).
- [ ] Scan a printed subsection sticker on a phone → lands on the live verdict page.
- [ ] Toggle a subsection's kill-switch in QR Codes admin → re-`curl` the redirect → `302` to `/public/qr-retired`.
- [ ] Submit a public "Report an issue" (with a real Turnstile challenge) → snag created with `reported_channel='public_qr'`, photos in `inspection-photos/public-issue-reports/...`.
- [ ] Sign in as staff/contractor, open a public subsection page → role banner appears; a `qr_scans` row with `source='landing'`, `scanned_by=<uid>` is written.
- [ ] Generate a Site COC Report and a Site Summary Report → cover carries a QR that resolves (`?site=<uuid>`) to the site register page.
- [ ] Print a sticker sheet from QR Codes admin → vector QR + real text labels, crisp when zoomed.
- [ ] Dashboard scan tile, site scan-activity panel, and `/qr-activity` populate.
- [ ] Rename a subsection → its stored QR PNG label regenerates.

## Rollback notes

- Frontend: revert the merge commit → Vercel redeploys previous `main`.
- Edge functions: redeploy the previous versions (`qr-redirect` had no functional dependency on the migrations for its legacy behavior; `report-issue` simply becomes unreachable if the frontend is rolled back).
- Migrations are additive; no down-migration required for rollback (columns/RPCs left in place are inert without the frontend). If removal is ever needed, drop the two new columns, the two RPCs (restore `get_public_subsection` from `20260610113000`), and revert `qr_scans` policies.

## Out-of-scope security follow-ups (flagged as separate task chips, not in this release)

- `settings` write policies regressed to any Staff user (Admin-only intent) — `qr_base_url` integrity.
- Open signup defaults new users to the Staff `'User'` role.
- `qr-redirect` legacy name-match branch does a cross-tenant `ilike`.
