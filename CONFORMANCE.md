# Onboarding Standard Conformance — insight-linker-app

Tracks conformance against `/Volumes/Extreme SSD/DEVELOPER/APPS/ONBOARDING-STANDARD/STANDARD.md` (WM Onboarding Standard v1, profile **S**).
State as of the Phase 2 standardization pass (2026-08-05). Update this file in the same PR as any auth change (STANDARD §4).

Legend: ✓ conformant · partial · — not implemented · n.a. not applicable

## A. Entry & authentication

| # | Level | Status | Evidence |
|---|---|---|---|
| A1 | MUST | ✓ | Root triage by session+role: `src/views/Index.tsx` pattern + `src/views/auth/useRoleRedirect.ts`; guards bounce Client/Contractor to their portals. |
| A2 | SHOULD | ✓ | `src/views/auth/AuthLayout.tsx` reads company name/logo from settings (safe pre-auth read). |
| A3 | MUST | ✓ | `/auth/signup` is an invite-only notice; OTP uses `shouldCreateUser: false` (`src/views/auth/Login.tsx:139`); provider-level `disable_signup` verified in the 2026-08-05 portfolio audit (dashboard setting — not repo-verifiable). |
| A4 | SHOULD | ✓ | Password + magic-link tabs in `src/views/auth/Login.tsx` (`signInWithOtp`, `shouldCreateUser: false`). |
| A5 | MUST | ✓ | zxcvbn (score ≥2) + HIBP via `src/lib/password-strength.ts`, wired in `SetPassword.tsx`, `ResetPassword.tsx`, `MyProfile.tsx` (all password-set surfaces; no self-signup surface exists). |
| A6 | MUST | ✓ | 1.0–1.3 s pad: `src/views/auth/ForgotPassword.tsx:66-67` and magic-link path `Login.tsx:132-133`. |
| A7 | MUST | ✓ | `src/lib/loginNext.ts` allow-list + dot-segment normalisation, unit-tested in `src/lib/loginNext.test.ts`. |
| A8 | SHOULD | ✓ | `src/components/CaptchaTurnstile.tsx`, env-gated, single-use token reset in `Login.tsx`. |
| A9 | MUST | partial | Per-role guards exist; Phase 2 added fail-closed `src/components/AdminOnlyRoute.tsx` on `/users`. Remaining gap: `ProtectedRoute` still admits no-role/lookup-error users into the admin *shell* (documented as "…today" cases in `ProtectedRoute.test.tsx`); non-`/users` admin pages rely on RLS. |
| A10 | SHOULD | partial | No Next.js middleware gate; guards are client components with RLS documented as the hard boundary (comments in the guards + `AdminOnlyRoute.tsx`). |
| A11 | MUST | ✓ | `src/components/ProtectedRoute.test.tsx` (13 tests: missing session, role mismatch, error paths, `?next` encoding, onboarding redirect, forced-password redirect) + `useAuthSession.test.tsx`, `useUserRole.test.tsx`. |
| A12 | SHOULD | partial | `src/components/SessionWatcher.tsx`: org-configurable daily auto-logout + warning + cache purge. No idle timer (kit `useSessionMonitor` not adopted). |
| A13 | MUST | ✓ | Capture-then-scrub-then-use token handling in `src/views/Auth.tsx` (MED #6); OTP-first recovery template `supabase/templates/recovery.html`. |
| A14 | MAY | — | No TOTP/MFA. Acceptable at MAY for profile S. |

## B. Invitations

| # | Level | Status | Evidence |
|---|---|---|---|
| B1 | MUST | ✓ | `src/views/Users.tsx` invite dialog: email, name, role selector, client/site scope, deliver-by-email toggle. |
| B2 | MUST | ✓ | `supabase/functions/invite-user/index.ts` (807-line reference fn): JWT-verified server-side admin check, input validation. |
| B3 | MUST | partial | Role + client/site scope written at invite time via the edge fn; partial-failure rollback (no orphan auth users) not re-verified this pass — adopt the WM_Office_Web rollback pattern. |
| B4 | MUST | partial | Temp passwords are CSPRNG with a server-set forced-change flag (`invite-user/index.ts:343,502`); however the legacy relay branch returns the plaintext password in the JSON response and the UI toasts it (`Users.tsx`) — kit README flags this branch as do-not-port; migrate to the gmi-ops dual-mode. |
| B5 | SHOULD | partial | Delivery-mode toggle exists; copy-link fallback when the mailer fails is not implemented. |
| B6 | MUST | ✓ | `resendInviteMutation` (`Users.tsx`) re-invokes `invite-user` with `isResend: true` and re-syncs role/client/site scope. |
| B7 | SHOULD | partial | Phase 2: `pending_user_invites.invited_at` is now stamped on send (`Users.tsx` sendInviteMutation), so Send vs Resend is truthful; status is still table-derived, not derived from live auth state (`email_confirmed`/`last_sign_in_at`). |
| B8 | SHOULD | — | `SetPassword.tsx` bounces expired links to login with a toast; no inline fresh-link self-heal (gmi-ops pattern). |
| B9 | MUST (C) | n.a. | Profile S — invites go through GoTrue links / temp passwords, not a bespoke token table. |

## C. Provisioning & database

| # | Level | Status | Evidence |
|---|---|---|---|
| C1 | MUST | partial | Schema is migration-versioned incl. the new Phase 2 policy; `docs/system-reference/03-auth-and-access/user-lifecycle.md` notes live-DB state includes out-of-band SQL-editor changes that remain unverifiable from the repo (Phase 1 DDL pull still owed). |
| C2 | MUST | ✓ | `handle_new_user` creates profile + default role, first-user-admin bootstrap; role/scope logic lives in the invite path (`20260214023114_….sql`). |
| C3 | MUST | ✓ | `user_roles` (UNIQUE user_id+role) + `app_role` enum; role never a profiles column (`20251014120311_….sql`). |
| C4 | MUST | ✓ | `has_role()` SECURITY DEFINER, `search_path` pinned, used by RLS incl. the new profiles admin policies (`20260805110000_phase2_profiles_admin_update.sql`); no self-referential policies. |
| C5 | MUST | partial | `requires_password_change` set server-side in `invite-user/index.ts:343,502`; the gmi-ops verified-write (read-back, fail loud) is not implemented. |
| C6 | MUST | partial | `profiles.status` Active/Inactive with admin toggle (now actually writable by admins — Phase 2 policy); request-time enforcement / session revocation on deactivation not verified (GoTrue ban pattern not adopted). |
| C7 | MUST | ✓ | `auth_events` table without FK to users (`20260525120000_auth_events_audit.sql`), `log-auth-event` edge fn, client logger with retry queue (`src/lib/auth-audit.ts`). |
| C8 | MUST | partial | `delete-user` edge fn exists; cascade/child-cleanup honesty not re-verified this pass. |
| C9 | MUST | ✓ | `onboarding_completed` flag (`20260214023114`) + backfill for existing users (`20260214023532`). |
| C10 | MUST | ✓ | No service-role keys or admin clients in client code (Phase 0 audit finding for IL: clean). |
| C11 | MUST | partial | Phase 1 lockdown migrations (`20260610120000_phase1_write_lockdown.sql` and successors) tightened business tables; legacy blanket `auth.role() = 'authenticated'` write policies remain on `clients`/`sites`/`inspections` (`20251014114352`, re-created `20251016064350`). |

## D. First-run experience

| # | Level | Status | Evidence |
|---|---|---|---|
| D1 | MUST | ✓ | `src/components/OnboardingWizard.tsx`: 4 steps (Welcome → Profile → Photo → Overview), progress bar, prefill, branding; Phase 2 added the missing bio input to step 1. |
| D2 | MUST | ✓ | Phase 2: dedicated `/onboarding` route (`src/app/onboarding/page.tsx`); all three guards redirect there while `onboarding_completed` is false (no overlay children mount beneath). Client-enforced; server (middleware) enforcement remains a future hardening (see A10). |
| D3 | SHOULD | ✓ | Wizard step 4 explains the user's role with a "Pending" fallback (`getRoleDescription`). |
| D4 | MUST | ✓ | Phase 2: `useOnboardingStatus` self-heals a missing profiles row (INSERT id+email, audit event, `onboarding_completed: false`); other errors surface as an error state the guards treat fail-safe (admit, don't trap). |
| D5 | MAY | — | No product tours / checklists. |
| D6 | MAY | ✓ | `/install` PWA helper route (`src/app/install/`). |

## E. Cross-cutting security

| # | Level | Status | Evidence |
|---|---|---|---|
| E1 | MUST (C) | n.a. | Profile S — bearer-token auth, no cookie-authenticated mutations. |
| E2 | SHOULD (S) | partial | Captcha slot + Supabase provider limits; per-IP limits on `log-auth-event` (20/min). No per-identity limiting. |
| E3 | MUST | partial | Role/onboarding caches purged on user change (`useUserRole.tsx:29-31`); `SessionWatcher` clears caches on auto-logout. Offline-queue flush under the outgoing user's token (GMI pattern) not verified. |
| E4 | MUST | ✓ | In-app password change requires the current password (`src/views/MyProfile.tsx:163` re-auth via `signInWithPassword` before `updateUser`). |
| E5 | SHOULD | partial | Phase 2 removed the 14 listed stale " 2" duplicates + the dead `send-password-reset` fn (zero callers) and fixed the stale `Auth.tsx` comment. 16 further " 2" files remain out of scope this pass: 12 under `src/views/`, 4 under `docs/`. |
| E6 | MUST | partial | Guard/unit suites green (87 files / 590 tests incl. `ProtectedRoute.test.tsx`); no invite→accept→login or reset→login smoke (gmi-ops `auth-smoke.mjs` not adopted). |

## Phase 2 change log (this pass)

- `supabase/migrations/20260805110000_phase2_profiles_admin_update.sql` — admin UPDATE policy on profiles (fixes admin edits silently writing 0 rows). **Must be applied to the live DB.**
- Redirect-style onboarding gate: new `/onboarding` route; `ProtectedRoute`, `ClientProtectedRoute`, `ContractorProtectedRoute` redirect instead of overlaying; `OnboardingGate` deprecated (unused).
- `useOnboardingStatus`: missing-row self-heal + fail-safe error state (D4).
- Forced-password-change enforced in all three route guards → `/auth/set-password` (was login-page-only).
- `AdminOnlyRoute` on `/users` (A9, fail closed).
- Orphan cleanup: dead `send-password-reset` fn deleted; 14 stale " 2" duplicates deleted; wizard bio field rendered; `pending_user_invites.invited_at` stamped on send.
