# Phase-1 DATA-MODEL + AUTH Completeness Critic — RE-RUN

**Date:** 2026-06-11 · **Scope:** 02-data-model/ + 03-auth-and-access/ · **Why:** the original Phase-1b completeness critic returned null (`00-INDEX.md:18`); this re-run formally closes (or reopens) coverage.
**Method:** ground truth extracted from `src/integrations/supabase/types.ts` (the generated DB schema), diffed against every doc header; 10-claim citation spot-check against migrations/code; cross-doc contradiction scan.

**Verdict: 🟡 NOT COMPLETE.** Data-model docs are ~94% table-complete but miss **3 real operational tables, 9 functions, all 3 views, and 5–6 backup-snapshot tables**, none of which are captured by the existing G-OPS-01/02 register entries. Auth docs are structurally complete (all 3 route groups + no-middleware verified) but contain **1 confirmed cross-doc contradiction** (invite email sender). Citation spot-check: **8/8 directly-verifiable claims PASS exactly**; the 9th surfaced the contradiction below.

---

## 1. types.ts ground truth (effective schema)

Counted from `src/integrations/supabase/types.ts` (3848 lines):

| Object class | Count | Source lines |
|---|---|---|
| Tables | **64** (incl. 6 dashboard backup snapshots) | `types.ts:16–3531` |
| Views | **3** | `types.ts:3532–3570` |
| Functions (RPC-exposed) | **17** | `types.ts:3571–3713` |
| Enums | **2** (`app_role`, `asset_category`) | `types.ts:3714–3717`, `Constants` `:3843–3847` |
| CompositeTypes | 0 | `types.ts:3718` |

---

## 2. TABLE coverage gaps

Docs (`tables-01..06.md`) carry **56** standalone table entries. Diff vs the 64 in types.ts:

### 2a. Real tables in types.ts with ZERO documentation (NEW gaps — not in G-OPS-01/02)
| Table | types.ts | Evidence it's real / live | Status |
|---|---|---|---|
| `reports` | `types.ts:2201` | Substantial table: `file_url, file_name, report_type, inspection_id, site_id, subsection_id, created_by, metadata` — the generated-PDF/report registry. No `## reports` header in any `tables-*.md` (`grep` = 0 hits; only `issue_reports` is documented, a different table). | **UNDOCUMENTED** |
| `compliance_settings` | `types.ts:911` | Backs the `get/set_compliance_setting*` RPCs (also undocumented, §3). Zero mention in all of `02-data-model/`. | **UNDOCUMENTED** |
| `compliance_settings_audit` | `types.ts:935` | Audit trail for the above. Zero mention in `02-data-model/`. | **UNDOCUMENTED** |

### 2b. Backup-snapshot tables in types.ts not given entries
6 dashboard point-in-time backups exist in types.ts (`*_snap_20260421`, `*_snap_20260422_pre_relink`). 4 are explicitly acknowledged as out-of-scope backups with citations; 2 are **not mentioned anywhere**:
- Acknowledged: `coc_compliance_photos_snap_20260421` (tables-01.md:276), `inspection_signatures_snap_20260421` (tables-02.md:411), `offline_photos_snap_20260421` (tables-04.md:101), `subsections_snap_20260421` (tables-05.md:264,481).
- **Not mentioned:** `inspections_snap_20260421`, `inspections_snap_20260422_pre_relink` (`types.ts:1455+` region). Low severity (backups), but should be folded into G-OPS-01's snapshot list (which currently names only `inspection_signatures_snap_20260421`).

### 2c. Documented but absent from types.ts — LEGITIMATE
- `auth_events` — documented (tables-01.md:139, tables-03.md:394) and the types.ts absence is **explicitly flagged** as stale-types drift (tables-03.md:430; G-OPS-01 GAPS.md:192). Created in `20260525120000_auth_events_audit.sql`, written by edge fns. **Not a doc error — correctly handled.**

---

## 3. FUNCTION coverage gaps

Docs (`rpcs-and-functions-01/02.md`) document 25 functions (RPCs + trigger/SECURITY-DEFINER fns). Diff vs the 17 RPC-exposed functions in types.ts:

### 9 functions in types.ts with ZERO documentation (NEW gaps)
`apply_subsection_recompute`, `audit_orphan_photo_refs`, `debug_site_health_snapshot`, `get_compliance_setting_bool`, `get_compliance_setting_numeric`, `get_compliance_settings`, `prune_orphan_photo_urls`, `recompute_subsection_installation_status`, `set_compliance_setting` (all `types.ts:3571–3713`). Confirmed absent: `grep -rl` across `02-data-model/` returns NONE for each.

- The 3 `*_compliance_setting*` fns tie directly to the undocumented `compliance_settings` table (§2a) — one undocumented subsystem.
- `audit_orphan_photo_refs` / `prune_orphan_photo_urls` / `recompute_subsection_installation_status` / `apply_subsection_recompute` are the orphan-photo + installation-score machinery surfaced (but not function-documented) elsewhere; `debug_site_health_snapshot` is a diagnostic RPC.

(The reverse-diff — functions documented but not in types.ts — is **expected and fine**: trigger functions, `handle_new_user`, `update_updated_at_column`, the public-share `get_public_*` RPCs, etc. are not all surfaced in the generated RPC type list.)

---

## 4. VIEW coverage gap (NEW)

All 3 views in types.ts (`inspection_orphan_summary`, `inspection_photo_refs`, `orphan_photo_refs`; `types.ts:3532–3570`) have **ZERO documentation** anywhere in `02-data-model/` (`grep -ril` = 0 hits). The data-model chapter has no Views section at all.

## 4b. ENUM coverage — COMPLETE ✅
Both enums fully documented in `triggers-enums-storage.md:87–88`, including evolution history (`app_role` Admin/User/Contractor → +Moderator → +Client). Verified against migrations in §6.

---

## 5. AUTH / route-group coverage — STRUCTURALLY COMPLETE ✅ (1 contradiction)

- **All 3 Next.js route groups** (`src/app/(admin)`, `(client-portal)`, `(contractor)` — verified via `find`) are documented as access contexts 3/4/5 in `access-contexts-and-roles.md:190,272,350`. No 4th group exists.
- **"No middleware" claim verified:** `find . -name middleware.ts -not -path '*/node_modules/*'` returns nothing — matches `access-contexts-and-roles.md:10` and `auth-flows.md:254`.
- Non-grouped anon surfaces (`auth/`, `public/`, `review/`, `portfolio/`, `download/`, `install/`) exist and are the documented public/anon paths.
- 5 access contexts + role model + client-side plumbing + assignments + preview/simulator surfaces all have sections.

### CONTRADICTION (qr_scans-class — the kind §4 of the task asked for):
**Invite-email sender** is stated two different ways across the auth docs, and one is WRONG:
- ❌ `auth-flows.md:200` and `:447` claim invite-user sends **from `onboarding@resend.dev`**.
- ✅ `user-lifecycle.md:144,382` say invite-user sends from **`${companyName} <noreply@watsonmattheus.com>`** citing `invite-user/index.ts:466`.
- **Code truth:** `supabase/functions/invite-user/index.ts:466` → `from: \`${companyName} <noreply@watsonmattheus.com>\``. `grep onboarding@resend` in that file = **0 hits**.
- ⇒ `auth-flows.md` is **STALE**, and the derived "invite-email sender mismatch" open question (`00-INDEX.md` Open-Q #6; `auth-flows.md:447–449`) is **a false finding based on outdated code** — should be retracted/corrected, not carried as a real gap.

---

## 6. Citation spot-check (10 claims across 02/03)

| # | Claim (doc:line) | Verified against | Result |
|---|---|---|---|
| 1 | `has_role(_user_id uuid, _role app_role)` (rpcs-01.md:255) | `types.ts:3643` Args `{_role: app_role, _user_id: string}` | ✅ exact |
| 2 | `app_role` = Admin/User/Contractor, +Moderator, +Client (triggers-enums.md:87) | `20251014120311…sql:2` create; `20251014172237…sql:2` Moderator; `20251017054230…sql:2` Client | ✅ exact |
| 3 | `auth_events` 11-value `event_type` CHECK (tables-01.md:153, tables-03.md:416) | `20260525120000_auth_events_audit.sql:21–34` — exactly 11 values, identical list | ✅ exact |
| 4 | `validate_access_link` exists (rpcs-02.md:253) | function defined in migrations (`20260123052614…sql` et al.); `types.ts:3686` | ✅ |
| 5 | `handle_new_user` populates `public.profiles` (rpcs-01.md:230) | `20251014114352…sql:182` `INSERT INTO public.profiles` | ✅ |
| 6 | No `middleware.ts` (auth-flows.md:254) | `find` repo-wide = none | ✅ |
| 7 | Client role plumbing via `useUserRole` (access-contexts.md:139) | `src/hooks/useUserRole.tsx:7` | ✅ |
| 8 | Invite sender `noreply@watsonmattheus.com` (user-lifecycle.md:144) | `invite-user/index.ts:466` | ✅ (and exposes the auth-flows.md contradiction, §5) |
| 9 | `validate_api_token` is an RPC (rpcs-02.md:272) | `types.ts:3696` | ✅ |
| 10 | `profiles` created + RLS enabled (tables-03.md) | `20251014114352…sql:2,69` CREATE + ENABLE RLS | ✅ |

**Score: 10/10 verifiable claims confirmed against code/migrations.** Zero citation errors found. (Claim #8 doubles as the contradiction trigger — the cited doc is right; the *other* doc, auth-flows.md, is the one that's wrong.)

---

## 7. Other contradictions / bookkeeping issues

- **Double-documentation of `inspections`** (and likely 8 other tables): `inspections` has a full standalone entry — purpose + complete column table — in **both** `tables-03.md:16` ("Core record… 64 call sites") **and** `tables-04.md:14` ("Root inspection record…"). Two batch agents each wrote it. Not currently contradictory but a drift risk (two independent descriptions). Other tables appearing in two batch files: `snags` (04/05), `contractor_coc_uploads` (02/03), `offline_photos` (03/04), `inspection_relink_audit` (02/03), `coc_local_validations` (01/03), `auth_events` (01/03), `coc_compliance_photos` (01/03), `subsections` (04/05) — each needs a one-canonical-entry-vs-cross-reference pass. Most of the second occurrences are scope-note cross-references rather than full dups; `inspections` is the one confirmed full duplicate.
- **qr_scans** (the previously-fixed contradiction): now consistently documented (tables-06.md) and columns match `types.ts:2147–2185` (`created_at, id, ip_address, scanned_at, scanned_by, subsection_id, user_agent`). ✅ Resolved, no residue.

---

## 8. Recommended register updates

1. **G-OPS-01** — extend the out-of-band-objects list to include `reports`, `compliance_settings`, `compliance_settings_audit`, the 9 undocumented functions, the 3 views, and the 2 unlisted `inspections_snap_*` backups. These all exist in types.ts but in no doc and (for the first three) likely no migration — same schema-drift class.
2. **02-data-model** — add entries for `reports`, `compliance_settings(+_audit)`, the 3 views, and the 9 functions; or, if confirmed dead, fold into G-OPS-02.
3. **auth-flows.md:200,447 + 00-INDEX Open-Q #6** — correct the invite sender to `noreply@watsonmattheus.com` and retract the "sender mismatch" finding.
4. **tables-03/04 `inspections`** — collapse to one canonical entry + cross-reference; audit the other 8 multi-file tables.
