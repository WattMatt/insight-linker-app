-- Migration to normalize all inspection template sections
-- This ensures all templates have proper section names and structure

DO $$
DECLARE
  template_record RECORD;
  sections_data jsonb;
  normalized_sections jsonb;
  section_item jsonb;
BEGIN
  -- Loop through all templates
  FOR template_record IN 
    SELECT id, name, sections 
    FROM inspection_templates 
    WHERE sections IS NOT NULL
  LOOP
    normalized_sections := '[]'::jsonb;
    
    -- Check if sections is an array (correct format)
    IF jsonb_typeof(template_record.sections) = 'array' THEN
      -- Process each section in the array
      FOR section_item IN 
        SELECT * FROM jsonb_array_elements(template_record.sections)
      LOOP
        -- Ensure section has a name field, if not use id or generate one
        IF section_item->>'name' IS NULL OR section_item->>'name' = '' THEN
          section_item := jsonb_set(
            section_item,
            '{name}',
            to_jsonb(
              COALESCE(
                -- Try to use id and format it nicely
                regexp_replace(
                  initcap(replace(section_item->>'id', '_', ' ')),
                  '([A-Z])',
                  ' \1',
                  'g'
                ),
                'Unnamed Section'
              )
            )
          );
        END IF;
        
        normalized_sections := normalized_sections || jsonb_build_array(section_item);
      END LOOP;
      
    -- If sections is an object (old format), convert to array
    ELSIF jsonb_typeof(template_record.sections) = 'object' THEN
      -- Loop through each key-value pair in the object
      FOR section_item IN 
        SELECT jsonb_build_object(
          'id', key,
          'name', COALESCE(
            value->>'name',
            -- Format the key as a nice name
            regexp_replace(initcap(replace(key, '_', ' ')), '([A-Z])', ' \1', 'g')
          ),
          'order_index', COALESCE((value->>'order_index')::integer, 0),
          'items', COALESCE(value->'items', '[]'::jsonb)
        ) as section
        FROM jsonb_each(template_record.sections)
      LOOP
        normalized_sections := normalized_sections || jsonb_build_array(section_item.section);
      END LOOP;
    END IF;
    
    -- Update the template with normalized sections
    IF jsonb_array_length(normalized_sections) > 0 THEN
      UPDATE inspection_templates
      SET sections = normalized_sections
      WHERE id = template_record.id;
      
      RAISE NOTICE 'Normalized template: % (ID: %)', template_record.name, template_record.id;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Template normalization complete';
END $$;