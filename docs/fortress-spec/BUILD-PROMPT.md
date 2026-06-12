# BUILD PROMPT — Fortress Building Report Pack

> **Paste this as the opening instruction for the coding session that builds the Fortress pack.**
> It is self-contained: it names the spec, the guardrails, the order of work, and the commit protocol.
> Everything it references lives in this `docs/fortress-spec/` folder and in `supabase/`.

---

## Your task

Implement the **Fortress Building Report Pack** as an addition to Insight Linker (WM Compliance), following the
approved spec in this folder. Build it in **small, verifiable slices**, sprint by sprint, committing after each
working slice. Do **not** attempt the whole thing in one pass.

**Read first, in this order:**
1. `02-build-roadmap.md`/`02-build-roadmap.html` — the authoritative plan: tech stack, architecture, data model,
   11 features, **26 file-level tasks (S0-1 … S5-3)**, project structure.
2. `03-preflight-review.md` — the ADRs (locked decisions), schema fixes, pre-mortem mitigations, and the
   **security gate**. These are constraints, not suggestions.
3. `01-gap-analysis-and-dashboard.html` — what each KPI means and where its data comes from.
4. `04-abaqulusi-ingest-review.md` — the real data already loaded for review.

**Repo conventions:** obey the root `./CLAUDE.md` (and the user's global coding baseline). Match existing style.
Next.js 15 App Router · React 18 · TS · Supabase (Postgres + RLS + Edge Functions) · TanStack Query · Tailwind +
shadcn · pdfmake/PdfShift · Capacitor offline.

---

## Non-negotiable guardrails (from the preflight)

- **LOCKED decisions (do not reopen):** D5 commercial domains are **import-only** (no native entry UI v1) ·
  D7 **one pure KPI module per score**, screen + PDF both import it, **no inline KPI math** · D8 **Excel-import-first**.
- **D4 (condition modelling) and D6 (rename electrical template)** are decided inside their sprints (S2-3, S0-3) —
  resolve, record the choice in the session log, then proceed. Don't flip a decision once made.
- **Security gate:** the RLS-scope migration (`…220000`) MUST ship in the **same release** as the base tables.
  Never expose the Fortress tables with blanket `authenticated` read (closes cross-tenant leak G-SEC-13).
- **Schema fixes** SV-1 (`next_service_date`) and SV-2 (FK indexes) are already in `…210000` — apply it.
- **Importers** use a **versioned column-map per sheet + preview/validate/reject-on-mismatch**. Never hard-code
  column indices (the OPS sheets have an empty leading column; the Annual report has duplicate section codes —
  the existing parser handles these, reuse that logic).
- **Truth rule:** never claim a migration/build/test passed unless you ran it and saw the output. Show the command
  and the real result. If not run, say "not tested — here's how to verify."

---

## Order of work

### Sprint 0 — Foundation (do this first, it unblocks everything)
1. **S0-1** Read-only audit of live `sites / subsections / snags / document_categories` schemas; reconcile with
   `docs/system-reference/`. Record findings. **Gate every migration on this.**
2. **S0-2** Confirm the Site-Health redesign is merged (dependency). If not, stop and flag.
3. **S0-3** Resolve **D6**: rename `src/lib/fortressTemplate.ts` → `src/lib/wmElectricalScope.ts` ("WM Electrical
   Scope"); update all references. Commit: `refactor(fortress): rename electrical template to WM Electrical Scope`.
4. **S0-4** Apply the migrations **in order** to a staging branch and verify:
   ```
   supabase/migrations/20260612200000_fortress_building_layer.sql      # base: 12 tables + sites cols
   supabase/migrations/20260612210000_fortress_layer_hardening.sql     # SV-1/SV-2/SV-4/SV-5
   supabase/migrations/20260612220000_fortress_rls_scope.sql           # SEC-1: scoped RLS (REQUIRED)
   ```
   Then load `supabase/seeds/fortress_abaqulusi_seed.sql` (real Abaqulusi data, ON CONFLICT-safe). Regenerate TS
   types: `supabase gen types typescript`. Commit: `feat(fortress): add building-pack schema + Abaqulusi seed`.
5. **S0-5** Run the security review against the applied schema; confirm scoped reads work for Client/Contractor
   roles. (When `/security-review` can run in-repo, run it on the diff.)

### Sprints 1–5 — build per the roadmap (§6 of `02-build-roadmap`)
For **each** sprint, in order (S1 import framework + asset register → S2 OHS + condition → S3 utilities + tenants →
S4 ledgers + commercial import + report packs → S5 portfolio + offline + hardening):

- Implement the file-level tasks at the exact paths in §7 (project structure). Pure KPI logic in
  `src/lib/fortress/*.ts`; UI in `src/components/fortress/*`; routes under `src/app/.../fortress/`.
- **Feature-flag each domain** so a half-built domain never blocks the rest (pre-mortem #2).
- Write **unit tests for every pure KPI module** as you build it (`*.test.ts`) — these are the project's safety net.
- Before committing a slice: run the build, run the tests, and self-review the diff. Paste the real command output
  into the session log.
- **Commit per working slice** with conventional messages, e.g.
  `feat(fortress): asset register CRUD + ppm rollups (S1-4,S1-5)`. Keep commits scoped to one concern.

### Final gate (end of build)
- Screen↔PDF **parity test** green (S4-4): every dashboard KPI equals its value in the generated PDF.
- Run `codebase-audit-cleanup` and `engineering:deploy-checklist`; address findings.
- Confirm the three reports (OPS / CM / Annual) generate for Abaqulusi from captured data with no manual Excel step.

---

## Definition of done (per the success metric)

Abaqulusi Plaza's **OPS + CM + Annual reports generate from captured data with zero manual Excel assembly**, the
dashboard's KPIs match the generated PDFs (parity test passes), and all Fortress tables are read-scoped by building
membership. Tests pass; nothing is claimed that wasn't run.

---

## End-of-build report (required)

Close with the DID / ASSUME / RECOMMEND split: files changed, what was verified and how (commands + output),
what's still untested, and any follow-ups (e.g. native commercial entry = V2). Update the session log; treat it,
not the chat, as the source of truth.

---

### Reference paths
- Spec folder: `docs/fortress-spec/`
- Migrations: `supabase/migrations/2026061220000{0,210000,220000}_*.sql` (+ `.down.sql`)
- Seed: `supabase/seeds/fortress_abaqulusi_seed.sql`
- Review DB (SQLite, for inspecting the shape of the data): `docs/fortress-spec/abaqulusi_review.db`
- SQL reference copies (read-only; canonical live in `supabase/`): `docs/fortress-spec/sql/`
