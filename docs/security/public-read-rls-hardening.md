# Public-read RLS hardening — finishing the token-scoped migration

**Status:** ✅ RESOLVED 2026-06-14. The IDOR did **not** exist in prod — prod RLS was already
hardened (no anon SELECT on these tables; only `authenticated` + role-scoped). The migration
files in this repo are STALE vs prod (the documented schema drift). The real bug was that the
public-review SchematicDiagram/AssetVerification did direct anon reads and silently got nothing;
**Phase 1 (route them through the token-scoped `get_public_site_review` RPC) is the actual fix and
is deployed** (PR #32). **Phase 3 (dropping anon policies) is moot** — there are none to drop.

Verified as the `anon` role on prod: direct `select from site_schematics` → 0 rows; RPC with the
real URL token → full scoped payload (schematic/blocks/assets/subsections); RPC for an out-of-scope
site → NULL (cross-tenant guard holds). Below is the original proposal, kept for context.

---

**Original status (superseded):** proposal — needs sign-off before any production RLS change
**Discovered during:** Schematic Overview deep dive (2026-06-14)

> ⚠️ The "blanket anon `USING(true)`" finding below was read from the migration files. Prod's
> actual policies differ (drift) — always check `pg_policies` on prod, not the migration files.

## The finding

The repo already did most of a security project (migrations `20260610113000_public_rpcs_phase1.sql`,
`20260610130000_public_drilldown_rpcs.sql`). Its own header states the goal:

> Token-scoped SECURITY DEFINER functions that return ONLY the scoped payload the site-review and
> subsection-review pages need, **so those pages stop reading tables directly with the anon key.**
> These close the cross-tenant IDORs: Vuln 7 (any site by id), Vuln 6 (any subsection by id).

`get_public_site_review(p_token, p_site_id)` validates the share token against `client_access_links`
and returns site, client, subsections (incl. `meter_serial_number`), inspections (incl. `json_data`),
snags and documents — scoped to the token.

**But the migration was left incomplete.** The review *pages* (`PublicSiteReview`,
`PublicSubsectionReview`, `PublicClientPortfolio`) use the RPCs, yet two *components embedded in those
pages still read tables directly with the anon key*:

- `src/components/site/SchematicDiagram.tsx` (readOnly + accessToken mode) — reads `site_schematics`,
  `schematic_blocks`, `subsections`, `inspections`.
- `src/components/site/AssetVerification.tsx` (readOnly mode) — reads `site_assets`, `inspections`,
  `subsections`.

Those reads only work because the **legacy blanket `SELECT ... USING(true)` policies are still in
place** (no `TO` clause → they apply to `anon`). Net effect: the IDORs the RPC project claimed to
close are **still open** through these two components. With the anon key (shipped in the bundle),
anyone can read every site's schematic, block layout, tenant meter serials and inspection
`json_data` for **all** clients — no token required, no scope check.

`get_public_site_review` does **not** currently return schematic/block data, so there is no secure
alternative for the schematic component to switch to yet.

## Why this can't be a one-line policy drop

`site_schematics` and `schematic_blocks` have **only** the blanket SELECT policy — there is no
separate authenticated policy. Dropping it without adding an authenticated SELECT policy would break
the admin and client-portal views too. (Other tables — `subsections`, `inspections`, `sites`,
`clients` — do have both an authenticated policy and a separate `TO anon` policy, so for those only
the anon one is dropped.)

## Proposed plan (phased, additive-first)

**Phase 1 — give the components a secure read path (additive, no prod risk).**
1. Extend `get_public_site_review` to also return `schematic` and `schematic_blocks` (it already
   returns the subsections/inspections the diagram needs for names + asset photos), OR add a
   dedicated `get_public_schematic(p_token, p_site_id)`. Prefer extending — one round-trip, same scope check.
2. Add the equivalent scoped payload for `AssetVerification` (`site_assets`), via the same RPC or a
   sibling.
3. In `SchematicDiagram` / `AssetVerification`, when `readOnly && accessToken`, hydrate from the RPC
   payload instead of `supabase.from(...)`. Authenticated (admin / client-portal) paths keep their
   direct reads unchanged.

**Phase 2 — full audit (no prod risk).**
Grep every component that can render under anon for direct `supabase.from(...)` reads. Confirmed so
far: SchematicDiagram, AssetVerification, VisitorRegistrationGate (insert — separate concern).
Enumerate the complete list before touching policies.

**Phase 3 — tighten RLS (THE prod-risk step; needs sign-off + staging verification).**
Per table, in one migration:
- `site_schematics`, `schematic_blocks`: `DROP POLICY "Anyone can view ..."` and `CREATE POLICY ...
  FOR SELECT TO authenticated USING (true)` (or scoped to the user's accessible sites).
- `subsections`, `inspections`, `sites`, `clients`, `document_categories`, `subsection_documents`,
  `coc_validations`, `floor_plan_pins`, `inspection_templates`: drop only the `TO anon`/"Anyone"
  SELECT policy; the authenticated policy already exists. Verify each has an authenticated policy first.
- anon retains read access **only** through the SECURITY DEFINER RPCs (which bypass RLS), so QR
  landing pages and public review must be confirmed to route through RPCs before this lands.

## Blast radius / what could break

QR-code landing pages, public review links, and public portfolio all currently depend on anon table
reads somewhere in their tree. Phase 3 breaks anything still on a direct anon read. Phases 1–2 must
fully eliminate those first. Recommend applying Phase 3 to a staging project and walking every public
surface (review link, QR landing, portfolio) before prod.

## Verification plan

- Phase 1/2: unit/integration green; manually load a public review link and confirm schematic + asset
  verification render via RPC (network tab shows `rpc/get_public_site_review`, no `from=` table reads).
- Phase 3 (staging): with **no** auth session, confirm direct `from=site_schematics` etc. return
  empty/forbidden, while the RPC still returns scoped data; confirm admin + client portal unaffected.
- Negative test the IDOR: a token scoped to client A must return NULL for a site belonging to client B
  (the RPC already does this; verify the component surfaces nothing).

## Open item — legacy px→% block data (needs prod query access)

`schematic_blocks` DB defaults are `width 120 / height 80` (pixel-era), but the component now treats
width/height as percentages (size dialog caps at 40%). Any blocks created before the percentage
rewrite, if never backfilled, render clamped/off-page. Verify against prod:
`select count(*) from schematic_blocks where width > 50 or height > 50;` — a non-zero count means a
data migration (px→% conversion) is also needed.
