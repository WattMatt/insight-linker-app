-- Persist the assignment classification on each pooled COC file so the Bulk Assign
-- workspace and the upload report can show WHY a file is unassigned.
alter table public.coc_file_pool add column if not exists reason text;
alter table public.coc_file_pool add column if not exists candidate_ids jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
