# 04 — Scoring Rubric (Phase 4B)

- Date: 2026-07-30 · **STATUS: LOCKED 2026-07-30, before any competitor ran.**
- Competitors receive this rubric in full — optimising for a good rubric is the point.
- The judge may use nothing else. No criterion may be added, reweighted, or substituted after this date.

```
SCORING RUBRIC — composite /10, weighted; integers or halves per criterion.

1. Evidence & grounding (25%) — every proposal maps to F-## ids with verifiable
   file:line support. Judge spot-checks >=3 citations per submission against the
   repo; a fabricated or unsupported claim caps this criterion at 3.
2. Impact (20%) — expected effect on the highest-severity findings; coverage of
   blockers and highs.
3. Feasibility & effort realism (15%) — honest S/M/L, sane sequencing, correct
   dependencies.
4. Risk handling (15%) — migration/rollback awareness, blast radius, flags
   anything on the escalation-gate list (API contracts, non-additive migrations,
   auth/payment/deletion flows).
5. Scope discipline (15%) — smallest viable change bias; no rewrites, no
   imagined-future abstractions, no drive-by work.
6. Clarity & decidability (10%) — a reviewer can lock or reject each item
   without asking a follow-up question.

Anchors (apply per criterion): 3 = present but vague or partly unsupported;
6 = solid, minor gaps; 9 = rigorous, verifiable, nothing material missing.
9-10 only when the anchor is genuinely met. Use the full scale — do not
cluster at 7-8. Every criterion score carries 2-3 lines of justification
citing specifics from the submission.
```

## Submission format (competitors — hard caps)

- Strategy preamble, 150 words maximum: your theory of what matters most for this app.
- Maximum 8 proposals. Each carries:
  - `P-<letter>##` — title
  - Addresses: F-## list
  - What changes and why (120 words maximum)
  - Effort S/M/L · Risk low/med/high · Suggested order / dependencies
- Over-length submissions are penalised under criterion 6 (Clarity & decidability).

## Escalation-gate list (referenced by criterion 4)

A proposal touching any of the following must flag it explicitly:

- Any change to a public API contract
- Any database migration that is not additive
- Any dependency version bump across a major version boundary
- Any change to auth, payment, or data-deletion flows
- Any change that would force a user re-login or data re-sync
- Removing code that looks dead but might be called by a scheduled job or webhook

## Isolation rules binding on the judge

- The judge receives only: this rubric, `./review/03-findings.md`, `./review/manifest.md`, read access to `./review/specs/` and the repo, and the anonymized submissions in shuffled order.
- The judge never receives: persona briefs (`./review/04-personas.md`), competitor prompts, authorship, or — during fresh scoring — any prior-round scorecard.
- Judge feedback is GAP-based, never SOLUTION-based. The judge names what is weak, missing, unsupported or out of scope; it never proposes the fix. Otherwise round 2 converges on the judge's taste and the three perspectives collapse into one.
- No ties in rank: break on Evidence & grounding.
