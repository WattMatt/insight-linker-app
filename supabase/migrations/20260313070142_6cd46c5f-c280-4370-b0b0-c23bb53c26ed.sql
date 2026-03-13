-- Fix schematic_blocks INSERT policy to target authenticated role
DROP POLICY IF EXISTS "Authenticated users can insert schematic blocks" ON public.schematic_blocks;
CREATE POLICY "Authenticated users can insert schematic blocks"
ON public.schematic_blocks
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Also fix UPDATE and DELETE policies for consistency
DROP POLICY IF EXISTS "Authenticated users can update schematic blocks" ON public.schematic_blocks;
CREATE POLICY "Authenticated users can update schematic blocks"
ON public.schematic_blocks
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete schematic blocks" ON public.schematic_blocks;
CREATE POLICY "Authenticated users can delete schematic blocks"
ON public.schematic_blocks
FOR DELETE
TO authenticated
USING (true);