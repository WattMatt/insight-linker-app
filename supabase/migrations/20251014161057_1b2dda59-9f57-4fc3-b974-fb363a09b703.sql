-- Add template sections and cover page support
ALTER TABLE inspection_templates 
ADD COLUMN IF NOT EXISTS cover_page JSONB,
ADD COLUMN IF NOT EXISTS sections JSONB;

-- Insert mock inspection templates with detailed sections
INSERT INTO inspection_templates (name, category, description, sections_count, pages_count, cover_page, sections) VALUES
-- Electrical Inspection Templates
('Electrical Installation Certificate', 'Electrical', 'Comprehensive electrical installation inspection for new installations and alterations', 8, 12, 
 '{"title": "Electrical Installation Certificate", "subtitle": "Comprehensive Safety Inspection", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "Installation Details", "order_index": 1, "items": [
     {"id": "1-1", "name": "Installation Address", "type": "text", "required": true},
     {"id": "1-2", "name": "Type of Installation", "type": "select", "required": true},
     {"id": "1-3", "name": "Date of Inspection", "type": "date", "required": true}
   ]},
   {"id": "2", "name": "Supply Characteristics", "order_index": 2, "items": [
     {"id": "2-1", "name": "Supply Voltage", "type": "number", "required": true},
     {"id": "2-2", "name": "Frequency", "type": "number", "required": true},
     {"id": "2-3", "name": "Earthing System", "type": "select", "required": true}
   ]},
   {"id": "3", "name": "Main Protective Devices", "order_index": 3, "items": [
     {"id": "3-1", "name": "Type of Device", "type": "text", "required": true},
     {"id": "3-2", "name": "Rating", "type": "number", "required": true},
     {"id": "3-3", "name": "Condition", "type": "select", "required": true}
   ]},
   {"id": "4", "name": "Circuit Testing", "order_index": 4, "items": [
     {"id": "4-1", "name": "Insulation Resistance", "type": "number", "required": true},
     {"id": "4-2", "name": "Earth Continuity", "type": "number", "required": true},
     {"id": "4-3", "name": "RCD Test Results", "type": "number", "required": false}
   ]}
 ]'::jsonb),

('Distribution Board Inspection', 'Electrical', 'Detailed inspection of electrical distribution boards and consumer units', 6, 8,
 '{"title": "Distribution Board Inspection", "subtitle": "Safety & Compliance Check", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "Board Identification", "order_index": 1, "items": [
     {"id": "1-1", "name": "Board Location", "type": "text", "required": true},
     {"id": "1-2", "name": "Board Type", "type": "select", "required": true}
   ]},
   {"id": "2", "name": "Visual Inspection", "order_index": 2, "items": [
     {"id": "2-1", "name": "Physical Condition", "type": "select", "required": true},
     {"id": "2-2", "name": "Labeling Complete", "type": "boolean", "required": true}
   ]},
   {"id": "3", "name": "Circuit Protection", "order_index": 3, "items": [
     {"id": "3-1", "name": "Breaker Types", "type": "text", "required": true},
     {"id": "3-2", "name": "Ratings Appropriate", "type": "boolean", "required": true}
   ]}
 ]'::jsonb),

('Emergency Lighting Test', 'Electrical', 'Periodic testing of emergency lighting systems', 5, 6,
 '{"title": "Emergency Lighting Test", "subtitle": "Periodic Safety Inspection", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "System Overview", "order_index": 1, "items": [
     {"id": "1-1", "name": "Total Luminaires", "type": "number", "required": true},
     {"id": "1-2", "name": "System Type", "type": "select", "required": true}
   ]},
   {"id": "2", "name": "Duration Test", "order_index": 2, "items": [
     {"id": "2-1", "name": "Test Duration", "type": "number", "required": true},
     {"id": "2-2", "name": "All Units Functional", "type": "boolean", "required": true}
   ]}
 ]'::jsonb),

-- Fire Safety Templates
('Fire Alarm System Inspection', 'Fire Safety', 'Comprehensive fire detection and alarm system inspection', 7, 10,
 '{"title": "Fire Alarm System Inspection", "subtitle": "Life Safety System Check", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "System Information", "order_index": 1, "items": [
     {"id": "1-1", "name": "System Type", "type": "select", "required": true},
     {"id": "1-2", "name": "Zones Covered", "type": "number", "required": true}
   ]},
   {"id": "2", "name": "Control Panel", "order_index": 2, "items": [
     {"id": "2-1", "name": "Panel Model", "type": "text", "required": true},
     {"id": "2-2", "name": "Battery Status", "type": "select", "required": true}
   ]},
   {"id": "3", "name": "Detection Devices", "order_index": 3, "items": [
     {"id": "3-1", "name": "Smoke Detectors", "type": "number", "required": true},
     {"id": "3-2", "name": "Heat Detectors", "type": "number", "required": true}
   ]}
 ]'::jsonb),

('Fire Extinguisher Inspection', 'Fire Safety', 'Monthly and annual fire extinguisher inspection checklist', 4, 5,
 '{"title": "Fire Extinguisher Inspection", "subtitle": "Portable Fire Equipment Check", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "Equipment Details", "order_index": 1, "items": [
     {"id": "1-1", "name": "Extinguisher Type", "type": "select", "required": true},
     {"id": "1-2", "name": "Serial Number", "type": "text", "required": true}
   ]},
   {"id": "2", "name": "Physical Condition", "order_index": 2, "items": [
     {"id": "2-1", "name": "Pressure Gauge", "type": "select", "required": true},
     {"id": "2-2", "name": "Seal Intact", "type": "boolean", "required": true}
   ]}
 ]'::jsonb),

('Sprinkler System Test', 'Fire Safety', 'Quarterly inspection and testing of automatic sprinkler systems', 6, 9,
 '{"title": "Sprinkler System Test", "subtitle": "Automatic Fire Suppression Check", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "System Details", "order_index": 1, "items": [
     {"id": "1-1", "name": "System Coverage", "type": "text", "required": true},
     {"id": "1-2", "name": "Number of Heads", "type": "number", "required": true}
   ]},
   {"id": "2", "name": "Water Supply", "order_index": 2, "items": [
     {"id": "2-1", "name": "Static Pressure", "type": "number", "required": true},
     {"id": "2-2", "name": "Flow Rate", "type": "number", "required": true}
   ]}
 ]'::jsonb),

-- Building Structure Templates
('Structural Integrity Assessment', 'Structural', 'Comprehensive building structure safety inspection', 10, 15,
 '{"title": "Structural Integrity Assessment", "subtitle": "Building Safety Evaluation", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "Building Information", "order_index": 1, "items": [
     {"id": "1-1", "name": "Building Age", "type": "number", "required": true},
     {"id": "1-2", "name": "Construction Type", "type": "select", "required": true}
   ]},
   {"id": "2", "name": "Foundation Inspection", "order_index": 2, "items": [
     {"id": "2-1", "name": "Foundation Type", "type": "text", "required": true},
     {"id": "2-2", "name": "Cracks Present", "type": "boolean", "required": true}
   ]},
   {"id": "3", "name": "Load-Bearing Elements", "order_index": 3, "items": [
     {"id": "3-1", "name": "Columns Condition", "type": "select", "required": true},
     {"id": "3-2", "name": "Beams Condition", "type": "select", "required": true}
   ]}
 ]'::jsonb),

('Roof Inspection', 'Structural', 'Detailed roof condition and weatherproofing assessment', 5, 7,
 '{"title": "Roof Inspection", "subtitle": "Weather Protection Assessment", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "Roof Details", "order_index": 1, "items": [
     {"id": "1-1", "name": "Roof Type", "type": "select", "required": true},
     {"id": "1-2", "name": "Age of Roof", "type": "number", "required": true}
   ]},
   {"id": "2", "name": "Surface Condition", "order_index": 2, "items": [
     {"id": "2-1", "name": "Material Condition", "type": "select", "required": true},
     {"id": "2-2", "name": "Leaks Detected", "type": "boolean", "required": true}
   ]}
 ]'::jsonb),

-- HVAC Templates
('HVAC System Inspection', 'HVAC', 'Heating, ventilation, and air conditioning system maintenance check', 8, 11,
 '{"title": "HVAC System Inspection", "subtitle": "Climate Control Systems Check", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "System Information", "order_index": 1, "items": [
     {"id": "1-1", "name": "System Type", "type": "select", "required": true},
     {"id": "1-2", "name": "Capacity", "type": "number", "required": true}
   ]},
   {"id": "2", "name": "Air Handling Units", "order_index": 2, "items": [
     {"id": "2-1", "name": "Filter Condition", "type": "select", "required": true},
     {"id": "2-2", "name": "Belt Tension", "type": "select", "required": true}
   ]},
   {"id": "3", "name": "Refrigeration System", "order_index": 3, "items": [
     {"id": "3-1", "name": "Refrigerant Level", "type": "select", "required": true},
     {"id": "3-2", "name": "Compressor Operation", "type": "select", "required": true}
   ]}
 ]'::jsonb),

('Ventilation System Test', 'HVAC', 'Indoor air quality and ventilation performance testing', 5, 6,
 '{"title": "Ventilation System Test", "subtitle": "Air Quality Assessment", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "System Overview", "order_index": 1, "items": [
     {"id": "1-1", "name": "Air Changes per Hour", "type": "number", "required": true},
     {"id": "1-2", "name": "System Type", "type": "select", "required": true}
   ]},
   {"id": "2", "name": "Performance Testing", "order_index": 2, "items": [
     {"id": "2-1", "name": "Air Flow Rate", "type": "number", "required": true},
     {"id": "2-2", "name": "CO2 Levels", "type": "number", "required": true}
   ]}
 ]'::jsonb),

-- Plumbing Templates
('Plumbing System Inspection', 'Plumbing', 'Comprehensive water supply and drainage system inspection', 7, 9,
 '{"title": "Plumbing System Inspection", "subtitle": "Water Systems Safety Check", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "Water Supply", "order_index": 1, "items": [
     {"id": "1-1", "name": "Water Pressure", "type": "number", "required": true},
     {"id": "1-2", "name": "Pipe Material", "type": "text", "required": true}
   ]},
   {"id": "2", "name": "Drainage System", "order_index": 2, "items": [
     {"id": "2-1", "name": "Drain Flow", "type": "select", "required": true},
     {"id": "2-2", "name": "Blockages Present", "type": "boolean", "required": true}
   ]},
   {"id": "3", "name": "Hot Water System", "order_index": 3, "items": [
     {"id": "3-1", "name": "Water Heater Type", "type": "select", "required": true},
     {"id": "3-2", "name": "Temperature Setting", "type": "number", "required": true}
   ]}
 ]'::jsonb),

('Backflow Prevention Test', 'Plumbing', 'Annual testing of backflow prevention devices', 4, 5,
 '{"title": "Backflow Prevention Test", "subtitle": "Water Safety Device Testing", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "Device Information", "order_index": 1, "items": [
     {"id": "1-1", "name": "Device Type", "type": "select", "required": true},
     {"id": "1-2", "name": "Serial Number", "type": "text", "required": true}
   ]},
   {"id": "2", "name": "Test Results", "order_index": 2, "items": [
     {"id": "2-1", "name": "Check Valve #1", "type": "number", "required": true},
     {"id": "2-2", "name": "Check Valve #2", "type": "number", "required": true}
   ]}
 ]'::jsonb),

-- General Safety Templates
('General Safety Audit', 'Safety', 'Comprehensive workplace safety and compliance audit', 12, 18,
 '{"title": "General Safety Audit", "subtitle": "Workplace Safety Assessment", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "Workplace Information", "order_index": 1, "items": [
     {"id": "1-1", "name": "Facility Type", "type": "select", "required": true},
     {"id": "1-2", "name": "Number of Employees", "type": "number", "required": true}
   ]},
   {"id": "2", "name": "Emergency Procedures", "order_index": 2, "items": [
     {"id": "2-1", "name": "Emergency Exits Marked", "type": "boolean", "required": true},
     {"id": "2-2", "name": "Evacuation Plan Posted", "type": "boolean", "required": true}
   ]},
   {"id": "3", "name": "Personal Protective Equipment", "order_index": 3, "items": [
     {"id": "3-1", "name": "PPE Available", "type": "boolean", "required": true},
     {"id": "3-2", "name": "Training Documented", "type": "boolean", "required": true}
   ]}
 ]'::jsonb),

('Elevator Inspection', 'Safety', 'Annual elevator safety and operation inspection', 9, 13,
 '{"title": "Elevator Inspection", "subtitle": "Vertical Transport Safety Check", "company_name": "Watson Mattheus"}'::jsonb,
 '[
   {"id": "1", "name": "Elevator Details", "order_index": 1, "items": [
     {"id": "1-1", "name": "Elevator ID", "type": "text", "required": true},
     {"id": "1-2", "name": "Capacity", "type": "number", "required": true}
   ]},
   {"id": "2", "name": "Safety Devices", "order_index": 2, "items": [
     {"id": "2-1", "name": "Governor Test", "type": "select", "required": true},
     {"id": "2-2", "name": "Brake Test", "type": "select", "required": true}
   ]},
   {"id": "3", "name": "Door Operation", "order_index": 3, "items": [
     {"id": "3-1", "name": "Door Safety Edge", "type": "boolean", "required": true},
     {"id": "3-2", "name": "Reopening Device", "type": "boolean", "required": true}
   ]}
 ]'::jsonb);

-- Update template statistics
UPDATE inspection_templates SET 
  sections_count = jsonb_array_length(sections),
  pages_count = CEIL(jsonb_array_length(sections) * 1.5)
WHERE sections IS NOT NULL;