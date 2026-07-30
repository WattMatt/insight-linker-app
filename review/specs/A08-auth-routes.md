# A08 — auth-routes

- Unit id: A08
- Slug: auth-routes
- Spec mode: full
- Date: 2026-07-29
- Files: 6

## Unit header

**Unit purpose.** The six Next.js App Router pages under `src/app/auth/` that mount the authentication surface at `/auth`, `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`, and `/auth/set-password`. Every file is a client-component wrapper that renders exactly one view component and contains no logic, state, props, or data access of its own. All auth behaviour (forms, Supabase calls, redirects, layout chrome) lives in the wrapped views (V05 auth-views, plus V04's `src/views/Auth.tsx` for the legacy `/auth` dispatcher).

**Module-level observations (cross-file, verified).**
- All six files start with `"use client"` on line 1 and default-export a single nullary function component; none exports `metadata`, `dynamic`, `revalidate`, or any other route-segment config (full file contents read; files are 3–10 lines each).
- There is no `layout.tsx`, `loading.tsx`, `error.tsx`, or route group inside `src/app/auth/` — `find src/app/auth -type f` returns only the six `page.tsx` files. The routes therefore render directly under the root layout `src/app/layout.tsx` (A01). Page chrome is supplied inside the views: all five V05 views wrap themselves in `AuthLayout` (`src/views/auth/Login.tsx:12`, `Signup.tsx:5`, `ForgotPassword.tsx:12`, `ResetPassword.tsx:11`, `SetPassword.tsx:11`); the legacy `/auth` view does not (it imports `LoadingState`, `src/views/Auth.tsx:8`).
- Only `login/page.tsx` wraps its view in `<Suspense>` (no `fallback` prop, lines 6–8). Correspondingly, `src/views/auth/Login.tsx` is the only auth view that calls `useSearchParams` (`src/views/auth/Login.tsx:43`, imported from `@/lib/navigation` at line 10, which re-exports Next's `useSearchParams` — `src/lib/navigation.tsx:13,51` (L13)). The other views read query params via `window.location` instead (`src/views/Auth.tsx:39,42`).
- No file anywhere imports these pages: `grep -rn "app/auth" src supabase` (ts/tsx) → 0 hits. They are mounted purely by App Router filesystem convention.
- The manifest note for A08 says "thin wrappers over V05"; that holds for 5 of 6 files — `src/app/auth/page.tsx` wraps `src/views/Auth.tsx`, which the locked unit-files.json places in **V04** public-and-entry-views, not V05.

**External contract.** The rest of the app gets six URL routes. Grep-verified navigational referrers (route strings, not imports):
- `/auth` — `src/views/Index.tsx:15,42` (V04); `src/views/InspectionDetail.tsx:589,716,765,1297` (V01); email links built by edge functions: `supabase/functions/invite-user/index.ts:235` (`${origin}/auth?type=invite`) and `supabase/functions/send-password-reset/index.ts:102` (`${appUrl}/auth?type=recovery&token=…`) (both F01).
- `/auth/login` — C10 guards: `src/components/AuthOnlyRoute.tsx:9`, `ProtectedRoute.tsx:17`, `ClientProtectedRoute.tsx:19`, `ContractorProtectedRoute.tsx:20` (the latter three with `?next=`), `SessionWatcher.tsx:63`; C11 layouts: `src/components/AppSidebar.tsx:115`, `ClientPortalLayout.tsx:87`, `ContractorPortalLayout.tsx:79`; V04 `src/views/Auth.tsx:73,95`; V05 `ForgotPassword.tsx:212`, `Signup.tsx:30`, `SetPassword.tsx:46`; F01 `invite-user/index.ts:155` (loginUrl embedded in invite email).
- `/auth/forgot-password` — `src/views/Auth.tsx:115` (V04); `src/views/auth/Login.tsx:299`, `ResetPassword.tsx:44` (V05).
- `/auth/reset-password` — `src/views/Auth.tsx:62,70,119` (V04); `src/views/auth/Login.tsx:67,109,187`, `ForgotPassword.tsx:116` (V05).
- `/auth/set-password` — `src/views/Auth.tsx:99` (V04) only.
- `/auth/signup` — no navigational referrer found; the string `auth/signup` appears only in comments (`src/views/Auth.tsx:18`, `src/views/auth/Signup.tsx:10` — the latter states the route "is preserved so old links and bookmarks don't 404").

---

## src/app/auth/forgot-password/page.tsx
- Purpose: Mounts the forgot-password view at `/auth/forgot-password`.
- Public surface: `export default function ForgotPasswordPage(): JSX.Element` — no params (page.tsx:3); returns `<ForgotPassword />` (page.tsx:4). File is 5 lines, `"use client"` (page.tsx:1).
- Inputs & outputs: No inputs (no props, no searchParams/params usage in this file). Output: rendered `ForgotPassword` view. No stores, tables, buckets, localStorage, or env vars touched in this file.
- Dependencies: uses -> `ForgotPassword` from `@/views/auth/ForgotPassword` (page.tsx:2; V05 auth-views). used by <- no importers (grep-verified: `grep -rn "app/auth" src supabase` → 0 hits); mounted by Next.js App Router at `/auth/forgot-password`; navigated to from `src/views/Auth.tsx:115` (V04), `src/views/auth/Login.tsx:299` and `src/views/auth/ResetPassword.tsx:44` (V05).
- Side effects: None in this file (render only).
- Error handling: None present — no try/catch, no Suspense, no `error.tsx` in the segment.
- Tests: None found (grep-verified: no `*.test.*`/`*.spec.*` file references any `/auth` route string or imports from `app/auth`).
- Observed issues: None beyond the unit-level observations.
- ASSUMED: nothing file-specific.

## src/app/auth/login/page.tsx
- Purpose: Mounts the login view at `/auth/login`, inside a Suspense boundary.
- Public surface: `export default function LoginPage(): JSX.Element` — no params (page.tsx:4); returns `<Suspense><Login /></Suspense>` (page.tsx:5–9). File is 10 lines, `"use client"` (page.tsx:1).
- Inputs & outputs: No inputs in this file. The wrapped `Login` view reads search params (`src/views/auth/Login.tsx:43`, e.g. the `?next=` value appended by the C10 guards). Output: rendered `Login` view under Suspense. No stores or env vars touched in this file.
- Dependencies: uses -> `Suspense` from `react` (page.tsx:2); `Login` from `@/views/auth/Login` (page.tsx:3; V05 auth-views). used by <- no importers (grep-verified as above); mounted at `/auth/login`; navigated to from C10 (`AuthOnlyRoute.tsx:9`, `ProtectedRoute.tsx:17`, `ClientProtectedRoute.tsx:19`, `ContractorProtectedRoute.tsx:20`, `SessionWatcher.tsx:63`), C11 (`AppSidebar.tsx:115`, `ClientPortalLayout.tsx:87`, `ContractorPortalLayout.tsx:79`), V04 (`Auth.tsx:73,95`), V05 (`ForgotPassword.tsx:212`, `Signup.tsx:30`, `SetPassword.tsx:46`), and linked in invite emails by F01 (`invite-user/index.ts:155`).
- Side effects: None in this file (render only).
- Error handling: None — the `<Suspense>` has no `fallback` prop (page.tsx:6), so the suspend state renders nothing; no try/catch, no `error.tsx`.
- Tests: None found (grep-verified as above).
- Observed issues: The only page in the unit with a Suspense wrapper, matching the fact that `Login` is the only auth view calling the `useSearchParams` hook (`src/views/auth/Login.tsx:43` via `src/lib/navigation.tsx:51`); the boundary is bare (no fallback).
- ASSUMED: The Suspense boundary exists to satisfy Next.js's requirement that `useSearchParams` in a client component be under a Suspense boundary during prerender — inferred from framework behaviour; no comment in the file states this.

## src/app/auth/page.tsx
- Purpose: Mounts the legacy `/auth` backward-compatibility dispatcher view.
- Public surface: `export default function AuthPage(): JSX.Element` — no params; single-line body returning `<Auth />` (page.tsx:3). File is 3 lines, `"use client"` (page.tsx:1).
- Inputs & outputs: No inputs in this file. The wrapped `Auth` view reads `window.location.search`/`.hash` itself (`src/views/Auth.tsx:39,42`) to dispatch old-style `?type=invite` / `?type=recovery` email links (per its own header comment, `src/views/Auth.tsx:9–32`). No stores or env vars touched in this file.
- Dependencies: uses -> `Auth` from `@/views/Auth` (page.tsx:2; **V04** public-and-entry-views, not V05). used by <- no importers (grep-verified as above); mounted at `/auth`; navigated to from `src/views/Index.tsx:15,42` (V04) and `src/views/InspectionDetail.tsx:589,716,765,1297` (V01); targeted by email links built in F01 (`invite-user/index.ts:235` — `/auth?type=invite`; `send-password-reset/index.ts:102` — `/auth?type=recovery&token=…`); `src/views/Auth.tsx:85,105` also rewrites the URL back to `/auth` via `history.replaceState`.
- Side effects: None in this file (render only).
- Error handling: None present in this file.
- Tests: None found (grep-verified as above).
- Observed issues: This is the one file in the unit whose wrapped view belongs to V04 rather than V05 (unit-files.json places `src/views/Auth.tsx` in V04), so the A08 manifest note "thin wrappers over V05" does not cover it. No Suspense wrapper, consistent with the view using `window.location` rather than the `useSearchParams` hook.
- ASSUMED: nothing file-specific.

## src/app/auth/reset-password/page.tsx
- Purpose: Mounts the reset-password (post-recovery new-password) view at `/auth/reset-password`.
- Public surface: `export default function ResetPasswordPage(): JSX.Element` — no params (page.tsx:3); returns `<ResetPassword />` (page.tsx:4). File is 5 lines, `"use client"` (page.tsx:1).
- Inputs & outputs: No inputs in this file. Output: rendered `ResetPassword` view. No stores or env vars touched in this file.
- Dependencies: uses -> `ResetPassword` from `@/views/auth/ResetPassword` (page.tsx:2; V05 auth-views). used by <- no importers (grep-verified as above); mounted at `/auth/reset-password`; navigated to from `src/views/Auth.tsx:62,70,119` (V04) and `src/views/auth/Login.tsx:67,109,187`, `src/views/auth/ForgotPassword.tsx:116` (V05).
- Side effects: None in this file (render only).
- Error handling: None present in this file.
- Tests: None found (grep-verified as above).
- Observed issues: None beyond the unit-level observations.
- ASSUMED: nothing file-specific.

## src/app/auth/set-password/page.tsx
- Purpose: Mounts the initial-password (post-invite) view at `/auth/set-password`.
- Public surface: `export default function SetPasswordPage(): JSX.Element` — no params (page.tsx:3); returns `<SetPassword />` (page.tsx:4). File is 5 lines, `"use client"` (page.tsx:1).
- Inputs & outputs: No inputs in this file. Output: rendered `SetPassword` view. No stores or env vars touched in this file.
- Dependencies: uses -> `SetPassword` from `@/views/auth/SetPassword` (page.tsx:2; V05 auth-views). used by <- no importers (grep-verified as above); mounted at `/auth/set-password`; the only in-app navigation to it is `src/views/Auth.tsx:99` (V04), reached when the legacy `/auth?type=invite` link (built by F01 `invite-user/index.ts:235`) is dispatched.
- Side effects: None in this file (render only).
- Error handling: None present in this file.
- Tests: None found (grep-verified as above).
- Observed issues: Single navigational entry point (the V04 dispatcher); no direct link or guard targets this route.
- ASSUMED: nothing file-specific.

## src/app/auth/signup/page.tsx
- Purpose: Mounts the signup view (an invite-only notice) at `/auth/signup`.
- Public surface: `export default function SignupPage(): JSX.Element` — no params (page.tsx:3); returns `<Signup />` (page.tsx:4). File is 5 lines, `"use client"` (page.tsx:1).
- Inputs & outputs: No inputs in this file. Output: rendered `Signup` view. No stores or env vars touched in this file.
- Dependencies: uses -> `Signup` from `@/views/auth/Signup` (page.tsx:2; V05 auth-views). used by <- no importers (grep-verified as above); mounted at `/auth/signup`; **no navigational referrer found** (grep-verified over src and supabase for `"/auth`, `'/auth`, backtick `/auth`, and `auth/signup`): the string appears only in comments (`src/views/Auth.tsx:18`; `src/views/auth/Signup.tsx:10`, which states the route is kept so old links and bookmarks don't 404).
- Side effects: None in this file (render only).
- Error handling: None present in this file.
- Tests: None found (grep-verified as above).
- Observed issues: Route is reachable only by direct URL entry or external/old links — zero in-app navigations target it (grep-verified).
- ASSUMED: nothing file-specific.
