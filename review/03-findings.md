# 03 — Review & Findings (Phase 3)

**Date:** 2026-07-30
**App:** wm-compliance-inspector

Nineteen independent reviewers — 12 area reviewers plus 7 cross-module dimension reviewers — worked the 71 Phase-2 unit specs with source verification, each finding anchored to a file and line in the tree rather than to the spec text. That pass produced 286 raw findings. Raw findings were consolidated per cluster with citation spot-checks, and every blocker- and high-severity candidate was then handed to a fresh agent instructed to refute it: 41 came back CONFIRMED, 8 were severity-ADJUSTED, and 0 were refuted in the main pass. A final global cross-cluster dedup folded 157 consolidated findings into the 135 recorded here, with zero loss and zero duplication. The auth-access reviewer was re-run after an initial failure; its 12 findings went through the same consolidation and adversarial verification as the rest. Per protocol, this document records problems only — no solutions, no remediation plans, no prioritisation of fixes.

## Severity summary

| severity | count |
| --- | --- |
| blocker | 4 |
| high | 31 |
| medium | 83 |
| low | 17 |
| **total** | **135** |

By category:

| category | count |
| --- | --- |
| correctness | 49 |
| security | 15 |
| error-handling | 14 |
| inconsistency | 10 |
| dead-code | 7 |
| privacy | 7 |
| duplication | 5 |
| boundaries | 4 |
| missing-tests | 4 |
| dependencies | 3 |
| performance | 3 |
| access-control | 2 |
| audit-integrity | 2 |
| endpoint-auth | 2 |
| observability | 2 |
| authn-bypass | 1 |
| configuration | 1 |
| data-loss | 1 |
| input-validation | 1 |
| rls-pii | 1 |
| schema-mismatch | 1 |
| **total** | **135** |

## Findings

Findings are ordered blocker → high → medium → low. Blocker and high findings carry their complete evidence set and the adversarial-verification verdict; medium and low findings show the first four evidence citations.

### F-01 · blocker · security — All storage buckets public, anon SELECT on storage.objects never dropped, blanket authenticated write, and pool uploads skip validation

**Affected units:** D01, D03, L04, L12, V06, F02

**Problem:** Every bucket including `documents` was flipped public and the anonymous `USING (true)` SELECT policy on storage.objects was never dropped (the 2026-06 triage explicitly left it), while the same triage recreated INSERT/UPDATE/DELETE `TO authenticated WITH CHECK (true)` across all buckets; the COC pool path then uploads any file of any size or type into that bucket and persists its public URL.

**Evidence:**

- supabase/migrations/20251120083541_6381caa6-9675-4a9f-918b-d0954835b896.sql:20 — `UPDATE storage.buckets SET public = true;` for ALL buckets; the only `public = false` in history is earlier (20251017094000:9) and 20251120081347:30 re-publicises `documents`
- supabase/migrations/20251120083932_7add3605-ec9c-4049-a8fb-233ff75a3349.sql:18-20 — `CREATE POLICY "Anyone can view all storage" ON storage.objects FOR SELECT USING (true)`, no TO clause; repo-wide grep shows the policy name is never dropped in any migration
- supabase/migrations/20260611110000_emergency_triage_lockdown.sql:18-30 — drops only the three anon write policies, states "Anon SELECT is left for now", and recreates INSERT/UPDATE/DELETE TO authenticated WITH CHECK (true) across all buckets
- docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:24 — the out-of-band prod fix scans `schemaname='public'` only, so it never touches storage.objects even in production
- src/lib/coc/poolUpload.ts:22-27 — uploads to the documents bucket and stores getPublicUrl() as coc_file_pool.file_url with no size or extension check
- src/lib/coc/uploadCocFiles.ts:5-10,42 — a 50MB + extension allowlist validate() exists in the same unit but is called only by uploadEvaluationReport
- src/views/ContractorSubsectionDetail.tsx:91 — contractor portal calls poolRouteFile per selected file; src/views/site-coc/SiteCocLoadCard.tsx:31 — drop handler passes e.dataTransfer.files straight through

**Verification:** CONFIRMED: All cited lines verified. No migration after the lockdown touches storage; anon SELECT USING(true) survives (its own comment admits it), all buckets public, authenticated write/delete is cross-tenant WITH CHECK(true), and the pool upload path skips validate(). | CONFIRMED: No later migration re-privatises any bucket or drops the anon USING(true) SELECT; the 2026-06-11 triage is the last storage migration. Tier-2 script filters schemaname='public', so storage untouched. Blocker stands.

### F-02 · blocker · security — Unauthenticated/any-JWT service-role edge functions destructively rewrite production inspection data (dryRun still writes)

**Affected units:** F04, D04

**Problem:** fix-inspection-photos is registered verify_jwt=false with no in-handler auth yet performs service-role UPDATEs of arbitrary inspections' json_data — its dryRun flag only chooses which in-memory object is mutated, and a bare `{}` body targets 100 inspections — while fix-tenant-images performs the same unbounded rewrite for any caller holding any JWT, with no parameters, no limit, blind first-image substitution and success counts incremented before the write.

**Evidence:**

- supabase/config.toml:49-50 — [functions.fix-inspection-photos] verify_jwt = false; grep of the whole file for Authorization/getUser/has_role returns nothing (verified: zero hits in both fix-* functions)
- supabase/functions/fix-inspection-photos/index.ts:11 — service-role client; :182-191 — unconditional `.from('inspections').update({ json_data, updated_at }).eq('id', inspectionId)` whenever `modified`
- supabase/functions/fix-inspection-photos/index.ts:246-253 — dryRun only selects `dryRun ? jsonDataCopy : inspection.json_data`; both are passed to the same writing function, so the DB write happens either way; :221 — .limit(100) scan-all when no inspectionId is supplied
- supabase/functions/fix-inspection-photos/index.ts:95-100 — strategy 3 returns the first listed image in the folder with no comparison to the original filename; :188-190 — an update failure is pushed into `changes` as text while `fixed` stays incremented
- supabase/functions/fix-tenant-images/index.ts:41-44 — select("id, json_data").not("json_data->tenants","is",null) with no .limit(); the handler never reads a request body, so there are no parameters and no dryRun
- supabase/functions/fix-tenant-images/index.ts:106-118 — replacement is the first image matched from a created_at-desc listing, unrelated to the missing filename; :113-127 — fixedCount++ and status 'fixed' recorded before any write
- supabase/functions/fix-tenant-images/index.ts:151-160 — on update error only console.error runs; the response at 164-179 still reports those fields as fixed; the update writes json_data only and never touches updated_at
- supabase/config.toml:36-37 — [functions.fix-tenant-images] verify_jwt = true, which blocks only anonymous callers; any user JWT reaches the service-role handler that has no role check

**Verification:** CONFIRMED: verify_jwt=false, service-role client, no in-handler auth; UPDATE at index.ts:182-191 runs in both modes — dryRun merely swaps in a copy that is then mutated and written back. | CONFIRMED: strategy-3 blind first-image match (95-100); GAPS.md prod-deletion claim unverifiable from repo. | CONFIRMED: fix-tenant-images has no params, no dryRun, no role check. Minor nuance: exact-match URLs are skipped (lines 91-103), so only broken URLs are rewritten — core claim stands.

### F-03 · blocker · security — Blanket "All authenticated users full access" RLS policies survive, letting any signed-in user rewrite user_clients/user_sites tenancy mappings

**Affected units:** D01, D02, D03

**Problem:** A blanket `FOR ALL USING/WITH CHECK (auth.uid() IS NOT NULL)` policy on user_sites and user_clients remains the recorded posture alongside the Admin-only policies (permissive policies OR together), so any signed-in Client or Contractor can repoint their own tenancy mapping and gain cross-tenant access through every policy that scopes via these tables; four sibling tables plus six 'User'-role FOR ALL policies and seven 2026-04 `FOR ALL TO authenticated USING (true)` recreations were likewise never dropped.

**Evidence:**

- supabase/migrations/20251120080517_643a23ca-0be6-4205-9103-3329d42e412f.sql:206,213 — "All authenticated users full access to user_sites" and "…user_clients", FOR ALL, USING/WITH CHECK `auth.uid() IS NOT NULL`; grep over all migrations returns only these CREATEs — no later DROP exists
- supabase/migrations/20251120080517_643a23ca-0be6-4205-9103-3329d42e412f.sql:8,123,153,187 — the same blanket FOR ALL on site_document_categories, site_marking_checklist, inspection_subsections and qr_codes; later drops of that policy name cover only other tables
- supabase/migrations/20251017054255_cd78a557-c3ab-4a9b-b95c-d8da8696f61c.sql:4-27,29-41 — user_clients is UNIQUE(user_id) with Admin-manage + view-own policies; `get_user_client_id()` reads it for all Client-scoped SELECT policies
- supabase/migrations/20260612220000_fortress_rls_scope.sql:53-58 — Contractor reads scope via `site_id IN (SELECT site_id FROM public.user_sites WHERE user_id = auth.uid())`
- supabase/migrations/20260708090000_site_health_snapshots_scoping.sql:28-38 — Client snapshot reads scope via `public.get_user_client_id()`
- supabase/migrations/20251120111033_1e66f4c9-8418-4d98-9333-8331b5c0aa7a.sql:5-55 — 'User'-role `FOR ALL USING (has_role(auth.uid(),'User'))` on nine tables; only three are later dropped (20260406131029:36,53,68)
- supabase/migrations/20260406131029_84479c75-c2f1-438f-af75-2d238ccb0259.sql:10-102 — replaces role-scoped policies with `FOR ALL TO authenticated USING (true) WITH CHECK (true)` on seven tables; grep shows no later drop
- supabase/migrations/20251017061634_0f314109-0186-45b7-9d30-23aacfd775d3.sql:12-23 — the original user_sites policies were Admin-manage + view-own only, showing the blanket policy is a regression

**Verification:** CONFIRMED: Blanket FOR ALL on user_sites/user_clients (20251120080517:206,213) never dropped; later lockdowns cover other tables only; no REVOKE from authenticated. Contractor can INSERT any user_sites row, or DELETE mappings. | CONFIRMED: no restrictive policies or dynamic drops refute it. Two of the seven 2026-04 tables were later dropped (5 live); finding undercounts: validation_conversations/messages blankets also survive.

### F-04 · blocker · security — Role-unqualified SELECT USING(true) on client_access_links exposes every share token

**Affected units:** D02, D03

**Problem:** `client_access_links` carries a role-unqualified `FOR SELECT USING (true)` policy that migration history never drops, exposing `access_token` — the sole credential guarding the public portfolio/review RPCs — to the anon key; the only counter-measure is the out-of-band docs-only prod script, which merely demotes it to all-authenticated (any portal user can still read every tenant's tokens) and is reintroduced in full on any clean apply.

**Evidence:**

- supabase/migrations/20260123052614_a764fe2c-37bc-4a80-b19b-6860d8086690.sql:9-12 — `CREATE POLICY "Public can select access_links for validation" ON public.client_access_links FOR SELECT USING (true);` (no TO clause)
- supabase/migrations/20260122090622_9c76c44a-8b4a-4666-807a-e523b21acfea.sql:4 — `access_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32),'hex')` is the row's only secret
- supabase/migrations/20260610113000_public_rpcs_phase1.sql:9-19,53-77 and 20260610130000_public_drilldown_rpcs.sql:12-83 — `_share_link`/portfolio/site-review RPCs authorise purely on that token, granted to anon
- grep over supabase/migrations — no migration drops "Public can select access_links for validation"; docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:4,13 is outside migrations and only demotes anon SELECT policies to authenticated

**Verification:** CONFIRMED: Re-verified all cited lines: policy lacks a TO clause, token is sole credential, RPCs granted to anon, no migration drops it. The out-of-band docs script only demotes it to authenticated, so contractor logins still read all tokens.

### F-05 · high · security — Blanket anonymous SELECT policies on ten core tables were never dropped in migration history

**Affected units:** D01, D02, D03, V04, F02

**Problem:** `FOR SELECT USING (true)` policies on subsections, sites, clients, document_categories, site_documents, subsection_documents, coc_validations, inspections, floor_plan_pins, subsection_floor_plans and settings are still the last word in tracked migration history, so an unauthenticated PostgREST caller reads the whole dataset the token/UUID-scoped public RPCs were built to gate; the fix is a docs-only file deliberately excluded from migrations, so any clean apply reopens full anonymous read.

**Evidence:**

- supabase/migrations/20260108071956_61a3cdd4-0e0d-414e-a0aa-db2c0a258935.sql:5-32 — five CREATE POLICY … FOR SELECT USING (true) with no TO clause (subsections, sites, clients, document_categories, site_documents); file read in full
- supabase/migrations/20260123052442_27d0f826-373b-45e8-b6a3-bb0a40fe67f3.sql:4-25 — same on coc_validations, inspections, floor_plan_pins, subsection_floor_plans
- supabase/migrations/20251016064723_bcd61aa1-b207-4223-835c-f3a8e411fe81.sql:61-65 — "Public can view subsection documents" TO public USING (true)
- grep of all policy names across supabase/migrations: only the creation sites; the one DROP of "Public can view site documents" is 20251120080517:29, dated before the 2026-01-08 recreate
- supabase/migrations/20251016064350_7ace660c…sql:106-112 — settings policy "Public can view branding only" is FOR SELECT TO public USING (true); the column narrowing exists only as a comment
- docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:4 — "intentionally OUTSIDE supabase/migrations/ so it is NOT auto-applied"; supabase/migrations/20260614100000_public_site_review_schematic_assets.sql:1-4 calls the policy drop "Phase 3", for which no migration file exists
- supabase/migrations/20260610120000_phase1_write_lockdown.sql:23 and 20260611110000_emergency_triage_lockdown.sql:18 — both lockdowns' own comments admit anon SELECT is left in place
- supabase/migrations/20260727101000_public_verdict_rpcs.sql:25,78 — SECURITY DEFINER get_public_subsection granted to anon, i.e. the scoped access model these policies bypass

**Verification:** ADJUSTED: Prod was fixed out-of-band: docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql dropped every anon USING(true) SELECT policy (verified per 20260614110000). Residue is stale-history reintroduction on fresh apply/reset; settings exposes branding cols only. High, not blocker. | CONFIRMED: No migration through 20260727102000 drops the ten anon USING(true) SELECT policies; the 20251120 drops predate the 2026-01 re-creations.

### F-06 · high · access-control — Authorization is exclusion-only and client-side: role-less, errored and not-yet-resolved sessions render the admin shell

**Affected units:** A03, A04, A05, A06, A07, C10, D02, D03, H03

**Problem:** There is no middleware; every surface is gated by a "use client" layout whose admin guard only redirects Contractor and Client, so undefined/null/'User' roles render the full admin app. useUserRole throws on query error leaving data undefined, and react-query v5 reports isLoading=false while the query is disabled, so both states fall past the redirects — and the DB write policies use the same NOT-based predicate, which the repo's own migrations record as including users with no role row.

**Evidence:**

- src/components/ProtectedRoute.tsx:19-26 — after loading, the only checks are `userRole === "Contractor"` and `userRole === "Client"`; anything else (undefined included) renders children; src/app/(admin)/layout.tsx:1,12 — "use client" layout, ProtectedRoute is the sole gate; no middleware.ts exists at repo root, src/ or src/app
- src/hooks/useUserRole.tsx:51 — `if (error) throw error` leaves data undefined on failure; :52 — `return data?.role as UserRole` is undefined when the user has no user_roles row; :54 — `enabled: !!userId`, and userId is set only after an async getSession() resolves
- src/components/ProtectedRoute.tsx:14 — the loading gate uses roleLoading, which is false for a disabled query in react-query v5 (package.json:49 — @tanstack/react-query ^5.83.0)
- src/components/ClientProtectedRoute.tsx:24 and src/components/ContractorProtectedRoute.tsx:23 — portal guards redirect every non-matching role to "/dashboard", funnelling them into the fail-open admin shell; both render raw children on `userRole === "Admin" && <unvalidated ?preview param>`
- supabase/migrations/20260610120000_phase1_write_lockdown.sql:40-47 — staff write predicate is `auth.uid() IS NOT NULL AND NOT has_role(Contractor) AND NOT has_role(Client)`; supabase/migrations/20260708090000_site_health_snapshots_scoping.sql:11 — "NOT-based policies silently include users with no role row at all"
- supabase/migrations/20260214023114_a056bc18…sql:21-27 — handle_new_user assigns 'User' to every signup after the first; supabase/migrations/20260611110000_emergency_triage_lockdown.sql:8-10 — "signup is currently OPEN … a self-registered account counts as Staff"
- src/views/ClientPortalSiteDetail.tsx:42 vs :77,92,107,143 — ownership (client_id) is checked only on the sites query; subsections/documents/inspections run on `enabled: !!siteId`

**Verification:** CONFIRMED: No middleware; ProtectedRoute admits any non-Contractor/Client role incl. undefined; NOT-based RLS predicates persist, repo comments admit they include no-role users. Not blocker: signup form disabled, invite-user Admin-gated. | CONFIRMED: ProtectedRoute is exclusion-only while Client/Contractor guards fail closed. isLoading=isPending&&isFetching (v5) is false when disabled, errored, or offline-paused (4th path). useRoleRedirect also fails open to /dashboard.

### F-07 · high · data-loss — Daily auto-logout wipes all unsynced offline work, and offline annotations never reach the server while the UI promises sync

**Affected units:** H01, H02, L11, L12, C10

**Problem:** SessionWatcher.performLogout calls clearAllCaches() before signOut with no drain or pending-work guard: it deletes IndexedDB wm_compliance_offline (unsynced inspections, queued photo blobs, annotations) and every localStorage key except a stale v1 prefix, wiping offline_mutation_queue. Markups/measurements are additionally stamped `synced: !isOnline`, queued only when already online, and their executor cases touch no server table, so they exist solely in that deleted store. The deletion list also names a phantom DB and omits the real handoff DB.

**Evidence:**

- src/components/SessionWatcher.tsx:54 — `await clearAllCaches()` runs unconditionally inside performLogout, before signOut; grep for getUnsynced/unsynced/pending in the file returns 0 hits; :98-118 — fires on the admin-configured daily minute
- src/lib/cacheUtils.ts:41-44 — deletion list ['wm_compliance_offline','wm_floor_plan_offline']; offlineDB.ts/offlineInspectionDB.ts both open 'wm_compliance_offline' and offlineFloorPlanDB.ts:5-12 reuses it, while 'wm_floor_plan_offline' appears nowhere else in src
- src/lib/cacheUtils.ts:6,71-78 — PRESERVED_KEYS = ['supabase.auth.token'] (the supabase-js v1 key; package.json:48 pins ^2.75.0) and every other localStorage key is removed, including OFFLINE_QUEUE_KEY 'offline_mutation_queue' (src/lib/offlineQueue.ts:3)
- src/integrations/supabase/client.ts — createClient with default storageKey, so no localStorage key starts with 'supabase.auth.token'; src/lib/downloadHandoff.ts:17 — DB 'wm-download-handoff' absent from the deletion list
- src/hooks/useOfflineFloorPlanAnnotations.ts:208,254 — `synced: !isOnline` marks offline-created records as already synced; :213-214,259-260 — queueMutation runs only `if (isOnline)`; :217,263 — the offline branch toasts "Will sync when online"
- src/hooks/useOfflineSync.ts:293-317 — ADD_MARKUP/ADD_MEASUREMENT only call markMarkupSynced/markMeasurementSynced ("stored locally only for now"); DELETE_* only delete locally; no Supabase table is touched
- src/lib/offlineDB.ts:229,260 — queued photo blobs live in the deleted database
- supabase/migrations/20251016064350:115 — RLS lets any authenticated user read the auto-logout flag, so field devices fire on the shared setting

**Verification:** CONFIRMED: Auto-logout (mounted in providers.tsx, real settings toggle, DB default false) wipes wm_compliance_offline + localStorage queue with no drain attempt — losing ALL pending offline work. Caveat: addMarkup/addMeasurement have no UI caller today. | CONFIRMED: phantom floor-plan DB name; handoff DB omitted; preserve prefix matches no supabase key. | CONFIRMED: LAST_LOGOUT_KEY self-wipes; SWs unregister. Gated only by DEFAULT false, so high not blocker.

### F-08 · high · endpoint-auth — Edge functions authenticate but never authorize, making send-email an open mail relay from the company Gmail account

**Affected units:** F01, F04, F05, D04

**Problem:** send-email, batch-compress-images and offline-review gate only on "a JWT that resolves to some user", with no role check, recipient allowlist, content limits or rate limiting, so any Contractor or Client account can relay arbitrary HTML to arbitrary to/cc/bcc addresses from GMAIL_USER or drive admin-only maintenance tooling.

**Evidence:**

- supabase/functions/send-email/index.ts:33-41 — the only gate is `supabase.auth.getUser(__jwt)`; any non-null user passes
- supabase/functions/send-email/index.ts:43-54 — only the presence of to/subject/(html|text) is validated; cc/bcc are taken straight from the body
- supabase/functions/send-email/index.ts:87-95 — to/cc/bcc forwarded verbatim to SMTP send with `from: gmailUser`
- supabase/functions/send-email/index.ts:112-124 — catch returns the internal error.message as `details`
- supabase/functions/batch-compress-images/index.ts:123-126 and supabase/functions/offline-review/index.ts:22-25 — the identical any-authenticated-user block, no role or claims inspection follows
- grep for has_role|user_roles across supabase/functions/{send-email,offline-review,batch-compress-images,fix-tenant-images,templates,save-template,template-sync,api-reports,oauth-token}/index.ts returns zero hits
- src/components/settings/ImageCompressionManager.tsx and src/app/(admin)/offline-review/page.tsx — the intended callers are admin-only surfaces
- supabase/config.toml:21-22 — verify_jwt=true rejects the bare anon key but not any real user; zero tracked in-app callers of send-email while docs/GAPS.md:37 lists it deployed

**Verification:** CONFIRMED: Verified send-email:33-41/43/88, batch-compress-images:123-131, offline-review:22-30 gate on getUser only. Correction: "no role check in F01" is false; invite-user:195-203 and delete-user:41-49 enforce Admin. No data-loss path. | CONFIRMED: no role gate/allowlist/rate limit. Not blocker: needs an invited account (signup locked); impact is phishing/sender-reputation.

### F-09 · high · security — API client secrets, access tokens and temporary passwords are handled in plaintext end to end

**Affected units:** F03, D02, V02, F01, L21

**Problem:** api_clients.client_secret and api_access_tokens.access_token/refresh_token are plaintext columns matched by SQL equality in both edge functions and rendered/copied in the admin UI, and generated initial passwords are returned to the client both as a field and inside the human-readable message, emailed, and shown in a 10-second on-screen toast.

**Evidence:**

- supabase/migrations/20260110172925_a9616e50…sql:5-6,19-20 — client_secret / access_token / refresh_token are TEXT columns holding encode(gen_random_bytes(...),'hex') defaults; no hash column or digest is defined
- supabase/functions/oauth-token/index.ts:34-40 — `.eq("client_id", client_id).eq("client_secret", client_secret)` equality lookup on the stored secret; :76-83 — new access/refresh tokens inserted verbatim
- supabase/functions/api-reports/index.ts:18-23 — bearer token resolved with `.eq("access_token", token)`, a plaintext lookup
- src/views/APIClients.tsx:201,273,288 — client_secret rendered behind a show toggle and copied to clipboard
- supabase/functions/invite-user/index.ts:363-375 — the response message embeds the plaintext plus a separate `temporaryPassword` field; :547-561 — same on the create path; :85,262-263 — the password is also embedded in the invite email body
- src/views/Users.tsx:373-383 — the resend invoke body sends temporaryPassword with no deliverByEmail, so the legacy plaintext-return branch is taken
- src/views/Users.tsx:391-395 — `toast.success(\`Password reset! Temporary password: ${data.temporaryPassword}\`, { duration: 10000 })`; :324-327 — the same toast on the create path

**Verification:** CONFIRMED: All cited lines verified; no hashing anywhere in migrations or functions. Mitigations (admin-only/service-role RLS, 1h token TTL) bound blast radius but leave plaintext secrets at rest, equality-matched, and admin-retrievable. | CONFIRMED: RLS limits reads to Admin/service_role, so not blocker, but plaintext is systemic: validate_api_token matches plaintext, APIClients.tsx re-displays stored secrets, both functions verify_jwt=false, 30-day refresh tokens.

### F-10 · high · privacy — Real credentials and personal data are committed to the repository, and the PII staging table was never dropped

**Affected units:** D02, P03, D04, L19

**Problem:** A migration resets a named production user's auth.users.encrypted_password from a hardcoded plaintext literal (so the credential and account email are permanently in every clone), a tracked script lists eight named staff addresses with roles, a seed carries named individuals and per-tenant commercial figures, and the temp_import table that received staff PII still exists in the public schema.

**Evidence:**

- supabase/migrations/20260212144831_85c05452-caf9-430b-b7cf-57affed32a53.sql:12 — `SELECT id INTO target_user_id FROM auth.users WHERE email = 'marries.liesie@gmail.com';`
- supabase/migrations/20260212144831_85c05452-caf9-430b-b7cf-57affed32a53.sql:19,24,26 — `SET encrypted_password = extensions.crypt('Marries@001', extensions.gen_salt('bf'))`, executed at :24; the helper is dropped at :26 but the plaintext literal remains in history
- sql-import-scripts.md:9-15 — eight real addresses (admin@/alain@/darren@/dawie@… wmeng.co.za) with full names and role assignments
- supabase/seeds/fortress_abaqulusi_seed.sql:494-501 — per-tenant turnover, trading density and arrears rows for a named real centre; the header states it is "real data from the 3 workbooks"
- supabase/migrations/20251014120224_e944a635…sql:2 creates public.temp_import; 20251016064350_7ace660c…sql:127-132 only tightens its policies to admins; grep for `DROP TABLE.*temp_import` across supabase/migrations returns nothing and src/integrations/supabase/types.ts:2733 still exposes it in the public-schema types

**Verification:** CONFIRMED: All four evidence legs verified at cited lines. Seed is stronger than claimed: names individuals. temp_import is admin-RLS-gated but never dropped and still in generated types. High (not blocker): needs repo access, no public exploit surface. | CONFIRMED: tracked migration (commit 2ee7868) has the email at line 12 and plaintext at line 19; DROP FUNCTION at 26 does not purge git history. No later rotation migration.

### F-11 · high · security — DocBuilder template endpoints fail open: an unset env var makes them unauthenticated service-role CRUD, including DELETE of inspection_templates

**Affected units:** F03, D04, V02

**Problem:** save-template and template-sync are verify_jwt=false and use the service-role client, but only enforce their bearer token when the corresponding DOCBUILDER_* env var is non-empty — a state the repo neither documents nor detects — exposing insert/update and DELETE on inspection_templates, the table the app reads.

**Evidence:**

- supabase/functions/save-template/index.ts:15-18 — `const expectedApiKey = Deno.env.get('DOCBUILDER_PUBLIC_TOKEN')` then `if (expectedApiKey && authHeader !== ...)`: an unset var skips the check entirely
- supabase/functions/template-sync/index.ts:12-18 — `if (!expectedKey) { console.log("Warning: DOCBUILDER_SYNC_KEY not configured, allowing access"); return { valid: true }; }`
- supabase/functions/template-sync/index.ts:264-265 — DELETE /templates/:id runs `.from("inspection_templates").delete()` behind that gate
- supabase/config.toml:33-34,42-43 — both functions verify_jwt = false, so the in-file check is the only gate
- supabase/functions/templates/index.ts:345-351 — the sibling on the same DOCBUILDER_PUBLIC_TOKEN fails closed with 503 ("Fail closed: never serve data when the API token is not configured"), showing the divergence is unintentional
- .env.example (10 lines, read in full) documents only NEXT_PUBLIC_* values, so the unset state is undetectable from the repo

**Verification:** ADJUSTED: Code confirmed (save-template:16-18; template-sync:12-18,263-268; config.toml:33-34,42-43). Yet save-template's DELETE branch is dead (:68 wins on template.id); FKs lack CASCADE, blocking deletes of in-use templates; PUBLIC_TOKEN likely set (templates:348 503s). Precondition unverifiable: high.

### F-12 · high · security — qr-redirect is an unthrottled anonymous name-to-UUID oracle that also returns raw error text

**Affected units:** F02, A09, V04

**Problem:** Any 3+-segment path is fuzzily name-matched with service-role privileges and the resolved subsection UUID is handed back in the 302 Location, with no rate limiting and with `error.message` returned verbatim to unauthenticated callers.

**Evidence:**

- supabase/functions/qr-redirect/index.ts:182 — `const [, clientName, siteName, ...subsectionParts] = pathParts` discards the first segment without checking it; :194 — `.ilike('name', '%${subsectionName}%')` (only the empty case is guarded at :189), so a single-character probe matches most of the table
- supabase/functions/qr-redirect/index.ts:205-210 — `.find` on `site?.name?.toLowerCase().includes(siteName)` / `client?.name?.toLowerCase().includes(clientName)`, substring in both directions, first row in arbitrary order (also a mis-redirect risk for legitimate legacy QRs)
- supabase/functions/qr-redirect/index.ts:32 — service-role client; :87 — 302 `Location: ${appOrigin}/public/subsections/${subsectionId}` discloses the UUID; :221-225 — 404 confirms/denies name existence
- supabase/functions/qr-redirect/index.ts:229-233 — top-level catch returns `{ error: error.message }` to the anonymous caller; :19-20 — every scanned path and full req.url logged; grep of the file for throttle/rate-limit/429 returns nothing, unlike supabase/functions/report-issue/index.ts:19-30,44
- src/views/PublicClientPortfolio.tsx:75 — `console.log('[Portfolio] Token validation result:', { linkResult, linkError, token })` prints the capability token

**Verification:** CONFIRMED: All lines verified. Anon-reachable (config.toml verify_jwt=false; QR PNGs encode it, qrBaseUrl.ts:43) and the leaked UUID is a live capability — get_public_subsection is GRANTed to anon and all buckets are public. Caveats: needs 4+ segments (3 hits the :189 guard); error.message leak minor.

### F-13 · high · authn-bypass — Forced first-login password change is client-side advice only

**Affected units:** F01, V05, C10, L21

**Problem:** invite-user auto-confirms the account and sets requires_password_change in self-writable user_metadata. signInWithPassword returns a full session; the only enforcement is a client-side navigate, so the temp password stays usable indefinitely.

**Evidence:**

- supabase/functions/invite-user/index.ts:410-415 — createUser with `email_confirm: temporaryPassword ? true : false` and `user_metadata.requires_password_change`
- src/views/auth/Login.tsx:107-111 — the flag is read from user_metadata and handled only by `navigate("/auth/reset-password")` after `data.session` already exists
- src/components/ProtectedRoute.tsx:8-27 — the guard checks session and role only; it never reads the flag
- src/views/auth/ResetPassword.tsx:80 — the client clears the flag itself via updateUser({data:{...}})
- grep requires_password_change across src and supabase — only Login.tsx, Auth.tsx:69, Reset/SetPassword and invite-user; no SQL, RLS, hook or middleware reads it

**Verification:** CONFIRMED: invite-user:410-415 (+resend 253-266) auto-confirms w/ temp pw; flag only in user_metadata. No SQL/RLS/hook/middleware reads it; ProtectedRoute:8-27 and Client/ContractorProtectedRoute lack the check. Enforcement = client navigates (Login 65/107/185, Auth 69); ResetPassword:80 self-clears.

### F-14 · high · endpoint-auth — send-password-reset mints recovery tokens with no verify_jwt entry and no caller

**Affected units:** F01

**Problem:** The function calls admin.generateLink to mint a live recovery token for any submitted address and emails it, guarded only by a 5/min in-isolate counter keyed on the spoofable X-Forwarded-For hop. It is absent from config.toml and has zero callers.

**Evidence:**

- supabase/functions/send-password-reset/index.ts:73-79 — `supabase.auth.admin.generateLink({ type: 'recovery', email: trimmedEmail, options: { redirectTo } })` on unauthenticated input
- supabase/functions/send-password-reset/index.ts:36-43 — rate limit keyed on the caller-supplied x-forwarded-for hop
- supabase/config.toml — no [functions.send-password-reset] block among the 20 entries (grep confirms only log-auth-event matches nearby)
- supabase/functions/send-password-reset/index.ts:101-103 — hashed_token embedded in the emailed URL
- src/views/auth/ForgotPassword.tsx:72 — the live flow uses supabase.auth.resetPasswordForEmail instead

**Verification:** CONFIRMED: All 5 cites verified. Config omission implies verify_jwt=true, but GAPS.md:73 logs a live no-auth probe (400 'Email is required') -> prod gate OFF; anon key satisfies it regardless. XFF hop attacker-set, 5/min bypassable. Not the GoTrue hook. Overstated: token mails to owner, not attacker.

### F-15 · high · security — api-reports has no per-client scoping: one token reads every tenant's data

**Affected units:** F03

**Problem:** Any active api_clients record with the reports:read scope can fetch inspections, sites, subsections, documents and floor plans for any id in the database, because tokens carry only scopes and the queries filter on the requested id alone.

**Evidence:**

- supabase/migrations/20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql:2-13 — api_clients has name/client_id/client_secret/redirect_uris/scopes/is_active only; no client, site or tenant restriction column exists
- supabase/functions/api-reports/index.ts:58-63 — the sole authorization check is `authResult.scopes?.includes("reports:read")`
- supabase/functions/api-reports/index.ts:138-142 — select with sites/clients/templates joins `.eq("id", inspection_id)` and no ownership predicate
- supabase/functions/api-reports/index.ts:162-177 — site-summary selects sites * plus all subsections and inspections for any site_id
- supabase/functions/api-reports/index.ts:205-219,241-250 — subsection and floor-plan branches likewise filter only on the caller-supplied id
- supabase/functions/api-reports/index.ts:44-46 — all of the above run on a SUPABASE_SERVICE_ROLE_KEY client, so RLS cannot compensate

**Verification:** CONFIRMED: All citations re-verified; no guard found: verify_jwt=false, oauth-token copies scopes verbatim, no migration adds scoping. UUID-unguessability is weak — public QR URLs expose subsection ids and responses leak site_id for lateral traversal. Admin-only provisioning keeps it high, not blocker.

### F-16 · high · security — Admin RLS 'policy override' UI writes rows that nothing enforces

**Affected units:** C14

**Problem:** The Users panel inserts per-user GRANT/DENY policy-override rows (including free-text SQL conditions) and toasts success, but no database policy, function, or client code ever reads user_policy_overrides, so the advertised security control has no effect.

**Evidence:**

- src/components/UserRLSPolicies.tsx:137-150 — addOverride mutation inserts table_name/operation/permission_type/condition rows; success toast at :154
- supabase/migrations/20251120061340_29a4cccb-992b-47a3-b12c-108886eed9da.sql:2-34 — sole migration touching the table: creates it, admin-only RLS on the table itself, updated_at trigger, two indexes; no enforcement logic anywhere
- grep 'user_policy_overrides' across src/ and supabase/ — only hits are UserRLSPolicies.tsx (read/insert/delete of the rows themselves), generated types, and this one migration

**Verification:** CONFIRMED: Verified at all cited sites: UI inserts GRANT/DENY rows with free-text SQL conditions and toasts success; sole migration only creates the table; repo-wide grep shows no policy, function, or client code consumes the rows. DENY silently non-enforcing = security control that falsely reports success.

### F-17 · high · error-handling — supabase-js in-band errors are discarded on both reads and writes, so failed writes report success and outages render as empty data

**Affected units:** V06, L01, L04, L05, C09, V01, V02, C08, C03, F02

**Problem:** Across COC ingestion, admin views, portal components and audit logging, results are destructured as `{ data }` only or not at all — supabase-js resolves rather than throws — so success toasts fire on failed writes, failed reads become valid-looking empty/zero state, and a destructive re-import deletes the previous register with unchecked deletes after an unchecked snapshot read.

**Evidence:**

- src/views/site-coc/useSiteCocImport.ts:59-60 — prior-match snapshot read destructures data only; :86-87 — both deletes of the previous register discard their results; :112-136 — cert re-link, coc_status re-stamp, is_coc_required sync and batch summary all unchecked; :141-142 — success toast and onDone() run regardless
- src/lib/coc/assignPoolFile.ts:17,21,32,44,54 — five unchecked reads (a failed dupe check at :44 proceeds to insert a duplicate doc row; a failed verdict read at :32 stamps status 'Pending'); :25,61,65 — cert stamp, coc_status re-stamp and the pool row's 'assigned' update discard their errors
- src/lib/coc/reassignPool.ts:11-14 — pool/certs reads unchecked, so a failed certs read classifies every pending file against []; :29,32-34 — the resulting reasons are persisted with unchecked updates; src/views/site-coc/useSiteCoc.ts:38-47,58-62 — four unchecked reads and unchecked match updates
- src/components/site/SiteEditDialog.tsx:60-65,79-80 — storage upload and sites update awaited without destructuring, then unconditional toast.success; src/views/ClientDetail.tsx:117-122 — same pattern before "logo uploaded"
- src/views/Dashboard.tsx:102-140 — nine Promise.all results consumed as `count || 0` with a console-only catch at :165; src/views/QRActivity.tsx:42-44 — catch sets scans to [] (renders the empty state)
- src/components/site/DocumentHistoryDialog.tsx:30 — `.then(({ data }) => …)`; src/components/client-portal/ClientCocView.tsx:66 — `schedRes.data ?? []` with no error check
- src/views/Settings.tsx:47-48 — console-only catch leaves settings null while handlers dereference `settings!.id` (:78,:111,:127)

**Verification:** CONFIRMED: All cited lines re-verified; no throwOnError config, no catching callers. Unchecked deletes after checked inserts leave old+new register rows under a success toast. Nuances: MyProfile upload IS checked (only profiles update isn't); F02 rests solely on the qr_scans insert.

### F-18 · high · correctness — Offline queue drains are non-idempotent, the lock is per-tab, and queue persistence is unguarded

**Affected units:** H01, H02, L11

**Problem:** Executor cases perform plain inserts after storage uploads with IndexedDB bookkeeping afterwards, so any post-insert throw re-runs the whole mutation and duplicates rows; the drain lock is module state while the queue is shared localStorage with no cross-tab coordination, and both queue writers call setItem unguarded while both readers silently reset a corrupt queue to [].

**Evidence:**

- src/hooks/useOfflineSync.ts:160-183 — UPLOAD_DOCUMENT: upsert upload → plain subsection_documents insert (:170-176) → markDocumentSynced/deleteQueuedBlob (:179-181); a throw in the last steps re-runs the case on retry and duplicates the row (ADD_FLOOR_PLAN_PIN has the same shape)
- src/hooks/useOfflineSync.ts:21-24,409-410 — `let isDraining = false` is module state described as guarding "multiple mounts" in one tab; grep of src for addEventListener('storage') returns nothing, so two tabs can drain the same localStorage snapshot concurrently
- src/hooks/useOfflineSync.ts:59-66,70 — getQueue's bare catch returns [] (corrupt is indistinguishable from empty) and saveQueue's setItem is unguarded; src/lib/offlineQueue.ts:22,31 — the second writer repeats both patterns
- src/lib/offlineQueue.ts:25-30 — dedupe only matches when callers pass dedupeKey equal to `data.id`, and this writer mints crypto.randomUUID() ids while useOfflineSync.ts:75-88 mints `${Date.now()}_${Math.random()}` — two id conventions in one queue

**Verification:** CONFIRMED: Core claims re-verified: plain inserts (UPLOAD_DOCUMENT, UPLOAD_FLOOR_PLAN, ADD_FLOOR_PLAN_PIN) with no DB unique constraints duplicate on retry; module-scope lock with no cross-tab coordination; unguarded setItem and silent corrupt-queue reset in both writers. Only the dedupe bullet is overstated.

### F-19 · high · error-handling — Server rejections queued as 'offline' behind success toast, then permanently discarded after 3 retries

**Affected units:** H01, H02

**Problem:** Any online Supabase failure (including RLS/constraint rejections that can never succeed) falls through to the offline queue with a success toast, and the drain engine deletes the mutation and its queued blob after 3 more failures with only a transient toast — destroying a write the user was told was saved.

**Evidence:**

- src/hooks/useOfflineInspections.ts:44-47 — catch on online insert only console.errors and falls through; :59-60 queues CREATE_INSPECTION and toasts success (same pattern update :75-82, delete :96-103, upload :137-154)
- src/hooks/useOfflineSubsections.ts:119-121 — uploadDocument catch falls through to :136-138 queue + 'Document saved offline' success toast
- src/hooks/useOfflineFloorPlanAnnotations.ts:64-66 — addPin online insert failure falls through to offline save + success toast (:100); deletePin same at :180-182 → :186-188
- src/hooks/useOfflineSync.ts:442-451 — at retries >= MAX_RETRIES (3, :17) the mutation is discarded, referenced queued blobs deleted (:446-448), no dead-letter store, only toast.error (:450)

**Verification:** CONFIRMED: All citations re-verified. Fall-through catches with success toasts confirmed in all three hooks; discard plus blob-delete at useOfflineSync.ts:442-451, MAX_RETRIES=3, no dead-letter or re-queue path anywhere. UPDATE/DELETE payloads fully destroyed; CREATE copies strand unsynced with no resync.

### F-20 · high · correctness — Offline-created pin ids never reconciled; queued update/delete silently no-op

**Affected units:** H01, H02

**Problem:** ADD_FLOOR_PLAN_PIN inserts without the offline_pin_* id and discards the server-generated id, while queued UPDATE/DELETE target the offline id: the update matches zero rows and the delete result is unchecked — offline edits to offline-created pins evaporate.

**Evidence:**

- src/hooks/useOfflineFloorPlanAnnotations.ts:44 — offline pin id is `offline_pin_${Date.now()}_${Math.random()}`
- src/hooks/useOfflineSync.ts:233-255 — ADD_FLOOR_PLAN_PIN inserts pin fields without `id: pin.id`, no .select() to capture the returned server id; markPinSynced(pin.id) uses the offline id
- src/hooks/useOfflineFloorPlanAnnotations.ts:162-164,187 — UPDATE/DELETE_FLOOR_PLAN_PIN queued with the UI's pinId, which for offline-created pins is the offline_pin_* id
- src/hooks/useOfflineSync.ts:275-277 — update `.eq('id', pinId)` against a non-existent id
- src/hooks/useOfflineSync.ts:284-289 — DELETE_FLOOR_PLAN_PIN never checks the delete result; every other DB case throws on error

**Verification:** CONFIRMED: Core claim holds: server id never captured; offline-created pin edits/deletes never apply. One detail wrong: id is UUID, so UPDATE 400s, retries, then is discarded (blob deleted) with a generic toast — not silently marked synced. DELETE is truly unchecked; deleted pins resurrect on server.

### F-21 · high · correctness — Floor-plan pin persistence silently loses data: offline move dropped, undo-timer collision, orphan pins

**Affected units:** C12

**Problem:** InteractiveFloorPlan's pin flows lose data silently: offline move-mode writes nothing (no queued mutation) yet toasts 'Pin moved successfully'; a second quick-delete inside the 5s undo window clears the first pin's pending server delete so that pin resurrects on reload (and the timer is never cleared on unmount); and dismissing the no-footer type-selection dialog strands an already-inserted untitled pin row that later reopens as 'new'.

**Evidence:**

- src/components/InteractiveFloorPlan.tsx:224-234 — floor_plan_pins position update wrapped in `if (isOnline)` with no offline branch
- src/components/InteractiveFloorPlan.tsx:236-238 — loadFloorPlan(), setMoveMode(null), toast.success('Pin moved successfully') run unconditionally
- src/components/InteractiveFloorPlan.tsx:327-329 — any existing undoTimeoutRef is cleared before scheduling the new pin's delete; :341-351 — the actual deletePin call runs only inside the 5-second setTimeout
- src/components/InteractiveFloorPlan.tsx:113-118 — effect cleanup removes only the two supabase channels; undoTimeoutRef never cleared
- src/components/InteractiveFloorPlan.tsx:253,262-263 — addPin(...) inserts the row before setIsModalOpen(true)
- src/components/FloorPlanPinModal.tsx:73-74 — `const isNewPin = !initialData?.title;` selects the 'type' step for the orphaned untitled pin
- src/components/FloorPlanPinModal.tsx:513-514 — DialogFooter rendered only when step === 'details', so the type step has no cancel path

**Verification:** CONFIRMED: All three defects re-verified at cited lines: offline move writes nothing yet toasts success; shared undo timer cancels prior pin's pending server delete on a second quick-delete; untitled row inserted before footer-less type step is stranded on dismissal. High severity is calibrated.

### F-22 · high · error-handling — Site Summary compliance PDF silently generated from partial data

**Affected units:** C14

**Problem:** Only the sites read is error-checked; failed reads of subsections, inspections, site documents, subsection/COC docs, assets, checklist and snags all fall back to `.data || []`, so a plausible-looking compliance PDF missing whole sections is generated and saveable with no warning.

**Evidence:**

- src/components/SiteSummaryReport.tsx:230 — `if (siteRes.error) throw siteRes.error;` is the only error check in the fetch block
- src/components/SiteSummaryReport.tsx:232 — `subsectionsRes.data || []` (error ignored)
- src/components/SiteSummaryReport.tsx:236-250 — inspections/docs/subsection-docs/assets/checklist Promise.all results consumed via `.data || []` with errors never inspected
- src/components/SiteSummaryReport.tsx:256,259,284 — snags, subsection docs and checklist items likewise default to empty arrays

**Verification:** CONFIRMED: Re-verified: only siteRes checked (line 230); all other reads use `.data || []` (232, 249-250, 256, 259, 284). Callers never see these failures; pdfEngine complianceChecks is layout-only. Partial-data compliance PDF (e.g. zero snags, missing COC docs) is generated and saveable with no warning.

### F-23 · high · correctness — Site scoring and nightly snapshots persist wrong numbers: exact-case blocking checks, unordered pagination, unbounded client reads

**Affected units:** L17, A02, V01, H03, C14

**Problem:** Blocking-snag detection is exact-case ('Open' + 'Critical'/'High') two lines from a resolution check documented as case-insensitive "because prod data carries mixed casing", the cron pages eight tables with .range() and no .order(), and the dashboard re-runs the same scan client-side with no bounds and no max_rows override.

**Evidence:**

- src/lib/siteHealth.ts:53-54 — `snag.status === 'Open' && BLOCKING_RISK_LEVELS.includes(snag.risk_level)` (exact case) versus :41-42 isSnagResolved lowercasing both sides with the comment "prod data carries mixed casing (e.g. lowercase \"rectified\")"
- src/lib/siteDeliverables.ts:160 — the same exact-case test two lines after case-insensitive filtering
- src/app/api/snapshots/capture/route.ts:12-19 — fetchAll loops `.select(columns).range(from, from+size-1)` with no .order(), and the rows feed the upsert at :93; supabase/config.toml has no max_rows setting
- src/views/Dashboard.tsx:174-182 — eight unfiltered, un-ranged selects re-run the cron's scan in the browser on every dashboard mount

**Verification:** CONFIRMED: Case-mismatch (siteHealth.ts:53-54, siteDeliverables.ts:160), unordered .range() paging, and unbounded Dashboard selects all verified. Drop two legs: json_data IS read (inspectionHasImages via siteHealth.ts:70/111, siteDeliverables.ts:212); ComplianceDashboard:109 is a documented fail-soft.

### F-24 · high · correctness — Snag demotion in the recompute pipeline can never fire (status vocabulary mismatch)

**Affected units:** D03

**Problem:** `recompute_subsection_installation_status` counts open physical snags with `status in ('open','in_progress')` while the CHECK constraint restricts snags.status to ('Open','Rectified','Closed'), so the case-sensitive match is always empty and open snags never demote installation status or compliance.

**Evidence:**

- supabase/migrations/20260615140000_inspection_status_existence_based.sql:44 — `and sn.status in ('open', 'in_progress')` (case-sensitive IN; 'in_progress' is not even a permitted value)
- supabase/migrations/20260611150000_snag_status_lifecycle.sql:25-26 — `ADD CONSTRAINT snags_status_check CHECK (status IN ('Open', 'Rectified', 'Closed'))` after normalising casing at :11-18, never changed later
- src/lib/siteHealth.ts:35,54 — app-side mirror uses `RESOLVED_SNAG_STATUSES = ['Rectified','Closed']` and `snag.status === 'Open'`, confirming title-case is the live vocabulary

**Verification:** CONFIRMED: Verified at all cited lines. Lowercase IN list can never match the title-case snags vocabulary (CHECK + normalisation, no later migration changes either side); pipeline is live via apply_subsection_recompute + triggers, so v_open_physical is always 0 and snag demotion never fires. High stands.

### F-25 · high · correctness — Subsection verdict always computes with zero COC docs: field-name mismatch

**Affected units:** V07

**Problem:** OverviewTab filters supabaseDocuments on d.category, but the hook's fetch selects only category_id (no category name field is ever attached), so the filter never matches and computeSubsectionVerdict receives cocDocs: [] even when certificates exist — the displayed verdict misreports documentation status.

**Evidence:**

- src/views/subsection-detail/OverviewTab.tsx:68-70 — cocDocs built via `.filter((d: any) => isCocCertificateCategory(d.category || ''))`
- src/views/subsection-detail/useSubsectionDetail.ts:131-135 — fetchSupabaseDocuments selects 'id, file_name, file_url, category_id, uploaded_at, coc_*, parent_document_id'; rows carry no category field and setSupabaseDocuments(data) stores them unenriched (line 138)
- src/lib/cocHierarchy.ts:7-10 — isCocCertificateCategory returns n.includes('coc') …, false for the empty-string fallback

**Verification:** CONFIRMED: Verified: fetch selects only category_id and no code path attaches .category, so the OverviewTab filter always yields empty cocDocs and renders "Initial COC missing/invalid" for every COC-required subsection, contradicting SiteSummaryReport which joins the category name.

### F-26 · high · correctness — Imported COC issued dates are stored one day early in UTC-positive timezones

**Affected units:** L01, V06

**Problem:** parseIssuedDate serialises Date cells with toISOString().slice(0,10) while the importer reads workbooks with cellDates:true, and xlsx 0.18.5 materialises date cells as local midnight — reproduced in this review: a 2024-11-05 cell round-trips to '2024-11-04' under TZ=Africa/Johannesburg.

**Evidence:**

- src/lib/siteCoc/normalize.ts:26 — `if (v instanceof Date …) return v.toISOString().slice(0, 10)`; :33-34 — the string fallback repeats the UTC slice on `new Date(s)`
- src/views/site-coc/useSiteCocImport.ts:14 — `XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true })` feeds Date instances into that parser
- reproduced with the installed dependency (xlsx 0.18.5): a local-midnight 2024-11-05 date cell read back with cellDates:true yields `Tue Nov 05 2024 00:00:00 GMT+0200` → toISOString().slice(0,10) === '2024-11-04'
- src/lib/siteCoc/normalize.test.ts asserts only a UTC-midnight Date, which round-trips correctly, so the suite cannot see the shift

**Verification:** CONFIRMED: Reproduced with installed xlsx 0.18.5: serial 45601 (2024-11-05) reads back as local midnight; under TZ=Africa/Johannesburg parseIssuedDate yields 2024-11-04. Persists to coc_certificates.issued_date via {...c} in ingest.ts:74. Test uses UTC midnight only, so cannot catch it.

### F-27 · high · correctness — Bulk report generator picks arbitrary 'latest' inspection; Stop button inoperative

**Affected units:** C07

**Problem:** The nested inspections select never fetches created_at, so the 'latest inspection' sort compares new Date(0) for every row and an arbitrary (not latest) templated inspection is reported, and the run loop reads shouldStop from the invoking render's closure so Stop never halts a run.

**Evidence:**

- src/components/site/BulkInspectionReportGenerator.tsx:89-102 — nested inspections select lists only id, template_id, status, json_data, inspection_templates; no created_at
- src/components/site/BulkInspectionReportGenerator.tsx:125-127 — sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)) over rows lacking created_at
- src/components/site/BulkInspectionReportGenerator.tsx:406-410 — loop tests `if (shouldStop)`, a useState value captured by the closure of the render that started the run
- src/components/site/BulkInspectionReportGenerator.tsx:449-452 — handleStop only calls setShouldStop(true)/setIsStopping(true); no ref, so the running loop's binding never changes

**Verification:** CONFIRMED: Verified: nested select (87-104) omits created_at, no foreignTable order; sort (125-127) is a no-op so an arbitrary inspection is reported. shouldStop read via stale closure (407); handleStop only sets state, no useRef in file, so Stop never halts. Reachable via SiteReports.tsx:176.

### F-28 · high · correctness — Role change is a non-transactional delete-then-insert on user_roles

**Affected units:** C14

**Problem:** updateUserRole deletes all of a user's user_roles rows then inserts the new role in two independent requests; a failure after the delete leaves the user with no role at all, and onError only shows a toast with no recovery.

**Evidence:**

- src/components/UserRLSPolicies.tsx:112-123 — sequential `.delete().eq('user_id', userId)` then `.insert([...])`, two separate requests, no transaction/RPC
- src/components/UserRLSPolicies.tsx:131-134 — onError: toast.error + console.error only

**Verification:** CONFIRMED: Evidence re-verified at UserRLSPolicies.tsx:112-134. No RPC/trigger/guard refutes it. Aggravating: INSERT RLS requires has_role(uid,'Admin'), so an admin editing their own role deterministically fails the insert after the delete, leaving zero roles; useUserRole maps zero roles to null (lockout).

### F-29 · high · correctness — Reachable admin surfaces are broken: phantom-column site update, links built from params their own mount does not supply, dead controls and fabricated status

**Affected units:** V01, C09, A04, A07, C03, V07, C15, L15

**Problem:** The site edit dialog writes four columns that exist in neither migrations nor generated types; multiple views hard-code client-rooted or contractor URLs that resolve to /clients/undefined or to routes that do not exist; and several controls are inert, mis-targeted, or display invented state.

**Evidence:**

- src/views/SiteDetail.tsx:81-82,722-723 — editFormData carries description/status/location_lat/location_lng; :540 — `supabase.from('sites').update({ ...editFormData })`; src/integrations/supabase/types.ts:2262-2280 — the generated sites Row has no such columns, and the only ALTER TABLE sites migration (20251014132137…:179-185) adds none of them
- src/views/SiteDetail.tsx:685,711,832,834 — `/clients/${clientId}` and `/clients/${clientId}/sites/…` with no fallback, although :642 shows the same file knows clientId can be absent; src/app/(admin)/sites/[siteId]/page.tsx mounts this view with no clientId param
- src/views/InspectionDetail.tsx:2173 — contractor breadcrumb href `/contractor/sites/${siteId}`; `ls src/app/(contractor)/contractor/` shows only inspections, subsections and page.tsx — no sites route
- src/views/TemplateValidator.tsx:139 — navigate(`/inspection-templates/edit/${id}`) while the real path is /[templateId]/edit; src/components/client-portal/SiteOverviewCard.tsx:35 — `${linkPrefix}/${site.id}` with ClientPortalDashboard.tsx:289 passing a linkPrefix that already ends in `?preview=<clientId>`
- src/views/SubsectionDetail.tsx:106 — `<Button variant="outline">Export Reports</Button>` with no onClick; src/views/subsection-detail/OverviewTab.tsx:421-423 — every inspection row renders a hardcoded "Completed" badge
- src/lib/pdfEngine.ts:793-796 — compliance booleans hardcoded true and src/components/DocumentPreviewDialog.tsx:142-145 renders them as a pass count and percentage
- src/lib/pdfTemplateExtractor.ts:10 — workerSrc `//cdnjs.cloudflare.com/…/pdf.worker.min.js`; installed pdfjs-dist is 5.5.207 and ships only .mjs workers, and a live check returned 404 for that .js URL versus 200 for .mjs — reachable from InspectionTemplates.tsx:17,461 → PDFTemplateUploader.tsx:86

**Verification:** CONFIRMED: All 6 sub-claims re-verified. Bare /sites/[siteId] is reachable; no migration adds the 4 phantom columns; the working .mjs workerSrc setters use react-pdf's nested pdfjs-dist, a separate instance, so the extractor's 404 URL stands (retested: .js 404, .mjs 200). Severity high is correct.

### F-30 · high · correctness — Profile link is broken for every Client and Contractor user

**Affected units:** A03

**Problem:** /profile is mounted inside the (admin) route group whose guard redirects Contractor and Client roles away, yet both portal layouts link their profile menu item to /profile, so the two portal user classes can never reach the profile page.

**Evidence:**

- src/app/(admin)/profile/page.tsx:2-3 — /profile lives in the (admin) group and mounts MyProfile
- src/components/ClientPortalLayout.tsx:173 — `<NavLink to="/profile">` in the client portal chrome
- src/components/ContractorPortalLayout.tsx:159 — `onClick={() => navigate("/profile")}` in the contractor portal chrome
- src/components/ProtectedRoute.tsx:19-20 — the (admin) guard redirects role Contractor to /contractor and role Client to /client-portal before the page can render

**Verification:** CONFIRMED: All 4 citations verified. Only /profile route is in (admin); its ProtectedRoute bounces Contractor/Client at lines 19-20. Both portal menus link there. No middleware/rewrite escape. MyProfile is also the only password-change UI, so two user classes lose profile+password self-service.

### F-31 · high · correctness — Migration history cannot rebuild the DB: referenced objects exist only in prod

**Affected units:** D03

**Problem:** Migrations reference `subsections.deleted_at`, `snags.snag_type`, `snags.deleted_at`, `inspections.deleted_at`, `classify_field_status`, `get_compliance_setting_numeric/bool` and the trigger `trg_recompute_from_template`, none of which any tracked migration creates, so a clean apply of the repo's migration history fails.

**Evidence:**

- supabase/migrations/20260612120000_coc_compliance_gate.sql:52,65 — `deleted_at IS NULL` filters on public.subsections; grep shows deleted_at is only ever ADDed to building_assets/tenants (20260612210000_fortress_layer_hardening.sql:42-43)
- supabase/migrations/20260615140000_inspection_status_existence_based.sql:20-23,73 — calls `get_compliance_setting_numeric/bool` and `classify_field_status`; no CREATE FUNCTION for any of them exists in supabase/migrations (repo-wide grep hits only this file and generated types.ts)
- supabase/migrations/20260615140000_inspection_status_existence_based.sql:43-45,54 — reads `sn.snag_type`, `sn.deleted_at`, `i.deleted_at`; grep for CREATE TRIGGER shows only trg_recompute_from_inspections (20260615120000:29), while trg_recompute_from_template has a function body only (20260616100000:14)

**Verification:** CONFIRMED: Clean apply fails at 20260612120000's executed DO block (subsections.deleted_at never created). Missing functions/columns/triggers confirmed absent from tracked history; 20260616100000 itself documents prod drift. Nit: defender-trigger refs are comments only, not live.

### F-32 · high · correctness — Generated types are stale and the build gates are disabled, so live code queries tables the type layer does not know exist

**Affected units:** L19, A02, C14, H03, P01, L22

**Problem:** src/integrations/supabase/types.ts contains no site_health_snapshots (or any fortress table) although three live modules query it — one behind an `as any` cast — and next.config.mjs turns off both TypeScript and ESLint build gates, so this class of drift cannot fail a build; the same drift exists between CSS design tokens and the Tailwind config.

**Evidence:**

- src/integrations/supabase/types.ts — grep for site_health_snapshots and building_assets returns 0 hits, while src/app/api/snapshots/capture/route.ts:93, src/hooks/useSiteScores.ts:26 and src/components/ComplianceDashboard.tsx:110 all query site_health_snapshots (created by supabase/migrations/20260616110000_site_health_snapshots.sql)
- src/components/ComplianceDashboard.tsx:109 — `await (supabase as any).from("site_health_snapshots")`, i.e. the drift is worked around rather than fixed, while useSiteScores.ts uses the typed client (a masked type error)
- next.config.mjs:112-113 — `typescript: { ignoreBuildErrors: true }` and `eslint: { ignoreDuringBuilds: true }`
- src/index.css:50-57 defines --success/--warning/--info (+ -foreground) but grep for success|warning|info in tailwind.config.ts returns 0 hits, while src/views/Sites.tsx:290-292, src/views/Inspections.tsx:354-356, src/views/Calendar.tsx:181-196 and src/components/pdf-editor/SectionEditor.tsx:128,252 use border-warning/text-warning/bg-success/bg-info utilities that therefore emit no CSS

**Verification:** CONFIRMED: Reproduced via tsc --noEmit: useSiteScores.ts:26 fails TS2769 on site_health_snapshots (0 hits in types.ts; column drift too), masked only by ignoreBuildErrors in next.config.mjs; ComplianceDashboard casts as any. Tailwind v3 config lacks success/warning/info tokens used by 4 live files.

### F-33 · high · correctness — No CI and disabled build gates: type errors, lint failures, and the 76-file test suite gate nothing

**Affected units:** P01, P02

**Problem:** Production builds ignore TypeScript errors (109-error recorded baseline) and ESLint failures, seven lint rules are downgraded to warn, no typecheck script exists, and no CI workflow is tracked, so no automated mechanism anywhere runs the 76 vitest files or fails a deploy on a type/lint/test regression.

**Evidence:**

- next.config.mjs:112-113 — `typescript: { ignoreBuildErrors: true }` and `eslint: { ignoreDuringBuilds: true }`
- next.config.mjs:110-111 — comment records baseline: "109 strict-mode type errors and an eslint config issue remain post-Vite-migration"
- eslint.config.mjs:32-38 — seven rules incl. @typescript-eslint/no-explicit-any downgraded to "warn"; only react-hooks/rules-of-hooks stays "error" (eslint.config.mjs:41)
- package.json:5-11 — no typecheck script; "test": "vitest run" (line 10) invoked by no pipeline, hook, or build step
- git ls-files .github → 0 and `ls .github` → no such directory (no CI config tracked); `git ls-files | grep -cE '\.test\.(ts|tsx)$'` → 76
- vercel.json buildCommand is plain `next build`, so the deploy path is equally ungated; no git hooks, husky/lefthook, or npm lifecycle scripts exist

**Verification:** CONFIRMED: All five evidence items re-verified at cited lines. Eslint config's own comment records a prod crash (React #303) from this gap class.

### F-34 · high · missing-tests — No test executes any server-side code, the database layer, the access-control chain, or 16 of 17 offline mutation types — and supabase/ is excluded from every harness

**Affected units:** F01, F02, F03, F04, F05, A02, D01, D02, D03, H01, H02, C10, H03, V01, V06, P02

**Problem:** All 76 tracked test files sit on pure client modules: no test touches the 17 edge functions or the sole Next API route, no SQL/pgTAP test exists for 184 migrations and their RLS churn, no test references any route guard or useUserRole, and every offline-sync test seeds only SYNC_INSPECTION. The harness config makes this structural: ESLint ignores supabase/**, tsconfig excludes supabase, and Vitest includes only src/**.

**Evidence:**

- git ls-files: 76 *.test.ts(x) files, of which only src/components/SiteHealthBadge.test.tsx, src/components/auth/useAuthSession.test.tsx and src/components/fortress/AssetRegister.test.tsx live outside lib/hooks; nothing under src/views or src/app
- git ls-files supabase | grep -i test → nothing: no Deno/pgTAP harness for the 17 functions in supabase/functions or for any migration
- vitest.config.ts:22 — `include: ['src/**/*.test.{ts,tsx}']`; `git ls-files 'supabase/**/*.test.ts'` → 0
- eslint.config.mjs:18-19 — ignores include "supabase/**" and "docs/**"
- tsconfig.json:27-28 — include is `**/*.ts`/`**/*.tsx`, exclude only node_modules+supabase; 7 tracked docs/system-reference/_work/unversioned-prod-functions/*.PULLED-FROM-PROD.ts Deno files fall inside the program instead
- src/hooks/useOfflineSync.ts — 17 `case '…':` labels in the executor, while the only mutation type appearing in the offline-sync tests is 'SYNC_INSPECTION' (8 occurrences, no other type)
- grep of all tracked test files for ProtectedRoute|useUserRole|VisitorRegistrationGate|SessionWatcher returns nothing — the role-routing source of truth and the fail-open guard behaviour are untested
- the untested set includes the blocker paths above (fix-inspection-photos, save-template/template-sync, qr-redirect) and the discard-at-MAX_RETRIES blob-deletion path at src/hooks/useOfflineSync.ts:442-450

**Verification:** CONFIRMED: 76 tests all client-side (3 outside lib/hooks, none in views/app), no supabase/pgTAP/e2e harness for 17 edge fns + 1 API route + 183 migrations, guard grep empty, 17 executor cases with only SYNC_INSPECTION drained. | CONFIRMED: counts fresh (17 functions, 184 migrations, 0 supabase tests, 7 docs Deno files in tsc program). No compensating gate exists: no deno.json/deno check tasks, no CI workflows, no git hooks.

### F-35 · high · duplication — Core concerns are implemented several divergent times: COC vocabulary, pdfmake builders, image compression, IndexedDB managers, and the dead data layer

**Affected units:** L09, L03, L14, L10, H02, L11, L19, V01, V03, L22, V06, C12, C09, C15

**Problem:** The same responsibilities exist in parallel copies that disagree — at least four COC pass/fail vocabularies plus three verdict classifiers, two pdfmake builder families exporting the same names with behavioural drift (pdfTemplates' footer is unclamped and calls formatPdfDate() with no argument, rendering an em-dash in shipped footers), six canvas compressors and two HEIC converters with contradictory failure semantics, two IndexedDB managers hardcoding one schema, and a sanctioned data layer with zero consumers beside the N+1 it was written to replace.

**Evidence:**

- src/lib/cocCompliance.ts:6-7 (FAILED_VALUES/PASS_VALUES) vs src/lib/complianceCalculations.ts:33,38 (VALID_/FAILED_COC_STATUSES, case-sensitive) vs src/lib/cocHierarchy.ts:13,39 (CocDocStatus + lowercase-normalising matcher) vs src/lib/siteCoc/statusDisplay.ts:4-26 (prefix classifiers), with opposite expiry semantics between cocCompliance.ts:31 and cocHierarchy
- src/lib/pdfMakeUtils.ts:96,379,452,594 and src/lib/pdfTemplates.ts:48,239,337,466 — createCoverPage, createSectionHeader, createPageFooter and createStatusBadge exported by both modules with different implementations and split consumers
- src/lib/pdfTemplates.ts:262 prints raw `Page ${currentPage} of ${pageCount}`; :268 calls formatPdfDate() with no argument — pdfBranding.ts:338-340 delegates to reportKernel.ts:28 whose missing-input fallback is '—'; complianceReportGenerator.ts:321 uses this unclamped footer
- src/hooks/useOfflinePhotos.ts:58, src/hooks/useOfflineInspectionDetail.ts:377, src/hooks/useImageUpload.ts:25, src/lib/simpleImageLoader.ts:68, src/lib/pdfEngine.ts:162, src/lib/imageUrlResolver.ts:123 — six canvas compressors (two both named compressImageBlob, differing in size/quality AND return type) that variously reject, resolve the original, or resolve null on failure; useCamera.ts:16 returns the original file on HEIC failure while useImageUpload.ts:91 throws
- src/lib/offlineDB.ts:2,7 and src/lib/offlineInspectionDB.ts:2,7 — two managers hardcoding DB_NAME 'wm_compliance_offline' and DB_VERSION 5 with "MUST match" comments recording a prior production VersionError; both create a 'mutations' store that no code ever opens
- src/lib/pdfBars.ts:47,82 vs src/lib/siteCoc/siteCocReport.ts:94,112 — miniBar/gaugeBar implemented twice; pdfBars.ts:5-14 header says 'Lifted from … siteCocReport.ts' yet grep for 'pdfBars' in siteCocReport.ts returns 0 hits; pdfBars.ts:20 vs statusDisplay.ts:1 — Tone type declared twice
- src/lib/data/** has zero importers outside itself, while its docstring target — per-row `.createSignedUrl(path, 3600)` — is still copy-pasted in 9 tracked files (Sites, SiteDetail, ClientPortalSites, ClientPortalSiteDetail, ClientPortalDashboard, AdminContractorPreview, PublicClientPortfolio, InspectionDetail, useContractorSites)
- src/components/FloorPlanViewer.tsx:12, src/components/DocumentPreviewDialog.tsx:32, src/components/site/SchematicDiagram.tsx:66, src/lib/pdfTemplateExtractor.ts:10, src/lib/pdf/advancedProcessor.ts:13 — five independent pdfjs workerSrc assignments in three patterns

**Verification:** CONFIRMED: All six evidence bullets re-verified at cited lines. Divergences are behavioural: 'pass' valid in cocHierarchy, invalid in complianceCalculations; opposite expiry semantics; dual IDB managers caused a prior VersionError; lib/data has zero external importers while its target N+1 persists in 9+ files. One raw sub-claim falsified and excluded: cocCompliance.ts is NOT dead. | CONFIRMED: drift is live — complianceReportGenerator.ts:321 renders '—' in shipped footers.

### F-36 · medium · schema-mismatch — user_roles permits multiple rows per user while every reader assumes exactly one

**Affected units:** C10, V05, F01

**Problem:** The table is UNIQUE(user_id, role) with no unique constraint on user_id alone. A second row makes maybeSingle()/single() error, locking an admin out of invite-user and delete-user and making ProtectedRoute fall through to the admin shell.

**Evidence:**

- supabase/migrations/20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql:5-11 — UNIQUE(user_id, role) only (verified: no unique constraint on user_id alone)
- grep unique/constraint on user_roles across supabase/migrations — only a FK addition in 20251020093858:24
- src/hooks/useUserRole.tsx:45-52 — `.maybeSingle()` then `if (error) throw error`
- src/views/auth/useRoleRedirect.ts:16-20 — `.maybeSingle()` on user_roles

### F-37 · medium · input-validation — invite-user accepts an undefined role and looks up users unpaginated/case-sensitively

**Affected units:** F01

**Problem:** There is no role allowlist or presence check: the pending-invite caller omits role, so the auth user is created and the user_roles insert then violates NOT NULL, leaving an orphan account. listUsers() is unpaginated with a case-sensitive === match.

**Evidence:**

- src/views/Users.tsx:261-263 — invoke body is only { email, fullName }; no role sent
- supabase/functions/invite-user/index.ts:206-229 — role destructured but never validated for presence or membership
- supabase/migrations/20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql:8 — `role app_role NOT NULL`, no default
- supabase/functions/invite-user/index.ts:423-431 — createUser runs before the role insert at 471-481 that would fail

### F-38 · medium · access-control — Onboarding gate is not awaited and is skipped entirely on the admin preview path

**Affected units:** C02, C10

**Problem:** The guards destructure only data and refetch from useOnboardingStatus, so protected children render while the query is in flight and whenever it resolves to null. The Admin ?preview= branches return children raw, bypassing the gate and orphan modal.

**Evidence:**

- src/components/ProtectedRoute.tsx:12 — destructures only `{ data: onboardingStatus, refetch }`; no isLoading
- src/components/auth/OnboardingGate.tsx:17 — `const show = !!onboardingStatus && !onboardingStatus.onboarding_completed && !dismissed;`, so null renders children ungated
- src/components/auth/useOnboardingStatus.ts:15-22 — `if (!user) return null;` and `const { data } = ...` discards the select error, with `.single()` returning null for a missing profile row
- src/components/ClientProtectedRoute.tsx:23 — `if (userRole === "Admin" && previewClientId) return <>{children}</>;` before OnboardingGate

### F-39 · medium · rls-pii — access_link_visitors accepts unauthenticated PII inserts with WITH CHECK (true)

**Affected units:** C10

**Problem:** The anon INSERT policy has no predicate and access_link_id is nullable, so anyone can write unlimited name, email, phone and user-agent rows unattached to a real link. VisitorRegistrationGate posts from public pages with no captcha or rate limit.

**Evidence:**

- supabase/migrations/20260217082506_a2247d71-37f4-49d4-bb28-fbb9724692fd.sql:20-22 — `CREATE POLICY "Anyone can register as visitor" ON public.access_link_visitors FOR INSERT WITH CHECK (true);`
- supabase/migrations/20260217082506_a2247d71-37f4-49d4-bb28-fbb9724692fd.sql:4 — access_link_id is nullable (REFERENCES … ON DELETE CASCADE, no NOT NULL)
- src/components/VisitorRegistrationGate.tsx:89-97 — anon insert of first_name, last_name, email, phone, role, user_agent
- src/components/VisitorRegistrationGate.tsx:62-81 — validation is client-side only

### F-40 · medium · audit-integrity — log-auth-event: anon audit writer with client-controlled IP and bypassable limit

**Affected units:** F01, L13

**Problem:** verify_jwt=false plus Access-Control-Allow-Origin:* makes the audit endpoint internet-callable. ip_address comes from the first X-Forwarded-For hop, which the client supplies, so rows can be forged with any IP and the 20/min bucket rotated at will.

**Evidence:**

- supabase/config.toml:65-66 — [functions.log-auth-event] verify_jwt = false
- supabase/functions/log-auth-event/index.ts:92-93 — `ipAddress = forwardedFor?.split(',')[0]?.trim() || 'unknown'`, the caller-supplied hop
- supabase/functions/log-auth-event/index.ts:95 — checkRateLimit keyed on that same spoofable value
- supabase/functions/log-auth-event/index.ts:146-152 — ip_address persisted raw and untruncated into auth_events

**Verification:** ADJUSTED: Mechanics verified (config.toml:65-66; index.ts:92-93,95,112-116). But user_id forced NULL (:124,139-141), 3 anon types only, ip_address is INET so only valid IPs persist, RLS user_id=auth.uid() hides NULL rows, nothing in src/ reads auth_events. Append-only pollution, no consumer.

### F-41 · medium · audit-integrity — Queued auth-audit events are replayed under whichever session is current

**Affected units:** L13, F01

**Problem:** The retry queue stores only event_type and metadata, while log-auth-event derives user_id from the caller's JWT. A logout event that failed for user A is drained after user B signs in on the same browser and is written against B.

**Evidence:**

- src/lib/auth-audit.ts:101-103 — the queued entry is `{ event_type, metadata, queued_at: Date.now() }`; no user id captured
- src/lib/auth-audit.ts:83-85 — `void drainQueue().catch(() => {})` runs at module load regardless of who is signed in
- src/lib/auth-audit.ts:91-96 — a successful send immediately drains the backlog under the new session
- supabase/functions/log-auth-event/index.ts:132-137 — userId taken from the presented JWT

### F-42 · medium · privacy — access_link_visitors accepts anonymous PII inserts under WITH CHECK (true), behind a client-side-only gate, with no retention or erasure path

**Affected units:** C10, V04, D02

**Problem:** access_link_visitors accepts anonymous INSERTs of four NOT NULL PII fields (plus IP and user-agent) with no captcha, no rate limit and no server-side validation, while the "registration required" gate renders only after the public payload has already been fetched and is satisfied by a sessionStorage entry; neither this table nor auth_events (which deliberately retains rows after account deletion) has any retention or erasure mechanism in the schema.

**Evidence:**

- supabase/migrations/20260217082506_a2247d71-37f4-49d4-bb28-fbb9724692fd.sql:5-12,19-21 — NOT NULL first_name/last_name/email/phone plus ip_address/user_agent; `CREATE POLICY "Anyone can register as visitor" ON public.access_link_visitors FOR INSERT WITH CHECK (true)` with no TO clause (re-verified verbatim during consolidation)
- src/components/VisitorRegistrationGate.tsx:89 — direct `supabase.from("access_link_visitors").insert({...})` from the unauthenticated page, with no captcha component in the file
- src/components/VisitorRegistrationGate.tsx:32,37,106 — registration state is a sessionStorage 'visitor_session' entry read in the browser
- src/views/PublicSiteReview.tsx:184 — get_public_site_review is called and stored before any gate check; :273 — the gate renders only when `!visitorRegistered && linkId && !error`

**Verification:** ADJUSTED: Evidence verified; no later migration/trigger tightens it. But SELECT is admin-only (no PII leak), pre-gate payload is already token-authorized, so impact caps at spam/forged rows in an admin-only access log; repo's phase-1 security review triaged this as intentional low-impact log-forging.

### F-43 · medium · configuration — Deployment config drift: dead function-registry entries, three 301s to a deleted route, fail-open CRON_SECRET guard on a service-role write path, split captcha contract, no security headers

**Affected units:** D04, P01, P02, A02, F02, C06, A01, A09

**Problem:** supabase/config.toml declares four functions that have no source directory and omits send-password-reset which does; three permanent redirects point at a route that was deleted, so legacy URLs 301 into a 404 browsers cache indefinitely; the snapshot-capture cron guard compares against `Bearer ${process.env.CRON_SECRET}` — literally "Bearer undefined" when unset — gating a service-role, RLS-bypassing upsert, with CRON_SECRET absent from .env.example; the captcha contract is split across two unlinked env flags so the documented "captcha disabled" configuration can never submit; and no CSP/X-Frame-Options/HSTS is set anywhere.

**Evidence:**

- supabase/config.toml:15,18,27,46 — entries for validate-coc, extract-coc, verify-fix, detect-schematic-regions; `ls supabase/functions` lists 17 directories and none of these; the same file has no [functions.send-password-reset] block although supabase/functions/send-password-reset/ exists
- next.config.mjs:129-131 — three `permanent: true` redirects with `destination: '/feedback-management'` (re-verified verbatim); `find src/app -type d -iname '*feedback*'` → 0 matches and `git grep -ln "feedback-management" -- src` → 0 hits (feature dropped by supabase/migrations/20260612230000_drop_feedback_feature_tables.sql)
- next.config.mjs:132-134 — contrast: the other three redirects target /portal-management, which exists at src/app/(admin)/portal-management
- src/app/api/snapshots/capture/route.ts:37 — guard is `req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`` (re-verified verbatim); template interpolation of an unset env var yields the string "Bearer undefined"

**Verification:** ADJUSTED (CRON leg): Fail-open confirmed (route.ts:37; no middleware; CRON_SECRET absent from .env.example and arch-doc env inventory). But exploit needs service key set + CRON_SECRET unset, that state 401s the nightly cron visibly, and the bypass only triggers the fixed no-input snapshot job — contained, so medium.

### F-44 · medium · dead-code — Large unwired subsystems ship to production: the whole Fortress building layer, the OCR pipeline, the data-repository layer, download-handoff, storage-quota tools, unreachable views and in-app live-DB test runners

**Affected units:** D03, D04, L20, L06, C01, C04, C15, V02, V03, C13, P01, L15, C12, C07, L12, L18, L19, L17, L04

**Problem:** Multiple whole subsystems are shipped with no live wiring: a 12-table Fortress layer with a 463-row real-data seed has no consumer and its self-declared 'single source of truth' calculators (buildingCompliance.ts, ppm.ts) have zero non-test importers while running on a self-described PLACEHOLDER type scaffold that omits the soft-delete filter its own contract mandates; the four-module src/lib/pdf OCR pipeline has zero importers and a stubbed recognizer returning []; the /download route polls a store whose only writer is module-private with zero callers; storageQuota's clearOldOfflineData deletes nothing yet toasts success; the src/lib/data repository (whose README bans direct supabase.from() calls that 34 files make) has zero external consumers; five exported validation schemas have zero importers; fourteen ui-kit modules and six admin/portal views are unreachable; and two admin routes ship a 710-line live-DB test runner and an AI code-review tool.

**Evidence:**

- supabase/migrations/20260612200000_fortress_building_layer.sql (12 CREATE TABLE statements) plus hardening/RLS migrations and supabase/seeds/fortress_abaqulusi_seed.sql exist, but grep for `.from('building_assets'|'ohs_…'|'ppm_…'|'tenants'|'security_incidents'…)` across src and supabase/functions returns nothing, the tables are absent from generated types, and src/components/fortress/AssetRegister.tsx's only importer is its own test
- src/lib/fortress/buildingCompliance.ts:1-2 and src/lib/fortress/ppm.ts:1-3 — 'single source of truth … screen and PDF both import it' headers (re-verified verbatim), yet `git grep ppmSummary|buildingCompliance|complianceBySection -- src` outside src/lib/fortress and tests returns only a comment at src/lib/complianceCalculations.ts:69 (re-verified); AssetRegister.tsx:8 imports only types
- src/lib/fortress/types.ts:1-4 — 'PLACEHOLDER scaffold' comment (re-verified verbatim); src/lib/ppm.ts has 0 grep hits for deleted_at against src/lib/fortress/types.ts:33 'reads MUST filter deleted_at IS NULL'
- `git grep -n "lib/pdf/" -- src` outside src/lib/pdf → 0 tracked hits (re-verified during consolidation); src/lib/pdf/ocrEngine.ts:121-125 — 'return empty - actual OCR would require Tesseract.js' → `return [];`; src/lib/pdf/advancedProcessor.ts:12-14 — module-load cdnjs pdf.worker.min.js URL against the installed pdfjs-dist ^5.4.296

### F-45 · medium · correctness — batch-compress-images: continuation token can never be sent back, wrong counters, costly probes

**Affected units:** F04, C05

**Problem:** The bulk job returns a continuationToken that the request type has no field to accept and that the UI's invoke body never sends, while the UI tells the user 'Run again to continue processing' — so each run restarts the listing from the beginning and files beyond the first pages are never reached; the same function under-counts skips in dry runs, downloads whole objects just to test existence, hardcodes a _compressed.jpg path regardless of detected content type, classifies any size-less storage item as a folder, and always reports success: true.

**Evidence:**

- supabase/functions/batch-compress-images/index.ts:324 vs 8-16 — `continuationToken: `offset_${limit}`` is returned while BatchCompressRequest declares only bucket/prefix/maxWidth/quality/minSizeKB/dryRun/limit (both re-verified verbatim), so the remainder can never be processed
- src/components/settings/ImageCompressionManager.tsx:48-57 — the invoke body contains only bucket/maxWidth/quality/minSizeKB/dryRun/limit (re-verified); no continuation value is ever sent back
- src/components/settings/ImageCompressionManager.tsx:247-251 — result.continuationToken is used solely to render 'More files available. Run again to continue processing.'
- supabase/functions/batch-compress-images/index.ts:212-221 — dry-run pushes status 'skipped' without incrementing the skipped counter (incremented only at 190, 207, 267)

### F-46 · medium · inconsistency — Contradictory COC and metering status vocabularies yield divergent compliance verdicts across surfaces

**Affected units:** L09, L03, L17

**Problem:** At least four independently-declared COC status vocabularies and two metering predicates coexist with contradictory semantics — expiry gates in cocFailsGate but is ignored in cocDocFails; Approved/Valid pass in complianceCalculations but are excluded by kpiMetrics' lowercase-'pass' check; kpiMetrics claims COC-required counting but never filters; a 'Pending'/no-serial subsection is compliant per subsectionCompliance yet unmetered per siteHealth — so different screens/PDFs disagree on identical rows.

**Evidence:**

- src/lib/complianceCalculations.ts:33,38 — VALID_COC_STATUSES ['Approved','Valid','Pass'] / FAILED_COC_STATUSES with case-sensitive includes (:45,:53)
- src/lib/cocHierarchy.ts:39-44 — normalizeCocDocStatus lowercases the same values; :52-54 — cocDocFails returns only cocStatus==='Fail', expiry ignored (register-truth comment :46-51)
- src/lib/cocCompliance.ts:27-33 — cocFailsGate fails a required expired Pass — opposite expiry semantics to cocDocFails
- src/lib/kpiMetrics.ts:16-22 — comment claims 'COC-required' counting but code never checks is_coc_required and accepts only lowercase 'pass'; callers pass unfiltered arrays (src/lib/siteCoc/reportKpis.ts:68, src/components/ComplianceDashboard.tsx:137)

**Verification:** ADJUSTED: Citations verify, but sharpest legs are not live: cocFailsGate has zero prod callers (DB gate dropped expiry in 20260612), and the 20260725 rollup normalizes all coc_status values, making Approved/Valid latent. Live divergence is contained (KPI expiry filter, metering split). Drift hazard: medium.

### F-47 · medium · correctness — COC ingestion pipeline: inconsistent normalisation keys, unchecked write ordering, and find-or-create races

**Affected units:** L01, L04, L14

**Problem:** mergeCertificates keys on raw shop numbers instead of normShop (splitting metadata from verdict on format variants) and collapses empty cert numbers onto one overwriting key; assignPoolFile's eval-parent lookup filters coc_number with the raw cert string while every other comparison uses normCert, inserts the doc row before unchecked cert/pool linkage writes, and re-stamps duplicates only for kind 'coc'; and both findOrCreateCategory and pdfDocumentSaver's category lookup are read-then-insert with no conflict handling.

**Evidence:**

- src/lib/siteCoc/parseWorkbooks.ts:120-121 — mergeKey uses shop_no_raw.toUpperCase().trim(); normShop (src/lib/siteCoc/normalize.ts:1-4) collapses [\s\-_]+ and is the norm used for shop matching elsewhere
- src/lib/siteCoc/parseWorkbooks.ts:126,136 — byKey.set overwrites on key collision; parsers skip only fully-empty rows (:59,:92), so empty-cert_no rows collide on `shop||type`
- src/lib/coc/assignPoolFile.ts:54 — .eq("coc_number", certNo) with the raw value while :18,:22,:33 compare cert_no_norm via normCert; :48-65 — doc insert precedes stampCert and the pool-row update, both awaited without error checks; :59-62 — dupe path re-stamps coc_status only when kind==='coc'
- src/lib/coc/uploadCocFiles.ts:14-24 — findOrCreateCategory is select-then-insert with no unique-violation handling

### F-48 · medium · correctness — Compliance figures overstated: pending counted as clear in the COC PDF, metering rate can exceed 100%

**Affected units:** L03, L09

**Problem:** The COC report model counts every required tenant without a fail-verdict cert as 'clear' — including pending/review/CV — and the narrative labels that count 'clear (Pass)' while ruleFill paints empty/unknown rule cells pass-green; separately, calculateCocComplianceStats counts metering installs over all subsections but divides by the COC-required count, so the metering rate exceeds 100% whenever metered subsections outnumber COC-required ones.

**Evidence:**

- src/lib/siteCoc/cocReportModel.ts:111 — clear = tenants where !noCoc && no fail-verdict cert; review/cv/pending verdicts qualify
- src/lib/siteCoc/siteCocReport.ts:188 — narrative renders `${s.clear} are clear (Pass)`
- src/lib/siteCoc/siteCocReport.ts:16 — ruleFill returns FILL.pass for any value other than FAIL/CV/N-A, including the empty not-captured cell (glyph '·' at :15)
- src/lib/complianceCalculations.ts:91-93,101 — meteringInstalledCount filters the full subsections array, then meteringComplianceRate divides it by cocRequiredCount

### F-49 · medium · correctness — Snag risk badges always render the low-risk palette due to key-casing mismatch

**Affected units:** L15

**Problem:** RISK_COLORS is keyed lowercase (high/medium/low) but indexed with the capitalized risk values the render spec types and the report feeds ('High'/'Medium'/'Low'), so every snag badge in subsection-card PDFs falls back to the blue low-risk palette.

**Evidence:**

- src/lib/subsectionCardSpec.ts:78-82 — RISK_COLORS keys are high/medium/low (lowercase)
- src/lib/pdfSubsectionRenderer.ts:284 — `RISK_COLORS[snag.riskLevel] || RISK_COLORS.low`
- src/lib/siteSummaryRenderSpec.ts:296 — riskLevel typed 'High' | 'Medium' | 'Low' | null
- src/components/SiteSummaryReport.tsx:197 — feeds capitalized values: `riskLevel: s.risk_level || 'Medium'`

### F-50 · medium · security — Document upload validation is extension-only and allow-lists SVG into a public bucket

**Affected units:** L05

**Problem:** validateUploadFile derives type solely from the filename extension — MIME type and content are never checked — and allow-lists svg, so script-bearing SVGs or arbitrarily mislabeled files pass validation into the 'documents' bucket whose objects are exposed via permanent public URLs.

**Evidence:**

- src/lib/documents/uploadConstraints.ts:11 — `const ext = file.name.split('.').pop()?.toLowerCase() ?? ''`; file.type never read in the validator
- src/lib/documents/uploadConstraints.ts:5 — 'svg' in ALLOWED_EXTENSIONS
- src/lib/documents/documentMutations.ts:46 — relocated objects re-exposed via getPublicUrl on the 'documents' bucket

### F-51 · medium · error-handling — documentMutations: batch-move path collisions and inconsistent storage-origin handling

**Affected units:** L05

**Problem:** moveDocuments stamps one shared timestamp for the whole batch, so two same-named docs moved into one category build identical storage paths and the second upload fails (upsert:false); delete guards on 'supabase.co/storage' while rename/move accept any URL containing '/documents/'; and success-path old-object removals are fire-and-forget, silently orphaning storage objects.

**Evidence:**

- src/lib/documents/documentMutations.ts:116-121 — one `now` passed to every moveOne; src/lib/documents/paths.ts:42-47 — buildMovePath is `${timestamp}-${sanitizeSegment(fileName)}` under the same category folder
- src/lib/documents/documentMutations.ts:44 — relocateObject uploads with `upsert: false`, so the colliding second upload throws 'Could not write the file to its new location.'
- src/lib/documents/documentMutations.ts:127 vs paths.ts:3-8 — deleteOne additionally requires file_url to include 'supabase.co/storage'; rename/move accept anything storagePathFromUrl parses ('/documents/' substring)
- src/lib/documents/documentMutations.ts:107 — `.remove([oldPath]).catch(() => {})` with result never inspected

### F-52 · medium · correctness — PDF/QR generation stack is untyped (`any`) end-to-end and QR generation collapses all failures to null

**Affected units:** L14, L10, L15, L16

**Problem:** pdfMakeConfig aliases TDocumentDefinitions/Content/StyleDictionary/TableLayout to any, four downstream generators re-declare `type Content = any`, and qrStickerSheet builds an any-typed docDefinition — so no doc-definition structure on this critical path is type-checked — while generateAndUploadQRCode returns the same bare null for every failure mode (canvas, blob, upload, table update) with console-only logging.

**Evidence:**

- src/lib/pdfMakeConfig.ts:13-16 — all four exported pdfmake types are `any` aliases
- src/lib/calendarReportGenerator.ts:16, src/lib/fortressChecklistReportGenerator.ts:18, src/lib/floorPlanReportGenerator.ts:29, src/lib/pdfmakeInspectionReport.ts:27 — local `type Content = any` (grep-verified)
- src/lib/qrStickerSheet.ts:17,25 — `const rows: any[]` and `const docDefinition: any`
- src/lib/qrCodeGenerator.ts:170-180 — single outer catch logs and `return null`; Promise<string | null> carries no cause

### F-53 · medium · correctness — Report-generator contracts and hygiene: dead options, phantom result fields, UTC filename stamps, in-place mutation of caller data

**Affected units:** L10, L15, L14

**Problem:** accentColor is accepted by the inspection cover page and subsection card header but never read where it lands; three generators forward a previewUrl the engine never returns (always undefined); the save wrapper declares documentId no code path sets and destructures only subsectionId; three generators stamp filenames with UTC ISO dates against the unit's own local-date standard; and floorPlanReportGenerator/pdfTemplateExporter sort caller-owned arrays in place.

**Evidence:**

- src/lib/pdfmakeInspectionReport.ts:269,1449,1476 — accentColor parameter passed into createEngineeringCoverPage and never referenced in its body (grep: only hits 100/269/1449/1476); src/lib/pdfSubsectionRenderer.ts:47,77 — threaded into createCardHeader, unused inside
- src/lib/calendarReportGenerator.ts:96, src/lib/fortressChecklistReportGenerator.ts:108, src/lib/inspectionTemplateReportGenerator.ts:95 — forward result.previewUrl; src/lib/pdfEngine.ts:806-813 returns only {blob, filename, complianceChecks} with a comment explaining object URLs are intentionally not created
- src/lib/pdfmakeInspectionReport.ts:1553,1558 — return type declares documentId?; only `const { subsectionId } = options` is destructured
- src/lib/complianceReportGenerator.ts:327, src/lib/floorPlanReportGenerator.ts:445, src/lib/fortressChecklistReportGenerator.ts:104 — `new Date().toISOString().split('T')[0]` (UTC) in filenames vs documentDesignStandards.ts:406 localDateStamp

### F-54 · medium · correctness — Offline IndexedDB layer: uncached init, two-transaction read-modify-write, hand-synced duplicate schema, @ts-ignore private access

**Affected units:** L11

**Problem:** offlineDB.init() caches no in-flight promise so concurrent first calls each open the database and replace this.db without closing prior handles; markInspectionSynced/updateCachedInspectionData do get-then-put across two separate transactions (lost-update window); two connection managers hardcode the same DB name/version and duplicate the full store schema with comments demanding manual sync; and offlineDBExtensions/offlineFloorPlanDB read offlineDB's private db field through @ts-ignore.

**Evidence:**

- src/lib/offlineDB.ts:146-160 — init() creates a fresh indexedDB.open per call, no promise cache; contrast src/lib/offlineInspectionDB.ts:186-194 which caches initPromise with an identity-guarded failure reset
- src/lib/offlineInspectionDB.ts:265-284 — markInspectionSynced and updateCachedInspectionData read via getCachedInspection then write via cacheInspection in separate transactions
- src/lib/offlineInspectionDB.ts:1-7 — 'MUST match offlineDB.ts DB_VERSION… neither clobbers the other's schema'; offlineDB.ts:162+ carries the parallel onupgradeneeded store creation
- src/lib/offlineInspectionDB.ts:206-211 — cacheInspection's comment documents that resolving pre-commit 'would otherwise report a false success', a protection its sibling writes lack

### F-55 · medium · correctness — Image-rename skip check never matches generated paths, so every run re-copies all photos

**Affected units:** L12

**Problem:** renameInspectionImages skips a photo only when its path contains sanitized client AND site names, but generateInspectionImagePath emits `${inspectionId}/${sectionKey}/${itemKey}/${timestamp}[_i].ext` with no names embedded, so each run re-downloads/re-uploads every image to a new timestamp path and rewrites its URL, and imageUrlResolver's recovery regex only matches the legacy four-number pattern.

**Evidence:**

- src/lib/imageNaming.ts:186-187 — skip requires oldPath.includes(sanitizeForFileName(clientName)) && includes(sanitizeForFileName(siteName))
- src/lib/imageNaming.ts:32-49 — generator destructures only inspectionId/sectionKey/itemKey/index/fileExtension and embeds no names
- src/lib/imageNaming.ts:196-217 — non-skipped photos renamed to a fresh Date.now() path and URLs replaced on every run
- src/lib/imageUrlResolver.ts:47 — recovery regex `_(\d+)_(\d+)_(\d+)_(\d+)\.` cannot match generator output `timestamp[_index].ext`

### F-56 · medium · correctness — success/warning/info theme tokens unmapped in Tailwind and the dark-theme block is unreachable

**Affected units:** L22

**Problem:** index.css defines --success/--warning/--info tokens in both themes but tailwind.config.ts maps none of them, so classes like text-success and bg-info/10 used in Calendar emit no CSS and status colouring is silently absent; meanwhile darkMode is class-based but nothing in the app ever toggles a dark class, and the .dark values for these tokens are byte-identical to the light values.

**Evidence:**

- src/index.css:50-57 and :98-105 — --success/--warning/--info (+ -foreground) defined identically in :root and .dark
- tailwind.config.ts — zero occurrences of success/warning/info (grep-verified); :4 `darkMode: ["class"]`
- src/views/Calendar.tsx:181,183,192,196 — returns `text-warning`, `text-success`, `bg-success/10 text-success`, `bg-info/10 text-info`
- grep across src for classList dark-toggle/ThemeProvider/data-theme — only hit is src/components/ui/sonner.tsx importing useTheme from next-themes with no provider mounted

### F-57 · medium · duplication — Three conflicting type sources for site entities with wrong nullability on COC fields

**Affected units:** L22

**Problem:** src/types/site.ts hand-duplicates the generated Supabase Rows with stricter nullability than the DB guarantees (coc_status/metering_status/is_coc_required declared non-null against `| null` columns), is consumed by 10 files in preference to the generated types, and coexists with further same-named local interface redefinitions in individual views.

**Evidence:**

- src/types/site.ts:25-28 — `coc_status: string; metering_status: string; … is_coc_required: boolean`
- src/integrations/supabase/types.ts:2565,2576,2579 — generated subsections Row: `coc_status: string | null`, `is_coc_required: boolean | null`, `metering_status: string | null`
- grep 'types/site' across src — 10 importing files
- src/components/site/SchematicDiagram.tsx:76 and src/views/ClientDetail.tsx:37 — same-named local `interface Subsection` redefinitions

### F-58 · medium · correctness — Public QR verdict renders an expired COC Pass as "Compliant"

**Affected units:** L17

**Problem:** presentVerdict's expiry hint uses `days < 30`, which is also true for negative days, so a Pass whose expiry is already past shows "Compliant" with "COC expiry date approaching — re-verification pending" on the public QR card; an unparseable expiry_date (NaN) silently renders a plain pass, and the raw millisecond division means the 30-day boundary shifts with the time of day in `today`.

**Evidence:**

- src/lib/publicVerdict.ts:31-38 — `days = (new Date(v.expiry_date).getTime() - today.getTime()) / 86_400_000; if (days < EXPIRY_HINT_DAYS)` → headline "Compliant" for any expired Pass; NaN fails the comparison and falls through to plain pass
- src/lib/publicVerdict.ts:33 — raw ms division with no date normalization

### F-59 · medium · correctness — Asset-verification pipeline integrity: cross-section header adoption, fabricated compliance checks, ambiguous 'verified'

**Affected units:** L08

**Problem:** parseAssetRows adopts a column map from any row containing 'premises id' — even inside the WATER section or before any section marker, with a hardcoded column-1 fallback — the report's compliance-check object hardcodes eight of nine flags to literal true, and the 'verified' table includes discrepancy rows (any inspection match) while summary.verified and verificationPct count only no-discrepancy assets, leaving stats.verified and withImages dead.

**Evidence:**

- src/lib/assetVerification.ts:217-226 — hasPremisesId check and columnMap rebuild run before any section test; :229 — the electrical/header guard applies only to data rows; :231 — `columnMap["premisesid"] ?? columnMap["premiseid"] ?? 1` positional fallback
- src/lib/assetVerificationReportGenerator.ts:72-82 — createComplianceResult called with 8 literal-true flags; only logoPlacement computed
- src/lib/assetVerificationReportModel.ts:87-88 — verifiedRows filter is `r.verified` (set from any inspection match, assetVerification.ts:177 `verified: !!inspectionMatch`) so mismatch rows are included; :76,:80 — verificationPct and summary.verified use stats.verifiedNoDiscrepancy
- src/lib/assetVerificationReport.ts — zero references to withImages (grep-verified)

### F-60 · medium · error-handling — password-strength permanently caches a rejected zxcvbn import and propagates the rejection

**Affected units:** L18

**Problem:** loadZxcvbn assigns its memo promise before the async IIFE resolves and never clears it on rejection, and evaluatePassword awaits it with no catch, so a single failed dynamic import permanently rejects every subsequent password evaluation for the session — violating the module's own stated best-effort contract.

**Evidence:**

- src/lib/password-strength.ts:23-42 — zxcvbnPromise assigned immediately and only null-checked; no rejection handler resets it (contrast offlineInspectionDB.ts:187-193 which documents exactly this reset pattern)
- src/lib/password-strength.ts:77-80 — evaluatePassword does `await loadZxcvbn()` with no try/catch
- src/lib/password-strength.ts:11-12 — header contract: 'Both checks are best-effort. A network failure … must not block the user'

### F-61 · medium · correctness — Duplicated non-transactional cascade deletes with no storage cleanup

**Affected units:** V01, V07, V02

**Problem:** Subsection deletion runs six parallel child-table deletes plus the parent delete with no transaction, duplicated verbatim in two files; partial failure strands a half-deleted subsection, document blobs and QR assets are never removed from storage, client deletion likewise orphans logo objects, and contractor site reassignment is a two-request delete-then-insert with no atomicity.

**Evidence:**

- src/views/SiteDetail.tsx:387-404 — Promise.all deletes over subsection_documents/inspection_items/snags/inspections/qr_scans/document_categories, then subsections delete; no transaction/RPC, no storage.remove call
- src/views/subsection-detail/useSubsectionDetail.ts:531-547 — identical Promise.all + subsections delete duplicated verbatim, also without storage cleanup
- src/views/Clients.tsx:329-342 — handleDelete removes only the clients row; client-logos storage objects remain
- src/views/Users.tsx:450-463 — contractor reassignment deletes all user_sites rows then inserts new ones across two non-atomic requests

**Verification:** ADJUSTED: All 4 citations verified, but DB FKs ON DELETE CASCADE cover all six child tables (5 direct, inspection_items transitive; migrations 20251014140001/20251014123510), so the parent delete alone is atomic; stranding needs a mixed-failure race. Storage orphans and non-atomic user_sites swap confirmed.

### F-62 · medium · correctness — Workbook import auto-matches shops against soft-deleted subsections

**Affected units:** V06

**Problem:** The import's subsections query omits the deleted_at filter that useSiteCoc and the DB recompute loops apply, so schedule rows can be stamped to soft-deleted subsections (which also pass the validSubIds check) that the tab's subsection options cannot display or resolve.

**Evidence:**

- src/views/site-coc/useSiteCocImport.ts:45-46 — select id, name, tenant_name with no deleted_at condition; :65 — validSubIds built from the same unfiltered list
- src/views/site-coc/useSiteCoc.ts:42 — the same table queried with .is("deleted_at", null) for the UI's subsection options
- supabase/migrations/20260725100000_coc_register_truth.sql:109 — DB recompute iterates subsections WHERE deleted_at IS NULL, confirming soft-delete is live

### F-63 · medium · correctness — Snag-status vocabulary inconsistent across the three public views

**Affected units:** V04

**Problem:** Each public view classifies resolved snags differently: PublicSiteReview's open filter misses lowercase 'closed', while PublicSubsectionReview's KPIs lowercase-normalize but its badges require exactly 'rectified', and PublicSubsection mixes both approaches — so one snag can read resolved and open on the same page.

**Evidence:**

- src/views/PublicSiteReview.tsx:221 — `!['Rectified', 'Closed', 'rectified'].includes(s.status)` — status 'closed' counts as open
- src/views/PublicSubsectionReview.tsx:252-260 — KPI counters lowercase-normalize and treat 'rectified'/'closed' as resolved
- src/views/PublicSubsectionReview.tsx:552,731,736-739 — badges/cards test `snag.status === 'rectified'` exactly; 'Rectified'/'Closed' render destructive/open
- src/views/PublicSubsection.tsx:231-235 vs 357 — openSnags lowercases, badge tests 'Rectified'/'Closed'/'rectified' literals, omitting lowercase 'closed'

### F-64 · medium · error-handling — Unguarded failure paths in public/entry views strand or crash the page

**Affected units:** V04

**Problem:** A bare JSON.parse inside a render IIFE throws on malformed template_sections and knocks the whole share page to the root error fallback (no segment-level error.tsx exists), Auth.tsx void-calls its async token handlers with no catch so an unexpected throw leaves the visitor on the loading spinner, and Index.tsx ignores the role query's resolved error, silently routing role-less resolutions to /dashboard.

**Evidence:**

- src/views/PublicSubsectionReview.tsx:849-851 — `typeof templateSections === 'string' ? JSON.parse(templateSections) : ...` with no try/catch, inside the render IIFE at 846
- src/app/providers.tsx:16 — only the root ErrorBoundary wraps all segments; find over src/app returns no error.tsx or global-error.tsx anywhere
- src/views/Auth.tsx:48,54 — `void handleInviteToken(...)` / `void handleRecoveryToken(...)`; handlers at 79-120 have no try/catch around awaited SDK calls, and the component renders only LoadingState (line 122)
- src/views/Index.tsx:20-24 — destructures `{ data: roleData }` only; a resolved `{ error }` yields roleData null → else-branch navigate('/dashboard') at 30-32

### F-65 · medium · security — Plaintext credential surfaces: temp passwords in toasts, API secret rendered

**Affected units:** V02

**Problem:** Users.tsx prints temporary passwords in 10-second toasts on both create and reset flows; APIClients renders the stored client_secret behind an eye toggle (from a select('*') over api_clients) despite its own one-time-display claim; and password inputs enforce minLength 6 against an 8-char handler policy.

**Evidence:**

- src/views/Users.tsx:325-328 — toast.success(`User created! Temporary password: ${data.temporaryPassword}`, { duration: 10000 })
- src/views/Users.tsx:391-394 — reset flow toasts `Password reset! Temporary password: ${data.temporaryPassword}`
- src/views/APIClients.tsx:273-288 — list renders `Secret: {showSecrets[client.id] ? client.client_secret : ...}` with copy button; fetches use .select("*") (lines 50, 62)
- src/views/APIClients.tsx:177 — creation card claims 'This is the only time you'll see the client secret'

### F-66 · medium · duplication — Copy-pasted logic drifted: signed-URL block x9, getStatusColor x3, orphan matcher x3

**Affected units:** V01, V03, V07

**Problem:** The site-images signed-URL rewrite is re-implemented in nine files, the contractor status-color helper in three views, and the orphan-inspection shop-number matcher in three files — each copy free to drift independently, and the snag-status drift in the public views shows this failure mode is already live.

**Evidence:**

- grep split('/site-images/') — 9 hits: Sites.tsx:82, SiteDetail.tsx:452, InspectionDetail.tsx:890, ClientPortalSites.tsx:41, ClientPortalSiteDetail.tsx:55, ClientPortalDashboard.tsx:134, AdminContractorPreview.tsx:43, PublicClientPortfolio.tsx:131, src/hooks/useContractorSites.tsx:9
- src/views/ContractorPortal.tsx:67, src/views/ContractorSiteDetail.tsx:78, src/views/ContractorSubsectionDetail.tsx:110 — three separate const getStatusColor implementations
- src/views/ClientPortalSubsectionDetail.tsx:96, src/views/ContractorSubsectionDetail.tsx:64, src/views/subsection-detail/useSubsectionDetail.ts:254 — three copies of the json_data.generalInfo.shopNumber orphan-matcher

### F-67 · medium · correctness — Inspection report attributes the site name as the client name

**Affected units:** V01

**Problem:** InspectionDetail passes clientName={siteData?.siteName} into ComprehensiveInspectionReport although siteData.clientName exists and is used correctly elsewhere in the same file, so generated inspection reports carry the site name in the client slot; the dead rename helper repeats the same swap in both argument positions.

**Evidence:**

- src/views/InspectionDetail.tsx:2218 — clientName={siteData?.siteName} on the ComprehensiveInspectionReport mount, while lines 484, 525, 1221 correctly use siteData?.clientName
- src/views/InspectionDetail.tsx:1601-1605 — renameInspectionImages(inspectionId!, siteData.siteName || 'unknown-client', siteData.siteName || 'unknown-site', …) passes siteName into both the clientName and siteName parameters (signature at src/lib/imageNaming.ts:157-163)

### F-68 · medium · performance — Unbounded reads on hot paths: 8 full-table row scans, client-side counting, N+1

**Affected units:** V01, V03, V02

**Problem:** The admin landing page fetches every row of eight tables with no filter or range for triage, the client-portal dashboard downloads every snag row for its subsections to count open ones in JS (adjacent queries use head-count correctly), and the users page issues three follow-up queries per profile row per page.

**Evidence:**

- src/views/Dashboard.tsx:174-183 — Promise.all of row-unbounded select() over sites, subsections, snags, inspections, site_schematics, site_assets, site_documents, subsection_documents
- src/views/ClientPortalDashboard.tsx:73-78 — selects all snag rows for every client subsection then filters with isSnagOpen client-side, while the upcoming-inspections count just above (65-70) uses { count: 'exact', head: true }
- src/views/Users.tsx:203-205 — in-code comment confirms the N+1 role / client / site lookups run for each of the current page's profiles

### F-69 · medium · correctness — Inline metering upload silently discards files and skips the hook's safeguards

**Affected units:** V07

**Problem:** CocMeteringTab's inline metering upload no-ops with zero user feedback when no category named '04 Metering' exists (the chosen file is silently dropped), applies no size cap, and inserts uploaded_by: user?.id without an auth check — unlike the hook's handleDocumentUpload, which enforces 50 MB and authenticated user.

**Evidence:**

- src/views/subsection-detail/CocMeteringTab.tsx:285-287 — documentCategories.find(cat => cat.name === '04 Metering'); if (meteringCategory) { … } closes at line 334 with no else branch
- src/views/subsection-detail/CocMeteringTab.tsx:308-319 — uploaded_by: user?.id inserted with no null guard and no size validation anywhere in the handler
- src/views/subsection-detail/useSubsectionDetail.ts:734-738 — hook's handleDocumentUpload enforces the 50 MB cap; :766-767 — throws 'User not authenticated' on null user

### F-70 · medium · inconsistency — Stale generated Supabase types worked around with as-any casts on critical paths

**Affected units:** V01, V07, V02

**Problem:** Columns added by later migrations (is_thermal_required, coc_expiry_date, coc_failure_reasons, is_inspection_required) are missing from the generated types, forcing as-any casts in the dashboard triage fetch, the subsection-detail hook, and the user_roles write path — removing type checking exactly where role assignments and compliance flags are written or read.

**Evidence:**

- src/views/Dashboard.tsx:186-188 — in-code comment: 'generated Supabase types predate the is_thermal_required column'; subs cast as any[]
- src/views/subsection-detail/useSubsectionDetail.ts:282-289 — (fullSubsection as any).coc_expiry_date, .coc_failure_reasons, .is_thermal_required, .is_inspection_required
- src/views/Users.tsx:423, src/views/Users.tsx:431 — user_roles update and insert payloads cast as any

### F-71 · medium · correctness — TemplateBuilder drops shop-board tenants; DynamicFieldManager stuck upload flag and stale-closure image loss

**Affected units:** C15

**Problem:** TemplateBuilder's tenants TabsContent accepts names containing 'main board' or 'shop board' while the tab trigger and save payload use the main-board-only templateSupportsTenants predicate, so shop-board tenants have no reachable tab and are dropped to undefined on save; DynamicFieldManager's native picker path returns early on zero files without clearing the field's uploading flag (buttons stuck at 'Uploading…') and handleImageUpload rebuilds state from the render-time fields snapshot so multi-file uploads keep only the last file's image.

**Evidence:**

- src/components/TemplateBuilder.tsx:375 — content gate: templateName includes 'main board' || 'shop board'
- src/components/TemplateBuilder.tsx:259-261 — TabsTrigger gated by templateSupportsTenants(...)
- src/components/TemplateBuilder.tsx:178 — save: tenants kept only when templateSupportsTenants({ name: templateName })
- src/lib/templateTenants.ts:16 — templateSupportsTenants matches only 'main board'

### F-72 · medium · correctness — ServiceWorkerUpdater auto-reloads hidden tab, discarding non-form state; toast and listener leaks

**Affected units:** C13

**Problem:** When an update is ready and the tab goes hidden the component reloads immediately, guarded only by a focused-form-element check, so unsaved application state outside a focused input is discarded; the Infinity-duration toast is never dismissed and statechange listeners are never removed in cleanup.

**Evidence:**

- src/components/ServiceWorkerUpdater.tsx:47-50,98-101 — reload fires when visibilityState === 'hidden' && !isEditing()
- src/components/ServiceWorkerUpdater.tsx:37-42 — isEditing checks only focused INPUT/TEXTAREA/SELECT/contentEditable
- src/components/ServiceWorkerUpdater.tsx:54-58 — toast(..., { duration: Infinity }) with no dismissal in cleanup
- src/components/ServiceWorkerUpdater.tsx:66-72,109-113 — statechange listeners added in watchInstalling never removed; cleanup removes only visibilitychange, interval, updatefound

### F-73 · medium · inconsistency — SiteReports' local category list diverges from canonical; 3 report types invisible

**Affected units:** C08

**Problem:** SiteReports filters site_documents with a local 7-name category list while the canonical SYSTEM_REPORT_CATEGORIES has 9; reports saved under Site Drawing Reports, Marking Checklists or Generated Reports never match the filter, and the local list adds a 'Compliance Reports' name absent from the canonical source of truth.

**Evidence:**

- src/components/site/SiteReports.tsx:43-51 — local REPORT_CATEGORIES: 7 names including 'Compliance Reports'
- src/components/site/SiteReports.tsx:69 — .in('category', REPORT_CATEGORIES) on the site_documents fetch
- src/lib/documents/reportCategories.ts:5-15 — SYSTEM_REPORT_CATEGORIES declared 'single source of truth': 9 names incl. Site Drawing Reports, Marking Checklists, Generated Reports; no Compliance Reports

### F-74 · medium · correctness — 'Clear All' deletes every site_assets row while dialog promises electrical only

**Affected units:** C07

**Problem:** handleDeleteAllAssets deletes site_assets filtered by site_id alone with no asset_category predicate, while the confirmation dialog states it will delete 'all {N} electrical meters' — any non-electrical asset rows are destroyed beyond the stated scope.

**Evidence:**

- src/components/site/AssetVerification.tsx:273 — supabase.from('site_assets').delete().eq('site_id', siteId) with no category predicate
- src/components/site/AssetVerification.tsx:456-459 — AlertDialog copy: 'This will permanently delete all {electricalAssets.length} electrical meters from this site.'
- src/components/SiteSummaryReport.tsx:245 — corroboration that site_assets carries multiple asset_category values (query filters .eq('asset_category', 'electrical_meter'))

### F-75 · medium · dependencies — pdf.js worker loaded from unpkg CDN at module scope in two viewers

**Affected units:** C09, C12

**Problem:** SchematicDiagram and FloorPlanViewer both set pdfjs.GlobalWorkerOptions.workerSrc to an unpkg.com URL as a module-load side effect, giving schematic and floor-plan PDF rendering a hard third-party CDN runtime dependency that fails offline despite the app's PWA/offline layer.

**Evidence:**

- src/components/site/SchematicDiagram.tsx:66 — workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs` at import time
- src/components/FloorPlanViewer.tsx:12 — workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs` at module scope (FloorPlanMiniMap's react-pdf rendering rides the same global)

### F-76 · medium · error-handling — Silent failure handling across shared panels: errors swallowed, UI fakes success or emptiness

**Affected units:** C05, C11, C14

**Problem:** Multiple shared panels swallow failures and mislead the user: AutoLogoutSettings hides fetch errors (console.error only) and flips the toggle before bailing out unpersisted when settings is null; ContractorPortalLayout toasts 'Logged out successfully' and navigates regardless of signOut's result and discards its profile query error; and RecentAssignmentsWidget, UserRLSPolicies and ComplianceDashboard render query/RPC failures identically to empty data.

**Evidence:**

- src/components/settings/AutoLogoutSettings.tsx:59-63 — fetch catch: console.error only; loading cleared; defaults rendered
- src/components/settings/AutoLogoutSettings.tsx:91-94 — setEnabled(checked) before `if (!settings?.id) return;`, no revert or toast on that path
- src/components/ContractorPortalLayout.tsx:76-79 — `await supabase.auth.signOut(); toast.success(...); navigate(...)` with no error branch
- src/components/ContractorPortalLayout.tsx:58-64 — profile read destructures only `data`; error silently dropped

### F-77 · medium · inconsistency — Shared layout drift across portals: one query key with divergent queryFns, admin Home link in portal breadcrumbs

**Affected units:** C11

**Problem:** Three layouts register the same ['current-user-profile'] react-query key with divergent queryFns — AppSidebar/ClientPortalLayout use a 3-column select that throws while ContractorPortalLayout uses select('*') and swallows errors — so cached shape and error semantics depend on which surface fetched last; and the shared Breadcrumbs component hardcodes its Home crumb to the admin-only /dashboard route while mounted in client- and contractor-portal views.

**Evidence:**

- src/components/AppSidebar.tsx:80-95 — key ['current-user-profile'], select('full_name, avatar_url, email'), `if (error) throw error`
- src/components/ClientPortalLayout.tsx:47-60 — same queryKey and 3-column select registered by the client layout
- src/components/ContractorPortalLayout.tsx:52-66 — same key with .select('*') and the error discarded
- src/components/Breadcrumb.tsx:26-32 — hardcoded `<Link to="/dashboard">` Home crumb

### F-78 · medium · performance — Unfiltered app-wide realtime subscriptions on floor_plan_pins

**Affected units:** C12

**Problem:** The floor-plan screen's pins channel omits its filter on first mount while floorPlan is null (firing for every subsection's pins app-wide, per its own in-code comment) and reloads the floor plan twice per mount as the id arrives, while FloorPlanStatsWidget's channel has no filter at all and re-queries stats on every pin change anywhere in the app.

**Evidence:**

- src/components/InteractiveFloorPlan.tsx:66-75 — filter conditionally spread only when floorPlan?.id exists; comment at :72-73 admits the channel otherwise fires app-wide
- src/components/InteractiveFloorPlan.tsx:60-61,118 — effect deps [subsectionId, floorPlan?.id] re-run loadFloorPlan when the id arrives
- src/components/FloorPlanStatsWidget.tsx:52-67 — channel on floor_plan_pins with event '*' and no filter; every payload triggers loadStats()

### F-79 · medium · inconsistency — Pin status union copy-pasted in four files with contradictory semantics

**Affected units:** C12

**Problem:** The 5-value pin status union is re-declared identically in four components with no shared type, and the widgets disagree on meaning: 'finished' is grouped as done in the pins list but excluded from the stats widget's completion rate and still counted overdue there.

**Evidence:**

- src/components/FloorPlanViewer.tsx:20, src/components/FloorPlanPinsList.tsx:26, src/components/FloorPlanMiniMap.tsx:12, src/components/FloorPlanPinModal.tsx:21 — identical 'open'|'in_progress'|'finished'|'closed'|'resolved' declarations
- src/components/FloorPlanPinsList.tsx:81 — finished/closed/resolved grouped together as done
- src/components/FloorPlanStatsWidget.tsx:225-227 — completionRate divides only statusBreakdown.closed by totalPins
- src/components/FloorPlanStatsWidget.tsx:126-131 — overdue check excludes only closed/resolved, so past-due 'finished' pins count overdue

### F-80 · medium · missing-tests — One test across the shared-component units; all data-mutating panels untested

**Affected units:** C01, C05, C11, C12, C14, C16, C17

**Problem:** Across the seven shared-component units the only test is SiteHealthBadge.test.tsx; the panels performing destructive writes — role delete/insert, asset clear-all delete, floor-plan pin CRUD with undo timers — have zero test coverage.

**Evidence:**

- find src/components -name '*.test.*' — exactly 3 files: SiteHealthBadge.test.tsx (in-scope), auth/useAuthSession.test.tsx (C02), fortress/AssetRegister.test.tsx (C06)
- src/components/UserRLSPolicies.tsx:112-123, src/components/site/AssetVerification.tsx:273, src/components/InteractiveFloorPlan.tsx:341-351 — destructive mutation paths verified above with no referencing test

### F-81 · medium · correctness — Floor-plan markups/measurements never reach the server yet the UI promises sync

**Affected units:** H01, H02

**Problem:** Markups and measurements exist only in IndexedDB (the sync executor's cases make no Supabase call) while toasts say 'Will sync when online', and the synced/queue logic is inverted — offline creations get synced:true and no queued mutation — so any cache clear (including the settings-gated daily auto-logout) erases them.

**Evidence:**

- src/hooks/useOfflineFloorPlanAnnotations.ts:208,254 — `synced: !isOnline` marks offline-created markups/measurements as already synced
- src/hooks/useOfflineFloorPlanAnnotations.ts:213-215,259-261 — mutation enqueued only `if (isOnline)`; :217,263 toast 'saved offline. Will sync when online.' on the offline branch that queues nothing
- src/hooks/useOfflineSync.ts:293-317 — ADD_MARKUP/ADD_MEASUREMENT only mark the local record synced ('stored locally only for now' comments at :295,:308); DELETE_MARKUP/DELETE_MEASUREMENT only delete local records
- src/lib/offlineDB.ts:2,214-224 — markups/measurements stores live in 'wm_compliance_offline' (offlineFloorPlanDB.ts reuses offlineDB's handle), which src/lib/cacheUtils.ts:41-44 deletes; wired to daily auto-logout at src/components/SessionWatcher.tsx:54

**Verification:** ADJUSTED: All cited evidence verified (inverted synced:!isOnline, isOnline-gated enqueue, no-op executor, cache-clear deletes store). But the markup/measurement functions have zero callers — InteractiveFloorPlan uses only pins — so no UI can create the data or show the toast. Latent dead-code trap: medium.

### F-82 · medium · correctness — Role/client/contractor query hooks cache under keys that omit user identity

**Affected units:** H03

**Problem:** useClientInfo and useContractorSites cache under keys holding only the preview id, omitting the user id and the userRole their queryFns branch on, with no enabled gate — a fetch racing an unresolved role caches the wrong branch under the same key — and the auth-change purge never covers contractor-sites, so a user switch can serve the previous user's site list.

**Evidence:**

- src/hooks/useUserRole.tsx:64 — useClientInfo key `["user-client-info", previewClientId]`; :66 fetches auth.getUser() and :70 branches on `userRole === "Admin" && previewClientId`, neither in the key; no `enabled` gate (options end at :94)
- src/hooks/useContractorSites.tsx:30-36 — key `["contractor-sites", previewSiteId]` while the queryFn depends on `user.id` (:32) and `userRole` (:36); no `enabled` gate (options end at :71)
- src/hooks/useUserRole.tsx:29-31 — auth-change purge removes only `user-role`, `onboarding-status`, `user-client-info`; `contractor-sites` is never purged, and the purge lives in a per-mount useEffect subscription (:11-38) so it fires only while a useUserRole mounter is on screen

**Verification:** ADJUSTED: All citations verify, but every consumer mounts behind ClientProtectedRoute:16/ContractorProtectedRoute:17, which block until userRole resolves — the wrong-branch race is unreachable. Missing contractor-sites purge + SPA sign-out is real but transient (staleTime-0 refetch, 5-min gc, RLS). Medium.

### F-83 · medium · error-handling — Sync executor reports success for unchecked pin deletes and unknown mutation types

**Affected units:** H01

**Problem:** DELETE_FLOOR_PLAN_PIN never checks the Supabase delete result (every other DB case throws), so a server failure still deletes the local pin and dequeues the mutation as succeeded; unknown mutation types are warn-logged, counted as succeeded, and silently removed from the persisted queue.

**Evidence:**

- src/hooks/useOfflineSync.ts:284-289 — delete result not destructured or checked; local deleteOfflinePin runs unconditionally
- src/hooks/useOfflineSync.ts:399-400 — default case console.warns and resolves; :438-439 executeMutation resolution adds the id to `succeeded`; :458-461 reconciliation removes it from the persisted queue

### F-84 · medium · correctness — UPLOAD_IMAGE marks an arbitrary image record as synced (lookup by inspection, not image)

**Affected units:** H01, H02

**Problem:** The UPLOAD_IMAGE executor marks the first unsynced image whose inspection_id matches as synced, not the image actually uploaded, because the queued mutation carries no image id; with multiple queued images per inspection the wrong records get flagged synced.

**Evidence:**

- src/hooks/useOfflineSync.ts:137-141 — `images.find(img => img.inspection_id === inspectionId)` then markImageSynced on that arbitrary first match
- src/hooks/useOfflineInspections.ts:153 — queueUpload('UPLOAD_IMAGE', { bucket, path, inspectionId }, file) omits the `offline_img_...` id created at :143-151

### F-85 · medium · correctness — Offline cache coherence gaps: stale records, double-persisted blobs, skipped invalidation, dead API surface

**Affected units:** H01, H02

**Problem:** Offline inspection update/delete queue the mutation without touching the saved IndexedDB record (stale offline reads), uploadImage persists the blob twice, a drain pass containing any retried/discarded item skips react-query cache invalidation even for its successes, and useOfflineInspectionDetail exposes an isLoading that is never set plus unused autoCache and supabase imports.

**Evidence:**

- src/hooks/useOfflineInspections.ts:80-83,101-103 — offline UPDATE/DELETE paths only queueMutation; contrast createInspection :51-57 which writes offlineDB.saveInspection
- src/hooks/useOfflineInspections.ts:143-153 — blob saved via offlineDB.saveImage (:144-151) then again via queueUpload → putQueuedBlob (useOfflineSync.ts:92-94)
- src/hooks/useOfflineSync.ts:463-465 — invalidateQueries runs only when `retried.size === 0 && discarded.size === 0 && succeeded.size > 0`
- src/hooks/useOfflineInspectionDetail.ts:24 — setIsLoading declared, never called anywhere in the file (grep-verified); :15,20 autoCache accepted and never referenced; :3 supabase imported with zero other uses (grep-verified)

### F-86 · medium · error-handling — Global search discards all query errors and filters client-side after limit(10)

**Affected units:** H03

**Problem:** Every Supabase query in useGlobalSearch and useSearchFilterOptions destructures only { data }, so failures render as silent empty results; the clientIds filter for subsections/inspections runs in JS after limit(10), dropping already-fetched matches while later-page matches are never retrieved.

**Evidence:**

- src/hooks/useGlobalSearch.ts:69 — `const { data: clients } = await clientQuery;` (error never read); same pattern at :97, :129, :188 and in useSearchFilterOptions (:239-243, :250-256)
- src/hooks/useGlobalSearch.ts:123 — `.limit(10)` on subsections, then :131-138 client-side `filters.clientIds` filter (comment: 'Apply client filter manually since we can't do nested filtering')
- src/hooks/useGlobalSearch.ts:172 — `.limit(10)` on inspections, then :190-197 the same post-fetch filter

### F-87 · medium · observability — QR scan analytics silently incomplete: failed, site and retired scans unlogged

**Affected units:** F02

**Problem:** logScan never inspects the insert's resolved { error } (supabase-js does not throw, so its catch is unreachable for failed inserts), the ?site= branch logs nothing, and qr_disabled redirects return before logScan runs.

**Evidence:**

- supabase/functions/qr-redirect/index.ts:53-58 — await supabase.from('qr_scans').insert({...}) result discarded; catch at 59-61 only fires on throw, which supabase-js query builders do not do
- supabase/functions/qr-redirect/index.ts:91-104 — site branch 302s at 100-103 with no logScan call
- supabase/functions/qr-redirect/index.ts:67-74 — qrDisabled path returns at 69-72; logScan is only invoked at line 74 after that return

### F-88 · medium · error-handling — report-issue: orphaned public uploads on insert failure, silent photo drops

**Affected units:** F02

**Problem:** Photos upload to the public bucket before the snags insert with no cleanup when the insert throws, disallowed/oversize photos are skipped with only photosSaved as signal, the siteverify fetch has no timeout, and the throttle map never evicts keys.

**Evidence:**

- supabase/functions/report-issue/index.ts:79-95 then 97-105 — storage uploads complete before supabase.from('snags').insert; if (insErr) throw insErr at 105 leaves uploaded files with no removal
- supabase/functions/report-issue/index.ts:82 — if (!ext || photo.size > 5 * 1024 * 1024) continue; silent skip; response reports only photosSaved (107)
- supabase/functions/report-issue/index.ts:60-64 — Turnstile siteverify fetch has no timeout/AbortSignal
- supabase/functions/report-issue/index.ts:43,23-30 — missing x-forwarded-for collapses all callers to shared key 'unknown'; recent map keys pruned only on re-hit, never deleted

### F-89 · medium · security — oauth-token has no rate limiting and logs only successful grants

**Affected units:** F03

**Problem:** The unauthenticated token endpoint accepts unlimited credential-grant attempts and writes an api_request_logs row only after success, so failed-credential floods are both unthrottled and invisible in the audit trail.

**Evidence:**

- supabase/functions/oauth-token/index.ts:10-122 — handler contains no rate-limit structure of any kind (contrast supabase/functions/send-password-reset/index.ts:11-29, which implements a per-IP limiter, showing the pattern exists in this repo)
- supabase/functions/oauth-token/index.ts:42-47,58-63 — invalid_client and invalid_grant return before any logging
- supabase/functions/oauth-token/index.ts:94-102 — the only api_request_logs insert sits after all failure returns and hardcodes status_code: 200
- supabase/functions/oauth-token/index.ts:76-83 — each successful grant inserts a new api_access_tokens row and nothing prunes expired rows

### F-90 · medium · correctness — Refresh-token rotation deletes the old token before the new one is written

**Affected units:** F03

**Problem:** On a refresh_token grant the existing token row is deleted and the replacement inserted as two unguarded statements, so an insert failure leaves the client holding neither a valid access token nor a refresh token.

**Evidence:**

- supabase/functions/oauth-token/index.ts:66 — await supabase.from("api_access_tokens").delete().eq("id", tokenData.id); with its error result discarded
- supabase/functions/oauth-token/index.ts:76-91 — the replacement insert runs afterwards and can return 500 server_error with no compensating restore
- supabase/functions/oauth-token/index.ts:110 — clientRecord.scopes.join(" ") runs unguarded after the writes; api_clients.scopes is nullable (migration 20260110172925…sql:8 has a DEFAULT but no NOT NULL), so a null there throws after the rotation already happened

### F-91 · medium · correctness — save-template's delete branch is unreachable; deletes execute as updates

**Affected units:** F03

**Problem:** Branch ordering means action:'delete' with a template id falls into the UPDATE branch and overwrites the row with the request payload, while action:'delete' without an id returns 400 — the DELETE code at 81-90 can never run.

**Evidence:**

- supabase/functions/save-template/index.ts:56 — first branch action === 'create' || (!template.id && action !== 'delete')
- supabase/functions/save-template/index.ts:68-79 — second branch action === 'update' || template.id performs the UPDATE and reports action: 'updated'
- supabase/functions/save-template/index.ts:81-90 — third branch action === 'delete' && template.id is only reached if both prior conditions are false, which cannot happen when template.id is truthy
- supabase/functions/save-template/index.ts:42-52 — the UPDATE payload rewrites name/category/sections/cover_page/tenants from the request, so a delete-shaped payload overwrites live template content (e.g. sections falls back to [])

### F-92 · medium · error-handling — api-reports returns 200 for missing records and mis-logs every request as 200

**Affected units:** F03

**Problem:** Report queries discard their error field and fall back to empty objects, so a nonexistent or unreadable id returns HTTP 200 with an empty payload, while the audit row is inserted before routing with a hardcoded status_code of 200.

**Evidence:**

- supabase/functions/api-reports/index.ts:138-149 — const { data: inspection } = await supabase...single(); then inspection: inspection || {} returned with 200
- supabase/functions/api-reports/index.ts:162-192,205-228,241-264 — same || {} / || [] pattern in the other three report types; no error variable is destructured anywhere
- supabase/functions/api-reports/index.ts:295-320 — the base64 generator prints "N/A" for every field, so an empty result is indistinguishable from a real report
- supabase/functions/api-reports/index.ts:69-77 — api_request_logs insert with status_code: 200 executes before the router, so subsequent 400/404 responses are recorded as successes

### F-93 · medium · error-handling — templates endpoint silently serves an empty catalogue when its queries fail

**Affected units:** F03

**Problem:** All seven parallel table reads destructure only data, so a query error yields zero counts and empty availableItems in a 200 response indistinguishable from genuinely empty tables.

**Evidence:**

- supabase/functions/templates/index.ts:383-399 — const [{ data: sites }, { data: subsections }, ...] = await Promise.all([...]) — no error field captured for any of the seven queries
- supabase/functions/templates/index.ts:402-403 — new Map(sites?.map(...) || []) fallback masks the failure
- supabase/functions/templates/index.ts:338-341 — no method routing beyond OPTIONS: POST/PUT/DELETE receive the same catalogue as GET

### F-94 · medium · dead-code — compress-image writes uncompressed duplicates that nothing reads

**Affected units:** F04

**Problem:** When transformation is unavailable the function still uploads the original bytes under a _compressed name with no size guard, and no app code ever reads _compressed objects.

**Evidence:**

- supabase/functions/compress-image/index.ts:107-108,139-141 — compressedData is initialised to the original buffer and only the log line notes the fallback
- supabase/functions/compress-image/index.ts:154-159 — the upload runs unconditionally, with no compressedSize < originalSize guard (contrast batch-compress-images/index.ts:260)
- src/hooks/useImageUpload.ts:193-195,241 — every inspection-photos upload fire-and-forgets compress-image
- src/hooks/useImageUpload.ts:248-252 — the caller's data?.success branch is empty; grep for _compressed across src matches only status-enum strings in src/components/settings/ImageCompressionManager.tsx:17,91,232

### F-95 · medium · boundaries — Webhook registration is a no-op stub; outbound calls unsigned and untimed

**Affected units:** F03, F05

**Problem:** POST /webhook/register returns success while persisting nothing, mutation notifications go to an env-var URL with no signature and no timeout, and the AI gateway call in offline-review is likewise untimed.

**Evidence:**

- supabase/functions/template-sync/index.ts:290-314 — registration only console.logs; the in-file comment says it "should be stored in the database", yet the response is success: true, "Webhook registered successfully"
- supabase/functions/template-sync/index.ts:358-379 — notifyWebhook POSTs the template payload to DOCBUILDER_WEBHOOK_URL with only X-Webhook-Event/X-Source headers, no signature, no AbortSignal, no retry
- supabase/functions/template-sync/index.ts:381-388 — non-ok and thrown webhook results are logged and swallowed, so the mutation response never reflects delivery failure
- supabase/functions/offline-review/index.ts:128-143 — fetch("https://ai.gateway.lovable.dev/v1/chat/completions", ...) has no timeout signal (contrast supabase/functions/compress-image/index.ts:123-125 which uses AbortSignal.timeout(30000))

### F-96 · medium · privacy — offline-review relays arbitrary user content to a third-party AI gateway

**Affected units:** F05

**Problem:** Any authenticated user can post unbounded text through offline-review to ai.gateway.lovable.dev, with no payload size limit, no rate limit and no record of what was sent.

**Evidence:**

- supabase/functions/offline-review/index.ts:42-47 — the only body validation is !codeFiles || codeFiles.length === 0; element shape and total size are unchecked
- supabase/functions/offline-review/index.ts:109-114 — every file's full content is inlined into the user prompt
- supabase/functions/offline-review/index.ts:128-143 — the assembled prompt is POSTed to the external gateway with max_tokens: 8000 and no per-caller quota
- supabase/functions/offline-review/index.ts:49,179 — logging records only file count, score and prompt presence; no correlation id and no record of the submitted payload

### F-97 · medium · privacy — PII handling inconsistent across the edge surface: raw IPs and logged emails vs POPIA-truncated qr_scans

**Affected units:** F01, F02, F03

**Problem:** qr-redirect truncates IPv4 to /24 citing 'POPIA: no precise-IP retention' while log-auth-event and api-reports persist raw client IPs under the same anonymous surface, and three auth functions log target email addresses into edge logs.

**Evidence:**

- supabase/functions/qr-redirect/index.ts:44-52 — POPIA comment plus IPv4 last-octet masking (and IPv6 nulled) before writing qr_scans.ip_address
- supabase/functions/log-auth-event/index.ts:92-93,143-149 — x-forwarded-for first hop stored raw and untruncated in auth_events.ip_address (nulled only when the header is absent)
- supabase/functions/api-reports/index.ts:69-77 — api_request_logs insert captures x-forwarded-for/cf-connecting-ip, user-agent and query params raw
- supabase/functions/invite-user/index.ts:214 — console.log of target email and role; supabase/functions/send-password-reset/index.ts:201 — logs the recipient email; supabase/functions/send-email/index.ts:84,99 — logs recipients

### F-98 · medium · error-handling — No shared auth/error contract across the edge functions

**Affected units:** F01, F02, F03, F05

**Problem:** Authentication and authorization failures return HTTP 400 in the admin functions while anonymous-facing functions return raw error.message bodies in their 500 handlers, so status codes and error shapes carry no consistent meaning.

**Evidence:**

- supabase/functions/invite-user/index.ts:693-704 — every failure, including missing JWT and non-admin caller, returns status 400 with the raw error message
- supabase/functions/delete-user/index.ts:96-108 — same pattern: catch-all 400 for missing header, invalid JWT and non-admin
- supabase/functions/qr-redirect/index.ts:227-234 — anonymous callers receive { error: error.message } with status 500
- supabase/functions/template-sync/index.ts:347-354 and supabase/functions/api-reports/index.ts:284-291 — catch-alls return the raw message to unauthenticated callers

### F-99 · medium · boundaries — All route access control is client-side; no middleware or server gating

**Affected units:** A01, A03, A04, A05, A06, A07

**Problem:** All admin, client-portal, and contractor routes are gated only by client-side guard components; no src/middleware.ts exists, so route shells are served to any requester and enforcement rests entirely on Supabase RLS.

**Evidence:**

- `git ls-files 'src/middleware*'` returns nothing (re-verified during consolidation)
- src/app/(admin)/layout.tsx:1,12 — "use client" layout whose only gate is the client-rendered ProtectedRoute
- src/components/ContractorProtectedRoute.tsx:9-24 and src/components/ClientProtectedRoute.tsx:8-24 — portal guards are client components mounted by the group layouts
- review/manifest.md:74 — D01 notes RLS churn including blanket-removal migrations, making sole reliance on RLS a live concern

### F-100 · medium · correctness — Site-rooted SiteDetail mounts produce /clients/undefined links and clientId! props

**Affected units:** A04

**Problem:** /sites/[siteId] mounts supply no clientId, yet SiteDetail builds back, breadcrumb, and create links without fallback — yielding /clients/undefined URLs — and passes clientId! to three children; reachable producers of the site-rooted URL exist.

**Evidence:**

- src/app/(admin)/sites/[siteId]/page.tsx:1-3 — mounts SiteDetail with no clientId segment; src/views/SiteDetail.tsx:54 destructures it from useParams
- src/views/SiteDetail.tsx:685 — `navigate(`/clients/${clientId}`)` with no fallback; :711 breadcrumb `href=`/clients/${clientId}``; :832 `navigate(`/clients/${clientId}/sites/${siteId}/subsections/new`)`
- src/views/SiteDetail.tsx:783,786,834 — `clientId!` passed to ComplianceDashboard, SiteComplianceChecklist, SubsectionList
- src/views/Dashboard.tsx:379 — `navigate(clientId ? … : `/sites/${siteId}`)` reaches the site-rooted mount; src/hooks/useGlobalSearch.ts:106 emits `/sites/${site.id}` when client_id is null

### F-101 · medium · correctness — Template validator's Edit button navigates to a non-existent route shape

**Affected units:** A05

**Problem:** TemplateValidator navigates to /inspection-templates/edit/<id> while the only edit route is /inspection-templates/[templateId]/edit, so the Edit Template button 404s and the edit route has zero in-app producers of its actual URL shape.

**Evidence:**

- src/views/TemplateValidator.tsx:139 — `navigate(`/inspection-templates/edit/${issue.template_id}`)`
- find over src/app/(admin)/inspection-templates yields only page.tsx, validate/page.tsx, new/page.tsx, [templateId]/edit/page.tsx — no route matches the two extra segments of /inspection-templates/edit/<id>
- grep for `inspection-templates/edit` across src returns only TemplateValidator.tsx:139; no code constructs `/inspection-templates/<id>/edit`

### F-102 · medium · dead-code — Three admin routes unreachable in-app; two URL pairs mount duplicate views

**Affected units:** A03

**Problem:** /users, /offline-review, and /pdf-template-tests have zero in-app links (user management reachable only by typed URL); /site-assignments and /portal-management both mount PortalManagement; Sites mounts at both /sites and /clients/[clientId]/sites.

**Evidence:**

- grep for quoted `/users`, `/offline-review`, `/pdf-template-tests` across src outside src/app returns zero hits, while all three route directories exist under src/app/(admin)/ (both re-verified during consolidation)
- src/components/AppSidebar.tsx:42-50 — menu lists only Dashboard, Calendar, Clients, QR Codes, QR Activity, Inspection Templates, Settings
- src/app/(admin)/site-assignments/page.tsx:2-3 and src/app/(admin)/portal-management/page.tsx:2-3 — both import and render PortalManagement
- src/app/(admin)/sites/page.tsx:2 and src/app/(admin)/clients/[clientId]/sites/page.tsx:2 — same Sites view at two URL shapes

### F-103 · medium · error-handling — No route-level error/loading boundaries; one root ErrorBoundary catches everything

**Affected units:** A01, A03, A04, A05, A06, A07

**Problem:** src/app contains zero error.tsx, loading.tsx, or global-error.tsx files, so a render error in any of the 50+ pages escalates to the single root ErrorBoundary and replaces the entire shell; the global 404 renders inside a fallback-less Suspense.

**Evidence:**

- `find src/app -name error.tsx -o -name loading.tsx -o -name global-error.tsx` returns nothing (re-verified during consolidation)
- src/app/providers.tsx:16 — the root ErrorBoundary is the only error boundary in the shell
- src/app/not-found.tsx:6 — `<Suspense>` with no fallback prop around NotFound
- src/app/(admin)/layout.tsx:39 — the only recovery UI in the admin group is a Suspense loading fallback, not an error path

### F-104 · medium · boundaries — Contractor inspection route mounts admin view; mode inferred from param absence

**Affected units:** A07, A04

**Problem:** /contractor/inspections/[inspectionId] mounts the 3,102-line admin InspectionDetail view, which renders no contractor chrome (unlike the other two contractor pages) and infers contractor mode solely from absent clientId/siteId/subsectionId params.

**Evidence:**

- src/app/(contractor)/contractor/inspections/[inspectionId]/page.tsx:2 — imports `@/views/InspectionDetail` (V01 admin view)
- grep -c "Layout" src/views/InspectionDetail.tsx returns 0 — no ContractorPortalLayout, while ContractorPortal.tsx:12 imports and wraps content in it
- src/views/InspectionDetail.tsx:106 — `const isContractorPortal = !clientId && !siteId && !subsectionId;`
- wc -l src/views/InspectionDetail.tsx — 3102 lines

### F-105 · medium · correctness — Unordered range() pagination in snapshot capture can skip or duplicate rows

**Affected units:** A02

**Problem:** fetchAll pages all eight tables in 1000-row windows via .range() with no .order(), so cross-page order is unspecified and tables over 1000 rows can yield overlapping or missing rows, silently skewing the persisted nightly snapshot metrics.

**Evidence:**

- src/app/api/snapshots/capture/route.ts:15-20 — loop issues `.select(columns).range(from, from + size - 1)` with no order clause; comment at line 11 says "capture must be exact"
- src/app/api/snapshots/capture/route.ts:50-59 — eight full-table paginated reads (sites, subsections, snags, inspections, schematics, assets, documents, subsection_documents)
- src/app/api/snapshots/capture/route.ts:92-94 — derived metrics are upserted into site_health_snapshots, becoming the historical record

### F-106 · medium · security — coc_file_pool keeps blanket authenticated CRUD after the COC leak fix

**Affected units:** D03

**Problem:** The cross-tenant COC leak fix re-scoped coc_import_batches/coc_db_schedule/coc_certificates but omitted coc_file_pool, which still grants every authenticated principal, including Client-portal users, read and write on all pooled COC files across all sites.

**Evidence:**

- supabase/migrations/20260619150000_coc_file_pool.sql:20-23 — four `to authenticated using (true)` / `with check (true)` policies for select/insert/update/delete
- supabase/migrations/20260623120000_coc_client_read_and_leak_fix.sql:1-4,55 — frames prior `using (true)` as the defect; remediation loop is `array['coc_import_batches','coc_db_schedule','coc_certificates']` only
- grep `coc_file_pool` over supabase/migrations — only 20260619150000 (policies) and 20260624120000 (column additions, no policy changes)

### F-107 · medium · privacy — Public site-review RPC returns whole rows via to_jsonb

**Affected units:** D03

**Problem:** `get_public_site_review` emits `to_jsonb(b)` and `to_jsonb(a)` for schematic_blocks and site_assets while every other key whitelists columns, so any column later added to those tables is silently exposed to share-token holders.

**Evidence:**

- supabase/migrations/20260614100000_public_site_review_schematic_assets.sql:83-91 — `jsonb_agg(to_jsonb(b) …)` for schematic_blocks and `jsonb_agg(to_jsonb(a) …)` for site_assets
- supabase/migrations/20260614100000_public_site_review_schematic_assets.sql:69-76 — the adjacent subsection_documents key lists columns explicitly, as do all other keys
- supabase/migrations/20260727101000_public_verdict_rpcs.sql:8-13 — the era's stated contract is an explicit list with fields deliberately withheld from anon payloads

### F-108 · medium · inconsistency — subsections.coc_status CHECK never re-tightened; later migration documents it wrongly

**Affected units:** D03

**Problem:** The transitional CHECK admitting legacy values ('Approved','Valid','Failed','Rejected','none') is still the last recorded definition despite its own instruction to tighten it when the validation engine was deleted, and a 2026-07 migration documents the column as constrained to the strict five-value set, citing the superseded constraint.

**Evidence:**

- supabase/migrations/20260611161000_coc_status_check_permissive.sql:10-19 — "tighten this back to the strict set in the same migration that deletes the validation engine", then adds the union CHECK
- grep `subsections_coc_status_check` — only 20260611160000:19-20 (strict) and 20260611161000:12-13 (permissive, last); the engine-deletion migration 20260612130000_drop_coc_validation_tables.sql does not touch the constraint
- supabase/migrations/20260727101000_public_verdict_rpcs.sql:84-87 — states the column "is already normalised to just Missing|Pending|Pass|Fail|N/A (CHECK constraint added in 20260611160000)"

### F-109 · medium · correctness — Destructive migrations are irreversible: 14 CASCADE drops and an overwriting backfill

**Affected units:** D02, D03

**Problem:** Four feature-removal migrations drop 14 tables with CASCADE and the register-truth backfill overwrites human-entered COC verdicts to 'Pending' without capturing prior values; only the two Fortress files out of 183 tracked migrations have down migrations.

**Evidence:**

- supabase/migrations/20260725100000_coc_register_truth.sql:86-101 — step 3c sets `coc_status = 'Pending'` on every COC-category document lacking register backing ("manual Passes without register backing regress"); no prior values retained
- supabase/migrations/20260612130000_drop_coc_validation_tables.sql:4-9 (6), 20260612131000:4-6 (3), 20260612230000:6-8 (3), 20260615130000:92-93 (2) — 14 `DROP TABLE IF EXISTS … CASCADE` statements
- `ls supabase/migrations/*.down.sql` — only 20260612210000_fortress_layer_hardening.down.sql and 20260612220000_fortress_rls_scope.down.sql, against 183 tracked migrations

### F-110 · medium · security — OAuth secrets and API tokens stored plaintext; validator executable by PUBLIC

**Affected units:** D02

**Problem:** api_clients.client_secret, api_access_tokens.access_token/refresh_token and user_storage_connections' Google/Dropbox tokens are unhashed TEXT at rest, and SECURITY DEFINER `validate_api_token` has no REVOKE so it retains Postgres' default EXECUTE-to-PUBLIC as an anon-callable token-validation oracle.

**Evidence:**

- supabase/migrations/20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql:6,19-20 — `client_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32),'hex')`; access_token/refresh_token TEXT UNIQUE stored as issued
- supabase/migrations/20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql:77-99 — `validate_api_token` SECURITY DEFINER; grep shows zero REVOKE statements in the file (contrast 20260610113000_public_rpcs_phase1.sql:19)
- supabase/migrations/20251027081639_22cefe19-20a8-46df-93a3-f10415c8a441.sql:6-8 — user_storage_connections stores provider access_token/refresh_token as plaintext TEXT

### F-111 · medium · inconsistency — Three mutually incompatible "staff" boundaries across the RLS lockdowns

**Affected units:** D03

**Problem:** Whether a principal counts as staff depends on when its table was locked down: NOT-Contractor-AND-NOT-Client (2026-06-10), NOT-Client with Contractor included (2026-06-23), or an affirmative Admin/User/Moderator allowlist (2026-07-08) — with the NOT-based variants silently including users who have no role row at all.

**Evidence:**

- supabase/migrations/20260610120000_phase1_write_lockdown.sql:39-48 — staff = `auth.uid() IS NOT NULL AND NOT has_role(…,'Contractor') AND NOT has_role(…,'Client')`
- supabase/migrations/20260623120000_coc_client_read_and_leak_fix.sql:3-4,13-15 — staff = `not public.has_role(auth.uid(),'Client')`, explicitly including Contractor
- supabase/migrations/20260708090000_site_health_snapshots_scoping.sql:10-11,17-26 — affirmative Admin/User/Moderator allowlist, itself noting "NOT-based policies silently include users with no role row at all"

### F-112 · medium · missing-tests — No automated verification for database changes; checks exist only as comments

**Affected units:** D01, D02, D03

**Problem:** Every security-critical migration ships its verification and rollback steps as comment blocks that nothing in the repo executes (no CI workflows, no migration tests), so RLS boundaries and recompute correctness are validated only by manual inspection.

**Evidence:**

- supabase/migrations/20260611110000_emergency_triage_lockdown.sql:55-59 — "VERIFY AFTER APPLYING:" block in comments
- supabase/migrations/20260610120000_phase1_write_lockdown.sql:99-104 and 20260611140000_admin_config_write_lockdown.sql:122-140 — post-apply verification and manual rollback SQL kept as comments
- supabase/migrations/20260612210000_fortress_layer_hardening.sql:61-68 — the only executable in-file verification (a DO-block RAISE) in the repo; `.github/workflows` does not exist and no test runner touches supabase/migrations

### F-113 · medium · privacy — Committed seed file contains real named individuals and client commercial data

**Affected units:** D04

**Problem:** supabase/seeds/fortress_abaqulusi_seed.sql (git-tracked) commits live customer data self-described as "real data from the 3 workbooks": named managers and inspectors, per-tenant turnover/trading-density/arrears figures for named retailers, and security-incident narratives.

**Evidence:**

- supabase/seeds/fortress_abaqulusi_seed.sql:1 — header: "real data from the 3 workbooks"
- supabase/seeds/fortress_abaqulusi_seed.sql:8,13 — named individuals 'Donovan De Lange', 'Wesley Sykes', 'Sibusiso Mabaso' as contact/asset/ops/centre managers
- supabase/seeds/fortress_abaqulusi_seed.sql:128-132 — 'Wesley Sykes' recorded as inspector on building_condition_items rows
- supabase/seeds/fortress_abaqulusi_seed.sql:304-309 — masterfile rows carry first names 'Mina', 'Deon', 'Sibu/Mina' in the responsible column

### F-114 · medium · privacy — Real staff PII committed in tracked SQL import runbook

**Affected units:** P03

**Problem:** sql-import-scripts.md embeds eight real staff email addresses with full names and role assignments in plaintext in the tracked repo — a POPIA-relevant personal-data exposure with zero in-repo references justifying retention.

**Evidence:**

- sql-import-scripts.md:8-15 — INSERT VALUES rows containing arno@watsonmattheus.com and admin/alain/darren/dawie/ernst/estienne/michael@wmeng.co.za, each with fullName and role (e.g. '{"email": "dawie@wmeng.co.za", "fullName": "Dawie De Beer", "role": "Admin"...}')
- git grep -ln "sql-import-scripts" → 0 hits — no other tracked file references this runbook

### F-115 · medium · dependencies — Dependency hygiene: stale foreign bun.lock, non-frozen installs, dev tools in prod deps

**Affected units:** P01

**Problem:** A stale tracked Bun lockfile still describes the pre-migration Vite project (workspace vite_react_shadcn_ts, zero 'next' entries), Vercel installs non-frozen via `npm install` despite a tracked package-lock.json, and @capacitor/cli and @types/qrcode sit in prod dependencies.

**Evidence:**

- bun.lock:6 — workspace name "vite_react_shadcn_ts" vs package.json:2 "wm-compliance-inspector"; `grep -c '"next":' bun.lock` → 0
- bun.lock last touched 4acffbf 2026-03-06 "Work in progress", predating the Vite→Next migration; package.json last touched f633c31 2026-06-15
- vercel.json:5 — `"installCommand": "npm install"` while package-lock.json (lockfileVersion 3, name wm-compliance-inspector) is tracked
- package.json:16,50 — "@capacitor/cli" and "@types/qrcode" listed under `dependencies`

### F-116 · medium · correctness — prose classes used on a mounted view but @tailwindcss/typography never registered

**Affected units:** P02

**Problem:** OfflineReview, mounted at /offline-review, renders markdown with prose classes, but @tailwindcss/typography is installed yet not registered in the Tailwind plugins array, so the classes emit no CSS and the content renders unstyled.

**Evidence:**

- tailwind.config.ts:90 — `plugins: [require("tailwindcss-animate")]` only
- package.json:90 — "@tailwindcss/typography": "^0.5.16" installed as devDependency
- src/views/OfflineReview.tsx:146 — `<div className="prose prose-sm max-w-none dark:prose-invert">` (sole prose usage in src, grep-verified)
- src/app/(admin)/offline-review/page.tsx — imports and renders views/OfflineReview, so the view is mounted

### F-117 · medium · inconsistency — README and other root guides document the removed Vite app and deleted AI pipeline

**Affected units:** P03

**Problem:** Root docs describe the pre-migration app and give actively wrong setup instructions: Vite 5/React Router 6 stack, VITE_ env var names, localhost:8080, ~130 vs actual 184 migrations, and AI_MODEL_CONFIGURATION.md pointing at edge functions that no longer exist.

**Evidence:**

- README.md:80-81 — "Build | Vite 5 + PWA plugin", "Routing | React Router 6" vs package.json:6-8 (next dev/build/start) and next.config.mjs:163 (withPWA export)
- README.md:212-214 — VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY/VITE_SUPABASE_PROJECT_ID vs .env.example:1-3 NEXT_PUBLIC_* names
- README.md:254 — "~130 migrations" vs `ls supabase/migrations | wc -l` → 184; README.md:189 — "available at http://localhost:8080" with no port flag in package.json:6
- AI_MODEL_CONFIGURATION.md:29,50 — cite supabase/functions/validate-coc/index.ts:343 and validation-chat/index.ts:111; neither directory exists (ls verified); `git ls-files vite.config.ts src/App.tsx src/main.tsx index.html` → 0

### F-118 · medium · dependencies — Unused heavy runtime deps (fabric, jspdf) and orphaned Capacitor native-shell config

**Affected units:** P01

**Problem:** fabric and jspdf are runtime dependencies imported by no source file and referenced only by next.config.mjs external-package entries, while @capacitor/android and @capacitor/ios are installed with no android/, ios/, or out/ directory tracked and capacitor.config.ts naming a webDir nothing produces plus cleartext:true beside its https server URL.

**Evidence:**

- package.json:60,64 — `"fabric": "^7.2.0"`, `"jspdf": "^4.0.0"`; git grep for fabric/jspdf import/require specifiers across src+supabase → 0 hits (pdf-lib, by contrast, is live via src/lib/pdfmakeInspectionReport.ts:1379 dynamic import)
- next.config.mjs:115 — serverExternalPackages: ['fabric', 'canvas', 'pdfmake', 'jspdf', 'html2canvas'] and next.config.mjs:145 — `config.externals.push('fabric', 'canvas')` are the only in-repo references
- package.json:14,18 — @capacitor/android and @capacitor/ios ^7.4.4; `ls -d out android ios` → all three absent; sole @capacitor/* importer in tracked src is src/hooks/useCamera.ts
- capacitor.config.ts:6 — `webDir: 'out'`; capacitor.config.ts:8-9 — `url: 'https://insight-linker-app.vercel.app'` with `cleartext: true`; next.config.mjs has no `output` key, so nothing produces out/

### F-119 · low · correctness — Primitive defects: unreachable retry button, stuck QR spinner, unhandled upload rejection

**Affected units:** C16, C17

**Problem:** FullscreenImageViewer passes pointer-events-none into RobustImage whose error state applies that className to the wrapper containing the Retry button, making retry unclickable; LabeledQRCode can bail after setIsGenerating(true) when the canvas context is null, sticking on 'Generating...'; CocCertificateList's upload onChange awaits without a catch (rejection unhandled, input reset skipped) and relies on non-null map assertions.

**Evidence:**

- src/components/FullscreenImageViewer.tsx:216 — RobustImage className includes pointer-events-none
- src/components/RobustImage.tsx:99-113 — error state renders the Retry button inside a div carrying `${className}`, so it inherits pointer-events-none
- src/components/LabeledQRCode.tsx:34-37 — setIsGenerating(true), then `if (!ctx) return;` before the try that clears it
- src/components/coc/CocCertificateList.tsx:80-84 — `await p.onUploadEvaluationReport(...)` uncaught; `e.target.value = ""` only runs after a successful await

**Verification:** Original reviewer re-read all citations and additionally confirmed the Retry button inherits the pointer-events-none className from RobustImage's error-state JSX.

### F-120 · low · correctness — Clients edit path discards the zod-parsed output and persists raw form data

**Affected units:** V01

**Problem:** Clients.tsx handleUpdate gates on clientSchema.safeParse but then spreads raw formData into the clients UPDATE, discarding zod's parsed output (trimmed name, stripped unknown keys) that the create path correctly persists — so create and edit diverge and untrimmed values reach the database on edit.

**Evidence:**

- src/views/Clients.tsx:220-231 — handleUpdate runs clientSchema.safeParse(formData) and returns on failure
- src/views/Clients.tsx:259-265 — update payload is { ...formData, logo_url: … }, not validation.data
- src/views/Clients.tsx:132-139 — create path inserts { ...validated, … }
- src/lib/validation-schemas.ts:4-11 — clientSchema applies .trim() to name, so parsed output differs from raw formData

**Verification:** Severity was adjusted medium→low: safeParse does gate the update (invalid data is rejected), so what is lost is only zod's transform output (name trim, unknown-key stripping) — a create/edit consistency defect with minor data-quality impact. I re-read src/views/Clients.tsx:218-266 and confirmed the safeParse gate and the `...formData` update payload.

### F-121 · low · correctness — usePaginatedList keeps stale page state when the caller's queryKey changes

**Affected units:** H03

**Problem:** The hook's page state is independent of options.queryKey, so a caller changing its base key (e.g. adding a filter) keeps the old page while setPage clamps against a pageCount derived from the prior dataset; current consumers use static keys, so the defect is latent.

**Evidence:**

- src/hooks/usePaginatedList.ts:44 — `const [page, setPageState] = useState(1);` with no reset tied to options.queryKey
- src/hooks/usePaginatedList.ts:57,65 — pageCount from the currently loaded total; setPage clamps against it
- src/views/Clients.tsx:63 (`queryKey: ["clients-list"]`) and src/views/Users.tsx:214 (`queryKey: ["users"]`) — both current consumers use static base keys

**Verification:** Latent only: both current consumers pass static base keys, which is why this is low rather than a live defect.

### F-122 · low · performance — Blob object URLs minted on live offline paths are never revoked

**Affected units:** H02

**Problem:** useOfflineInspectionDetail creates object URLs on every addOfflineImage and getSectionImages call and never revokes them, leaking memory over long offline editing sessions; the only revokes in the file are inside the private compressor, and useOfflinePhotos (currently unreferenced) mints a fresh URL per preview call the same way.

**Evidence:**

- src/hooks/useOfflineInspectionDetail.ts:267,303 — URL.createObjectURL for returned blob URLs; revokeObjectURL appears only at :384,:416 inside compressImage (grep-verified)
- src/hooks/useOfflinePhotos.ts:306-315 — getPhotoPreviewUrl/getPhotoFullUrl mint a fresh object URL per call with no revoke in the hook; its only consumer OfflinePhotoGallery.tsx is itself imported nowhere (grep-verified)

### F-123 · low · correctness — Committed import scripts contain SQL that fails against the migrated schema

**Affected units:** P03

**Problem:** insert-clients.sql's ON CONFLICT (name) has no matching unique constraint in any migration so it errors when run, complete-import.sql duplicates all rows on re-run for lack of conflict guards, and the two scripts record different emails for the same client.

**Evidence:**

- insert-clients.sql:15 — `ON CONFLICT (name) DO NOTHING`; insert-clients.sql:2 instructs "Run this script in your Supabase SQL Editor"
- supabase/migrations/20251014114352_*.sql — clients defines `name TEXT NOT NULL` with no UNIQUE; grep across all migrations finds no unique constraint/index on clients.name (only firebase_id and other tables)
- sql-import-scripts.md:25 — 'info@fortress.co.za' vs complete-import.sql:23 — 'info@fortressfund.com' for the same 'Fortress Fund' client
- complete-import.sql — grep for 'ON CONFLICT' → 0 matches in the whole file

**Verification:** The one migration matching both 'clients' and 'unique' was chased down: its UNIQUE is on a firebase_id column, not name.

### F-124 · low · correctness — Migrations embed environment-specific identifiers and contradictory one-off DML

**Affected units:** D01, D02, D03

**Problem:** Repair migrations hardcode production UUIDs including an in-migration Admin grant, and two 2026-07-08 backfills set the identical row set first to NULL then to 0 (the first labelled interim only by the second), so replaying history applies data decisions that are meaningless or self-cancelling outside the original prod database.

**Evidence:**

- supabase/migrations/20251014172735_c6e9844f-0866-4231-ab9b-eab69d39132e.sql:2-3 — hardcoded user UUID granted Admin in-migration
- supabase/migrations/20260201150950_afa72d38-c1ae-4c85-8035-d0d82fe2c724.sql:4-18 — six hardcoded production subsection UUIDs; 20260108121126_8c54625a-….sql:2-11 wipes the photo array on one named production inspection
- supabase/migrations/20260708150000_null_health_scores_for_empty_sites.sql:8-10 sets empty-site health_score to NULL and 20260708170000_empty_sites_score_zero.sql:1-9 sets the same rows to 0, calling the first an "interim backfill"; both remain in history

### F-125 · low · inconsistency — Two toast systems mounted side-by-side in providers.tsx, alongside a provider-less sonner theme and an unconfigured QueryClient

**Affected units:** C01, H04, A01

**Problem:** src/app/providers.tsx mounts both the legacy shadcn Toaster (backed by the singleton use-toast store: TOAST_LIMIT 1, dismissed toasts removed only after ~16.7 min) and the Sonner outlet, so notification behaviour and dismissal semantics depend on which import each caller picked — the legacy store is still consumed by LabeledQRCode/QRCodes/Calendar while the rest of the app uses sonner. The same file creates the app-wide QueryClient with zero defaultOptions (individual hooks compensate with ad-hoc staleTime/gcTime), and the sonner wrapper calls next-themes useTheme() although no ThemeProvider exists anywhere, matching a full .dark palette that no code ever activates.

**Evidence:**

- src/app/providers.tsx:5-6,19-20 — both `<Toaster />` (shadcn/use-toast) and `<Sonner />` imported and mounted adjacent in the tree
- src/hooks/use-toast.ts:5-6 — TOAST_LIMIT = 1; TOAST_REMOVE_DELAY = 1000000 (~16.7 min before dismissed toasts are removed)
- legacy store still consumed by src/components/LabeledQRCode.tsx, src/views/QRCodes.tsx, src/views/Calendar.tsx, while 78 tracked src files reference sonner (grep-verified, ' 2' duplicates excluded)
- src/components/ui/sonner.tsx:1,7 — `useTheme()` from next-themes; grep over src shows next-themes appears in no other file, so no provider ever supplies it

**Verification:** Three cluster reviewers (C01, H04, A01) independently reported the same dual-toast mount at src/app/providers.tsx; merged as one defect with their riders folded in. I re-verified every citation myself: providers.tsx lines 5-6/12/19-20, use-toast.ts:5-6, sonner.tsx:1,7, tailwind.config.ts:4, index.css:60, useUserRole.tsx:55-56, and both greps (no ThemeProvider, no dark-class application). One correction: the sonner file count is 78 tracked src files by my grep, not the 82 originally reported.

### F-126 · low · observability — Unconditional debug logging in production paths, including pin form contents

**Affected units:** C12, C16

**Problem:** Save handlers log the full pin form data, the stats widget logs every realtime payload, and RobustImage logs self-heal URLs unconditionally, while sibling code in the same unit dev-gates identical logging — inconsistent and noisy in production.

**Evidence:**

- src/components/FloorPlanPinModal.tsx:143,152 — console.log('handleSave called', { formData, ... }) and console.log('Calling onSave with:', formData)
- src/components/FloorPlanStatsWidget.tsx:62 — console.log('Floor plan pin changed:', payload) on every realtime event
- src/components/RobustImage.tsx:53 — console.log('Found correct image at:', foundUrl)
- src/components/InteractiveFloorPlan.tsx:240 — same-unit contrast: console.error gated behind NODE_ENV === 'development'

**Verification:** The contrast citation was corrected from InteractiveFloorPlan:159 to :240, which the reviewer verified directly.

### F-127 · low · duplication — Copy-pasted edge-function boilerplate and stale external-API documentation

**Affected units:** F03, F04, F05

**Problem:** detectImageType and the G-SEC-12 auth block are duplicated verbatim across functions, and the admin-facing API docs advertise an endpoint and a response format the code does not implement.

**Evidence:**

- supabase/functions/compress-image/index.ts:25-31 and supabase/functions/batch-compress-images/index.ts:38-44 — byte-identical detectImageType implementations
- supabase/functions/compress-image/index.ts:76-87, supabase/functions/batch-compress-images/index.ts:120-131, supabase/functions/offline-review/index.ts:15-30 — the same G-SEC-12 block including the as any cast, copied three times
- src/views/APIClients.tsx:444 — documents /generate/coc-validation, but supabase/functions/api-reports/index.ts:128-272 has no such case and its default branch would 404
- src/views/APIClients.tsx:459-461 — states the response includes content_base64 "with the PDF content", while supabase/functions/api-reports/index.ts:294-320 base64-encodes plain text

**Verification:** Two line numbers were corrected from the raw finding: coc-validation is at APIClients.tsx:444 (not 446) and the PDF-content claim at 459-461 (not 461-463).

### F-128 · low · duplication — DOMMatrix/Path2D polyfill duplicated in server-polyfills.js and next.config.mjs

**Affected units:** P01

**Problem:** The identical DOMMatrix/Path2D stub classes are maintained in two files — the NODE_OPTIONS preload script and inline at the top of next.config.mjs — so a fix to one stub can silently diverge from the other.

**Evidence:**

- server-polyfills.js:2-12 and next.config.mjs:8-20 — identical DOMMatrix class bodies (constructor fields, inverse/multiply/scale/translate/transformPoint), side-by-side compared
- next.config.mjs:21-26 — the matching Path2D stub
- package.json:6-8 and vercel.json:4 — the preload copy is wired via NODE_OPTIONS='--require ./server-polyfills.js' while the config copy runs at config evaluation

### F-129 · low · boundaries — 710-line runtime test harness bundled behind an admin route; cross-module invariants held only by comments

**Affected units:** L15, L05, L14, L07

**Problem:** pdfTemplateTestRunner — a non-vitest test suite issuing live pdf_report_templates queries from the browser — ships as application source mounted at the /pdf-template-tests admin route; SYSTEM_REPORT_CATEGORIES and pdfDocumentSaver.getReportCategoryName must stay in lockstep per comment but share no import or cross-test; and the 12 month names are hand-duplicated between reportKernel and calendarRows.

**Evidence:**

- wc -l src/lib/pdfTemplateTestRunner.ts — 710 lines; src/app/(admin)/pdf-template-tests/page.tsx:2-3 — mounts PDFTemplateTestDashboard; pdfTemplateTestRunner.ts:608-632 — live Supabase queries against pdf_report_templates
- src/lib/documents/reportCategories.ts:1-4 — 'Keep in lockstep with getReportCategoryName() in src/lib/pdfDocumentSaver.ts' with no import either direction; src/lib/pdfDocumentSaver.ts:198-210 — parallel 8-entry map + 'Generated Reports' fallback
- src/lib/report/reportKernel.ts:10 (MONTHS_FULL) vs src/lib/report/calendarRows.ts:7 (MONTH_NAMES) — identical month lists declared twice

**Verification:** Already a within-cluster merge of 2 raw findings (bundled harness + comment-held invariants), both low-severity hygiene in the same PDF/documents area; all citations re-checked by that reviewer.

### F-130 · low · dead-code — Dead component cluster: ~15 ui-kit modules, 4 feature components, 4 stranded npm deps

**Affected units:** C01, C05, C17

**Problem:** A large slice of the vendored ui kit plus feature components (PDFTemplatePreview, SANSReferenceTab, pdf-preview/SubsectionCard among them) have zero importers anywhere, and embla-carousel-react, vaul, input-otp and react-resizable-panels are each kept in package.json solely by a zero-importer kit file.

**Evidence:**

- grep (alias + relative forms over src/supabase, ' 2' files excluded) — zero importers for ui/chart, ui/form, ui/carousel, ui/drawer, ui/menubar, ui/navigation-menu, ui/input-otp, ui/resizable, ui/use-toast
- grep 'PDFTemplatePreview' / 'SANSReferenceTab' — no hits outside their own definition files; grep 'pdf-preview/SubsectionCard' — zero importers
- grep embla-carousel/vaul/input-otp/react-resizable-panels over src — each imported only by its zero-importer kit file (carousel.tsx, drawer.tsx, input-otp.tsx, resizable.tsx); all four present in package.json

**Verification:** Severity adjusted medium→low (dead code is hygiene, no runtime defect). I independently re-ran the importer greps for ui/chart, ui/form, ui/carousel, ui/drawer, ui/menubar, ui/navigation-menu, ui/input-otp, ui/resizable and ui/use-toast — all zero external importers. Note this concerns the vendored src/components/ui/use-toast.ts re-export, which is distinct from the live src/hooks/use-toast.ts store covered by the dual-toast finding.

### F-131 · low · dead-code — Fortress layer: 12 tables never applied, zero runtime consumers

**Affected units:** D03

**Problem:** The Fortress building/facilities model (12 tables) plus two hardening migrations and a seed exist in the repo with the base file stating it was never run against the live DB, and no application code reads or writes any of its tables.

**Evidence:**

- supabase/migrations/20260612200000_fortress_building_layer.sql:18-19 — "Reviewed-not-applied: this migration has NOT been run against the live DB"
- supabase/migrations/20260612200000_fortress_building_layer.sql:53-324 — creates building_assets, ppm_tasks, ohs_compliance_items, building_condition_items, utilities_readings, tenants, tenant_shop_specs, tenant_trading, tenant_movements, security_incidents, masterfile_index, expense_recoveries
- grep for `.from('<table>')` for all 12 tables over src and supabase/functions — zero hits

### F-132 · low · dead-code — Retired-feature schema and debug artifacts still present in the data model

**Affected units:** D01, D02

**Problem:** Tables and functions from abandoned features and the 2025-11 RLS-debugging episode were never removed, including a SECURITY DEFINER function querying tables dropped in 2026-06 and a public storage bucket whose owning table is gone.

**Evidence:**

- supabase/migrations/20251107084924_7b603496-c362-4353-abc9-589c617582cc.sql:2-44 — `get_pending_verifications` reads issue_reports and suggestions, both dropped at 20260612230000_drop_feedback_feature_tables.sql:7-8, with no later DROP FUNCTION
- supabase/migrations/20251120061340_29a4cccb-992b-47a3-b12c-108886eed9da.sql (user_policy_overrides) and 20251120051830_0f728c09-ca3c-4f83-9cb1-6cb15188ab4b.sql (`get_rls_policies_for_role`) survive with no later drops; the self-described temporary temp_import table (20251014120224_e944a635-b5b0-4808-b7c8-87c5c2a774e9.sql) is never dropped
- supabase/migrations/20260310083442_1b964afb-fbe3-4c55-9ad2-531d76c72522.sql:60-79 — public `coc-photos` bucket and its three storage policies remain after coc_compliance_photos was dropped (20260612130000:8); grep for `coc-photos` in 2026-06/07 migrations returns zero hits

**Verification:** Distinct from the Fortress dead-schema finding: that one is a never-applied new feature, this one is never-removed retired features and debug scaffolding. The temp_import migration filename suffix was corrected from the raw finding.

### F-133 · low · missing-tests — No tests exist for any edge function in scope

**Affected units:** F03, F04, F05

**Problem:** The functions across F03, F04 and F05 — including all bespoke auth gates, token issuance and destructive repair jobs — have zero automated coverage.

**Evidence:**

- git ls-files 'supabase/functions/*' | grep -i test returns no matches; each of the 17 function directories contains only index.ts
- supabase/functions/oauth-token/index.ts:23-68 — grant validation and credential comparison logic is untested
- supabase/functions/templates/index.ts:355-374 — the constant-time digest comparison, the one hardened auth path, has no test asserting its behaviour

### F-134 · low · inconsistency — Institutionalized ' 2'-suffixed duplicate-file pattern polluting tool scopes

**Affected units:** P01, P02

**Problem:** 33 untracked ' 2.'-suffixed duplicate source/config files sit in the working tree, the pattern has its own .gitignore rule ('node_modules 2/'), and the duplicates match tsconfig's include and Tailwind's src/** content glob.

**Evidence:**

- .gitignore:11 — literal entry `node_modules 2/`
- git status --porcelain | grep -c " 2\." → 33 untracked ' 2.'-suffixed files (e.g. src/views/Dashboard 2.tsx, next.config 2.mjs, vercel 2.json); graphify-out/ and src/graphify-out/ also untracked
- tsconfig.json:27 — include `**/*.ts`/`**/*.tsx` matches the duplicates; tailwind.config.ts:5 — content glob `./src/**/*.{ts,tsx}` likewise

**Verification:** Shares the tailwind.config.ts:5 citation with the orphaned-config finding but for a different reason (globs sweeping in duplicate files vs globs pointing at nonexistent directories); kept separate as distinct defects.

### F-135 · low · dead-code — Orphaned and drifted tooling-config entries

**Affected units:** P01, P02

**Problem:** NEXT_PUBLIC_SUPABASE_PROJECT_ID has zero consumers, ESLint ignores a nonexistent dist/, three Tailwind content globs match nonexistent dirs, and the prod Supabase hostname is hardcoded in the image allowlist against the templated .env.example.

**Evidence:**

- .env.example:3 — NEXT_PUBLIC_SUPABASE_PROJECT_ID; git grep for SUPABASE_PROJECT_ID across src, supabase, and root configs → 0 consumers
- eslint.config.mjs:16 — ignores "dist/**"; `ls -d dist pages components app` → all four absent
- tailwind.config.ts:5 — content globs ./pages/**, ./components/**, ./app/** match no directories
- next.config.mjs:121 — `hostname: 'oltzgidkjxwsukvkomof.supabase.co'` hardcoded vs .env.example:1 `https://YOUR_PROJECT.supabase.co` template

## Cross-cutting themes

- **Anonymous and blanket RLS is still the recorded posture across the tracked schema.** Role-unqualified `USING (true)` and `TO authenticated … WITH CHECK (true)` policies survive migration history on storage, tenancy mappings, share tokens, core tables and the COC pool: F-01, F-03, F-04, F-05, F-39, F-106.
- **Edge functions authenticate but do not authorize, and several fail open.** Presence of any JWT — or an unset env var, or nothing at all — is treated as sufficient on service-role handlers that write, mail, mint tokens or resolve identifiers: F-02, F-08, F-11, F-12, F-14, F-15.
- **Secrets and personal data are handled in plaintext and committed to the repository.** Client secrets, access/refresh tokens and temporary passwords are stored, matched, rendered and toasted unhashed; real credentials, staff PII and customer commercial data sit in tracked files: F-09, F-10, F-65, F-110, F-113, F-114.
- **Access control is enforced only in the browser, and by exclusion.** No middleware exists; guards redirect two named roles and admit everything else, including unresolved and errored sessions, while forced password change and the onboarding gate are client-side advice: F-06, F-13, F-30, F-38, F-99, F-104.
- **The offline layer loses user work while reporting success.** Non-idempotent drains, discard-after-three-retries, unreconciled offline ids, cache wipes on auto-logout and annotations that never reach a server all sit behind success toasts: F-07, F-18, F-19, F-20, F-21, F-81.
- **In-band supabase-js errors are discarded, so failures render as success or as emptiness.** `{ data }`-only destructuring and `|| []` fallbacks span COC ingestion, admin views, PDFs, search and the edge report endpoints: F-17, F-22, F-64, F-76, F-86, F-92.
- **Status vocabularies and letter-casing disagree between layers, skewing compliance verdicts.** Lowercase-vs-title-case comparisons, expiry semantics that invert between modules, and field-name mismatches produce verdicts that differ per surface or can never fire: F-23, F-24, F-25, F-46, F-49, F-58, F-63.
- **Tracked migration history no longer describes the production database.** Objects referenced but never created, out-of-band prod-only fixes kept in docs/, contradictory backfills, three incompatible "staff" definitions and stale generated types: F-31, F-32, F-108, F-109, F-111, F-124.
- **No automated gate runs anywhere.** Build ignores type and lint errors, no CI exists, 76 tests cover only client modules, the database has comment-only verification, and edge functions have none: F-33, F-34, F-80, F-112, F-133.
- **Core concerns exist as several divergent parallel implementations, alongside whole unwired subsystems.** Duplicated COC vocabularies, PDF builders, compressors, type sources and polyfills coexist with the Fortress layer, the OCR pipeline, the data-repository layer and a dead ui-kit slice: F-35, F-44, F-57, F-66, F-130, F-131.

## Scope notes

- Every finding is evidence-verified at the cited file and line in the working tree, but the review is entirely static: no code was executed against a running instance, no request was issued to a deployed edge function, and no production database state was queried. Exploitability and user-visible impact are reasoned from source, not observed.
- Production database state may differ from tracked migration history. Several findings record out-of-band fixes applied directly to production via `docs/security/APPLIED-*.sql` and the Supabase Management API, deliberately kept outside `supabase/migrations/`. Where this is known, the finding says so — but the repository cannot confirm what is currently live, and a clean apply of tracked history would reintroduce the original posture.
- The untracked `" 2"`-suffixed duplicate files present in the working tree were excluded from code review. They are recorded as a hygiene finding (F-134) rather than reviewed as source, and greps supporting other findings were run with those files excluded.
- Six units were index-only and were never spec'd in Phase 2: P04 and X01 through X05. They were not assigned to any area reviewer and appear in this document only where a cross-module dimension reviewer touched them incidentally.

