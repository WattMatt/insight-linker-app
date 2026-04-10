

# Database Migration: Snags Enhancements + Contractor COC Uploads

## Verified Current State
- **snags table**: exists with 17 columns; none of the 6 new columns exist yet
- **contractor_coc_uploads table**: does not exist

## Migration 1 — Add columns to `snags`

```sql
ALTER TABLE snags
  ADD COLUMN IF NOT EXISTS project_id             text,
  ADD COLUMN IF NOT EXISTS attachment_urls         text[]       DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS closeout_photo_url      text,
  ADD COLUMN IF NOT EXISTS sign_off_requested_at   timestamptz,
  ADD COLUMN IF NOT EXISTS signed_off_by           text,
  ADD COLUMN IF NOT EXISTS signed_off_at           timestamptz;
```

## Migration 2 — Create `contractor_coc_uploads` table with RLS

```sql
CREATE TABLE IF NOT EXISTS contractor_coc_uploads (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       text        NOT NULL,
  section_name     text        NOT NULL,
  file_url         text        NOT NULL,
  file_name        text,
  contractor_email text,
  notes            text,
  status           text        NOT NULL DEFAULT 'submitted',
  submitted_at     timestamptz DEFAULT now()
);

ALTER TABLE contractor_coc_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow read"
  ON contractor_coc_uploads FOR SELECT USING (true);

CREATE POLICY "allow insert"
  ON contractor_coc_uploads FOR INSERT WITH CHECK (true);

CREATE POLICY "allow update"
  ON contractor_coc_uploads FOR UPDATE USING (true);
```

## What happens
- No code or UI changes — database only
- Both migrations will be run via the migration tool
- Results confirmed and any errors reported back

