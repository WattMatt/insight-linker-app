# Phase 1 — Security & Access Control Review (Full-App Review, 2026-06-10)

Scope: new phase-1 RPC migration, effective RLS state (138 migrations replayed), all token-gated/public pages, all 28 edge functions. Every finding below was independently verified by an adversarial second pass against the cited code; findings already covered by `2026-06-09-auth-access-security-audit.md` (C1–C3, H1–H6, M1–M7) are excluded unless they add an undocumented dimension.

---

## Confirmed new vulnerabilities

# Vuln 1: Cross-tenant compliance overwrite via `validate-coc`: `supabase/functions/validate-coc/index.ts:907,935,1611-1614,1658-1694`

* Severity: High (confidence 9/10)
* Category: authz_bypass / IDOR (write)
* Description: `verify_jwt=true` authenticates the caller but the handler performs no role or ownership check. It takes `subsectionId`/`documentId` from the request body, uses a service_role client (bypasses RLS), and the JWT is used only to populate `validated_by`. It then UPDATEs `subsections` (`is_compliant`, COC fields) and upserts `coc_validations` keyed to the attacker-chosen subsection. The 2026-06-09 audit treated this function as safe because it is authenticated; the write-side IDOR is undocumented.
* Exploit Scenario: Any logged-in client or contractor POSTs `{documentId, documentUrl, subsectionId: <victim subsection>}` and overwrites another tenant's compliance state. Victim UUIDs are harvestable today via the still-live anon SELECT policies (audit C2), so unguessable-UUID protection does not apply.
* Recommendation: After `getUser`, resolve role + tenancy and verify the caller has access to `subsectionId` before any service_role write; reject client-portal tokens entirely.

# Vuln 2: Unauthenticated COC file read + extraction poisoning via `extract-coc`: `supabase/functions/extract-coc/index.ts:913,960-980,1235-1255`

* Severity: High (confidence 8/10)
* Category: data_exposure / IDOR (read+write)
* Description: `verify_jwt=false` with zero auth handling. Caller-supplied `documentUrl` is split on `/documents/` and downloaded via service_role from the shared `documents` bucket; AI-extracted COC contents are returned in the HTTP response. It also upserts attacker-controlled rows into `coc_extractions`, and `extracted_by` is taken straight from the request body (forgeable attribution). Audit H2 covers the read framing generically; the poisoning write and forged attribution are undocumented.
* Exploit Scenario: An unauthenticated attacker submits any tenant's storage URL and receives the parsed certificate contents (cert numbers, electrician identity/contact, addresses), and/or overwrites the extraction row for any document.
* Recommendation: Set `verify_jwt=true`, add role + ownership checks before download or write, derive `extracted_by` from the verified JWT, stop deriving storage paths from raw caller URLs.

# Vuln 3: Full client-directory PII dump via fail-open `templates` function: `supabase/functions/templates/index.ts:347,354-356,370,514-520`

* Severity: High (confidence 8/10)
* Category: data_exposure / authn fail-open
* Description: `verify_jwt=false`; the only gate is `if (expectedApiKey && authHeader !== ...)` — skipped entirely when `DOCBUILDER_PUBLIC_TOKEN` is unset (fail-open, also non-constant-time). The service_role handler then selects ALL clients including `email` and `contact_person` and returns them, plus cross-tenant sites/subsections/inspections/COC data. Audit H3 documents the fail-open pattern as template read/write; the client PII dump is undocumented — and the endpoint does not need the clients table at all.
* Exploit Scenario: If the env var is unset in production, one unauthenticated GET returns every client's name, email and contact person across all tenants.
* Recommendation: Fail closed (mandatory secret, constant-time compare) or require Admin JWT; remove the clients query from the endpoint regardless.

# Vuln 4: `clients` and `coc_validations` fully writable by any authenticated user: `supabase/migrations/20251120080517_643a23ca-*.sql:199-203,129-137`

* Severity: High (confidence 8/10)
* Category: broken access control (cross-tenant write)
* Description: Both tables carry `FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)` with no `TO` clause; the earlier role-scoped policies on `clients` were dropped in the same migration. No later migration supersedes this. Audit H4 covers only `user_clients`/`user_sites`; M6's generic sweep keys on a different predicate and names no tables — these two are not individually documented. `clients` is the tenant root holding client PII; `coc_validations` holds compliance verdicts.
* Exploit Scenario: Any authenticated principal (client-portal user, contractor) can INSERT/UPDATE/DELETE any client record or any compliance validation via the REST API, e.g. `supabase.from('clients').delete().neq('id', x)`.
* Recommendation: Replace with Admin-manage + role-scoped read policies, mirroring the `has_role` pattern used on `sites`/`subsections` (migration `20251120110544`).

# Vuln 5: `coc_extractions` writable by anonymous users: `supabase/migrations/20260113062636_77327e63-*.sql:9-40`

* Severity: High (confidence 8/10)
* Category: broken access control (anon write)
* Description: INSERT allows `extracted_by IS NULL` (anon passes); UPDATE and DELETE use an `EXISTS` row-existence predicate that never references `auth.uid()` — true for every caller including anon. No `TO` clause → applies to PUBLIC. Not mentioned anywhere in the existing audit, and the pending tier-2 lockdown only drops SELECT policies — these writes survive tier-2.
* Exploit Scenario: With the shipped anon key: `POST /rest/v1/coc_extractions` (body `extracted_by: null`) forges extraction data; `PATCH`/`DELETE /rest/v1/coc_extractions?id=eq.<uuid>` tampers with or wipes any tenant's AI-extracted COC data.
* Recommendation: Drop the three PUBLIC write policies; replace with `TO authenticated` policies scoped through the user→site relationship, `WITH CHECK (auth.uid() = extracted_by)` on INSERT.

# Vuln 6: Token scope check skipped for client tokens on subsection review: `src/views/PublicSubsectionReview.tsx:197-201,361-369`

* Severity: Medium (High data sensitivity; confidence 8/10)
* Category: broken object-level authorization
* Description: The guard `if (linkData.site_id && subsectionData.sites.id !== linkData.site_id)` only runs when `link.site_id` is truthy. Client-type tokens have `site_id = null`, so ANY `subsectionId` in the URL renders — including full inspection `json_data`, photos and signatures fetched with no scope filter. No DB-side enforcement exists. Currently subsumed by audit C2 (anon can read tables directly), but this stands independently after the tier-2 lockdown: no phase-1 RPC covers this view, so the scoping gap must be closed in the DB during the repoint.
* Exploit Scenario: A holder of client A's portfolio token opens `/review/<token>/subsection/<any-uuid>` and reads another client's complete inspection report.
* Recommendation: Replace the data path with a SECURITY DEFINER RPC that validates the subsection→site→client chain against the token.

# Vuln 7: Portfolio drill-down loads arbitrary `siteId` unchecked: `src/views/PublicSiteReview.tsx:188,192-204`

* Severity: Medium (confidence 8/10)
* Category: IDOR / broken object-level authorization
* Description: `const targetSiteId = routeSiteId || link.site_id;` — for client-type tokens `link.site_id` is null, so the URL's `siteId` is used with only `.eq('id', targetSiteId)` and no `client_id = link.client_id` constraint, then subsections/snags/documents/inspections load off the same unconstrained id. Same moot-now/standing-after-tier-2 structure as Vuln 6.
* Exploit Scenario: `/portfolio/<client-A-token>/site/<client-B-site-uuid>` renders client B's site in full.
* Recommendation: `get_public_portfolio_site(p_token, p_site_id)` RPC returning rows only when the site's `client_id` matches the link's.

---

## Functional bugs found during this pass (routed to fix list, not vulnerabilities)

# Bug 1: COC/compliance content STILL RENDERED on public token pages despite removal commits

* Files: `src/views/PublicSubsectionReview.tsx:503-557` (coc_status badge, coc_number, coc_issue_date, coc_type, meter_serial_number — unconditional), `src/views/PublicSiteReview.tsx:620-622` ("COC: {status}" badge)
* Commits 2b77291/3a2b0d8 removed one COC block per file but missed a second block. The business decision "no compliance content on client/public views" is not actually in effect on the token-gated review pages.
* Also: dead weight from the same removal — `PublicSubsection.tsx` still fetches `coc_validations.select('*')` into state that is never read (orphaned imports `FAILED_VALIDATION_STATUSES`/`hasValidCocStatus`), and `PublicClientPortfolio.tsx` computes an unused `failedCount`. Queries still `select('*')` so COC fields ship on the wire even where unrendered (binding fix is the tier-2 policy drop; query narrowing is hygiene, not a boundary).

# Bug 2: Invite acceptance sets access token as refresh token

* File: `src/views/Auth.tsx:43,85-88`
* `setSession({ access_token: accessToken, refresh_token: accessToken })` — the hash fragment carries a genuine `refresh_token` but it is never read. Session works initially, then the first silent refresh (~1 hour) fails and logs the invited user out. Fix: parse and pass the real `refresh_token`.

---

## Status notes

1. **Phase-1 RPC migration is correct but inert.** `get_public_subsection`/`get_public_portfolio` are well-built (parameterized, `search_path` pinned, least-privilege grants, server-side token expiry/revocation checks, tenant-scoped, no COC fields) — but zero call sites exist in `src/`. All four public views still read tables directly with the anon key, so the migration currently provides no protection and tier-2 cannot be applied without breaking the public pages. Required sequence: repoint QR + portfolio listing to existing RPCs → add scoped RPCs for the two drill-down views (closes Vulns 6–7) → apply tier-2.
2. **Audit doc is stale on H6 (self-signup).** Client-side signup is now closed (invite-only notice, `signInWithOtp({shouldCreateUser:false})`). Residual risk is server config only — confirm `enable_signup=false` in the Supabase project so the REST `/signup` endpoint is closed regardless of UI.
3. **Dropped findings:** `inspection_relink_audit`/`access_link_visitors` anon INSERT (low impact, log-forging only; visitors insert is intentional); `api-reports` having no tenant scoping (intended global B2B OAuth API per `APPLICATION_SPEC.md:1451` and `AUDIT_BASELINE.md:123`).
4. **Caveat:** RLS state is reconstructed from migration files; confirm Vulns 4–5 against the live DB with the anon key / a non-admin session before and after the fix.

## Fix plan — status (2026-06-10)

1. **DONE** — `supabase/migrations/20260610120000_phase1_write_lockdown.sql`: dropped the anon write policies on `coc_extractions` and the `FOR ALL auth.uid() IS NOT NULL` policies on `clients`/`coc_validations`; replaced with a "staff" write boundary (authenticated AND NOT Contractor AND NOT Client) that mirrors `src/components/ProtectedRoute.tsx`. Read-side untouched (handled by tier-2). Closes Vulns 4, 5. *Needs live verification per the queries in the migration footer before relying on it.*
2. **DONE** — edge functions hardened (Vulns 1-3): `validate-coc` now 401s on missing/invalid JWT and 403s unless Admin (or Contractor assigned to the subsection's site), and verifies `documentId` belongs to `subsectionId`; `extract-coc` set to `verify_jwt=true` with the same auth/ownership checks and `extracted_by` taken from the verified JWT; `templates` now fails closed when `DOCBUILDER_PUBLIC_TOKEN` is unset (503), uses constant-time compare, and no longer returns the clients table / PII. Files: `supabase/functions/{validate-coc,extract-coc,templates}/index.ts`, `supabase/config.toml`.
   - **Deploy caveats:** confirm `DOCBUILDER_PUBLIC_TOKEN` is set before deploying (else `templates` 503s); the external DocBuilder consumer now receives `clients: []`. `User`/`Moderator` staff are allowed; Client/Contractor are 403 on COC functions.
3. **DONE** — Bug 1: removed the residual COC rendering (status badge, COC number/issue-date/type) on `PublicSubsectionReview.tsx` and the `COC: {status}` badge on `PublicSiteReview.tsx`, plus the now-orphaned COC helper functions. (Metering card left intact — metering ≠ compliance content. Non-rendering dead `select('*')`/`failedCount` left for the RPC repoint, where those queries change anyway.)
4. **DONE** — Bug 2: `Auth.tsx` invite flow now reads and passes the real `refresh_token` from the URL hash instead of reusing the access token.
5. **GATED — Vulns 6, 7 + the still-open anon table reads (C2):** repointing the four public views to scoped SECURITY DEFINER RPCs and then applying the tier-2 anon-read lockdown. This is a single coordinated DB+frontend rollout that must be verified against a running environment before tier-2 is applied (the report's own sequencing). A purely client-side scope check would be discarded by the repoint and is not a real boundary, so it was not added. Awaiting decision on how to run this.

All code changes typecheck-clean relative to the pre-existing baseline (no new `tsc` errors).
