# Effective RLS Policy Reference — Part 6 (validation conversation/feedback tables)

Scope: `validation_conversations`, `validation_feedback`, `validation_messages`.

Method: effective state = replay of all migration DDL events in chronological order (migration filename order across `_work/migration-events-01.json` … `-10.json`), then the out-of-band production SQL `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` applied LAST.

Conventions used below:
- "TO PUBLIC" = policy created with **no `TO` clause**; in Postgres this applies to **every** role including `anon`. Where the USING/WITH CHECK expression contains `auth.uid() IS NOT NULL`, anon is gated out by the expression even though the policy nominally targets PUBLIC.
- All policies are PERMISSIVE (none created `AS RESTRICTIVE` anywhere in the log). Multiple permissive policies on the same command are **OR-combined**.
- `has_role(uid, role)` is the SECURITY DEFINER helper over `user_roles` (defined `20251014120311`).
- service_role bypasses RLS entirely on all three tables (no `TO service_role` policy is ever defined for them; access is via bypass).
- All three tables were created together in `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql` with RLS enabled and per-command policies. A later migration `20251120080517_643a23ca-0be6-4205-9103-3329d42e412f.sql` **added** a blanket `FOR ALL` "full access" policy to each table **without dropping** the originals — so the original per-command policies remain effective and are OR-combined with the blanket ones.

### Tier-2 lockdown impact: NONE on these three tables

The tier-2 lockdown (`APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`) drops + replaces only policies matching `cmd='SELECT' AND qual='true' AND (roles='{public}' OR 'anon'=ANY(roles))` (excluding `settings`). For all three tables here:
- The per-command `SELECT` policies ("Authenticated users can view …") are `TO authenticated` (roles = `{authenticated}`) — not `{public}`, no `anon`. **No match.**
- The `FOR ALL` "full access" policies are PUBLIC, but their `pg_policies.cmd` is `'ALL'` (not `'SELECT'`) and their `qual` is `(auth.uid() IS NOT NULL)` (not `'true'`). **No match** on either condition.

Therefore the lockdown creates **no** `auth_read_*` policy for these tables and drops nothing. The effective state below is the post-migration state, unchanged by the lockdown.

---

## validation_conversations

RLS: **ENABLED** (`20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql`). Not FORCED.

Table is keyed to a COC validation: `validation_id → coc_validations(id) ON DELETE CASCADE`, `subsection_id → subsections(id) ON DELETE CASCADE`, `created_by → auth.users(id) ON DELETE SET NULL` (nullable). `status` CHECK ∈ (`active`,`resolved`,`archived`).

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Authenticated users can view conversations | SELECT | authenticated | `true` | — | `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql` |
| Authenticated users can create conversations | INSERT | authenticated | — | `auth.uid() = created_by` | `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql` |
| Users can update their own conversations | UPDATE | authenticated | `auth.uid() = created_by` | — | `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql` |
| All authenticated users full access to validation_conversations | ALL | PUBLIC (no TO; gated by expr) | `auth.uid() IS NOT NULL` | `auth.uid() IS NOT NULL` | `20251120080517_643a23ca-0be6-4205-9103-3329d42e412f.sql` |

Notes:
- No policy was ever dropped on this table; the original three per-command policies and the `20251120080517` blanket `FOR ALL` policy all coexist. The blanket policy is the broadest: it grants every command to any signed-in user, so it **supersedes the practical effect** of the narrower `created_by`-scoped INSERT/UPDATE policies (an INSERT with a foreign `created_by`, or an UPDATE of someone else's conversation, passes via the blanket policy even though the narrow policy would reject it).
- No DELETE policy existed before `20251120080517`; the blanket `FOR ALL` policy is the only thing that grants DELETE — to any authenticated user.
- `BEFORE UPDATE` trigger `update_validation_conversations_updated_at` maintains `updated_at` (`20251016114052`).

Access summary:
- **anon**: no access (every policy is `TO authenticated` or gated by `auth.uid() IS NOT NULL`).
- **authenticated**: SELECT all rows; INSERT/UPDATE/DELETE any row (blanket `auth.uid() IS NOT NULL` `FOR ALL` policy overrides the narrower own-row INSERT/UPDATE policies).
- **service_role**: full access (RLS bypass).

---

## validation_feedback

RLS: **ENABLED** (`20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql`). Not FORCED.

Curated feedback rows: `conversation_id → validation_conversations(id) ON DELETE CASCADE` (nullable), `validation_id → coc_validations(id) ON DELETE CASCADE` (nullable), `reviewed_by`/`created_by → auth.users(id) ON DELETE SET NULL` (nullable). `feedback_type` CHECK ∈ (`clarification`,`correction`,`enhancement`,`edge_case`); `status` CHECK ∈ (`pending`,`reviewed`,`implemented`,`rejected`).

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Authenticated users can view feedback | SELECT | authenticated | `true` | — | `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql` |
| Authenticated users can create feedback | INSERT | authenticated | — | `auth.uid() = created_by` | `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql` |
| Admins can update feedback | UPDATE | authenticated | `has_role(auth.uid(), 'Admin')` | — | `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql` |
| All authenticated users full access to validation_feedback | ALL | PUBLIC (no TO; gated by expr) | `auth.uid() IS NOT NULL` | `auth.uid() IS NOT NULL` | `20251120080517_643a23ca-0be6-4205-9103-3329d42e412f.sql` |

Notes:
- `'Admin'` in "Admins can update feedback" is passed as a **bare text literal without `::app_role` cast** (verbatim from the migration).
- No policy was dropped here; all four coexist. The blanket `FOR ALL` policy (`20251120080517`) **supersedes the practical effect** of the Admin-only UPDATE restriction and the own-row INSERT restriction: any authenticated user can UPDATE feedback and can INSERT with any `created_by`. It is also the only policy granting DELETE — to any authenticated user.

Access summary:
- **anon**: no access.
- **authenticated**: SELECT all rows; INSERT/UPDATE/DELETE any row (blanket `auth.uid() IS NOT NULL` `FOR ALL` policy overrides both the own-row INSERT check and the Admin-only UPDATE restriction — the Admin gate is effectively dead).
- **service_role**: full access (RLS bypass).

---

## validation_messages

RLS: **ENABLED** (`20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql`). Not FORCED.

Per-conversation messages: `conversation_id → validation_conversations(id) ON DELETE CASCADE`, `created_by → auth.users(id) ON DELETE SET NULL` (nullable). `role` CHECK ∈ (`user`,`assistant`,`system`).

| Policy | Cmd | Roles | USING | WITH CHECK | Last defined by |
|---|---|---|---|---|---|
| Authenticated users can view messages | SELECT | authenticated | `true` | — | `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql` |
| Authenticated users can create messages | INSERT | authenticated | — | `auth.uid() = created_by OR role = 'assistant'` | `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql` |
| All authenticated users full access to validation_messages | ALL | PUBLIC (no TO; gated by expr) | `auth.uid() IS NOT NULL` | `auth.uid() IS NOT NULL` | `20251120080517_643a23ca-0be6-4205-9103-3329d42e412f.sql` |

Notes:
- The original INSERT WITH CHECK is `auth.uid() = created_by OR role = 'assistant'` (the `role = 'assistant'` branch lets clients persist assistant-authored messages with a NULL/foreign `created_by`).
- No UPDATE or DELETE policy existed before `20251120080517`. The blanket `FOR ALL` policy is the **only** source of UPDATE/DELETE permission, and it grants both to any authenticated user. It also supersedes the INSERT check (any authenticated user can INSERT any message regardless of `created_by`/`role`).
- No policy was dropped on this table.

Access summary:
- **anon**: no access.
- **authenticated**: SELECT all rows; INSERT/UPDATE/DELETE any row (blanket `auth.uid() IS NOT NULL` `FOR ALL` policy; the original `created_by OR role='assistant'` INSERT gate is effectively superseded).
- **service_role**: full access (RLS bypass).
