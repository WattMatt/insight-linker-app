# 01 · Architecture & Environments

**Status:** Verified from config/code. Cross-references the other chapters (02–07) for depth.
**Charter:** ground truth only; inferences marked ⚠️ UNVERIFIED.

This chapter maps the stack, the prod topology, the module layout, and the deploy
process — the "where does everything live and how is it wired" layer. It does not
re-document schema (→ [02](02-data-model/)), auth (→ [03](03-auth-and-access/)),
routes (→ [04](04-routes/)), edge functions (→ [05](05-edge-functions/)), flows
(→ [06](06-flows/)), or components/hooks/lib (→ [07](07-components-hooks-lib/)).

---

## 1. Stack & runtime

| Layer | Tech | Version | Evidence |
|---|---|---|---|
| Framework | Next.js **App Router** | `^15.3.0` | `package.json:65` |
| UI runtime | React | `^18.3.1` | `package.json:70-72` |
| Language | TypeScript | `^5.8.3` | `package.json:95`, `tsconfig.json` |
| Backend | Supabase (`@supabase/supabase-js`) | `^2.75.0` | `package.json:46` |
| Native shell | Capacitor (core/android/ios/cli/camera) | `^7.x` | `package.json:12-16` |
| PWA / service worker | `@ducanh2912/next-pwa` (Workbox) | `^10.2.9` | `package.json:17`, `next.config.mjs:1,24` |
| Server state | `@tanstack/react-query` | `^5.83.0` | `package.json:47`, `providers.tsx:3,14` |
| Styling | Tailwind CSS 3 + `tailwindcss-animate` | `^3.4.17` | `package.json:94`, `tailwind.config.ts` |
| Components | shadcn/ui over Radix primitives | — | `components.json`, `package.json:19-45` |
| Forms / validation | react-hook-form + zod + `@hookform/resolvers` | — | `package.json:18,73,83` |
| Charts | recharts | `^2.15.4` | `package.json:77` |
| Toasts | sonner + radix-toast (`use-toast`) | — | `providers.tsx:4-6` |
| PDF/doc engines | `jspdf`, `pdfmake`, `pdfjs-dist`, `react-pdf`, `docx-preview`, `html2canvas`, `fabric` | — | `package.json:56-76` |
| Image handling | `heic2any`, `@capacitor/camera` | — | `package.json:13,59` |
| Password strength | `@zxcvbn-ts/*` | — | `package.json:49-51`, `src/lib/password-strength.ts` |

### Runtime configuration notes

- **`NODE_OPTIONS='--require ./server-polyfills.js'`** prefixes `dev`/`build`/`start`
  (`package.json:6-8`) and the Vercel `buildCommand` (`vercel.json:4`).
  `server-polyfills.js` shims browser-only globals (`DOMMatrix`, `Path2D`) into Node
  so `pdfjs-dist` can be imported in build/server workers (`server-polyfills.js:1-20`).
  The same polyfill block is duplicated inline at the top of `next.config.mjs:4-22`.
- **Build-error suppression (audit baseline):** `typescript.ignoreBuildErrors: true`
  and `eslint.ignoreDuringBuilds: true` (`next.config.mjs:99-100`). The inline comment
  states ~109 strict-mode type errors and an eslint-config issue remain post-Vite
  migration (`next.config.mjs:97-98`). Type-/lint-failures therefore **do not** block
  a build. Tracked as **[GAPS.md](GAPS.md) G-TEST-04** (baseline ratchet).
- **`serverExternalPackages`** + a webpack `externals`/`canvas: false` alias keep
  `fabric`, `canvas`, `pdfmake`, `jspdf`, `html2canvas` out of the server bundle
  (`next.config.mjs:102,130-139`).
- **`reactStrictMode: true`** (`next.config.mjs:95`).
- **shadcn config:** `style: default`, `rsc: false`, `baseColor: slate`, CSS variables,
  no class prefix; aliases `@/components`, `@/lib`, `@/hooks` (`components.json`).
  `tsconfig.json:17-19` maps `@/*` → `./src/*`.
- **TS config:** `strict: true`, `noImplicitAny: true`, `moduleResolution: bundler`,
  `jsx: preserve`, `noEmit: true`; `supabase/` is **excluded** from the app tsconfig
  (`tsconfig.json:28`) — edge functions are Deno, compiled separately.
- **ESLint** is flat-config (`eslint.config.js`) with `js.recommended` +
  `typescript-eslint` + `react-hooks`; `no-unused-vars: warn`. (`npm run lint` →
  `next lint`, `package.json:9.) PostCSS = tailwind + autoprefixer (`postcss.config.js`).

### PWA / offline caching (Workbox runtime rules — `next.config.mjs:24-91`)

| Cache | URL pattern | Strategy | TTL / entries |
|---|---|---|---|
| `supabase-api-cache` | `*.supabase.co/rest/*` | NetworkFirst | 24h / 100 |
| `supabase-images` | `*.supabase.co/storage/*` | CacheFirst | 7d / 200 |
| `google-fonts` | `fonts.g{static,oogleapis}.com/*` | CacheFirst | 1y / 20 |
| `cdn-assets` | `cdnjs.cloudflare.com/*` | CacheFirst | 30d / 30 |

`register:true`, `skipWaiting:true`, `clientsClaim:true`, 5 MB max cache size;
**disabled in development** (`disable: NODE_ENV === "development"`, `next.config.mjs:28`).
Generated `sw.js`/`workbox-*.js`/`worker-*.js` are git-ignored (`.gitignore`).
The PWA manifest is `/manifest.json`, declared in `src/app/layout.tsx:9`.

### Capacitor (native Android/iOS)

`capacitor.config.ts`:
- `appId: com.wattmatt.compliance`, `appName: wm-compliance`, `webDir: out`.
- **`server.url: https://insight-linker-app.vercel.app`** with `cleartext: true` — the
  native shell is a **thin WebView wrapper that loads the live Vercel deployment**, not
  a bundled static export. (`webDir: out` is the static-export dir but the live `url`
  overrides it at runtime.)
- Camera plugin requests `photos: 'limited'` on first use (`capacitor.config.ts:11-17`).
- Android setup/permissions docs at repo root: `android-camera-setup.md`,
  `android-permissions.md`; offline-on-mobile notes in `MOBILE_OFFLINE_SETUP.md`.

> ⚠️ UNVERIFIED: whether iOS/Android projects are actively built/shipped — there is no
> `android/` or `ios/` native project dir in the repo root, only Capacitor config + npm
> deps. The WebView-loads-Vercel model means the "app" is the web app.

---

## 2. Topology

```
 Capacitor WebView (Android/iOS) ─┐
 PWA / browser ───────────────────┼──▶ Vercel (Next.js 15, region iad1)
                                   │      ├─ App Router pages / client components
                                   │      └─ (no Next API routes; backend is Supabase)
                                   │
                                   └──▶ Supabase project oltzgidkjxwsukvkomof "WM Compliance"
                                          ├─ Postgres + RLS  (chapter 02)
                                          ├─ Auth / GoTrue   (chapter 03)
                                          ├─ Storage buckets (02 + G-SEC-14)
                                          └─ 26 Edge Functions (chapter 05)
                                               └─▶ external: Resend, Gmail SMTP,
                                                   PDFShift, Browserless, Google
                                                   service account, DocBuilder, Anthropic
```

### Hosting

| Concern | Value | Evidence |
|---|---|---|
| Web host | Vercel, framework `nextjs`, region **`iad1`** | `vercel.json` |
| Install command | `npm install` | `vercel.json:5` |
| Build command | `NODE_OPTIONS='--require ./server-polyfills.js' next build` | `vercel.json:4` |
| Prod URL | `https://insight-linker-app.vercel.app` | `capacitor.config.ts:8` |
| Supabase project | **`oltzgidkjxwsukvkomof`** ("WM Compliance") | `supabase/config.toml:1`, `next.config.mjs:108` |
| Storage host (image allowlist) | `oltzgidkjxwsukvkomof.supabase.co/storage/**` | `next.config.mjs:104-112` |

> Vercel CLI is **not** linked in this repo (`.vercel` git-ignored). Prior review note:
> the local Vercel CLI is authed as a different account (`arno-7196`) — see
> [GAPS.md](GAPS.md) G-SEC-02/05. This blocks reading prod env values from the CLI.

### Environment variables (names only — values never recorded)

Client (`NEXT_PUBLIC_*`, embedded in bundle). Source: `.env` / `.env.example`.

| Var | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `src/integrations/supabase/client.ts:5` | throws if missing (`client.ts:8-9`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `client.ts:6` | throws if missing |
| `NEXT_PUBLIC_SUPABASE_PROJECT_ID` | `.env`, `.env.example` | project ref `oltzgidkjxwsukvkomof` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `src/components/CaptchaTurnstile.tsx:20` | **unset → captcha silently disabled** (`CaptchaTurnstile.tsx:21,104`); empty in local `.env` per G-SEC-02 |

Tooling-only (in `.env`, not the bundle): `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`,
`SUPABASE_ACCESS_TOKEN`, `DOCBUILDER_PUBLIC_TOKEN`.

Server-side / **edge-function** secrets (set in Supabase, not Vercel; extracted from
`Deno.env.get(...)` across `supabase/functions/`):

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `RESEND_API_KEY`,
`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `PDFSHIFT_API_KEY`, `BROWSERLESS_API_KEY`,
`GOOGLE_SERVICE_ACCOUNT_JSON`, `ANTHROPIC_API_KEY`, `LOVABLE_API_KEY`,
`DOCBUILDER_PUBLIC_TOKEN`, `DOCBUILDER_SYNC_KEY`, `DOCBUILDER_WEBHOOK_URL`.
(See [05-edge-functions/](05-edge-functions/) for which function uses which.)

The Supabase browser client (`integrations/supabase/client.ts:15-21`) is a singleton
constructed with the anon key only, `persistSession`/`autoRefreshToken` on, session
stored in `window.localStorage`. **No SSR/server Supabase client and no service-role key
exists in the Next.js layer** — every privileged operation goes through an edge function.

### Captcha topology (`CaptchaTurnstile.tsx`)

`CAPTCHA_ENABLED = Boolean(SITE_KEY)`. The client widget is **defense-in-depth only**;
the comment (`CaptchaTurnstile.tsx:16-18`) states the real gate is Supabase
project-level captcha enforcement (Dashboard → Auth → Captcha protection, with the
Turnstile **secret** key, which lives in Supabase only — `.env.example` notes). Whether
prod enforcement is actually on is **open** — [GAPS.md](GAPS.md) G-SEC-02.

---

## 3. Module map

The app is a **Vite→Next migration**: the original SPA's `src/views`, `src/components`,
`src/hooks`, `src/lib` were preserved; `src/app/` was added as the App-Router shell, and
a `navigation.tsx` shim lets the legacy tree keep importing react-router APIs unchanged.

```
src/
  app/            App Router shell — route groups + layouts; thin, mostly re-exports views
  views/          51 page-level screens (the real page bodies; .tsx)        → ch.04/07
  components/     166 components incl. vendored shadcn ui/                   → ch.07
  hooks/          22 hooks incl. the offline + PDF families                 → ch.07
  lib/            47 lib files: report/PDF generators, offline DBs,
                  navigation shim, validation, compliance calc              → ch.07
  integrations/
    supabase/
      client.ts   the singleton browser client (anon key)
      types.ts    generated DB types (⚠️ stale — G-OPS-01)
  index.css       Tailwind base + CSS-variable theme tokens
  types/          shared app types
supabase/
  config.toml     project_id + per-function verify_jwt flags
  functions/      26 Deno edge functions                                    → ch.05
  migrations/     142 SQL migrations (effective schema)                     → ch.02
```

### `src/app` route groups (`src/app/`)

| Group / dir | Access context | Layout |
|---|---|---|
| `(admin)/` | staff console (dashboard, clients, inspections, templates, calendar, feedback-management, offline-review…) | `(admin)/layout.tsx` |
| `(client-portal)/` | client read view | `(client-portal)/layout.tsx` |
| `(contractor)/` | contractor view | `(contractor)/layout.tsx` |
| `auth/` | login, signup, forgot-/reset-/set-password | — |
| `public/` | `clients/`, `subsections/` — public/QR-reachable | — |
| `review/[token]` | tokenized COC review | — |
| `portfolio/[token]` | tokenized portfolio share | — |
| `download/[requestId]` | doc download handoff | — |
| `install/` | PWA install page | — |
| `page.tsx`, `not-found.tsx`, `layout.tsx`, `providers.tsx` | root | — |

Route-group access mapping is detailed in [04-routes/](04-routes/) and the access-context
model in [03-auth-and-access/access-contexts-and-roles.md](03-auth-and-access/access-contexts-and-roles.md).
`next.config.mjs:114-123` declares 6 permanent redirects (legacy → consolidated routes).

### Provider tree (`src/app/providers.tsx`)

Root `layout.tsx` wraps everything in `<Providers>`, which nests (outer→inner):
`ErrorBoundary` → `QueryClientProvider` → `TooltipProvider`, alongside global singletons
`Toaster`, `Sonner`, `HelpButton`, `NotificationListener`, `VerificationListener`,
`OfflineIndicator`, `SessionWatcher` (`providers.tsx:16-33`). `QueryClient` is a single
module-level instance (`providers.tsx:14`). These global components are documented in
[07-components-hooks-lib/](07-components-hooks-lib/).

### The react-router → App-Router shim (`src/lib/navigation.tsx`)

A compatibility layer so migrated components import navigation from `@/lib/navigation`
instead of `react-router-dom` (`navigation.tsx:3-6`). It re-implements, over
`next/navigation` + `next/link`:

| Legacy API | Mapped to | Lines |
|---|---|---|
| `useNavigate()` | `router.push/replace/back/forward` | `:21-39` |
| `useParams()` | `useNextParams()` | `:42-45` |
| `useSearchParams()` (tuple) | next searchParams + `router.replace` | `:51-82` |
| `useLocation()` | `usePathname` + `useSearchParams` | `:86-100` |
| `Link` / `NavLink` / `Navigate` | `next/link` + active-state / effect-redirect | `:110-177` |

### Offline / IndexedDB layer (`src/lib/offline*.ts` + `src/hooks/useOffline*`)

DB name **`wm_compliance_offline`**, **version 4** (`offlineDB.ts:2-7`). v4 unified the
formerly-conflicting `offlineDB`(v3) and `offlineInspectionDB`(v2) onto one DB/version
to stop `VersionError`/missing-store crashes (`offlineDB.ts:3-6`). Files:
`offlineDB.ts`, `offlineDBExtensions.ts`, `offlineInspectionDB.ts`,
`offlineFloorPlanDB.ts`; hooks `useOfflineSync`, `useOfflineInspections`,
`useOfflineInspectionDetail`, `useOfflineSubsections`, `useOfflinePhotos`,
`useOfflineFloorPlanAnnotations`. Sync flow → [06-flows/offline-sync.md](06-flows/offline-sync.md);
per-symbol docs → [07-components-hooks-lib/](07-components-hooks-lib/).

### Backend = edge functions + RPCs (not Next API routes)

There are **no `src/app/**/route.ts` API handlers** — the Next layer is purely
client-rendered pages talking to Supabase. The backend is:
- **26 Deno edge functions** (`supabase/functions/`), per-function JWT verification in
  `supabase/config.toml` (e.g. `qr-redirect`/`templates`/`generate-pdf*`/`log-auth-event`
  = `verify_jwt = false`; `invite-user`/`delete-user`/`validate-coc` = `true`). Full
  auth/IO model → [05-edge-functions/](05-edge-functions/).
- **Postgres RPCs/functions + RLS** invoked via `supabase.rpc(...)` / PostgREST from the
  client → [02-data-model/](02-data-model/).

---

## 4. Build & deploy

**Normal path:** push to GitHub → Vercel builds with the `vercel.json` command (region
`iad1`) → native Capacitor shells load the resulting Vercel URL at runtime
(`capacitor.config.ts:8`). Migrations and edge functions are deployed to Supabase
**separately** (Supabase CLI / dashboard), not by the Vercel build.

### Deploy gotchas (from [GAPS.md](GAPS.md) + `docs/security/` prior reviews)

| # | Gotcha | Evidence |
|---|---|---|
| 1 | **Migrations applied via dashboard drift from `supabase/migrations/`.** Live DB has objects in no migration file (e.g. `inspections.deleted_at`, `snags.*`, a `*_snap_20260421` backup table). Caused G-SEC-11 (anon-open tables missed by lockdowns). | G-OPS-01 (GAPS.md:188-195) |
| 2 | **`types.ts` is stale** vs the live schema (predates `auth_events`; ~4 known `.rpc()` type errors). Regeneration is a manual, easily-skipped step. | G-OPS-01, G-TEST-02 (GAPS.md:146-148) |
| 3 | **Preview builds fail:** `NEXT_PUBLIC_SUPABASE_*` are **Production-scoped only**, so Vercel preview deployments lack them and `client.ts:8-9` throws. | G-TEST-05 (GAPS.md:160) |
| 4 | **Vercel CLI account mismatch:** repo isn't `vercel link`ed; local CLI authed as `arno-7196`; Supabase CLI token isn't a PAT (no Management-API path). Blocks reading/setting prod env from the desktop. | G-SEC-01/02/05 (GAPS.md:19,45) |
| 5 | **Prod-applied SQL outside the migrations dir** is part of effective state and must be cited explicitly (e.g. `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`). Two `PENDING-*.sql` files await dashboard apply. | 00-INDEX.md:55, `docs/security/` |
| 6 | **Unversioned prod edge functions** existed (7, incl. the critical `create-user-admin`) with source NOT in repo — pulled & deleted during review. Deploys of edge fns are out-of-band from Vercel. | G-SEC-08/09 (GAPS.md:89-99) |
| 7 | **No CI** (`.github/workflows/` absent) — typecheck/lint/test/schema-drift all manual; `ignoreBuildErrors`/`ignoreDuringBuilds` mean a broken build still ships. | G-TEST-04/05 (GAPS.md:154-160) |
| 8 | **Secrets have transited the desktop** during deploys (`docbuilder-token.txt`); no gitleaks. | G-TEST-07 (GAPS.md:165-166) |

---

## 5. Cross-cutting concerns

| Concern | Summary | Where it lives |
|---|---|---|
| **Auth / RLS model** | Anon-key browser client + GoTrue sessions; **5 access contexts**; the prod RLS model has **no tenant/role isolation** ("any authenticated" can cross tenants) — critical architectural finding. | [03-auth-and-access/](03-auth-and-access/) · **G-SEC-13** |
| **Public self-registration** | Prod GoTrue allows public signup; new users get role `User` which has manage-all policies → anyone can read/write all tenants. | **G-SEC-01** (GAPS.md:17-19) |
| **Storage buckets** | Public buckets with anon read **and write** ("Anyone can upload/update/delete to all storage"); lockdown SQL written, awaiting dashboard apply. | [02-data-model/triggers-enums-storage.md](02-data-model/triggers-enums-storage.md) · **G-SEC-14** |
| **Marking / compliance source-of-truth** | Compliance scoring/calculation centralised in `src/lib/complianceCalculations.ts`; COC validation chain in the `validate-coc`/`extract-coc` edge fns. | [06-flows/coc-validation.md](06-flows/coc-validation.md), [06-flows/inspection-lifecycle.md](06-flows/inspection-lifecycle.md) |
| **Offline sync** | IndexedDB `wm_compliance_offline` v4 (§3) feeds a queue/flush sync path; offline edge fns (`offline-review`, `qr-redirect`) are `verify_jwt = false`. | [06-flows/offline-sync.md](06-flows/offline-sync.md) |
| **PDF generation** | **5 server generators** (`generate-pdf*`, `generate-docx-report`, `generate-inspection-pdf`) + client `lib/*ReportGenerator.ts` / pdfmake/jspdf paths. | [06-flows/pdf-report-pipeline.md](06-flows/pdf-report-pipeline.md) |
| **Schema/types drift** | Live DB ≠ migrations; `types.ts` stale (§4 #1–2). | **G-OPS-01**, **G-TEST-02** |
| **Dead-code surface** | Large zero-caller surface incl. the orphaned `src/lib/pdf/` OCR pipeline. | **G-OPS-03** ([07-…/FINDINGS-phase4.md](07-components-hooks-lib/FINDINGS-phase4.md)) |

Full security inventory: [GAPS.md](GAPS.md) (register),
[SECURITY-FINDINGS-phase2.md](SECURITY-FINDINGS-phase2.md),
[SECURITY-FINDINGS-phase3.md](SECURITY-FINDINGS-phase3.md).

---

## Open questions (architecture-specific)

1. Are native Android/iOS apps actually built/distributed, or is the "app" just the
   Capacitor-WebView-over-Vercel + PWA? No `android/`/`ios/` project dirs in repo.
2. Are the `NEXT_PUBLIC_SUPABASE_*` vars set for **Preview** scope in Vercel, or do
   preview deploys remain broken (G-TEST-05)? Not verifiable from repo (CLI not linked).
3. Is Turnstile enforcement actually on in the Supabase dashboard for prod, and is
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` set in Vercel Production? (G-SEC-02 open.)
4. Does the Vercel build run any Supabase migration/types step, or is all DB deploy fully
   out-of-band (the G-OPS-01 drift suggests the latter)? ⚠️ UNVERIFIED.
