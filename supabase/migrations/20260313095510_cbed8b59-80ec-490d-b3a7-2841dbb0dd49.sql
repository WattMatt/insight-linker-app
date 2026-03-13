
DROP POLICY IF EXISTS "Authenticated users can insert schematic blocks" ON public.schematic_blocks;

CREATE POLICY "Authenticated users can insert schematic blocks"
ON public.schematic_blocks
FOR INSERT
TO authenticated
WITH CHECK (true);
