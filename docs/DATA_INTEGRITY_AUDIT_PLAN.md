# Data Integrity Audit & Foolproof Layer — Plan

> **Status:** Stage 1 executed 2026-05-26 — see
> [integrity-audit/2026-05-26-scorecard.md](integrity-audit/2026-05-26-scorecard.md).
> Material gaps: 233 orphan inspections, 103 missing photo objects; everything else
> referentially clean. Next stage = root-cause in iOS (needs external SSD mounted).
>
> **Goal:** Make it impossible for inspections, images, and documents to silently
> drift out of the navigation hierarchy users see in the app. End the "I navigate
> to a subsection and not all my inspections are there" frustration once and for all.

---

## 1. Why this exists

User-reported symptom: navigating to a subsection in the web app and not seeing
all the inspections that exist for it. Same root cause for inspection-detail
pages not showing all captured images.

What we already know from this session:
- iOS sync writes inspections that sometimes have `subsection_id IS NULL` —
  the mobile app records `json_data.generalInfo.shopNumber` / `shopName`
  but doesn't always resolve that to a `subsection_id` before pushing.
- Web app added a runtime fallback in commit `cafb164` ("Fix orphan inspections
  + add UI to relink them") that surfaces orphans by matching shop name —
  this is a band-aid, not a root cause fix.
- The fallback was preserved during the 2026-05-25 Vite→Next reconciliation
  ([[insight-linker-app-vercel]] memory entry) — see `src/views/subsection-detail/useSubsectionDetail.ts`,
  the inspections fetch block around line 366–399 that does
  `[...inspectionsData, ...orphanInspections]`.

The data integrity gap exists at the **DB level**, not just the UI. A proper
solution needs DB-level invariants + a verification layer + sync-code fixes.

## 2. Stages

### Stage 1 — Diagnostic audit (read-only)

Run these queries in the Supabase SQL Editor (project
`oltzgidkjxwsukvkomof`, https://supabase.com/dashboard/project/oltzgidkjxwsukvkomof/sql/new).
Each returns either an empty result (clean) or a list of violations to
investigate.

```sql
-- Q1: Orphan inspections (no subsection_id)
SELECT id, site_id, inspection_date, status,
       json_data->'generalInfo'->>'shopNumber' AS shop_number,
       json_data->'generalInfo'->>'shopName'   AS shop_name,
       created_at
FROM public.inspections
WHERE subsection_id IS NULL
ORDER BY created_at DESC;

-- Q2: Inspections pointing at a deleted subsection
SELECT i.id, i.subsection_id, i.inspection_date, i.created_at
FROM public.inspections i
LEFT JOIN public.subsections s ON s.id = i.subsection_id
WHERE i.subsection_id IS NOT NULL
  AND s.id IS NULL;

-- Q3: Inspections whose site_id doesn't match the subsection's site_id
SELECT i.id, i.site_id AS inspection_site, s.site_id AS subsection_site,
       i.subsection_id, i.created_at
FROM public.inspections i
JOIN public.subsections s ON s.id = i.subsection_id
WHERE i.site_id <> s.site_id;

-- Q4: Photo URLs in inspection_items pointing at storage objects that don't exist
-- (Run carefully — requires storage.objects access; may need service_role.)
-- Pattern: extract photo refs from inspection_items.photo_urls JSONB,
-- LEFT JOIN against storage.objects on the resolved path.
-- See inspection_photo_refs and orphan_photo_refs views (referenced in DATABASE_MAP.md).
SELECT * FROM public.orphan_photo_refs LIMIT 100;

-- Q5: COC validations whose subsection_document is gone
-- NOTE (2026-05-26): the actual FK column is `document_id`, not
-- `subsection_document_id`. FK to subsection_documents already enforced.
SELECT cv.id, cv.document_id, cv.created_at
FROM public.coc_validations cv
LEFT JOIN public.subsection_documents sd ON sd.id = cv.document_id
WHERE cv.document_id IS NOT NULL AND sd.id IS NULL;

-- Q6: floor_plan_pins whose subsection or floor_plan parent is gone
SELECT fpp.id, fpp.floor_plan_id, fpp.created_at
FROM public.floor_plan_pins fpp
LEFT JOIN public.subsection_floor_plans sfp ON sfp.id = fpp.floor_plan_id
WHERE sfp.id IS NULL;

-- Q7: Snags pointing at a deleted subsection
SELECT s.id, s.subsection_id, s.created_at
FROM public.snags s
LEFT JOIN public.subsections sub ON sub.id = s.subsection_id
WHERE s.subsection_id IS NOT NULL
  AND sub.id IS NULL;

-- Q8: Inspection signatures whose parent inspection is gone
SELECT isig.id, isig.inspection_id, isig.created_at
FROM public.inspection_signatures isig
LEFT JOIN public.inspections i ON i.id = isig.inspection_id
WHERE i.id IS NULL;

-- Q9: Per-subsection inspection count comparison
-- App's "subsection inspections" view = Q9a + Q9b (the orphan fallback).
-- For each subsection, count what the strict join finds vs what the union finds.
SELECT
  s.id        AS subsection_id,
  s.name      AS subsection_name,
  s.site_id,
  (SELECT count(*) FROM public.inspections WHERE subsection_id = s.id) AS strict_count,
  (SELECT count(*) FROM public.inspections i
   WHERE i.subsection_id = s.id
      OR (i.subsection_id IS NULL
          AND i.site_id = s.site_id
          AND upper(regexp_replace(coalesce(
                i.json_data->'generalInfo'->>'shopNumber',
                i.json_data->'generalInfo'->>'shopName',
                i.shop_number,
                i.shop_name,
                ''), '[^A-Za-z0-9]', '', 'g'))
             = upper(regexp_replace(s.name, '[^A-Za-z0-9]', '', 'g')))
  ) AS strict_plus_orphan_count
FROM public.subsections s
ORDER BY s.site_id, s.name;
```

The Q9 query is the most important one: it directly answers
"how many inspections SHOULD this subsection show, and how many actually
link cleanly?" Any row where `strict_plus_orphan_count > strict_count`
is a subsection that currently relies on the runtime fallback.

**Output of Stage 1**: a markdown file at
`docs/integrity-audit/YYYY-MM-DD-scorecard.md` with one section per query,
counts, and a top-10 list of offending rows per query.

### Stage 2 — Living database inventory

Replace `docs/DATABASE_MAP.md` (or add a sibling `DATA_INVENTORY.md`) with
a regenerable artifact built from these queries:

```sql
-- For each client, summarise everything beneath:
SELECT c.id, c.name AS client_name,
       (SELECT count(*) FROM sites WHERE client_id = c.id) AS sites_count,
       (SELECT count(*) FROM subsections sub
        JOIN sites s ON s.id = sub.site_id WHERE s.client_id = c.id) AS subsections_count,
       (SELECT count(*) FROM inspections i
        JOIN sites s ON s.id = i.site_id WHERE s.client_id = c.id) AS inspections_count,
       (SELECT count(*) FROM site_documents sd
        JOIN sites s ON s.id = sd.site_id WHERE s.client_id = c.id) AS site_documents_count
FROM clients c
ORDER BY c.name;

-- Per-site detail with URL paths the app would build:
SELECT s.id, s.client_id, s.name AS site_name,
       '/clients/' || s.client_id || '/sites/' || s.id AS app_url,
       (SELECT count(*) FROM subsections WHERE site_id = s.id) AS subsections,
       (SELECT count(*) FROM inspections WHERE site_id = s.id) AS inspections,
       (SELECT count(*) FROM site_documents WHERE site_id = s.id) AS documents
FROM sites s
ORDER BY s.client_id, s.name;

-- Per-subsection inventory (links + counts):
SELECT sub.id, sub.site_id, sub.name,
       '/clients/' || s.client_id || '/sites/' || sub.site_id ||
         '/subsections/' || sub.id AS app_url,
       (SELECT count(*) FROM inspections WHERE subsection_id = sub.id) AS inspections,
       (SELECT count(*) FROM snags WHERE subsection_id = sub.id) AS snags,
       (SELECT count(*) FROM subsection_documents WHERE subsection_id = sub.id) AS documents
FROM subsections sub
JOIN sites s ON s.id = sub.site_id
ORDER BY s.client_id, sub.site_id, sub.name;

-- Per-inspection inventory (images + items):
SELECT i.id, i.subsection_id, i.site_id, i.inspection_date, i.status,
       '/clients/' || s.client_id || '/sites/' || i.site_id ||
         '/subsections/' || i.subsection_id ||
         '/inspections/' || i.id AS app_url,
       (SELECT count(*) FROM inspection_items WHERE inspection_id = i.id) AS items_count,
       (SELECT count(*) FROM inspection_items ii
        WHERE ii.inspection_id = i.id
          AND ii.photo_urls IS NOT NULL
          AND jsonb_array_length(ii.photo_urls) > 0) AS items_with_photos,
       (SELECT coalesce(sum(jsonb_array_length(ii.photo_urls)), 0)
        FROM inspection_items ii
        WHERE ii.inspection_id = i.id
          AND ii.photo_urls IS NOT NULL) AS total_photos
FROM inspections i
JOIN sites s ON s.id = i.site_id
ORDER BY i.created_at DESC;
```

**Output of Stage 2**: a regenerable script (`scripts/regenerate-inventory.sh`
or `.ts`) plus `docs/DATA_INVENTORY.md` checked in alongside it.

### Stage 3 — Root-cause analysis (web + iOS)

For each integrity gap class surfaced in Stage 1, trace it to the code
path that creates the bad state.

**Web code paths to inspect:**
- `src/views/subsection-detail/useSubsectionDetail.ts` — the orphan fallback
  (already integrated this session); confirm it works for all the gap classes
- `src/views/Inspections.tsx` — list view: does it use the same fallback or
  do strict joins?
- `src/views/InspectionDetail.tsx` — the photo-rendering path; how it reads
  `inspection_items.photo_urls` and resolves storage URLs
- Any Edge Function that creates or syncs inspections
  (`supabase/functions/` — likely none, since iOS owns sync)

**iOS code paths to inspect:**
- `/Users/arnomattheus/Documents/DEVELOPER/ECompliance/ECompliance/` —
  the SwiftData store
- Look for `performFullSync()` and the inspection push path specifically;
  per [[wm-compliance-supabase]] sync order is documented in DATABASE_MAP.md §3
- Specifically: when inspection is pushed to Supabase, is `subsection_id`
  resolved client-side from the SwiftData relation, or sent as NULL with
  shop_number/shop_name as a fallback hint? The latter is the bug.
- Photo upload path: do photos upload BEFORE the parent inspection row commits,
  or after? Race condition possible.

**Output of Stage 3**: a `docs/integrity-audit/root-causes.md` with one
section per gap class, code references, reproduction steps where applicable.

### Stage 4 — Prevention layer

Three layers, applied bottom-up.

1. **Database invariants** (irrefutable, server-side):
   - Add `FOREIGN KEY (subsection_id) REFERENCES subsections(id) ON DELETE SET NULL`
     to inspections — if it doesn't exist already (check first; orphans suggest it doesn't).
   - Consider promoting `subsection_id` to NOT NULL if iOS can be fixed to
     always populate it (Stage 3 dependent).
   - Add CHECK constraint: `inspection.site_id = subsection.site_id` via
     trigger (Postgres can't directly express cross-table CHECK).
   - FK + ON DELETE rules for floor_plan_pins, snags, signatures, inspection_items.
   - Ensure storage paths in `inspection_items.photo_urls` follow a predictable
     schema (e.g., `inspections/{inspection_id}/{photo_id}.jpg`) — if drift
     here, fix in iOS upload code.

2. **Verification layer** (observable, on-demand):
   - Create `public.v_integrity_violations` — a view that unions the Stage 1
     queries into a single result set: `kind | id | description | severity`.
   - Surface to admins in the web app: a "Data Integrity" page in the admin nav
     that shows current violations, with one-click remediation actions
     (e.g., "re-link this orphan to subsection X").
   - Scheduled check: Postgres cron (`pg_cron` extension) runs the view nightly
     and writes a snapshot to `integrity_violation_snapshots` so we can graph
     trends and detect regressions.

3. **iOS sync fixes** (whatever Stage 3 identifies):
   - Make `subsection_id` resolution mandatory before push — if the SwiftData
     model has the relation, use it; if not, look it up by shop name + site
     before the push attempt instead of pushing NULL.
   - Photo upload: ensure photo upload completion is awaited before the parent
     inspection row's `synced_at` is marked.
   - Add a sync-time invariant check that mirrors Q1–Q8 client-side and refuses
     to push rows that would violate them (fail fast at source).

**Output of Stage 4**: SQL migration file(s) in `supabase/migrations/`,
TypeScript changes in `src/`, Swift changes in `/ECompliance/`, plus a
release-checklist entry that the admin Data Integrity page is monitored
post-deploy.

## 3. Open scoping decisions for next session

- **Inventory output format**: markdown only, or also JSON/CSV for spreadsheet
  consumption? (Markdown only is fine if nobody else needs it.)
- **`v_integrity_violations` access**: admin-only via RLS, or also visible to
  contractors for their own data? (Default: admin-only.)
- **Promoting `subsection_id` to NOT NULL**: depends on whether Stage 3 confirms
  iOS can always populate it. Decide after Stage 3.
- **iOS app source location**: confirmed at
  `/Users/arnomattheus/Documents/DEVELOPER/ECompliance` — symlink to
  `/Volumes/Extreme SSD/DEVELOPER/ECompliance`. The external SSD must be mounted
  before Stage 3 work can begin.

## 4. Execution sequence

Recommended order per session:

| Session | Stage | Output | Status |
|---|---|---|---|
| 2026-05-26 | Stage 1 | [Scorecard](integrity-audit/2026-05-26-scorecard.md) | ✅ Done |
| Next | Stage 2 | Regenerable inventory script + initial DATA_INVENTORY.md | |
| +1 | Stage 3 | Root-cause document; one diagnosis per gap class | Needs SSD mounted |
| +2 | Stage 4a (DB invariants) | SQL migration + apply via SQL Editor | |
| +3 | Stage 4b (verification layer) | View + admin UI + cron | |
| +4 | Stage 4c (iOS sync fixes) | Swift changes + release | |

Each session is ~1-2 hours of focused work. Total: a week of evenings.

## 5. Related context

- [[wm-compliance-supabase]] memory entry — describes the shared Supabase project
- [[insight-linker-app-vercel]] memory entry — the Vercel project the web app
  deploys to; auto-deploy from GitHub push is currently broken, manual
  `vercel deploy --prod` required (separate TODO).
- `docs/DATABASE_MAP.md` — the existing static snapshot from 2026-05-22.
  Stage 2 should make this artifact regenerable rather than hand-edited.
- Commits this session that touched related code:
  - `109e0ee` — integrated Lovable's 84 commits; orphan fallback re-applied
    to `useSubsectionDetail.ts`
- Auth/EC modernisation is now fully live; the data-integrity work is unrelated
  but lives on the same codebase.
