# Phase 2 Security Findings (2026-06-11)

59 security flags from the Phase-2 review (26 edge functions + 52 routes), grouped by root cause.
The completeness critic independently verified 8/8 sampled auth claims and 10/10 citations.
Severities are the reviewing agents'. Citations are `file:line` from the code as reviewed.
Tracked at theme level in [GAPS.md](GAPS.md) (G-SEC-12…15); this doc is the full inventory.

> ⚠️ **The single most important finding** is the CRITICAL chain (§B.0): open signup + the
> `handle_new_user` default `User` role + `User` `FOR ALL` manage-all policies = any internet
> user can self-register and read/write every tenant's data. Disabling signup (G-SEC-01) is the
> #1 emergency; the RLS redesign (§B) is the deeper fix.

---

## A. Unauthenticated / under-authenticated service-role edge functions
The `create-user-admin` pattern, repeated. Most are `verify_jwt=false` OR `verify_jwt=true` (which the **public anon key satisfies**), with no in-handler auth, holding the service-role key.

**HIGH**
- **save-template** — fail-open guard (`if (expectedApiKey && authHeader !== …)`, index.ts:18); when `DOCBUILDER_PUBLIC_TOKEN` unset → fully unauth privileged INSERT/UPDATE/DELETE on `inspection_templates`; verify_jwt=false (config.toml:35); service-role, no tenant scoping.
- **template-sync** — same fail-open (`validateSyncKey`, index.ts:14-18) on `DOCBUILDER_SYNC_KEY`; verify_jwt=false (config.toml:44); privileged template writes.
- **generate-pdf** — anon-reachable (verify_jwt=false, config.toml:46-47); service-role INSERT into `site_documents` with body-supplied `site_id`/`file_url` (index.ts:3045); attach arbitrary URLs to any site.
- **generate-inspection-pdf** — anon-reachable (verify_jwt=false, config.toml:76-77); service-role INSERT into `document_categories`/`subsection_documents` keyed on body `subsectionId`; `uploaded_by` spoofable (index.ts:1654,1672,1676).
- **fix-inspection-photos** — verify_jwt=false (config.toml:58-59), no auth; **unauth POST with empty body mutates `inspections.json_data` across all tenants** via fuzzy heuristic (index.ts:95-100,182-221).
- **fix-tenant-images** — verify_jwt=true (anon key satisfies), service-role, no auth, no dryRun/limit; anon triggers **forced cross-tenant rewrite of every tenant's photo URLs** (index.ts:41-44,151-154).
- **detect-schematic-regions** — verify_jwt=false (config.toml:55-56), no auth; unauth proxy to paid LLMs (`LOVABLE_API_KEY` index.ts:90-116, `ANTHROPIC_API_KEY` :135-165) → credit burn.
- **offline-review** — verify_jwt=false (config.toml:24-25), no auth, CORS `*`; unauth burn of `LOVABLE_API_KEY` (index.ts:16,110-125).

**MEDIUM**
- **send-email** — open email relay: verify_jwt=true satisfied by anon key, no caller auth / rate limit / recipient restriction; any anon-key holder sends attacker-controlled to/subject/html from the org Gmail (config.toml:21-22; index.ts:18-77).
- **generate-pdf-google** — anon-reachable (config.toml:70-71); drives org Google service account (`GOOGLE_SERVICE_ACCOUNT_JSON`) to create Docs + upload Drive files set anyone-reader (index.ts:165,210-213,431). No in-repo caller.
- **generate-pdf-browserless** / **generate-pdf-pdfmake** / **generate-docx-report** — anon-reachable (config.toml:49-50/52-53/67-68); service-role write of arbitrary files into the public `documents` bucket. **No in-repo callers (dead but live endpoints).**
- **compress-image** / **batch-compress-images** — verify_jwt=true satisfied by anon key; service-role upload (upsert) to caller-controlled bucket/path; unbounded recursive list (index.ts:141-146 / 122,152-154,261-266) → arbitrary-bucket write + cost amplification.
- **oauth-token** — `client_secret` stored & compared plaintext, non-constant-time `.eq()` (index.ts:36-37); `api_clients` compromise → directly usable secrets.
- **api-reports** — IDOR: any api_client with `reports:read` fetches ANY subsection/site/inspection/floor_plan by id; queries filter on request id only, never caller's `client_id` (index.ts:148,155,190,218,263,299), service-role.

**LOW**
- **qr-redirect** — verify_jwt=false, service-role; name-fallback `ilike` scan over all subsections + 302 leaks `subsection_id` (index.ts:130-133) — enumeration oracle (ids only).
- **verify-fix** — verify_jwt=true (anon key), no admin check; anon-key holder drives `LOVABLE_API_KEY` spend (index.ts:37,103-110).
- **log-auth-event** — verify_jwt=false; anon writes arbitrary ANON-type audit rows (pollution) within 20/min (index.ts:112-141).
- **invite-user** — cleartext `temporaryPassword` returned in JSON + console.log on the temp-password path (index.ts:189,353-355).
- **extract-coc** — Admin may pass arbitrary `documentUrl`; handler does `fetch(sourceUrl)` directly (index.ts:1069) — Admin-only SSRF-flavoured surface.

---

## B. RLS lacks tenant/role scoping (the "any authenticated user" model)

### B.0 — CRITICAL chain (verified 2026-06-11)
Open signup (`/auth/v1/settings → disable_signup:false`, G-SEC-01) **+** `handle_new_user` assigns `'User'` to every signup except the first (migration: "Fix handle_new_user to assign 'User' role by default", :21-27) **+** `User` role `FOR ALL` manage-all on sites/subsections/inspections/snags (20251120111033_…:4-56) = **any internet user can self-register and read/write all tenants' core data.**

### B.1 — HIGH (broken authorization on specific surfaces)
- **/settings** — `settings` UPDATE/INSERT gated only by `auth.role()='authenticated'`; any logged-in user rewrites company_name/qr_base_url/branding (rls-policies-04.md:136-145; Settings.tsx:75-127). `adminOnly` sidebar flag is cosmetic.
- **/inspection-templates (+/new,/edit)** — `inspection_templates` RLS is `FOR ALL USING/CHECK auth.uid() IS NOT NULL`; any authenticated principal reads/writes/deletes all templates (rls-policies-02.md:202; TemplateBuilder.tsx:184-195).
- **/validation-feedback** — `validation_feedback` `FOR ALL` any-authenticated; read all feedback + update status (rls-policies-06.md:60; ValidationFeedback.tsx:66-74).
- **floor-plan tab** — `floor_plan_pins`/`subsection_floor_plans`/`floor_plan_pin_comments`/`document_categories` all blanket `FOR ALL` true; any authenticated reads+writes any tenant's pins/comments (rls-policies-02.md:103,123, -03.md:273, -05.md:118; InteractiveFloorPlan.tsx:184-457).
- **/sites, /inspections + detail tree** — `User` role (signup default) `FOR ALL` manage-all; routes scope only by URL param (Sites.tsx:58, Inspections.tsx:82-84) with no DB tenant boundary.
- **client-portal (all 5 routes)** — tenant isolation is client-side only: post-tier-2 `auth_read_* USING(true)` on sites/subsections/inspections/snags/documents/clients/calendar_events; the `.eq('client_id',…)` filters are the SOLE boundary; any authenticated Client reads all tenants via a crafted query (rls-policies-05.md:26,137; -04.md:61,201; -03.md:107).
- **/client-portal/sites/[siteId]** — subsections/documents/inspections queries filter only by `siteId`, `enabled:!!siteId`, so a FOREIGN siteId returns data despite "Site not found" UI (ClientPortalSiteDetail.tsx:73-145).

### B.2 — MEDIUM
- **calendar_events** — blanket `FOR ALL auth.uid() IS NOT NULL`; any authenticated incl. Client/Contractor mutates any site's events, keyed by free-text `site_name` (Calendar.tsx:211-245; rls-policies-01.md:135).
- **inspection_signatures** — `FOR ALL` true/true; any authenticated writes/deletes sign-off signatures on any inspection (rls-policies-02.md:162; SignatureCapture.tsx:159,198).
- **client_access_links** — `auth_read_client_access_links SELECT TO authenticated USING(true)`; any staff reads every tenant's access-token strings (rls-policies-01.md:163; AccessLinkGenerator.tsx:100-107).
- **subsections/inspections cross-tenant read** — `auth_read_*` USING(true); contractor opens any subsectionId/inspectionId regardless of assignment (ContractorSubsectionDetail.tsx:21-48; rls-policies-02.md:234, -05.md:135).
- **site_document_categories** — no tracked RLS policy in 02-data-model; staff insert/delete enforcement unverifiable (SiteDetail.tsx:206-302).
- **cascade deletes** — client-issued DELETEs across child tables guarded only by `confirm()` + per-table delete RLS (SiteDetail.tsx:357-388; useSubsectionDetail.ts:1052-1064).

### B.3 — LOW
- **/users** — admin cross-user `profiles` UPDATE is a silent no-op (only own-row policy, rls-policies-03.md:64): updates to other users affect 0 rows while UI reports success — integrity gap.
- **/offline-sync-test**, **/pdf-template-tests** — `adminOnly` is cosmetic; any staff role loads them; cross-client data visible (OfflineSyncTest.tsx:102-154).
- **shared component boundaries** — InspectionDetail.tsx serves both admin & contractor routes, discriminated by URL param only (:105); relies on RLS + layout guard.

---

## C. Public storage buckets (the tier-2 lockdown did NOT touch storage)
**HIGH**
- **`documents` bucket** — `public=true` (triggers-enums-storage.md:112) with blanket anon SELECT/INSERT/UPDATE/DELETE `storage.objects` policies `USING(true)` (:135-145); every report URL world-readable AND anon-writable/deletable. All six PDF functions write here.
- **`inspection-photos` + `site-images` buckets** — 4 blanket "Anyone can …" policies, no bucket/role filter; any anon caller reads/overwrites/deletes every object (triggers-enums-storage.md:124-172; rls-policies-05.md:80). In-code comment "site-images bucket is private" is **false**.

---

## D. Token-free / weak public access
- **/public/subsections/[subsectionId]** (info) — token-free: any valid subsection UUID exposes document file_urls + tenant name + snags; no token, no visible rate-limit (PublicSubsection.tsx:83). Legacy nested variant ignores clientId/siteId path params (decorative).
- **settings anon SELECT** (LOW) — "Public can view branding only" is `USING(true)` with NO column restriction; an anon-key holder can `select=*` and read all settings columns; narrowing is client-side only (AuthLayout.tsx:26-33; migration 20251016064350:106-110).
- **VisitorRegistrationGate** (info) — client-side only; scoped RPC payloads fetched before the gate renders, so a scripted anon client bypasses it (VisitorRegistrationGate.tsx:89).
- **/review/[token] Schematic+Assets tabs** (low) — residual direct anon table reads bypass the scoped `get_public_site_review` RPC; post-lockdown availability UNVERIFIED (SchematicDiagram.tsx:679-723; PublicSiteReview.tsx:473-478).

---

## E. Bookkeeping (from the critic)
- **validation-chat** — `config.toml:18-19` declares `[functions.validation-chat] verify_jwt=true` but there is **no `supabase/functions/validation-chat/` dir** and zero repo references — a 27th unversioned/stale entry, same class as the deleted G-SEC-08 set. Verify deployed-or-stale; delete the config entry if stale.
- Ledger rows 04/05 + the 58-vs-52 route count were stale → fixed in 00-INDEX.md.
