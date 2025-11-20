-- Create a function to validate inspection template structure
CREATE OR REPLACE FUNCTION validate_inspection_templates()
RETURNS TABLE (
  template_id uuid,
  template_name text,
  issue_type text,
  issue_description text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH template_analysis AS (
    SELECT 
      it.id,
      it.name,
      it.sections,
      jsonb_typeof(it.sections) as sections_type,
      CASE 
        WHEN it.sections IS NULL THEN 'No sections defined'
        WHEN jsonb_typeof(it.sections) != 'array' THEN 'Sections not in array format'
        WHEN jsonb_array_length(it.sections) = 0 THEN 'No sections in template'
        ELSE NULL
      END as structure_issue
    FROM inspection_templates it
  )
  SELECT 
    ta.id,
    ta.name,
    'Structure'::text,
    ta.structure_issue
  FROM template_analysis ta
  WHERE ta.structure_issue IS NOT NULL
  
  UNION ALL
  
  -- Check for sections without names
  SELECT 
    it.id,
    it.name,
    'Missing Name'::text,
    format('Section %s is missing a name', section->>'id')
  FROM inspection_templates it,
       jsonb_array_elements(it.sections) as section
  WHERE (section->>'name' IS NULL OR section->>'name' = '')
    AND jsonb_typeof(it.sections) = 'array'
  
  UNION ALL
  
  -- Check for duplicate section IDs
  SELECT 
    it.id,
    it.name,
    'Duplicate ID'::text,
    format('Section ID "%s" appears multiple times', section_id)
  FROM (
    SELECT 
      it.id,
      it.name,
      section->>'id' as section_id,
      COUNT(*) as id_count
    FROM inspection_templates it,
         jsonb_array_elements(it.sections) as section
    WHERE jsonb_typeof(it.sections) = 'array'
    GROUP BY it.id, it.name, section->>'id'
  ) duplicates
  WHERE id_count > 1;
END;
$$;

COMMENT ON FUNCTION validate_inspection_templates() IS 'Validates the structure and integrity of inspection templates';

-- Grant execute permission to admins
GRANT EXECUTE ON FUNCTION validate_inspection_templates() TO authenticated;