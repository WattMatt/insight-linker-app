# insight-linker-app — Senior-Engineer Architecture Audit

> Date: 2026-05-28
> Codebase: `/Users/spud/Documents/DEVELOPER/WEB_REPOS/insight-linker-app` (374 TS/TSX files, 102,365 LOC)
> Audit scope: code-quality, scalability, maintainability. **No functional changes proposed.**
> Companion app: ECompliance iOS (see its own [`ARCHITECTURE_AUDIT.md`](../../Volumes/Extreme%20SSD/DEVELOPER/ECompliance/ARCHITECTURE_AUDIT.md)).
> Shared Supabase project: `oltzgidkjxwsukvkomof` (WM Compliance).

---

## 0. TL;DR for the next engineer

This is a Next.js 14 App-Router web app for SA electrical-compliance inspections, sibling to the ECompliance iOS app. It's production. It works. But three things shape every file you'll touch:

- **Next.js was treated as React + a router.** 74 `"use client"` directives, **zero `"use server"` actions**, and every page fetches directly from Supabase in a client component. The Server Components / Server Actions surface area of Next 14 is unused. SSR/streaming benefits are gone.
- **There are no tests.** Zero. Not "a few stale ones" like the iOS app — literally zero `.test.ts` / `.spec.ts` files across 374 source files. Every refactor is a guess.
- **TypeScript strict mode is on, but 131 `as any` casts plus 16 `as unknown` casts route around it.** The Supabase-generated `types.ts` is 3,848 lines (largest file in the repo) but the codebase has stopped trusting it.

Plus the same patterns the iOS audit flagged: mega-views (2,800+ lines), a god-hook (`useSubsectionDetail.ts` at 1,751 lines), a PDF-generation cluster that's been rewritten 3+ times (`pdfEngine` + `pdfMakeUtils` + `pdfmakeInspectionReport` + 4 edge functions named `generate-pdf*`), and iCloud littering the repo with " 2" duplicate files.

None of this prevents shipping. All of it slows you down and produced exactly the kind of incident the Stage 1-4 data-integrity audit caught last week. The refactor plan below is incremental — each step ships independently, none change behavior, they compound.

---

## 1. Reverse-engineered architecture (current state)

### 1.1 Stack

```
Framework        Next.js 14 (App Router) + React 18
Styling          Tailwind + shadcn/ui (Radix primitives)
Data layer       Supabase JS SDK directly from React components
Server queries   @tanstack/react-query (TanStack Query)
Mobile           Capacitor (iOS + Android wrappers)
PDF              pdfmake / pdfkit / browserless / google — multiple parallel attempts
Deploy           Vercel (production env vars only — preview vars never set)
History          De-Lovabled (recent commits strip Lovable artifacts)
```

### 1.2 Route map

```
src/app/
  (contractor)/          ← contractors: inspectors with field work
    contractor/
      inspections/
      inspections/[id]/
      subsections/
      subsections/[id]/

  (client-portal)/       ← clients: read-only-ish view of their compliance state
    client-portal/
      calendar/
      sites/
      sites/[id]/
      subsections/
      subsections/[id]/

  auth/                  ← signup / login / forgot / reset / set password
  public/                ← token-gated public client portfolios + sites + subsections
  download/[requestId]   ← signed download tokens
  review/[token]/...     ← reviewer flow with token gating
  portfolio/[token]/...  ← portfolio-share flow with token gating
  install/               ← PWA / Capacitor install instructions
```

**4 distinct user contexts (contractor, client-portal, public, review/portfolio) — same domain objects, four parallel UIs.** This is the biggest source of duplication in the codebase.

### 1.3 Component organisation

```
src/
  app/                   ← Next.js App Router pages (52 page.tsx)
  views/                 ← screen-level components (51 files; pages import from here)
  components/            ← shared UI building blocks (60 components)
    ui/                  ← shadcn primitives
    auth/                ← auth-flow components
    settings/            ← settings UI cluster
    pdf-preview/         ← PDF preview UI cluster
    site/                ← site-specific cluster
  hooks/                 ← 22 hooks (data + UI state)
  lib/                   ← library code (PDF generators, utilities)
  integrations/supabase/ ← supabase client + generated types
  types/                 ← shared types
```

**The `views/` ↔ `components/` distinction is real and useful** (views = screens, components = building blocks). It's one of the few clean architectural choices in the codebase. Preserve it.

### 1.4 Data flow — the actual graph

```
┌──────────────────────────────────────────────────────────┐
│  Next.js App Router page.tsx                             │
│  (e.g. app/(contractor)/contractor/inspections/[id]/     │
│  page.tsx → imports a view from src/views/)              │
└────────────────────────┬─────────────────────────────────┘
                         │ "use client" — runs in browser
                         ▼
┌──────────────────────────────────────────────────────────┐
│  View component (e.g. InspectionDetail.tsx — 2,834 lines)│
│  - Uses TanStack Query: useQuery({...})                  │
│  - Calls supabase.from('inspections').select(...)        │
│  - Renders shadcn/ui primitives                          │
│  - Local state for forms / modals                        │
└────────────────────────┬─────────────────────────────────┘
                         │ direct Supabase JS call from browser
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Supabase (PostgREST + Storage + Auth + Realtime)        │
│  - RLS gates by auth.uid()                               │
│  - 25 Edge Functions for non-RLS-able operations:        │
│    generate-pdf*, compress-image*, extract-coc,          │
│    detect-schematic-regions, invite-user, send-email,    │
│    qr-redirect, oauth-token, etc.                        │
└──────────────────────────────────────────────────────────┘
                         ▲
                         │ Service-role keys live ONLY in edge
                         │ functions; client uses anon key.
```

**Critical observation: there's no Next.js server tier in this graph.** The Next.js server only serves the React shell + static assets. All business logic runs in the browser OR in Supabase edge functions. Two consequences:

1. **No server-side validation layer.** Browser hits Supabase directly via PostgREST. RLS is the only gate. Anything PostgREST can't enforce (cross-table consistency, multi-step transactions, derived-field validation) just isn't enforced — and contributed to the Stage 1 data-integrity incidents.
2. **No incremental static regeneration, no streaming, no server data fetches.** Pages can't preload data in Node — every page hits Supabase from the user's browser after the JS bundle loads. Slow TTFB-to-interactive even for read-mostly pages like contractor dashboards.

### 1.5 Concurrency / async patterns

- **TanStack Query** for server state (41 `useQuery` / `useMutation` sites).
- **`useState` + `useEffect`** for client state.
- **`supabase.auth.onAuthStateChange`** subscriptions in several hooks.
- **No `useTransition`, no Suspense boundaries, no streaming.** All loading states are imperative (`isLoading ? <Skeleton /> : <Content />`).

The TanStack Query layer is well-used and consistent. The Suspense/streaming primitives Next 14 offers are not.

### 1.6 Type safety

`tsconfig.json` has `"strict": true`, `"strictNullChecks": true`, `"noImplicitAny": true`. Yet:

- **131 `as any` casts** in `src/**`. Most occur when:
  - Calling `supabase.from('new_table')` where `new_table` isn't in `Database` types yet (I wrote one of these myself this week in `useUnresolvedOrphans.ts`).
  - Reading jsonb columns that the generated types declare as `Json` (uselessly broad).
  - Working around Supabase JS chained generics that have known TS limitations.
- **16 `as unknown` casts** — usually a step BETWEEN `any` and a typed cast, the recommended bridge pattern but evidence of the same root issue.

The Supabase-generated `types.ts` is 3,848 lines (the largest file in the repo). It exists. It's just bypassed regularly because regenerating it after every server-side migration is friction nobody has automated.

### 1.7 Deployment

- **Vercel.** Production env vars for `NEXT_PUBLIC_SUPABASE_*` are set; preview env vars are NOT, so every PR's preview deploy fails at prerender with "Missing Supabase environment variables". Discovered during the Stage 4b orphan-resolution PR.
- **`server-polyfills.js` + `next.config.mjs`** both contain Node polyfills for `DOMMatrix` / `Path2D` (needed by `pdfjs-dist` for server-side PDF parsing). Duplicated code. The polyfill loader has a known fragility on local `node_modules` drift (saw `polyfills is not a function` errors locally; Vercel CI works).

### 1.8 PDF generation — the smoking gun

`src/lib/pdfEngine.ts` (1,124) + `pdfmakeInspectionReport.ts` (1,650) + `pdfMakeUtils.ts` (760) + `siteSummaryRenderSpec.ts` (937) + `assetVerificationReportGenerator.ts` (808) + `SiteSummaryReport.tsx` (808) + 4 PDF edge functions (`generate-pdf`, `generate-pdf-browserless`, `generate-pdf-google`, `generate-pdf-pdfmake`) = **~6,000+ LOC across multiple paths for the same goal: produce a PDF report**. This is by far the most stale, churned cluster in the codebase.

---

## 2. Critical problem areas (ranked by impact × probability of breaking something)

| # | Severity | Problem | Why it matters |
|---|---|---|---|
| 1 | **Critical** | **Zero tests.** Not "sparse" like iOS — literally none. | Every refactor is dead-reckoning. Stage 1 caught 233 orphans because we audited the database, not the code. A test suite would have caught the empty `inspector_id` from iOS earlier and the orphan-name fallback's narrow strictness. |
| 2 | **High** | **Pure client-side data fetching from React components.** Zero Server Actions, Zero Server Components for data fetching. | Slow TTFB on every page. No server-side validation layer. No way to enforce cross-table invariants in the request path — only RLS gates. PostgREST does the heavy lifting; Next.js does layout. |
| 3 | **High** | **God-view + god-hook**: `InspectionDetail.tsx` 2,834 lines, `useSubsectionDetail.ts` 1,751 lines | The hook is where the Stage 1 audit found the orphan-name fallback (lines 366-399). Touching it is risky. Pages that import it pay full re-render cost on any state change. |
| 4 | **High** | **PDF generation is duplicated 3-5 ways** across `lib/` + 4 edge functions | Adding a new report variant means picking which of 4 PDF paths to extend. Each path has its own template logic, font handling, image embedding. ~6,000 LOC of mostly-duplicate code. |
| 5 | **Medium-High** | **131 `as any` casts** bypass strict TS | Type checker can't catch the Stage 4b-class bugs (DTO drift). Every `as any` is a place where future-you (or future-me) will silently miss a renamed column or a removed field. |
| 6 | **Medium-High** | **4 parallel UI contexts for the same domain** (contractor, client-portal, public, review/portfolio) | Every domain feature gets implemented 1-4 times depending on visibility rules. `PublicSubsectionReview` (1,397), `ClientPortalSubsectionDetail` (1,029), the contractor variant in `subsection-detail/`, and `review/[token]/subsection/[id]/page.tsx` are all rendering the same subsection with different read paths and slightly different fields. |
| 7 | **Medium-High** | **No Server Actions** means mutations have no server-side validation/audit layer | Inspectors hit `supabase.from('inspections').update(...)` directly from the browser. RLS prevents unauthorised writes but doesn't enforce business rules (e.g. "Completed inspections require a subsection" — the rule that took Stage 4c-4 a full TDD cycle to add iOS-side). The web app has NO such gate. |
| 8 | **Medium** | **iCloud-on-git plague** — 24 " 2" duplicate files in src/, 39 total untracked | Same as iOS audit. `git status` is unreadable. Every commit risks pulling iCloud junk. |
| 9 | **Medium** | **74 `"use client"` directives across 374 files** + zero Server Components | Reasonable for an interactive PWA but a missed optimisation. Read-mostly pages (dashboards, portfolios, public review screens) could ship far less JS to the browser. |
| 10 | **Medium** | **`server-polyfills.js` + `next.config.mjs` duplicate polyfill logic** | Two copies of the same `DOMMatrix` / `Path2D` polyfills. Already produced a local-build failure during Stage 4b work. |
| 11 | **Medium** | **Vercel Preview env vars not configured** | Every PR's preview deploy fails. Code-review process can't visually verify changes. Forces "merge to main and test in prod" workflow. |
| 12 | **Medium** | **Auto-generated `Database` types are bypassed by ad-hoc `as any` instead of regenerated after migrations** | The generated file exists. The discipline of running `supabase gen types typescript --project-id …` after every migration doesn't. |
| 13 | **Low-Medium** | **No Suspense boundaries, no streaming, no `useTransition`** | Forces every loading state to be `isLoading ? Skeleton : Content`. Couldn't use the streaming-UI features Next 14 was built for. |
| 14 | **Low** | **Two notification listeners** (`NotificationListener.tsx`, `VerificationListener.tsx`) | Likely duplicate realtime subscriptions. Worth a quick consolidation pass. |

---

## 3. Refactoring strategies (per problem, sequenced)

### Strategy 1 — Establish a test baseline. Today.

**Why first.** Every other refactor below is risky without it. This is the single highest-leverage change for the codebase.

**Target shape.**

```jsonc
// package.json — add Vitest + Testing Library
{
  "scripts": {
    "test": "vitest",
    "test:ci": "vitest run --coverage"
  },
  "devDependencies": {
    "vitest": "^2",
    "@vitest/coverage-v8": "^2",
    "@testing-library/react": "^16",
    "@testing-library/jest-dom": "^6",
    "jsdom": "^25"
  }
}
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/node_modules/**', '**/*.test.*', 'src/integrations/supabase/types.ts'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest'
// Mock the supabase client by default so tests are deterministic.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { /* manually stub the surface tests need */ },
}))
```

**First five tests to write** (each ~30 lines, ~30 min total):

1. **`useUnresolvedOrphans.test.ts`** — the hook we shipped this week. Mock the view + RPC, assert query key is stable, assert resolve+archive mutations call the right RPCs.
2. **`useUserRole.test.tsx`** — the role hook gates the entire contractor/client routing. Test: returns null when unauthenticated; returns role from `user_roles` when authenticated.
3. **`useSubsectionDetail.test.ts`** — the 1,751-line god-hook contains the orphan-name fallback (lines 366-399). Lock its current behavior in a test before touching it: with a subsection and 3 inspections (2 strict-match, 1 name-match orphan), the fallback should attach the orphan.
4. **`ProtectedRoute.test.tsx`** — redirects logic. Each role lands on the right path.
5. **`OrphanResolutionModal.test.tsx`** — the modal we just shipped to production. Mock the view to return 2 rows; assert the modal opens; click Save on row 1; assert resolve_my_orphan called; assert modal stays open until row 2 also clears.

**Migration steps.**

1. Install vitest + config. Single PR. CI step `npm run test:ci`.
2. Add the 5 tests above. One PR each. Each makes the next refactor safer.
3. Set the convention: every PR after this either adds a test for the code it touches or explicitly justifies "this PR is type-only / pure rename".

**Risk profile.** None. Adding tests can't break runtime code.

### Strategy 2 — Convert read-mostly pages to React Server Components

**Why second.** Now there's a test net to catch regressions. The biggest visible win for users.

**Target shape.** Pages that don't need interactivity become server components; pages that do isolate the interactive parts.

```tsx
// BEFORE: src/app/(contractor)/contractor/subsections/page.tsx
"use client";
export default function SubsectionsListPage() {
  const { data: subsections, isLoading } = useQuery({
    queryKey: ['subsections'],
    queryFn: async () => {
      const { data } = await supabase.from('subsections').select('*').order('name');
      return data ?? [];
    },
  });
  // ... 200 lines of UI ...
}

// AFTER: same path, no "use client"
import { createServerClient } from '@/integrations/supabase/server';
import { SubsectionsList } from '@/views/subsections/SubsectionsList'; // pure UI, client-only if needed

export default async function SubsectionsListPage() {
  const supabase = await createServerClient();
  const { data: subsections } = await supabase
    .from('subsections')
    .select('id,name,site_id,is_compliant,coc_status')
    .order('name');

  return <SubsectionsList initial={subsections ?? []} />;
}
```

Steps to set up:

```ts
// src/integrations/supabase/server.ts (NEW)
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerClient() {
  const cookieStore = await cookies();
  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* no-op in server components */ },
      },
    },
  );
}
```

**Migration steps.**

1. Add `@supabase/ssr` dependency + `createServerClient` helper.
2. Pick ONE page (start with `contractor/subsections/page.tsx` — small read-only list). Convert it. Verify the existing tests pass.
3. Confirm via Vercel preview that initial render is fully HTML (no spinner).
4. Repeat for next page. Aim: ~30% of read-mostly pages converted over a quarter.

**Pages that MUST stay client** (sketches):
- Anything with `supabase.auth.onAuthStateChange` subscriptions.
- The OrphanResolutionModal (interactive).
- Forms with optimistic updates.

### Strategy 3 — Server Actions for mutations

**Why third.** Adds the missing server-side validation layer the Stage 4 work exposed. Symmetric to iOS Stage 4c-4's `InspectionCompletionValidator`.

**Target shape.**

```ts
// src/app/actions/inspections.ts
"use server";

import { createServerClient } from '@/integrations/supabase/server';
import { z } from 'zod';

const completeSchema = z.object({
  inspectionId: z.string().uuid(),
});

export async function markInspectionComplete(input: unknown) {
  const { inspectionId } = completeSchema.parse(input);
  const supabase = await createServerClient();

  // Server-side validation (mirrors iOS InspectionCompletionValidator)
  const { data: insp, error } = await supabase
    .from('inspections')
    .select('id,subsection_id,site_id,inspector_id,status,inspection_items(is_required,is_critical,is_compliant,response)')
    .eq('id', inspectionId)
    .single();
  if (error || !insp) return { error: 'Inspection not found' };
  if (!insp.subsection_id) return { error: 'No subsection bound — pick one before completing' };
  if (insp.inspector_id !== (await supabase.auth.getUser()).data.user?.id) {
    return { error: 'You are not the inspector of this row' };
  }
  const unanswered = (insp.inspection_items ?? []).filter(
    (i: any) => i.is_required && i.is_compliant == null && !i.response,
  );
  if (unanswered.length > 0) {
    return { error: `${unanswered.length} required item(s) unanswered` };
  }

  const { error: updErr } = await supabase
    .from('inspections')
    .update({ status: 'Completed' })
    .eq('id', inspectionId);
  if (updErr) return { error: updErr.message };

  return { ok: true };
}
```

```tsx
// Call site
import { markInspectionComplete } from '@/app/actions/inspections';

const { mutateAsync } = useMutation({
  mutationFn: markInspectionComplete,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inspection', id] }),
});
```

**Migration steps.**

1. Add `zod` dependency for schema validation.
2. Pick the most-critical mutation (mark complete is a good candidate — already has analogous iOS validator). Convert.
3. Write a Vitest test mocking the supabase server client.
4. Repeat for other mutations (subsection edit, document upload, etc.).
5. After ~5 actions land, every new mutation goes through this pattern.

### Strategy 4 — Auto-regenerate Supabase types in CI

**Why fourth.** Eliminates the friction that drives the 131 `as any` casts.

**Target shape.**

```yml
# .github/workflows/types.yml
name: regen-supabase-types
on:
  push:
    paths: ['supabase/migrations/**']
  workflow_dispatch:
jobs:
  regen:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: |
          supabase gen types typescript \
            --project-id ${{ secrets.SUPABASE_PROJECT_ID }} \
            > src/integrations/supabase/types.ts
      - uses: peter-evans/create-pull-request@v6
        with:
          title: "chore(types): regenerate Supabase types"
          body: "Auto-generated after migration in main."
          branch: chore/regen-supabase-types
          commit-message: "chore(types): regenerate from current schema"
```

After this lands, the `useUnresolvedOrphans.ts` `as any` shim becomes unnecessary — once the workflow runs against the integrity schema, the view and RPCs land in `types.ts`.

### Strategy 5 — Decompose mega-views

Identical pattern to iOS Strategy 3. Pick `InspectionDetail.tsx` (2,834 lines) first, split into:

```
src/views/inspection/
  InspectionDetail.tsx           ← composition only, ~200 lines
  sections/
    InspectionHeader.tsx
    InspectionItemList.tsx
    InspectionPhotosSection.tsx
    InspectionCompletionSection.tsx
    InspectionSnagsSection.tsx
  hooks/
    useInspectionDetail.ts       ← from the existing 1,751-line god-hook,
                                   carve out the inspection-specific bits
    useInspectionMutations.ts    ← all the action callbacks
```

Each section is independently testable. Each PR moves ~300 lines out, leaves the parent smaller.

### Strategy 6 — Decompose `useSubsectionDetail.ts` (the 1,751-line god-hook)

**Why this is its own strategy.** It contains the orphan-name fallback at lines 366-399 — the exact code Stage 1 audit referenced. Touching it is risky; that's why it's a hook with a Strategy of its own.

**Approach.** First write a behavior-locking test (Strategy 1's deliverable #3). Then carve:

```
src/views/subsection-detail/
  useSubsectionDetail.ts                  ← ORCHESTRATOR, ~150 lines
  hooks/
    useSubsectionInspections.ts           ← lines that fetch + fall-back-match inspections
    useSubsectionSnags.ts
    useSubsectionDocuments.ts
    useSubsectionFloorPlanPins.ts
    useSubsectionCompliance.ts            ← read installation_status / installation_score
```

The orphan-name fallback (lines 366-399) goes into `useSubsectionInspections.ts`. Add a `// AUDIT: see insight-linker-app/docs/integrity-audit/root-causes.md Q9` comment to ensure the next engineer who touches it understands the context.

### Strategy 7 — Unify the PDF generation paths

**Why seventh.** The biggest source of duplicate code in the codebase. ~6,000 LOC, 3-5 parallel paths. But isolated — touching this won't break user flows.

**Target shape.** Single source of truth: `src/lib/pdf/` with a clear interface, replacing `pdfEngine.ts`, `pdfmakeInspectionReport.ts`, `pdfMakeUtils.ts`, and `assetVerificationReportGenerator.ts`.

```ts
// src/lib/pdf/index.ts
export interface PdfReportSpec {
  kind: 'inspection' | 'site-summary' | 'asset-verification' | 'coc';
  data: unknown;  // narrow per kind via discriminated union below
  branding?: BrandingConfig;
}

export async function generatePdf(spec: PdfReportSpec): Promise<Uint8Array> {
  switch (spec.kind) {
    case 'inspection':       return renderInspection(spec.data, spec.branding);
    case 'site-summary':     return renderSiteSummary(spec.data, spec.branding);
    case 'asset-verification': return renderAssetVerification(spec.data, spec.branding);
    case 'coc':              return renderCoc(spec.data, spec.branding);
  }
}
```

The 4 PDF edge functions (`generate-pdf*`) should pick ONE and deprecate the others. Pattern: pick `generate-pdf-pdfmake` (the actively used one based on filename match across the codebase), retire the rest.

### Strategy 8 — Configure Vercel Preview env vars

**Why eighth.** Unblocks PR review workflow. ~5 minutes of work.

```bash
# Run once
for var in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY NEXT_PUBLIC_SUPABASE_PROJECT_ID; do
  npx vercel@latest env add "$var" preview --value "$(grep "^$var=" .env.local | cut -d= -f2-)" --yes
done
```

Discovered during Stage 4b orphan-modal PR — every PR currently fails preview deploy at prerender because Preview env vars aren't configured. After this, code-review can use the preview URL to verify changes visually.

### Strategy 9 — Consolidate the 4 user contexts behind shared view-models

**Why ninth.** Domain-level refactor. After tests + smaller views, the four parallel UIs (`contractor/`, `client-portal/`, `public/`, `review/`) for the same subsection can share more logic.

**Target shape.** A `useSubsectionView({ subsectionId, viewerContext })` hook that returns the appropriate fields + UI flags based on viewer role:

```ts
type ViewerContext =
  | { kind: 'contractor'; userId: string }
  | { kind: 'client-portal'; userId: string }
  | { kind: 'public' }      // anon, gated by token
  | { kind: 'review'; token: string };

export function useSubsectionView({
  subsectionId,
  viewer,
}: { subsectionId: string; viewer: ViewerContext }) {
  const { data: subsection } = useQuery({ /* ... */ });
  const canEdit = viewer.kind === 'contractor';
  const canSeeCosts = viewer.kind === 'client-portal' || viewer.kind === 'contractor';
  // ...
  return { subsection, canEdit, canSeeCosts, /* ... */ };
}
```

Then ALL four UIs render the same `SubsectionDetail` view with `useSubsectionView` controlling visibility. Single source of truth for what each viewer sees.

This is the biggest refactor on the list and the last one I'd attempt. Don't start until 1-8 land.

---

## 4. Improved production-grade code samples

### House style for new code (lifted from iOS Stage 4c work)

```ts
/**
 * Mark an inspection as Completed.
 *
 * Server-side guards (mirrors iOS InspectionCompletionValidator,
 * Stage 4c-4): caller must own the inspection (inspector_id =
 * auth.uid()), inspection must be subsection-bound, all required
 * items must be answered.
 *
 * Audit reference: see ARCHITECTURE_AUDIT.md Strategy 3.
 */
"use server";
export async function markInspectionComplete(input: unknown) {
  // ...
}
```

Three properties to internalise (same as iOS audit):

1. **Server Action over client mutation.** Validation lives where the user can't tamper with it.
2. **Schema-validate the input.** `zod.parse(input)` is non-negotiable.
3. **Cite the audit finding the code addresses.** `// see Stage 4c-4` is a citation graph between code and incidents.

### Suggested commit format

```
fix(action): mark inspection complete requires subsection (audit C)

Server-side equivalent of iOS Stage 4c-4 InspectionCompletionValidator.
Pre-fix, the web app's contractor flow could mark an inspection
Completed without a subsection — symmetric to the iOS bug that
Stage 4c-4 closed. After this commit, both clients enforce the same
contract via the server action.

Refs: insight-linker-app/docs/integrity-audit/root-causes.md finding (c)
      ECompliance commit 3d71344 (iOS Stage 4c-4)
```

---

## 5. Migration path

Each row = ~1 day of focused work.

| Order | Strategy | Days | Unblocks |
|---|---|--:|---|
| 1 | Add Vitest config + 5 baseline tests | 1 | Every later strategy |
| 2 | Auto-regen Supabase types in CI (Strategy 4) | 0.5 | Drops 131 `as any` casts naturally |
| 3 | Configure Vercel Preview env vars (Strategy 8) | 0.1 | Unblocks PR review |
| 4 | Add `createServerClient` helper + convert 1 read-only page to RSC (Strategy 2) | 1 | Template for all read-only pages |
| 5 | First Server Action: `markInspectionComplete` (Strategy 3) | 1 | Template for all mutations |
| 6 | Decompose `useSubsectionDetail.ts` into sub-hooks (Strategy 6) | 2 | Touches the orphan-name fallback safely |
| 7 | Decompose `InspectionDetail.tsx` mega-view (Strategy 5) | 2 | Half the cognitive surface of contractor flow gone |
| 8 | Consolidate PDF generation paths (Strategy 7) | 3 | Removes ~4,000 LOC of duplicate code |
| 9 | Roll RSC conversion to next 10 read-only pages | rolling | Eventually 30% of pages don't ship JS for data fetch |
| 10 | Consolidate 4 user contexts via `useSubsectionView` (Strategy 9) | 5 | Big-bang refactor; do last |
| 11 | Clean up iCloud " 2" duplicates + move repo off iCloud (same as iOS audit Strategy 10 advice) | 0.5 | Stops the plague |

**Total to half the cognitive surface: ~15 days of focused work**, similar to the iOS audit estimate. Spread across normal feature delivery, that's a quarter.

---

## 6. Non-functional impact

- **No new features.** Pure refactor.
- **No breaking API changes** for ECompliance iOS or third-party integrations.
- **No schema migrations** on the existing data.
- **New dependencies**: `vitest`, `@testing-library/react`, `jsdom`, `@vitest/coverage-v8`, `zod`, `@supabase/ssr`. All standard, no exotic.
- **Improved performance**: Server Components reduce client bundle and improve TTFB. PDF unification eliminates 2-3 redundant code paths from production bundles (each is currently tree-shaken poorly because all variants are imported by something).
- **Improved security**: Server Actions add a real validation tier. Today RLS is the ONLY gate; tomorrow there's a Zod-validated action layer in front of every mutation.

---

## 7. What I did NOT audit and you should before acting

This audit covered structural patterns based on file-size distribution, import patterns, and the few files I read deeply during the data-integrity work. Areas I have not opened in detail:

- **`src/components/site/SchematicDiagram.tsx` (2,105 lines)** — the floor-plan editor. Likely a big interactive canvas component with its own state machine. Worth its own audit.
- **`src/components/COCPreviewApproval.tsx` (2,208 lines)** — the COC document approval flow. Probably contains form-state + signature-capture + pagination logic in one file.
- **`src/components/settings/PDFTemplateManager.tsx` + `PDFWYSIWYGEditor.tsx`** (~2,000 LOC) — the PDF template authoring UI. Sits between the user and the 6,000-LOC PDF generation cluster.
- **All 25 edge functions in `supabase/functions/`** — server-side TypeScript that runs in Deno on Supabase. Different deployment lifecycle, different testing approach. Worth a separate edge-function-specific audit.
- **`src/components/PlatformCapabilityTester.tsx` (925 lines)** — Capacitor capability detection for the native wrappers. iOS / Android divergence likely lives here.
- **The auth/onboarding flow** (`src/app/auth/**`, `src/components/auth/**`, `src/components/OnboardingWizard.tsx`) — token handling, password reset deep links, set-password flow. Auth is always more complex than it looks.

---

## 8. Citation graph

This audit produced + references the following docs:

- This file: `ARCHITECTURE_AUDIT.md` (web)
- iOS companion: `/Volumes/Extreme SSD/DEVELOPER/ECompliance/ARCHITECTURE_AUDIT.md`
- Data-integrity audit corpus (in this repo's `docs/integrity-audit/`):
  - `root-causes.md` — Stage 3 iOS root causes
  - `2026-05-27-remediation-strategy.md` — Stage 4 plan
  - `pre-existing-test-failures.md` — explanation of the 13 stale iOS tests
  - `force-at-login-resolution.md` — Stage 4b inspector self-resolution spec
  - `2026-05-26-scorecard.md` — Stage 1 production scan

Future code comments referencing these docs build a maintainable history. The iOS Stage 4c commits demonstrate the pattern.

---

*Audit produced 2026-05-28 by Claude (Opus 4.7) following the iOS ARCHITECTURE_AUDIT.md.*
