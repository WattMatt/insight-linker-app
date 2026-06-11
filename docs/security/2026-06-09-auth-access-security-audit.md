# Security Audit — User Access, Login, Password Reset & Client Portal Sharing

**Audited:** `insight-linker-app` (Supabase backend + Vite/React/TS frontend, Capacitor mobile)
**Supabase project:** `oltzgidkjxwsukvkomof`
**Date:** 2026-06-09
**Standard:** OWASP Top 10 (2021), Supabase/Postgres-specific checks
**Method:** Evidence-based review of all 135 `supabase/migrations/`, 25 edge functions, `config.toml`, `Auth.tsx`, route guards, and the public/token portal pages. State reported is the **final effective state** after migration churn (later migration wins). The definitive source of truth is the **live database** — see "Verification still required" at the end.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 6 |
| MEDIUM | 7 |
| LOW | 5 |

**Overall Risk Rating:** CRITICAL
**Ship readiness:** **DO NOT SHIP / CURRENTLY EXPOSED.** The public `anon` API key — which ships inside the client JS bundle and is therefore known to anyone — currently grants **read access to essentially the entire dataset**, **read/write/delete on every file in storage**, and the ability to **harvest every "private" share-link token**. Row-Level Security is *enabled* on every table, but it is *neutralised* by blanket `USING (true)` policies, which gives a false sense of safety.

### The one-paragraph version
A series of migrations added `USING (true)` / `TO anon` `SELECT` policies to whole tables (to make the public review/QR pages work), and one migration opened `storage.objects` entirely. In Postgres, a policy with **no `TO` clause defaults to `PUBLIC`**, which includes the unauthenticated `anon` role, and permissive policies are **OR-combined** — so a single `USING (true)` policy overrides all the carefully-scoped Admin/Client/Contractor policies on the same table. Net effect: the tokenised "client portal" is **security theatre** — the token gates the UI but not the data, because the underlying tables are world-readable with the public key.

---

## CRITICAL Findings

### C1 — Storage is fully open to anonymous users (read / write / delete every file)
**CWE-284/732 · OWASP A01 · CVSS ~9.1 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`)**
**Location:** `supabase/migrations/20251120083932_7add3605-…sql:1-32` (the last migration to redefine storage policies; it bulk-drops all prior policies then creates these)
```sql
CREATE POLICY "Anyone can view all storage"      ON storage.objects FOR SELECT USING (true);
CREATE POLICY "Anyone can upload to all storage" ON storage.objects FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update all storage"    ON storage.objects FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete from all storage"ON storage.objects FOR DELETE USING (true);
```
No `TO` clause → `PUBLIC` → the `anon` key can **list, download, overwrite, and delete every file in every bucket** (inspection photos, COC documents, client logos, profile images). An attacker can wipe or tamper with all evidence/photos.
**Fix direction:** Drop these four policies. Re-scope per bucket: authenticated users read/write their permitted buckets; **public-portal images must be served via short-lived signed URLs minted by a token-validating edge function** (not a blanket anon read). This is coupled to the C2/C3 portal redesign below.

### C2 — Anonymous read of the entire core dataset (`USING (true)` / `TO anon` SELECT)
**CWE-200/1220 · OWASP A01 · CVSS ~7.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`) — rated CRITICAL on impact (total confidentiality loss, no auth required)**
**Location:**
- `supabase/migrations/20251015102828_8f5f0c1e-…sql:1-34` — `TO anon USING (true)` SELECT on **subsections, sites, clients, document_categories, subsection_documents**
- `supabase/migrations/20260108071956_61a3cdd4-…sql:5-32` — `USING (true)` SELECT (no role) on **sites, clients, subsections, document_categories, site_documents**
- `supabase/migrations/20260123052442_27d0f826-…sql:1-73` — `USING (true)` SELECT on **coc_validations, inspections, floor_plan_pins, subsection_floor_plans, subsection_documents, site_documents, inspection_templates**
- `supabase/migrations/20260109084016_d57b7c31-…sql:1` — `USING (true)` on **snags**
- `settings` — `"Anyone can view settings" … USING (true)`

Anyone with the URL + public anon key can run `supabase.from('clients').select('*')`, `…from('inspections')…`, etc. and dump **all clients (incl. email/contact PII), sites, subsections, inspections and their `json_data`, snags, COC validations, and document metadata** — across all data. Blind ID enumeration isn't even needed; an unfiltered `SELECT *` returns everything. (IDs are random UUIDs, so the IDs themselves aren't guessable — but that's irrelevant when the whole table is readable.)
**Fix direction:** Drop every `USING (true)`/`TO anon` SELECT policy on these tables. Serve the public portal through a `SECURITY DEFINER` RPC that takes the share token, validates it, and returns only the rows scoped to that token (the pattern the sibling `engi-ops-nexus` app's `CableVerificationPortal` already uses correctly).

### C3 — Anonymous read of all share-link tokens (`client_access_links`)
**CWE-200/639 · OWASP A01 · CVSS ~8.6 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N`)**
**Location:** `supabase/migrations/20260123052614_a764fe2c-…sql:9-12`
```sql
CREATE POLICY "Public can select access_links for validation"
ON public.client_access_links FOR SELECT USING (true);
```
The table stores `access_token` (the secret bearer token for every shared client/site/subsection portal). An anonymous caller can `SELECT * FROM client_access_links` and **harvest every valid token**, then open every shared portal. This is a master-key leak — it defeats the entire sharing mechanism by itself. The policy is also unnecessary: the `validate_access_link()` RPC is `SECURITY DEFINER` and doesn't need it.
**Fix direction:** `DROP POLICY "Public can select access_links for validation"`. Keep validation inside the `SECURITY DEFINER` RPC only.

---

## HIGH Findings

### H1 — `contractor_coc_uploads`: anonymous read **and** write
**CWE-284 · OWASP A01 · CVSS ~8.2**
`supabase/migrations/20260410013045_e3990969-…sql:26-33` — `allow read`/`allow insert`/`allow update`, all `USING (true)`/`WITH CHECK (true)`, no role. Anonymous users can read every contractor COC submission (incl. `contractor_email`, `file_url`) **and** insert/modify arbitrary rows (data forgery).
**Fix:** Replace with token-validated or authenticated-scoped policies.

### H2 — Unauthenticated, RLS-bypassing edge functions
**CWE-862 · OWASP A01/A05**
These functions use the `service_role` key (bypasses all RLS), have **`verify_jwt = false`** in `config.toml`, and perform **no caller check**: `generate-pdf`, `generate-pdf-browserless`, `generate-pdf-pdfmake`, `generate-pdf-google`, `generate-docx-report`, `generate-inspection-pdf`, `fix-inspection-photos`, `extract-coc`. Anyone on the internet can invoke them with a crafted body; they read storage/DB with RLS off and return rendered content.
**Fix:** Set `verify_jwt = true`, or add an explicit role/token check at the top of each handler; scope to the caller.

### H3 — Fail-open authentication in `templates`, `save-template`, `template-sync`
**CWE-697/863**
Each is `service_role` + `verify_jwt = false`, and the token check is **skipped entirely when the env var is unset** (e.g. `save-template:18` `if (expectedApiKey && authHeader !== …)`, `template-sync:14-18` returns `valid:true` with no key). If the secret isn't configured in prod → full unauthenticated read (and write) via service_role. Even when set, comparison is non-constant-time `!==`.
**Fix:** Fail **closed** (mandatory secret), constant-time compare, or move behind `verify_jwt`.

### H4 — `user_clients` / `user_sites` readable & writable by any authenticated user
**CWE-639/732**
`supabase/migrations/20251120080517_643a23ca-…sql:205,212` dropped the per-user/admin policies and replaced them with `All authenticated users full access … USING (auth.uid() IS NOT NULL)`. Any logged-in user (incl. a low-trust Client/Contractor, or a self-registered `User`) can **read and modify the entire user→client and user→site assignment map** — a tenant-isolation and authorization-integrity break (e.g. assign yourself to another client's sites).
**Fix:** Restore admin-manage + self-read-only policies.

### H5 — Leaked plaintext credential committed to git
**CWE-798/259 · CVSS ~7.5**
`supabase/migrations/20260212144831_85c05452-…sql:12,19` — `temp_reset_password()` resets a real account using a hard-coded plaintext password:
```sql
UPDATE auth.users SET encrypted_password = extensions.crypt('Marries@001', …)
WHERE email = 'marries.liesie@gmail.com';
```
The function is `SELECT`ed once then `DROP`ped in the same migration, so it is **not** a live callable backdoor — but `marries.liesie@gmail.com` / `Marries@001` is in git history forever.
**Fix:** Rotate that account's password now. Never reset passwords via committed SQL again — use the admin API.

### H6 — Open self-signup + historical "everyone is Admin" trigger
**CWE-269/862**
Sign-up is reachable and enabled (`Auth.tsx:718-732`; no `enable_signup=false` in config). The `handle_new_user` trigger auto-inserts a `user_roles` row. **Until the 2026-02-14 fix** (`20260214023114_…sql:27`), the prior trigger (`20251020093607_…sql:19-26`) granted **`Admin` to every new user** — tied to the orphaned-inspections incident. Any account created during that window may be Admin.
**Fix:** Audit live `user_roles` for unexpected Admins; decide whether self-signup should be disabled (this is an internal compliance tool — likely invite-only).

---

## MEDIUM Findings

- **M1 — Security-model disclosure via SECURITY DEFINER functions.** `get_rls_policies_for_role()` (`20251120051830_…sql:2-30`) and `validate_api_token()` have default `PUBLIC EXECUTE` (no `REVOKE`), so `anon` can enumerate the entire RLS model / probe tokens. **Fix:** `REVOKE EXECUTE … FROM PUBLIC, anon`.
- **M2 — `send-email` is an open relay for any authenticated user** (`verify_jwt=true` but no role gate; arbitrary `to`/`subject`/`html` via your Gmail). **Fix:** role-gate + rate-limit.
- **M3 — Cross-tenant service_role image functions** (`compress-image`, `batch-compress-images`, `fix-tenant-images`): any authenticated user triggers service_role storage mutations across all tenants. **Fix:** per-user/tenant scoping.
- **M4 — Recovery token in URL query string** (`send-password-reset:65` → `Auth.tsx:31`): `?token=` leaks via server logs and `Referer` before `replaceState` scrubs it. Mitigated by hashing + 1h expiry. **Fix:** use URL fragment (`#`) or POST exchange.
- **M5 — No application-level rate limiting** on login / reset / OTP (`Auth.tsx` handlers; only `disabled={loading}`). Relies solely on Supabase built-ins. **Fix:** add throttle/captcha on auth endpoints.
- **M6 — 85 residual bare-`authenticated` RLS policies.** Core inspection tables were hardened to `has_role`, but ~85 policies still gate only on `auth.role()='authenticated'`. A self-registered `User` satisfies these. **Fix:** per-table RLS sweep.
- **M7 — `CORS: *` on every edge function.** Amplifies H2/H3 — any website can call them from a victim's browser. **Fix:** allow-list app origins, especially on privileged functions.

---

## LOW Findings

- **L1 — Weak password policy.** Minimum 6 chars (`Auth.tsx:271,349`); sign-up enforces no complexity (only the set-password path requires letters+numbers, `:362-366`). Raise to ≥8 + complexity on signup. Partially offset by Supabase breach check (`:386`).
- **L2 — `requires_password_change` lives in client-writable `user_metadata`** (`Auth.tsx:68,402-406`) and is cleared in a non-atomic two-step update — a UX gate, not a security control.
- **L3 — Sign-in error pass-through** (`Auth.tsx:240`) surfaces raw non-credential Supabase errors (minor account-state enumeration). The credential message itself (`:238`) is correctly generic.
- **L4 — `oauth-token` stores/compares `client_secret` in plaintext** (`.eq("client_secret", …)`, `:38`; shown in `src/pages/APIClients.tsx`). Hash at rest.
- **L5 — `.env` is committed and not in `.gitignore`.** Contains only the public anon key today, so nothing is leaked yet — but the next real secret added will be committed. Gitignore `.env`, add `.env.example`.

---

## Secrets Audit
- **No `service_role` key anywhere in `src/`** — frontend uses only the anon/publishable key (`src/integrations/supabase/client.ts`), which is correct by design. ✅
- **No hardcoded third-party secrets** — all (Resend, Gmail, Browserless, PDFShift, Google SA, Lovable/Anthropic) are read via `Deno.env.get(...)`. ✅
- **`.env` committed** — only the public anon key present; no live secret leaked, but hygiene risk (see L5).
- **One real credential leak:** the plaintext password in H5 — rotate.

## Positive Observations (correctly implemented)
- `invite-user` and `delete-user` **correctly enforce an Admin role** before privileged operations — no privilege-escalation hole there.
- `user_roles` (the privilege table) and `profiles` are **correctly owner/admin-scoped** — the classic "roles in a public profiles table" mistake was avoided.
- `has_role`, `get_user_client_id`, `contractor_has_site_access` set `search_path` explicitly (mitigates SECURITY DEFINER search-path hijack) and use parameterised read-only SQL — **no dynamic-SQL injection** in any function.
- Share tokens are **256-bit random** (`encode(gen_random_bytes(32),'hex')`) — not guessable.
- Forgot-password is **not a user-enumeration oracle** (backend returns identical success regardless), and **no tokens/passwords are written to `console.log`**.
- RLS is **enabled on every application table** (the problem is policy content, not missing RLS).

---

## Remediation Roadmap

### Immediate (emergency lockdown — stops the active exposure)
1. **C3** — Drop `Public can select access_links` on `client_access_links`.
2. **C1** — Drop the four open `storage.objects` policies; re-scope (coupled to portal redesign for public images).
3. **C2** — Drop the `USING(true)`/`TO anon` SELECT policies on sites/clients/subsections/inspections/snags/coc_validations/documents/floor-plans/settings/templates.
4. **H1** — Lock down `contractor_coc_uploads`.
5. **H5** — Rotate the leaked account password.

> ⚠️ Items 2-3 will **break the public review / QR / portfolio pages** until the portal data path is rebuilt behind a token-validating RPC (C2 fix direction). Decide: hard lockdown now (brief portal breakage) vs. build the RPC path first then drop. See decision below.

### Next release (within a sprint)
6. **H2/H3** — `verify_jwt`/caller checks on the service_role functions; fail-closed template auth.
7. **H4** — Restore scoped `user_clients`/`user_sites` policies.
8. **H6** — Audit live Admins; decide invite-only signup.
9. **M1** — `REVOKE` PUBLIC execute on the introspection/token functions.
10. **M7** — CORS allow-list.

### Scheduled (within a quarter)
11. M2-M6, plus the full RLS sweep for the 85 residual bare-`authenticated` policies.

### Backlog
12. L1-L5.

---

## Verification still required (before/while remediating)
The above is derived from **migration files in timestamp order**. Migrations can diverge from the live DB (manual dashboard edits, Lovable's apply behaviour). Before trusting any single finding as live, confirm against the running database:
- The fastest definitive check: hit the REST API with the **public anon key** (already in `src/integrations/supabase/client.ts`) and attempt `select` on `clients` / `client_access_links`. If rows return, C2/C3 are confirmed live.
- Query live `user_roles` for the count of `Admin` accounts (H6).
- Confirm `verify_jwt` per function in the deployed project settings (H2/H3).

## Note: two sibling apps
Some routes initially associated with this app (`/generator-report/:token`, `/p/:code`, `/cable-verification`, `/handover-client`, `ContractorReviewPortal`) actually live in a **separate sibling repo, `engi-ops-nexus`**. That app mostly implements token-gated sharing **correctly** (token-as-row-filter + token-gated RLS, or SECURITY DEFINER RPCs) and is a good reference for fixing this one. The findings in this report are all confirmed within `insight-linker-app`.
