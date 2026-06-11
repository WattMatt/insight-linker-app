# Existing-Docs Audit — Part 3 of 3 (last third)

**Charter:** grade each pre-existing doc against code ground truth on `main` (HEAD `8911d04`).
Nothing assumed; every grade cites a file/migration or an earlier system-reference chapter.
Part 3 covers items **16–23** of the 23 non-`system-reference` `.md` docs (alphabetical by path).

**Method.** `find docs -maxdepth 2 -name '*.md' -not -path '*/system-reference/*' | sort` → 23 docs →
thirds of 8/8/7 → this file = items **16–23** (the 5 `docs/security/*` phase docs + the incident, the
integrity scorecard, and the access-model comparison).

**Grades** (same scale as audit-1 / audit-2): **ACCURATE · PARTLY-STALE · SUPERSEDED · ASPIRATIONAL**.
Note: most of this third is **dated point-in-time security records** (audits, pre-mortems, "fixed-in-this-batch"
sweep reports). For those, the grade reflects whether the doc is still a faithful record of *the state it
claims to describe* — a finding that has since been **fixed in code** makes the doc's "still open / not yet"
status lines stale, even when the original finding was correct. That is the dominant drift in this batch.

**Ground-truth anchors verified this pass:**
- `src/pages/` is **absent** (Vite→Next migration); presentational bodies live in `src/views/`. So every doc
  citing `src/pages/X.tsx` is path-stale: `Auth.tsx`/`Users.tsx`/`SiteDetail.tsx`/`Clients.tsx`/`Inspections.tsx`
  all now under `src/views/` (`ls src/views/`).
- `supabase/config.toml`: `extract-coc` and `validate-coc` are **`verify_jwt = true`**; `templates`,
  `save-template`, `template-sync`, `generate-*`, `extract`... mix — counted directly.
- Phase-1 hardening **landed in code**: `extract-coc/index.ts:945-1010` (401 on missing JWT, `getUser`,
  Admin/contractor-site role check, 403 otherwise); `templates/index.ts:345-360` (503 fail-closed when
  `DOCBUILDER_PUBLIC_TOKEN` unset, SHA-256 constant-time compare, **no `from('clients')` query left**);
  `verify_jwt=true` set for `extract-coc`.
- Phase-1 RPCs **are now wired** (the doc said "zero call sites"): `get_public_portfolio`
  (`PublicClientPortfolio.tsx:108`), `get_public_subsection` (`PublicSubsection.tsx:83`),
  `get_public_subsection_review` (`PublicSubsectionReview.tsx:169`); migrations
  `20260610113000_public_rpcs_phase1.sql` + `20260610130000_public_drilldown_rpcs.sql`.
- **Tier-2 anon-read lockdown shipped**: `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`
  exists (git log `721c9a0`). `send-password-reset/index.ts:69` now uses `APP_URL` env (not the hardcoded
  Lovable domain).
- Phase-2 fix commit `e349302 fix(phase2): surgical workflow bug batch` touched **15 of the files** the
  Phase-2 doc flagged; Phase-3 fix commit `100f290 fix(phase3): deep-sweep workflow bugs — 12 fixes` landed
  the P3 batch. Spot-confirmed fixed: `ComplianceDashboard.tsx:48-53` (B1 nested-map iteration),
  `SiteSummaryReport.tsx:48-49` (`TERMINAL_SNAG_STATUSES=['rectified','closed']`, D2),
  `VerificationDialog.tsx:115` (`'in-progress'`, P3-6), `MyProfile.tsx:164` (`profile?.auth_email`, P3-11).

---

## Scoreboard (this third)

| # | Doc | Grade |
|---|-----|-------|
| 16 | `incidents/2026-04-22-orphaned-inspections.md` | **PARTLY-STALE** (paths only; the post-mortem is sound) |
| 17 | `integrity-audit/2026-05-26-scorecard.md` | **ACCURATE** (dated snapshot; numbers not re-run) |
| 18 | `security/2026-06-09-access-model-and-esite-comparison.md` | **PARTLY-STALE** (several gaps since closed; `src/pages/*` paths stale) |
| 19 | `security/2026-06-09-auth-access-security-audit.md` | **PARTLY-STALE** (findings sound; remediation status superseded; `Auth.tsx`/`Users.tsx` paths stale) |
| 20 | `security/2026-06-09-remediation-pre-mortem.md` | **ACCURATE** (prospective; its own "Done this turn" items verified) |
| 21 | `security/2026-06-10-phase1-full-app-review.md` | **PARTLY-STALE** (all "DONE" items verified; the GATED item #5 has since shipped) |
| 22 | `security/2026-06-10-phase2-workflow-bugs.md` | **PARTLY-STALE → mostly SUPERSEDED** (B/C/D fixed by `e349302`; A-cluster still open) |
| 23 | `security/2026-06-11-phase3-deep-sweep.md` | **ACCURATE** (fixed-this-batch record matches code; only P3-5 deferred, as stated) |

---

## Per-doc detail

### 16 · `incidents/2026-04-22-orphaned-inspections.md` — **PARTLY-STALE**
A genuine, well-evidenced post-mortem (575 orphaned inspections via NULL `subsection_id`; no data lost; relink
+ snapshot remediation). The forensic reasoning, the rollback SQL, and the "fast diagnostic" query are all
self-contained and still valid against the schema. **The only drift is file paths:** it cites
`src/pages/SiteDetail.tsx:576-593` and `src/pages/Inspections.tsx` — `src/pages/` is gone post-migration; these
are now `src/views/SiteDetail.tsx` / `src/views/Inspections.tsx`. `src/hooks/useOfflineInspections.ts` still
resolves. The orphan problem itself is **corroborated and quantified** by doc 17 (233 still-orphan at
2026-05-26) and by the system-reference fallback at `useSubsectionDetail.ts:366-399`
(`02-data-model` / `DATA_INTEGRITY_AUDIT_PLAN.md`). Grade: accurate in substance, path-stale on two refs.

### 17 · `integrity-audit/2026-05-26-scorecard.md` — **ACCURATE** (dated snapshot)
Stage-1 diagnostic run against prod `oltzgidkjxwsukvkomof`. It is explicitly a point-in-time SQL scorecard;
the Q1–Q9 counts (233 orphans, 103 missing photo objects, 3 subsections on the name-match fallback of 1,359)
were not re-run here, so they are **as-of 2026-05-26**, not live. What *is* verifiable holds: the runtime
fallback it cites is at `useSubsectionDetail.ts:366-399` exactly (audit-1 §7 verified the same line range,
listed here as `:376-399`/`:366-399` — same block). Its plan-deviation notes are correct and useful: it caught
that `coc_validations.subsection_document_id` (referenced in `DATA_INTEGRITY_AUDIT_PLAN.md`) **does not exist** —
the real FK is `coc_validations.document_id → subsection_documents.id` — and recommends the plan doc be updated
(audit-1 graded that plan PARTLY-STALE; this scorecard is the evidence behind Stage-1=done). The "external SSD
not mounted / Stage 3 blocked" status is naturally time-bound. Honest, internally-consistent, no wrong claims.

### 18 · `security/2026-06-09-access-model-and-esite-comparison.md` — **PARTLY-STALE**
A two-part doc: (Part 1) gaps in this app's reset/resend/access; (Part 2) an esite (`ESITE.V1`) comparison.
Part 2 is a cross-repo narrative not checkable here and is unaffected by this app's changes. **Part 1 has
drifted in two ways:**
- **Paths:** every code ref is `src/pages/*` (`Auth.tsx:626/309`, `Users.tsx:966/859/458`) — all now under
  `src/views/` (`Auth.tsx`, `Users.tsx` confirmed present there; `src/pages/` absent).
- **Several "broken/missing" findings are since closed.** "Hardcoded `wm-compliance.lovable.app` domain in
  `send-password-reset`" is **fixed** — `send-password-reset/index.ts:69` uses
  `Deno.env.get('APP_URL') ?? 'https://insight-linker-app.vercel.app'` (matches GAPS G-SEC-07 closure). The
  inconsistent-sender finding (`onboarding@resend.dev`) is **fixed** (GAPS G-SEC-06 → `noreply@watsonmattheus.com`).
  No dedicated `/reset-password` page / overloaded `/auth` is structurally still true (the auth split created
  `src/app/auth/{login,forgot-password,reset-password,...}` per audit-1 §3 — so this critique is now itself
  partly stale: dedicated auth routes **do** exist post-migration).
The "Deactivate is cosmetic" finding is **not independently re-verified** here (the status enum exists at
`Users.tsx:88,1171`; whether login is actually blocked is a server/RLS question). Grade: the diagnosis was
right at the time; the path refs are stale and at least two named defects have shipped fixes.

### 19 · `security/2026-06-09-auth-access-security-audit.md` — **PARTLY-STALE**
The flagship anon-exposure audit (3 CRITICAL / 6 HIGH / 7 MEDIUM / 5 LOW). The **findings themselves are sound
and migration-cited** — C1 (open storage), C2 (anon SELECT on core tables), C3 (anon read of
`client_access_links` tokens), H1–H6, etc. — and were carried forward into the system-reference register
(GAPS.md G-SEC-11…14, SECURITY-FINDINGS-phase2/3). What is **stale is the status framing**: the doc's
"DO NOT SHIP / CURRENTLY EXPOSED" header and its Remediation Roadmap describe an unmitigated state, but since
then: tier-2 anon-read lockdown is **APPLIED** (`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`),
the phase-1 write lockdown shipped (`20260610120000_phase1_write_lockdown.sql`), 7 unauthenticated prod edge
functions were deleted (GAPS G-SEC-08/09), and the H2/H3 functions named here were hardened (extract-coc,
templates — verified above). **Caveats the doc itself flagged remain valid**: it says state is reconstructed
from migration files and "the definitive source of truth is the live database" — and several items (storage
C1, the 85 bare-`authenticated` policies M6) are **still open** per GAPS G-SEC-13/14. Path drift: `Auth.tsx`,
`Users.tsx`, `APIClients.tsx` all cited as `src/pages/*` → now `src/views/*`. The doc's stack line still says
"Vite/React/TS frontend" — true at write-time, now Next.js App Router (audit-1 ground truth). Grade: correct
audit, superseded remediation status, stale paths/stack — read it for the *findings*, not the *roadmap state*.

### 20 · `security/2026-06-09-remediation-pre-mortem.md` — **ACCURATE**
A prospective pre-mortem of the lockdown plan. By nature it can't go "stale" on facts — it forecasts failure
modes. Its concrete, checkable claims hold: the "Done this turn" items (migration rewritten to scan all tables
+ demote anon→authenticated + add storage write/delete + transaction-wrap) match the tier-2 approach that did
ship; the "only 12-table hardcoded list misses `coc_extractions`/`site_assets`/`schematic_blocks`/
`site_schematics` (465 rows)" probe finding is consistent with GAPS' all-table approach. Its TOP-5 risk #1
("Tier 3 abandoned; storage stays open") is **prescient and still live** — storage lockdown (C1 / G-SEC-14)
is indeed the item that remained open longest (still 🟠 in GAPS). The action list's "Open"/"Pending" statuses
are point-in-time (some have since closed: leaked-password rotation H5, edge-fn deletions), but as a planning
artifact those are expected. No incorrect claims; strongest doc-as-written in this batch.

### 21 · `security/2026-06-10-phase1-full-app-review.md` — **PARTLY-STALE**
Phase-1 confirmed 7 new vulns (Vulns 1–7) + 2 bugs, then logged a fix plan. **Every "DONE" item is verified in
code:** Vulns 1-3 hardening (`validate-coc`/`extract-coc` 401/403 + ownership; `templates` 503 fail-closed +
constant-time + clients-query removed — all confirmed above); Vuln 4-5 lockdown migration
(`20260610120000_phase1_write_lockdown.sql` present); Bug 1 (residual COC render removal) and Bug 2
(invite refresh_token) marked done. **The stale part is the GATED item #5 and Status-note #1**, which both say
the phase-1 RPCs have "zero call sites" and tier-2 "cannot be applied without breaking public pages." That has
since shipped: `get_public_portfolio`/`get_public_subsection`/`get_public_subsection_review` are **wired into
all the public views** (`PublicClientPortfolio.tsx:108`, `PublicSubsection.tsx:83`,
`PublicSubsectionReview.tsx:169`), the drill-down RPC migration exists (`20260610130000_…`), and the tier-2
lockdown is APPLIED. So the doc's "GATED / awaiting decision" status for the public-portal repoint is
**superseded by completion**. Vulns 6-7 (client-token scope) were the gated items — confirm against the
shipped RPCs whether they're fully closed (the review's own sequencing). Grade: accurate findings + verified
DONE items, with a stale "still gated" tail.

### 22 · `security/2026-06-10-phase2-workflow-bugs.md` — **PARTLY-STALE → mostly SUPERSEDED**
A 22-bug functional sweep (A1–A11 offline, B1–B8 lifecycle, C1–C7 admin, D1–D3 portals). Its own status header
credited only A1/A6/A10 as fixed at write-time. **Since then commit `e349302` fixed most of the B/C/D bugs** —
it touched `ComplianceDashboard.tsx` (B1: now iterates the nested `jsonData[sectionKey][itemKey]` map at
`:48-53`, exactly the fix prescribed), `SiteSummaryReport.tsx`+`GenerateFinalReportButton.tsx`+`SubsectionList.tsx`
(D2: now `TERMINAL_SNAG_STATUSES=['rectified','closed']` at `:48-49`), `AccessLinkGenerator.tsx` (C3),
`QRCodes.tsx`+`QRAnalytics.tsx` (C4), `Calendar.tsx` (C6), `ClientPortalSubsectionDetail.tsx` (D1),
`Clients.tsx` (C1), `Users.tsx` (C2), `SiteAssignments.tsx` (C5), `siteSummaryRenderSpec.ts` (D3),
`InspectionDetail.tsx` (B2/B3/B7/B8) and `useSubsectionDetail.ts` (B4/B5/B6). So the doc's per-item "open" /
fix-order list is **largely stale — the static B/C/D wins shipped.** **What remains genuinely open is the
A-cluster** (A2/A3/A4/A5/A7/A8/A9/A11 — the live `useOfflineSync` queue engine), which the doc deliberately
deferred to "device/running-app verification" and `offlineDB.ts`/`offlineInspectionDB.ts` still show the legacy
two-module split (A1's version-skew guard is in, but the queue rewrite is not). Read as a *bug inventory* it's
accurate; read as a *current open-list* it overstates what's still broken outside the offline layer.

### 23 · `security/2026-06-11-phase3-deep-sweep.md` — **ACCURATE**
A 13-item deep sweep (P3-1…P3-13) explicitly framed "**Fixed in this batch unless marked DEFERRED**." Commit
`100f290 fix(phase3): deep-sweep workflow bugs — 12 fixes` landed the batch, and spot-checks confirm the
fixed-state matches: `VerificationDialog.tsx:115` now writes `'in-progress'` for the issue path (P3-6 fixed);
`MyProfile.tsx:164` uses `profile?.auth_email || profile?.email` (P3-11 fixed). The **one DEFERRED item (P3-5,
inspection-template edit/save dead UI)** is correctly flagged as a pending product decision, not a code fix.
The "Checked clean" section is a useful negative record. Because the doc's claim is "these are now fixed" and
the code agrees, it is accurate as written (a faithful record of a completed batch) — the only forward risk is
that P3-5 still awaits the product call it names.

---

## Cross-cutting observations (this third)

1. **The dominant drift is "status, not findings."** Every security doc in this batch correctly identified real
   problems; what's stale is each doc's *snapshot of what's fixed*. Three later commits did the work:
   `e349302` (phase-2 B/C/D bugs), `100f290` (phase-3 batch), and the security lockdown chain
   (`20260610120000` write-lockdown + `20260610113000`/`20260610130000` public RPCs + the APPLIED tier-2 SQL).
   To read these docs correctly: trust the *findings*, cross-check *open/closed status* against
   **GAPS.md** (the live register) — which is exactly the split GAPS.md was built for.

2. **Phase-1's own forward-looking caveats came true.** Its "RPCs are correct but inert (zero call sites)" was
   accurate when written and is now resolved; its required sequence (repoint views → add drill-down RPCs →
   apply tier-2) is precisely what shipped. The doc is a good example of an *accurate plan whose status tail
   went stale because the plan succeeded.*

3. **`src/pages/*` is the same staleness fault line as batches 1–2.** The two pre-migration security/incident
   docs (16, 18, 19) cite `src/pages/Auth.tsx|Users.tsx|SiteDetail.tsx|Clients.tsx`; the three post-migration
   phase docs (21, 22, 23) correctly cite `src/views/*` and `src/app/*`. Migration date is the divider.

4. **Two items are still genuinely open and worth surfacing** (both tracked in GAPS, not yet closed in code):
   - **Storage anon read/write/delete (audit C1 / pre-mortem TOP-#1 / GAPS G-SEC-14)** — the longest-lived hole;
     tier-2 deliberately skipped storage.
   - **The offline `useOfflineSync` queue cluster (phase-2 A2–A11)** — data-loss paths in the legacy
     localStorage queue; deferred to device verification, not yet rewritten.

5. **No doc in this third is wholly wrong.** The harshest grade is Phase-2's "mostly SUPERSEDED," and even that
   is superseded *by fixes the doc itself prescribed*, not by being incorrect. The integrity scorecard (17),
   the pre-mortem (20), and the phase-3 sweep (23) are faithful records as written.
