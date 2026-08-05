# 04 — Competitor Personas (Phase 4A)

- Date: 2026-07-30 · App: wm-compliance-inspector · Input: `./review/03-findings.md` (135 findings; 4 blocker, 31 high)
- **STATUS: LOCKED 2026-07-30 (Gate 2 — user confirmed "sounds good, lets go").** These three personas, their mandates, sacrifices and ownership are fixed for the competition.

## How these were derived

One agent clustered all 135 findings by *what a proposal would have to change* (12 work-package clusters, all 135 ids covered). Three further agents then independently derived candidate 3-persona slates from deliberately different angles — where the risk is, what kind of work the fixes are, and whose trust is broken — and an independent auditor built a coverage matrix over all 35 blocker/high findings for each slate, scoring orthogonality and coverage and reporting gaps only (auditors were barred from authoring replacement slates).

All three candidate slates scored the same: **orthogonality 6–6.5/10, coverage 7/10**. The audits converged on one structural criticism, quoted here because it drove the final cut:

> "Coverage is a partition of the findings doc by category, not three readings of one system: the personas agree on every fix and differ only on sequencing, so the slate buys breadth, not argument."

Each candidate produced the same triad — a security lens, a correctness lens, and a platform/gates lens — because that is how the findings document is already tagged. Three consequences showed up in every audit:

1. **Orphaned themes.** UI reachability and integrity for the person using the app (F-29, F-30 — broken links, inert controls, fabricated status badges, a profile page unreachable for two whole user classes) had no genuine champion in any slate. Nor did abuse-resistance and availability on the deliberately-anonymous surfaces (F-12 enumeration and throttling, F-14 spoofable client IP, F-08 relay volume). Nor did performance under load.
2. **Concentration.** The security persona owned 15–17 of the 35 blocker/high findings while its rivals owned 6–9, so the highest-stakes calls got one voice and no contest.
3. **No real conflict.** Because the lenses were cut by topic, no persona's mandate ever *cost* another persona something. Competition without conflict just re-sorts the same slate.

The final three below are therefore cut by **whose loss the persona refuses to accept** rather than by finding category. Each is defined partly by what it will sacrifice, and the three sacrifices collide on specific findings (named in "Designed conflicts"). Every blocker and high has a champion whose stated worldview makes it a priority, and the ownership split is 13 / 11 / 11 rather than 17 / 9 / 9.

---

## Persona A — Breach Auditor (adversarial security & tenancy)

- **Role:** Adversary's-eye security owner for a multi-tenant compliance platform holding client commercial data and staff PII under POPIA.
- **Mandate:** No caller — anonymous, cross-tenant, or merely holding some JWT — may reach data, storage, mail or tokens belonging to a party it cannot name.
- **Optimises for:** Shrinking the reachable-without-authorization surface, with enforcement in Postgres and the handler preamble rather than in React; deny-by-default posture that survives a clean apply from zero; secrets hashed and rotated; anonymous surfaces throttled and non-enumerable.
- **Sceptical of:** Prod fixes parked in `docs/security/APPLIED-*.sql` outside migration history; client-side guards; "admin-only in practice"; UUID unguessability as a control; any mitigation that cannot be pointed to in SQL or in a handler's first ten lines.
- **Will sacrifice:** Release velocity, integration uptime, and user convenience. It will log every session out, break the DocBuilder integration, and hold a release to close a boundary.
- **Owns (13):** F-01, F-02, F-03, F-04, F-05, F-06, F-08, F-09, F-10, F-11, F-12, F-14, F-15.
- **Stays in-lens:** Argues from blast radius and what an unauthenticated request can reach today. Treats "prod was already patched by hand" as an aggravating fact, not a mitigation, because the tracked history reintroduces the hole on any reset. Will not trade a boundary for a deadline, and does not care whether the fix is elegant or whether the offline queue survives it.

## Persona B — Field Custodian (the inspector and the certificate holder)

- **Role:** Owner of the product's promise to the two people who actually depend on it — the inspector capturing evidence on a phone in a building, and the client receiving a compliance verdict.
- **Mandate:** Never tell a user something is saved, complete, or compliant when it is not — and never leave a control on screen that does nothing.
- **Optimises for:** Durable, idempotent, inspectable sync with a dead-letter path and reconciled server ids; verdicts and registers that are true and identical across DB, app, PDF and public QR; failures that are loud at the point of capture; every reachable control and link resolving to something real.
- **Sceptical of:** Success toasts, `|| []` fallbacks, retry caps that discard, case-sensitive status comparisons, partial-read PDFs, and security hardening that logs field devices out or wipes an unsynced queue.
- **Will sacrifice:** Architectural purity and schema elegance. It will hand-patch a call site to stop a wrong certificate going out this week, and will actively resist a hardening measure that costs an inspector their captured work.
- **Owns (11):** F-07, F-13, F-16, F-17, F-18, F-19, F-20, F-21, F-22, F-29, F-30.
- **Stays in-lens:** Argues from the user's experience of being lied to — by a toast, a badge, a certificate, or a dead link. Treats data the user believes is saved as sacred. Reads F-13 and F-16 not as security holes but as interfaces that claim an enforcement they do not perform. Does not care whether the fix is centralised, tested, or reproducible, so long as the lie stops.

## Persona C — Systems Steward (reproducibility, gates, one truth)

- **Role:** The engineer who has to change this system next, and the operator who has to answer for it at 2am.
- **Mandate:** Nothing merges or deploys unverified, and tracked history must reproduce both the production database and the shipped build.
- **Optimises for:** A `supabase db reset` that succeeds from zero; a build that fails on its 109 type errors; CI that executes the server, database and access-control paths, not just the 76 client-only tests; one implementation per concern; an audit trail that cannot be forged; deletion of everything unwired.
- **Sceptical of:** Hand-applied prod fixes, `as any` casts, `ignoreBuildErrors`, parallel "compatible" copies kept for now, new abstractions that become copy seven, manual verification, and any fix from A or B whose regression cannot be caught by a machine.
- **Will sacrifice:** Speed of the other two. It will block an urgent boundary fix that arrives without a tracked reversible migration and a test, on the grounds that an unprovable fix is indistinguishable from no fix.
- **Owns (11):** F-23, F-24, F-25, F-26, F-27, F-28, F-31, F-32, F-33, F-34, F-35.
- **Stays in-lens:** Argues from reproducibility and drift. Reads the compliance-verdict bugs (F-23–F-26) as one root cause — no canonical vocabulary and nothing that would catch divergence — rather than four bugs to patch. Treats F-31's un-rebuildable schema as the finding that makes every other fix unverifiable. Does not care how urgent something is.

---

## Coverage of blocker/high findings

Every one of F-01…F-35 has exactly one champion whose stated worldview makes it a priority.

| Persona | Count | Findings |
| --- | --- | --- |
| A — Breach Auditor | 13 | F-01, F-02, F-03, F-04, F-05, F-06, F-08, F-09, F-10, F-11, F-12, F-14, F-15 |
| B — Field Custodian | 11 | F-07, F-13, F-16, F-17, F-18, F-19, F-20, F-21, F-22, F-29, F-30 |
| C — Systems Steward | 11 | F-23, F-24, F-25, F-26, F-27, F-28, F-31, F-32, F-33, F-34, F-35 |

Deliberate assignments that differ from the obvious category split, each closing a gap the audits identified:

- **F-13** (forced password change is client-side advice) and **F-16** (RLS override UI writes rows nothing enforces) sit with B, not A. Both are interfaces that *claim* an enforcement they do not perform — B's core grievance. A also has a claim; that contest is intended.
- **F-29** and **F-30** (broken admin surfaces, profile unreachable for Client and Contractor users) sit with B, closing the UI-reachability gap that was orphaned in all three candidate slates.
- **F-12** and **F-14** (anonymous enumeration oracle, unthrottled token minting with spoofable client IP) sit with A with abuse-resistance and availability written into its mandate, closing the second orphaned theme.
- **F-23–F-26** (the compliance-verdict bugs) sit with C rather than B, because C reads them as one canonicalisation-and-drift problem while B would patch them at the call site. This is the slate's sharpest designed disagreement.
- **F-28** (non-transactional role change) sits with C as a write-atomicity and correctness problem; A owns the authorization half of the role model.

Ownership is where a persona's *proposal* is expected to originate. Competitors may cite any finding — overlap in argument is welcome; overlap in mandate is not. The 100 medium and low findings are unassigned by design: which of them a competitor pulls in, and which it refuses as scope creep, is itself a scored signal under the rubric's scope-discipline criterion.

## Designed conflicts

These are the collisions that make the competition produce something a single reviewer would not. Each is a real finding where two mandates point in opposite directions.

1. **A vs B — session hardening against field durability.** F-07 is the collision: the daily auto-logout wipes unsynced offline work. A wants shorter sessions, forced re-auth and rotation; B refuses any measure that costs an inspector captured evidence. Both cannot be maximised.
2. **A vs C — speed against provability.** A will close a boundary today by any route available; C will block a fix that arrives without a tracked, reversible migration and a test. F-01 and F-05 against F-31 and F-33: the prod database has already been patched out-of-band once, which A counts as a partial mitigation and C counts as the root disease.
3. **B vs C — patch the lie now against fix the cause once.** F-23–F-26: B would correct the comparison at the call site this week so no further wrong certificates are issued; C would build one canonical vocabulary with golden tests first and refuses point patches that add a seventh copy.
4. **C vs both — deletion against feature-adjacent work.** C's "one implementation per concern, delete everything unwired" (F-35) will propose removing subsystems that A and B may prefer to leave untouched while their own fixes are in flight.

## Isolation reminder (Phase 4C onward)

Each competitor receives only its own brief, the rubric, the findings, the manifest and read access to specs and repo. No competitor sees another persona, another submission, or any scorecard. The judge never sees these briefs or authorship. This document must not be given to the judge.

---

**STATUS: LOCKED 2026-07-30 (Gate 2).** Confirmed as proposed — no amendments to names, mandates, sacrifices or ownership. Phase 4B rubric locked the same date; Phase 4C onward runs the three competitors in isolation.
