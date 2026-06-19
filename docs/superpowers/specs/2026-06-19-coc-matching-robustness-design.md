# Site COC — import & matching robustness

**Date:** 2026-06-19
**Surface:** Site COC tab (`src/views/site-coc/*`, `src/lib/siteCoc/*`)
**Status:** Design (approved — "Full robustness pass")

## Background (investigation, evidence from live YARONA prod data)
- The import banner showed "24 unmatched" while the schedule was actually **23 matched / 1
  unmatched** (all 25 certs matched). Root cause: the banner reads the frozen
  `coc_import_batches.unmatched_count`; manual `resolveShop` updates the row + its certs but never
  the batch count.
- The auto-matcher (`matchSubsection`) scores **12/24** on YARONA today with **zero disagreements**
  vs the user's manual choices — but the stored import recorded `matched=0` (it ran pre-fix). The
  only way to apply the matcher is a **re-import, which deletes every row** (wiping the 23 manual
  resolutions). So the user is locked into manual-only work.
- Two concrete matcher misses are mechanical, not genuinely hard: "SHOPRITE LIQUOR SHOP" matches
  both `SHOPRITE` and `SHOPRITE LIQUOR` and bails as ambiguous; "FISH **&** CHIPS…" doesn't match
  subsection "FISH **AND** CHIPS". The rest (typo NIZAMS↔NIZZAMS, acronym KFC, business mapping
  SHENGE→COUNCIL OFFICE) will always need manual resolution.

## Decisions (locked)
Four changes, all frontend-only, no schema changes:

1. **Live banner count.** Compute matched/unmatched from the *current* `coc_db_schedule` rows, not
   the frozen batch. Keep date/certs/shops as historical import provenance.
2. **Non-destructive "Re-run auto-match".** A button that runs `matchSubsection` over the currently
   **unmatched** schedule rows only, stamps the newly-matched rows + their certificates, and leaves
   already-matched rows untouched. No delete, no re-import.
3. **Preserve resolutions on re-import.** Before deleting old rows, snapshot
   `normShop(shop_no_raw) → subsection_id` for matched rows; after assembling the new auto-matched
   rows, carry the prior subsection over to any new row that is still unmatched (only when the prior
   subsection still exists). Certs inherit via the existing `assembleCertificateRows`.
4. **Matcher quality.**
   - `normShop`: normalize `&` → `AND` (both sides), so "FISH & CHIPS" == "FISH AND CHIPS".
   - `matchSubsection` contains-fallback: keep only the **whole-word** "subsection key appears in
     trading name" direction (drop the looser reverse direction), and resolve multiple hits by
     **longest matched key wins** (tie → ambiguous → null). Fixes SHOPRITE LIQUOR; the word-boundary
     guard removes the M4 short-key false-positive vector.
   - **L5:** `resolveShop` / re-run stamp certificates by **normalised** shop (matched against the
     loaded certificate set by id), not a raw `shop_no_raw` equality.

Net effect on YARONA: auto-match 12 → **14**, no regressions, no false-positives; banner reads the
true live count; manual work survives re-import; the matcher can be applied without a destructive
re-import.

## Out of scope
- Fuzzy/typo matching, acronym expansion, business-knowledge mappings (stay manual).
- Schema changes; the frozen batch columns remain (used only as import provenance now).

## Testing
- Unit: `normShop` &-handling; `matchSubsection` longest-wins + word-boundary + the two new YARONA
  wins + no-regression on the existing 12; `liveMatchCounts`; `applyPriorMatches`.
- Build + full suite green. Runtime: YARONA → banner shows live count; Re-run auto-match fills
  unmatched; re-import keeps resolutions.

## Deploy
Frontend-only; standard Vercel deploy.
