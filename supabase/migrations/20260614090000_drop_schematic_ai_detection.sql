-- Drop the unused AI schematic-region-detection columns.
--
-- The detect-schematic-regions edge function was never wired into the app (handleSchematicClick
-- placed blocks from calibration/defaults and explicitly skipped detection). The columns were
-- loaded but never rendered. The edge function has been removed; these columns are now dead.
--
-- Safe/idempotent: IF EXISTS guards tolerate the prod schema being ahead of migration history.

DROP INDEX IF EXISTS public.idx_site_schematics_detection_status;

ALTER TABLE public.site_schematics
  DROP COLUMN IF EXISTS detected_regions,
  DROP COLUMN IF EXISTS detection_status,
  DROP COLUMN IF EXISTS regions_detected_at;
