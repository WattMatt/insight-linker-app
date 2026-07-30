# L13 — app-platform-helpers

- Unit id: L13
- Slug: app-platform-helpers
- Spec mode: full
- Date: 2026-07-29
- Files: 7 (5 source + 2 tests)

## Unit header

**Unit purpose (as-is).** Five unrelated cross-cutting helpers that sit directly in `src/lib/`: a fire-and-forget auth-event audit sender with a localStorage retry queue (`auth-audit.ts`), a pure deliverable-to-deep-link URL builder (`buildActionHref.ts`), a scoped console logger with a pluggable error-reporter hook (`logger.ts`), a post-login `?next=` open-redirect sanitizer (`loginNext.ts`), and a React-Router-DOM-shaped compatibility layer over the Next.js App Router (`navigation.tsx`). The two `.test.ts` files pair with `buildActionHref.ts` and `loginNext.ts`.

**Module-level observations.**
- No file in this unit imports another file in this unit. `auth-audit.ts` imports the Supabase client (L19), `buildActionHref.ts` imports a type from `src/lib/siteDeliverables.ts` (L17), and `logger.ts`, `loginNext.ts`, `navigation.tsx` import nothing from `src/` at all (verified by reading all 7 files).
- Test coverage is split: `buildActionHref.ts` and `loginNext.ts` are test-paired inside the unit; `auth-audit.ts`, `logger.ts`, `navigation.tsx` have zero references from any `*.test.ts`/`*.test.tsx` in `src/` (grep-verified: `grep -rn "auth-audit\|lib/logger\|lib/navigation" src --include="*.test.*"` → no hits).
- Both test files are picked up by vitest via `include: ['src/**/*.test.{ts,tsx}']` (vitest.config.ts:23), default environment `node` (vitest.config.ts:18).
- Untracked Finder-style duplicates sit on disk beside two unit members: `src/lib/auth-audit 2.ts` and `src/lib/navigation 2.tsx`. Both are byte-identical to the tracked files (diff-verified) and appear in `git status` as untracked; same pattern exists for `supabase/functions/log-auth-event/index 2.ts`.
- Import breadth varies enormously inside the unit: `navigation.tsx` has 57 importing files across 13 manifest units (grep-verified, detail below); `logger.ts` has exactly one importer; `loginNext.ts` exactly one non-test importer.

**External contract.** The rest of the app gets: (1) `navigation.tsx` as the app-wide router facade — every view/component that "uses react-router" actually imports these shims; (2) `recordAuthEvent()` as the single client-side entry point into the `auth_events` audit trail (via edge function `log-auth-event`, F01); (3) `safeNext()` guarding the Login `?next=` round-trip (V05); (4) `buildActionHref()` powering the "go fix it" buttons on the compliance checklist/dashboard (C07, C14); (5) `logger`/`installErrorReporter` as an opt-in structured logging surface, currently consumed only by L19's `signedUrls.ts`.

---

## src/lib/auth-audit.ts

- Purpose: Client-side fire-and-forget sender of auth audit events to the `log-auth-event` Edge Function, with a localStorage-backed retry queue capped at 50 entries (header comment src/lib/auth-audit.ts:3-11).
- Public surface:
  - `type AuthEventType` — union of 11 string literals: `"login" | "logout" | "password_changed" | "password_reset_requested" | "magic_link_requested" | "lockout" | "mfa_enrolled" | "mfa_unenrolled" | "account_deleted" | "account_email_changed" | "user_created"` (16-27).
  - `interface AuthEventMetadata { method?: "password" | "magic_link" | "oauth" | "invite" | "recovery" | "self"; reason?: string; error_code?: string }` (29-33).
  - `recordAuthEvent(event_type: AuthEventType, metadata: AuthEventMetadata = {}): void` (87-105) — synchronous return, async work detached via `void (async () => ...)()`.
  - Internal (not exported): `readQueue`, `writeQueue`, `sendOne`, `drainQueue`, `interface QueuedEvent { event_type; metadata; queued_at: number }` (35-39).
- Inputs & outputs:
  - In: event type + metadata from callers.
  - Out: `supabase.functions.invoke("log-auth-event", { body: { event_type, metadata } })` (62-64). The edge function (F01) inserts a row into `public.auth_events` with service role after JWT validation and per-IP rate limiting (supabase/functions/log-auth-event/index.ts:146-152).
  - Stores: localStorage key `wm_auth_audit_retry_queue` (13), capped at last 50 entries via `queue.slice(-MAX_QUEUE)` on write (54).
  - Env: `process.env.NODE_ENV` gates the dev-only warn (98).
- Dependencies: uses -> `@/integrations/supabase/client` (L19, line 1). used by <- (grep-verified `recordAuthEvent` call sites): C11 layout-navigation (src/components/AppSidebar.tsx:109, src/components/ClientPortalLayout.tsx:81, src/components/ContractorPortalLayout.tsx:76 — all `"logout"`); C10 route-guards-auth (src/components/SessionWatcher.tsx:57 — `"logout"`, reason `session_expired`); V05 auth-views (src/views/auth/Login.tsx:106,149,184 — `login`/`magic_link_requested`; src/views/auth/ForgotPassword.tsx:83 — `password_reset_requested`; src/views/auth/ResetPassword.tsx:82 and src/views/auth/SetPassword.tsx:91 — `password_changed`); V02 admin-ops-and-template-views (src/views/MyProfile.tsx:194 — `password_changed`, method `self`).
- Side effects:
  - Network POST to the edge function on every `recordAuthEvent` call and on each queue drain (62-64).
  - localStorage read/write of the retry queue (44, 54).
  - Module-load side effect: `void drainQueue().catch(() => {})` runs at import time when `typeof window !== "undefined"` (83-85), replaying any queued events sequentially.
  - After a successful send, opportunistically drains the queue again (94-96).
- Error handling:
  - `sendOne` catches all invoke errors/exceptions and returns `false` (61-68) — never throws.
  - Failed sends are appended to the localStorage queue with `queued_at: Date.now()` (101-103); `console.warn` emitted only when `NODE_ENV === "development"` (98-100), silent in prod.
  - `readQueue` returns `[]` on missing window, missing key, or JSON parse failure (41-49); `writeQueue` swallows quota/privacy-mode exceptions with an empty catch (55-57).
  - `drainQueue` keeps still-failing items in the queue for the next attempt (74-79); its module-load invocation has a no-op `.catch` (84).
- Tests: none — no test file references `auth-audit` (grep-verified across `src/**/*.test.*`).
- Observed issues:
  - 6 of the 11 `AuthEventType` members have no client call site anywhere in `src/` (grep-verified against all `recordAuthEvent` call sites): `lockout`, `mfa_enrolled`, `mfa_unenrolled`, `account_deleted`, `account_email_changed`, `user_created`.
  - `queued_at` is recorded (102) but never read — queued events have no expiry; a permanently-failing event is retried on every module load and after every successful send.
  - The queue cap is enforced at write time by keeping the last 50 (`slice(-MAX_QUEUE)`, 54), i.e. oldest entries are silently dropped once the cap is hit.
  - Untracked byte-identical duplicate `src/lib/auth-audit 2.ts` exists on disk (diff-verified).
- ASSUMED:
  - That the client-side union staying in sync with the edge function's `ANON_EVENTS`/`AUTHED_EVENTS` sets is intentional; the two lists currently match (11 = 3 anon + 8 authed, supabase/functions/log-auth-event/index.ts:29-43) but nothing enforces this.
  - That `supabase.functions.invoke` attaches the current session JWT automatically (supabase-js behavior; not verified in this repo's code).

## src/lib/buildActionHref.ts

- Purpose: Pure function that turns a deliverables `OutstandingItem` into a deep-link URL whose query params (`tab`, `upload`, `generate`, `focus`, `create`, `snag`) tell the destination page which tab/dialog to open (header comment 1-6, referencing docs/superpowers/specs/2026-06-13-site-compliance-checklist-design.md).
- Public surface:
  - `interface ActionHrefContext { clientId: string; siteId: string }` (9-12).
  - `buildActionHref(item: OutstandingItem, ctx: ActionHrefContext): string` (14).
- Inputs & outputs:
  - In: `OutstandingItem` (from L17 `siteDeliverables.ts:34-48`: `{ id, category: DeliverableKey, label, actionLabel?, severity, blocking, subsectionId?, subsectionName? }`) plus client/site ids.
  - Out: a relative URL string rooted at `/clients/{clientId}/sites/{siteId}` (15), optionally extended with `/subsections/{subsectionId}` when `item.subsectionId` is set (16). Mapping (17-25): `schematic`→`?tab=schematic`; `asset_register`→`?tab=asset-verification`; `thermal`→ subsection `?tab=documents` else site `?tab=documents&upload=thermal`; `summary_report`→`?tab=reports&generate=1`; `coc`→ subsection `?tab=coc-metering` else `?tab=subsections`; `metering`→ subsection `?tab=coc-metering&focus=meter` else `?tab=subsections`; `inspections`→ subsection `?tab=inspections&create=1` else `?tab=subsections`; `snags`→ subsection `?tab=overview&snag={item.id}` else `?tab=subsections`.
  - No stores, no env vars.
- Dependencies: uses -> `type OutstandingItem` from `./siteDeliverables` (L17, line 7; type-only). used by <- C14 reports-dashboards (src/components/ComplianceDashboard.tsx:16, called at :140), C07 site-assets-inspections (src/components/site/SiteComplianceChecklist.tsx:12, called at :90), plus its own test (grep-verified).
- Side effects: none — pure string construction.
- Error handling: no failure paths; the `default` case carries a `const _exhaustive: never = item.category` compile-time exhaustiveness guard and returns `${base}?tab=overview` at runtime (26-30).
- Tests: `src/lib/buildActionHref.test.ts` (same unit) — asserts exact URL strings for all 8 categories (see that file's section).
- Observed issues:
  - The `default` branch is unreachable for any value of the current 8-member `DeliverableKey` union (siteDeliverables.ts:16-18), yet returns a distinct URL (`?tab=overview`) that no test asserts.
  - Both live callers pass ids only; `subsectionId` presence is the sole branch discriminator — `siteDeliverables.ts:44-45` comments describe `subsectionId` as "reserved for Phase 2 subsection deep-linking" while this function already branches on it.
- ASSUMED: that the destination pages actually read all six query params (`tab`, `upload`, `generate`, `focus`, `create`, `snag`) — the param contract is documented in the header comment but consuming pages (V01/V07) were not verified from this unit.

## src/lib/buildActionHref.test.ts

- Purpose: Vitest unit test for `buildActionHref` asserting the exact URL string for every deliverable category, with and without `subsectionId`.
- Public surface: none (test module). One `describe('buildActionHref')` with 3 `it` blocks (10-30); helper `item(over: Partial<OutstandingItem>): OutstandingItem` builds a base item `{ id:'i', category:'schematic', label:'x', severity:'none', blocking:false }` (6-8); fixed `ctx = { clientId: 'c1', siteId: 's1' }` (5).
- Inputs & outputs: in-memory fixtures only; no stores, no env.
- Dependencies: uses -> `vitest` (external), `./buildActionHref` (this unit), `type OutstandingItem` from `./siteDeliverables` (L17). used by <- none found (grep-verified); executed by vitest via `src/**/*.test.{ts,tsx}` include (vitest.config.ts:23).
- Side effects: none.
- Error handling: n/a (assertions only).
- Tests: is itself the test. What it asserts:
  - Site-level categories produce `/clients/c1/sites/s1?tab=...` exactly: `schematic`, `asset_register`, `thermal` (with `&upload=thermal`), `summary_report` (with `&generate=1`) (11-16).
  - Subsection-level categories with `subsectionId:'sub9'` route into `/clients/c1/sites/s1/subsections/sub9?...`: `coc`, `metering` (`&focus=meter`), `inspections` (`&create=1`), `snags` (`&snag=snag5` using the item id), and `thermal` (plain `?tab=documents`) (17-24).
  - `coc`/`metering`/`inspections`/`snags` without `subsectionId` all fall back to `/clients/c1/sites/s1?tab=subsections` (25-29).
- Observed issues: the `default` fallback branch of `buildActionHref` (`?tab=overview`) is not exercised (unreachable through the typed union without a cast).
- ASSUMED: none.

## src/lib/logger.ts

- Purpose: Minimal structured console logger with scope prefixes, production-suppressed `debug`, and an error-level forward to an installable reporter; header describes it as "the single replacement for the ~425 raw console.* calls scattered through src/" (1-12).
- Public surface:
  - `interface ErrorReporter { captureMessage(message: string, context?: Record<string, unknown>): void; captureException(error: unknown, context?: Record<string, unknown>): void }` (16-19).
  - `installErrorReporter(instance: ErrorReporter): void` (24-26) — sets a module-level singleton.
  - `interface Logger { debug/info/warn/error(...args: unknown[]): void; child(scope: string): Logger }` (50-56).
  - `logger: Logger` — root instance with `scope = null` (68).
- Inputs & outputs:
  - In: arbitrary log args; optional reporter instance.
  - Out: `console.debug/info/warn/error(...)` lines, prefixed `[scope]` when scoped (33-37); on `error` level, forwards to the installed reporter as `captureException` (first arg `instanceof Error`) or `captureMessage(String(first))`, with context `{ scope, extra }` (39-47).
  - Env: `process.env.NODE_ENV` — `debug` is dropped entirely when `"production"` (28, 31).
  - No storage, no network of its own.
- Dependencies: uses -> nothing (zero imports). used by <- L19 supabase-data-access (src/lib/data/signedUrls.ts:13 `import { logger }`, :15 `logger.child("signedUrls")`) — the only importer in `src/` (grep-verified for `lib/logger`). `installErrorReporter` has zero call sites outside its definition (grep-verified).
- Side effects: console output; reporter invocation; module-level mutable singleton `reporter` (21).
- Error handling: none — `emit` does not try/catch; a throwing reporter or console would propagate to the caller. `child` scopes chain as `parent:child` (64).
- Tests: none — no test file references `lib/logger` (grep-verified).
- Observed issues:
  - Header comment (2-3) states this replaces ~425 raw `console.*` calls, but grep counts 436 raw `console.(log|warn|error|info|debug)` call sites remaining in `src/` (excluding logger.ts itself) and exactly one module importing the logger.
  - `installErrorReporter` is never called anywhere in `src/` (grep-verified), so `reporter` is always `null` at runtime and the error-forwarding branch (39-47) is dead in the current app.
- ASSUMED: that `process.env.NODE_ENV` is statically inlined by the Next.js build in client bundles (standard Next behavior; not verified here).

## src/lib/loginNext.ts

- Purpose: Sanitizes the post-login `?next=` intended-destination value — only same-origin relative paths with an allow-listed prefix survive; everything else returns `null` (header comment 1-5).
- Public surface: `safeNext(raw: string | null | undefined): string | null` (8).
- Inputs & outputs:
  - In: raw `next` query-param string.
  - Out: the URL-normalized `pathname + search` (dot-segments collapsed, hash discarded) when it passes the allow-list, else `null` (19-23). Allow-list (`ALLOWED_PREFIXES`, 6): `/contractor`, `/clients`, `/client-portal`, `/dashboard`, `/sites`, `/qr-codes`, `/qr-activity`; a candidate passes if it equals a prefix or starts with `prefix + "/"` or `prefix + "?"` (20-22).
  - No stores, no env vars.
- Dependencies: uses -> nothing (zero imports). used by <- V05 auth-views only: src/views/auth/Login.tsx:14 (import), :69/:113/:191 (`safeNext(searchParams.get("next"))`), plus its own test (grep-verified for `loginNext` and `safeNext`).
- Side effects: none — pure.
- Error handling: returns `null` for: falsy input, non-`/` start, `//` or `/\` start (9); `new URL(raw, "http://internal.invalid")` constructor failure via try/catch (11-16); resolved origin differing from the dummy base ("defense-in-depth", 17); allow-list miss (23). Never throws.
- Tests: `src/lib/loginNext.test.ts` (same unit) — see next section.
- Observed issues:
  - Any hash fragment in the input is silently dropped from the returned value (`path = resolved.pathname + resolved.search`, 19) — e.g. `/dashboard#x` would come back as `/dashboard`.
  - The allow-list excludes `/settings` and other admin routes; an admin deep link through login to a non-listed path falls back to the role redirect (per header comment 2-3).
- ASSUMED: that WHATWG `URL` dot-segment resolution (relied on at 12-19) behaves identically across the browser, Node, and the Capacitor WebView — asserted by the tests only under Node.

## src/lib/loginNext.test.ts

- Purpose: Vitest unit test for `safeNext` covering allow, reject, and normalization behavior.
- Public surface: none (test module). One `describe("safeNext")` with 7 `it` blocks (4-35).
- Inputs & outputs: literal strings in, expected string/null out; no stores, no env.
- Dependencies: uses -> `vitest` (external), `./loginNext` (this unit). used by <- none found (grep-verified); executed via vitest include (vitest.config.ts:23).
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test. What it asserts:
  - Allows allow-listed relative paths with query strings preserved (5-9).
  - Rejects absolute URLs, protocol-relative `//`, and `javascript:` (10-14).
  - Rejects non-allow-listed `/settings`, `null`, `""` (15-19).
  - Rejects prefix look-alikes `/dashboardevil`, `/contractorx/foo` (20-23).
  - Rejects dot-segment traversal `/dashboard/../../settings`, `/contractor/../../../settings` (24-27).
  - Rejects backslash trick `/\evil.example` and the not-decoded string `%2F%2Fevil.example` (28-31).
  - Normalizes `/dashboard/./` to `/dashboard/` (32-34).
- Observed issues: the hash-stripping behavior (loginNext.ts:19) has no test; `%2F%2Fevil.example` is rejected because it does not start with `/` (loginNext.ts:9), i.e. the test exercises the leading-slash check, not percent-decoding.
- ASSUMED: none.

## src/lib/navigation.tsx

- Purpose: `"use client"` React-Router-DOM compatibility layer over the Next.js App Router — components import react-router-shaped APIs from here instead of `react-router-dom` (header 3-7).
- Public surface:
  - `useNavigate(): (to: string | number, options?: { replace?: boolean; state?: any }) => void` (21-39) — string: `router.replace`/`router.push`; number: `-1` → `router.back()`, any other number → `router.forward()`.
  - `useParams<T extends Record<string, string>>(): T` (42-45) — Next params or `{}`.
  - `useSearchParams(): [URLSearchParams, (params: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams)) => void]` (51-82) — tuple shim; setter serializes and always calls `router.replace(pathname?qs)` (76).
  - `useLocation(): { pathname: string; search: string; hash: string; state: null; key: "default" }` (86-100) — `hash` read from `window.location.hash` client-side, `""` otherwise (94).
  - `Link: React.ForwardRefExoticComponent<{ to: string; replace?: boolean } & AnchorHTMLAttributes>` (110-119) — renders `NextLink href={to}`.
  - `NavLink: React.ForwardRefExoticComponent<{ to; end?; replace?; className?: string | (({isActive, isPending}) => string); children?: ReactNode | (fn) }>` (131-161) — `isActive = end ? pathname === to : pathname.startsWith(to)` (134-136); `isPending` is always `false` (140, 145).
  - `Navigate({ to, replace = false }): null` (165-177) — `useEffect` performing `router.replace`/`router.push`, renders `null`.
- Inputs & outputs: route state in from `next/navigation` hooks; navigation commands out to the Next router. No stores, no env vars, no network.
- Dependencies: uses -> `react`, `next/navigation` (`useRouter`, `useParams`, `useSearchParams`, `usePathname`), `next/link` (all external; 9-16). used by <- 57 files across 13 units (grep-verified `@/lib/navigation`, duplicates excluded): C03 (SiteOverviewCard), C07 (SiteComplianceChecklist), C09 (SchematicDiagram, SubsectionList), C10 ×6 (AuthOnlyRoute, ClientProtectedRoute, ContractorProtectedRoute, DoubleSlashRedirect, ProtectedRoute, SessionWatcher), C11 ×5 (AppSidebar, Breadcrumb, ClientPortalLayout, ContractorPortalLayout, GlobalSearch), C14 ×2 (ComplianceDashboard, RecentAssignmentsWidget), V01 ×7, V02 ×4, V03 ×12, V04 ×9, V05 ×5, V07 ×3. Per-symbol import-line counts (grep `-cw` on import lines): `useNavigate` 39, `useSearchParams` 20, `useParams` 17, `Link` 9, `useLocation` 5, `Navigate` 4 (the three ProtectedRoute guards + AuthOnlyRoute, all C10), `NavLink` 3.
- Side effects: navigation calls on the Next router (`push`/`replace`/`back`/`forward`); `Navigate` triggers navigation from a `useEffect` on mount and on prop change (168-175). No subscriptions of its own.
- Error handling: none — no try/catch anywhere; null-safety via `??` fallbacks (`params ?? {}` 44, `nextSearchParams?.toString() ?? ""` 57/69, `pathname ?? "/"` 92, `(pathname ?? "").startsWith(to)` 136).
- Tests: none — no test file references `lib/navigation` (grep-verified).
- Observed issues:
  - `useNavigate` maps every numeric argument other than `-1` to `router.forward()` (27-30) — e.g. `navigate(-2)` goes forward, not two entries back.
  - `NavigateOptions.state` is declared (`state?: any`, 19) but never read; React Router location state is unsupported — `useLocation` hard-codes `state: null, key: "default"` (95-96).
  - `NavLink` non-`end` active check is plain `startsWith` with no segment boundary (136): pathname `/sites-archive` would count `/sites` as active.
  - `setSearchParams` always uses `router.replace`, never `push` (76) — no history entry for param changes, with no option to opt out.
  - `useSearchParams`'s functional-updater path builds `prev` from `nextSearchParams` at callback creation, memoized on `[router, pathname, nextSearchParams]` (60-79).
  - Untracked byte-identical duplicate `src/lib/navigation 2.tsx` exists on disk (diff-verified).
- ASSUMED: that `next/link` and `next/navigation` semantics (prefetching, soft navigation, `ReadonlyURLSearchParams`) match what the react-router-shaped callers expect — external-package behavior not verified here.
