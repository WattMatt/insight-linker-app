# Edge Functions — COC & Templates

> ⛔ **PARTIALLY SUPERSEDED 2026-06-12.** `validate-coc` and `extract-coc` were **DELETED** from prod and the repo (COC auto-validation engine removed; COC is now a manual verdict). The `validate-coc`/`extract-coc` sections below describe code that no longer exists — retained for historical reference. `templates` was also **edited** (its `coc_validations` read removed; COC report items now derive from `coc_status`). `save-template`/`template-sync`/`templates` otherwise remain. New flow of record: `docs/superpowers/COC-VALIDATION-STRIPOUT-TRACKER.md`.

Ground-truth reference for five edge functions: `validate-coc`, `extract-coc`, `save-template`, `template-sync`, `templates`. Every claim cites `supabase/functions/<name>/index.ts:line`, `supabase/config.toml`, or a cross-doc reference. Inferences not provable in code are tagged **⚠️ UNVERIFIED**.

Shared context:
- All five use the **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) for their Supabase client, so DB/storage access runs with RLS bypassed. In-handler auth is therefore the only access gate.
- All set `Access-Control-Allow-Origin: '*'`.
- The two COC functions enforce JWT + role/site authorization in-handler; the three template functions gate (or fail to gate) on a static API token instead.

---

## 1. `validate-coc`

**Purpose:** Downloads a COC document from storage, runs it through the Lovable AI vision gateway against SANS 10142-1:2020, applies a server-side deterministic pass/fail engine, then persists results to `coc_validations`, `subsection_documents`, and `subsections`.

### Auth model
- **config.toml:** `supabase/config.toml:13` → `[functions.validate-coc]` `verify_jwt = true` (`supabase/config.toml:14`). Platform rejects requests with no valid JWT before the handler runs (anon key alone does NOT satisfy `verify_jwt` for invocation — a user JWT is required; the apikey header is separate).
- **In-handler:** requires `Authorization` header (`:938-944`); calls `supabase.auth.getUser(token)` (`:947`) and 401s if invalid (`:949-954`). Verifies the document row exists and `documentRow.subsection_id === subsectionId` (`:959-970`). Authorization gate (`:972-1002`): looks up `user_roles.role` (`:973-977`); if not `Admin`, allows only `Contractor` whose access to the subsection's site passes RPC `contractor_has_site_access(_user_id, _site_id)` (`:990-992`; RPC documented in `docs/system-reference/02-data-model/rpcs-and-functions-01.md:99`). All others → 403 (`:996-1001`).
- **Who can call it successfully:** any authenticated user with a valid JWT whose role is `Admin`, OR a `Contractor` with `contractor_has_site_access` = true for the target subsection's site. Authenticated users who are neither get 403.

### Inputs
JSON body (`:907`): `documentId`, `documentUrl`, `subsectionId` (all three required — 400 if missing, `:909-914`), plus optional `approvedCocType`, `testSettings`, `revalidateFailedOnly`. Header: `Authorization: Bearer <jwt>`.

### Side effects
- **Reads:** `subsection_documents` (id/subsection_id/file_url, `:959-963`); `user_roles` (`:973-977`); `subsections` (site_id, `:983-987`; and coc_number/coc_status/coc_issue_date pre-update, `:1584-1588`); `coc_validation_settings` (`:1012-1016`); `coc_validations` prior result when `revalidateFailedOnly` (`:1043-1049`).
- **Storage:** downloads from bucket `documents` via `.download()` (`:1109-1111`), with fallbacks `createSignedUrl` (`:1120-1122`) then `getPublicUrl` + `fetch` (`:1128-1138`).
- **Writes:** `subsection_documents` UPDATE (coc_number/coc_issue_date/coc_type/coc_status, `:1568-1571`); `subsections` UPDATE (coc fields + `is_compliant`, `:1671-1674`, and an `is_compliant:false` path `:1702-1705`); `coc_validations` UPSERT on conflict `document_id` (`:1718-1754`, sets `validated_by = userId`).
- **External API:** Lovable AI gateway `https://ai.gateway.lovable.dev/v1/chat/completions` (`:1316`), Bearer **`LOVABLE_API_KEY`** (`:1319`). Model from `validationSettings.ai_model` default `google/gemini-3-pro-preview` (`:1323`).
- **Env keys:** `LOVABLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`:927-933`).
- **Other functions invoked:** none.

### Deterministic engine (notable)
The AI is treated as an extractor only; pass/fail is decided server-side in `applyDeterministicValidation` (`:87-897`) covering checks EARTH-001, INSUL-001, RCD-001, LOOP-001, PSCC-001, POL-001, SIG-001, COC-TYPE/SUPP/TEMP-001, CERT-DATE-001, REG-001, CERT-INCOMPLETE-001. Empirical fields reject text-pass values as legally insufficient (`:265-281`). `approvedCocType` from body overrides AI checkbox analysis (`:1379-1389`).

### Callers (in-repo)
- `src/components/ComplianceDashboard.tsx:367` — `invoke('validate-coc', …)`
- `src/views/subsection-detail/useSubsectionDetail.ts:563` — `invoke('validate-coc', …)`
- `src/views/subsection-detail/useSubsectionDetail.ts:865` — `invoke('validate-coc', …)`

### Security check
Auth is sound: `verify_jwt=true` + getUser + document↔subsection binding + Admin/Contractor-site gate via SECURITY DEFINER RPC. Service-role writes are scoped to the verified `documentId`/`subsectionId`. No privileged side effect reachable without auth. No flag.

---

## 2. `extract-coc`

**Purpose:** Extracts structured COC fields from a document via the Lovable AI gateway (two-pass + targeted retry), caches the result in `coc_extractions`.

### Auth model
- **config.toml:** `supabase/config.toml:16` → `[functions.extract-coc]` `verify_jwt = true` (`supabase/config.toml:17`). User JWT required for invocation.
- **In-handler:** identical pattern to validate-coc. Requires `Authorization` (`:941-947`); `getUser` (`:950`) → 401 (`:952-956`). If `documentId` provided, verifies row exists and (when `subsectionId` given) belongs to it (`:963-978`). Authorization gate (`:980-1013`): `Admin` always; otherwise `Contractor` + `contractor_has_site_access` for `subsectionId || documentRow.subsection_id` (`:990-1002`); else 403.
- **Who can call it successfully:** any authenticated user (valid JWT) who is `Admin`, OR a `Contractor` with site access to the target subsection. **Note:** if neither `documentId` nor `subsectionId` is supplied, `targetSubsectionId` is undefined, `contractorAllowed` stays false, and a non-Admin is 403'd — but an Admin can extract from an arbitrary `documentUrl` with no document/subsection binding (see security check).

### Inputs
JSON body (`:914`): `documentUrl` (required, 400 if missing `:923-928`), optional `fileName`, `retryFields[]`, `documentId`, `subsectionId`, `forceReextract`. Body `userId` is explicitly ignored — `extracted_by` comes from the JWT (`:913`, `:1327`). Header: `Authorization: Bearer <jwt>`.

### Side effects
- **Reads:** `subsection_documents` (`:964-968`); `user_roles` (`:981-985`); `subsections` site_id (`:993-997`); `coc_extractions` cache lookup by document_id (`:1019-1023`).
- **Storage:** downloads from bucket `documents` via `.download(filePath)` (`:1056-1058`) or direct `fetch(sourceUrl)` fallback (`:1069`).
- **Writes:** `coc_extractions` UPSERT on conflict `document_id` (`:1317-1333`) — only when both `documentId` and `subsectionId` present (`:1313`); sets `extracted_by = userId`.
- **External API:** Lovable AI gateway `…/v1/chat/completions` (`:837`, `:1089`), Bearer **`LOVABLE_API_KEY`**. Models: `google/gemini-2.5-flash` default / `google/gemini-2.5-pro` on forceReextract (`:1187`); non-PDF path uses `google/gemini-3-flash-preview` (`:1096`).
- **Env keys:** `LOVABLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`:930-936`).
- **Other functions invoked:** none.

### Callers (in-repo)
- `src/components/COCPreviewApproval.tsx:335`, `:409`, `:449` — `invoke('extract-coc', …)`
- `src/components/ComplianceDashboard.tsx:290` — `invoke('extract-coc', …)`
- `src/views/subsection-detail/useSubsectionDetail.ts:710` — `invoke('extract-coc', …)`

### Security check
Auth gate present and tenant-scoped, same RPC as validate-coc. One narrow observation: an **Admin** may pass an arbitrary `documentUrl` with no `documentId`/`subsectionId`; the function will `fetch(sourceUrl)` directly (`:1069`) and OCR it with no binding to a verified document row. This is an Admin-only SSRF-flavoured surface (download-and-extract of any URL the function can reach) but requires Admin auth, so it is low severity. Recorded as a security_flag (LOW).

---

## 3. `save-template`

**Purpose:** Create / update / delete rows in `inspection_templates` from a DocBuilder-supplied template payload.

### Auth model
- **config.toml:** `supabase/config.toml:34` → `[functions.save-template]` `verify_jwt = false` (`supabase/config.toml:35`). **No platform JWT check** — publicly invocable.
- **In-handler:** reads `Authorization` and `DOCBUILDER_PUBLIC_TOKEN` (`:15-16`). The check is **conditional**: `if (expectedApiKey && authHeader !== \`Bearer ${expectedApiKey}\`)` → 401 (`:18-23`). **If `DOCBUILDER_PUBLIC_TOKEN` is unset/empty, the guard is skipped entirely and the request proceeds unauthenticated** (fail-open).
- **Who can call it successfully:** anyone presenting `Bearer <DOCBUILDER_PUBLIC_TOKEN>` — OR **anyone at all if that env var is not configured**. No user identity, role, or tenant scoping. Comparison is a plain string `!==` (not constant-time).

### Inputs
JSON body (`:25`): `template` (object, required — 400 if missing `:27-32`) and `action` (`'create' | 'update' | 'delete'`, `:56/68/81`). `template` fields mapped at `:42-52` (name, category, description, sections, cover_page, tenants, sections_count, pages_count). `template.id` selects update/delete path (`:56-91`).

### Side effects
- **Writes:** `inspection_templates` INSERT (`:58-63`), UPDATE by id (`:70-76`), or DELETE by id (`:83-86`).
- **External API:** none.
- **Env keys:** `DOCBUILDER_PUBLIC_TOKEN` (`:16`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`:35-36`).
- **Other functions invoked:** none.

### Callers (in-repo)
None. No `invoke('save-template')` or `functions/v1/save-template` in `src` or `supabase/functions`. External DocBuilder caller only. ⚠️ UNVERIFIED — the external DocBuilder client is outside this repo.

### Security check
**Privileged write reachable without proper auth.** `verify_jwt=false` plus a fail-open token guard (`:18`) means: if `DOCBUILDER_PUBLIC_TOKEN` is not set, any unauthenticated caller can create/update/**delete** any `inspection_templates` row via the service-role client, with no tenant scoping. Even when the token IS set, it is a single shared static secret with no per-tenant scoping and a non-constant-time comparison. This is the create-user-admin class (privileged side effect, weak/absent auth). Recorded as security_flags (HIGH for fail-open delete/write; MEDIUM for shared-token + timing).

---

## 4. `template-sync`

**Purpose:** Bi-directional REST sync of `inspection_templates` in "PDFMaker" format — full CRUD plus webhook registration and a status endpoint, path-routed under `/template-sync/*`.

### Auth model
- **config.toml:** `supabase/config.toml:43` → `[functions.template-sync]` `verify_jwt = false` (`supabase/config.toml:44`). No platform JWT check.
- **In-handler:** `validateSyncKey(authHeader)` (`:11-30`, called `:118`). Compares Bearer token to `DOCBUILDER_SYNC_KEY` (`:12`). **Fail-open:** if `DOCBUILDER_SYNC_KEY` is unset it logs a warning and returns `{ valid: true }`, allowing access (`:14-18`). Otherwise requires `Bearer ` prefix (`:20-22`) and exact `token === expectedKey` (`:24-27`); mismatch → 401 (`:119-124`). Plain string equality (not constant-time).
- **Who can call it successfully:** anyone with `Bearer <DOCBUILDER_SYNC_KEY>` — OR **anyone if `DOCBUILDER_SYNC_KEY` is not configured**. No user/role/tenant scoping. Same gate applies to every route including destructive ones.

### Inputs
Path-routed (`:127`, `path = pathname.replace("/template-sync", "")`):
| Route | Method | Body / param |
|---|---|---|
| `/templates` | GET | — (`:133`) |
| `/templates/:id` | GET | id from path (`:165-166`) |
| `/templates` | POST | PDFMaker template body (`:191-193`) |
| `/templates/:id` | PUT | PDFMaker template body (`:223-226`) |
| `/templates/:id` | DELETE | id from path (`:260-261`) |
| `/webhook/register` | POST | `{ webhookUrl, events }` (`:291-294`) |
| `/sync/status` | GET | — (`:317`) |

Headers: `Authorization: Bearer <sync key>`, optional `x-sync-source` (logged, `:128`).

### Side effects
- **Reads:** `inspection_templates` SELECT all (`:134-137`), by id (`:168-172`), count for status (`:318-320`).
- **Writes:** `inspection_templates` INSERT (`:195-199`), UPDATE by id (`:228-236`), DELETE by id (`:263-268`).
- **External API:** `notifyWebhook(event, data)` (`:358-389`) POSTs to **`DOCBUILDER_WEBHOOK_URL`** (`:359`) on create/update/delete (`:210/247/279`). `/webhook/register` does NOT persist — registration is only `console.log`'d (`:301-303`), an in-memory/no-op stub (comment `:301`).
- **Env keys:** `DOCBUILDER_SYNC_KEY` (`:12`), `DOCBUILDER_WEBHOOK_URL` (`:359`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`:113-114`).
- **Other functions invoked:** none.

### Callers (in-repo)
None. No `invoke('template-sync')` or `functions/v1/template-sync` in `src`. External PDFMaker/DocBuilder integration only. ⚠️ UNVERIFIED — external caller outside this repo.

### Security check
**Privileged CRUD reachable without proper auth when `DOCBUILDER_SYNC_KEY` is unset** (fail-open, `:14-18`) — POST/PUT/DELETE on `inspection_templates` via service-role with no tenant scoping. When set, single shared static key, non-constant-time `!==` comparison, gates all routes uniformly. Recorded as security_flags (HIGH fail-open write/delete; MEDIUM shared-token + timing).

---

## 5. `templates`

**Purpose:** Read-only data export for the external report builder — returns report-type template structures plus aggregated app data (sites, subsections, inspections, floor plans, COC validations, snags, assets) and inspection templates.

### Auth model
- **config.toml:** `supabase/config.toml:31` → `[functions.templates]` `verify_jwt = false` (`supabase/config.toml:32`). No platform JWT check.
- **In-handler:** **fail-closed** token guard. If `DOCBUILDER_PUBLIC_TOKEN` is unset → 503, never serves data (`:347-353`). Otherwise compares the provided Bearer token to the expected token via **SHA-256 digests + constant-time XOR loop** (`:355-374`); mismatch → 401 (`:369-374`).
- **Who can call it successfully:** only a caller presenting the correct `Bearer <DOCBUILDER_PUBLIC_TOKEN>`. No user/role/tenant scoping (single shared token), but unlike #3/#4 it does NOT fail open and uses a timing-safe comparison.

### Inputs
No body/query parsed. Header: `Authorization: Bearer <DOCBUILDER_PUBLIC_TOKEN>` (`:344`).

### Side effects
- **Reads (parallel, `:383-401`):** `sites`, `subsections`, `inspections`, `subsection_floor_plans`, `coc_validations`, `inspection_templates`, `snags`, `site_assets`. **`clients` table is intentionally NOT queried** — comment notes client PII (email, contact person) must never be exposed (`:381-382`); response `clients: []` kept only for shape compatibility (`:534-536`).
- **Writes:** none (read-only).
- **External API:** none.
- **Env keys:** `DOCBUILDER_PUBLIC_TOKEN` (`:345`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`:376-377`).
- **Other functions invoked:** none.

### Callers (in-repo)
None. No `invoke('templates')` or `functions/v1/templates` in `src` (only `functions/v1/api-reports/*` referenced in `src/views/APIClients.tsx:435,451`, a different function). External report-builder integration only. ⚠️ UNVERIFIED — external caller outside this repo.

### Security check
Best-hardened of the template trio: fail-closed (`:348`), constant-time digest comparison (`:355-368`), and deliberate PII minimization (no `clients` query, `:381`). Still a single shared static token with no per-tenant scoping, and it exports aggregated cross-tenant data (all sites/subsections/assets) to any holder of that one token. Recorded as a security_flag (MEDIUM — broad cross-tenant data export behind one shared secret).

---

## Cross-function security summary

| Function | config verify_jwt | In-handler gate | Fails open? | Tenant-scoped? |
|---|---|---|---|---|
| validate-coc | true (`:14`) | JWT + Admin/Contractor-site (`:947`,`:972`) | no | yes |
| extract-coc | true (`:17`) | JWT + Admin/Contractor-site (`:950`,`:980`) | no | yes (Admin can pass raw URL) |
| save-template | false (`:35`) | static token, conditional (`:18`) | **yes** | no |
| template-sync | false (`:44`) | static token, conditional (`:14-18`) | **yes** | no |
| templates | false (`:32`) | static token, fail-closed + const-time (`:348`,`:355`) | no | no (single shared token) |
