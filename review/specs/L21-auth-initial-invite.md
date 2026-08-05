# L21 — auth-initial-invite

- Unit id: L21
- Slug: auth-initial-invite
- Spec mode: full
- Date: 2026-07-29
- Files: 2 (src/lib/auth/initialInvite.ts, src/lib/auth/initialInvite.test.ts)

## Unit header

**Unit purpose.** The unit is the entire contents of `src/lib/auth/` — a single pure module that generates the 16-character one-time initial password for newly invited users, plus its vitest suite. The module doc-comment (src/lib/auth/initialInvite.ts:1-13) states it is the "canonical, unit-tested home" for this generator: the admin UI generates the password client-side and passes it to the `invite-user` edge function, which sets it with `requires_password_change: true`.

**Module-level observations.**
- The unit has zero runtime imports: `initialInvite.ts` imports nothing and relies only on `globalThis.crypto` (src/lib/auth/initialInvite.ts:30); the test file imports vitest and the module under test (src/lib/auth/initialInvite.test.ts:1-2).
- The "shared with invite-user fn" relationship is data-flow, not code sharing: `supabase/functions/invite-user/index.ts` does not import this module. Its comment at line 22 says "UI generates it with src/lib/auth/initialInvite.ts:generateInitialPassword()", and it receives the value as the `temporaryPassword` request field, setting `requires_password_change: temporaryPassword ? true : false` in user metadata (supabase/functions/invite-user/index.ts:257).
- Combined alphabet is 69 characters: 24 lowercase + 24 uppercase + 8 digits + 13 symbols (src/lib/auth/initialInvite.ts:21-24; the test comment at initialInvite.test.ts:38 calls it "~70-char").

**External contract.** The rest of the app gets `generateInitialPassword(): string` (a 16-char password containing at least one character of each of four classes, drawn from an ambiguity-reduced alphabet via Web Crypto) and the `INITIAL_PASSWORD_POLICY` constant describing that alphabet. Sole production consumer is `src/views/Users.tsx` (unit V02), which calls it as an email-delivery fallback when the admin has not typed a temporary password.

## src/lib/auth/initialInvite.ts

- Purpose: Generates the cryptographically-random one-time initial password emailed to a newly-invited user, using Web Crypto so it runs identically in browser, Node 20+, and Deno (src/lib/auth/initialInvite.ts:1-13).
- Public surface:
  - `INITIAL_PASSWORD_POLICY: { length: 16; lower: string; upper: string; digits: string; symbols: string }` — `as const` object literal (src/lib/auth/initialInvite.ts:15-25). `lower = "abcdefghijkmnpqrstuvwxyz"` (24 chars), `upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"` (24 chars), `digits = "23456789"` (8 chars), `symbols = "!@#$%^&*-_=+?"` (13 chars).
  - `generateInitialPassword(): string` — returns a 16-character string (src/lib/auth/initialInvite.ts:65-74).
  - Module-private helpers (not exported): `randomIndex(max: number): number` (rejection-sampled unbiased index, src/lib/auth/initialInvite.ts:28-44), `pick(chars: string): string` (:46-48), `shuffle(chars: string[]): string[]` (in-place Fisher–Yates, :51-57).
- Inputs & outputs: No parameters, no reads of tables/buckets/localStorage/env vars. Input is entropy from `globalThis.crypto.getRandomValues` into a 1-byte `Uint8Array` per draw (src/lib/auth/initialInvite.ts:37-42). Output is the returned string. Algorithm: seed one character from each of the four classes, fill the remaining 12 from the concatenated 69-char alphabet, Fisher–Yates-shuffle the 16, join (src/lib/auth/initialInvite.ts:66-73).
- Dependencies: uses -> none (zero import statements; only `globalThis.crypto`). used by <- src/views/Users.tsx:5 (import) and src/views/Users.tsx:667 (call), unit V02 admin-ops-and-template-views — grep-verified; no other hits for `initialInvite`, `generateInitialPassword`, or `INITIAL_PASSWORD_POLICY` in `src` or `supabase` outside this unit. In Users.tsx it is called only when `sendCredentialsByEmail` is true and the admin left `temporaryPassword` empty (src/views/Users.tsx:664-668), and the result is sent to the invite mutation as `temporaryPassword` (src/views/Users.tsx:670-678), which reaches `supabase/functions/invite-user/index.ts` (unit F01) as request data.
- Side effects: None beyond consuming Web Crypto entropy — no network, storage, events, or subscriptions. `shuffle` mutates its argument array in place (src/lib/auth/initialInvite.ts:51-57), but the only caller passes a freshly-spread literal (:73).
- Error handling: `randomIndex` throws `Error("randomIndex: max must be positive")` when `max <= 0` (src/lib/auth/initialInvite.ts:29) and throws `Error("Web Crypto unavailable: cannot generate a secure password")` when `globalThis.crypto?.getRandomValues` is absent (:31-33). Both propagate uncaught out of `generateInitialPassword`; the module itself has no try/catch. Rejection loop (:39-42) re-draws bytes >= `limit` — no cap on iterations.
- Tests: `src/lib/auth/initialInvite.test.ts` (same unit; details in its section below). Picked up by the root vitest config `include: ['src/**/*.test.{ts,tsx}']` with `environment: 'node'` (vitest.config.ts:22, :18).
- Observed issues:
  - The header comment states the invite-user edge function sets the password (src/lib/auth/initialInvite.ts:5-6); in code the edge function never imports this module — the password is generated in the browser (src/views/Users.tsx:667) and travels to the function as request payload, where `invite-user/index.ts:227-229` re-validates it only as "at least 6 characters", weaker than everything this generator guarantees.
  - The doc-comment on `generateInitialPassword` says the output satisfies "the app's password policy (see setPasswordSchema)" (src/lib/auth/initialInvite.ts:61-62); `setPasswordSchema` (src/lib/validation-schemas.ts:116-124, unit L18) enforces only min-8/max-72 length and confirm-match — it has no character-class rules, so the four-class guarantee exceeds what that schema checks.
  - The ambiguity comment names "0/O, 1/l/I" as the excluded characters (src/lib/auth/initialInvite.ts:17-18), but the lowercase alphabet also omits `o` (src/lib/auth/initialInvite.ts:21) — five letters/digits are excluded in total (`0 1 O I l` plus lowercase `o`), one more than the comment lists.
  - The header comment cites `src/views/auth/Login.tsx + src/views/Auth.tsx` (src/lib/auth/initialInvite.ts:8) as the enforcement points of the forced first-login password change; both files exist (units V05 and V04 respectively) — the enforcement itself lives outside this unit and was not verified here.
- ASSUMED:
  - That `requires_password_change: true` metadata actually forces the /auth/reset-password flow at first login — asserted by comments here and in invite-user, but the Login/Auth view logic (V05/V04) was not read for this spec.
  - That the rejection-sampling loop terminates in practice (probabilistic; no iteration bound in code).

## src/lib/auth/initialInvite.test.ts

- Purpose: Vitest suite asserting the length, character-class coverage, alphabet restriction, and uniqueness of `generateInitialPassword` output.
- Public surface: None (no exports). One `describe("generateInitialPassword", ...)` block containing four `it` cases (src/lib/auth/initialInvite.test.ts:6-41).
- Inputs & outputs: No external data, stores, or env vars; consumes `INITIAL_PASSWORD_POLICY` fields destructured at module scope (src/lib/auth/initialInvite.test.ts:4) and repeated calls to `generateInitialPassword`. Output is vitest pass/fail.
- Dependencies: uses -> `vitest` (`describe`, `it`, `expect`; src/lib/auth/initialInvite.test.ts:1) and `./initialInvite` (same unit L21; :2). used by <- none found (grep-verified; executed only by the vitest runner via `include: ['src/**/*.test.{ts,tsx}']`, vitest.config.ts:22).
- Side effects: None; pure in-memory assertions (a `Set<string>` of up to 1000 passwords at :36-37 is the largest allocation).
- Error handling: None of its own — assertion failures surface as vitest test failures. Custom failure messages embed the generated password or offending character (e.g. `` `lowercase in ${pw}` `` at :15, `` `unexpected char '${ch}'` `` at :26).
- Tests: This file is the test artifact; it covers `src/lib/auth/initialInvite.ts`. What it asserts:
  1. "produces a password of the policy length" — one call returns a string of length `INITIAL_PASSWORD_POLICY.length` (16) (src/lib/auth/initialInvite.test.ts:7-9).
  2. "always includes at least one of each character class" — 500 iterations; each password contains >=1 char from each of lower/upper/digits/symbols (:11-20).
  3. "only uses characters from the approved (unambiguous) alphabet" — 200 iterations; every character of every password is in the combined allowed set; then asserts each of `"0" "O" "1" "l" "I"` is absent from the *allowed set itself*, not from generated output (:22-33).
  4. "does not repeat the same password across calls (high entropy)" — 1000 calls produce 1000 distinct strings (:35-40).
- Observed issues:
  - The ambiguity assertion at :30-32 checks the allowed-alphabet `Set`, not generated passwords (absence from output follows only in combination with the loop at :24-28); lowercase `o`, also absent from the alphabet, is not in the asserted ambiguous list.
  - No test exercises the two error paths of `randomIndex` (Web Crypto missing; non-positive max) — both are unreachable through the exported API with the shipped policy constants.
- ASSUMED:
  - That the suite currently passes — the tests were read, not executed, for this spec (read-only engagement).
