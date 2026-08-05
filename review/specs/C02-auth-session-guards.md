# C02 — auth-session-guards

- Unit id: C02
- Slug: auth-session-guards
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 5 (per review/unit-files.json key "C02")

## Unit header

**Unit purpose (as-is).** `src/components/auth/` holds the shared plumbing extracted from the four route-protector components: a Supabase session-state hook (`useAuthSession`), a react-query onboarding lookup (`useOnboardingStatus`), a wrapper that overlays the onboarding wizard (`OnboardingGate`), and a two-variant loading visual (`AuthLoading`), plus one vitest file covering the session hook's failure path. All four source files carry comments attributing the extraction to "EC-7" and naming the guards they were extracted from (AuthLoading.tsx:5-8, OnboardingGate.tsx:12-14, useAuthSession.ts:12-13, useOnboardingStatus.ts:6-9).

**Module-level observations (cross-file facts inside the unit).**
- All four source files begin with `"use client"` (AuthLoading.tsx:1, OnboardingGate.tsx:1, useAuthSession.ts:1, useOnboardingStatus.ts:1). There is no barrel `index.ts`; every consumer imports each module by its full path (grep-verified, see per-file "used by" lines).
- Untracked `" 2"`-suffixed duplicates of all four source files sit in the same directory (`git status --porcelain -- src/components/auth/` shows `?? "AuthLoading 2.tsx"`, `?? "OnboardingGate 2.tsx"`, `?? "useAuthSession 2.ts"`, `?? "useOnboardingStatus 2.ts"`). `diff` shows `AuthLoading 2.tsx`, `OnboardingGate 2.tsx`, and `useOnboardingStatus 2.ts` are byte-identical to their tracked counterparts, while `useAuthSession 2.ts` is an older variant lacking the `.catch` fail-closed branch (its `getSession()` chain is `void supabase.auth.getSession().then(...)` with no catch). The test file has no duplicate (`ls src/components/auth/`).
- Cross-file null semantics: `useOnboardingStatus` resolves to `null` both when there is no auth user (useOnboardingStatus.ts:16) and when the `profiles` select yields no data (useOnboardingStatus.ts:17-22, only `data` destructured); `OnboardingGate` computes `show = !!onboardingStatus && ...` (OnboardingGate.tsx:17), so a `null` status renders children without the wizard.
- The react-query cache entry `["onboarding-status"]` written by this unit is removed externally on user change by H03 `src/hooks/useUserRole.tsx:30` (`queryClient.removeQueries({ queryKey: ["onboarding-status"] })` inside its `onAuthStateChange` listener, useUserRole.tsx:24-35).

**External contract.** The rest of the app gets: `useAuthSession(): { session, isLoading }`; `useOnboardingStatus(enabled)` returning a react-query result over `profiles.onboarding_completed`; `OnboardingGate` which overlays `OnboardingWizard` until completed/dismissed; and `AuthLoading` with `spinner`/`skeleton` variants. Grep-verified consumers are exactly the four C10 route guards (`ProtectedRoute`, `AuthOnlyRoute`, `ClientProtectedRoute`, `ContractorProtectedRoute`) — which compose session hook + loading visual, and (except `AuthOnlyRoute`) onboarding hook + gate — and V04 `src/views/PublicSubsection.tsx`, which uses only `useAuthSession` (PublicSubsection.tsx:11,62,104).

---

## src/components/auth/AuthLoading.tsx

- Purpose: Presentational full-screen loading state for route protectors, with a `spinner` and a `skeleton` visual variant.
- Public surface: `AuthLoading({ variant = "spinner" }: { variant?: "spinner" | "skeleton" }): JSX.Element` (AuthLoading.tsx:9). Named export only; no default export.
- Inputs & outputs: Input is the single optional `variant` prop. Output: for `"skeleton"`, a centered `min-h-screen` container with two `Skeleton` blocks (`h-12` and `h-64`, AuthLoading.tsx:10-18); otherwise a spinning border-div plus the literal text "Loading..." (AuthLoading.tsx:20-27). No tables, buckets, storage keys, or env vars touched.
- Dependencies: uses -> `Skeleton` from `@/components/ui/skeleton` (C01 ui-kit-shadcn, AuthLoading.tsx:3). used by <- C10 route-guards-auth: `src/components/ProtectedRoute.tsx:5` (rendered with `variant="spinner"` at line 14), `src/components/AuthOnlyRoute.tsx:3` (spinner, line 8), `src/components/ClientProtectedRoute.tsx:5` (skeleton, line 16), `src/components/ContractorProtectedRoute.tsx:5` (skeleton, line 17). Grep-verified; no other consumers.
- Side effects: None — pure render; the spinner animation is CSS (`animate-spin`, AuthLoading.tsx:23).
- Error handling: None — the component has no failure paths.
- Tests: None found — grep of `src/**/*.test.{ts,tsx}` for "AuthLoading" returned no hits.
- Observed issues: A byte-identical untracked duplicate `src/components/auth/AuthLoading 2.tsx` exists on disk (diff-verified). The header comment's variant-to-guard mapping (AuthLoading.tsx:5-8) matches actual usage in all four guards (verified at the consumer lines above).
- ASSUMED: "EC-7" (AuthLoading.tsx:8) is a refactor-task identifier; its definition was not located in this unit.

## src/components/auth/OnboardingGate.tsx

- Purpose: Renders its children unconditionally and overlays `OnboardingWizard` on top while the supplied onboarding status is present-but-incomplete and not locally dismissed.
- Public surface: `OnboardingGate({ onboardingStatus, onComplete, children }: Props): JSX.Element` (OnboardingGate.tsx:15), where `Props = { onboardingStatus: { onboarding_completed: boolean | null } | null | undefined; onComplete: () => void; children: ReactNode }` (OnboardingGate.tsx:6-10). Named export only.
- Inputs & outputs: Inputs are the three props plus local state `dismissed` (initial `false`, OnboardingGate.tsx:16). Output is a fragment containing `children` always (OnboardingGate.tsx:29) and, when `show = !!onboardingStatus && !onboardingStatus.onboarding_completed && !dismissed` (OnboardingGate.tsx:17), an `OnboardingWizard` mounted with constant `open={true}` (OnboardingGate.tsx:20-27). `onboarding_completed: null` is falsy, so a null flag shows the wizard; a `null`/`undefined` status object hides it. No tables, buckets, storage keys, or env vars touched directly.
- Dependencies: uses -> `useState`/`ReactNode` from react (OnboardingGate.tsx:3); `OnboardingWizard` from `@/components/OnboardingWizard` (C10 route-guards-auth, OnboardingGate.tsx:4 — wizard props are `{ open: boolean; onComplete: () => void }`, OnboardingWizard.tsx:14-17). used by <- C10: `src/components/ProtectedRoute.tsx:6` (rendered at line 23 with `onComplete={() => refetch()}`), `src/components/ClientProtectedRoute.tsx:6` (line 27), `src/components/ContractorProtectedRoute.tsx:6` (line 27). Grep-verified; no other consumers.
- Side effects: None in this file. The wizard's completion callback sets `dismissed` to `true` then invokes the parent's `onComplete` (OnboardingGate.tsx:23-26); any I/O belongs to `OnboardingWizard` (C10), outside this unit.
- Error handling: None — no failure paths in this file.
- Tests: None found — grep of test files for "OnboardingGate" returned no hits.
- Observed issues: Wizard visibility is controlled by conditional mounting, not by the `open` prop, which is hardcoded `true` (OnboardingGate.tsx:20-22); the wizard itself passes a no-op `onOpenChange` (OnboardingWizard.tsx:157). `dismissed` is component-local state, so it resets when the guard remounts. A byte-identical untracked duplicate `OnboardingGate 2.tsx` exists on disk (diff-verified).
- ASSUMED: none.

## src/components/auth/useAuthSession.ts

- Purpose: Shared hook exposing the current Supabase session and an initial-load flag, fed by both an auth-state-change subscription and a one-shot `getSession()` bootstrap.
- Public surface: `useAuthSession(): { session: Session | null; isLoading: boolean }` (useAuthSession.ts:14,38); `Session` is the `@supabase/supabase-js` type (useAuthSession.ts:4). Named export only.
- Inputs & outputs: No parameters. On mount (effect with empty dep array, useAuthSession.ts:18-36): registers `supabase.auth.onAuthStateChange` — every event sets `session` to the event's session and `isLoading` to false (useAuthSession.ts:19-22) — and calls `supabase.auth.getSession()`, whose resolution sets `session`/`isLoading` (useAuthSession.ts:23-27). Stores: none touched directly; session persistence lives in the shared client (L19), which is configured with `storage: window.localStorage`, `persistSession: true`, `autoRefreshToken: true` (src/integrations/supabase/client.ts:15-20).
- Dependencies: uses -> react `useEffect`/`useState` (useAuthSession.ts:3); `Session` type from `@supabase/supabase-js` (useAuthSession.ts:4); `supabase` from `@/integrations/supabase/client` (L19 supabase-data-access, useAuthSession.ts:5). used by <- C10: `src/components/ProtectedRoute.tsx:3,9`, `src/components/AuthOnlyRoute.tsx:2,6`, `src/components/ClientProtectedRoute.tsx:3,9`, `src/components/ContractorProtectedRoute.tsx:3,10`; V04 public-and-entry-views: `src/views/PublicSubsection.tsx:11,104` (also uses the hook's return type at line 62); plus its own test `src/components/auth/useAuthSession.test.tsx:18`. Grep-verified.
- Side effects: Creates an auth-state subscription and unsubscribes on unmount (useAuthSession.ts:19,35). `getSession()` reads (and, per the L19 client's `autoRefreshToken` config, may refresh) the persisted session through the shared client. Writes `console.error` on failure (useAuthSession.ts:31).
- Error handling: If `getSession()` rejects: `console.error("Failed to read auth session:", err)`, then `session` set to `null` and `isLoading` to false — the in-code comment labels this "Fail CLOSED" so the route guard redirects to login instead of the app staying on the loader (useAuthSession.ts:28-34). The `onAuthStateChange` callback has no error path; it sets state unconditionally (useAuthSession.ts:19-22).
- Tests: `src/components/auth/useAuthSession.test.tsx` — asserts the rejection path only (see that file's section).
- Observed issues: The listener callback (useAuthSession.ts:19-22) and the `getSession()` continuation (useAuthSession.ts:23-27) both write the same `session` state; the code contains no ordering guard between them. The untracked duplicate `useAuthSession 2.ts` on disk is an older variant without the `.catch` fail-closed branch (diff-verified: its chain is `void supabase.auth.getSession().then(...)`).
- ASSUMED: whether supabase-js delivers an initial `INITIAL_SESSION` event to the listener before/after `getSession()` resolves — library behavior, not verified here.

## src/components/auth/useAuthSession.test.tsx

- Purpose: Vitest jsdom test asserting that `useAuthSession` fails closed (session `null`, `isLoading` false) when `getSession()` rejects.
- Public surface: None — a single `describe`/`it` block (useAuthSession.test.tsx:20-26).
- Inputs & outputs: Mocks `@/integrations/supabase/client` with `vi.mock`: `onAuthStateChange` returns a stub subscription with a no-op `unsubscribe`, and `getSession` returns `Promise.reject(new Error("network down"))` (useAuthSession.test.tsx:9-16). Renders the hook with `renderHook`, `waitFor`s `isLoading === false`, then asserts `session` is `null` (useAuthSession.test.tsx:21-25). No real stores touched.
- Dependencies: uses -> `vitest` (`describe`, `it`, `expect`, `vi`, useAuthSession.test.tsx:4), `@testing-library/react` (`renderHook`, `waitFor`, line 5), `./useAuthSession` (this unit, line 18). used by <- the vitest runner only: matched by the `include: ['src/**/*.test.{ts,tsx}']` pattern in `vitest.config.ts:24` (P02); runs under jsdom via its own `@vitest-environment jsdom` docblock (useAuthSession.test.tsx:1-3) against the config's default `environment: 'node'` (vitest.config.ts:20). No source file imports it (grep-verified).
- Side effects: None outside the test run; the module mock is file-scoped.
- Error handling: n/a — the test itself constructs the failure (rejected `getSession`).
- Tests: This is the test. It covers only the rejection path of `useAuthSession`; the success path of `getSession()` and listener-driven session updates are not exercised anywhere (grep-verified — this is the only test importing the hook).
- Observed issues: The header comment cites "H19/H20" (useAuthSession.test.tsx:7) without in-repo definition in this unit. Unlike the four source files, no `" 2"` duplicate of this file exists on disk (`ls src/components/auth/`).
- ASSUMED: "H19/H20" are hardening-item identifiers from a review/plan document — inferred from phrasing, not located in this unit.

## src/components/auth/useOnboardingStatus.ts

- Purpose: React-query hook that looks up the current auth user's `onboarding_completed` flag from the `profiles` table.
- Public surface: `useOnboardingStatus(enabled: boolean)` returning the `useQuery` result whose `data` resolves to `{ onboarding_completed: boolean | null } | null` (useOnboardingStatus.ts:10-24; column type `boolean | null` per generated `profiles` Row, src/integrations/supabase/types.ts:1657). Named export only.
- Inputs & outputs: Input `enabled` gates query execution (useOnboardingStatus.ts:13). Query key: `["onboarding-status"]` with no user-id segment (useOnboardingStatus.ts:12). Data flow: `supabase.auth.getUser()` (useOnboardingStatus.ts:15); if no user, resolve `null` (line 16); else select `onboarding_completed` from `profiles` where `id = user.id`, `.single()`, and return `data` (lines 17-22). Stores: table `profiles` (read-only). No buckets, localStorage keys, or env vars.
- Dependencies: uses -> `useQuery` from `@tanstack/react-query` (useOnboardingStatus.ts:3); `supabase` from `@/integrations/supabase/client` (L19, line 4). used by <- C10: `src/components/ProtectedRoute.tsx:4,12`, `src/components/ClientProtectedRoute.tsx:4,14`, `src/components/ContractorProtectedRoute.tsx:4,15` — each calls it with `!!session` and consumes only `data` and `refetch` (refetch is wired to `OnboardingGate`'s `onComplete`). Grep-verified; no other consumers.
- Side effects: Network — `supabase.auth.getUser()` and the `profiles` select, both through the shared L19 client. No mutations. Its cache entry is externally removed on user change by H03 `src/hooks/useUserRole.tsx:30`.
- Error handling: No user → resolves `null` (useOnboardingStatus.ts:16). The `error` member of both responses is never destructured (lines 15,17); a failed or empty `.single()` yields `data: null`, so the query resolves `null`. If a call rejects outright, the queryFn rejects into react-query's error state — which no grep-verified consumer reads (consumers destructure only `data`/`refetch`). No local retry/staleTime options are set (lines 11-24); defaults come from the app QueryClient (A01, outside this unit).
- Tests: None found — grep of test files for "useOnboardingStatus" returned no hits.
- Observed issues: The query key carries no user id (useOnboardingStatus.ts:12); user-change cache eviction happens outside this unit (H03 useUserRole.tsx:26-34). Callers cannot distinguish "no auth user", "no profiles row", and "select error" — all three resolve `data` to `null`/nullish. A byte-identical untracked duplicate `useOnboardingStatus 2.ts` exists on disk (diff-verified).
- ASSUMED: supabase-js v2 `getUser()` returns `{ data: { user: null }, error }` rather than rejecting on auth failure — library behavior, not verified in this repo.
