# Existing-docs audit — Batch 1 (first third)

**Scope:** first 8 of the 23 pre-existing docs (alphabetical sort of
`find docs -maxdepth 2 -name '*.md' -not -path '*/system-reference/*'`).
**Method:** spot-checked each doc's load-bearing claims against current code on
`main` (HEAD `4c33181`) and the system-reference chapters (esp.
`06-flows/coc-validation.md`, `00-INDEX.md`, `AUDIT_BASELINE.md` itself).
**Grades:** ACCURATE · PARTLY-STALE · SUPERSEDED · ASPIRATIONAL.

Ground-truth anchors used (verified this pass):
- App is **Next.js 15 App Router** — `src/app/` exists (route groups `(admin)`,
  `(client-portal)`, `(contractor)`), `src/pages/` is **absent**, presentational
  bodies live in `src/views/`. Confirmed by `ls` + `AUDIT_BASELINE.md:80-92`.
- `package.json`: `next ^15.3.0`, `react ^18.3.1`, `@capacitor/core ^7.4.3`,
  `@supabase/supabase-js ^2.75.0`. No `vitest`/`jest`/`@playwright/test` dep on main; **0 `*.test.*`/`*.spec.*` files** in `src/`+`supabase/`.
- **142 migrations**, **26 edge-function dirs** (counted).
- `extract-coc` and `validate-coc` both `verify_jwt = true` in `supabase/config.toml`.
- `validate-coc` default model = `google/gemini-3-pro-preview` (`prompt.ts:830`);
  `extract-coc` default = `google/gemini-2.5-flash` (`index.ts:833`).

---

## Grades

| # | Doc | Grade | Basis (what was checked) | Stale / wrong if any |
|---|-----|-------|--------------------------|----------------------|
| 1 | `docs/APPLICATION_SPEC.md` | **SUPERSEDED** | Tech-stack table, route table, file paths vs current tree | Describes a **Vite 5 + React SPA** with `src/pages/*` and `src/App.tsx` route table. App was migrated to **Next.js App Router** (`AUDIT_BASELINE.md:80`, commit `90ed91d`); `src/pages/` is gone, routing is file-based under `src/app/`. Also: "16 edge functions / 30+ tables / 9 buckets" (actual 26 fn dirs / 142 migrations), published URL `wm-compliance.lovable.app` (now Vercel `insight-linker-app.vercel.app`), QR base default `lovable.app`. Auth section predates the EC-0..9 auth split (no `/auth/login` etc.). Dated 2026-04-06. Useful as a feature inventory but framework-level wrong throughout. |
| 2 | `docs/AUDIT_BASELINE.md` | **ACCURATE** (point-in-time, mostly holds) | Stack line, Vite→Next migration, "no test infra", edge-fn/migration counts, deps | Stack/migration narrative all confirmed against tree. "Zero `*.test.*` files / no vitest" still true on `main`. Drift only in stale counts that have since grown: says **133 migrations / 25 edge functions** (now 142 / 26) and **278 `any` / 109 type errors / 16 npm vulns** are 2026-05-25 snapshots not re-counted here. "All three audit commits local to main, not pushed" was true at write-time; superseded by later pushes/PRs. Grade reflects that it's an honest dated baseline, not a live doc. |
| 3 | `docs/AUTH_MODERNISATION.md` | **PARTLY-STALE** | EC-series artifacts exist; deploy/push status | Code claims **verified**: `src/app/auth/{login,signup,forgot-password,reset-password,set-password}` all exist; `src/views/auth/` has `Login/Signup/ForgotPassword/ResetPassword/SetPassword/PasswordStrengthMeter`; `src/lib/password-strength.ts` present; migration `20260525120000_auth_events_audit.sql` present; `supabase/functions/log-auth-event` present; Signup.tsx is the invite-only notice (§4.1). **Stale:** §4 "none of this is in production yet… 17 commits ahead of `origin/main`, none pushed" — commits `4ab1862`/`ac98017` are now **on `origin/main`** (`git branch -r --contains`), so the work has shipped; the deployment-checklist "[ ]" items are likely done. Treat §3/§4 status as historical, not current. |
| 4 | `docs/COC_REVIEW_PROCESS.md` | **PARTLY-STALE** | Pipeline vs `06-flows/coc-validation.md`; JWT + model strings; file paths | Pipeline architecture, deterministic engine, Zs lookup table (`ZS_LOOKUP_TYPE_B` 6→7.67…63→0.73 verified in `validate-coc/index.ts:31`), `getMaxZs` Type-C ×0.5 / D ×0.25, `VALID_COC_STATUSES`/`FAILED_VALIDATION_STATUSES` (`complianceCalculations.ts:33,38`), trigger `trg_sync_coc_compliance` (migration `20260201151127…`) all **correct**. **Wrong:** Edge-fn table says `extract-coc` **JWT = No** — actual `verify_jwt = true`. Validation model listed as `gemini-2.5-flash` — actual default `gemini-3-pro-preview`. Cites `src/components/...` and `src/pages/...`-era paths and "React 18 + Vite" stack implicitly. Component refs (`COCPreviewApproval.tsx`, `COCReviewStatus.tsx`, `ComplianceDashboard.tsx`) still resolve under `src/components/`. |
| 5 | `docs/COC_VALIDATION_SPEC.md` | **PARTLY-STALE** (mostly accurate) | Models, thresholds, status logic, schema vs engine | Validation model `google/gemini-3-pro-preview` **matches** code (`prompt.ts:830`). Thresholds (earth 5.0Ω, insul 0.25MΩ, RCD 300/150/40, mandatory_failures=2, safety_critical=1) match `06-flows/coc-validation.md:93-99`. Status logic, hierarchy, TEXT_PASS rules all consistent. **Minor drift:** extraction model stated as `google/gemini-2.5-pro` — code default is `gemini-2.5-flash` (`…2.5-pro` only on `forceReextract`). "PDF Vision Analysis: Google Gemini 3 Pro Preview" in feature table is the validation model, fine. The strongest of the COC docs; flagged PARTLY-STALE only for the extraction-model line. |
| 6 | `docs/COC_TEST_FRAMEWORK.md` | **ASPIRATIONAL** | Test infra existence; check-ID coverage in engine | Describes a "comprehensive testing framework" with test IDs (HIER-, SAFE-, ADMIN-, TECH-, SPEC-) and "Automated Test Setup". **No test infrastructure exists** — 0 `*.test.*`/`*.spec.*` files, no vitest/jest/playwright dep on `main` (confirms `AUDIT_BASELINE.md:92`). Several referenced check IDs are **not implemented** in `validate-coc`: `GEN-001/INV-001/BAT-001/SPD-001/COND-001/OCP-001` grep-empty in the engine. Tests reference "Expired Temporary/Initial COC" + `CERT-EXPIRY-001` while the engine's source of truth states **"COCs DO NOT EXPIRE"** (`prompt.ts:109,375`) — a direct contradiction with ground truth. This is intended/planned coverage, not actual. |
| 7 | `docs/DATA_INTEGRITY_AUDIT_PLAN.md` | **PARTLY-STALE** (plan; Stage 1 done) | Orphan fallback code ref; FK claims; stage status | Stage-1 premise verified: the orphan-inspection fallback **exists** at `src/views/subsection-detail/useSubsectionDetail.ts:376-399` (`[...inspectionsData, ...orphanInspections]`, shop-name matching) exactly as described. Stage 1 marked done → `integrity-audit/2026-05-26-scorecard.md` (exists). **Forward-looking/unverified:** Stages 2-4 (`v_integrity_violations` view, admin Data-Integrity page, `pg_cron` snapshots, iOS sync fixes) are proposals, not built — none checked here. References `docs/DATABASE_MAP.md` (a 2026-05-22 snapshot, not in this batch) and an external-SSD iOS path. Plan is sound but most of it is intended state. |
| 8 | `docs/INSPECTION_SYSTEM.md` | **PARTLY-STALE** | Schema tables, routes, snag enum, photo bucket, file paths | Schema/relationships largely correct (inspections, signatures `UNIQUE(inspection_id, signer_type)`, snags dual-link, tenant JSON shape). Photo bucket `coc-photos` **matches** (`useOfflinePhotos.ts:8 PHOTOS_BUCKET='coc-photos'`). **Stale:** Key-Files tables cite `src/pages/Inspections.tsx`, `src/pages/InspectionDetail.tsx`, `src/pages/SubsectionDetail.tsx` — `src/pages/` is **absent**; these are now `src/views/*`. Routes wrong: doc says `/inspections/:inspectionId`, `/subsections/:id`, `/templates/builder/:templateId?` — actual App Router uses deep-nested subsection/inspection paths and `/inspection-templates/new` + `/[templateId]/edit` (`src/app/(admin)/inspection-templates/`). Snag lifecycle doc says **`Open → Rectified`**; code uses **`Open`/`Closed`/`In Progress`** (`InspectionDetail.tsx:316,384,1653`). |

---

## Cross-cutting observations

- **The single biggest staleness driver is the Vite→Next migration** (2026-05-25,
  `AUDIT_BASELINE.md:80`). Every pre-migration doc that cites `src/pages/*`,
  `src/App.tsx`, or "React 18 + Vite" is now path-wrong: APPLICATION_SPEC
  (fully), COC_REVIEW_PROCESS + INSPECTION_SYSTEM (partially). Component paths
  under `src/components/` mostly survived; page/route paths did not.
- **Two contradictions of ground truth** worth flagging to the orchestrator:
  1. `COC_REVIEW_PROCESS.md` says `extract-coc` is anon-callable (JWT=No) — it is
     **JWT-required** now (`verify_jwt=true`). Security-relevant.
  2. `COC_TEST_FRAMEWORK.md` tests expiry of COCs while the validation engine's
     own source of truth states COCs **never expire** (`validate-coc/prompt.ts:109`).
- **Model-string drift between the two COC docs:** REVIEW_PROCESS says the
  validation model is `gemini-2.5-flash`; VALIDATION_SPEC and the code agree on
  `gemini-3-pro-preview`. VALIDATION_SPEC is the more current of the pair.
- **Dated baselines vs live docs:** AUDIT_BASELINE and AUTH_MODERNISATION are
  honest point-in-time records; their "not pushed / not deployed" status lines
  are simply outdated (work has since shipped to `origin/main`), not erroneous.
- **No doc in this batch is fully wrong-and-misleading except APPLICATION_SPEC's
  framework claims**; the rest are accurate in substance with path/route/status
  drift on top.
