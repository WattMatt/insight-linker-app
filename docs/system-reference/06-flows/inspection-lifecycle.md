# Flow — Inspection Lifecycle

Ground truth from code, 2026-06-11. Traces a compliance inspection end-to-end: **create → fill in →
raise snags → status transitions → sign-off**, plus the DB-internal linking helpers and the offline
path.

Schema/RLS/route/fn facts are cited from the earlier review chapters rather than re-derived:
- Tables: `inspections`, `inspection_items`, `inspection_subsections`, `inspection_signatures`, `snags`
  — `02-data-model/tables-02.md`, `tables-03.md`, `tables-04.md`, `tables-05.md`.
- RLS: `02-data-model/rls-policies-04.md` (inspections), `rls-policies-05.md` (snags/subsections),
  `rls-policies-02.md` (inspection_signatures, read-all caveats).
- RPCs/triggers: `02-data-model/rpcs-and-functions-01.md` / `-02.md`, `triggers-enums-storage.md`.
- Routes/guards: `04-routes/contractor.md`, `04-routes/admin-sites-inspections.md` (referenced),
  `03-auth-and-access/access-contexts-and-roles.md`.
- Known issues: `GAPS.md` (G-SEC-12…15, G-SEC-01), `SECURITY-FINDINGS-phase2.md` §A/§B/§C.

**Line numbers are 1-based against the files as they exist 2026-06-11.**

---

## Actors & where they enter the flow

| Actor | Role source | Enters via | Effective write rights on the inspection tree |
|---|---|---|---|
| **Admin** | `user_roles.role='Admin'` | `/sites/...`, `/clients/.../sites/...`, `/inspections` | Full `FOR ALL` on inspections/subsections/snags/signatures (`rls-policies-04.md:58`, `-05.md:43`) |
| **User** (signup default) | `user_roles.role='User'` | same admin-style routes | Full `FOR ALL` manage-all on inspections/subsections/snags (`rls-policies-04.md`, `-05.md:46`) — **see G-SEC-01** |
| **Contractor** | `user_roles.role='Contractor'` + ≥1 `user_sites` row | `/contractor/...` group | `inspections` UPDATE+INSERT for *assigned* sites only (`rls-policies-04.md:59-60`); **no** `snags` write path; `inspection_signatures` wide-open (see flags) |
| **Client** | `user_roles.role='Client'` | `/client-portal/...` | SELECT-only on inspections/snags for own sites (`rls-policies-04.md` client SELECT) — read of the lifecycle, not a writer |
| **Admin-in-preview** | `Admin` + `?preview=<siteId>` | `/contractor/...` | Renders contractor UI but writes under **Admin** policies — `ContractorProtectedRoute.tsx:19` bypass |

> ⚠️ Post the 2026-06-11 tier-2 lockdown, **every authenticated principal** has `auth_read_*
> USING(true)` SELECT on `inspections`, `subsections`, `snags` — i.e. all reads below are gated to
> *logged-in* users but **not** to assigned/owning users (`rls-policies-02.md:234`, `-05.md:53,135`).
> Writes are the only place role/tenant scoping still (partially) bites.

---

## Step sequence

### Phase A — Create an inspection

There are **two distinct creation entry points** (subsection-level and site-level), plus an offline
fallback. Template selection differs between them.

**A1 — Subsection-level create (the primary path).**
- **Actor/trigger:** Admin/User on `/sites/[siteId]/subsections/[subsectionId]` (or client-scoped
  variant) clicks "Create Inspection"; contractor reaches the same code via the shared view.
- **Handler:** `src/views/subsection-detail/useSubsectionDetail.ts:1480` `handleCreateInspection`.
- **Template selection:** `selectedTemplateId || linkedTemplate?.id` (`:1482`); the subsection's
  `inspection_template_id` (`subsections` col, `tables-02.md:200`) provides the linked default. Title
  is computed; for `Site Drawing`/`Progress` categories it embeds site name + date (`:1488-1496`).
- **Writes:** INSERT into `inspections` (`:1500-1514`) with `subsection_id`, `site_id`, `template_id`,
  a generated `firebase_id`, `title`, `inspection_date`, `status:'Pending'`, `priority:'Medium'`,
  `json_data:{}`.
- **DB side-effects on INSERT:**
  - BEFORE trigger `trg_inspections_auto_link_subsection` fires (`tables-03.md:76`); but because
    `subsection_id` is already set here, the auto-link no-ops (`rpcs-and-functions-02.md:188-190`).
  - `update_inspections_updated_at` not relevant on INSERT.
- **Response/next:** toast "Inspection created successfully"; `fetchSubsectionData()` re-renders the
  subsection's inspection list (`:1518-1522`). User clicks into the new row → Phase B.
- **RLS gate:** Admin/User pass `FOR ALL` manage; Contractor passes
  `Contractors can insert inspections for assigned sites` only if `site_id ∈ user_sites`
  (`rls-policies-04.md:60`).

**A2 — Site-level create (no subsection).**
- **Actor/trigger:** Admin/User on `/sites/[siteId]` "Inspections" tab clicks create.
- **Handler:** `src/views/SiteDetail.tsx:576` `handleCreateInspection`.
- **Template selection:** requires `selectedTemplateId` from `availableTemplates` (`:577-579`); name
  becomes `Site-wide: <template name>`.
- **Writes:** INSERT into `inspections` (`:581-585`) with `site_id`, `template_id`, `title`,
  `shop_name`, `inspection_date`, `status:'Pending'` — **no `subsection_id`**, **no `json_data`**
  (defaults to `'{}'::jsonb`, `tables-03.md:50`).
- **DB side-effect (the linking helper engages here):** `trg_inspections_auto_link_subsection`
  fires; with `subsection_id IS NULL` it would call `resolve_inspection_subsection(site_id, json_data)`
  — but `json_data` is empty/`{}` on this insert, so the resolver finds no `subsectionId`/`shopNumber`
  and returns no match (`rpcs-and-functions-02.md:175-180`). The inspection stays site-level. The
  partial index `idx_inspections_site_subsection_null` supports these rows (`tables-03.md:59`).
- **Response/next:** toast; navigate to `/sites/[siteId]?tab=inspections` (`:590-591`).
  Site-level inspections are listed by `SiteLevelInspections.tsx` (filters
  `!i.subsection_id`, `:24`) and have **no dedicated detail route** — clicking routes back to the
  site page with a query filter (`SiteLevelInspections.tsx:26-31`).

**A3 — Offline create (fallback).**
- **Handler:** `src/hooks/useOfflineInspections.ts:23` `createInspection`. If online it does the same
  INSERT (`:34-40`); on failure (or offline) it saves to IndexedDB with an `offline_<ts>` id and
  enqueues a `CREATE_INSPECTION` mutation (`:53-58`).
- **Sync:** `src/hooks/useOfflineSync.ts:59` replays the queued `inspections.insert([mutation.data])`
  when back online. ⚠️ The replayed payload carries the local `offline_…` string id — see
  data-integrity note below.

---

### Phase B — Fill in the inspection (the form)

- **Actor/trigger:** Admin/User (admin routes) or Contractor (`/contractor/inspections/[id]`) opens the
  inspection. **Single shared view** `src/views/InspectionDetail.tsx` (2885 lines) for all three
  contexts; context is inferred from URL params:
  `isContractorPortal = !clientId && !siteId && !subsectionId` (`InspectionDetail.tsx:105`,
  `contractor.md:91`).

**B1 — Load.**
- **Handler:** `fetchInspectionData()` (`:725`). Verifies/refreshes the Supabase session first
  (`:745-766`); on hard session failure → cache fallback or `/auth` (`:762-764`).
- **Reads:** `inspections` joined to `sites→clients` and `subsections` by id (`:769-790`,
  `.maybeSingle()`); then `inspection_templates` by `template_id` separately (`:844-856`).
  Site image is re-signed from the private `site-images` bucket via `createSignedUrl(path, 3600)`
  (`:891-893`).
- **Template normalization:** sections/items coerced to keyed objects regardless of array-vs-object
  shape (`:922-1000`); if no template, a structure is synthesized from `json_data` keys (`:1001-1047`).
  This is the in-app equivalent of the dropped one-off `normalize_inspection_json_data()` migration
  (`rpcs-and-functions-01.md:314-318`) — that function is **not** called at runtime; it ran once and
  was dropped.
- **RLS gate:** read succeeds for any authenticated user (`auth_read_inspections USING(true)`,
  `tables-03.md:70`). Error handling distinguishes `PGRST116`/`42501` permission codes (`:802-805`).
- **Failure paths:** retry up to 2× on transient/network errors (`:796-799`); not-found → toast +
  context-aware navigate (`:820-838`).

**B2 — Edit fields & checklist items.**
- **General info** (`renderGeneralInfo`, `:1533`): project/shop/inspector/date/rep/etc. via
  `handleFieldChange` (`:1133`) → local state only.
- **Checklist items** per template section: status `Pass/Fail/N/A/Pending` + notes via
  `handleItemChange(sectionKey, itemKey, 'status'|'notes', value)` (`:1137`), written into
  `inspection.jsonData[sectionKey][itemKey]` in memory. **Note:** the per-item data lives in
  `inspections.json_data` JSONB — **not** in the `inspection_items` table, which is a legacy/orphaned
  table tied to `inspection_subsections` and only touched by cascade-delete cleanup
  (`tables-02.md:307-336,417-443`).
- **Status select** options: `Pending / In Progress / Completed / Failed` (`:1652-1655`).
- **Quality rating** 1–5 select (`:1626-1630`); DB CHECK enforces `1..5` (`tables-03.md:58`).

**B3 — Photo upload (per item, per tenant, per snag).**
- **Item photos:** `handleImageUpload` (`:1161`) → `supabase.storage.from('inspection-photos')
  .upload(...)` (`:1190`), public URL appended to `jsonData[section][item].photos` (deduped, `:1222`).
  Path built by `generateInspectionImagePath` (client/site/subsection-named, `:1179`).
- **Tenant images:** `handleTenantImageUpload` (`:511`) uploads then **auto-saves** the whole
  `json_data` immediately (`:553-559`) — a privileged `inspections.update` outside the Save button.
- **Storage bucket:** `inspection-photos` (public bucket). ⚠️ Anon read/write/delete open — see flags
  (`triggers-enums-storage.md:124-172`, `SECURITY-FINDINGS-phase2.md §C`).

**B4 — Save.**
- **Handler:** `handleSave` (`:1479`). Guard: status `Completed` requires a `quality_rating`
  (`:1483-1486`) — **client-side only**, no DB CHECK enforces this coupling.
- **Writes:** `inspections.update({...scalar fields, status, quality_rating, json_data (incl.
  tenants), updated_at})` by id (`:1499-1517`).
- **DB side-effects:** `update_inspections_updated_at` BEFORE UPDATE; and because the UPDATE touches
  `json_data`, `trg_inspections_auto_link_subsection` fires again — if `subsection_id` were NULL it
  could now resolve+link from `json_data.subsectionId`/`generalInfo.shopNumber`
  (`rpcs-and-functions-02.md:175-194`).
- **Response:** re-fetches from DB to confirm persisted state (`:1522`), toast success.
- **RLS gate:** Admin/User `FOR ALL`; Contractor `Contractors can update inspections for assigned
  sites` (site-scoped, `rls-policies-04.md:59`). Read-back succeeds for any authenticated user.
- **Failure path:** JWT/session-expiry errors across upload handlers trigger session refresh and, on
  failure, redirect to `/auth` (`:576-589`, `:702-716`, `:1244-1258`).

---

### Phase C — Raise & manage snags

Snags are attached to a **subsection** (`snags.subsection_id` NOT NULL, optional
`inspection_id`, `tables-04.md:128-129`). The snag UI is in the InspectionDetail "Snag List" tab,
shown only when the inspection has a subsection context (`fetchSnags` requires `subsectionId`,
`:273-276`; tab hidden for `Site Drawing`, `:2041`).

**C1 — Create snag.**
- **Handler:** `handleCreateSnag` (`:297`). Reads `auth.getUser()` for `created_by` (`:306`).
- **Writes:** INSERT into `snags` (`:320-322`) with `subsection_id`, `title`, `description`, `notes`,
  `photos`, `risk_level` (free text, no DB CHECK — `tables-04.md:138`), `estimated_cost` (ZAR numeric),
  `status:'Open'`, `created_by`.
- **Snag photos:** `handleSnagPhotoUpload` (`:667`) → `inspection-photos` bucket under
  `<subsectionId>/snags/<ts>-<i>.<ext>` (`:678`).
- **Risk levels:** UI surfaces `Critical/High/Medium/Low` (display badges, `:2487-2492` region);
  values are not constrained at the DB.
- **RLS gate:** ⚠️ **Admin & User only** can INSERT snags (`Admins/Users can manage all snags`,
  `rls-policies-05.md:43,46`). **Contractor has no snag write policy** (`rls-policies-05.md:53`) — the
  contractor portal still renders create/edit/delete controls, so for a real contractor the write
  **fails closed at RLS** (`contractor.md:119`). An **Admin-in-preview** DOES write (Admin rights).

**C2 — Edit snag.** `handleUpdateSnag` (`:344`) → `snags.update({title, description, notes, photos,
risk_level, estimated_cost})` by id (`:353-363`).

**C3 — Status transitions.**
- **In InspectionDetail:** `handleToggleSnagStatus` (`:383`) toggles **Open ↔ Closed** only
  (`newStatus = currentStatus === 'Open' ? 'Closed' : 'Open'`, `:384`) → `snags.update({status})`
  (`:387-390`). The button label is "Close"/"Reopen" (`:2541` region).
- **DB CHECK:** `status IN ('Open','Closed')` per migration (`tables-04.md:160`) — but ⚠️ types.ts
  types `status` as plain `string` and the codebase elsewhere reads/writes a `'Rectified'`/`'rectified'`
  value (e.g. `SiteOverview.tsx:228`, `useUnifiedSiteData.ts:383`, `ClientPortalDashboard.tsx:77`),
  implying the CHECK was widened out-of-band or is bypassed. UNVERIFIED whether the live CHECK still
  rejects `'Rectified'`.
- **Rectification fields (`rectification_notes`/`rectified_at`/`rectified_by`, `tables-04.md:140-143`):**
  these columns exist on `snags` but **no checked-in writer targets the `snags` table with them.** The
  rectify-with-photo workflow writes to a **different** table — `floor_plan_pins` — via
  `InteractiveFloorPlan.tsx:373-381` (`handleSaveRectification`). So "Open → Rectified → Closed" as a
  full snag-table lifecycle is **partially implemented**: Open/Closed via the snag UI; the
  "Rectified" state is produced by the floor-plan-pin path and read back by dashboards, not by a snag
  status writer in the surveyed UI. ⚠️ UNVERIFIED that any UI writes `snags.status='Rectified'`.

**C4 — Delete snag.** `handleDeleteSnag` (`:402`) — `confirm()` then `snags.delete()` by id
(`:406-409`). RLS: Admin/User only.

**Realtime:** `useSubsectionDetail.ts:500-504` subscribes to `postgres_changes` on `snags` filtered
by `subsection_id` so the list live-updates.

---

### Phase D — Complete / status transitions on the inspection

Two transition surfaces, both writing `inspections.status`:
- **InspectionDetail Save** (`:1512`) — sets whatever status the select holds, with the
  client-side `Completed ⇒ quality_rating required` guard (`:1483`).
- **Subsection list quick-action** `handleUpdateInspectionStatus` (`useSubsectionDetail.ts:1529`):
  when target is `Completed`, it first SELECTs `quality_rating` and **blocks completion if unset**
  (`:1531-1542`) — a second enforcement of the same rule, also client-side. Then
  `inspections.update({status})` (`:1546-1549`).
- **Reporting hand-off:** completion does not auto-generate a report; the UI instructs the user to use
  "Generate Report" (`:1543`), which routes to the PDF edge functions (out of scope here; see
  `05-edge-functions/pdf-generation.md`).
- **RLS gate:** same as Phase B writes — Admin/User full; Contractor site-scoped UPDATE.

---

### Phase E — Sign-off (signatures)

- **Actor/trigger:** any user on the inspection "Sign-Off" tab (`:2522-2524`), rendered for non-Site
  Drawing templates (`:2042`). Component `InspectionSignatures` (`src/components/InspectionSignatures.tsx`)
  renders four `SignatureCapture` cards: `inspector / contractor / client / witness` (`:90-117`).
- **Load:** `fetchSignatures()` SELECTs `inspection_signatures` by `inspection_id`
  (`InspectionSignatures.tsx:35-38`).
- **Capture & save:** `SignatureCapture.saveSignature` (`SignatureCapture.tsx:137`) draws to canvas →
  `canvas.toDataURL('image/png')` base64 → **UPSERT** into `inspection_signatures`
  (`:158-174`) on conflict `(inspection_id, signer_type)` — matching the table's
  `UNIQUE(inspection_id, signer_type)` (`tables-02.md:396`). Stores `signer_name`, optional
  `signer_email`, `signature_data` (base64), `signed_at`. `signature_url`/`ip_address` left null by
  this path.
- **Delete:** `deleteSignature` (`:193`) → `inspection_signatures.delete()` by `id` (`:197-200`).
- **RLS gate:** ⚠️ `inspection_signatures` policies are effectively `true`/`true` for any
  authenticated principal: INSERT `WITH CHECK (auth.uid() IS NOT NULL)`, UPDATE `USING (auth.uid()
  IS NOT NULL)` despite the "their own" name, SELECT via an `EXISTS` join, DELETE Admin-only
  (`tables-02.md:399-404`, `rls-policies-02.md:162`). There is **no ownership column** and no
  site/tenant scoping. See flag.

---

## DB-internal linking helpers (summary)

| Helper | Type | When it runs in this flow | Reads / writes | Citation |
|---|---|---|---|---|
| `inspections_auto_link_subsection()` | BEFORE INSERT/UPDATE-OF(`json_data`,`subsection_id`) trigger fn, INVOKER, `search_path=public` | Every inspection INSERT and every UPDATE that touches `json_data`/`subsection_id`; only acts when `subsection_id IS NULL` | calls resolver; mutates `NEW.subsection_id` in-flight | `rpcs-and-functions-02.md:185-194`; trigger `tables-03.md:76` |
| `resolve_inspection_subsection(site_id, json_data)` | plpgsql STABLE, INVOKER | Called by the trigger | reads `subsections` (firebase_id match, then `normalize_shop_key` shop match); writes nothing | `rpcs-and-functions-02.md:171-183` |
| `normalize_shop_key(text)` | sql IMMUTABLE | inside the resolver | pure (uppercase + strip non-alnum) | `rpcs-and-functions-02.md:160-169` |
| `normalize_inspection_json_data()` | **DROPPED** one-off | not at runtime — ran once in migration, then `DROP FUNCTION` | rewrote numeric→string keys in `inspections.json_data` | `rpcs-and-functions-01.md:314-318` |
| `inspection_relink_audit` | table (no FK) | written by the trigger path + the one-time backfill | audit of relink attempts; Admin-only read | `tables-03.md:641-682` |

The runtime "normalize" of JSON shape is done **client-side** in `fetchInspectionData` (`:922-1047`),
not by the dropped RPC.

---

## Offline behaviour

- **Read offline:** `useOfflineInspectionDetail` caches the inspection + template + site/subsection on
  successful load (`InspectionDetail.tsx:1064-1069`); when `!isOnline`, `fetchInspectionData` loads
  from IndexedDB cache (`:732-741`) and shows an offline banner (`InspectionOfflineBanner`, rendered
  near `:2015`). No cache → toast + navigate back (`:737-740`).
- **Online-flicker guard:** initial load is gated by `initialLoadDone` so a network blip mid-save
  doesn't re-fetch and clobber unsaved local state (`:236-254`).
- **Write offline:** create falls back to a queued `CREATE_INSPECTION` mutation
  (`useOfflineInspections.ts:53-58`); `useOfflineSync.processQueue` replays inserts/updates when
  online (`useOfflineSync.ts:59`). Photo capture offline is handled by the offline-photo subsystem
  (`offline_photos` / `coc_compliance_photos`, `tables-03.md:197-241`), out of this doc's main path.

---

## Data integrity / trust boundaries

1. **All reads are "any authenticated", not tenant-scoped.** After the tier-2 lockdown,
   `auth_read_inspections`/`_subsections`/`_snags` are `authenticated USING(true)`
   (`tables-03.md:70`, `rls-policies-05.md:47,135`). A contractor (or any logged-in account) can
   **read any inspection / subsection / snag by UUID**, regardless of site assignment
   (`contractor.md:121`). The client-side `isContractorPortal`/URL-param logic is **not** a security
   boundary — it only selects navigation targets.

2. **Writes are the only partially-scoped layer.** `inspections` UPDATE/INSERT is site-scoped for
   Contractors (`rls-policies-04.md:59-60`) but fully open to Admin **and the signup-default `User`
   role** (`rls-policies-04.md:58`, and G-SEC-01). `snags` writes admit only Admin/User —
   Contractor snag writes fail closed (`rls-policies-05.md:53`).

3. **Completion invariants are client-only.** "Completed ⇒ quality_rating set" is enforced twice in
   TypeScript (`InspectionDetail.tsx:1483`, `useSubsectionDetail.ts:1531-1542`) but has **no DB CHECK
   or trigger** — a direct REST `update({status:'Completed'})` bypasses it. The only DB CHECK is
   `quality_rating ∈ [1,5]` (`tables-03.md:58`).

4. **Snag status model is inconsistent.** The migration CHECK is `('Open','Closed')`
   (`tables-04.md:160`) but the app reads/writes `'Rectified'`/`'rectified'` (mixed case) widely; the
   rectification *columns* on `snags` have no UI writer (the rectify workflow writes
   `floor_plan_pins`). ⚠️ UNVERIFIED whether the live `snags.status` CHECK still exists and what
   value set it allows; mixed-case status values are an integrity hazard for any equality filter.

5. **Signature trust boundary is effectively open.** Sign-off rows carry no ownership/tenant column;
   any authenticated principal can upsert or (Admin) delete signatures on **any** inspection by id
   (`tables-02.md:399-404`). Sign-off is a legal/compliance artifact, so writeability by unrelated
   accounts is a meaningful integrity gap, not just access.

6. **Offline id collision risk.** Queued offline creates carry a string `offline_<ts>_<rand>` id into
   `inspections.insert` on replay (`useOfflineInspections.ts:27,56`; `useOfflineSync.ts:59`). The
   `inspections.id` column is `uuid DEFAULT gen_random_uuid()` (`tables-03.md:26`); inserting a
   non-UUID string id will be rejected by the type, or (if the queued payload omits id) duplicated.
   ⚠️ UNVERIFIED end-to-end replay behaviour — flagged as a correctness risk, not confirmed bug.

7. **Auto-link mutates tenancy silently.** `trg_inspections_auto_link_subsection` can change
   `NEW.subsection_id` on any UPDATE touching `json_data` (`rpcs-and-functions-02.md:188-190`). A
   crafted `json_data.subsectionId`/`generalInfo.shopNumber` could steer an inspection's subsection
   linkage on a site the writer can write to. Resolver reads `subsections` only within the same
   `site_id`, so it can't cross sites, but it can mislink within a site. Low severity, noted for
   completeness.

---

## Security flags (this flow)

See `SECURITY-FINDINGS-phase2.md` and `GAPS.md` for the tracked items; the ones materialised by this
flow are restated below with flow-specific evidence.

- **CRITICAL — write tree open to self-registered `User`** — open signup + `handle_new_user` default
  `'User'` + `User` `FOR ALL` on inspections/subsections/snags means any internet signup can
  create/fill/complete/snag any tenant's inspections (`rls-policies-04.md:58`, `rls-policies-05.md:46`;
  chain in `SECURITY-FINDINGS-phase2.md §B.0`, G-SEC-01).
- **MEDIUM — cross-tenant inspection read** — `InspectionDetail` loads by id with no site-ownership
  check (`InspectionDetail.tsx:769-790`); `auth_read_inspections USING(true)` lets any authenticated
  user read any inspection by UUID (`contractor.md:121`, `rls-policies-02.md:234`).
- **MEDIUM — sign-off integrity / signatures wide-open** — `inspection_signatures` upsert/delete gated
  only by `auth.uid() IS NOT NULL`-equivalent `true`/`true`; any authenticated principal can
  write/delete sign-off signatures on any inspection (`SignatureCapture.tsx:158-200`,
  `tables-02.md:399-404`, `contractor.md:120`).
- **HIGH — inspection-photo storage anon-open** — item/tenant/snag photo uploads write the
  `inspection-photos` public bucket with blanket "Anyone can …" `storage.objects` policies (anon
  read/write/delete) (`InspectionDetail.tsx:1190`, `:680`; `triggers-enums-storage.md:124-172`,
  `SECURITY-FINDINGS-phase2.md §C`).
- **LOW — contractor snag UI / RLS mismatch** — the contractor portal renders snag create/edit/delete
  controls with no Contractor `snags` write policy; fails closed for real contractors but the same
  controls write when reached by an Admin in `?preview=` mode (`contractor.md:119`,
  `InspectionDetail.tsx:320,353,406`).
- **LOW — completion invariant client-only** — `Completed ⇒ quality_rating` is enforced only in TS
  (`InspectionDetail.tsx:1483`, `useSubsectionDetail.ts:1531`); a direct REST write bypasses it (no DB
  CHECK/trigger).
- **LOW — admin-preview bypass reaches the lifecycle** — `ContractorProtectedRoute.tsx:19` lets an
  Admin with `?preview=<siteId>` reach the fill/snag/sign-off screens with no role/path/orphan check,
  writing under Admin policies (`contractor.md:157`).
- **LOW — snag-status integrity** — DB CHECK `('Open','Closed')` vs app use of mixed-case
  `'Rectified'`/`'rectified'`; UNVERIFIED live CHECK; equality filters on `status` are fragile
  (`tables-04.md:160`; `SiteOverview.tsx:228`).
