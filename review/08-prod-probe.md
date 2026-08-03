# 08 — Production Probe Results

- Date: 2026-07-30 · Executed via the authenticated Supabase CLI against project `oltzgidkjxwsukvkomof`.
- **Complete: P-03, P-04, P-06.** Blocked: P-01, P-02, P-07–P-12, P-15 (see §5).
- Every command here is read-only. No database write, no deploy, no secret value read.

---

## 1. P-04 — Deployed edge functions (`supabase functions list`)

16 functions are ACTIVE in production. Reconciled against the 17 tracked directories:

| | Result |
| --- | --- |
| Tracked **and** deployed | 14 |
| **Tracked but NOT deployed** | `fix-inspection-photos`, `fix-tenant-images`, **`report-issue`** |
| **Deployed but NOT tracked** | `generate-pdf`, `generate-inspection-pdf` |

### 1a. F-02 — corroborated, exposure is nil

`fix-inspection-photos` and `fix-tenant-images` are **not deployed**. `GAPS.md:36` claimed this and the pre-lock audit rightly refused to trust it as a lone self-report; it is now confirmed by an independent source. **F-02's live exposure is nil.**

The redeploy risk stands unchanged: `config.toml:36-37,49-50` still registers both, so a bare `supabase functions deploy` — which `README.md:532` documents — restores an unauthenticated service-role writer. **R-01 is still worth doing, but it is hygiene and prevention, not incident response.** Its priority drops out of Tier 0's "urgent" framing.

### 1b. NEW — public issue reporting is broken in production

`report-issue` is declared at `config.toml:12-13` and has full source in the tree, but **it is not deployed**. `src/components/public/PublicIssueReportDialog.tsx:78` POSTs to `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/report-issue`, so every public "Report an issue" submission from a QR landing page hits a 404. The Turnstile-gated public snag path does not work in production and nothing in the app surfaces that.

This is not in the 135 findings — the review reasoned from tracked source, where the function exists and is correct. It took the deployment inventory to see it.

### 1c. NEW — two live handlers had no source in the repo

`generate-pdf` (3,357 lines, v275, updated 2026-06-14) and `generate-inspection-pdf` (1,807 lines, v105) are ACTIVE in production, **absent from `config.toml`**, and were absent from the repo. Both have been downloaded and filed under the repo's existing convention at `docs/system-reference/_work/unversioned-prod-functions/*.PULLED-FROM-PROD.ts`, joining the seven already there. They were deliberately **not** left in `supabase/functions/`, where a bare deploy would treat unreviewed downloads as source of truth.

Their auth model, read from the downloaded source:

- Both construct a **service-role** client (`generate-pdf:60,3220,3282`; `generate-inspection-pdf:24,111,1601,1635`).
- Both do a JWT + `getUser` check at the top of the handler (`generate-pdf:3106-3109`; `generate-inspection-pdf:1719-1722`) — **authenticate but never authorize**, the exact F-08 pattern.
- Neither is declared in `config.toml`, so neither carries a tracked `verify_jwt` setting.
- Both call paid third parties with keys from the environment: PDFShift (`generate-pdf:3248`) and Browserless (`generate-inspection-pdf:1560`).

**Consequence for R-09:** its mandate is "every edge handler". That cannot mean "every tracked directory" — two live handlers with service-role privileges and no role check would have been missed entirely, and both spend money per invocation.

### 1d. `config.toml` drift is wider than F-31 recorded

Seven declared entries have no deployed function: the four known phantoms (`detect-schematic-regions`, `extract-coc`, `validate-coc`, `verify-fix`) plus `fix-inspection-photos`, `fix-tenant-images` and `report-issue`. Two deployed functions have no entry. R-01's cleanup list grows accordingly.

## 2. P-06 — Edge function secrets (`supabase secrets list`)

Names and digests only; no value is retrievable this way and none was read.

**Both DocBuilder secrets are SET**: `DOCBUILDER_PUBLIC_TOKEN` and `DOCBUILDER_SYNC_KEY`, along with `DOCBUILDER_WEBHOOK_URL`.

**Consequence for R-09:** F-11's fail-open is **latent, not live**. `save-template` and `template-sync` only skip their auth check when the variable is unset, and both are set today. The defect remains real — an unset or rotated-away variable silently disables authentication with no alarm — but this is not an open door right now. That leg of R-09 loses its urgency; the open mail relay in `send-email` (F-08) does not, and remains the sharpest item in that proposal.

Also present and worth noting for later items: `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `GMAIL_USER`/`GMAIL_APP_PASSWORD`, `ANTHROPIC_API_KEY`, `LOVABLE_API_KEY`, `ABACUS_AI_API_KEY`, `PDFSHIFT_API_KEY`, `BROWSERLESS_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`. No `CRON_SECRET` — expected, since that is a Vercel variable, not a Supabase one, and P-05 remains outstanding.

## 3. Migration divergence quantified (`supabase migration list`)

| | Count |
| --- | --- |
| Repo migrations recorded as applied in prod | **20** |
| Repo migrations **not** recorded as applied | **164** |
| Migrations in prod but not in the repo | 0 |

The July migration headers said "prod schema is ahead of `schema_migrations`". The real shape is the opposite of what that phrasing suggests: prod's `schema_migrations` table is nearly **empty**, holding 20 of 184 entries. The schema objects exist — the app runs — but the history table was never populated for the bulk of them, consistent with a project built through the dashboard and Lovable before migrations were adopted.

**Operational consequence, and it is severe:** `supabase db push` against production would attempt **164 migrations** whose objects already exist. That is not a theoretical hazard — it is one command away, and `README.md` documents the deploy flow in bare form. Every apply path in Batches 1–5 must be the Management API or a reviewed manual apply, never `db push`. R-03's "make `db reset` succeed from zero" is about local and CI reproducibility; it does **not** make the repo safe to push.

## 4. What this changes in the plan

| Item | Change |
| --- | --- |
| R-01 | Priority drops — F-02 is not live. Scope grows: 7 stale `config.toml` entries, not 6. Still ships in Batch 1; no longer the urgent one. |
| R-09 | Scope grows by two undeclared live handlers (`generate-pdf`, `generate-inspection-pdf`), both service-role with no role check. The DocBuilder fail-open leg is downgraded to latent. |
| R-03 | Its value is confirmed and its limit is now explicit — it fixes local/CI reproducibility, not the 164-row history gap in prod. |
| All migration items | Apply path is Management API or reviewed manual only. `db push` is prohibited against prod until the history is reconciled. |
| **New work** | Deploy `report-issue` (or remove the dead public UI); decide whether to adopt the two prod-only PDF functions into the tracked tree. Neither has an owning item — see §6. |

## 5. Still blocked

`P-01` (policy dump), `P-02` (the eight prod-only object definitions), `P-07`–`P-12`, `P-15` all need SQL execution against production. The attempt (`supabase db dump --schema public`) was refused by this environment's permission classifier, and that refusal was not worked around.

To finish them, either:
1. run `review/prereq-queries.sql` in the Supabase dashboard SQL editor — it is ready, 16 bare SELECTs, one block at a time; or
2. grant a Bash permission rule for `supabase db dump` / `psql` so the same queries can be run here.

Until then R-03, R-07, R-08, R-12, R-14 and R-16 cannot be authored against real types and real policy state.

## 6. Unowned work this probe created

- **Deploy `report-issue`, or delete the public issue-reporting UI.** Currently the button exists and 404s. Needs a decision before it gets an item.
- **Adopt or retire `generate-pdf` and `generate-inspection-pdf`.** They are live, unversioned, service-role, unauthorized, and spend money per call. Filed under the PULLED-FROM-PROD convention for now, which records them without pretending they are governed.
