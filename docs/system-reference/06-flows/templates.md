# Flow — Templates (end-to-end)

Ground-truth trace of the **two distinct template systems** in WM Compliance. Every claim cites
`src/…:line`, `supabase/functions/…:line`, a migration filename, or an earlier review chapter.
Inferences not provable in code are tagged **⚠️ UNVERIFIED**.

> **The two systems are NOT the same table and serve different jobs:**
> 1. **Inspection templates** (`inspection_templates`) — reusable section/field definitions that
>    drive an inspection *form* (and a category of PDF). Edited in-app by staff, also CRUD'd by an
>    external **DocBuilder** integration via three edge functions.
> 2. **PDF report templates** (`pdf_report_templates`) — per-`report_type` styling/section config
>    (cover title, accent colour, section order/visibility) that every PDF report generator is
>    *supposed* to fetch before rendering. This is the "Gatekeeper" architecture.
>
> They overlap only in the Settings → `PDFTemplateManager` UI, which edits **both** tables from one
> screen (`src/components/settings/PDFTemplateManager.tsx:560-613`).

Cross-references (consult, don't re-derive):
- Edge fns `save-template` / `template-sync` / `templates` + COC fns — [`05-edge-functions/coc-and-templates.md`](../05-edge-functions/coc-and-templates.md).
- `inspection_templates` RLS — [`02-data-model/rls-policies-02.md:195-215`](../02-data-model/rls-policies-02.md).
- Routes `/inspection-templates*`, `/pdf-template-tests` — [`04-routes/admin-config-tools.md:32-95,153-166,351-366`](../04-routes/admin-config-tools.md).
- `validate_inspection_templates` RPC — `02-data-model/rpcs-and-functions-*.md` + migration `20251120045114`.
- Known issues — [`GAPS.md`](../GAPS.md) G-SEC-12/13, [`SECURITY-FINDINGS-phase2.md`](../SECURITY-FINDINGS-phase2.md) §A, §B.1.

---

## Tables touched (quick map)

| Table | Purpose | RLS effective (from 02-data-model) |
|---|---|---|
| `inspection_templates` | Reusable inspection form section/field defs (`sections` JSONB, `tenants`, `cover_page`, `category`, `*_count`) | Blanket `ALL USING/CHECK (auth.uid() IS NOT NULL)` + `auth_read_…` SELECT — **any authenticated CRUD, no role/tenant gate** (`rls-policies-02.md:202`) |
| `pdf_report_templates` | Per-`report_type` PDF styling + section config; `is_default` unique per type | `ALL USING has_role(uid,'Admin')` (write = Admin only) + `SELECT auth.uid() IS NOT NULL` (any authenticated read) (`20260110132516…:19-27`) |

Note the asymmetry: **PDF report templates are Admin-gated at the DB layer; inspection templates are not.**

---

# System 1 — Inspection templates (`inspection_templates`)

## 1A. Create / edit in-app (staff UI path)

**Step 1 — Actor reaches the builder.**
Staff clicks "Create Template" or "Tweak"/"Edit" on `/inspection-templates`
(`src/views/InspectionTemplates.tsx:450-453`, `:546-553`). Routes `/inspection-templates`,
`/inspection-templates/new`, `/inspection-templates/[templateId]/edit`, `/inspection-templates/validate`
are all in the `(admin)` group behind `ProtectedRoute` (admits "staff" = Admin/User/Moderator; bounces
Contractor/Client) — `04-routes/admin-config-tools.md:36-37,57-58,82-83`.
→ **Client guard only.** The DB has no matching gate (see Trust Boundaries).

**Step 2 — Builder loads existing data (edit path).**
`TemplateBuilderPage` reads `templateId` from route params and, on edit, SELECTs
`inspection_templates` by id `.single()` (`04-routes/admin-config-tools.md:61,65`), passing it to
`TemplateBuilder` as `initialData` (`src/components/TemplateBuilder.tsx:70-76`). The in-page inline
editor variant fetches all templates via `InspectionTemplates.tsx:312-316`.

**Step 3 — Actor edits sections/fields/tenants in local React state.**
`TemplateBuilder` holds `sections` (each: `{id, name, order_index, items[]}`) and `tenants` in state
(`TemplateBuilder.tsx:74-75`). Field types are `text|textarea|number|image|checkbox|select`
(`:14-20,61-68`). The **Tenants** tab only appears when the template name contains "main board" or
"shop board" (`:257,373`) — a name-string heuristic, not a schema flag.

**Step 4 — Save → direct client write to `inspection_templates`.**
`saveTemplate()` (`TemplateBuilder.tsx:163-208`) builds `templateData`
(`name, category, description, sections, tenants, sections_count, pages_count, updated_at`, `:171-180`).
Tenants are persisted **only** when the name heuristic matches AND `tenants.length>0` (`:176`).
- Edit: `supabase.from("inspection_templates").update(templateData).eq("id", templateId)` (`:184-187`).
- Create: `supabase.from("inspection_templates").insert(templateData)` (`:193-195`).
The **browser's anon/user Supabase client** performs the write directly — RLS is the only gate, and the
effective policy is `auth.uid() IS NOT NULL` (any authenticated principal). No service-role, no edge fn.

**Step 5 — Response / UI feedback.**
On success → `toast.success(...)` + `onSave?.()` → `TemplateBuilderPage` redirects
`window.location.href = "/inspection-templates"` (`04-routes/admin-config-tools.md:71`). On error →
`toast.error("Failed to save template")` (`TemplateBuilder.tsx:202-204`). No optimistic offline queue
on this path — a failed network write is surfaced as a toast and lost.

**Alt 4′ — Inline "Tweak" editor (same table, fewer fields).**
`InspectionTemplates.tsx`'s `InlineTemplateEditor.handleSave` UPDATEs
`name/description/category/sections/sections_count/pages_count/updated_at` directly
(`InspectionTemplates.tsx:150-161`). Same RLS gate, same client write.

## 1B. Import a PDF → inspection template (extraction path)

**Step 6 — "Import PDF" toggles uploader.**
`InspectionTemplates.tsx:442-445,459` shows `PDFTemplateUploader`.

**Step 7 — Client-side PDF parse.**
`PDFTemplateUploader` calls `extractTemplateFromPDF(file)`
(`src/components/PDFTemplateUploader.tsx:86`, lib `src/lib/pdfTemplateExtractor.ts`) — extraction runs
in-browser; the extracted structure becomes an editable `ExtractedTemplate`.

**Step 8 — Save extracted template.**
On confirm, `supabase.from('inspection_templates').insert({...})` directly
(`PDFTemplateUploader.tsx:119-121`), then `onTemplateSaved?.()` refreshes the list
(`InspectionTemplates.tsx:460-463`). Same client-write + RLS path as Step 4.

## 1C. External DocBuilder CRUD (edge-function path)

The same `inspection_templates` rows are also written by an **out-of-repo DocBuilder/PDFMaker**
integration via three edge functions. **All three hold the service-role key (RLS bypassed); a static
shared token is the only gate.** Full per-function detail in
[`05-edge-functions/coc-and-templates.md` §3/§4/§5](../05-edge-functions/coc-and-templates.md). Config
line numbers below are the **current** `supabase/config.toml` (the phase-2 doc cited older lines; the
file was edited after G-SEC-15 removed the `validation-chat` stanza — claims unchanged, lines shifted).

**Step 9 — `save-template` (create/update/delete one template).**
- Gate: `verify_jwt = false` (`supabase/config.toml:30-31` `[functions.save-template]`); in-handler
  token check is **fail-open** — `if (expectedApiKey && authHeader !== \`Bearer ${expectedApiKey}\`)`
  (`supabase/functions/save-template/index.ts:18`). If `DOCBUILDER_PUBLIC_TOKEN` is unset, the guard is
  skipped and the request proceeds unauthenticated.
- Action: maps DocBuilder payload → `dbTemplate` (`save-template/index.ts:42-52`), then
  INSERT (`:58-63`) / UPDATE by id (`:70-76`) / DELETE by id (`:83-86`) on `inspection_templates` via
  service-role. No tenant scoping, no user identity. Non-constant-time `!==` comparison.
- 0 in-repo callers (`05-edge-functions/coc-and-templates.md` §3) — external DocBuilder only ⚠️ UNVERIFIED.

**Step 10 — `template-sync` (REST CRUD + webhook + status, path-routed).**
- Gate: `verify_jwt = false` (`config.toml:39-40`); `validateSyncKey` is **fail-open** on
  `DOCBUILDER_SYNC_KEY` — unset ⇒ logs a warning and returns `{valid:true}`
  (`supabase/functions/template-sync/index.ts:14-18`); set ⇒ exact `token === expectedKey` (`:24-27`).
- Routes (path `pathname.replace("/template-sync","")`, `:127`): `GET/POST /templates`,
  `GET/PUT/DELETE /templates/:id`, `POST /webhook/register`, `GET /sync/status`. All gated uniformly by
  the same fail-open key, including destructive DELETE (`:260-268`).
- Writes `inspection_templates` via service-role (INSERT `:195-199`, UPDATE `:228-236`, DELETE `:263-268`)
  in "PDFMaker" format (converted `:91-105`). On create/update/delete it `notifyWebhook(...)`
  POSTs to `DOCBUILDER_WEBHOOK_URL` (`:358-389`). `/webhook/register` is a **no-op stub** —
  registration is only `console.log`'d, never persisted (`:301-303`).
- 0 in-repo callers — external integration only ⚠️ UNVERIFIED.

**Step 11 — `templates` (read-only export for the report builder).**
- Gate: `verify_jwt = false` (`config.toml:27-28`); in-handler is **fail-closed** — unset
  `DOCBUILDER_PUBLIC_TOKEN` → 503 (`supabase/functions/templates/index.ts:347-353`); otherwise
  **constant-time** SHA-256 digest XOR comparison (`:355-374`).
- Reads (service-role, parallel): `sites, subsections, inspections, subsection_floor_plans,
  coc_validations, inspection_templates, snags, site_assets`
  (`05-edge-functions/coc-and-templates.md` §5). **`clients` is deliberately NOT queried** (PII
  minimisation, `templates/index.ts:381-382`); `clients:[]` kept only for shape.
- Exports **aggregated cross-tenant** data to any holder of the one shared token. 0 in-repo callers ⚠️ UNVERIFIED.

## 1D. Validate (read-only diagnostic)

**Step 12 — `/inspection-templates/validate`.**
`TemplateValidator` (`src/views/TemplateValidator.tsx`) on mount calls RPC
`supabase.rpc('validate_inspection_templates')` (`:32`).

**Step 13 — RPC executes (SECURITY DEFINER, read-only).**
`validate_inspection_templates()` (migration `20251120045114…:4-67`,
`GRANT EXECUTE … TO authenticated` `:72`) scans **all** `inspection_templates` rows and returns
`(template_id, template_name, issue_type, issue_description)` for three issue classes: `Structure`
(null/non-array/empty `sections`, `:18-31`), `Missing Name` (a section with empty `name`, `:36-44`),
`Duplicate ID` (`group by section->>'id' having count>1`, `:49-65`). It is `SECURITY DEFINER` with
`SET search_path=public` (`:12-13`) and performs **no writes**.

**Step 14 — UI feedback.**
Issues rendered in a table; `Edit Template` links to `/inspection-templates/edit/${template_id}`
(`TemplateValidator.tsx:139`). ⚠️ **This path is reversed vs the real route segment**
`/inspection-templates/[templateId]/edit`, so it likely 404s (`04-routes/admin-config-tools.md:93-95`,
runtime-unverified).

## 1E. Template → inspection form → rendered report (the consumer)

This is "how a template drives an inspection form."

**Step 15 — Pick a template at the subsection.**
`TemplateBasedReport` (`src/components/TemplateBasedReport.tsx`) is mounted for a subsection. On mount it
SELECTs all `inspection_templates` (`:83-87`); the user selects one via `handleTemplateSelect` (`:110-114`).

**Step 16 — Template sections become a fillable form.**
The selected template's `sections[].items[]` are rendered as inputs; per-item answers
(`status`, `notes`, `photos[]`) are held in local `reportData` keyed `reportData[sectionId][itemId]`
(`TemplateBasedReport.tsx:67,116-174`, render `:358`). Photos upload to the `documents` bucket
(`:140-149`). **This form state is local only** — it is not written back to `inspection_templates`
(templates are read-only definitions here).

**Step 17 — Generate the report PDF.**
`sectionsForPdf` is built by zipping the template structure with the user's `reportData`
(`:199-211`), then `generatePdfShiftInspectionReport({...})` renders server-side via PDFShift
(`:231-236`, lib `src/lib/pdfshiftInspectionReport.ts`). A preview URL is shown.

**Step 18 — Save the rendered report to documents.**
`handleSaveToDocuments` fetches the preview blob and `savePDFToDocuments({blob, fileName, subsectionId,
categoryName})` (`:265-273`) — persists to the `documents` bucket + `subsection_documents`
(see `06-flows/` PDF flow / `05-edge-functions/coc-and-templates.md` for the document-write path).
**Note:** template-based reports carry `snags:[]` (`:225`) and use a synthetic id
`template-${template.id}` (`:221`) — they are a one-shot PDF, not a persisted `inspections` row.

**Alt 15′ — Persisted inspection bound to a template.**
A real `inspections` row may carry `template_id`. When `InspectionDetail` loads such a row, it SELECTs
the template separately: `inspection_templates … .eq('id', inspData.template_id).maybeSingle()`
(`src/views/InspectionDetail.tsx:844-855`) and stores `templateId` + `templateCategory`. The filled
answers live in `inspections.json_data` (`InspectionDetail.tsx:190-208,556,646`), not on the template.
The template provides structure; the inspection row provides the data.

---

# System 2 — PDF report templates (`pdf_report_templates`) — the "Gatekeeper"

Design intent (`docs/PDF_TEMPLATE_GATEKEEPER_ARCHITECTURE.md`): **every PDF report MUST fetch its
`pdf_report_templates` config before generation**, so cover/branding/section-order/colours are
centrally controlled. Reality is partial (see Step 23).

## 2A. Seed + schema

**Step 19 — Table + RLS + defaults created.**
Migration `20260110132516…:2-13` creates `pdf_report_templates`
(`id, name, report_type, description, is_default, customization JSONB, sections JSONB, created_by`).
RLS enabled (`:16`) with **two policies**:
- `Admins can manage PDF templates` — `FOR ALL USING has_role(auth.uid(),'Admin')` (`:19-22`) → **writes are Admin-only at the DB layer.**
- `Authenticated users can view PDF templates` — `FOR SELECT USING auth.uid() IS NOT NULL` (`:24-27`).
A partial unique index enforces one `is_default=true` row per `report_type` (`:36-38`). Five default
rows are seeded (site_summary/inspection/floor_plan/asset_verification/compliance, `:41-81`). Later
migrations `20260119123152` / `20260120073408` `UPDATE pdf_report_templates` to tune the seeds.

## 2B. Edit in Settings → PDFTemplateManager

**Step 20 — Open the manager.**
`PDFTemplateManager` (`src/components/settings/PDFTemplateManager.tsx`) loads on the Settings page.
On mount it SELECTs `pdf_report_templates` ordered by `report_type` (`:560-565`) AND `inspection_templates`
(`:588-595`, for the inspection-preview selector) — this is the one screen that reads **both** systems.

**Step 21 — Edit styling/sections in the WYSIWYG editor.**
`handleEditTemplate` loads `customization` + `sections` into state (`:615-621`); `PDFWYSIWYGEditor`
emits changes; section toggle/reorder mutate local `sections` (`:702-718`). A reference-site selector
drives realistic previews via `useUnifiedSiteData` (`:361`, real tenant data ⚠️ cross-tenant preview
exposure — see Trust Boundaries).

**Step 22 — Save → client write to `pdf_report_templates`.**
`handleSaveTemplate` does `supabase.from("pdf_report_templates").update({customization, sections})
.eq("id", editingTemplate.id)` (`:628-634`). `handleResetTemplate` overwrites with code defaults
(`:655-661`). **The write succeeds only for an Admin** (RLS `has_role(uid,'Admin')`); a non-Admin staff
(role `User`) gets an RLS denial surfaced as `toast.error(error.message)` (`:642-644`). Contrast System 1,
where any authenticated user can write.
- Also from this screen: `handleSaveInspectionTemplate` UPDATEs `inspection_templates.sections`
  (`:680-688`) — a **System-1** write living in the System-2 UI. This is the dead/half-wired
  inspection-template editor flagged as **G-PROD-02** (`GAPS.md`).

## 2C. Template → render (the gateway)

**Step 23 — Generator fetches template before rendering.**
The mandated entry point is `usePDFTemplateGateway(reportType)` (hook,
`src/hooks/usePDFTemplateGateway.ts:225`) or async `fetchPDFTemplate(reportType)` (`:352`). Both:
SELECT `pdf_report_templates where report_type=? and is_default=true .single()`
(`:235-240` / `:360-365`), parse `customization`/`sections` JSON (`:253-264`), and **merge over
hard-coded `DEFAULT_TEMPLATES`** (`:80-194`, merge `:280-291`).
- **No template found** (`PGRST116`) is treated as *not an error* → fall back to code defaults
  (`:243-248`, `:386-388`). On any other fetch error, `fetchPDFTemplate` logs and returns
  `DEFAULT_TEMPLATES` (`:401-419`) — **fail-open to defaults**, so a PDF always renders even if the DB
  is unreachable.
- `enabledSections` = template sections filtered `enabled` and sorted by `order` (`:289-291`); the
  generator iterates these to decide what to render (gatekeeper doc §3).

**Step 24 — Render.**
The report generator (e.g. `inspectionReportGenerator.ts`, the PDF flow) applies
`customization.accentColor`, cover title/subtitle, and the enabled/ordered sections, then emits the PDF.
Per the architecture doc's own status table, **only Site Summary is fully integrated**; inspection,
floor-plan, asset-verification, COC-validation generators are marked "🔴 Not integrated"
(`docs/PDF_TEMPLATE_GATEKEEPER_ARCHITECTURE.md`, Phase-3 table). ⚠️ So the "every report fetches its
template" invariant is **aspirational, not enforced** in current code.

**Step 25 — Test harness.**
`/pdf-template-tests` (`src/views/PDFTemplateTestDashboard.tsx`) runs
`runPDFTemplateTests(reportType)` (`src/lib/pdfTemplateTestRunner.ts:612,633,660`) which SELECTs
`pdf_report_templates` + `inspection_templates` read-only (`04-routes/admin-config-tools.md:153-166`).
`adminOnly` here is cosmetic — any staff role loads it (`SECURITY-FINDINGS-phase2.md` §B.3).

---

## Error & offline paths

- **In-app writes (Systems 1 & 2):** no offline queue on the template-edit paths. A failed
  `supabase.update/insert` is caught and shown as a `toast.error` (`TemplateBuilder.tsx:202-204`,
  `PDFTemplateManager.tsx:642-644`); the edit is not retried or persisted locally.
- **RLS denial (System 2):** non-Admin save → Postgres RLS error → `toast.error(error.message)`
  (`PDFTemplateManager.tsx:642-644`). System 1 has no such denial (blanket policy).
- **Gateway fetch failure (System 2):** falls back to `DEFAULT_TEMPLATES` so generation never blocks
  (`usePDFTemplateGateway.ts:243-248,401-419`).
- **Edge-fn errors:** `save-template` returns 500 with `error.message` (`save-template/index.ts:104-110`);
  `template-sync` returns 500 `server_error` (`template-sync/index.ts:347-353`), 404 for unknown routes
  (`:343-346`), 404 for missing template on GET/:id (`:174-179`).
- **Validate RPC failure:** `TemplateValidator` catches and `toast.error("Failed to validate templates")`
  (`TemplateValidator.tsx:43-46`).
- **PDFShift report-gen failure (Step 17):** `toast.error(result.error || "Failed to generate report")`
  (`TemplateBasedReport.tsx:244-249`).
- **Offline (inspection consumer):** the persisted-inspection path reads `inspections.json_data` from a
  local cache when available (`InspectionDetail.tsx:189-208`); template structure is re-fetched from
  `inspection_templates` when online (`:844-849`). Template *definitions* are not cached for offline edit.

---

## Data integrity / trust boundaries

- **Two write models, asymmetric gating.** `pdf_report_templates` writes are **Admin-only** at the DB
  (`has_role(uid,'Admin')`, `20260110132516…:19-22`). `inspection_templates` writes are gated **only** by
  `auth.uid() IS NOT NULL` (`rls-policies-02.md:202`) — any authenticated principal, including a
  Contractor/Client who reaches the table by REST, can create/update/**delete** any template. The
  `/inspection-templates` client `ProtectedRoute` guard is **cosmetic** w.r.t. the data layer
  (`04-routes/admin-config-tools.md:46`).
- **Self-registration amplifies this.** With open signup (G-SEC-01) every new account defaults to role
  `User`, which satisfies `auth.uid() IS NOT NULL` — so any internet user who registers can CRUD
  `inspection_templates` (`SECURITY-FINDINGS-phase2.md` §B.0/§B.1). G-SEC-12's written-but-unapplied
  lockmigration (`20260611140000_admin_config_write_lockdown.sql`) would staff-gate this write
  (`GAPS.md` G-SEC-12) — **awaiting dashboard apply; still open.**
- **Service-role edge fns are the deepest trust boundary.** `save-template` and `template-sync` carry the
  service-role key (RLS fully bypassed) and gate on a single shared static token that **fails open** when
  unset (`save-template/index.ts:18`; `template-sync/index.ts:14-18`). If either env var is missing,
  unauthenticated callers get full INSERT/UPDATE/DELETE on `inspection_templates`. This is the
  `create-user-admin` class. `templates` is the hardened one (fail-closed + constant-time, `:347-374`).
- **No tenant scoping anywhere in either template system.** `inspection_templates`/`pdf_report_templates`
  have no `tenant_id`/`client_id` column in the schemas read here; templates are global. The `templates`
  edge fn exports cross-tenant aggregate data behind one token (`coc-and-templates.md` §5).
- **Tenants embedded by name heuristic.** `TemplateBuilder` persists the `tenants[]` array only when the
  template *name* contains "main board"/"shop board" (`TemplateBuilder.tsx:176`); the same string test
  shows/hides the editor tab (`:257,373`). A rename can silently strip tenant data on next save.
- **WYSIWYG preview reads real tenant data.** `PDFTemplateManager`'s preview pulls a live reference
  site's subsections/inspections/COC data via `useUnifiedSiteData` (`PDFTemplateManager.tsx:361`); any
  staff editing templates sees another tenant's real data in-preview (ties to the §B blanket-read model).
- **Webhook is unauthenticated egress.** `template-sync` POSTs full template payloads to
  `DOCBUILDER_WEBHOOK_URL` on every CRUD (`template-sync/index.ts:358-389`) with no signature — whoever
  controls that env var receives all template data; `/webhook/register` does not actually register
  (no-op stub, `:301-303`).
- **Validate RPC is safe.** `validate_inspection_templates` is `SECURITY DEFINER`, read-only, with
  pinned `search_path` and `EXECUTE` granted to `authenticated` (migration `20251120045114…:12-13,72`) —
  no injection/escalation surface; it does scan all tenants' templates (consistent with the no-tenant
  model).
- **Broken edit link.** `TemplateValidator` links to a reversed path that likely 404s
  (`TemplateValidator.tsx:139` vs route `…/[templateId]/edit`) — integrity/UX defect, not a security one.

---

## Open questions (carried to GAPS where applicable)

- Are `DOCBUILDER_PUBLIC_TOKEN` / `DOCBUILDER_SYNC_KEY` / `DOCBUILDER_WEBHOOK_URL` actually set in prod?
  The fail-open severity of `save-template`/`template-sync` hinges entirely on this; it's
  dashboard-only state, not in repo. ⚠️ UNVERIFIED (G-SEC-12).
- Is the external DocBuilder/PDFMaker integration live, and which of the three fns does it call? 0
  in-repo callers for all three. ⚠️ UNVERIFIED.
- Does the reversed `/inspection-templates/edit/<id>` link 404 at runtime? ⚠️ UNVERIFIED
  (`04-routes/admin-config-tools.md:93-95`).
- Is the `PDFTemplateManager` inspection-template editor (Step 22 `handleSaveInspectionTemplate`) reachable
  / wired, or dead UI? Tracked as G-PROD-02 (decide remove-or-finish).
