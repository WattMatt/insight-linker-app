
-- 1. Add columns to snags
ALTER TABLE snags
  ADD COLUMN IF NOT EXISTS project_id             text,
  ADD COLUMN IF NOT EXISTS attachment_urls         text[]       DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS closeout_photo_url      text,
  ADD COLUMN IF NOT EXISTS sign_off_requested_at   timestamptz,
  ADD COLUMN IF NOT EXISTS signed_off_by           text,
  ADD COLUMN IF NOT EXISTS signed_off_at           timestamptz;

-- 2. Create contractor_coc_uploads table
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
