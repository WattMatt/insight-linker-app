# 05 — Review Close-Out

- Date: 2026-07-30 · App: wm-compliance-inspector · Protocol: Full Application Review — Phased v2 (Competitive Proposals)
- **The review is complete.** All three gates passed, the proposal slate is locked, and the engagement stayed read-only throughout: `git status` shows zero modifications to any tracked file outside `./review/`.

## What was done

| Phase | Output | Scale |
| --- | --- | --- |
| 1 — Inventory | `01-inventory.md`, `inventory/01…15-*.md`, `unit-files.json` | 936 tracked files classified, 15 extraction agents, 77 units |
| Gate 1 | Grouping + granularity locked 2026-07-29 | user-confirmed |
| 2 — Specifications | `specs/` — 71 files | 71 agents; 727/727 spec-mode files, counts reconciled |
| 3 — Review & findings | `03-findings.md` | 19 reviewers → 286 raw → **135 findings** (4 blocker, 31 high, 83 medium, 17 low), every blocker/high adversarially verified |
| 4A — Personas | `04-personas.md` | 3 candidate slates + independent coverage audits → 3 locked personas |
| Gate 2 | Personas + rubric locked 2026-07-30 | user-confirmed |
| 4B — Rubric | `04-rubric.md` | locked before any competitor ran |
| 4C–4F — Competition | `submissions/`, `scores/` | 3 isolated competitors × 2 rounds + 2 blind judging passes |
| Gate 3 | `04-proposals.md` — **20 items LOCKED** | pre-lock audit found 9 defects; all fixed before locking |

Total: roughly 190 agents across seven workflows, about 19 million subagent tokens.

## The headline result

**Four blockers, all on the backend trust boundary**, and the competition materially changed the picture on two of them:

1. **F-01 / F-03 are live in production, not history residue.** Phase 3 believed an out-of-band hotfix had covered them. Two competitors independently opened that script: it filters `schemaname='public' AND cmd='SELECT' AND qual='true'`, so it never touched `storage.objects` and never touched the blanket `FOR ALL` policies. Every storage bucket is public with an anonymous SELECT that was never dropped, and any signed-in user can rewrite the `user_clients`/`user_sites` tenancy mappings that every scoping policy reads.
2. **F-02 stays a blocker.** A repo note claims the two unauthenticated service-role rewrite functions are already 404 in production, but the pre-lock audit established it as a single unwitnessed self-report with no probe output — and Phase 3's own verifier had already called it unverifiable. It needs a live probe, not a markdown line.
3. **F-04** — role-unqualified read on `client_access_links` exposed every share token; the hotfix demoted it to authenticated-wide, which is still every signed-in user.

Beyond the blockers: **any Contractor or Client is an authenticated open mail relay** on the company Gmail account, and **an expired certificate currently prints "Compliant"** on the QR card a client scans.

## What the competition was worth

The three personas were cut by whose loss each refuses to accept, with explicit sacrifices, so their slates genuinely conflicted rather than re-sorting one list. The judge's convergence check confirmed it worked: composite spread *widened* between rounds (0.3 → 0.6) and the three final slates cite essentially no shared files. Rigour converged; proposals did not.

Winner: **agent-C 8.7**, then agent-A 8.6, agent-B 8.1 — an inversion of round 1 (A 8.1, B 7.9, C 7.8).

But the winner's slate alone would have been the wrong plan. The single cheapest high-value item in the whole review — block cache-clearing while offline work is unsynced, the only fix for the corpus's only data-loss finding, S-effort and low-risk — appears **only in the last-placed slate**, and the winner's author explicitly abandoned it. That is the argument for cherry-picking, and it is why Gate 3 merges across all three.

## What the pre-lock audit was worth

Two independent auditors both returned **"not safe to lock as written"** against the first merged draft. They found nine defects, including three that would have caused real damage:

- **Blocker F-01 had no owner** — a consequence of my own deferral decision, which left its remaining legs living in a decision note rather than a numbered item.
- **The policy drops were sequenced ahead of the offline durability work**, which would have turned a security fix into data loss: dropping blanket write policies on the tables the offline drain targets, while the queue still deletes payload and photo blob after three failed retries.
- **A site-id storage path prefix would have rejected every offline photo upload**, because the drain's upload paths carry no site-id segment.

All nine are recorded with their fixes in `04-proposals.md` §7. The rejected draft is superseded, never edited.

## Where things stand

- **Locked:** 20 items, R-01…R-20, in a binding order. Every one of the 35 blocker/high findings has exactly one owner (machine-verified: 74 findings owned, no double-claims).
- **Declared partial:** residual legs of F-21, F-23, F-29 and F-109 own no item, and the 100 medium/low findings remain the backlog in `03-findings.md`. Recorded rather than implied as covered.
- **Not started:** no implementation. Locking is a planning decision and authorises no code change.

## Execution status

**Four items are implemented** on branch `review/ungated-fixes` (uncommitted): R-15, R-17, R-18, R-19 — every locked item that carries no escalation gate. Test suite went 498 → **578 passing with zero failures**; type errors and lint errors both held exactly at baseline; no migration, edge function, config or auth path touched. Full detail and the two defects central verification caught in `04-proposals.md` §8.

The user-visible fixes in that set: an expired certificate no longer prints "Compliant" on the public QR card; COC-required subsections stop reading as missing documents (a field-name mismatch made that list always empty); imported COC dates stop landing a day early in South African time; the nightly snapshot cron pages deterministically instead of risking skipped or double-counted rows.

**Sixteen items remain locked and unstarted**, each blocked on an escalation gate or on information the repo cannot supply.

## What happens next

1. **Sign off the escalation gates.** Sixteen of the twenty items carry one (`04-proposals.md` §6) — non-additive policy drops that kill anonymous reads, credential rotation, forced re-login, a public API contract change, an IndexedDB version bump forcing a re-sync on field devices. Each needs approval when its session runs, not now.
2. **Authorise the production policy probe (D5).** A read-only `pg_policies` dump. R-07 and R-08 cannot be scoped correctly without it — the repo cannot tell you what production actually enforces, and one PENDING script suggests prod may be missing a *tracked* fix.
3. **Probe the two function URLs** before R-01 (§1.3).
4. **Then run the items in order**, each as its own session with a DID / ASSUME / RECOMMEND close-out. Tier 0 (R-01, R-02) is small, low-risk, and needs nothing above it.

Suggested first session: **R-02** — S-effort, low-risk, no dependencies, and it closes the only path in the codebase that destroys a user's captured work.
