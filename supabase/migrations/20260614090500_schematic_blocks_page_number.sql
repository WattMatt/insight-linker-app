-- Scope schematic blocks to a PDF page.
--
-- Blocks store percentage positions but had no page reference, so on a multi-page schematic
-- every block rendered on every page (page-1 blocks bled onto page 2+). Add page_number;
-- existing rows belong to page 1.
--
-- Safe/idempotent for prod schema drift.

ALTER TABLE public.schematic_blocks
  ADD COLUMN IF NOT EXISTS page_number INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_schematic_blocks_page
  ON public.schematic_blocks(schematic_id, page_number);
