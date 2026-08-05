# Round 1 — Agent A

## Strategy

Two facts govern this app. Prod was hand-patched in the SQL editor and the fixes sit in `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:4` — "intentionally OUTSIDE supabase/migrations/ so it is NOT auto-applied". Tracked history is therefore the real posture: any reset, branch database or clean apply reopens every hole. And the hand-patch was narrower than believed — it filters `schemaname='public' AND cmd='SELECT' AND qual='true'` (same file, :22-24), so `storage.objects` and every blanket `FOR ALL` policy survived in production too. I sequence by what an unauthenticated request, or one holding any JWT, reaches today; every fix lands as a tracked migration or in a handler's first ten lines so it survives a clean apply. I will break the DocBuilder integration, invalidate live API credentials and force re-login rather than leave a boundary open.

---

## P-A01 — Delete the anonymous service-role data-rewrite functions from the tree

**Addresses:** F-02

**What changes and why**
Delete `supabase/functions/fix-inspection-photos` and `fix-tenant-images` and their registry blocks (`supabase/config.toml:36-37,49-50`). Prod already 404s them — `docs/system-reference/GAPS.md:36` records both as "DELETED from prod … source kept in repo" — but the surviving registry entries mean the next `supabase functions deploy` restores an anonymous service-role writer: `fix-inspection-photos/index.ts:11` service-role client, `:182-186` unconditional `UPDATE inspections.json_data`, `:246-253` where `dryRun` only swaps in a copy that is written back anyway, `:221` `.limit(100)` scan-all on a bare `{}` body. Hand-deleted but still tracked and still registered is not remediated.
**Escalation gate:** removing code a job might call — zero callers in `src/`, and `vercel.json`'s only cron is `/api/snapshots/capture`.

**Effort S** · **Risk low** · Order 1. No dependencies; ship before anything else.

---

## P-A02 — One tracked migration that reconciles RLS to deny-by-default

**Addresses:** F-03, F-04, F-05

**What changes and why**
One migration drops by name every surviving permissive policy and grants anon nothing: the blanket `FOR ALL USING (auth.uid() IS NOT NULL)` on `user_sites`/`user_clients` and four siblings (`20251120080517…:8,123,153,187,206,213`), the `'User'`-role `FOR ALL` set (`20251120111033…:5-55`), the 2026-04 `FOR ALL TO authenticated USING (true)` recreations (`20260406131029…:10-102`), the ten anon `SELECT USING (true)` (`20260108071956…:5-32`; `20260123052442…:4-25`), and "Public can select access_links for validation" (`20260123052614…:9-12`), which exposes `access_token` — sole credential for the anon-granted portfolio RPCs. The prod script matched `cmd='SELECT'` only, so the tenancy blankets are live today: a Contractor can INSERT a `user_sites` row and reach another tenant.
**Escalation gate:** non-additive migration; anon PostgREST reads die — the SECURITY DEFINER RPCs (`20260727101000:25`) replace them.

**Effort L** · **Risk high** · Order 2. Blocks P-A03 and P-A05.

---

## P-A03 — Re-privatise `documents`, drop anon storage SELECT, validate at the upload seam

**Addresses:** F-01

**What changes and why**
Migration: `UPDATE storage.buckets SET public=false WHERE id='documents'`, DROP "Anyone can view all storage" (created `20251120083932…:18-20`; the triage admits leaving it, `20260611110000_emergency_triage_lockdown.sql:18-20`), and replace the `WITH CHECK (true)` authenticated write policies (`:26-30`) with a path-prefix predicate. The prod tier-2 script scans `schemaname='public'`, so storage was never touched there either. Route reads through one signed-URL resolver, and call the existing 50MB/extension `validate()` (`src/lib/coc/uploadCocFiles.ts:5-10`) from `poolUpload` (`src/lib/coc/poolUpload.ts:22-27`), which today accepts any file and persists `getPublicUrl`.
**Escalation gate:** non-additive; ~30 files call `getPublicUrl` and stored public URLs (`coc_file_pool.file_url`) break — land the resolver before flipping the bucket.

**Effort L** · **Risk high** · Order 3. After P-A02.

---

## P-A04 — Authorization preamble in the first ten lines of every edge function

**Addresses:** F-08, F-11, F-14

**What changes and why**
A shared `requireRole(req, roles)` called in the first ten lines of each handler. `send-email` gates only on `getUser` (`index.ts:33-41`) then forwards `to/cc/bcc` verbatim to SMTP as `GMAIL_USER` (`:87-95`) — any Contractor or Client account is an authenticated open relay on the company Gmail. Add Admin-only plus a recipient allowlist; same guard for `offline-review` (`:22-25`) and `batch-compress-images` (`:123-126`). Make `save-template` (`:15-18`) and `template-sync` (`:12-18`) fail closed with 503 as sibling `templates/index.ts:345-351` does; an unset env var currently leaves `DELETE inspection_templates` (`template-sync:264-265`) open. Delete `send-password-reset`: zero callers, absent from `config.toml`, `generateLink` on unauthenticated input (`:73-79`); `ForgotPassword.tsx:72` already uses `resetPasswordForEmail`.
**Escalation gate:** DocBuilder breaks if `DOCBUILDER_*` is unset; removes an auth flow.

**Effort M** · **Risk med** · Order 2, parallel with P-A02. No dependencies.

---

## P-A05 — Fail-closed, positive-allow authorization in SQL and in the shell

**Addresses:** F-06

**What changes and why**
Replace exclusion with membership in both layers. SQL: add `public.is_staff(uuid)` = `has_role(Admin) OR has_role(Moderator)` and swap the NOT-based write predicates (`20260610120000_phase1_write_lockdown.sql:40-47`) that the repo itself says "silently include users with no role row at all" (`20260708090000…:11`) — necessary because `handle_new_user` defaults every signup to `'User'` (`20260214023114…:21-27`). App: `ProtectedRoute.tsx:19-26` renders the admin shell for anything that is not Contractor/Client, including undefined role, a thrown role query (`useUserRole.tsx:51`) and a disabled query. Invert to an Admin/Moderator allow-list; treat error and undefined as unauthenticated. Ship a backfill listing existing `'User'` accounts for explicit promotion.
**Escalation gate:** auth flow; staff without an explicit role lose access until promoted; forces re-login.

**Effort M** · **Risk med** · Order 4. Depends on P-A02 (`is_staff` lands in that migration set).

---

## P-A06 — De-oracle `qr-redirect`

**Addresses:** F-12

**What changes and why**
Delete the name-matching fallback (`qr-redirect/index.ts:180-215`). A four-segment path drives `.ilike('name','%x%')` (`:194`) plus substring site/client matching (`:205-210`) under a service-role client (`:32`), so short probes enumerate the estate, and the 302 hands back a live subsection UUID (`:87`) that `get_public_subsection` grants to anon (`20260727101000:25`) against public buckets. Resolve by exact `firebase_id`/UUID only; return one constant 404 body for every miss so existence is not signalled (`:221-225`); replace the verbatim `error.message` response (`:229-233`) with a generic error; reuse `report-issue`'s throttle (`report-issue/index.ts:23-30,44`); stop logging full `req.url` (`:19-20`).
**Escalation gate:** legacy name-based QR labels stop resolving — inventory printed stickers and regenerate before shipping.

**Effort S** · **Risk med** · Order 5. Independent; can run any time after P-A01.

---

## P-A07 — Bind API credentials to a tenant

**Addresses:** F-15

**What changes and why**
`api_clients` carries no tenant column (`20260110172925…:2-13`) and `api-reports` authorises solely on `scopes?.includes("reports:read")` (`index.ts:58-63`), then filters on the caller-supplied id with a service-role client (`:44-46`, `:138-142`, `:162-177`, `:205-219`, `:241-250`), so one credential reads every tenant. Add nullable `api_clients.scoped_client_id uuid REFERENCES clients(id)`, have `oauth-token` copy it onto the token row, add an ownership predicate to each branch, and reject NULL-scope tokens once existing clients are re-provisioned. UUID unguessability is not a control: public QR URLs disclose subsection ids (`qr-redirect:87`) and responses leak `site_id` for lateral traversal.
**Escalation gate:** public API contract change; live tokens must be reissued.

**Effort M** · **Risk med** · Order 6. Independent of P-A02/P-A03.

---

## P-A08 — Hash secrets at rest, stop shipping plaintext passwords, purge the repo

**Addresses:** F-09, F-10

**What changes and why**
`client_secret`, `access_token` and `refresh_token` are TEXT matched by SQL equality (`oauth-token/index.ts:34-40`; `api-reports/index.ts:18-23`) and re-displayed in the admin UI (`APIClients.tsx:201,273,288`). Add hash columns, compare digests, reveal the secret once at creation, then drop the plaintext columns in a follow-up migration after re-provisioning. Stop returning temporary passwords: `invite-user/index.ts:363-375,547-561` puts them in the response body and message; `Users.tsx:391-395` toasts them for ten seconds. Rotate the credential committed at `20260212144831…:12,19` (`marries.liesie@gmail.com` / `Marries@001`, present in every clone), delete `sql-import-scripts.md:9-15` (eight named staff addresses with roles), and DROP `temp_import` (created `20251014120224…:2`, never dropped, still in `types.ts:2733`).
**Escalation gate:** auth flow; non-additive column drop; breaks live API clients.

**Effort M** · **Risk med** · Order 7. After P-A07 (same re-provisioning window).
