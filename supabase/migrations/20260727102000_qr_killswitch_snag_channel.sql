-- Per-subsection QR kill-switch (checked by the qr-redirect edge function) and
-- provenance marker for snags created via the public QR issue form.
-- Idempotent: safe to re-run.
-- PROD APPLY: Supabase Management API database/query (project oltzgidkjxwsukvkomof),
-- NOT supabase db push (prod schema is ahead of schema_migrations).

ALTER TABLE public.subsections
  ADD COLUMN IF NOT EXISTS qr_disabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.snags
  ADD COLUMN IF NOT EXISTS reported_channel text NOT NULL DEFAULT 'internal';

DO $$ BEGIN
  ALTER TABLE public.snags
    ADD CONSTRAINT snags_reported_channel_check CHECK (reported_channel IN ('internal', 'public_qr'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
