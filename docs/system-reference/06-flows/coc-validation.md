# Flow — COC Validation (Certificate of Compliance pipeline)

> ⛔ **SUPERSEDED 2026-06-12 — this entire flow was REMOVED.** The COC auto-validation engine (`validate-coc`/`extract-coc`, the SANS deterministic checks, the review/approval/override UI, and the `coc_validations`/`coc_extractions`/`coc_validation_settings`/`coc_local_validations`/`coc_compliance_photos` tables) no longer exists. COC is now a **manual** per-subsection verdict (`subsections.coc_status` = Pass/Fail/Missing/…) plus a per-COC failure report; a failed/expired required COC **gates** `is_compliant` via `apply_subsection_recompute`. New flow of record: `docs/superpowers/COC-VALIDATION-STRIPOUT-TRACKER.md` + `docs/superpowers/plans/2026-06-11-coc-manual-workflow.md`. The trace below is retained for historical reference only.

Ground-truth trace of the Certificate of Compliance (COC) validation pipeline against SANS 10142-1:2020. Every claim cites a `src` path with `:line`, an edge-function path, a migration filename, or an earlier review chapter. Anything inferred but not provable in code is tagged **⚠️ UNVERIFIED**.

**Charter cross-refs (cited, not re-derived):**
- Edge functions `extract-coc` / `validate-coc`: `docs/system-reference/05-edge-functions/coc-and-templates.md` (sections 1–2).
- Tables `coc_extractions`, `coc_local_validations`: `docs/system-reference/02-data-model/tables-01.md:281,310`.
- Tables `coc_validation_settings`, `coc_validations`: `docs/system-reference/02-data-model/tables-02.md:11,62`.
- Table `subsection_documents` / `subsections` (coc fields, trigger): `docs/system-reference/02-data-model/tables-05.md:183,260`.
- Trigger `sync_coc_compliance_status` / `trg_sync_coc_compliance`: `docs/system-reference/02-data-model/triggers-enums-storage.md:55`; migration `supabase/migrations/20260201151127_01cd682f-c771-455b-9df6-dd86d54b1af4.sql`.
- RPC `contractor_has_site_access`: `docs/system-reference/02-data-model/rpcs-and-functions-01.md:99`.

---

## Pipeline at a glance

```
[upload COC → subsection_documents]
        │
        ▼  (user clicks Extract/Review)
[extract-coc edge fn]  ── AI/Gemini extract ──▶ coc_extractions (one row/document, confidence high|medium|low)
        │
        ▼  (user reviews + Approve & Verify, optional approvedCocType)
[validate-coc edge fn] ── AI extract (vision) ──▶ applyDeterministicValidation() (SANS rule engine)
        │                                              │
        │                                              ▼ overallStatus ∈ Pass|Fail|Incomplete (+Error/FileNotFound)
        ├──▶ subsection_documents UPDATE (coc_number/issue_date/type/status)
        ├──▶ subsections UPDATE (coc fields + is_compliant)   ──┐
        └──▶ coc_validations UPSERT (status, violations, report_data, validated_by)
                                                                 ▼
                                          [trg_sync_coc_compliance on subsections]
                                          sync_coc_compliance_status() → recompute is_compliant
```

There is **no automated bulk validation loop** — see step 9. "Bulk runs" in the dashboard refers only to a realtime subscription that reflects per-document validations as they land (`src/components/ComplianceDashboard.tsx:413`).

---

## Actors & roles

- **Admin** — may extract/validate any document on any subsection (`validate-coc/index.ts:979`, `extract-coc/index.ts:987`).
- **Contractor** — may extract/validate only documents whose subsection is on a site they have access to, gated by RPC `contractor_has_site_access` (`validate-coc/index.ts:990-992`, `extract-coc/index.ts:1000-1002`).
- **Anyone else authenticated** — 403 from both functions (`validate-coc/index.ts:996-1001`, `extract-coc/index.ts:1007-1012`).
- **Unauthenticated** — rejected twice: platform `verify_jwt=true` before the handler, then in-handler `getUser` (`validate-coc/index.ts:939-954`, `extract-coc/index.ts:942-957`). See chapter `05-edge-functions/coc-and-templates.md:17,50`.

---

## Step sequence

### Step 0 — COC document is uploaded to a subsection
- **Actor/trigger:** authenticated user uploads a file under a subsection. Document rows live in `subsection_documents` (coc fields backfilled historically — `docs/system-reference/02-data-model/tables-05.md:183`).
- **Handler:** offline-aware upload via `uploadDocument` (`src/hooks/useOfflineSubsections.ts:71`, online branch `:94`). When offline the mutation is queued (`useOfflineSync.queueMutation`, `src/hooks/useOfflineSubsections.ts:32,68`) and **the AI extraction/validation pipeline cannot run** — `extract-coc`/`validate-coc` are network calls to edge functions.
- **Writes:** storage bucket `documents`; row in `subsection_documents`.
- **Next:** user opens the document for COC review (dashboard or subsection-detail).
- **RLS/auth:** `subsection_documents` INSERT policy is `auth.uid() IS NOT NULL` (`docs/system-reference/02-data-model/tables-05.md:183`) — any authenticated user may insert; tenant scoping on upload is weak (noted as a pre-existing finding there, not introduced by this flow).

### Step 1 — Resolve a usable document URL (client)
- **Actor/trigger:** user clicks "Review/Extract" on a pending document.
- **Handler (dashboard):** `src/components/ComplianceDashboard.tsx:255-285` parses the stored `file_url`, prefers a **public URL** for the `documents` bucket (`getPublicUrl`, `:263-265`), falls back to a 3600 s signed URL (`:271-273`).
- **Handler (subsection-detail):** `src/views/subsection-detail/useSubsectionDetail.ts:691-706` — signed URL (3600 s) for storage objects.
- **Reads:** storage `documents`.
- **Next:** invoke `extract-coc` with the resolved URL.

### Step 2 — `extract-coc` invoked (AI extraction → `coc_extractions`)
- **Actor/trigger:** client `supabase.functions.invoke('extract-coc', …)`:
  - `src/components/ComplianceDashboard.tsx:290` (review path).
  - `src/views/subsection-detail/useSubsectionDetail.ts:710` (extract path).
  - `src/components/COCPreviewApproval.tsx:335,409,449` (preview / retry-field paths) — per chapter `05:66`.
- **Body:** `documentUrl` (required, 400 if missing — `extract-coc/index.ts:923-928`), optional `fileName`, `documentId`, `subsectionId`, `forceReextract`, `retryFields`. **Body `userId` is explicitly ignored** — `extracted_by` comes from the JWT (`extract-coc/index.ts:913,1327`).
- **Auth gate (in-handler):** `verify_jwt=true` (`supabase/config.toml`, chapter `05:50`); requires `Authorization` (`:942-947`); `getUser(token)` → 401 (`:950-956`); if `documentId` given, verifies the row exists and (when `subsectionId` given) `subsection_id` matches (`:963-978`); role gate: `Admin` always, else `Contractor` + `contractor_has_site_access` for `subsectionId || documentRow.subsection_id` (`:980-1013`), else 403.
- **Cache:** if `documentId && !forceReextract && !retryFields`, a prior `coc_extractions` row is returned as `{cached:true, confidence}` without re-calling the AI (`:1016-1039`).
- **Storage/AI:** downloads from bucket `documents` (`.download(filePath)`, chapter `05:59`) or direct `fetch(sourceUrl)` fallback; OCR/extract via Lovable AI gateway (`google/gemini-2.5-flash` default, `…2.5-pro` on `forceReextract`, `…3-flash-preview` non-PDF — chapter `05:61`), Bearer `LOVABLE_API_KEY`.
- **Confidence:** computed from missing-field count; written as `'high' | 'medium' | 'low'` (`extract-coc/index.ts:1294-1304`; CHECK constraint enforces that set — `tables-01.md:299`).
- **Write:** `coc_extractions` UPSERT on conflict `document_id` **only when both `documentId` and `subsectionId` are present** (`:1313-1333`), setting `extracted_by = userId`, `confidence`, `extraction_method`, `extracted_data`.
- **Response:** `{success, extractedData, confidence, model, cached?, missingFields, extractionId}` (`:1344-1349`).
- **Next:** client shows the extracted fields in `COCPreviewApproval` for human review.
- **Error paths:** 400 missing `documentUrl`; 401 no/invalid JWT; 400 document↔subsection mismatch; 403 role; AI errors surface as `{error}` (502 on empty AI data, `extract-coc/index.ts:901`). `coc_extractions` save failure is **non-fatal** — extraction data is still returned (`:1335-1341`).

### Step 3 — Human review & approval (client)
- **Actor/trigger:** user reviews extracted COC fields (`COCPreviewApproval`), may correct `cocType`, `cocNumber`, `cocIssueDate`, then clicks **Approve & Verify**.
- **Handler:** `handleApproveAndVerify` (`src/components/ComplianceDashboard.tsx:335`) or `handleApproveAndVerify` in subsection-detail (`src/views/subsection-detail/useSubsectionDetail.ts:820`).
- **Pre-writes (client, optimistic):** writes user-approved `coc_number/coc_type/coc_issue_date` to `subsections` and `subsection_documents` **before** validation (`ComplianceDashboard.tsx:354-365`; `useSubsectionDetail.ts:839-863`, with rollback of local state if validate fails `:874-887`).
- **Next:** invoke `validate-coc` carrying `approvedCocType` (normalized, `ComplianceDashboard.tsx:347,372`).
- **Alternate entry:** `handleManualValidation` (`useSubsectionDetail.ts:551-565`) calls `validate-coc` directly with no `approvedCocType` (AI checkbox analysis decides type). Requires an active session client-side (`:556-561`).

### Step 4 — `validate-coc` invoked: auth + settings load
- **Actor/trigger:** client `supabase.functions.invoke('validate-coc', …)`:
  - `src/components/ComplianceDashboard.tsx:367`.
  - `src/views/subsection-detail/useSubsectionDetail.ts:563` (manual) and `:865` (approve-and-verify).
- **Body:** `documentId`, `documentUrl`, `subsectionId` — **all three required**, 400 if any missing (`validate-coc/index.ts:907-914`). Optional `approvedCocType`, `testSettings`, `revalidateFailedOnly`.
- **Auth gate:** identical to step 2 — `verify_jwt=true`; `Authorization` required (`:939-944`); `getUser` → 401 (`:947-954`); document↔subsection binding `documentRow.subsection_id === subsectionId`, else **400** (`:959-970`); role gate `Admin` always / `Contractor` + `contractor_has_site_access(subsection.site_id)` (`:972-1002`), else 403.
- **Settings load:** if `testSettings` in body → merged over `DEFAULT_SETTINGS` (`:1007-1009`); else read the singleton `coc_validation_settings` (`.limit(1).single()`, `:1012-1016`) merged over defaults; on read error → defaults with a console warning (`:1018-1023`). (Settings table is a seeded singleton — `tables-02.md:11`.)
- **Thresholds (`DEFAULT_SETTINGS`, `validate-coc/prompt.ts:807-830`):**
  - `earth_continuity_max_ohms = 5.0`
  - `insulation_resistance_min_mohms = 0.25`
  - `rcd_trip_1x_max_ms = 300`, `rcd_trip_5x_max_ms = 150`
  - `ai_confidence_threshold_percent = 30`
  - `mandatory_failures_for_fail = 2`, `safety_critical_failures_for_fail = 1`
  - `ai_model = 'google/gemini-3-pro-preview'`
- **Next:** download document + AI extraction.

### Step 5 — Download document & run AI extraction (validate-coc)
- **Storage:** `.download(storagePath)` from bucket `documents` (`:1109-1111`); fallbacks `createSignedUrl(300s)` then `getPublicUrl` + `fetch` (`:1120-1138`).
- **File-not-found path:** if all download attempts fail, returns **HTTP 200** with `{success:false, status:'FileNotFound', complianceStatus:'Skipped'}` (`:1152-1162`; empty-blob variant `:1168-1179`) — a graceful non-crash; **no `coc_validations` row is written** in this branch.
- **AI call:** Lovable AI gateway `…/v1/chat/completions` (`:1316`), Bearer `LOVABLE_API_KEY` (`:1319`), model `validationSettings.ai_model` (default `google/gemini-3-pro-preview`), `temperature` default `0.1`, `max_tokens 16384` (`:1322-1327`). Up to 3 attempts (`MAX_RETRIES = 2`, `:1311-1313`).
- **AI errors:** `429` → "Rate limit exceeded" (`:1334-1339`); `402` → "Payment required" (`:1340-1345`); other non-OK → throw → caught → HTTP 500 `{status:'Error'}` (`:1347`, `:1801-1812`). JSON is extracted from possibly-markdown content and trailing commas stripped before `JSON.parse` (`:1359-1376`).
- **COC-type override:** `approvedCocType` from the body **overrides AI checkbox analysis** (`:1379-1389`); otherwise server-side checkbox correction runs from `checkboxStates` (`:1390-1399`).
- **Next:** deterministic engine.

### Step 6 — Deterministic SANS rule engine (`applyDeterministicValidation`)
- **Handler:** `validate-coc/index.ts:87-897`. The AI is an **extractor only**; pass/fail is decided server-side (`:16-18`).
- **Counters:** `hasSafetyCriticalFail` (bool) and `mandatoryFailCount` (int) accumulate across checks (`:94-95`).
- **Empirical-vs-text rule (core integrity control):** for empirical fields (`INSUL-001`, `RCD-001`, `LOOP-001`, `PSCC-001`), a text value like "OK"/"Pass" (`TEXT_PASS`) is **rejected as legally insufficient → Fail** (e.g. RCD: `:382-398`). Non-empirical checks (`POL-001`, `SIG-001`, `EARTH-001`) accept text-pass values (`:20-28`). `parseNumericValue` handles SA comma-decimals, "N/A", "∞"/">500" infinity, etc. (`:53-76`).
- **Per-check logic and severity** (each gated by its `*_check_enabled` setting):
  - `COC-TYPE-001` (`:104-180`) — exactly one type checkbox marked; unmarked → **safety-critical** fail (`:117-120`). Hierarchy: Supplementary/Temporary must reference a valid Initial COC (`:150-173`).
  - `EARTH-001` earth continuity (`:187-247`) — measured ≤ `earth_continuity_max_ohms` (5 Ω). Breach → **safety-critical** (`:229-233`); text-pass path increments `mandatoryFailCount`.
  - `INSUL-001` insulation resistance ≥ `insulation_resistance_min_mohms` (0.25 MΩ) (`:250-346`) — measured below limit → **safety-critical**; text-pass → mandatory fail.
  - `RCD-001` RCD trip times (`:351-431`) — limit chosen by multiplier (1×/2×/5×); measured ≤ limit. Breach → **safety-critical** (`:408-417`); text-pass → mandatory fail.
  - `LOOP-001` earth-loop impedance Zs (`:529-624`) — measured ≤ `getMaxZs(mcbRating, mcbType)` from the Type-B lookup (Type C ×0.5, Type D ×0.25, `:31-51`). Breach → **safety-critical**.
  - `PSCC-001` prospective short-circuit current (`:676…`).
  - `POL-001` polarity (`:438-452`) — AI result trusted; Fail increments `mandatoryFailCount` (`:448`).
  - `SIG-001` signature/`DOC-001` (`:493-520`) — missing signature → **Administrative** critical + `mandatoryFailCount++` (`:509-516`).
  - Plus `CERT-DATE-001`, `REG-001`, `CERT-INCOMPLETE-001` (chapter `05:33`).
- **AI-supplied extra failures** are merged in but de-duplicated against deterministic clauses, and invalid AI failures for Initial COCs are filtered out (`:855-864`).

### Step 7 — Determine overall status (Pass / Fail / Incomplete)
- **Handler:** `validate-coc/index.ts:866-896`. Decision order:
  1. `hasSafetyCriticalFail` true → **Fail** (`:869-871`). (1 safety-critical failure fails the COC — matches `safety_critical_failures_for_fail = 1`.)
  2. else `mandatoryFailCount >= settings.mandatory_failures_for_fail` (default 2) → **Fail** (`:872-875`).
  3. else if `CERT-INCOMPLETE-001` result is `Fail` → **Incomplete** (missing mandatory empirical tests) (`:878-882`).
  4. else if `aiResult.confidenceScore < ai_confidence_threshold_percent` (default 30) → **Incomplete** (`:884-890`).
  5. else → **Pass** (initial value `:867`).
- **So a COC PASSES** only when: no safety-critical failure, fewer than 2 mandatory failures, certificate not flagged incomplete, and AI confidence ≥ threshold.
- **Returns** `{checks, overallStatus, criticalFailures}` (`:896`).

### Step 8 — Persist results (validate-coc writes)
- **Status mapping** (`:1527-1542`): `Pass→` document `approved`/subsection `Approved`; `Fail→rejected`/`Failed`; everything else → `pending`/`pending`.
- **Write A — `subsection_documents` UPDATE** (`:1567-1571`): per-document `coc_number`, `coc_issue_date`, normalized `coc_type` (Initial/Supplementary/Temporary/Not Marked, `:1554-1564`), `coc_status` (mapped). Failure logged, non-fatal (`:1573-1577`).
- **Write B — `subsections` UPDATE** (`:1625-1674`): runs when validation produced a `cocNumber`/`cocIssueDate`. A **priority ladder** decides whether to overwrite existing subsection COC data (`Approved`/`valid`=4 > `Failed`/`invalid`=3 > `pending`=2 > `Missing`=1, `:1598-1606`), but **a failed validation ALWAYS updates to `Failed`** (`:1613,1620`). It sets `is_compliant` from a 4-way AND: COC type marked AND validation passed AND hierarchy valid AND no critical failures (`:1644-1659`). When the priority ladder decides **not** to overwrite, it still forces `is_compliant=false` if the result is non-compliant (`:1681-1714`).
- **Write C — `coc_validations` UPSERT** on conflict `document_id` (`:1718-1754`): `status = overallStatus || 'Error'`, `violations = criticalFailures`, `validated_by = userId`, `validated_at`, and a rich `report_data` JSON (engine tag `SANS-10142-1-2020-v4-strict-empirical`, settings applied, revalidation metadata). `status` CHECK set = `Pass|Fail|Pending|Error|Incomplete` (`tables-02.md:83`); `document_id` is UNIQUE → one validation row per document (`tables-02.md:84,94`). DB error here **throws → HTTP 500** (`:1756-1759`).
- **Response:** `{success:true, status, confidenceScore, violations, checks, report, settingsApplied}` (`:1763-1799`).
- **Order note:** Write B (`subsections`) happens **before** Write C (`coc_validations`). The compliance trigger fires on the Write-B UPDATE (step 8.5) and at that instant reads the *previous* `coc_validations` row, not the row being written in Write C. The `is_compliant` value persisted by Write B (`:1659`) is the authoritative one for this run; the trigger may recompute it from `coc_status` independently (see Data integrity).

### Step 8.5 — Trigger `trg_sync_coc_compliance` (DB, automatic)
- **Trigger:** `BEFORE INSERT OR UPDATE OF coc_status, is_coc_required ON public.subsections FOR EACH ROW` → `sync_coc_compliance_status()` (migration `20260201151127_…sql:55-62`; `triggers-enums-storage.md:55`).
- **Function** (`SECURITY DEFINER`, `search_path=public`, migration `:2-53`):
  - Only acts when `coc_status` or `is_coc_required` actually changed (or on INSERT) (`:12-15`).
  - `is_coc_required=false` → `is_compliant=true`, return (`:18-21`).
  - Else checks the **most-recent** `coc_validations` row for this subsection; if its `status ∈ ('Fail','Failed','Incomplete')` → `is_compliant=false` (`:24-40`).
  - Else `coc_status ∈ ('Approved','Valid','Pass')` → `is_compliant=true`; otherwise `false` (`:42-48`).
- **Effect:** keeps `subsections.is_compliant` consistent with `coc_status` + latest validation even when other code paths change `coc_status` without recomputing compliance. Reads `coc_validations`; writes only `NEW` (BEFORE trigger).

### Step 9 — Client post-processing / "bulk" behaviour
- **Per-document only:** each Approve & Verify (or manual validation) processes **one** document. No code loops over multiple documents to validate them in a batch — repo grep for bulk/batch/`Promise.all`/`forEach(async)` over `validate-coc` finds none; the only "bulk" reference is a comment on a realtime subscription (`src/components/ComplianceDashboard.tsx:413`).
- **Live refresh:** the dashboard subscribes to `coc_validations` changes and re-fetches so multiple independent validations appear live (`ComplianceDashboard.tsx:413`, `fetchAllValidations`); subsection-detail subscribes to `subsection_documents` changes (`useSubsectionDetail.ts:522`) and calls `fetchCocValidations` after each validate (`:928`).
- **UI feedback:** toast on Pass ("verification passed"), Fail (with violation count), or Incomplete/warning (`ComplianceDashboard.tsx:383-385`; `useSubsectionDetail.ts:894-902`).
- **Re-validation mode:** `revalidateFailedOnly` carries forward previously-passed checks and re-runs only failed ones (`validate-coc/index.ts:923-925,1043-1078,1731-1735`). ⚠️ UNVERIFIED — no in-`src` caller passes `revalidateFailedOnly`; it appears edge-side only.

---

## Offline behaviour

- Document **upload** is offline-capable and queues a mutation when offline (`useOfflineSubsections.ts:71,94`; `:68` "Changes saved offline. Will sync when online.").
- **Extraction and validation are online-only.** Both are `supabase.functions.invoke(...)` network calls; there is no offline AI path. `handleManualValidation` requires an active session and otherwise aborts (`useSubsectionDetail.ts:556-561`).
- `coc_local_validations` is a schema-defined table for locally-computed (non-AI) validation with fraud-risk scoring, but **no `from('coc_local_validations')` call site exists in `src` or `supabase/functions`** — ⚠️ UNVERIFIED whether any runtime path writes/reads it (`tables-01.md:310-312`). It is not part of the observed AI pipeline.

---

## Data integrity / trust boundaries

- **AI is never trusted for pass/fail.** `applyDeterministicValidation` recomputes status from extracted measurements server-side; AI checkbox/type analysis can be overridden by the deterministic engine and by `approvedCocType` (`validate-coc/index.ts:16-18,1379-1389`). Empirical fields reject non-numeric "pass" text (`:382-398`). This is the central integrity control.
- **Service-role + in-handler auth is the only gate.** Both functions use `SUPABASE_SERVICE_ROLE_KEY`, so RLS is bypassed for their DB/storage access; the JWT `getUser` + document↔subsection binding + Admin/Contractor-site RPC is the entire trust boundary (chapter `05:6,17-19,50-51`). Writes are scoped to the verified `documentId`/`subsectionId`.
- **Client writes are optimistic and partly authoritative.** The client writes user-approved COC fields to `subsections`/`subsection_documents` *before* validation (step 3); these run under the **caller's** RLS (not service-role) and can be rolled back locally only (`useSubsectionDetail.ts:874-887`). A failed `validate-coc` after a successful pre-write leaves the optimistic DB values in place server-side (only client state rolls back). ⚠️ Possible drift if validation later fails.
- **Two writers of `is_compliant`.** Both `validate-coc` (explicit 4-way AND, `:1659`) and the DB trigger (`coc_status`-derived, migration `:42-48`) set `is_compliant`. They can disagree: e.g. a `Pass` with a marked-but-hierarchy-invalid case sets `is_compliant=false` in the function but the trigger, seeing `coc_status='Approved'` and no failed latest validation, would compute `true`. The function's value is written in the same UPDATE that fires the trigger; because the trigger is BEFORE and overwrites `NEW.is_compliant` when `coc_status` changed, **the trigger's value can override the function's** for that row. ⚠️ UNVERIFIED which value persists in every ordering; flagged below.
- **`FileNotFound` and `Error` short-circuits do not write `coc_validations`** (steps 5, 8) — a subsection can retain a stale prior validation/`coc_status` after a failed re-run. No row means the trigger's "latest validation" logic uses the previous result.
- **Singleton settings, no per-tenant thresholds.** `coc_validation_settings` is one global row (`tables-02.md:11`); all tenants share earth/insulation/RCD/loop thresholds and fail counters. `testSettings` from the request body can override them at validation time (`:1007-1009`) — any authorized caller can pass arbitrary thresholds for a single run (not persisted).

---

## Error & status reference

| Condition | Where | Result |
|---|---|---|
| Missing `documentUrl` (extract) / any of 3 ids (validate) | extract `:923`; validate `:909` | HTTP 400 |
| No `Authorization` header | validate `:939`; extract `:942` | HTTP 401 |
| Invalid/expired JWT (`getUser`) | validate `:949`; extract `:952` | HTTP 401 |
| Document not in subsection | validate `:965` (400); extract `:970` (400) | HTTP 400 |
| Non-Admin without contractor site access | validate `:996`; extract `:1007` | HTTP 403 |
| AI gateway 429 / 402 | validate `:1334`/`:1340` | HTTP 429 / 402 passthrough |
| Other AI / parse error | validate `:1347`,`:1801-1812` | HTTP 500 `{status:'Error'}` |
| Document file missing in storage | validate `:1152-1162` | HTTP 200 `{status:'FileNotFound'}`, no validation row |
| `coc_validations` upsert DB error | validate `:1756-1759` | HTTP 500 |
| Safety-critical failure (≥1) | engine `:869-871` | status **Fail** |
| ≥2 mandatory failures | engine `:872-875` | status **Fail** |
| Incomplete cert / low AI confidence | engine `:878-890` | status **Incomplete** |
| None of the above | engine `:867` | status **Pass** |

---

## Open questions / UNVERIFIED

- ⚠️ `revalidateFailedOnly` has no in-`src` caller — used only edge-side; unclear how it is triggered at runtime.
- ⚠️ `coc_local_validations` has no observed read/write call site; its relationship (if any) to this AI pipeline is unverified.
- ⚠️ Exact persisted `is_compliant` value when the function's 4-way AND and the BEFORE trigger's `coc_status`-derived value disagree (ordering-dependent).
- ⚠️ The external `COCPreviewApproval` retry-field paths (`:335,409,449`) were not opened in this trace; cited via chapter `05:66`.
