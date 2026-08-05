# A05 — admin-template-routes

- Unit id: A05
- Slug: admin-template-routes
- Spec mode: full
- Date: 2026-07-29
- Files: 4

## Unit header

**Unit purpose (as-is).** Four Next.js App Router page files under `src/app/(admin)/inspection-templates/` that expose the inspection-template feature at four URLs: `/inspection-templates` (list), `/inspection-templates/new` (create), `/inspection-templates/[templateId]/edit` (edit), and `/inspection-templates/validate` (validator). Every file is a `"use client"` wrapper whose entire body mounts a view from unit V02 with no props; no data fetching, param handling, or metadata exists at the route layer.

**Module-level observations.**
- All four files are 3–9 lines. `new/page.tsx` and `[templateId]/edit/page.tsx` are byte-identical apart from the file path: both are the same 3-line wrapper around `TemplateBuilderPage` (new/page.tsx:1-3, [templateId]/edit/page.tsx:1-3).
- `page.tsx` (list) is the only file under `src/app` that imports `next/dynamic` (grep-verified: `grep -rn "next/dynamic" src/app` returns only src/app/(admin)/inspection-templates/page.tsx:2). It loads `@/views/InspectionTemplates` with `ssr: false` and a `LoadingState` fallback; every sibling admin page in A03/A04 imports its view statically.
- The `[templateId]` dynamic segment is never read in this unit. The edit page passes nothing to `TemplateBuilderPage`; the view retrieves `templateId` itself via `useParams()` from `@/lib/navigation` (src/views/TemplateBuilderPage.tsx:1,11), which wraps Next's `useParams` and returns `{}` when params are null (src/lib/navigation.tsx:42-44).
- All four routes sit inside the `(admin)` route group, so they render inside `src/app/(admin)/layout.tsx` (unit A03), which wraps children in `ProtectedRoute` (unit C10) + sidebar shell (src/app/(admin)/layout.tsx:12-33).

**External contract.** The rest of the app gets four authenticated admin URLs. In-app entry points (grep-verified over `src` for the string `inspection-templates`): sidebar item `/inspection-templates` (src/components/AppSidebar.tsx:48, unit C11); `navigate("/inspection-templates/new")` and `navigate("/inspection-templates/validate")` from the list view (src/views/InspectionTemplates.tsx:452,448, unit V02); back-navigation to `/inspection-templates` from both the builder (src/views/TemplateBuilderPage.tsx:71,88) and the validator (src/views/TemplateValidator.tsx:79). No code anywhere in `src` constructs a URL matching the edit route's actual shape `/inspection-templates/<id>/edit` (grep-verified; see Observed issues on the edit page).

## src/app/(admin)/inspection-templates/page.tsx

- Purpose: Mounts the admin inspection-template list view at `/inspection-templates`, client-side only.
- Public surface: default export `Page(): JSX.Element` — no props (page.tsx:8). Module-level `InspectionTemplates` constant created by `dynamic(() => import("@/views/InspectionTemplates"), { ssr: false, loading: () => <LoadingState variant="full-page" message="Loading..." /> })` (page.tsx:4-7).
- Inputs & outputs: no inputs (no params, no searchParams read). Output: rendered `<InspectionTemplates />` with zero props (page.tsx:8). No stores, tables, buckets, localStorage, or env vars touched at this layer.
- Dependencies: uses -> `next/dynamic` (page.tsx:2); `@/components/LoadingState` (page.tsx:3, unit C16 — accepts `variant?: 'spinner'|'skeleton'|'full-page'`, `message?`, `skeletonCount?`, `className?`, src/components/LoadingState.tsx:5-10); `@/views/InspectionTemplates` default export (dynamic import, page.tsx:4; unit V02, default exported at src/views/InspectionTemplates.tsx:680). used by <- Next.js file-system router (convention); in-app navigation targeting `/inspection-templates`: src/components/AppSidebar.tsx:48 (C11), src/views/TemplateBuilderPage.tsx:71,88 (V02), src/views/TemplateValidator.tsx:79 (V02) — grep-verified. No direct module import of this file anywhere (grep-verified).
- Side effects: triggers a client-side code-split chunk load for the view module on first render (`ssr: false` dynamic import, page.tsx:4-5). None otherwise at this layer.
- Error handling: none in this file. No `error.tsx`/`loading.tsx` siblings exist in the directory (directory listing shows only `[templateId]`, `new`, `page.tsx`, `validate`). If the dynamic chunk fails to load, nothing in this file catches it.
- Tests: none found — grep for `InspectionTemplates`/`inspection-templates` across `*.test.*`/`*.spec.*` files returns nothing.
- Observed issues: this is the only `next/dynamic` + `ssr: false` page under `src/app` (grep-verified); its three sibling pages in this same unit statically import their views.
- ASSUMED: that Next's router is the sole mounter of this component (App Router convention; not independently executable proof). That the `ssr: false` choice relates to browser-only code inside the view — motive not stated anywhere in the file.

## src/app/(admin)/inspection-templates/new/page.tsx

- Purpose: Mounts the template-builder view in create mode at `/inspection-templates/new`.
- Public surface: default export `Page(): JSX.Element` — no props; body is `return <TemplateBuilderPage />;` (new/page.tsx:3).
- Inputs & outputs: none in / rendered view out. "Create mode" is not signalled by this file: `TemplateBuilderPage` decides create-vs-edit by whether `useParams()` yields a `templateId` (src/views/TemplateBuilderPage.tsx:11-12,96) — on this route there is no dynamic segment, so `templateId` is `undefined`. No stores touched at this layer.
- Dependencies: uses -> `@/views/TemplateBuilderPage` default export (new/page.tsx:2; unit V02, default exported at src/views/TemplateBuilderPage.tsx:114). used by <- Next.js router (convention); in-app navigation to `/inspection-templates/new`: src/views/InspectionTemplates.tsx:452 (V02) — grep-verified. No direct module import of this file (grep-verified).
- Side effects: none at this layer.
- Error handling: none in this file.
- Tests: none found (grep as above; `TemplateBuilderPage` has no test-file references).
- Observed issues: byte-identical body to `[templateId]/edit/page.tsx` — the two routes are distinguished solely by the presence/absence of the URL segment the shared view reads itself.
- ASSUMED: router-convention consumption, as above.

## src/app/(admin)/inspection-templates/[templateId]/edit/page.tsx

- Purpose: Mounts the template-builder view in edit mode at `/inspection-templates/[templateId]/edit`.
- Public surface: default export `Page(): JSX.Element` — no props; body is `return <TemplateBuilderPage />;` ([templateId]/edit/page.tsx:3).
- Inputs & outputs: the route defines a `templateId` dynamic segment but this file never reads it — no `params` prop, no `useParams` call. The view obtains `templateId` via `useParams()` from `@/lib/navigation` (src/views/TemplateBuilderPage.tsx:1,11; L13) and uses it to fetch the template row (`.eq("id", templateId)`, src/views/TemplateBuilderPage.tsx:26). No stores touched at this route layer.
- Dependencies: uses -> `@/views/TemplateBuilderPage` default export ([templateId]/edit/page.tsx:2; unit V02). used by <- Next.js router (convention); in-app navigation constructing `/inspection-templates/<id>/edit`: none found (grep-verified — the full grep for `inspection-templates` over `src` yields no occurrence of that URL shape). No direct module import of this file (grep-verified).
- Side effects: none at this layer.
- Error handling: none in this file.
- Tests: none found (grep as above).
- Observed issues: the only navigation in `src` that targets template editing by URL is `navigate(`/inspection-templates/edit/${issue.template_id}`)` at src/views/TemplateValidator.tsx:139 (unit V02). That URL's segments are `inspection-templates / edit / <id>`, while this route file matches `inspection-templates / <templateId> / edit`; the two shapes do not correspond, and no route file exists at `inspection-templates/edit/[id]` (directory listing of `src/app/(admin)/inspection-templates` shows only `[templateId]/`, `new/`, `validate/`, `page.tsx`). Consequently this route has zero grep-verified in-app navigators using its actual shape.
- ASSUMED: that `/inspection-templates/edit/<id>` resolves to a 404/not-found at runtime (inferred from Next.js segment-matching rules; not executed).

## src/app/(admin)/inspection-templates/validate/page.tsx

- Purpose: Mounts the template-validator view at `/inspection-templates/validate`.
- Public surface: default export `Page(): JSX.Element` — no props; body is `return <TemplateValidator />;` (validate/page.tsx:3).
- Inputs & outputs: none in / rendered view out. No stores touched at this layer.
- Dependencies: uses -> `@/views/TemplateValidator` default export (validate/page.tsx:2; unit V02, default exported at src/views/TemplateValidator.tsx:19). used by <- Next.js router (convention); in-app navigation to `/inspection-templates/validate`: src/views/InspectionTemplates.tsx:448 (V02) — grep-verified. No direct module import of this file (grep-verified).
- Side effects: none at this layer.
- Error handling: none in this file.
- Tests: none found — grep for `TemplateValidator` across `*.test.*`/`*.spec.*` returns nothing.
- Observed issues: none in this file itself. (The mis-shaped edit URL emitted by the view this page mounts is recorded under the edit page above; the emitting line src/views/TemplateValidator.tsx:139 belongs to V02.)
- ASSUMED: router-convention consumption, as above.
