# System Reference — Master Index & Verification Ledger

**Charter:** Every function, process, and flow in the app documented from code — nothing assumed.
Every entry carries `file:line` (or migration filename) citations. Claims that could not be
verified against code are marked ⚠️ UNVERIFIED. Status per chapter: ✅ Verified · 🟡 Partial · ⬜ Unread.

**Started:** 2026-06-11 · **Method:** multi-agent workflow review, phased
**Surface area (counted 2026-06-11):** ~100k LOC TS/TSX · 58 routes · 166 components · 52 views ·
22 hooks · 47 lib files · 26 edge functions · 140 migrations · 23 pre-existing docs

## Ledger

| # | Chapter | Scope | Status |
|---|---------|-------|--------|
| 01 | Architecture & environments | Stack, Vercel/Supabase topology, env vars, deploy process | ⬜ Unread |
| 02 | Data model | Effective schema from 140 migrations: tables, columns, RLS policies, RPCs/functions, triggers, enums, storage buckets | ✅ Verified (Phase 1b) — all 140 migrations scanned (`_work/migration-events-01..10.json`); 15 docs in `02-data-model/` (6 tables, 6 rls-policies, 2 rpcs, triggers-enums-storage). Cross-checked vs types.ts → surfaced G-SEC-11, G-OPS-01/02. ⚠️ completeness critic returned null — re-run to formally close coverage |
| 03 | Auth & access | Auth flows, 5 access contexts, roles, token systems, user lifecycle | ✅ Verified — all 4 docs; the 3 previously-unvalidated docs re-validated against code in Phase 1b |
| 04 | Routes | All 58 pages: renders, reads/writes, RLS dependency | ⬜ Unread |
| 05 | Edge functions | All 26: auth model, inputs, side effects, callers | ⬜ Unread |
| 06 | End-to-end flows | Inspection lifecycle, COC validation, PDF generation (×5 generators), offline sync, QR, invites/email, templates | ⬜ Unread |
| 07 | Components, hooks & lib | 166 components, 22 hooks, 47 lib files — per-function docs | ⬜ Unread |
| 08 | Existing-docs audit | 23 docs graded accurate/stale/superseded | ⬜ Unread |

## Gap & problem register

Problems found by the review live in **[GAPS.md](GAPS.md)** — each with severity, resolution plan,
owner, and evidence-required closure. This index tracks *coverage*; GAPS.md tracks *what's wrong*.

## Open questions

(accumulated per phase; promoted to GAPS.md entries once confirmed real — the Phase 1 batch below
is now G-SEC-01…07 there)

From Phase 1 / auth-flows (2026-06-11):
1. Is GoTrue `enable_signup=false` actually set in the hosted project? Not verifiable from repo (`supabase/config.toml` has no `[auth]` block); already an open action in `docs/security/2026-06-10-phase1-full-app-review.md:85`.
2. Is project-level Turnstile captcha enforcement on, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` set in prod? Client silently degrades to no-captcha when unset (`src/components/CaptchaTurnstile.tsx:20-21`).
3. **`send-password-reset` edge fn has zero app callers** and is absent from `supabase/config.toml` — if still deployed and anon-invocable, it's an unauthenticated email-sender (only in-isolate 5/min/IP rate limit).
4. Audit event types `user_created`, `account_deleted`, `lockout`, `mfa_*`, `account_email_changed` are defined but have no emitters — invite-user/delete-user write no `auth_events` rows. Intentional?
5. Recovery email copy claims 1-hour link expiry (`supabase/functions/send-password-reset/index.ts:144,177`) but actual OTP expiry is server config, not in repo.
6. Email sender mismatch: invite-user sends from `onboarding@resend.dev` (`invite-user/index.ts:452`) vs `noreply@watsonmattheus.com` for password reset.
7. **invite-user derives `redirectTo` from request origin/referer** (`invite-user/index.ts:76-77`), not `APP_URL` — invites generated from a preview deployment would link to the preview host.

## Phase 1 run state (2026-06-11)

Workflow run `wf_8c1a2090-7f1` hit the Claude monthly spend limit mid-run (17/24 agents failed).
Resume after limit raised/reset: re-invoke the saved script with `resumeFromRunId: wf_8c1a2090-7f1` —
completed agents return cached; failed scan batches, ALL data-model synthesis, 3 auth re-validations,
and the critic re-run. Script path is recorded in session memory (`system-reference-review`).

## Conventions

- Citations: `src/path/file.tsx:123` or `supabase/migrations/<file>.sql`
- Prod-applied SQL outside migrations dir (e.g. `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`) is part of effective state and cited explicitly.
- `_work/` holds intermediate machine-generated extracts (migration event logs) — not human docs.
