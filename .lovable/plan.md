
# Why Shop 8 (and others) don't appear

I queried the database directly. Here is the exact picture for **Biyela Shopping Centre** (`d4bca5d1-…`):

- 13 inspections total are linked to the site
- 8 are properly linked to a subsection (Generator, SHOP 36, SHOP 30, SHOP 38, SHOP 39A, SHOP 35, SHOP 34, SHOP UNIT 2)
- **5 inspections have `subsection_id = NULL`** — they are orphaned at the DB level even though the inspection data itself is complete

The 5 orphans, with the shop info embedded in their `json_data.generalInfo`:

```text
SHOP 39B    – HUMBLE HEALTH
SHOP UNIT 3&4 – DR IYER
SHOP 37     – BRAYDEN FINANCE
SHOP 31-32  – YORDI LINEN
SHOP 33     – HERITAGE SHOP
```

Each orphan carries the original Firebase key in `json_data.subsectionId` (e.g. `-OVrEpDuMbzpOQOdEKTC`). Supabase subsections use UUIDs, so the join silently fails and the inspection disappears from the subsection page.

**About Shop 8 specifically:** there is currently no inspection in the database that references "Shop 8" — not on the linked subsection (`6e6b18aa-…`), not in any orphan, not in any other Biyela site. So Shop 8's "completed" inspection either:

1. lives in the mobile app and was never synced to Supabase, **or**
2. was created/orphaned under a different shop label we'd surface once we run the relink + audit below.

We need both: (a) a permanent mapping so future syncs don't orphan, and (b) a one-time audit to find / repair existing orphans (including locating the missing Shop 8 record).

---

## Plan

### 1. One-time orphan repair (SQL migration)

Build a relink routine that, for every inspection where `subsection_id IS NULL`:

```text
a. Read json_data.generalInfo.shopNumber and shopName
b. Find subsections WHERE site_id = inspection.site_id
   AND normalize(name) = normalize(shopNumber)
   (normalize = upper, strip spaces/punctuation, collapse "SHOP")
c. If exactly one match → UPDATE inspections.subsection_id
d. If 0 or >1 matches → log to a new
   inspection_relink_audit table for manual review
```

Also build a secondary pass using `json_data.subsectionId` (Firebase key) by looking it up against `subsections.firebase_id` if that column exists — if not, we skip this pass.

### 2. Persistent Firebase-key → Subsection-id map

Add (if missing) `subsections.firebase_id text` and backfill it from `inspections.json_data.subsectionId` where we can confidently associate them via the shop-number match above. This makes future syncs deterministic.

### 3. Sync-time guard (edge function or trigger)

Update the inspection insert path so that whenever `subsection_id` is NULL but `json_data.subsectionId` or `json_data.generalInfo.shopNumber` is present, the same resolver runs **before** the row is committed. No new orphans get created.

### 4. UI fallback (defensive)

In `SubsectionDetail` (admin) and `ClientPortalSubsectionDetail`, expand the inspections query so it also returns rows where:

```text
inspections.site_id = current.site_id
AND inspections.subsection_id IS NULL
AND normalize(json_data->generalInfo->>shopNumber) = normalize(subsection.name)
```

Render those with a small "needs relink" badge so users see the data immediately even before the migration runs.

### 5. Audit & report

After the repair migration runs, output a report:

```text
- total inspections scanned
- relinked automatically
- still orphaned (with reason: no match / multiple matches)
- per-site breakdown
```

Surface this under `Admin → Settings → Data Integrity` so future drift is visible.

### 6. Verify Shop 8 specifically

Once steps 1–5 are live, re-run the audit. If Shop 8 still has zero inspections, the record never reached Supabase — we then check the mobile app's outbound sync queue (`src/services/queue` / offline DB) for a pending Shop 8 inspection and force-push it.

---

## Technical details

- **Tables touched:** `inspections` (UPDATE subsection_id), `subsections` (add `firebase_id` column if absent), new table `inspection_relink_audit (id, inspection_id, site_id, attempted_match, match_count, resolution, created_at)`
- **Normalization SQL:** `regexp_replace(upper(trim(value)), '[^A-Z0-9]', '', 'g')`
- **Files to update:**
  - `supabase/migrations/<new>.sql` — schema + relink routine
  - `supabase/functions/<sync-or-insert>/index.ts` — pre-insert resolver
  - `src/pages/SubsectionDetail.tsx` + `src/pages/ClientPortalSubsectionDetail.tsx` — fallback query + badge
  - `src/pages/ContractorSubsectionDetail.tsx` — same fallback
- **No destructive changes:** existing `subsection_id` values are never overwritten; we only fill NULLs.

## Open questions

1. Do you want the orphan UI fallback (step 4) live immediately, or only after the migration cleans most cases?
2. For multi-match cases (e.g. a site with both "Shop 11" and "SHOP 11"), should we prefer most-recently-created subsection, or always flag for manual review?
3. Should the audit report be a new page, or just a CSV export from settings?
