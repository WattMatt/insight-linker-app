-- Relax the coc_status CHECK so the OLD validation flow (still deployed) does not break.
--
-- 20260611160000 added a strict CHECK (coc_status IN Missing|Pending|Pass|Fail|N/A).
-- But the old COC approval path is still live until COC tasks 2-8 land and remove it:
--   - supabase/functions/validate-coc/index.ts (writes 'Approved')
--   - src/views/subsection-detail/useSubsectionDetail.ts (writes 'Approved')
-- A strict CHECK would reject those writes (HTTP 4xx) and break the live app.
--
-- This permissive CHECK accepts the UNION of the new vocabulary and the legacy
-- vocabulary. When the old flow is fully removed, tighten this back to the strict
-- set in the same migration that deletes the validation engine.
ALTER TABLE public.subsections DROP CONSTRAINT IF EXISTS subsections_coc_status_check;
ALTER TABLE public.subsections ADD CONSTRAINT subsections_coc_status_check
  CHECK (
    coc_status IS NULL OR coc_status IN (
      'Missing','Pending','Pass','Fail','N/A',          -- new vocabulary
      'Approved','Valid','Failed','Rejected','none'     -- legacy vocabulary (transitional)
    )
  );

NOTIFY pgrst, 'reload schema';
