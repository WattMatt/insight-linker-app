# Stage 4 — Strategy and Sequenced Plan

> **Source:** [DATA_INTEGRITY_AUDIT_PLAN.md](../DATA_INTEGRITY_AUDIT_PLAN.md)
> **Stage 1:** [2026-05-26-scorecard.md](./2026-05-26-scorecard.md)
> **Stage 3:** [root-causes.md](./root-causes.md)
> **Scope:** firm decisions and end-to-end sequencing for Stage 4a + 4b + 4c + 4d.
> No migration SQL or app code in this document — those land in Stage 4c branches.

## TL;DR — decisions ratified

| # | Decision | Why |
|---|---|---|
| 1 | **Proposal-table pattern** for remediation. Live `inspections` never destructively mutated until per-row apply step. | Explicit per-row revert. No drift risk from a shadow table. Status workflow visible without diffing. |
| 2 | **Hybrid handling of 173 dark orphans.** Recent + Completed at the four top-affected sites → inspector outreach. Rest → reversible archive. | Outreach effort proportional to recoverable value. No bulk deletion. |
| 3 | **Confidence-banded approval.** ≥95 → auto-approve with 5% manual sample. 90 → batch review. <90 → row-by-row manual review. | Avoids burning admin time on certain matches; preserves judgment for ambiguous ones. |
| 4 | **iOS fix for finding (a) ships first.** Single-line coalescing read in `ServicesSupabaseSyncService.swift:803` plus nil-guard log. No UX change. | Stops the bleed before remediation starts — prevents the population from regrowing. |
| 5 | **`inspections.subsection_id` NOT NULL** gates on zero new orphans for 30 consecutive days *after* Stage 4c (a) and (b) ship. | Promotes the invariant only when iOS proves it can hold it. |
| 6 | **Satisfaction window of 14 days per applied batch.** >1% revert rate triggers escalation to row-by-row review for subsequent batches. | Catches systemic miscategorisation early; keeps low-risk batches moving. |
| 7 | **Finding (e) handled by a separate web-app audit pass (Stage 4d).** Out of scope for iOS Stage 4c. | The schemas originate in `insight-linker-app`, not iOS. Different repo, different fix path. |

Everything below is implementation of these seven decisions.

---

## Why proposal-table, not shadow-table

Considered four staging patterns. Locking in proposal-table:

| Pattern | Strength | Weakness | Decision |
|---|---|---|---|
| **Proposal table** (chosen) | Explicit per-row revert. Status enum surfaces workflow. Live table writes gated behind apply step. | Two-step apply requires a small SQL function. | ✓ |
| Shadow table (`inspections_remediated`) | Easy diff via `JOIN`. | Doubles every write during window. Drift if rules change. Bulk swap is destructive at cutover. | ✗ |
| In-place versioning columns (`proposed_*` on `inspections`) | Single table. | Pollutes the production schema with audit fields. Hard to drop cleanly later. | ✗ |
| Archive-first (snapshot before write) | Simple "before" trail. | No staging of proposed values — admin can't review before commit. | ✗ |

Proposal table wins because the satisfaction-window requirement maps directly onto its status enum (`pending_review → approved → applied → (optional) reverted`). No other pattern gives that workflow cleanly.

---

## The proposal table — schema sketch

```
CREATE SCHEMA IF NOT EXISTS integrity;

CREATE TABLE integrity.inspection_remediation_proposals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The orphan we're proposing to fix
  inspection_id           uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,

  -- Snapshot of the live row at discovery time (so apply is idempotent and revert is exact)
  original_subsection_id  uuid,        -- always NULL for this batch
  original_site_id        uuid,
  original_shop_name      text,
  original_shop_number    text,

  -- What we propose to write to the live row
  proposed_subsection_id  uuid REFERENCES subsections(id),
  proposed_site_id        uuid REFERENCES sites(id),
  proposed_shop_name      text,
  proposed_shop_number    text,

  -- Why we propose this
  confidence              int NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  evidence                jsonb NOT NULL,   -- {rule: "shop_number_exact", matched: "SH G07", ...}
  source                  text NOT NULL,    -- 'fuzzy_match' | 'inspector_outreach' | 'manual'

  -- Workflow state
  status                  text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','approved','rejected','applied','reverted','superseded')),
  reviewed_by             text,
  reviewed_at             timestamptz,
  applied_at              timestamptz,
  reverted_at             timestamptz,
  notes                   text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX ON integrity.inspection_remediation_proposals (status);
CREATE INDEX ON integrity.inspection_remediation_proposals (inspection_id);
```

**Apply function** (sketch — for Stage 4c implementation):

```
CREATE OR REPLACE FUNCTION integrity.apply_remediation_proposal(p_id uuid) RETURNS void AS $$
DECLARE r integrity.inspection_remediation_proposals%ROWTYPE;
BEGIN
  SELECT * INTO r FROM integrity.inspection_remediation_proposals
   WHERE id = p_id AND status = 'approved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal not approved or not found'; END IF;

  UPDATE inspections
     SET subsection_id = COALESCE(r.proposed_subsection_id, subsection_id),
         site_id       = COALESCE(r.proposed_site_id,       site_id),
         shop_name     = COALESCE(r.proposed_shop_name,     shop_name),
         shop_number   = COALESCE(r.proposed_shop_number,   shop_number),
         updated_at    = now()
   WHERE id = r.inspection_id;

  UPDATE integrity.inspection_remediation_proposals
     SET status = 'applied', applied_at = now() WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Revert function** (mirror — one SQL call per row):

```
CREATE OR REPLACE FUNCTION integrity.revert_remediation_proposal(p_id uuid) RETURNS void AS $$
DECLARE r integrity.inspection_remediation_proposals%ROWTYPE;
BEGIN
  SELECT * INTO r FROM integrity.inspection_remediation_proposals
   WHERE id = p_id AND status = 'applied' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal not applied or not found'; END IF;

  UPDATE inspections
     SET subsection_id = r.original_subsection_id,
         site_id       = r.original_site_id,
         shop_name     = r.original_shop_name,
         shop_number   = r.original_shop_number,
         updated_at    = now()
   WHERE id = r.inspection_id;

  UPDATE integrity.inspection_remediation_proposals
     SET status = 'reverted', reverted_at = now() WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Apply and revert are symmetric, idempotent, and audited via the row's status timeline.

---

## Phase 1 — Discovery (Week 1, parallel with Stage 4c-1)

### Owner

DB / web team. No iOS work. No app shipping required.

### Steps

1. Create `integrity` schema and `inspection_remediation_proposals` table.
2. Run the **fuzzy-match SQL** (see root-causes.md follow-up / scorecard supplement) — generates one proposal row per orphan that has a candidate match at confidence ≥ 60. The `evidence` jsonb explains the match rule.
3. Run a **dark-orphan tagger** — for orphans with no shop info anywhere, write a proposal with `proposed_subsection_id = NULL`, `source = 'needs_decision'`, `status = 'pending_review'`, `confidence = 0`. These won't be applied; they're parked for Phase 3.

### Expected output

| Confidence band | Expected rows | Treatment |
|---|--:|---|
| 100 (name exact) | ~3 (per scorecard Q9) | Auto-approve |
| 95 ("Shop {n}" exact) | ~25 (estimate; confirm in Phase 1) | Auto-approve |
| 90 (number exact) | ~10–20 | Auto-approve |
| 70 (substring) | ~5–10 | Batch review |
| 60 (number-in-name regex) | ~5 | Manual review |
| 0 (no candidate) | 173 | Park for Phase 3 |

Total ~55–65 candidates at ≥60 confidence + 173 dark = 233 total proposal rows.

### Acceptance criteria for Phase 1

- Total `integrity.inspection_remediation_proposals.inspection_id` distinct count = 233.
- No live `inspections` row mutated.
- Confidence distribution reported in plain English to user before Phase 2 begins.

---

## Phase 2 — Review and apply (Weeks 2–3)

### Auto-approve sweep (week 2, day 1)

```
UPDATE integrity.inspection_remediation_proposals
   SET status = 'approved', reviewed_by = 'auto', reviewed_at = now(),
       notes = 'auto-approved: confidence >= 95'
 WHERE status = 'pending_review' AND confidence >= 95;
```

Then sample 5% of those for manual spot-check. If any sample is wrong, revert it and demote the rule that produced it.

### Manual review of 60–94 (week 2)

Admin UI (or a Supabase view) lists pending rows with: inspection ID, original shop_name/shop_number, proposed subsection name, evidence, confidence. Reviewer picks Approve / Reject / Reassign. Reassign creates a new proposal at confidence = 100 with `source = 'manual'`.

This step targets the same admin person who knows the building portfolio — probably the user (you). Time estimate: ~5 minutes per row × 15 rows = 75 minutes.

### Apply batch 1 — confidence 100 (week 2, day 3)

Apply all `status = 'approved' AND confidence = 100`. Wait 7 days for revert signals. Acceptance: zero reverts.

### Apply batch 2 — confidence 95 (week 3, day 3)

Same drill. 7-day window. >1% revert rate → halt and demote rule.

### Apply batch 3 — confidence 90 (week 4, day 3)

Same drill.

### Apply batch 4 — confidence 60–70 (week 5, day 3)

Same drill. These are the brittle ones; smaller batches if needed.

### Acceptance criteria for Phase 2

- All proposals at confidence ≥ 60 either `applied` or `rejected`.
- Cumulative revert rate < 1%.
- A weekly report shows: applied count by band, revert count, residual orphan count.

---

## Phase 3 — Dark orphan resolution (Weeks 4–5)

### Triage rule

Among the 173 dark orphans, split by:

| Bucket | Criteria | Action |
|---|---|---|
| **Recent + Completed at top sites** | `status = 'Completed' AND created_at > now() - interval '90 days' AND site_id IN (Evaton, Prince Buthelezi, Fourways, Palm Springs)` | **Inspector outreach** — generate CSV, hand to ops, contact inspector |
| **Older Completed** | created_at older than 90 days, any site | Archive (reversible) |
| **Pending / In Progress** | `status IN ('Pending','In Progress')` | Archive (reversible) — they're stale, no real value |
| **Failed / Rejected** | any | Archive — already non-actionable |

Expected split (estimate from scorecard top-15 by site):

- Top-4-site Completed within 90 days: ~80–110 rows
- Older Completed: ~50–70 rows
- Pending/In Progress: ~5–10 rows
- Failed/Rejected: small

### Inspector-outreach workflow

1. Generate CSV from the dark-orphan proposals tagged "recent + top site + Completed".
2. Per row: inspection ID, site name, inspection date, inspector name (from `inspections.inspector_name`), inspection title.
3. Hand to ops. Ops contacts each inspector — "you completed an inspection at Evaton Mall on 2026-04-12 titled 'X' — which shop was this?"
4. Reply lands as a manual proposal: `source = 'inspector_outreach'`, `confidence = 100`, `evidence = {'inspector': 'name', 'reply_date': '...'}`.
5. Apply via the same proposal flow.

### Archive flow

Create `integrity.archived_inspections` table (full row copy of `inspections` schema). For each archive-bound proposal:

```
INSERT INTO integrity.archived_inspections SELECT * FROM inspections WHERE id = r.inspection_id;
DELETE FROM inspections WHERE id = r.inspection_id;
UPDATE integrity.inspection_remediation_proposals SET status = 'applied', applied_at = now() WHERE id = r.id;
```

Reverse path (single proposal): re-INSERT into `inspections`, DELETE from `archived_inspections`, set status = 'reverted'.

### Acceptance criteria for Phase 3

- All 173 dark orphans either archived or recovered via inspector outreach.
- `integrity.archived_inspections` count exactly matches the archived subset.
- No `subsection_id IS NULL` rows remain in `inspections`.

---

## Phase 4 — Cleanup and Stage 4a unblock (Week 6+)

### Cleanup checklist

- [ ] Live `inspections` table has zero `subsection_id IS NULL` rows.
- [ ] 30 consecutive days have passed with **zero new orphans** (proves Stage 4c (a) + (b) are working — see sequencing below).
- [ ] Cumulative revert rate < 1% across all batches.
- [ ] Proposal table moved to `integrity_archive` schema (rename, do not drop — audit trail forever).

### Stage 4a — promote to NOT NULL

Only at this point:

```
ALTER TABLE inspections ALTER COLUMN subsection_id SET NOT NULL;
```

If this fails, an orphan was created during the window → halt, investigate, fix Stage 4c regression, repeat.

---

## Sequencing with Stage 4c (iOS code fixes)

The five Stage 4c units of work (from root-causes.md) sequence as:

| Week | Stage 4c work | Stage 4b work | Blocks |
|---|---|---|---|
| 1 | **(a) push-DTO coalescing read + nil guard** — single line, no UX change. Ship to TestFlight. | Phase 1 discovery | Promotes confidence in Stage 4b that the population won't regrow. |
| 1 | **(d) photo capture sentinel** — local-path no longer written to `photoURLs`; uses `pending://{photo.id}` sentinel that the synthesiser strips. No UX change. | (Photo work unrelated to subsection work, can run parallel.) | — |
| 2 | (a) and (d) promoted to App Store. | Phase 2 auto-approve + batch 1 apply | — |
| 2–3 | **(b) creation flow gate.** Requires UX call (this doc assumes: "must pick a subsection or save as draft" — confirm with you). | Phase 2 manual review + batch 2 apply | UX decision. |
| 3–4 | **(c) completion validator unification** — hoist `markInspectionComplete` validator, call it from `SubsectionDetailView` and `EditInspectionView`, add subsection presence check. | Phase 2 batches 3 + 4 | — |
| 4 | Docs comment fix in `Inspection.swift:22-23`. | Phase 3 dark-orphan outreach | — |
| 5–6 | (Maintenance + bug-fix on (a)–(d) as field reports come in.) | Phase 4 cleanup | 30-day-no-orphans clock starts. |
| 7+ | — | Stage 4a NOT NULL promotion | — |

**Hard sequencing constraint:** Stage 4c (a) and (b) must both be in production before the 30-day-no-orphans clock starts. (a) alone fixes the divergence pattern; (b) alone prevents the no-context creation path. Both are needed.

---

## Stage 4d — web-app audit (separate, kicks off Week 1)

Out of scope for this Stage 4 series. Filed as a separate sibling audit:

- Repo: `WattMatt/insight-linker-app`
- Question: locate the two photo-upload paths that produce `category/key/{timestamp}_N.jpg` and `0/0/{timestamp}_N.jpg`.
- Deliverable: `insight-linker-app/docs/integrity-audit/web-app-root-causes.md`.
- Sequencing: independent of 4a/4b/4c. Spawn in parallel.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Fuzzy match assigns to wrong subsection at confidence 90 | Medium | Medium (one bad row visible to inspector) | 14-day satisfaction window per batch + 5% spot check + per-row revert function |
| Inspector outreach yields nothing for old orphans | High | Low (those rows archive instead) | Archive is reversible; outreach is opportunistic, not blocking |
| Stage 4c (a) regression re-creates orphans during Phase 2 | Low | High (population grows during cleanup) | 30-day-no-orphans gate before Stage 4a NOT NULL; daily orphan count monitor with alert on increase |
| Stage 4c (b) UX gate rejected by user as too strict | Medium | Medium (no-context creation re-introduced) | Fall-back design: create as "draft" status that cannot be marked Completed without subsection; non-blocking on first save |
| Proposal table itself becomes the source of truth and we forget to apply | Low | Low | Weekly report shows `pending_review` count; alert if > 7 days stale |
| Web-app continues writing NULL `subsection_id` after iOS fixed | Unknown | High | Stage 4d audit covers this; until 4d done, Stage 4a NOT NULL is blocked even after 4b complete |

---

## Acceptance summary

Stage 4 is complete when ALL of the following hold simultaneously:

- [ ] `SELECT count(*) FROM inspections WHERE subsection_id IS NULL` returns 0.
- [ ] `inspections.subsection_id` is `NOT NULL` (Stage 4a applied).
- [ ] iOS App Store release contains Stage 4c (a) + (b) + (c) + (d) fixes.
- [ ] Stage 4d audit complete and any web-app fixes shipped.
- [ ] `integrity.inspection_remediation_proposals` has no `pending_review` or `approved` rows.
- [ ] 30 consecutive days with zero new orphan inspections.

When all six are true, the audit closes. Stage 4 docs move to `docs/integrity-audit/closed/` with a final summary.

---

## What I need from you

To unblock work this week:

1. **Confirm the UX call for finding (b).** Default in this plan: the global "+" buttons gate on subsection selection (or create as "draft" status that cannot be Completed). Override if you want different.
2. **Confirm inspector-outreach ownership.** Default: ops team. Override if it's you doing it directly.
3. **Confirm Stage 4a NOT NULL gate at 30 days post-fix.** Default: 30 days. Override if you want 14 (faster, riskier) or 60 (slower, safer).

Defaults stand unless you override. I'll proceed to Stage 4c implementation (starting with finding (a) — single-line fix) once you say go.
