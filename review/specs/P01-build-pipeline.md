# P01 — build-pipeline

- Unit id: P01
- Slug: build-pipeline
- Spec mode: full
- Date: 2026-07-29
- Files: 8 (next.config.mjs, vercel.json, server-polyfills.js, pdfjs-shadow-fix-loader.cjs, capacitor.config.ts, package.json, package-lock.json, bun.lock)

## Unit header

**Unit purpose (as-is).** The root build/deploy layer of the app: the Next.js 15 configuration (PWA service worker, redirects, image allowlist, webpack customisation), the Vercel deploy definition (build/install commands, region, daily cron), two small Node-side shims that make `pdfjs-dist` loadable during builds and `next dev`, the Capacitor native-shell config, and the package manifest plus two lockfiles.

**Module-level observations (cross-file facts).**
- The `DOMMatrix`/`Path2D` polyfill block exists twice with identical class bodies: `server-polyfills.js:2-20` and inline in `next.config.mjs:8-26`. `server-polyfills.js` is preloaded via `NODE_OPTIONS='--require ./server-polyfills.js'` in all three Next scripts (`package.json:6-8`) and again in the Vercel `buildCommand` (`vercel.json:4`).
- Dual lockfiles are tracked. `package-lock.json` (18,390 lines, lockfileVersion 3, root name `wm-compliance-inspector`, `package-lock.json:2-4`) matches `package.json` exactly at the root-requirement level (programmatic comparison of `dependencies`/`devDependencies` vs `packages[""]`: zero only-in-either entries, zero range mismatches). `bun.lock` (2,365 lines, lockfileVersion 1, `bun.lock:2`) records a different project: workspace name `vite_react_shadcn_ts` (`bun.lock:6`) with `vite ^5.4.19` (`bun.lock:96`), `react-router-dom ^6.30.1` (`bun.lock:68`), `lovable-tagger ^1.1.11` (`bun.lock:91`) and zero entries for `next` (`grep -c '"next":' bun.lock` → 0). Git history: `bun.lock` last touched 2026-03-06 (`4acffbf "Work in progress"`); the Vite→Next migration commit is `90ed91d` 2026-05-25; `package.json` and `package-lock.json` were both last touched together in `f633c31` 2026-06-15 (`git log -1` per file). The deploy install path is npm (`"installCommand": "npm install"`, `vercel.json:5`).
- Untracked `" 2"`-suffixed copies of three unit files sit at repo root, all dated May 28 (`ls -la`): `next.config 2.mjs` (4,291 B, `diff` → DIFFERENT from tracked), `vercel 2.json` (219 B, DIFFERENT), `server-polyfills 2.js` (778 B, byte-IDENTICAL).
- Three of the six permanent redirects in `next.config.mjs:129-131` target `/feedback-management`, and no such route exists: `find src/app -type d` (80 dirs) has no `feedback*` match, and `grep -rn "feedback-management" src` returns only hits in `next.config.mjs` itself (none in src). The other target, `/portal-management`, exists (`src/app/(admin)/portal-management`).
- No test file references any P01 file (`grep -rln "next.config|server-polyfills|capacitor.config|pdfjs-shadow" src --include='*.test.*'` → no output).

**External contract (what the rest of the app gets from this unit).**
- A Node process environment in which `globalThis.DOMMatrix`/`Path2D` exist before any app code runs (`server-polyfills.js` via `package.json:6-8`, `vercel.json:4`).
- A generated service worker with register/skipWaiting/clientsClaim, an `/offline` document fallback (served by `src/app/offline/page.tsx`, unit A01), and four runtime caches (Supabase REST NetworkFirst 24h, Supabase storage CacheFirst 7d, Google Fonts 1y, cdnjs 30d) (`next.config.mjs:28-100`). Generated output is on disk in `public/` (`sw.js` 18,197 B, `workbox-0db717d9.js`, `fallback-ce627215c0e4a9af.js`, dated Jul 28) and gitignored (`git check-ignore public/sw.js` → ignored).
- Six legacy-route permanent redirects (`next.config.mjs:127-136`), a next/image allowlist restricted to `oltzgidkjxwsukvkomof.supabase.co/storage/**` (`next.config.mjs:117-125`), and a dev-crash workaround for every `pdfjs-dist/build/*.mjs` module (`next.config.mjs:155-158` → `pdfjs-shadow-fix-loader.cjs`).
- A daily 02:00 cron invocation of `/api/snapshots/capture` (`vercel.json:7`), handled by `src/app/api/snapshots/capture/route.ts` (unit A02), which gates on `Bearer ${CRON_SECRET}` (`route.ts:37`).
- The dependency resolution for the whole app (73 deps + 16 devDeps, `package.json:13-105`; resolved tree in `package-lock.json`).
- A native-shell identity (`com.wattmatt.compliance`) that loads the remote Vercel deployment (`capacitor.config.ts:7-10`).

---

## next.config.mjs

- Purpose: Next.js configuration that wraps the app config in `@ducanh2912/next-pwa`, disables TS/ESLint build gates, defines redirects/image allowlist/webpack customisation, and inlines pdfjs polyfills.
- Public surface: default export `withPWA(nextConfig)` (next.config.mjs:163); inside `nextConfig`: `async redirects(): Promise<Redirect[]>` returning 6 entries (127-136); `webpack(config, { isServer }): config` (143-160); plain fields `reactStrictMode`, `outputFileTracingRoot`, `typescript.ignoreBuildErrors`, `eslint.ignoreDuringBuilds`, `serverExternalPackages`, `images.remotePatterns`, `onDemandEntries` (103-141).
- Inputs & outputs: reads `process.env.NODE_ENV` to disable PWA in dev (32) and `import.meta.url` for `__dirname` (5). Outputs: PWA plugin configured with `dest: "public"`, `register`, `skipWaiting`, document fallback `/offline`, 5 MB precache cap, `cleanupOutdatedCaches`, `clientsClaim`, 4 `runtimeCaching` rules (28-99); generated `public/sw.js`/`workbox-*.js`/`fallback-*.js` present on disk and gitignored (verified). Image host allowlist hardcodes `oltzgidkjxwsukvkomof.supabase.co` `/storage/**` (117-125). `outputFileTracingRoot: __dirname` with comment about a stray `~/package-lock.json` (106-108). No `output` key (no static-export mode configured anywhere in the file).
- Dependencies: uses -> `@ducanh2912/next-pwa` (npm, 1), `url`/`path` (Node, 2-3), `./pdfjs-shadow-fix-loader.cjs` via `join(__dirname, ...)` (157, P01); references route `/offline` (36) provided by `src/app/offline/page.tsx` (A01); redirect destinations `/portal-management` (A02 group `(admin)` routes — unit A03) and `/feedback-management` (no route found). used by <- Next.js CLI invoked by `package.json:6-8` and `vercel.json:4` (both P01); listed in `eslint.config.mjs:20` ignores (P02). No src imports (grep-verified: loader path referenced only here; config referenced only by docs/review files).
- Side effects: at module evaluation, mutates `globalThis.DOMMatrix` and `globalThis.Path2D` if undefined (8-26); `webpack()` pushes `'fabric', 'canvas'` to server externals, sets alias `canvas: false`, and pushes a module rule routing `/[\\/]pdfjs-dist[\\/]build[\\/][^\\/]*\.mjs$/` through the shadow-fix loader (143-159); build-time emission of service-worker assets into `public/`.
- Error handling: polyfills guarded by `typeof ... === 'undefined'` checks only (8, 21); no try/catch anywhere. `typescript: { ignoreBuildErrors: true }` and `eslint: { ignoreDuringBuilds: true }` (112-113) mean type errors and lint failures do not fail the build; in-file comment records the baseline: "109 strict-mode type errors and an eslint config issue remain post-Vite-migration" (110-111).
- Tests: none found (grep-verified across `src/**/*.test.*`).
- Observed issues:
  - Redirect destination `/feedback-management` (129-131, three sources: `/issue-reports`, `/suggestions`, `/verification-management`) has no matching route directory anywhere under `src/app` (find/grep verified).
  - The DOMMatrix/Path2D polyfill block (8-26) duplicates `server-polyfills.js:2-20` verbatim in class bodies.
  - Build gates disabled with recorded baselines (112-113).
  - Supabase project hostname hardcoded (121) while `.env.example:1` templates the URL as `https://YOUR_PROJECT.supabase.co`.
  - Untracked `next.config 2.mjs` (May 28) differs from the tracked file (`diff` → DIFFERENT).
- ASSUMED: that `@ducanh2912/next-pwa` is what produced the on-disk `public/sw.js` trio (consistent naming/config, but generation not re-run); that the inline polyfill exists because config evaluation happens before/outside the `--require` preload in some execution paths (inferred from the duplicate's presence, not documented in-file).

## vercel.json

- Purpose: Vercel deployment config pinning framework, build and install commands, deploy region, and one daily cron.
- Public surface: JSON document with keys `$schema`, `framework: "nextjs"`, `buildCommand`, `installCommand`, `regions: ["iad1"]`, `crons` (vercel.json:1-8).
- Inputs & outputs: `buildCommand: "NODE_OPTIONS='--require ./server-polyfills.js' next build"` (4); `installCommand: "npm install"` (5); one cron `{ "path": "/api/snapshots/capture", "schedule": "0 2 * * *" }` (7).
- Dependencies: uses -> `./server-polyfills.js` (4, P01); cron path served by `src/app/api/snapshots/capture/route.ts` (A02), which rejects requests whose `authorization` header is not `Bearer ${process.env.CRON_SECRET}` (route.ts:37). used by <- Vercel platform only; in-repo grep hits are docs (`docs/system-reference/01-architecture.md:116`, X02) and review artifacts — no code consumer.
- Side effects: deploy-time only (drives Vercel build, install, region placement, scheduled invocation).
- Error handling: n/a (declarative config).
- Tests: none found (grep-verified).
- Observed issues: `buildCommand` string duplicates the `build` script in `package.json:7` character-for-character; untracked `vercel 2.json` (May 28, 219 B) differs from the tracked file (`diff` → DIFFERENT); install uses `npm install` (not a frozen-lockfile command) while `package-lock.json` is tracked.
- ASSUMED: that Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron invocations (platform behaviour; only the route's check was verified).

## server-polyfills.js

- Purpose: Node preload script that stubs the browser globals `DOMMatrix` and `Path2D` so `pdfjs-dist` can be required in build/server workers.
- Public surface: none — side-effect-only CommonJS file; no exports (server-polyfills.js:1-20).
- Inputs & outputs: reads and mutates `globalThis` only. `DOMMatrix` stub: identity fields `a..f`, `is2D`, `isIdentity` (5-6); `inverse`/`multiply`/`scale`/`translate` each return `new DOMMatrix()` (8-11); `transformPoint()` returns `{x:0, y:0, z:0, w:1}` (12). `Path2D` stub: nine no-op methods (16-18).
- Dependencies: uses -> none. used by <- `package.json:6-8` (`dev`/`build`/`start` scripts, P01) and `vercel.json:4` (P01). Grep-verified; remaining hits are docs (`docs/system-reference/01-architecture.md:36-39`, X02) and worktree copies under `.claude/`.
- Side effects: defines two global classes when absent; nothing else.
- Error handling: `typeof ... === 'undefined'` guards prevent overwriting existing globals (2, 15); no other handling — stub methods silently return fixed identity/zero values rather than computing.
- Tests: none found (grep-verified).
- Observed issues: duplicated verbatim inside `next.config.mjs:8-26`; the untracked `server-polyfills 2.js` (May 28) is byte-identical to the tracked file (`diff` → IDENTICAL).
- ASSUMED: none.

## pdfjs-shadow-fix-loader.cjs

- Purpose: Webpack loader that renames `__webpack_require__`/`__webpack_exports__` identifiers inside pdfjs-dist bundle files so their hoisted `var` declarations stop shadowing next dev's eval-wrapped runtime parameters.
- Public surface: `module.exports = function pdfjsShadowFixLoader(source: string): string` (pdfjs-shadow-fix-loader.cjs:15-17).
- Inputs & outputs: module source string in; string out with every `__webpack_(require|exports)__` occurrence rewritten to `__pdfjs_$1__` (16).
- Dependencies: uses -> none. used by <- `next.config.mjs:155-158` (P01), applied via rule test `/[\\/]pdfjs-dist[\\/]build[\\/][^\\/]*\.mjs$/` — the in-file comment states this covers "every pdfjs-dist copy (root and react-pdf's nested one)" (next.config.mjs:154). No other consumers (grep-verified; other hits are review artifacts and worktree copies).
- Side effects: none — pure string transform.
- Error handling: none; a single unconditional `String.prototype.replace` with a global regex (16). No parsing, no guards.
- Tests: none found (grep-verified).
- Observed issues: the replacement is a blanket regex over the entire module source — any occurrence of the two identifiers is rewritten regardless of syntactic context (string literals and comments included); the 14-line header comment (1-14) asserts the rename is semantics-preserving because both identifiers are internal to the pdfjs bundle.
- ASSUMED: the header comment's causal account (webpack renames nested `__webpack_require__` but not `__webpack_exports__`; the crash is `TypeError: Object.defineProperty called on non-object`) is taken from the comment (1-10), not independently reproduced.

## capacitor.config.ts

- Purpose: Capacitor configuration declaring the native app identity and pointing the native shell at the remote Vercel deployment.
- Public surface: `default export config: CapacitorConfig` (capacitor.config.ts:3, 21) with fields `appId: 'com.wattmatt.compliance'`, `appName: 'wm-compliance'`, `webDir: 'out'`, `server: { url: 'https://insight-linker-app.vercel.app', cleartext: true }`, `plugins.Camera.permissions.photos: 'limited'` (4-18).
- Inputs & outputs: static config only; no env reads. Names an on-disk web directory `out` and a remote origin `insight-linker-app.vercel.app`.
- Dependencies: uses -> `CapacitorConfig` type from `@capacitor/cli` (1). used by <- none found in code (grep-verified: repo hits for "capacitor.config" are docs `docs/ARCHITECTURE_REVIEW_2026-07-07.md`, `docs/AUDIT_BASELINE.md` (X01), `docs/system-reference/01-architecture.md` (X02), and review artifacts). The only `src` file importing any `@capacitor/*` package is `src/hooks/useCamera.ts` (H02).
- Side effects: none at web runtime; consumed at native build/sync time.
- Error handling: n/a (declarative config).
- Tests: none found (grep-verified).
- Observed issues: `webDir: 'out'` names a directory that does not exist in the working tree (`ls -d out` → absent) and `next.config.mjs` contains no `output` key that would produce it; no `android/` or `ios/` directory exists in the repo (`ls -d android ios` → absent); `cleartext: true` is set alongside an https `server.url` (8-9); the native shell loads the live remote deployment rather than bundled assets (7-10).
- ASSUMED: that the Capacitor CLI (`npx cap ...`) is the consumer of this file by framework convention, and that `server.url` overriding `webDir` at runtime is standard Capacitor behaviour — neither exercised in this repo.

## package.json

- Purpose: Package manifest defining the app's name, scripts, and dependency set for the Next 15 build.
- Public surface: `name: "wm-compliance-inspector"`, `private: true`, `version: "1.0.0"` (package.json:2-4); scripts `dev`/`build`/`start` = `NODE_OPTIONS='--require ./server-polyfills.js' next dev|build|start` (6-8), `lint: "eslint ."` (9), `test: "vitest run"`, `test:watch: "vitest"` (10-11); 73 `dependencies` (13-87) and 16 `devDependencies` (88-105) — counts command-verified.
- Inputs & outputs: scripts set `NODE_OPTIONS` for every Next process. Key pins: `next ^15.3.0` (67), `react`/`react-dom ^18.3.1` (73, 75), `@supabase/supabase-js ^2.75.0` (48), `@tanstack/react-query ^5.83.0` (49), Capacitor 7 suite incl. `@capacitor/cli` in `dependencies` (14-18), 27 `@radix-ui/*` packages (21-47), PDF stack `jspdf ^4.0.0`/`pdf-lib`/`pdfjs-dist ^5.4.296`/`pdfmake ^0.3.2`/`react-pdf ^10.2.0`/`html2canvas` (62-78), `fabric ^7.2.0` (60), `xlsx ^0.18.5` (85), `qrcode ^1.5.4` (72), `@zxcvbn-ts/*` (51-53), `zod ^3.25.76` (86). DevDeps: `vitest ^2.1.9`, `jsdom ^29.1.1`, `fake-indexeddb ^6.2.5`, testing-library, `eslint ^8.57.0` + `eslint-config-next ^15.3.0`, `tailwindcss ^3.4.17`, `typescript ^5.8.3` (89-104). No `engines` and no `packageManager` field (command-verified: both `undefined`).
- Dependencies: uses -> `./server-polyfills.js` (6-8, P01). used by <- npm/Vercel install (`vercel.json:5`, P01); `test` scripts resolve through `vitest.config.ts` (P02); `lint` resolves through `eslint.config.mjs` (P02); `package-lock.json` root block mirrors it (P01).
- Side effects: none beyond what its scripts launch.
- Error handling: n/a.
- Tests: none found covering this file (grep-verified).
- Observed issues: `@capacitor/cli` (16) and `@types/qrcode` (50) are listed under `dependencies` rather than `devDependencies`; the `build` script (7) and `vercel.json:4` `buildCommand` are duplicate strings.
- ASSUMED: none.

## package-lock.json

- Purpose: npm lockfileVersion-3 resolution of the package.json tree.
- Public surface: n/a (generated). Root: `name: "wm-compliance-inspector"`, `version: "1.0.0"`, `lockfileVersion: 3`, `requires: true` (package-lock.json:2-5); 18,390 lines; 1,293 entries in `packages` (command-counted).
- Inputs & outputs: root requirement block reproduces `package.json` exactly — programmatic diff of `dependencies`/`devDependencies` vs `packages[""]` found zero missing entries and zero range mismatches in either direction. Notable resolved versions: `next 15.5.14` (13249-13250), `react 18.3.1` (14347-14348), `pdfjs-dist 5.5.207` (13784-13785), `pdfmake 0.3.7` (13811-13812), `@ducanh2912/next-pwa 10.2.9` (1901-1902).
- Dependencies: uses -> mirrors `package.json` (P01). used by <- npm during `installCommand: "npm install"` (`vercel.json:5`, P01). No source-code references (grep-verified; the only in-repo mention outside review artifacts is the comment in `next.config.mjs:106-107` about a *stray* `~/package-lock.json` in the home directory, not this file).
- Side effects: none.
- Error handling: n/a.
- Tests: none found.
- Observed issues: resolved versions float above the manifest floors under caret ranges (e.g. `next` requested `^15.3.0`, locked `15.5.14`; `pdfjs-dist` requested `^5.4.296`, locked `5.5.207`) — factual state of the lock. Last commit touching it is `f633c31` (2026-06-15), the same commit that last touched `package.json` (git-log verified).
- ASSUMED: none.

## bun.lock

- Purpose: Bun lockfile recording a pre-Next-migration, Vite-era dependency tree under the workspace name `vite_react_shadcn_ts`.
- Public surface: n/a (generated). `lockfileVersion: 1`, `configVersion: 1` (bun.lock:2-3); workspace `""` named `vite_react_shadcn_ts` (6) with 70 `dependencies` and 17 `devDependencies` (command-counted); 1,132 entries in `packages` (command-counted); 2,365 lines.
- Inputs & outputs: records `vite ^5.4.19` (96; resolved 5.4.19 at 1949), `react-router-dom ^6.30.1` (68; 1651), `lovable-tagger ^1.1.11` (91; 1397), `vite-plugin-pwa` (1951), `@vitejs/plugin-react-swc` (755), eslint-9-era lint stack (`@eslint/js ^9.32.0`, `typescript-eslint ^8.38.0`, 80-96). Contains zero `"next":` entries (`grep -c` → 0) and shares parts of the current stack: `@supabase/supabase-js`, `@tanstack/react-query` (grep-verified present), `jspdf 4.0.0` (54, 1359), `pdfjs-dist 5.4.296` (58, 1563), `pdfmake 0.3.2` (59, 1567), `react-pdf 10.2.0` (1641).
- Dependencies: uses -> describes a dependency set that is not the current `package.json`: 13 current packages absent from bun.lock (incl. `next`, `@ducanh2912/next-pwa`, `pdf-lib`, `@zxcvbn-ts/*`, `vitest`, `jsdom`, `fake-indexeddb`, `eslint-config-next`, testing-library — computed set-diff) and 11 bun.lock packages absent from `package.json` (incl. `vite`, `react-router-dom`, `lovable-tagger`, `vite-plugin-pwa`, `typescript-eslint`, `@vitejs/plugin-react-swc` — computed set-diff). used by <- none found in repo configuration (grep-verified); the deploy install path is npm (`vercel.json:5`, P01).
- Side effects: none.
- Error handling: n/a.
- Tests: none found.
- Observed issues: workspace name `vite_react_shadcn_ts` (6) does not match `package.json`'s `wm-compliance-inspector` (package.json:2); last commit touching it is `4acffbf` 2026-03-06 ("Work in progress"), which predates the Vite→Next migration commit `90ed91d` 2026-05-25 (git-log verified) — the file has been tracked unchanged since.
- ASSUMED: that bun.lock is stale rather than in active local use by a Bun-based workflow — actual local package-manager usage was not verified.
