# 07 · Components — Client-Portal, Auth, Floor-Plan, Compliance, Templates

**Scope:** per-symbol reference for the `auth/`, `client-portal/`, `floor-plan/`, `compliance/`, and `templates/` component folders (13 files). Ground truth from code; cite `03-auth-and-access/*` and `04-routes/*` where relevant.

**Files covered (13):**
`auth/AuthLoading.tsx`, `auth/OnboardingGate.tsx`, `auth/useAuthSession.ts`, `auth/useOnboardingStatus.ts` · `client-portal/AccessLinkGenerator.tsx`, `client-portal/ClientPortalDocuments.tsx`, `client-portal/SiteOverviewCard.tsx`, `client-portal/index.ts` · `floor-plan/PinFilters.tsx`, `floor-plan/index.ts` · `compliance/COCValidationLogCard.tsx`, `compliance/InlineViolationOverrides.tsx` · `templates/TemplatePreviewRenderer.tsx`

---

## `auth/` — route-protector shared primitives (extracted as "EC-7")

These four files are the deduplicated guts of the four route protectors (`ProtectedRoute`, `AuthOnlyRoute`, `ClientProtectedRoute`, `ContractorProtectedRoute`). The protectors themselves are documented in `components-toplevel-*` / `03-auth-and-access/auth-flows.md`; here we document the shared pieces they consume.

### `AuthLoading.tsx`

**`AuthLoading({ variant })`** — `AuthLoading.tsx:9`. Shared loading placeholder for route protectors.

| prop | type | meaning |
|---|---|---|
| `variant` | `"spinner" \| "skeleton"` (default `"spinner"`) | `spinner` = centred spinner + "Loading…"; `skeleton` = stacked `<Skeleton>` blocks |

- Renders: pure presentational; no state/effects/data.
- `skeleton` variant uses `@/components/ui/skeleton`.
- **Callers:** `ProtectedRoute`, `AuthOnlyRoute` (spinner); `ClientProtectedRoute`, `ContractorProtectedRoute` (skeleton).

### `OnboardingGate.tsx`

**`OnboardingGate({ onboardingStatus, onComplete, children })`** — `OnboardingGate.tsx:15`. Wraps `children` and overlays `OnboardingWizard` until onboarding is complete.

| prop | type | meaning |
|---|---|---|
| `onboardingStatus` | `{ onboarding_completed: boolean \| null } \| null \| undefined` | profile row from `useOnboardingStatus` |
| `onComplete` | `() => void` | fired when wizard finishes (protectors invalidate the query) |
| `children` | `ReactNode` | the protected subtree |

- State: `dismissed` (local). `show = !!onboardingStatus && !onboarding_completed && !dismissed`.
- Renders `<OnboardingWizard open onComplete={…}>` (from `@/components/OnboardingWizard`) above `children`; on complete sets `dismissed` then calls `onComplete`.
- **Callers:** `ProtectedRoute`, `ClientProtectedRoute`, `ContractorProtectedRoute` (not `AuthOnlyRoute`, which has no onboarding gate).
- NOTE: children always render even while the wizard is open (wizard is an overlay, not a replacement).

### `useAuthSession.ts`

**`useAuthSession()`** — `useAuthSession.ts:14`. Subscribes to Supabase auth state for the protectors.

- Signature: `() => { session: Session | null; isLoading: boolean }`.
- Effect: `supabase.auth.onAuthStateChange` + one-shot `getSession()`; both set `session` and clear `isLoading`. Cleans up via `subscription.unsubscribe()`.
- Side effects: Supabase auth listener only.
- **Callers:** all four protectors. Token/session model: `03-auth-and-access/token-systems.md`, `auth-flows.md`.

### `useOnboardingStatus.ts`

**`useOnboardingStatus(enabled)`** — `useOnboardingStatus.ts:10`. React-Query lookup of the current user's onboarding flag.

- Signature: `(enabled: boolean) => UseQueryResult`. `queryKey: ["onboarding-status"]`, gated by `enabled`.
- `queryFn`: `auth.getUser()` → `null` if no user, else `profiles.select("onboarding_completed").eq("id", user.id).single()` → returns `{ onboarding_completed }` (or `null`).
- Reads `profiles` (own row) — see `03-auth-and-access/access-contexts-and-roles.md` for `profiles` RLS.
- **Callers:** `ProtectedRoute`, `ClientProtectedRoute`, `ContractorProtectedRoute`. Result is fed straight into `OnboardingGate`.

---

## `client-portal/`

### `index.ts`

Barrel: `export { AccessLinkGenerator } from './AccessLinkGenerator'` and `export { SiteOverviewCard }`.
- NOTE: `ClientPortalDocuments` is **not** re-exported here; its two callers import it by its direct path.

### `AccessLinkGenerator.tsx`

**`AccessLinkGenerator({ siteId?, clientId? })`** — `AccessLinkGenerator.tsx:84` (also `default` export at `:553`). Admin/staff card to create, list, copy, toggle, and delete shareable client-access links.

| prop | type | meaning |
|---|---|---|
| `siteId` | `string?` | pre-scopes links to one site; hides the type/site/client pickers |
| `clientId` | `string?` | pre-scopes links to one client |

**Data (React-Query / Supabase):**
| key | op | table | notes |
|---|---|---|---|
| `["access-links", siteId, clientId]` | SELECT | `client_access_links` (+ embedded `clients`, `sites`) | filtered by `site_id`/`client_id` when scoped |
| `["sites-for-links", clientId]` | SELECT | `sites` | dropdown; `enabled: !siteId` |
| `["clients-for-links"]` | SELECT | `clients` | dropdown; `enabled: !clientId && !siteId` |
| `createLinkMutation` | INSERT | `client_access_links` | validates target; sets `created_by = auth.getUser()` id; computes `expires_at` from `never/7d/30d/90d` |
| `deleteLinkMutation` | DELETE | `client_access_links` `.eq(id)` | |
| `toggleActiveMutation` | UPDATE `is_active` | `client_access_links` `.eq(id)` | enable/disable |

- State: `isDialogOpen`, `deleteId`, `formData` (`label`, `linkType` `site\|client`, `selectedSiteId`, `selectedClientId`, `expiresIn`). `resolvedSiteId/ClientId` fall back to props; `targetMissing` disables submit.
- On create success: invalidates `["access-links"]`, resets form, builds URL `${origin}/${linkPath}/${access_token}` where `linkPath = link_type==='client' ? 'portfolio' : 'review'`, copies to clipboard (`navigator.clipboard.writeText`), toasts. Helpers `copyLink`/`openLink` (`:254`,`:261`) do the same path mapping → matches the public routes `/review/[token]` & `/portfolio/[token]` (`04-routes/public-token-and-root.md` §1,§3).
- Renders: `Card` → header with create `Dialog`; body = empty state or `Table` of links (label, target, status badge Active/Disabled/Expired, view count, last-accessed, action buttons) + delete `AlertDialog`.
- **Callers:** `views/PortalManagement.tsx`; re-exported via `index.ts`.
- NOTE (security-relevant client write): all `client_access_links` mutations run client-side under the caller's session — token generation/lifecycle is governed by RLS on `client_access_links` (`04-routes/public-token-and-root.md` notes `client_access_links` UPDATE happens server-side inside `validate_access_link`; creation/delete here are direct table writes). `AccessLink.access_token` type is declared but the create path never sends it (DB-defaulted).

### `ClientPortalDocuments.tsx`

**`ClientPortalDocuments({ siteDocuments, siteCategories, subsectionDocuments, subsections, onPreview, onDownload })`** — `ClientPortalDocuments.tsx:51`. Searchable, groupable browser for a site's documents (site-level + per-subsection), used in both authenticated and public review views.

| prop | type | meaning |
|---|---|---|
| `siteDocuments` | `SiteDocument[]` | `{id, file_name, file_url, category?, category_id?}` |
| `siteCategories` | `SiteDocumentCategory[]` | `{id, name}` — resolves `category_id` → name |
| `subsectionDocuments` | `SubsectionDocument[]` | `{…, subsection_id, subsection_name?, category_name?}` |
| `subsections` | `{ id; name }[]` | resolves `subsection_id` → name |
| `onPreview` | `(url, name) => void` | preview handler (owned by parent view) |
| `onDownload` | `(url, name) => void` | download handler |

- State: `searchQuery`, `selectedSubsection` (`all`/`site-level`/id), `groupBy` (`category`/`subsection`).
- Derived (`useMemo`): `unifiedDocuments` (merges site + subsection docs into `UnifiedDocument` with `source`), `filteredDocuments` (search + location filter), `groupedByCategory`, `groupedBySubsection` (Site-Level sorted first).
- Renders: header + count, search `Input`, location `Select`, group-by `ToggleGroup`, then a multi-`Accordion` of groups, each row offering preview/download buttons; empty state otherwise.
- No data fetching — pure presentational; parent supplies data and the preview/download callbacks (in-app viewer per MEMORY `esite-inapp-viewers`).
- **Callers:** `views/PublicSiteReview.tsx` (public `/review/[token]`), `views/ClientPortalSiteDetail.tsx` (authenticated portal).
- NOTE: not exported from `client-portal/index.ts` (direct-path import only).

### `SiteOverviewCard.tsx`

**`SiteOverviewCard({ site, stats, linkPrefix })`** — `SiteOverviewCard.tsx:29` (also `default` at `:111`). Clickable summary card linking to a site detail page.

| prop | type | meaning |
|---|---|---|
| `site` | `{ id; name; address?; site_type?; site_image_url? }` | site header data |
| `stats` | `{ totalSubsections; openSnags }` | counts shown in the 2-col grid |
| `linkPrefix` | `string?` (default `"/client-portal/sites"`) | base path; card links to `${linkPrefix}/${site.id}` |

- Renders: `<Link>` (from `@/lib/navigation`) wrapping a `Card` — image/placeholder, name + address + `site_type` badge, subsection & open-snag counts, hover hint. No state/effects/data.
- **Callers:** `views/ClientPortalDashboard.tsx`; re-exported via `index.ts`.

---

## `floor-plan/`

### `index.ts`

Barrel: `export { PinFilters, type StatusFilter, type PriorityFilter, type TypeFilter } from './PinFilters'`.

### `PinFilters.tsx`

**`PinFilters({ … })`** — `PinFilters.tsx:27`. Three-`Select` filter bar (status / priority / type) for floor-plan pins.

| prop | type | meaning |
|---|---|---|
| `statusFilter` | `StatusFilter` | current status (`all\|open\|in_progress\|finished\|closed`) |
| `priorityFilter` | `PriorityFilter` | `all\|critical\|high\|medium\|low` |
| `typeFilter` | `TypeFilter` | `all\|snag\|observation` |
| `onStatusChange/onPriorityChange/onTypeChange` | `(v) => void` | per-filter setters (cast string → union) |
| `onClearFilters` | `() => void` | clears all; only shown when `activeFilterCount>0` |
| `activeFilterCount` | `number` | drives "N active" badge + Clear button visibility |

- Pure presentational (no state/effects/data); emoji-labelled `SelectItem`s.
- **Exported types** `StatusFilter`/`PriorityFilter`/`TypeFilter` (`:12-14`).
- **Callers:** component `components/FloorPlanPinsList.tsx`; the types are also imported by `views/ValidationFeedback.tsx` (and `FloorPlanPinsList`).

---

## `compliance/`

> Both files implement the **same** COC violation-override pattern (start → enter reason → persist to `coc_validations.report_data.violationOverrides` keyed by violation index, with `{reason, overriddenBy=email, overriddenAt}`; undo removes the key). `COCValidationLogCard` is the list-level card; `InlineViolationOverrides` is the per-validation inline `<details>` block. The persistence logic (`getOverrides` / `handleSaveOverride` / `handleRemoveOverride`) is **duplicated** across the two with near-identical bodies — see NOTES.

### `COCValidationLogCard.tsx`

**`export interface ValidationRecord`** — `COCValidationLogCard.tsx:40`. Shape of one COC validation row (`id`, `document_id`, `subsection_id/_name`, `status`, `validated_at`, `violations: ValidationViolation[]`, `report_data`, embedded `document`). Imported by `components/ComplianceDashboard.tsx`.

**`COCValidationLogCard({ allValidations, onPreview, onValidationsChanged?, onReviewCoc?, reviewingDocId? })`** — `:67`. Full validation-history card with pass/fail filter and per-violation override controls.

| prop | type | meaning |
|---|---|---|
| `allValidations` | `ValidationRecord[]` | all rows; counts/filters derived locally |
| `onPreview` | `(v: ValidationRecord) => void` | open document preview |
| `onValidationsChanged` | `() => void?` | fired after override save/remove so parent refetches |
| `onReviewCoc` | `(v: ValidationRecord) => void?` | optional "Review COC" action |
| `reviewingDocId` | `string \| null?` | disables/ spins the Review button for the in-progress doc |

- State: `validationFilter` (`all/passed/failed`), `overrides` (map `validationId → {index → ViolationOverride}`), `overridingKey` (`"id:index"`), `overrideReason`, `savingOverride`.
- `getOverrides(validation)` (`:83`, `useCallback`): local state first, else parses `report_data.violationOverrides` (string keys → numeric).
- `handleSaveOverride(validation, idx)` (`:108`): builds override (`overriddenBy = (await auth.getUser()).data.user?.email || 'Unknown'`), writes merged `report_data` via `supabase.from('coc_validations').update({report_data}).eq('id', …)`, updates local state + mutates `validation.report_data` in place, toasts, calls `onValidationsChanged`.
- `handleRemoveOverride(validation, idx)` (`:167`): same UPDATE minus the key.
- Filtering: `passed = status==='Pass'`; `failed ∈ {Fail, Failed, Incomplete}`.
- Renders: header (filter buttons w/ live counts) → per-validation block (status badge, overridden-count badge, "All resolved" badge, active-violation list with inline override textarea, overridden-violation list with Undo, Preview + optional Review COC buttons) → empty states.
- **Callers:** `components/ComplianceDashboard.tsx`.
- NOTE (security-relevant client write): writes `coc_validations.report_data` directly from the client. Server-side this is gated by RLS **"Staff manage coc_validations"** (`FOR ALL`, authenticated, `NOT has_role(Contractor) AND NOT has_role(Client)`) — `02-data-model/rls-policies-03.md:189`; Contractors/Clients cannot persist overrides even though the button renders.

### `InlineViolationOverrides.tsx`

**`InlineViolationOverrides({ validationId, violations, reportData, onChanged? })`** — `InlineViolationOverrides.tsx:40`. Inline `<details>` panel listing SANS 10142-1 violations for one validation with per-finding override/undo.

| prop | type | meaning |
|---|---|---|
| `validationId` | `string` | the `coc_validations` row id to update |
| `violations` | `Violation[]` | `{clause, description, reason?, riskLevel?, immediateAction?, evidence?}` |
| `reportData` | `Record<string, unknown> \| null` | source of persisted `violationOverrides` (lazy-init from here) |
| `onChanged` | `() => void?` | fired after any override change |

- State: `overrides` (lazy-init from `reportData.violationOverrides`), `overridingIndex`, `overrideReason`, `saving`.
- `handleSaveOverride(index)` / `handleRemoveOverride(index)` (`:64`,`:107`, both `useCallback`): same `coc_validations.report_data` UPDATE as the card above; `overriddenBy = auth.getUser().email || 'Unknown'`.
- Renders: `<details open>` with summary (active-count / "all resolved" + overridden badge), active-violation `<ul>` (clause, description, risk badge, reason/action/evidence, override textarea) and overridden `<ul>` (struck-through + reason + author/date + Undo). Returns `null` if no violations.
- **Callers:** `views/subsection-detail/CocMeteringTab.tsx`.
- NOTE: duplicate of the override-persistence logic in `COCValidationLogCard`; same RLS gate ("Staff manage coc_validations", `02-data-model/rls-policies-03.md:189`). Differs only in that overrides are keyed by a single `validationId` (no outer map) and `reportData` is a prop rather than per-row.

---

## `templates/TemplatePreviewRenderer.tsx`

Renders an A4-styled, multi-page **mock preview** of an inspection template. All preview data is fabricated locally — no Supabase/network calls anywhere in the file.

**`TemplatePreviewRenderer: React.FC<{ template: InspectionTemplate }>`** — `TemplatePreviewRenderer.tsx:393` (also `default` at `:637`).

| prop | type | meaning |
|---|---|---|
| `template` | `InspectionTemplate` | `{id, name, category, description, sections_count, pages_count, sections?, tenants?, cover_page?}` |

- Behavior: computes `mockData = getMockDataForCategory(category, name)` and `accentColor = getCategoryColor(category)` (local map; default blue `#2980b9`). Renders cover page, general-info page (+ category summary + test-results table), one page per `template.sections[]` (each item → `renderField`), an optional tenants page (first 10 of `template.tenants`, Low-Voltage boards), and a sign-off page (with MV safety warning when `category==='Medium Voltage'`).
- **Module-private helpers (not exported):**
  - `getMockDataForCategory(category, name)` (`:49`) — returns category-specific fake field values + `testResults` (MV/LV/Generator/Solar/Progress/Site-Drawing/default).
  - `renderField(item, category, index)` (`:159`) — switches on `item.type` (`checklist/checkbox`, `text/number`, `textarea`, `image`, `select`, default) producing mock values; `getMockValue` cycles category arrays by `index`.
  - `renderCategorySummary(category, mockData)` (`:273`) — per-category summary panel (MV/Generator/Solar/Progress/Low-Voltage), else `null`.
  - `renderTestResults(category, mockData)` (`:363`) — table of `mockData.testResults`, all rows badged "PASS"; `null` if none.
- **Callers:** `views/InspectionTemplates.tsx`.
- NOTE: uses inline `mockData: any` and hardcoded sample copy (project "Evaton Mall", inspector "John Smith", company default "Watson Mattheus"); preview-only, never persisted. `template.description`/`pages_count`/`sections_count`/`cover_page.title`/`logo_url` are typed but not all consumed in the render.
