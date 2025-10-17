-- Add Tenant section to Electrical Main Board (EMB) Inspection template
-- Since sections is stored as an object with string keys, we need to use proper JSONB syntax
UPDATE inspection_templates 
SET sections = sections || jsonb_build_object(
  'tenantInformation',
  jsonb_build_object(
    'name', 'Tenant Information',
    'order_index', 5,
    'items', jsonb_build_object(
      'tenantName', jsonb_build_object(
        'name', 'Tenant Name',
        'type', 'text',
        'required', true
      ),
      'tenantContact', jsonb_build_object(
        'name', 'Contact Person',
        'type', 'text',
        'required', false
      ),
      'tenantPhone', jsonb_build_object(
        'name', 'Phone Number',
        'type', 'text',
        'required', false
      ),
      'tenantEmail', jsonb_build_object(
        'name', 'Email Address',
        'type', 'text',
        'required', false
      ),
      'occupancyType', jsonb_build_object(
        'name', 'Occupancy Type',
        'type', 'select',
        'required', false,
        'options', jsonb_build_array('Retail', 'Office', 'Industrial', 'Restaurant', 'Medical', 'Other')
      ),
      'leaseStartDate', jsonb_build_object(
        'name', 'Lease Start Date',
        'type', 'date',
        'required', false
      ),
      'leaseEndDate', jsonb_build_object(
        'name', 'Lease End Date',
        'type', 'date',
        'required', false
      ),
      'tenantNotes', jsonb_build_object(
        'name', 'Additional Notes',
        'type', 'textarea',
        'required', false
      )
    )
  )
)
WHERE name = 'Electrical Main Board (EMB) Inspection' 
  AND category = 'Low Voltage';