# P02 — tooling-config

- Unit id: P02
- Slug: tooling-config
- Spec mode: full
- Date: 2026-07-29
- Files: 9 (eslint.config.mjs, tsconfig.json, tailwind.config.ts, postcss.config.js, components.json, vitest.config.ts, vitest.setup.ts, .gitignore, .env.example)

## Unit header

**Unit purpose.** Root-level tooling configuration: the lint config (ESLint flat config over Next presets with a legacy-baseline downgrade), the TypeScript compiler config, the Tailwind/PostCSS/shadcn styling toolchain configs, the two-file Vitest test harness, the git ignore rules, and the environment-variable template. None of these files run in the shipped application; they configure the tools that build, check, and test it.

**Module-level observations (cross-file, verified).**
- The `@` → `src` alias is declared independently three times: tsconfig.json:17-19 (`"@/*": ["./src/*"]`), vitest.config.ts:25 (`alias: { '@': path.resolve(__dirname, './src') }`), and components.json:13-19 (shadcn `aliases` in `@/…` form). vitest.config.ts does not read tsconfig paths.
- Both gates this unit configures are bypassed at production build time by P01: next.config.mjs:111 sets `typescript: { ignoreBuildErrors: true }` and next.config.mjs:112 sets `eslint: { ignoreDuringBuilds: true }`, with an in-file comment citing "109 strict-mode type errors and an eslint config issue" (next.config.mjs:109-110). Within ESLint itself, 7 rules are additionally downgraded to `warn` (eslint.config.mjs:32-38); only `react-hooks/rules-of-hooks` remains `error` (eslint.config.mjs:41).
- The `supabase/` tree (edge functions, units F01–F05; migrations D01–D03) sits outside every gate in this unit: ESLint ignores `supabase/**` (eslint.config.mjs:18), tsconfig excludes `supabase` (tsconfig.json:28), the Vitest include glob is `src/**/*.test.{ts,tsx}` only (vitest.config.ts:22), and `git ls-files 'supabase/**/*.test.ts' | wc -l` → 0.
- No file under `src/` references any P02 file by name: `grep -rn "eslint\.config\|vitest\.config\|vitest\.setup\|tailwind\.config\|postcss\.config\|components\.json\|env\.example\|gitignore" src --include="*.ts" --include="*.tsx"` → no output. All consumption is by tools (npm scripts, ESLint/Vitest/Next/git auto-discovery) or by other config files in this unit.
- Installed tool versions (read from node_modules package.json via `node -e`): eslint 8.57.1, vitest 2.1.9, tailwindcss 3.4.19, typescript 5.9.3. Declared ranges: eslint ^8.57.0 (package.json:97), eslint-config-next ^15.3.0 (package.json:98), @eslint/eslintrc ^2.1.4 (package.json:89), vitest ^2.1.9 (package.json:104), tailwindcss ^3.4.17 (package.json:102), typescript ^5.8.3 (package.json:103), jsdom ^29.1.1 (package.json:100), fake-indexeddb ^6.2.5 (package.json:99), @testing-library/jest-dom ^6.9.1 (package.json:91), @testing-library/react ^16.3.2 (package.json:92), autoprefixer ^10.4.21 (package.json:96), postcss ^8.5.6 (package.json:101).

**External contract.** The rest of the repo gets: `npm run lint` = `eslint .` (package.json:9) governed by eslint.config.mjs; `npm test`/`npm run test:watch` = `vitest run`/`vitest` (package.json:10-11) governed by vitest.config.ts + vitest.setup.ts; type checking and the `@/*` import alias for every `src/` module via tsconfig.json; the Tailwind design-token vocabulary (`primary`, `sidebar`, `border`, `--radius` sizes, accordion animations) that `className` strings across C/V units resolve against; the shadcn generator settings (components.json); git tracking boundaries (.gitignore); and the documented public env surface (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PROJECT_ID`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) in .env.example.

---

## eslint.config.mjs

- Purpose: ESLint flat-config that extends the two Next.js presets via FlatCompat, ignores build output and non-app trees, and downgrades a recorded legacy-error baseline to warnings while keeping `react-hooks/rules-of-hooks` a hard error.
- Public surface: `export default eslintConfig` — a flat-config array of 3 entries: an `ignores` object (eslint.config.mjs:13-23), the spread of `compat.extends("next/core-web-vitals", "next/typescript")` (eslint.config.mjs:24), and a `rules` override object (eslint.config.mjs:25-43).
- Inputs & outputs: Inputs — `import.meta.url` to derive `__dirname` for `FlatCompat({ baseDirectory: __dirname })` (eslint.config.mjs:5-10); the two eslint-config-next presets. Outputs — lint verdicts for `eslint .`. Ignore set: `.next/**`, `dist/**`, `public/**`, `supabase/**`, `docs/**`, `next-env.d.ts`, `next.config.mjs` (eslint.config.mjs:14-22). Rules downgraded to `warn`: `@typescript-eslint/no-explicit-any`, `react/no-unescaped-entities`, `@typescript-eslint/ban-ts-comment`, `@typescript-eslint/no-empty-object-type`, `@typescript-eslint/no-require-imports`, `@next/next/no-html-link-for-pages`, `prefer-const` (eslint.config.mjs:32-38); `react-hooks/rules-of-hooks: "error"` (eslint.config.mjs:41). No stores, no env vars.
- Dependencies: uses -> `path` (node), `url` (node), `@eslint/eslintrc` FlatCompat (eslint.config.mjs:1-3; devDep package.json:89); the presets come from eslint-config-next (package.json:98). used by <- package.json:9 `"lint": "eslint ."` (P01 build-pipeline); no references in src (grep-verified, see unit header); docs mention lint config state at docs/AUDIT_BASELINE.md:148 and docs/system-reference/01-architecture.md:56-58 (X01/X02).
- Side effects: none at app runtime; the module is only loaded by the ESLint CLI.
- Error handling: none in the file. Operational check: `npx eslint postcss.config.js` completed with exit 0 and no output (run 2026-07-29), i.e., ESLint 8.57.1 loaded this config and reported nothing for that file.
- Tests: none. No test file references this config (include glob is `src/**` only, vitest.config.ts:22).
- Observed issues:
  1. `dist/**` is ignored (eslint.config.mjs:16) but no `dist/` directory exists (`ls -d dist` → "No such file or directory"); `dist` also appears in .gitignore:12.
  2. `supabase/**` and `docs/**` are excluded from lint (eslint.config.mjs:18-19), so the 17 edge-function files (F01–F05) are never linted by `npm run lint`.
  3. In-file comments carry unverified-by-me quantitative claims: "~524 style/type errors … 458 no-explicit-any, 54 no-unescaped-entities" (eslint.config.mjs:26-27) and "a misplaced hook shipped the React #303 crash to prod" (eslint.config.mjs:39-40). docs/AUDIT_BASELINE.md:148 describes an earlier, different config shape (`tseslint.config(...)`) and a `next lint` failure — stale relative to this file, and package.json:9 now calls `eslint .` directly, not `next lint`.
- ASSUMED: That ESLint's clean exit demonstrates flat-config auto-discovery of `eslint.config.mjs` (ESLint errors when it finds no configuration, so a silent exit implies the config loaded; not proven by a deliberately-failing lint case). That FlatCompat translates the two eslintrc-style presets faithfully.

## tsconfig.json

- Purpose: TypeScript compiler configuration for the Next.js app: strict, no-emit, bundler module resolution, with the `@/*` → `./src/*` path alias and the Next language-service plugin.
- Public surface: n/a (JSON consumed by tsc/editors/Next). Key options: `allowJs`, `esModuleInterop`, `forceConsistentCasingInFileNames`, `incremental`, `isolatedModules`, `jsx: "preserve"`, `lib: ["dom","dom.iterable","esnext"]`, `module: "esnext"`, `moduleDetection: "force"`, `moduleResolution: "bundler"`, `noEmit: true`, `noImplicitAny: true`, `noUnusedLocals: false`, `noUnusedParameters: false`, `paths: { "@/*": ["./src/*"] }`, `plugins: [{ "name": "next" }]`, `resolveJsonModule`, `skipLibCheck: true`, `strict: true`, `strictNullChecks: true`, `target: "es2020"` (tsconfig.json:2-26). Include: `next-env.d.ts`, `**/*.ts`, `**/*.tsx`, `.next/types/**/*.ts` (tsconfig.json:27). Exclude: `node_modules`, `supabase` (tsconfig.json:28).
- Inputs & outputs: Inputs — the file tree matched by include/exclude. Outputs — type-check diagnostics and editor language service behavior; `noEmit: true` (tsconfig.json:13) so no JS output; `incremental: true` produces a `.tsbuildinfo` (gitignored, .gitignore:19). No stores, no env vars.
- Dependencies: uses -> nothing (leaf JSON). used by <- the TypeScript compiler/language service and Next's build type-check step, which is disabled in production builds by next.config.mjs:111 `typescript: { ignoreBuildErrors: true }` (P01); the `@/*` alias it declares is used by effectively every `src/` import; no file references tsconfig.json by name in src (grep-verified, unit header).
- Side effects: none.
- Error handling: n/a. Type errors surface in editors but do not fail `next build` (next.config.mjs:109-111 records 109 outstanding strict-mode errors; not re-measured here).
- Tests: none. Vitest does not consume this file — vitest.config.ts:25 re-declares the alias and vitest uses esbuild, not tsc.
- Observed issues:
  1. `include: ["**/*.ts", "**/*.tsx"]` with only `node_modules`/`supabase` excluded (tsconfig.json:27-28) pulls the 7 Deno-style edge-function snapshots `docs/system-reference/_work/unversioned-prod-functions/*.PULLED-FROM-PROD.ts` (git ls-files-verified) into the tsc program; ESLint by contrast ignores `docs/**` (eslint.config.mjs:19).
  2. The working tree additionally contains untracked `" 2"`-suffixed `.ts`/`.tsx` duplicates at matched paths (git status snapshot; e.g. `src/views/Dashboard 2.tsx`) that the include glob also matches — a working-copy condition, not repo content.
  3. `next-env.d.ts` is in the include list (tsconfig.json:27) but gitignored (.gitignore:18); it exists on disk (`ls next-env.d.ts` → present), so fresh clones lack it until a Next command regenerates it.
- ASSUMED: That the eslint `next/typescript` preset's parser reads this tsconfig for its type-aware settings (tool convention, not traced). That editors honor `plugins: [{ "name": "next" }]`.

## tailwind.config.ts

- Purpose: Tailwind CSS v3 configuration defining the shadcn CSS-variable color palette (including an 8-token sidebar group), radius scale, accordion keyframes/animations, class-based dark mode, and the content globs.
- Public surface: `export default { … } satisfies Config` (tailwind.config.ts:3, 91). Shape: `darkMode: ["class"]` (line 4); `content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"]` (line 5); `prefix: ""` (line 6); `theme.container` centered, padding 2rem, 2xl 1400px (lines 8-14); `theme.extend.colors` — `border`, `input`, `ring`, `background`, `foreground`, and DEFAULT/foreground pairs for `primary`, `secondary`, `destructive`, `muted`, `accent`, `popover`, `card`, all `hsl(var(--…))` (lines 16-49), plus `sidebar` with 8 sub-tokens mapped to `--sidebar-*` vars (lines 50-59); `borderRadius` lg/md/sm from `--radius` (lines 61-65); `keyframes`/`animation` accordion-down/up (lines 66-87); `plugins: [require("tailwindcss-animate")]` (line 90).
- Inputs & outputs: Inputs — source files matched by the content globs; CSS custom properties defined in src/index.css (L22): `--radius` at src/index.css:39, `--sidebar-background` at src/index.css:41 (light) and :89 (dark). Outputs — the generated utility CSS in the build. No stores, no env vars.
- Dependencies: uses -> `tailwindcss` type import (line 1, devDep package.json:102), `tailwindcss-animate` via `require` (line 90; runtime dep package.json:83). used by <- components.json:7 (`"config": "tailwind.config.ts"`); the tailwindcss PostCSS plugin registered in postcss.config.js:3 (auto-discovery — see ASSUMED); docs/system-reference/01-architecture.md:25 cites it (X02). No src references (grep-verified, unit header).
- Side effects: none at app runtime; `require` of tailwindcss-animate at config load.
- Error handling: none in the file.
- Tests: none.
- Observed issues:
  1. The first three content globs (`./pages`, `./components`, `./app`) match no directories — none exist at repo root (`ls -d pages components app` → all "No such file or directory"); all app code lives under `./src/**` (fourth glob).
  2. `@tailwindcss/typography` is installed (package.json:90) but not registered in `plugins` (tailwind.config.ts:90 lists only tailwindcss-animate), while `prose prose-sm … dark:prose-invert` classes are used at src/views/OfflineReview.tsx:146 (V02).
- ASSUMED: That the tailwindcss PostCSS plugin auto-discovers `tailwind.config.ts` at the project root (Tailwind v3 convention; postcss.config.js passes no explicit config path). That the unmatched globs are Vite-template leftovers.

## postcss.config.js

- Purpose: Registers the tailwindcss and autoprefixer PostCSS plugins, both with empty option objects.
- Public surface: CommonJS `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }` (postcss.config.js:1-6).
- Inputs & outputs: none of its own; plugin configuration for the CSS build. No stores, no env vars.
- Dependencies: uses -> names `tailwindcss` (devDep package.json:102) and `autoprefixer` (devDep package.json:96) as plugin keys. used by <- Next.js CSS pipeline by convention (see ASSUMED); docs/system-reference/01-architecture.md:58 cites it (X02). No src references and no other config references it (grep-verified, unit header).
- Side effects: none.
- Error handling: none.
- Tests: none.
- Observed issues: none.
- ASSUMED: That Next.js auto-loads `postcss.config.js` from the project root (framework convention; nothing in the repo references the file explicitly).

## components.json

- Purpose: shadcn/ui generator configuration recording style, Tailwind wiring, and import aliases for component scaffolding.
- Public surface: n/a (JSON for the shadcn CLI). Content: `$schema` ui.shadcn.com (line 2), `style: "default"` (line 3), `rsc: false` (line 4), `tsx: true` (line 5), `tailwind: { config: "tailwind.config.ts", css: "src/index.css", baseColor: "slate", cssVariables: true, prefix: "" }` (lines 6-12), `aliases: { components: "@/components", utils: "@/lib/utils", ui: "@/components/ui", lib: "@/lib", hooks: "@/hooks" }` (lines 13-19).
- Inputs & outputs: read by the shadcn CLI when generating components; points at tailwind.config.ts (this unit) and src/index.css (L22) — both exist (`ls src/index.css` → present); `utils` alias target src/lib/utils.ts exists (L18). No stores, no env vars.
- Dependencies: uses -> references tailwind.config.ts and src/index.css by path. used by <- no code references; only docs cite it (docs/system-reference/01-architecture.md:26, 51 — X02). The `@/…` alias values resolve through tsconfig.json:17-19. Not consumed at build or runtime (grep-verified absence in src; see ASSUMED for CLI).
- Side effects: none.
- Error handling: none.
- Tests: none.
- Observed issues:
  1. `rsc: false` (components.json:4) while the repo is a Next App Router app (`src/app/`, manifest A01–A09) — consistent with the vendored Vite-era origin of the ui kit noted for C01 (manifest.md:36).
- ASSUMED: That the shadcn CLI is the sole consumer, and only at development time when scaffolding components (no CLI invocation exists in package.json scripts, package.json:5-11).

## vitest.config.ts

- Purpose: Vitest configuration — node as default test environment with per-file jsdom opt-in, automatic JSX runtime, jest-dom setup file, and the `src/**` test include glob; self-described as "Layer (b) of the offline-hardening harness" (vitest.config.ts:3).
- Public surface: `export default defineConfig({...})` (vitest.config.ts:10-27) with `esbuild: { jsx: 'automatic' }` (line 13); `test: { environment: 'node', environmentOptions: { jsdom: { url: 'http://localhost:3000' } }, globals: true, setupFiles: ['./vitest.setup.ts'], include: ['src/**/*.test.{ts,tsx}'] }` (lines 14-23); `resolve.alias '@' → ./src` (lines 24-26).
- Inputs & outputs: Inputs — test files matched by the include glob: 76 tracked files (`git ls-files 'src/**/*.test.ts' 'src/**/*.test.tsx' | wc -l` → 76). Outputs — test run results for `npm test`. No stores, no env vars (env seeding happens in vitest.setup.ts).
- Dependencies: uses -> `vitest/config` (line 1), node `path` (line 2); names ./vitest.setup.ts (line 21, this unit). used by <- package.json:10-11 `"test": "vitest run"`, `"test:watch": "vitest"` (P01); docs/superpowers/plans/2026-06-11-site-health-marking-redesign.md:21-44 records its creation plan (X03). No src references (grep-verified, unit header).
- Side effects: none at app runtime.
- Error handling: none in the file.
- Tests: this file is the harness for all 76 test files; nothing tests the config itself. Per-file jsdom opt-in via `// @vitest-environment jsdom` docblock is used by exactly 10 files (grep-verified): src/components/SiteHealthBadge.test.tsx (C14), src/components/auth/useAuthSession.test.tsx (C02), src/components/fortress/AssetRegister.test.tsx (C06), src/hooks/useOfflineInspectionDetail.queueSave.test.tsx (H02), src/hooks/useOfflineInspectionDetail.selfHeal.test.tsx (H02), src/hooks/useOfflineSync.online.test.tsx (H01), src/hooks/useOfflineSync.queueRaces.test.tsx (H01), src/hooks/useOfflineSync.syncInspection.test.tsx (H01), src/lib/fileDownload.test.ts (L12), src/lib/onlineStatus.test.ts (L11).
- Observed issues:
  1. The header comment states "Component/hook tests (.test.tsx) run under jsdom … Pure-logic and IndexedDB-blob tests (.test.ts) stay on node" (vitest.config.ts:4-7), but the actual mechanism is the per-file docblock (no `environmentMatchGlobs` in the config), and two `.test.ts` files (src/lib/fileDownload.test.ts, src/lib/onlineStatus.test.ts) opt into jsdom — the extension-based description does not match usage.
  2. The include glob confines tests to `src/**` (vitest.config.ts:22); no test files exist outside src (supabase: 0, git ls-files-verified), so the F/D units have no coverage under this harness.
- ASSUMED: That `globals: true` is what lets test files use `describe`/`it`/`expect` without imports (vitest semantics, not traced per file).

## vitest.setup.ts

- Purpose: Test-run setup module that registers jest-dom matchers, seeds dummy Supabase env vars so the import-time-throwing client loads, and installs a Map-backed Web Storage polyfill when absent.
- Public surface: none exported; side-effect module. Internal `makeStorage(): Storage` (vitest.setup.ts:14-30) returning an object with `length` getter, `clear`, `getItem(k): string|null`, `key(i): string|null`, `removeItem(k)`, `setItem(k,v)` over a `Map<string,string>`, cast `as Storage`.
- Inputs & outputs: Inputs — existing `globalThis.localStorage`/`sessionStorage` and `window` presence. Outputs/mutations — `process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key'` (vitest.setup.ts:7-8); defines `localStorage`/`sessionStorage` on `globalThis` and, if `window` exists without them, on `window`, as `configurable`+`writable` properties (vitest.setup.ts:32-40). Stores touched: in-memory Map-backed Storage only.
- Dependencies: uses -> `@testing-library/jest-dom/vitest` (line 1; devDep package.json:91). used by <- vitest.config.ts:21 `setupFiles` (this unit) — sole consumer (grep-verified: no other reference to "vitest.setup" anywhere in src or configs).
- Side effects: process-env mutation and global-object property definition, once per test worker; no I/O, no network.
- Error handling: none — both installs are conditional (`||=` for env, `if (!(globalThis…)[key])` at line 33, `if … !window[key]` at line 36); nothing throws.
- Tests: runs before every one of the 76 test files. Its comments' claims verify: src/integrations/supabase/client.ts:8-10 (L19) does `throw new Error('Missing Supabase environment variables…')` at import time when the two env vars are absent; src/lib/offlineQueue.test.ts:6 (L11) does assign its own `localStorage` mock over the polyfill, which the `writable`+`configurable` flags permit (vitest.setup.ts:13, 35).
- Observed issues: none.
- ASSUMED: That under the jsdom opt-in files the polyfill is skipped for `window` because jsdom at `http://localhost:3000` (vitest.config.ts:19) provides real Web Storage — consistent with the config comment "jsdom gets a real origin so window.localStorage is available" (vitest.config.ts:8-9), not separately executed here.

## .gitignore

- Purpose: Git exclusion rules for logs, dependency and build output, env files, generated PWA artifacts, local notes, editor state, Supabase CLI state, and brainstorm artifacts.
- Public surface: n/a. Sections: logs (lines 1-8); `node_modules`, `node_modules 2/`, `dist`, `dist-ssr` (lines 10-13); Next.js `.next/`, `out/`, `next-env.d.ts`, `*.tsbuildinfo` (lines 15-19); env "added by audit" `.env`, `.env.local`, `.env.*.local` (lines 21-24); PWA generated `public/sw.js*`, `public/workbox-*.js*`, `public/worker-*.js*`, `public/swe-worker-*.js`, `public/fallback-*.js` (lines 26-34); `/tasks/` (line 37); editor `.vscode/*` with `!.vscode/extensions.json`, `.idea`, `.DS_Store`, `*.suo` etc., `.vercel` (lines 39-49); `supabase/.temp/`, `supabase/.branches/` (lines 51-53); `.superpowers/`, `.env*.local` (lines 55-57).
- Inputs & outputs: consumed by git's ignore machinery. Pattern-resolution evidence (`git check-ignore -v`, run 2026-07-29): `.env` → line 22; `.env.local` → line 57; `.env.development.local` → line 57; `tasks/x` → line 37; `public/sw.js` → line 27; `node_modules 2/x` → line 11.
- Dependencies: uses -> nothing. used by <- git (tooling); docs/AUDIT_BASELINE.md:84, 207 records the audit commit `5be49c7` that hardened it (X01); docs/security/2026-06-09-auth-access-security-audit.md:123 records the prior "L5 — .env is committed" finding (X05).
- Side effects: none.
- Error handling: n/a.
- Tests: none.
- Observed issues:
  1. Overlapping env patterns: `.env.local` (line 23) and `.env.*.local` (line 24) are both subsumed by the later `.env*.local` (line 57) — `git check-ignore -v` attributes `.env.local` and `.env.development.local` to line 57, making lines 23-24 shadowed for those paths.
  2. Literal `node_modules 2/` entry (line 11) — the `" 2"` duplicate-suffix phenomenon is old enough to have its own ignore rule (matches the 32 untracked `" 2"`-suffixed working-copy files in the git status snapshot).
  3. `!.vscode/extensions.json` (line 41) re-includes a file that does not exist in the repo (`git ls-files .vscode` → empty).
  4. `next-env.d.ts` is ignored (line 18) yet listed in tsconfig include (tsconfig.json:27); the file exists on disk but is untracked. Generated PWA output ignored by lines 27-34 is likewise present on disk (public/sw.js, 18,197 B).
- ASSUMED: nothing.

## .env.example

- Purpose: Environment-variable template documenting the three public Supabase settings and the optional Cloudflare Turnstile site key.
- Public surface: n/a. Variables: `NEXT_PUBLIC_SUPABASE_URL` (line 1), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (line 2), `NEXT_PUBLIC_SUPABASE_PROJECT_ID` (line 3), `NEXT_PUBLIC_TURNSTILE_SITE_KEY` empty (line 10) with a comment block stating captcha applies to /auth/login, /signup, /forgot-password; unset disables it; the secret key lives in Supabase Dashboard only (lines 5-9).
- Inputs & outputs: template only — never loaded by any tool; developers copy it to `.env`/`.env.local` (both gitignored, .gitignore:22-23, 57).
- Dependencies: uses -> nothing. used by <- (of the variables it documents, grep-verified): `NEXT_PUBLIC_SUPABASE_URL` read in src/integrations/supabase/client.ts:5 (L19), src/app/api/snapshots/capture/route.ts (A02), src/components/public/PublicIssueReportDialog.tsx (C06), src/lib/qrBaseUrl.ts + src/lib/qrBaseUrl.test.ts (L16); `NEXT_PUBLIC_SUPABASE_ANON_KEY` read in src/integrations/supabase/client.ts (L19) and seeded by vitest.setup.ts:7-8 (this unit); `NEXT_PUBLIC_TURNSTILE_SITE_KEY` read in src/components/CaptchaTurnstile.tsx (C16) and src/views/auth/Login.tsx (V05). The file itself is cited by docs/AUDIT_BASELINE.md:84, docs/system-reference/01-architecture.md:127-133, docs/system-reference/03-auth-and-access/auth-flows.md:400-401, docs/security/2026-06-09-auth-access-security-audit.md:123 (X01/X02/X05).
- Side effects: none.
- Error handling: n/a. (Downstream: missing URL/ANON_KEY makes src/integrations/supabase/client.ts:8-10 throw at import time.)
- Tests: none directly; vitest.setup.ts:7-8 exists specifically because of the two Supabase variables this file documents.
- Observed issues:
  1. `NEXT_PUBLIC_SUPABASE_PROJECT_ID` (line 3) has zero consumers: `grep -rn "SUPABASE_PROJECT_ID" src supabase vercel.json capacitor.config.ts` → 0 hits (also absent from package.json and next.config.mjs). Documented in docs/system-reference/01-architecture.md:133 as "project ref oltzgidkjxwsukvkomof" but referenced nowhere in code.
- ASSUMED: That developers consume this file manually (no dotenv-example tooling exists in package.json:5-11).
