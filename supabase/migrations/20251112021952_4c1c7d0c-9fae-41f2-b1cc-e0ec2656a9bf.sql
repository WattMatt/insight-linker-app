-- Function to normalize inspection json_data from numeric to string keys
CREATE OR REPLACE FUNCTION normalize_inspection_json_data()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  insp_record RECORD;
  template_record RECORD;
  raw_json_data jsonb;
  template_sections jsonb;
  normalized_data jsonb := '{}'::jsonb;
  section_obj jsonb;
  section_index integer;
  section_id text;
  section_items jsonb;
  item_obj jsonb;
  item_index integer;
  item_id text;
  numeric_section_data jsonb;
  item_data jsonb;
  top_level_keys text[];
  is_numeric_format boolean;
  updated_count integer := 0;
BEGIN
  -- Loop through all inspections that have json_data and a template_id
  FOR insp_record IN 
    SELECT id, json_data, template_id 
    FROM inspections 
    WHERE json_data IS NOT NULL 
      AND template_id IS NOT NULL
  LOOP
    raw_json_data := insp_record.json_data;
    
    -- Check if data is in numeric format by looking for numeric keys
    top_level_keys := ARRAY(SELECT jsonb_object_keys(raw_json_data));
    is_numeric_format := EXISTS (
      SELECT 1 FROM unnest(top_level_keys) AS key 
      WHERE key ~ '^[0-9]+$'
    );
    
    -- Skip if already in string key format
    IF NOT is_numeric_format THEN
      CONTINUE;
    END IF;
    
    -- Get the template for this inspection
    SELECT sections INTO template_sections
    FROM inspection_templates
    WHERE id = insp_record.template_id;
    
    -- Skip if no template or sections not found
    IF template_sections IS NULL THEN
      RAISE NOTICE 'Skipping inspection % - no template found', insp_record.id;
      CONTINUE;
    END IF;
    
    -- Initialize normalized data
    normalized_data := '{}'::jsonb;
    
    -- Check if sections is an array (new format) or object (old format)
    IF jsonb_typeof(template_sections) = 'array' THEN
      -- Template sections is an array
      section_index := 0;
      
      FOR section_obj IN SELECT * FROM jsonb_array_elements(template_sections)
      LOOP
        -- Get section ID from template
        section_id := section_obj->>'id';
        section_items := section_obj->'items';
        
        -- Skip if section_id is null
        IF section_id IS NULL THEN
          section_index := section_index + 1;
          CONTINUE;
        END IF;
        
        -- Initialize section in normalized data
        normalized_data := normalized_data || jsonb_build_object(section_id, '{}'::jsonb);
        
        -- Get numeric section data from raw json
        numeric_section_data := raw_json_data->section_index::text;
        
        -- Process items if they exist
        IF numeric_section_data IS NOT NULL AND section_items IS NOT NULL THEN
          IF jsonb_typeof(section_items) = 'array' THEN
            item_index := 0;
            
            FOR item_obj IN SELECT * FROM jsonb_array_elements(section_items)
            LOOP
              item_id := item_obj->>'id';
              
              IF item_id IS NOT NULL THEN
                -- Get item data from numeric format
                item_data := numeric_section_data->item_index::text;
                
                IF item_data IS NOT NULL THEN
                  -- Add to normalized data
                  normalized_data := jsonb_set(
                    normalized_data,
                    ARRAY[section_id, item_id],
                    item_data,
                    true
                  );
                ELSE
                  -- Initialize empty if no data
                  normalized_data := jsonb_set(
                    normalized_data,
                    ARRAY[section_id, item_id],
                    '{}'::jsonb,
                    true
                  );
                END IF;
              END IF;
              
              item_index := item_index + 1;
            END LOOP;
          END IF;
        END IF;
        
        section_index := section_index + 1;
      END LOOP;
      
      -- Preserve tenants and other top-level fields if they exist
      IF raw_json_data ? 'tenants' THEN
        normalized_data := normalized_data || jsonb_build_object('tenants', raw_json_data->'tenants');
      END IF;
      
      IF raw_json_data ? 'observations' THEN
        normalized_data := normalized_data || jsonb_build_object('observations', raw_json_data->'observations');
      END IF;
      
      IF raw_json_data ? 'siteDrawingPdf' THEN
        normalized_data := normalized_data || jsonb_build_object('siteDrawingPdf', raw_json_data->'siteDrawingPdf');
      END IF;
      
      IF raw_json_data ? 'siteDrawingPins' THEN
        normalized_data := normalized_data || jsonb_build_object('siteDrawingPins', raw_json_data->'siteDrawingPins');
      END IF;
      
      IF raw_json_data ? 'siteDrawingCanvas' THEN
        normalized_data := normalized_data || jsonb_build_object('siteDrawingCanvas', raw_json_data->'siteDrawingCanvas');
      END IF;
      
      -- Update the inspection with normalized data
      UPDATE inspections 
      SET json_data = normalized_data
      WHERE id = insp_record.id;
      
      updated_count := updated_count + 1;
      RAISE NOTICE 'Normalized inspection % (% sections)', insp_record.id, jsonb_array_length(template_sections);
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Migration complete! Normalized % inspections', updated_count;
END;
$$;

-- Execute the normalization function
SELECT normalize_inspection_json_data();

-- Drop the function after use (optional - keep it if you might need it again)
DROP FUNCTION IF EXISTS normalize_inspection_json_data();