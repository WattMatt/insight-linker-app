-- Storage read access: signed-in users only (was: anyone, including anonymous visitors).
--
-- "Anyone can view non-document storage" (TO public) let anonymous visitors LIST and download
-- every object in every bucket except `documents` — verified 2026-10-26 with the anon key against
-- inspection-photos (38.5k files), site-images, client-logos, reports, issue-screenshots.
--
-- These buckets are public=true, so public object URLs keep working without any policy; that is
-- what the no-login pages (/public, /review/[token], /portfolio/[token]) and PDFs use. The app's
-- signed-in code still needs SELECT (signed site-image URLs for clients/contractors, downloads,
-- folder listing), which the replacement policy grants. `documents` policies are untouched.
--
-- Also drops the two narrower TO public read policies the broad one made redundant
-- (coc-photos: no objects, no app code; reports: no app code).
--
-- Undo:
--   create policy "Anyone can view non-document storage" on storage.objects
--     for select to public using (bucket_id <> 'documents');
--
-- PROD APPLY: via Management API only (migration history has diverged — never `db push`).

drop policy if exists "Anyone can view non-document storage" on storage.objects;
drop policy if exists "Anyone can view COC photos" on storage.objects;
drop policy if exists "reports_bucket_read" on storage.objects;
drop policy if exists "Signed-in users can view non-document storage" on storage.objects;

create policy "Signed-in users can view non-document storage"
  on storage.objects
  for select
  to authenticated
  using (bucket_id <> 'documents');
