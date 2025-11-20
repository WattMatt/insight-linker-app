-- Drop and recreate the validation function with corrected SQL
DROP FUNCTION IF EXISTS validate_inspection_templates();

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
  -- Check for structure issues
  SELECT 
    it.id,
    it.name,
    'Structure'::text,
    CASE 
      WHEN it.sections IS NULL THEN 'No sections defined'
      WHEN jsonb_typeof(it.sections) != 'array' THEN 'Sections not in array format'
      WHEN jsonb_array_length(it.sections) = 0 THEN 'No sections in template'
      ELSE 'Unknown structure issue'
    END::text
  FROM inspection_templates it
  WHERE it.sections IS NULL 
     OR jsonb_typeof(it.sections) != 'array'
     OR jsonb_array_length(it.sections) = 0
  
  UNION ALL
  
  -- Check for sections without names
  SELECT 
    t.id,
    t.name,
    'Missing Name'::text,
    format('Section %s is missing a name', section->>'id')::text
  FROM inspection_templates t,
       jsonb_array_elements(t.sections) as section
  WHERE (section->>'name' IS NULL OR section->>'name' = '')
    AND jsonb_typeof(t.sections) = 'array'
  
  UNION ALL
  
  -- Check for duplicate section IDs
  SELECT 
    duplicates.id,
    duplicates.name,
    'Duplicate ID'::text,
    format('Section ID "%s" appears %s times', duplicates.section_id, duplicates.id_count)::text
  FROM (
    SELECT 
      t.id,
      t.name,
      section->>'id' as section_id,
      COUNT(*) as id_count
    FROM inspection_templates t,
         jsonb_array_elements(t.sections) as section
    WHERE jsonb_typeof(t.sections) = 'array'
    GROUP BY t.id, t.name, section->>'id'
    HAVING COUNT(*) > 1
  ) duplicates;
END;
$$;

COMMENT ON FUNCTION validate_inspection_templates() IS 'Validates the structure and integrity of inspection templates';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION validate_inspection_templates() TO authenticated;