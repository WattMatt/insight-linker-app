# Phase 3 Security Findings (flows) — 2026-06-11

46 security flags from the Phase-3 flow review (7 core flows). Full per-flag detail lives inline in
each `06-flows/*.md` doc; this is the synthesis. The critic reconciled the flows against chapters
02/04/05 with zero contradictions.

**Most flags RE-CONFIRM known root causes through the flow lens** (cross-validation, not new work):

| Confirmed via flows | Existing gap |
|---|---|
| Self-registered `User` can create/fill/complete/snag any tenant's inspections; cross-tenant reads/writes throughout | **G-SEC-01** + **G-SEC-13** |
| generate-pdf / generate-inspection-pdf anon service-role doc INSERTs; save-template/template-sync fail-open; send-email open relay; offline-review/verify-fix LLM spend; templates cross-tenant export | **G-SEC-12** |
| inspection_templates / settings / validation_feedback any-authenticated writes | **G-SEC-13** (emergency-triage SQL written, unapplied) |
| documents / inspection-photos / site-images public + anon read/write/delete storage | **G-SEC-14** |
| send-password-reset unauth reset-email sender | **G-SEC-03** |
| /public/subsections token-free read; qr-redirect enumeration oracle | known (SECURITY-FINDINGS-phase2 §D, ch 05) |
| Offline queue replay writes client-chosen site_id/context into blanket-RLS tables → cross-tenant IDOR | **G-SEC-13** (offline angle) |
| qr_scans never inserted; qr_codes orphaned | **G-OPS-02** |

---

## NEW findings (not previously in GAPS) — promoted to GAPS.md

### The big one — COC validation integrity (→ G-SEC-16, High)
For an electrical *safety* compliance product, the COC Pass/Fail determination can be wrong or manipulated:
- **Threshold override:** a caller (Admin, or a site-scoped Contractor) can pass arbitrary validation thresholds in the request body via `testSettings` (`validate-coc/index.ts:1007-1009`), bypassing the DB-configured `coc_validation_settings` for that run — **potentially forcing a Pass on a non-compliant COC**. The result is persisted to `coc_validations.status` and the subsection `is_compliant`.
- **Two disagreeing writers of `is_compliant`:** `validate-coc`'s 4-way AND (`:1659`) vs the `sync_coc_compliance_status` trigger's `coc_status`-derived value (migration `20260201151127:42-48`). A hierarchy-invalid "Approved" COC can be recomputed compliant by the trigger — the two can disagree silently.
- **Optimistic pre-write drift:** the client pre-writes user-approved `coc_number/coc_type/coc_issue_date` to subsections/subsection_documents *before* validation (`:354-365`); a later failed validation only rolls back client state, leaving approved-but-unvalidated COC metadata persisted server-side.

### Spoofable evidence provenance (→ G-SEC-17, Medium)
`captured_by` / `created_by` / `uploaded_by` on compliance photos and offline uploads are set from client input with an `'unknown'` fallback and no `auth.uid()` constraint (the scoped policies were dropped) — `useOfflinePhotos.ts:163`, `useOfflineFloorPlanAnnotations.ts:87`. Provenance of compliance evidence is forgeable.

### template-sync unsigned webhook egress (→ G-SEC-18, Medium)
Every inspection_template CRUD POSTs the full template payload to `DOCBUILDER_WEBHOOK_URL` with **no signature/auth** (`template-sync/index.ts:358-389`); whoever controls that env var receives all template data. `/webhook/register` is a no-op stub.

### Data-integrity / trust-the-client cluster (→ G-SEC-19, Low-Med)
- Completion invariant "Completed requires `quality_rating`" enforced only in TS (`InspectionDetail.tsx:1483`), no DB CHECK — a direct REST update bypasses it.
- PDF compliance figures computed in the browser and rendered by generate-pdf without recomputation (`GenerateFinalReportButton.tsx:60-391`) — a tampered client can emit any compliance rate.
- Online write failures (incl. genuine RLS/authz denials) are caught and re-queued as "offline", then silently dropped after 3 retries with a toast (`useOfflineSync.ts:447-457`) — masks authz errors as transient connectivity.
- `cleanup_old_pending_invites()` is GRANT EXECUTE TO authenticated with no in-fn auth and no confirmed pg_cron schedule (`20251017095131`) — harvest-sensitive invite emails may persist past 30 days.
- generate-pdf swallows `site_documents` INSERT failures (`:3054`), orphaning PDFs in the public bucket with no DB row.

---

## Doc / coverage items
- **DOC FIX (done this commit):** `rls-policies-04.md` said `qr_scans` "No such table exists" — contradicts `tables-04.md` and migration `20251014140001` (which creates it). Corrected.
- **Coverage gap (Phase-3 follow-up):** the `client_access_links` token-issuance + `VisitorRegistrationGate` lead-capture write path is a whole token-auth feature (routes in 04-routes) with no dedicated flow doc — only referenced in passing. Add an `access-links-and-visitor-capture` flow.
- Per-flow full detail: `06-flows/{inspection-lifecycle,coc-validation,pdf-report-pipeline,offline-sync,qr-access,invites-and-email,templates}.md`.
