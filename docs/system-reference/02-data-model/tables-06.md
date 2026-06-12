# Data Model — Tables (batch 06)

Effective-schema reference for: `user_sites_history`, `user_storage_connections`, `validation_conversations`, `validation_feedback`, `validation_messages`.

Method: effective state computed by replaying the chronological DDL event log (`docs/system-reference/_work/migration-events-01.json` … `-10.json`) in order, then applying `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` (which references none of these five tables — verified by grep). For every table below, the entire event history is create/enable-only: no `DROP`, `ALTER … RENAME`, or column-drop events exist in any batch (verified by enumerating all events with `table ∈ {these five}`). types.ts cross-checked against `src/integrations/supabase/types.ts`.

Policy *names* are listed; policy bodies are documented in the RLS reference elsewhere.

---

## user_sites_history

**Purpose.** Audit log of contractor↔site assignment changes (`assigned` / `removed`). Rows are written automatically by the `log_user_site_assignment()` trigger on `public.user_sites` INSERT/DELETE (migration `20251119091647_56f5417f-d8fc-439c-b8ee-87aa78e81070.sql`). Read by the admin "Recent Assignments" widget — `src/components/RecentAssignmentsWidget.tsx:40` (`supabase.from("user_sites_history").select("*").order("performed_at", …).limit(10)`) and the site-assignments view `src/views/SiteAssignments.tsx:225`.

**Created:** `20251119091647_56f5417f-d8fc-439c-b8ee-87aa78e81070.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| user_id | uuid | NOT NULL | — | none (no FK — value is an auth user id but unconstrained) |
| site_id | uuid | NOT NULL | — | none (no FK to sites) |
| action | text | NOT NULL | — | — |
| performed_by | uuid | nullable | — | auth.users(id) (no ON DELETE action stated → NO ACTION) |
| performed_at | timestamptz | NOT NULL | now() | — |
| notes | text | nullable | — | — |

Citation: migration `20251119091647…sql` (CREATE TABLE detail).

### Constraints, indexes, unique keys
- CHECK: `action IN ('assigned','removed')`.
- PK: `id`.
- No secondary indexes created in any migration. No UNIQUE constraint beyond the PK.

### RLS
Enabled: **yes** (`ALTER TABLE … ENABLE ROW LEVEL SECURITY`).
Policy names:
- `Admins can view assignment history` (SELECT)
- `System can insert assignment history` (INSERT)

### Triggers
None attached to `user_sites_history` itself. (The writer trigger `log_user_site_assignment` is attached to `user_sites`, not this table.)

### types.ts cross-check
`src/integrations/supabase/types.ts:3298` — Row columns `action, id, notes, performed_at, performed_by, site_id, user_id`. Nullability matches migrations (`notes`, `performed_by` nullable; rest NOT NULL). `Relationships: []` (consistent with no DB-level FKs). **No discrepancy.**

### Notable history
Single migration; no renames/drops/backfills.

---

## user_storage_connections

**Purpose.** Per-user cloud-storage OAuth connections (Google Drive / Dropbox), storing access/refresh tokens in plaintext. Created as the per-user replacement for the company-wide OAuth columns that had been added to `settings` earlier the same day and dropped in the same migration. Source: migration `20251027081639_22cefe19-20a8-46df-93a3-f10415c8a441.sql`.
⚠️ UNVERIFIED — no application or edge-function call site found: grep across `src/` and `supabase/functions/` for `user_storage_connections` / `storage_connections` / `storageConnection` returned matches only in migrations. The table exists and is RLS-protected but appears unreferenced by checked-in code.

**Created:** `20251027081639_22cefe19-20a8-46df-93a3-f10415c8a441.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| user_id | uuid | NOT NULL | — | auth.users(id) ON DELETE CASCADE |
| provider | text | NOT NULL | — | — |
| access_token | text | nullable | — | — |
| refresh_token | text | nullable | — | — |
| token_expiry | timestamptz | nullable | — | — |
| account_email | text | nullable | — | — |
| connected_at | timestamptz | nullable | now() | — |
| last_synced_at | timestamptz | nullable | — | — |
| sync_enabled | boolean | nullable | false | — |
| auto_backup_enabled | boolean | nullable | false | — |
| created_at | timestamptz | nullable | now() | — |
| updated_at | timestamptz | nullable | now() | — |

Citation: migration `20251027081639…sql` (CREATE TABLE detail).

### Constraints, indexes, unique keys
- CHECK: `provider IN ('google_drive','dropbox')`.
- UNIQUE: `(user_id, provider)`.
- PK: `id`.
- No secondary indexes created.

### RLS
Enabled: **yes**.
Policy names:
- `Users can view their own storage connections` (SELECT)
- `Users can insert their own storage connections` (INSERT)
- `Users can update their own storage connections` (UPDATE)
- `Users can delete their own storage connections` (DELETE)

### Triggers
- `update_user_storage_connections_updated_at` — BEFORE UPDATE FOR EACH ROW → `public.update_updated_at_column()`.

### types.ts cross-check
`src/integrations/supabase/types.ts:3328` — Row columns and nullability match migrations exactly (`user_id`, `provider` NOT NULL; all others nullable). `Relationships: []` (the `user_id → auth.users` FK is to the `auth` schema, which the generated `public` types do not list). **No discrepancy.**

### Notable history
Same migration also performed a 12-column `DROP COLUMN IF EXISTS` on `settings`, retiring the company-wide cloud-storage fields in favour of this per-user table. No renames/drops on this table itself.

---

## validation_conversations

**Purpose.** Per-comment: "Stores conversations about COC validations for learning and improvement." Parent of `validation_messages` and an optional parent of `validation_feedback`. Source: migration `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql`.
⚠️ UNVERIFIED — no application or edge-function call site found: grep across `src/` and `supabase/functions/` for `validation_conversations` / `validationConversation` returned matches only in migrations. Table exists and is RLS-protected but appears unreferenced by checked-in code (the validation-feedback UI reads/writes only `validation_feedback`).

**Created:** `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| validation_id | uuid | NOT NULL | — | coc_validations(id) ON DELETE CASCADE |
| subsection_id | uuid | NOT NULL | — | subsections(id) ON DELETE CASCADE |
| document_id | uuid | NOT NULL | — | none (no FK) |
| created_by | uuid | nullable | — | auth.users(id) ON DELETE SET NULL |
| created_at | timestamptz | nullable | now() | — |
| updated_at | timestamptz | nullable | now() | — |
| title | text | nullable | — | — |
| status | text | nullable | 'active' | — |

Citation: migration `20251016114052…sql` (CREATE TABLE detail).

### Constraints, indexes, unique keys
- CHECK: `status IN ('active','resolved','archived')`.
- PK: `id`.
- Indexes: `idx_validation_conversations_validation` on `(validation_id)`; `idx_validation_conversations_subsection` on `(subsection_id)`.
- No UNIQUE beyond the PK.

### RLS
Enabled: **yes**.
Policy names:
- `Authenticated users can view conversations` (SELECT)
- `Authenticated users can create conversations` (INSERT)
- `Users can update their own conversations` (UPDATE)
- `All authenticated users full access to validation_conversations` (FOR ALL — added later in `20251120080517_643a23ca-0be6-4205-9103-3329d42e412f.sql`; additive, no prior policy dropped)

### Triggers
- `update_validation_conversations_updated_at` — BEFORE UPDATE FOR EACH ROW → `public.update_updated_at_column()`.

### types.ts cross-check
`src/integrations/supabase/types.ts:3376` — Row columns `created_at, created_by, document_id, id, status, subsection_id, title, updated_at, validation_id`; `document_id, subsection_id, validation_id` NOT NULL, rest nullable — matches migration. Relationships list only the `subsection_id → subsections` and `validation_id → coc_validations` FKs (the `created_by → auth.users` FK is in the `auth` schema and not surfaced; `document_id` correctly has no relationship). **No discrepancy.**

### Notable history
A later broad migration (`20251120080517…sql`) added an additive `FOR ALL` "full access" policy (see above). No renames/drops/backfills.

---

## validation_feedback

**Purpose.** Per-comment: "Stores curated feedback from conversations for improving the validation AI." This is the one validation-* table with confirmed app usage — read and status-updated in the feedback admin view `src/views/ValidationFeedback.tsx:39` (`supabase.from('validation_feedback').select('*').order('created_at', …)`) and `:67` (UPDATE of `status/reviewed_by/reviewed_at/implementation_notes`). Source: migration `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql`.

**Created:** `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| conversation_id | uuid | nullable | — | validation_conversations(id) ON DELETE CASCADE |
| validation_id | uuid | nullable | — | coc_validations(id) ON DELETE CASCADE |
| feedback_type | text | NOT NULL | — | — |
| title | text | NOT NULL | — | — |
| description | text | NOT NULL | — | — |
| original_finding | text | nullable | — | — |
| suggested_improvement | text | nullable | — | — |
| status | text | nullable | 'pending' | — |
| reviewed_by | uuid | nullable | — | auth.users(id) ON DELETE SET NULL |
| reviewed_at | timestamptz | nullable | — | — |
| implementation_notes | text | nullable | — | — |
| created_at | timestamptz | nullable | now() | — |
| created_by | uuid | nullable | — | auth.users(id) ON DELETE SET NULL |

Citation: migration `20251016114052…sql` (CREATE TABLE detail).

### Constraints, indexes, unique keys
- CHECK: `feedback_type IN ('clarification','correction','enhancement','edge_case')`.
- CHECK: `status IN ('pending','reviewed','implemented','rejected')`.
- PK: `id`.
- Indexes: `idx_validation_feedback_status` on `(status)`; `idx_validation_feedback_type` on `(feedback_type)`.
- No UNIQUE beyond the PK.

### RLS
Enabled: **yes**.
Policy names:
- `Authenticated users can view feedback` (SELECT)
- `Authenticated users can create feedback` (INSERT)
- `Admins can update feedback` (UPDATE)
- `All authenticated users full access to validation_feedback` (FOR ALL — added later in `20251120080517…sql`; additive)

### Triggers
None. (No `updated_at` column exists, and no trigger was created for this table.)

### types.ts cross-check
`src/integrations/supabase/types.ts:3427` — Row columns `conversation_id, created_at, created_by, description, feedback_type, id, implementation_notes, original_finding, reviewed_at, reviewed_by, status, suggested_improvement, title, validation_id`; NOT NULL set = `description, feedback_type, title` (plus implicit `id`), all others nullable — matches migration. Relationships list `conversation_id → validation_conversations` and `validation_id → coc_validations`; the two `auth.users` FKs are not surfaced (auth schema). **No discrepancy.**

### Notable history
Later additive `FOR ALL` "full access" policy via `20251120080517…sql`. No renames/drops/backfills.

---

## validation_messages

**Purpose.** Per-comment: "Stores individual messages in validation conversations." Child of `validation_conversations`. Source: migration `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql`.
⚠️ UNVERIFIED — no application or edge-function call site found: grep across `src/` and `supabase/functions/` for `validation_messages` / `validationMessage` returned matches only in migrations. Table exists and is RLS-protected but appears unreferenced by checked-in code.

**Created:** `20251016114052_48071cee-3dfb-48ce-b79e-65acf3188ace.sql`.

### Columns

| name | type | null | default | FK references |
|---|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| conversation_id | uuid | NOT NULL | — | validation_conversations(id) ON DELETE CASCADE |
| role | text | NOT NULL | — | — |
| content | text | NOT NULL | — | — |
| metadata | jsonb | nullable | '{}' | — |
| created_at | timestamptz | nullable | now() | — |
| created_by | uuid | nullable | — | auth.users(id) ON DELETE SET NULL |

Citation: migration `20251016114052…sql` (CREATE TABLE detail).

### Constraints, indexes, unique keys
- CHECK: `role IN ('user','assistant','system')`.
- PK: `id`.
- Indexes: `idx_validation_messages_conversation` on `(conversation_id)`; `idx_validation_messages_created_at` on `(created_at)`.
- No UNIQUE beyond the PK.

### RLS
Enabled: **yes**.
Policy names:
- `Authenticated users can view messages` (SELECT)
- `Authenticated users can create messages` (INSERT — WITH CHECK `auth.uid() = created_by OR role = 'assistant'`)
- `All authenticated users full access to validation_messages` (FOR ALL — added later in `20251120080517…sql`; additive)

### Triggers
None. (No `updated_at` column; no trigger created.)

### types.ts cross-check
`src/integrations/supabase/types.ts:3493` — Row columns `content, conversation_id, created_at, created_by, id, metadata, role`; NOT NULL = `content, conversation_id, role` (plus implicit `id`), `metadata` nullable Json, `created_at`/`created_by` nullable — matches migration. Relationships list `conversation_id → validation_conversations`; `created_by → auth.users` not surfaced (auth schema). **No discrepancy.**

### Notable history
Later additive `FOR ALL` "full access" policy via `20251120080517…sql`. No renames/drops/backfills.
