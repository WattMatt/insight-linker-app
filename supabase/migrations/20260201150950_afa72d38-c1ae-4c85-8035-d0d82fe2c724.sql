-- Fix 1: Set is_compliant=false for subsections with Missing COC that require COC
-- These 5 Yarona subsections incorrectly show is_compliant=true

UPDATE subsections
SET is_compliant = false, updated_at = now()
WHERE id IN (
  '9b4f3ac9-2b95-4ab7-8e2c-b6b4ce5bd1b2', -- LV ROOM
  '9e31a990-273f-4564-8650-927935b9bacb', -- GENERATOR
  '46dfaeea-6e37-4781-9ed8-91761f38b43e', -- CENTRE MANAGEMENT
  '01b5bf41-7a9f-495e-be4b-aee8c548de96', -- SHOPRITE
  'e6b5ba63-9a68-40da-9dc8-ccec9e5f79fd'  -- SHOPRITE LIQUOR
);

-- Fix 2: Set is_compliant=true for DAY TO DAY (has Pass validation, all checks passed)
UPDATE subsections
SET is_compliant = true, updated_at = now()
WHERE id = 'fb6eb96d-9f70-4e7d-984c-a52b0ddd6518';

-- Also fix any other subsections globally where coc_status=Missing and is_coc_required=true but is_compliant=true
UPDATE subsections
SET is_compliant = false, updated_at = now()
WHERE coc_status = 'Missing' 
  AND is_coc_required = true 
  AND is_compliant = true;