# Stage 1 Diagnostic Scorecard — 2026-05-26

Source plan: [DATA_INTEGRITY_AUDIT_PLAN.md](../DATA_INTEGRITY_AUDIT_PLAN.md).
Supabase project: `oltzgidkjxwsukvkomof` (WM Compliance, production).
Run via Supabase SQL Editor as `postgres` role.

## Headline numbers

| # | Check | Total | Severity |
|---|---|--:|---|
| Q1 | Orphan inspections (`subsection_id IS NULL`) | **233** | High |
| Q2 | Inspections pointing at a deleted subsection | 0 | — |
| Q3 | Inspections where `site_id` ≠ subsection's `site_id` | 0 | — |
| Q4 | Photo refs whose storage object is missing | **103** | High |
| Q5 | `coc_validations` with missing `document_id` parent | 0 | — |
| Q6 | `floor_plan_pins` with missing parent | 0 | — |
| Q7 | Snags pointing at a deleted subsection | 0 | — |
| Q8 | Inspection signatures whose parent inspection is gone | 0 | — |
| Q9 | Subsections relying on the orphan name-match fallback | **3** (of 1,359) | Medium |

**Two material gaps: orphan inspections (Q1) and missing photo storage objects (Q4).** Everything else is clean — the existing FKs are doing their job on the relations they cover.

## Q1 — Orphan inspections (233)

The plan correctly identified the symptom. 233 inspections (~18% of the 1,290-ish total inspections — Q9 shows 1,055 strict-linked + 233 orphan ≈ 1,288 by addition) have `subsection_id IS NULL`.

### Identifying info on orphans

Only a fraction carry enough metadata to be re-linked by name:

| Where shop info lives | Orphans with it populated |
|---|--:|
| `json_data->'generalInfo'->>'shopNumber'` | 2 |
| `json_data->'generalInfo'->>'shopName'` | 2 |
| top-level `inspections.shop_number` column | 58 |
| top-level `inspections.shop_name` column | 58 |
| **Any of the above** | **60** |
| **Nothing — completely dark** | **173** |

> 173 of the 233 orphan inspections have no shop name or number anywhere — they are not recoverable by the current fallback path in [useSubsectionDetail.ts:366–399](../../src/views/subsection-detail/useSubsectionDetail.ts).

### Orphans by site (top 15)

| Site | Orphans |
|---|--:|
| Evaton Mall | 87 |
| PRINCE BUTHELEZI MALL, EMPANGENI | 54 |
| Fourways Value Mart | 23 |
| Palm Springs | 11 |
| 204 Oxford | 10 |
| Segonyana | 7 |
| Mutsindo Mall & Capricorn Plaza | 6 |
| YARONA CENTRE | 6 |
| Flamwood Walk | 5 |
| Mafikeng (Mahikeng) Station | 5 |
| Equinox Mall Jeffreys Bay | 4 |
| Flamwood Value Centre | 3 |
| Thembi Mall | 3 |
| Biyela Shopping Centre | 2 |
| Pantry | 2 |

Spread across 20+ sites — this is systemic, not a one-off bad sync.

### Top 10 most recent orphans

| id (8) | site (8) | inspection_date | status | created_at |
|---|---|---|---|---|
| 83c1351f | ea4282e4 | 2026-03-24 | Completed | 2026-03-24T09:51:32 |
| 73e8bdc2 | ea4282e4 | 2026-03-23 | Completed | 2026-03-23T09:33:40 |
| 013a465a | ea4282e4 | 2026-03-23 | Pending   | 2026-03-23T09:22:35 |
| 1c6d3a8c | ea4282e4 | 2026-03-23 | Completed | 2026-03-23T08:00:12 |
| 33eaa30d | ea4282e4 | 2026-02-24 | Pending   | 2026-02-24T09:05:21 |
| 8c7c3d1e | b60ba713 | 2026-02-09 | Completed | 2026-02-09T08:40:03 |
| 13a60406 | b60ba713 | 2026-02-06 | Completed | 2026-02-09T05:27:50 |
| fa89bd06 | b60ba713 | 2026-02-04 | Completed | 2026-02-05T10:05:25 |
| 4114b2d5 | ea4282e4 | 2026-02-04 | Pending   | 2026-02-04T03:14:43 |
| a1739f72 | b60ba713 | 2026-02-02 | Completed | 2026-01-28T10:45:58 |

All ten have `shop_number = NULL` and `shop_name = NULL` in `json_data.generalInfo`. (Some may still have values in the columnar `shop_number`/`shop_name` fields — Stage 3 needs to confirm what the iOS sync is actually pushing.)

## Q4 — Orphan photo refs (103)

103 entries in `public.orphan_photo_refs` view — inspection_items with `photo_urls` pointing at storage paths that do not exist in the `inspection-photos` bucket.

Pattern of top 10:

| inspection (8) | sub (8) | inspection title | object_path prefix |
|---|---|---|---|
| ff949715 | 170f2e01 | Generator Installation Inspection | `ff949715-…/generatorIntegration/tieInBreakerSize/1771492141136_1.jpg` |
| da25057b | 91ec8291 | Electrical Main Board (EMB) Inspection | `da25057b-…/physicalSafetyChecks/doorLocks/1760698710250-1.jpg` |
| 7f8c6350 | NULL    | Electrical Main Board (EMB) Inspection | `7f8c6350-…/0/0/1770119243631_1.jpg` |
| 7f8c6350 | NULL    | ″ | `7f8c6350-…/0/1/1770119257803_1.jpg` |
| 7f8c6350 | NULL    | ″ | `7f8c6350-…/0/3/1770119269734_1.jpg` |
| 7f8c6350 | NULL    | ″ | `7f8c6350-…/0/4/1770119278185_1.jpg` |
| 7f8c6350 | NULL    | ″ | `7f8c6350-…/1/0/1770119308538_1.jpg` |
| 7f8c6350 | NULL    | ″ | `7f8c6350-…/1/1/1770119318165_1.jpg` |
| 7f8c6350 | NULL    | ″ | `7f8c6350-…/1/2/1770119337116_1.jpg` |
| 7f8c6350 | NULL    | ″ | `7f8c6350-…/1/3/1770119359458_1.jpg` |

Observations:
- Inspection `7f8c6350` accounts for 8 of the top 10 — a single inspection whose photos never uploaded, but whose `photo_urls` JSONB was written anyway. **Race condition: row committed before photos finished uploading.**
- The `0/0`, `0/1`, `1/0` path segments are numeric indices, not category keys — different code path from the `generatorIntegration/tieInBreakerSize/…` style. Two different photo path schemas in use; one is more brittle than the other.
- `7f8c6350` is also an orphan inspection (Q1) — orphan inspections and orphan photos overlap.

## Q9 — Strict vs orphan-fallback per subsection

Population-level totals across all 1,359 subsections:

| Metric | Value |
|---|--:|
| Subsections in DB | 1,359 |
| Inspections linked via strict `subsection_id` | 1,055 |
| Inspections counted with orphan-name fallback | 1,058 |
| Orphan inspections re-attached by the fallback | **3 of 233** (1.3%) |

**The runtime fallback in [useSubsectionDetail.ts:366–399](../../src/views/subsection-detail/useSubsectionDetail.ts) is solving ~1% of the orphan problem.** The other 230 orphan inspections remain invisible in the subsection-detail view today, which matches the recurring symptom the user is reporting.

Subsections that gain inspections from the fallback:

| subsection_id (8) | name | site (8) | strict | strict+orphan | extra |
|---|---|---|--:|--:|--:|
| 32f07c96 | SHOP SH G07 | 45c4171e (204 Oxford) | 0 | 1 | +1 |
| 37b398cf | Shop 37     | d4bca5d1 (Biyela)     | 1 | 2 | +1 |
| b2c455dc | Shop 31/32  | d4bca5d1 (Biyela)     | 1 | 2 | +1 |

## Notes on plan deviations

- **Q5 in the plan referenced `coc_validations.subsection_document_id` — that column does not exist.** The actual FK is `coc_validations.document_id → subsection_documents.id` (and it's enforced). I corrected the query and confirmed 0 violations. The plan doc should be updated.
- **`public.orphan_photo_refs` view exists** (alongside `inspection_photo_refs`) — Stage 1 Q4 could use it directly without service-role. No action needed beyond running it.

## What this means for the next stages

- **Stage 3 (iOS root cause)** is now the highest-leverage next step. We need to know why ~18% of inspections push with `subsection_id = NULL` *and* why 173 of those have no recoverable shop name. Likely places:
  - SwiftData inspection model's `subsection` relation not being read at push time.
  - A code path that creates a new inspection from "shop number only" entry and never resolves it.
  - Validation that lets `Completed` status be set on rows missing a subsection (most orphans are `Completed`).
- **Stage 4a (DB invariants)** — the orphan-inspection FK is *not* enforcing NOT NULL on `subsection_id`. Confirming this and deciding whether to promote it to NOT NULL depends on Stage 3 (can iOS always populate it?).
- **Q4 (photos)** suggests two separate fixes: (a) make photo upload atomic with parent row commit, (b) reconcile the two path schemas (`category/key/…` vs `0/0/…`).
- **Q1 numbers won't shrink on their own** — even after the iOS sync is fixed, the 233 existing orphans need either re-linking (60 with identifying info → admin remediation UI) or archival (173 dark → ask user).

## Open scoping questions — current answers

From DATA_INTEGRITY_AUDIT_PLAN.md §3:

- **iOS source path:** confirmed at `/Users/arnomattheus/Documents/DEVELOPER/ECompliance` — symlink to `/Volumes/Extreme SSD/DEVELOPER/ECompliance`. **External SSD not currently mounted** — Stage 3 will need it plugged in.
- **Inventory output format (Stage 2):** still open.
- **`v_integrity_violations` access (Stage 4b):** still open.
- **Promote `subsection_id` to NOT NULL:** still blocked on Stage 3.

## How this was produced

All Q1–Q9 queries executed in the Supabase SQL Editor via a Chrome MCP–driven session. Each query was wrapped in the pattern:

```sql
WITH base AS (<diagnostic select>)
SELECT '<marker>' AS marker,
  (SELECT count(*) FROM base)::int AS total,
  (SELECT json_agg(t) FROM (SELECT * FROM base ORDER BY <key> DESC LIMIT 10) t) AS top10;
```

to return both the population count and the top offenders in a single round trip, working around the editor's 100-row display cap.
