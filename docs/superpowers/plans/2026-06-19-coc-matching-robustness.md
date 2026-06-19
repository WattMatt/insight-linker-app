# Site COC matching robustness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Live banner count, non-destructive re-run auto-match, re-import that preserves
resolutions, and a higher-quality matcher — all frontend-only, no schema changes.

**Spec:** `docs/superpowers/specs/2026-06-19-coc-matching-robustness-design.md`

**Tech:** React + TS, Vitest. Gate: `npm run build` + `npx vitest run`.

---

## Task 1: Matcher quality (pure libs)

**Files:** Modify `src/lib/siteCoc/normalize.ts`, `src/lib/siteCoc/ingest.ts`; tests
`normalize.test.ts`, `ingest.test.ts`.

- [ ] **1.1** `normalize.test.ts`: add a case — `normShop("FISH & CHIPS") === "FISH AND CHIPS"` and
  `normShop("A&B") === "A AND B"`.
- [ ] **1.2** Implement: in `normShop`, replace `&` with ` AND ` *before* collapsing whitespace.
- [ ] **1.3** `ingest.test.ts`: add cases for the new `matchSubsection`:
  - longest-match-wins: trade "SHOPRITE LIQUOR SHOP" with subs `SHOPRITE` + `SHOPRITE LIQUOR` →
    returns SHOPRITE LIQUOR.
  - &↔AND: trade "FISH & CHIPS CITY" with sub `FISH AND CHIPS` → returns it.
  - word-boundary guard: trade "PEPPER STEAK" with sub `PEP` → returns null (no partial-word match).
  - no-regression: trade "ABSA BANK LIMITED" with sub name `ATM` tenant `ABSA` → returns the ATM sub.
  - ambiguous tie still null: trade "X" matching two different subs at equal key length → null.
- [ ] **1.4** Rewrite `matchSubsection` contains-fallback: for each subsection, the longest key
  (len ≥ 3) that is a **whole-word run** in `normShop(trading_name)`; collect per-subsection best
  lengths; return the unique subsection at the max length (tie or none → null). Keep the exact step
  unchanged. Add a local `wordRun(haystack, key)` using `(?:^|\s)<escaped>(?:$|\s)` and an
  `escapeRegExp` helper.
- [ ] **1.5** `npx vitest run src/lib/siteCoc/normalize.test.ts src/lib/siteCoc/ingest.test.ts` — all pass.
- [ ] **1.6** Commit.

## Task 2: Live counts + applyPriorMatches (pure libs)

**Files:** Modify `src/lib/siteCoc/coverage.ts`; create `src/lib/siteCoc/reimport.ts`; tests
`coverage.test.ts`, `reimport.test.ts`.

- [ ] **2.1** `coverage.test.ts`: `liveMatchCounts([{subsection_id:'a'},{subsection_id:null}])`
  → `{matched:1, unmatched:1}`.
- [ ] **2.2** Implement `liveMatchCounts(rows)` in `coverage.ts`.
- [ ] **2.3** `reimport.test.ts`: `applyPriorMatches(newRows, priorMap, validIds)`:
  - a new row that is unmatched but whose `normShop(shop)` is in priorMap (and the prior id is in
    validIds) gets that subsection + `match_status:"matched"`.
  - an already-matched new row is left unchanged (auto-match wins, not overwritten).
  - a prior id not in validIds (subsection deleted) is ignored.
- [ ] **2.4** Implement `applyPriorMatches` in `reimport.ts` (pure; uses `normShop`).
- [ ] **2.5** `npx vitest run src/lib/siteCoc/coverage.test.ts src/lib/siteCoc/reimport.test.ts` — pass.
- [ ] **2.6** Commit.

## Task 3: Wire hooks (re-run auto-match, normalized cert stamping, preserve-on-reimport)

**Files:** Modify `src/views/site-coc/useSiteCoc.ts`, `src/views/site-coc/useSiteCocImport.ts`.

- [ ] **3.1** `useSiteCoc.ts`: add a shared `stampMatch(scheduleRowId, shopNoRaw, subsectionId)` that
  updates the schedule row by id and the certificates by **id** (computed from the loaded
  `certificates` via `normShop` equality — fixes L5). Rewrite `resolveShop` to call it + refetch.
- [ ] **3.2** `useSiteCoc.ts`: add `rerunAutoMatch()` — for each schedule row with no `subsection_id`,
  compute `matchSubsection({shop_no_raw, trading_name}, subsections)`; for hits, `stampMatch`; one
  refetch at the end; return a count of newly matched. Toast handled in the caller.
- [ ] **3.3** `useSiteCocImport.ts`: before the delete (line ~72), query existing
  `coc_db_schedule(shop_no_raw, subsection_id)` for the site, build `normShop→subsection_id` for
  matched rows; after `assembleScheduleRows`, run `applyPriorMatches(schedRows, priorMap, subIdSet)`
  where `subIdSet` = ids from `subsLite`; then derive `certRows`/`summary` from the adjusted rows.
- [ ] **3.4** `npm run build` — succeeds.
- [ ] **3.5** Commit.

## Task 4: UI — live banner + Re-run button

**Files:** Modify `src/views/site-coc/SiteCocTab.tsx`.

- [ ] **4.1** Banner: replace `{batch.unmatched_count} unmatched` with live
  `liveMatchCounts(schedule)` → "· N matched · N unmatched"; keep date/certs/shops from `batch`.
- [ ] **4.2** Add a "Re-run auto-match" button (next to / under Import) that calls `rerunAutoMatch()`,
  shows a spinner while running, and toasts `Matched N more shop(s)` / `No new matches`. Disable when
  there are no unmatched rows.
- [ ] **4.3** `npm run build` — succeeds.
- [ ] **4.4** Commit.

## Task 5: Verify + deploy

- [ ] `npx vitest run` — all green. `npm run build` — succeeds.
- [ ] Merge `feat/coc-matching-robustness` → main, push, confirm Vercel Ready.
- [ ] Runtime (YARONA): banner shows live "23 matched · 1 unmatched"; Re-run auto-match (on a
  freshly re-imported / unmatched set) fills the mechanical matches; re-import keeps resolutions.

## Self-Review
- Spec items 1–4 ↔ Tasks 4 / 3 / 3 / 1–2. ✓
- L5 fixed in 3.1 (cert stamp by normalised id). ✓
- No schema change; frozen batch columns kept as provenance. ✓
- Types: `liveMatchCounts(rows:{subsection_id:string|null}[])`, `applyPriorMatches` consistent across
  tasks; `matchSubsection` signature unchanged.
