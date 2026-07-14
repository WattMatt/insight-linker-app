# Data-access layer

This directory is the single home for Supabase reads/writes, introduced by the
2026-07-07 architecture review (`docs/ARCHITECTURE_REVIEW_2026-07-07.md`). The
codebase currently has **621 inline `supabase.from()` calls across 130 files** —
every one of them should eventually live behind a module here.

## Structure

| File | Role |
|---|---|
| `queryKeys.ts` | Query-key factory. All `useQuery`/`invalidateQueries` keys come from here. |
| `signedUrls.ts` | Batched signed-URL resolution (replaces four copies of a per-row N+1). |
| `<entity>.ts` | Framework-free repository: typed queries for one entity (`sites.ts` is the reference). |
| `use<Entity>.ts` | React Query hooks over the repository (`useSites.ts` is the reference). |

## Rules

1. **Views never call `supabase.from()` directly.** They call a hook from this
   directory. Repositories are the only files that import the Supabase client
   for data access.
2. **Every list query is bounded** — explicit `.limit()` or `usePaginatedList`.
   No unbounded table fetches.
3. **Keys come from `queryKeys.ts`.** Invalidate the narrowest key that covers
   the mutation (`queryKeys.sites.detail(id)`, not `queryClient.invalidateQueries()`).
4. **Repositories are framework-free** (no React imports), so offline sync,
   report generators and tests can reuse them.
5. **One select string per query shape.** If two roles need different columns,
   that is two named functions here — not two inline copies in two views.

## Migration order (highest traffic first)

1. `Dashboard.tsx` (16 inline queries, unbounded triage fetches)
2. `InspectionDetail.tsx` (23 inline queries)
3. `SiteDetail.tsx` (16 inline queries)
4. `Sites.tsx` / `ClientPortalSites.tsx` / `AdminContractorPreview.tsx` (signed-URL N+1 → `useSitesList`)
5. Everything else, view by view, as files are touched.
