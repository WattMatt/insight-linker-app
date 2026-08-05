# Inventory Part 14 — platform: root config files + public/ assets + docs/ classification + untracked oddities

**Date:** 2026-07-29
**List command:** `git ls-files | grep -v / ; git ls-files 'public/*' 'docs/*'`
**Real output count:** 237 files (`... | wc -l` → `237`)
Breakdown: 28 root files + 199 `docs/` files + 10 `public/` files.

LOC figures below come from `git ls-files | grep -v / | while IFS= read -r f; do wc -l "$f"; done` (root) and `wc -l` on individual public/ text files. Group counts in the docs section come from the awk/uniq commands quoted inline.

---

## Part 1 — Root files (28, full detail)

### .env.example
- **Type:** config
- **LOC:** 10
- **Public surface:** n/a (env template)
- **Notes:** Documents `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PROJECT_ID` (.env.example:1-3) plus optional `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for Cloudflare Turnstile captcha on /auth/login, /signup, /forgot-password; unset disables captcha (.env.example:5-10).

### .gitignore
- **Type:** config
- **LOC:** 57
- **Public surface:** n/a
- **Notes:** Ignores `.next/`, `out/`, `next-env.d.ts` (.gitignore:16-18); PWA generated files `public/sw.js`, `public/workbox-*.js`, `public/fallback-*.js` etc. (.gitignore:27-34); `.env*` (.gitignore:22-24, 57); `/tasks/` "local working notes" (.gitignore:37); `supabase/.temp/`+`.branches/` (.gitignore:52-53); `.superpowers/` (.gitignore:56). Contains a literal `node_modules 2/` entry (.gitignore:11) — evidence the " 2" duplicate-suffix phenomenon predates this session.

### AI_MODEL_CONFIGURATION.md
- **Type:** docs
- **LOC:** 337
- **Notes:** States all AI features use `google/gemini-3-pro-preview`; documents the `validate-coc` edge function config (AI_MODEL_CONFIGURATION.md:3-19). See Oddities: docs/system-reference/00-INDEX.md:19 records `validate-coc`/`extract-coc` as deleted 2026-06-12.

### IMPROVEMENTS_IMPLEMENTED.md
- **Type:** docs
- **LOC:** 280
- **Notes:** "Phase 1" improvement log (lazy routes, file-upload validation). References `src/App.tsx` (IMPROVEMENTS_IMPLEMENTED.md:14) — a Vite-era entry file (repo is now Next App Router).

### MOBILE_OFFLINE_SETUP.md
- **Type:** docs
- **LOC:** 144
- **Notes:** Summary of PWA + offline capabilities (service worker, manifest, mutation queue, auto-sync) (MOBILE_OFFLINE_SETUP.md:1-15).

### OFFLINE_IMPLEMENTATION.md
- **Type:** docs
- **LOC:** 277
- **Notes:** Offline-first system description; names IndexedDB stores `inspections`/`images`/`mutations` in `src/lib/offlineDB.ts` (OFFLINE_IMPLEMENTATION.md:9-15).

### OFFLINE_SUBSECTIONS_GUIDE.md
- **Type:** docs
- **LOC:** 353
- **Notes:** Integration guide for offline SubsectionDetail (hooks `useOfflineSubsections`, `offlineDBExtensions`) (OFFLINE_SUBSECTIONS_GUIDE.md:1-15).

### README.md
- **Type:** docs
- **LOC:** 539
- **Notes:** Project overview: "professional electrical compliance inspection and reporting platform… SANS 10142-1" (README.md:3). "Live" link points to a lovable.dev project URL (README.md:5). Features section still lists "AI-powered PDF extraction via Google Gemini 3 Pro" COC validation (README.md:30-38) — see Oddities.

### android-camera-setup.md
- **Type:** docs
- **LOC:** 112
- **Notes:** Camera setup guide: HTML5 file-input capture for web, Capacitor for native (android-camera-setup.md:1-15).

### android-permissions.md
- **Type:** docs
- **LOC:** 49
- **Notes:** AndroidManifest.xml permission instructions "after running `npx cap add android`" (android-permissions.md:3-14). No `android/` directory is tracked (`git ls-files android | wc -l` → 0; same for `ios/`).

### bun.lock
- **Type:** generated
- **LOC:** 2365
- **Notes:** Bun lockfile, tracked alongside package-lock.json. Deploy install path is npm (vercel.json:5 `"installCommand": "npm install"`).

### capacitor.config.ts
- **Type:** build-deploy
- **LOC:** 21
- **Public surface:** `default export config: CapacitorConfig` (capacitor.config.ts:3, 21).
- **Notes:** appId `com.wattmatt.compliance`, appName `wm-compliance`, `webDir: 'out'` (no tracked `out/`; gitignored). `server.url: 'https://insight-linker-app.vercel.app'` with `cleartext: true` (capacitor.config.ts:7-10) — the native shell loads the remote Vercel deployment rather than bundled assets. Camera plugin `photos: 'limited'` (capacitor.config.ts:12-17).

### complete-import.sql
- **Type:** scripts
- **LOC:** 107
- **Notes:** One-off "Complete Data Import Script — Run this in Supabase SQL Editor" (complete-import.sql:1-2). PL/pgSQL DO block creating a 'Fortress Fund' client and 12 named sites (complete-import.sql:5-29).

### components.json
- **Type:** config
- **LOC:** 20
- **Notes:** shadcn/ui config: style default, `rsc: false`, tailwind css at `src/index.css`, baseColor slate, aliases `@/components`, `@/lib/utils`, `@/components/ui`, `@/lib`, `@/hooks` (components.json:1-20).

### eslint.config.mjs
- **Type:** config
- **LOC:** 46
- **Public surface:** `default export eslintConfig` (flat-config array).
- **Notes:** FlatCompat extending `next/core-web-vitals` + `next/typescript` (eslint.config.mjs:24). Ignores `.next/**`, `dist/**`, `public/**`, `supabase/**`, `docs/**`, `next-env.d.ts`, `next.config.mjs` (eslint.config.mjs:14-22). Comment records "~524 style/type errors" baseline downgraded to `warn` (eslint.config.mjs:26-30); `react-hooks/rules-of-hooks` kept `error` with comment citing a shipped React #303 crash (eslint.config.mjs:39-41).

### insert-clients.sql
- **Type:** scripts
- **LOC:** 20
- **Notes:** One-off Supabase SQL Editor script inserting 10 client organizations (`Fortress_Fund`, `Moolman_Group`, …, `watson_mattheus`) with `ON CONFLICT (name) DO NOTHING` plus a verify SELECT (insert-clients.sql:1-20).

### next.config.mjs
- **Type:** build-deploy
- **LOC:** 163
- **Public surface:** `default export withPWA(nextConfig)` (next.config.mjs:163).
- **Notes:**
  - Inline DOMMatrix/Path2D polyfills for pdfjs-dist in Node (next.config.mjs:7-26) — same code as server-polyfills.js.
  - PWA via `@ducanh2912/next-pwa`: `dest: "public"`, register+skipWaiting, disabled in dev, document fallback `/offline`, workbox `maximumFileSizeToCacheInBytes` 5MB, 4 runtimeCaching rules: supabase `/rest/` NetworkFirst 24h; supabase `/storage/` CacheFirst 7d; Google Fonts CacheFirst 1y; cdnjs CacheFirst 30d (next.config.mjs:28-100).
  - `outputFileTracingRoot: __dirname` pinned, comment cites stray `~/package-lock.json` (next.config.mjs:106-108).
  - `typescript: { ignoreBuildErrors: true }` and `eslint: { ignoreDuringBuilds: true }` — comment: "109 strict-mode type errors… post-Vite-migration. Tracked separately." (next.config.mjs:110-113).
  - `serverExternalPackages: ['fabric','canvas','pdfmake','jspdf','html2canvas']` (next.config.mjs:115).
  - `images.remotePatterns` allows only `oltzgidkjxwsukvkomof.supabase.co` `/storage/**` (next.config.mjs:117-125).
  - 6 permanent redirects: `/issue-reports`, `/suggestions`, `/verification-management` → `/feedback-management`; `/admin-client-preview`, `/admin-contractor-preview`, `/admin/contractor-access-simulator` → `/portal-management` (next.config.mjs:127-136).
  - Custom webpack: server externals fabric/canvas, alias `canvas: false`, and a module rule routing every `pdfjs-dist/build/*.mjs` through `pdfjs-shadow-fix-loader.cjs` (next.config.mjs:143-160).

### package-lock.json
- **Type:** generated
- **LOC:** 18390
- **Notes:** npm lockfile; matches the Vercel install path (vercel.json:5).

### package.json
- **Type:** config
- **LOC:** 106
- **Public surface (scripts):** `dev`/`build`/`start` = `NODE_OPTIONS='--require ./server-polyfills.js' next dev|build|start` (package.json:6-8); `lint` = `eslint .`; `test` = `vitest run`; `test:watch` = `vitest` (package.json:9-11).
- **Notes:** name `wm-compliance-inspector` v1.0.0 private (package.json:2-4). Dependencies (74): Next `^15.3.0`, React/ReactDOM `^18.3.1`, `@supabase/supabase-js ^2.75.0`, `@tanstack/react-query ^5.83.0`, Capacitor 7 suite incl. `@capacitor/cli` in dependencies (package.json:14-18), 27 `@radix-ui/*` packages, PDF stack (`jspdf ^4`, `pdf-lib`, `pdfjs-dist ^5.4`, `pdfmake ^0.3`, `react-pdf ^10`, `html2canvas`), `fabric ^7`, `xlsx`, `qrcode`, `@zxcvbn-ts/*`, `zod`, `docx-preview`, `heic2any`, `jszip`, `recharts`, `react-hook-form`, `next-themes`, `sonner`. DevDependencies (16): vitest `^2.1.9`, jsdom `^29`, `fake-indexeddb`, testing-library, eslint `^8.57` + `eslint-config-next ^15.3`, tailwindcss `^3.4.17`, typescript `^5.8.3` (package.json:88-105).

### pdfjs-shadow-fix-loader.cjs
- **Type:** build-deploy
- **LOC:** 17
- **Public surface:** `module.exports = function pdfjsShadowFixLoader(source)` — webpack loader; regex-renames `__webpack_(require|exports)__` → `__pdfjs_$1__` in pdfjs-dist bundles (pdfjs-shadow-fix-loader.cjs:15-17).
- **Notes:** 14-line comment documents the `next dev` eval-scope shadowing crash it works around (pdfjs-shadow-fix-loader.cjs:1-14).

### postcss.config.js
- **Type:** config
- **LOC:** 6
- **Notes:** tailwindcss + autoprefixer plugins only.

### server-polyfills.js
- **Type:** build-deploy
- **LOC:** 20
- **Public surface:** none (mutates `globalThis` on require).
- **Notes:** Stub `DOMMatrix` and `Path2D` classes for pdfjs-dist in Node build workers (server-polyfills.js:1-20). Preloaded via `NODE_OPTIONS --require` in all three Next scripts (package.json:6-8) and the Vercel buildCommand (vercel.json:4). Duplicated inline in next.config.mjs:7-26.

### sql-import-scripts.md
- **Type:** docs
- **LOC:** 139
- **Notes:** Markdown containing runnable SQL import snippets. Step 1 inserts 8 real user records with emails (`arno@watsonmattheus.com`, `*@wmeng.co.za`) and roles into `temp_import` (sql-import-scripts.md:5-16); step 2 seeds a Fortress Fund client (sql-import-scripts.md:22-25).

### tailwind.config.ts
- **Type:** config
- **LOC:** 91
- **Public surface:** `default export` config object `satisfies Config` (tailwind.config.ts:3, 91).
- **Notes:** `darkMode: ["class"]`; content globs cover `./pages`, `./components`, `./app`, `./src` (tailwind.config.ts:5); CSS-variable-driven shadcn palette incl. an 8-token `sidebar` group (tailwind.config.ts:50-59); accordion keyframes/animations; `tailwindcss-animate` plugin (tailwind.config.ts:90).

### tsconfig.json
- **Type:** config
- **LOC:** 29
- **Notes:** `strict: true`, `noEmit`, `moduleResolution: "bundler"`, `jsx: "preserve"`, target es2020, path alias `@/*` → `./src/*` (tsconfig.json:17-19), Next plugin, excludes `node_modules` and `supabase` (tsconfig.json:28).

### vercel.json
- **Type:** build-deploy
- **LOC:** 8
- **Notes:** framework nextjs; `buildCommand` repeats the server-polyfills preload (vercel.json:4); `installCommand: "npm install"` (vercel.json:5); region `iad1`; one cron: `{ "path": "/api/snapshots/capture", "schedule": "0 2 * * *" }` (vercel.json:7).

### vitest.config.ts
- **Type:** tests
- **LOC:** 27
- **Public surface:** `default export defineConfig(...)`.
- **Notes:** Header comment: "Layer (b) of the offline-hardening harness" (vitest.config.ts:3). Default environment `node` (comment: Node's Blob survives fake-indexeddb structured clone; jsdom's does not), per-file jsdom opt-in via docblock; jsdom origin `http://localhost:3000`; `globals: true`; setup `./vitest.setup.ts`; include `src/**/*.test.{ts,tsx}`; alias `@` → `./src`; `esbuild: { jsx: 'automatic' }` (vitest.config.ts:10-27).

### vitest.setup.ts
- **Type:** tests
- **LOC:** 40
- **Public surface:** none exported (side-effect module; internal `makeStorage(): Storage`).
- **Notes:** Imports `@testing-library/jest-dom/vitest`; seeds dummy `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` because the Supabase client throws at import time without them (vitest.setup.ts:3-8); installs Map-backed `localStorage`/`sessionStorage` on globalThis+window if absent, writable so tests can override (vitest.setup.ts:14-40).

---

## Part 2 — public/ (10 tracked files)

Commands: `wc -l public/manifest.json public/robots.txt public/placeholder.svg`; `ls -la public/ public/reference/`; `file public/favicon.ico public/icon-192.png public/icon-512.png public/reference/*.jpg`; `md5` on the three icons.

| Path | Type | Size / LOC | Notes |
|---|---|---|---|
| public/favicon.ico | assets | 14,503 B | `file`: JPEG image data, 512x512 — not ICO format. MD5 `62900b90e8962107316de9d7f38627ae` |
| public/icon-192.png | assets | 14,503 B | JPEG 512x512, same MD5 — byte-identical to favicon.ico |
| public/icon-512.png | assets | 14,503 B | JPEG 512x512, same MD5 — byte-identical to both above |
| public/manifest.json | config | 41 LOC | PWA manifest: name "WM Compliance Inspector", short_name "WM Compliance", standalone, portrait-primary, theme `#2563eb` (manifest.json:2-9); declares the two icons as `image/png` at 192x192 / 512x512 `any maskable` (manifest.json:10-23); shortcuts "New Inspection" → `/inspections`, "Sites" → `/sites` (manifest.json:25-40) |
| public/placeholder.svg | assets | 3,253 B (0 newlines) | Single-line SVG. No references found: `grep -rln "placeholder.svg" src` → no output |
| public/reference/current_page1.jpg | assets | 90,339 B | JPEG 1131x1600 page scan |
| public/reference/current_page2.jpg | assets | 133,367 B | JPEG 1131x1600 page scan |
| public/reference/ref_page1.jpg | assets | 80,286 B | JPEG 1131x1600 page scan |
| public/reference/ref_page2.jpg | assets | 78,898 B | JPEG 1131x1600 page scan. No src references to any `reference/` image: `grep -rn "reference/current_page\|reference/ref_page\|/reference/" src --include='*.ts' --include='*.tsx' -l` → no output |
| public/robots.txt | config | 14 LOC | `Allow: /` for Googlebot, Bingbot, Twitterbot, facebookexternalhit, and `*` (robots.txt:1-14) |

Untracked files also present on disk in public/ (see Oddities): `sw.js`, `workbox-0db717d9.js`, `fallback-ce627215c0e4a9af.js`, `.DS_Store`.

---

## Part 3 — docs/ classification (199 tracked files, summary mode)

Group counts from: `git ls-files 'docs/*' | awk -F/ '{ if (NF==2) print "docs (top-level)"; else print "docs/"$2 }' | sort | uniq -c | sort -rn`
Extension counts from: `git ls-files 'docs/*' | sed 's/.*\.//' | sort | uniq -c | sort -rn` → 159 md, 12 json, 9 sql, 7 ts, 5 html, 3 xlsx, 2 db, 1 db-journal, 1 csv.

| Group | Count | Dominant type | Characterization |
|---|---|---|---|
| docs/system-reference/ | 80 | docs (+ generated/_work) | Code-verified "System Reference — Master Index & Verification Ledger"; every claim cited `file:line`, review COMPLETE 2026-06-11, with a "Post-review changes" ledger (00-INDEX.md:1-21). Subgroups (command-counted): top 5 (00-INDEX, 01-architecture, GAPS, SECURITY-FINDINGS phase2/3), 02-data-model 16, 03-auth-and-access 4, 04-routes 7, 05-edge-functions 5, 06-flows 8, 07-components-hooks-lib 14, 08-existing-docs-audit 3, `_work/` 18. `_work/` = 11 JSON extraction artifacts (inventory-clean, migration-events-01..10) + 7 `*.PULLED-FROM-PROD.ts` snapshots of unversioned production edge functions — point-in-time records per 00-INDEX.md:17 |
| docs/superpowers/ | 62 | docs | Feature workstream planning: 1 tracker (COC-VALIDATION-STRIPOUT-TRACKER.md) + `plans/` 33 + `specs/` 28 (command-counted), dated 2026-06-11 → 2026-07-27; themes are the COC system rework and the QR platform (e.g. plans/2026-07-27-qr-platform-design.md:1-13 — design spec for current branch `feat/qr-platform`) |
| docs (top-level) | 20 | docs (+1 json) | APPLICATION_SPEC.md (exhaustive app spec; its own header flags the COC section as superseded 2026-06-12 and the spec as pre-Vite-migration partly stale, docs/APPLICATION_SPEC.md:3; tech-stack table still lists Vite, line 38); audits/parity (AUDIT_BASELINE, ARCHITECTURE_REVIEW_2026-07-07, PARITY_GAP_ANALYSIS, WEB_PARITY_PLAN, AUTH_MODERNISATION, CLIENT_PORTAL_ONBOARDING_REVIEW); COC (COC_REVIEW_PROCESS, COC_TEST_FRAMEWORK, COC_VALIDATION_SPEC, coc-input-schema.json — no code refs found: `grep -rn "coc-input-schema" src supabase` → no output); PDF (PDF_GENERATION_ROADMAP, PDF_LAYOUT_STANDARDS, PDF_TEMPLATE_GATEKEEPER_ARCHITECTURE); inspections (INSPECTION_SYSTEM, INSPECTION_TEMPLATES); SCORING; SITE_SUMMARY_REPORT_REVIEW; DATA_INTEGRITY_AUDIT_PLAN; qr-lovable-decommission-runbook |
| docs/fortress-spec/ | 14 | docs + scripts | Fortress building-layer workstream: 2 HTML dashboards, 3 md (roadmap/preflight/ingest-review + README, BUILD-PROMPT), `sql/` 6 files (3 draft migrations with 2 `.down.sql` counterparts + seed) — classified scripts; `linear-import-26-tasks.csv` (assets); `abaqulusi_review.db` SQLite (generated) |
| docs/security/ | 10 | docs + scripts | Dated 2026-06-09..11 security audit series (7 md, e.g. 2026-06-09-auth-access-security-audit.md:1-7: OWASP-based review of 135 migrations + 25 edge functions) + 3 SQL lockdown scripts prefixed `APPLIED-`/`PENDING-` (scripts) |
| docs/sessions/ | 6 | docs + generated | Session artifacts: 2 HTML (fortress dashboard/roadmap), 2 md, plus `abaqulusi_review.db` + `abaqulusi_review.db-journal` (generated; a committed SQLite journal) |
| docs/fortress specs/ | 3 | assets | Directory name contains a space. 3 binary .xlsx client report workbooks (Abaqulusi annual/CM/OPS reports) |
| docs/incidents/ | 1 | docs | 2026-04-22-orphaned-inspections.md |
| docs/integrity-audit/ | 1 | docs | 2026-05-26-scorecard.md |
| docs/reviews/ | 1 | docs | 2026-06-12-calendar-review.md |
| docs/reference/ | 1 | docs | coc-verification-guideline.html |

Classification roll-up for docs/: 187 docs (md/html/json specs), 9 scripts (.sql under fortress-spec/sql/ and security/), 3 generated (2 .db + 1 .db-journal), 4 assets (3 .xlsx + 1 .csv), 7 `.ts` files under `_work/unversioned-prod-functions/` counted as docs (reference snapshots of prod code, per 00-INDEX.md:17), 11 `_work/*.json` counted as generated. (187 = 159 md + 5 html + 12 json − 11 generated json + 7 ts + … see ASSUMED for the per-file basis.)

---

## Runtime observations

- **Scheduled job:** Vercel cron calls `/api/snapshots/capture` daily at 02:00 UTC — vercel.json:7.
- **Service worker / PWA:** `@ducanh2912/next-pwa` emits `public/sw.js` with register + skipWaiting + clientsClaim, document fallback `/offline`, and runtime caches for `*.supabase.co/rest/*` (NetworkFirst 24h) and `*.supabase.co/storage/*` (CacheFirst 7d), Google Fonts, cdnjs — next.config.mjs:28-100. Disabled in development — next.config.mjs:32.
- **Native shell:** Capacitor app `com.wattmatt.compliance` loads the remote deployment `https://insight-linker-app.vercel.app` (`server.url`, `cleartext: true`) — capacitor.config.ts:7-10.
- **Process preload:** every `next dev|build|start` and the Vercel build run with `--require ./server-polyfills.js` (DOMMatrix/Path2D stubs for pdfjs-dist) — package.json:6-8, vercel.json:4.
- **External services:** Supabase project `oltzgidkjxwsukvkomof.supabase.co` (images remotePattern — next.config.mjs:121; also named in docs/security/2026-06-09-auth-access-security-audit.md:4); optional Cloudflare Turnstile captcha — .env.example:5-10; Google Fonts + cdnjs as cached CDNs — next.config.mjs:74-97.
- **Legacy-route redirects:** 6 permanent redirects into `/feedback-management` and `/portal-management` — next.config.mjs:127-136.
- **PWA entry surface:** manifest shortcuts deep-link `/inspections` and `/sites` — public/manifest.json:25-40.

## Oddities

Factual observations only.

1. **Two lockfiles tracked:** `bun.lock` (2365 lines) and `package-lock.json` (18390 lines) both in git; the deploy path uses npm (`installCommand: "npm install"`, vercel.json:5).
2. **Three byte-identical icon files, wrong format:** `public/favicon.ico`, `public/icon-192.png`, `public/icon-512.png` all have MD5 `62900b90e8962107316de9d7f38627ae` and `file` identifies each as JPEG 512x512 — despite `.ico`/`.png` extensions and manifest.json:10-23 declaring `image/png` at 192x192/512x512.
3. **Loose one-off SQL at repo root:** `insert-clients.sql` (client seed), `complete-import.sql` (Fortress Fund + 12 sites), and `sql-import-scripts.md` — the latter embeds runnable SQL containing 8 real staff emails and roles (sql-import-scripts.md:8-15).
4. **Root docs describing removed/pre-migration systems:** AI_MODEL_CONFIGURATION.md documents the `validate-coc` Gemini pipeline (AI_MODEL_CONFIGURATION.md:11-19) that docs/system-reference/00-INDEX.md:19 records as deleted 2026-06-12; README.md:5 "Live" link points to lovable.dev; README.md:30-38 lists the AI COC validation feature; IMPROVEMENTS_IMPLEMENTED.md:14 references Vite-era `src/App.tsx`; docs/APPLICATION_SPEC.md:38 lists Vite as the build tool (its own header, line 3, flags this staleness).
5. **Untracked working-copy noise — exact output of `git status --porcelain | grep "^??"` (38 entries):**
   ```
   ?? .claude/
   ?? "docs/AUDIT_BASELINE 2.md"
   ?? "docs/AUTH_MODERNISATION 2.md"
   ?? "docs/PARITY_GAP_ANALYSIS 2.md"
   ?? "docs/WEB_PARITY_PLAN 2.md"
   ?? graphify-out/
   ?? review/
   ?? "next.config 2.mjs"
   ?? "server-polyfills 2.js"
   ?? "src/app/layout 2.tsx"
   ?? "src/app/not-found 2.tsx"
   ?? "src/app/page 2.tsx"
   ?? "src/app/providers 2.tsx"
   ?? "src/components/CaptchaTurnstile 2.tsx"
   ?? "src/components/auth/AuthLoading 2.tsx"
   ?? "src/components/auth/OnboardingGate 2.tsx"
   ?? "src/components/auth/useAuthSession 2.ts"
   ?? "src/components/auth/useOnboardingStatus 2.ts"
   ?? src/graphify-out/
   ?? "src/lib/auth-audit 2.ts"
   ?? "src/lib/navigation 2.tsx"
   ?? "src/lib/password-strength 2.ts"
   ?? "src/views/Calendar 2.tsx"
   ?? "src/views/ClientPortalSites 2.tsx"
   ?? "src/views/Clients 2.tsx"
   ?? "src/views/ContractorPortal 2.tsx"
   ?? "src/views/ContractorSiteDetail 2.tsx"
   ?? "src/views/Dashboard 2.tsx"
   ?? "src/views/InspectionTemplates 2.tsx"
   ?? "src/views/IssueReports 2.tsx"
   ?? "src/views/OfflineReview 2.tsx"
   ?? "src/views/OfflineSyncTest 2.tsx"
   ?? "src/views/PublicClientPortfolio 2.tsx"
   ?? "src/views/Settings 2.tsx"
   ?? "supabase/functions/log-auth-event/index 2.ts"
   ?? "supabase/migrations/20260525120000_auth_events_audit 2.sql"
   ?? "vercel 2.json"
   ```
   (Note: `?? review/` is this review's own output directory.) 32 entries are `" 2"`-suffixed files mirroring same-named tracked files across root, src/, docs/, and supabase/. `.gitignore:11` already contains a `node_modules 2/` entry, so the pattern predates this session. `graphify-out/` appears twice (repo root and `src/graphify-out/`).
6. **Untracked generated PWA output on disk in public/:** `sw.js` (18,197 B), `workbox-0db717d9.js` (22,308 B), `fallback-ce627215c0e4a9af.js` (2,804 B), dated Jul 28 (`ls -la public/`) — correctly gitignored (.gitignore:27-34) but present. Also `public/.DS_Store`.
7. **Unreferenced public assets:** `public/reference/*.jpg` (4 page scans, ~78–133 KB each) and `public/placeholder.svg` have no matches in `src/` (grep commands and empty results recorded in Part 2).
8. **Committed SQLite artifacts in docs:** `docs/sessions/abaqulusi_review.db` + its `.db-journal` (a SQLite hot-journal file) and a second `abaqulusi_review.db` copy in `docs/fortress-spec/`.
9. **Near-duplicate directory names:** `docs/fortress-spec/` and `docs/fortress specs/` (with a space) both exist, holding related Abaqulusi/fortress material.
10. **Android/iOS docs without native projects:** android-permissions.md and android-camera-setup.md instruct edits to `android/`, but `git ls-files android` and `git ls-files ios` both return 0 files.
11. **Build gates disabled with recorded baselines:** `typescript.ignoreBuildErrors: true` + `eslint.ignoreDuringBuilds: true` with an in-file comment citing 109 strict-mode type errors (next.config.mjs:110-113); ~524 lint findings downgraded to warn with in-file rationale (eslint.config.mjs:26-30).
12. **`webDir: 'out'` with no tracked `out/`:** capacitor.config.ts:6 names a webDir that is gitignored (.gitignore:17) and empty in git (`git ls-files out` → 0); the config's `server.url` remote-load makes the webDir the fallback shell only (per Capacitor semantics — see ASSUMED).
13. **Duplicated polyfill code:** the DOMMatrix/Path2D stubs exist twice — server-polyfills.js:1-20 and inlined in next.config.mjs:7-26.

## ASSUMED

Inferred, not verified:

- The `" 2"`-suffixed untracked files are presumed macOS Finder/iCloud-style duplicate copies of their same-named tracked counterparts; their contents were NOT diffed against the originals.
- `bun.lock` is presumed a secondary/stale lockfile because the Vercel install command uses npm — actual local-dev package-manager usage not verified.
- `public/reference/*.jpg` presumed to be PDF-report layout reference pages ("current" vs "ref" page1/2 naming); image contents were viewed only via `file` metadata, not visually.
- docs/ per-file classification is extension-based for the 199-file set (only ~6 docs opened: APPLICATION_SPEC.md, 00-INDEX.md, one security audit, one superpowers plan, plus root docs); individual .md/.html files were not each opened.
- The 7 `_work/unversioned-prod-functions/*.PULLED-FROM-PROD.ts` files are treated as docs (reference snapshots, not built/deployed from this repo) based on their directory name and 00-INDEX.md:17's "point-in-time records" statement; no build config referencing them was found, but absence was not exhaustively proven.
- Capacitor `webDir` fallback semantics (remote `server.url` overriding local webDir) are standard Capacitor behavior, asserted from framework knowledge rather than this repo's code.
- `/api/snapshots/capture` is assumed to exist as an App Router route handler (it is in another agent's slice; not opened here).
