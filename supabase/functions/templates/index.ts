import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Define template structures for each report type
const reportTemplateStructures = {
  'site-summary': {
    name: 'Site Summary Report',
    category: 'Sites',
    description: 'Comprehensive overview of a site including all subsections, compliance status, and metrics',
    coverPage: {
      title: 'Site Summary Report',
      subtitle: 'Comprehensive Site Overview',
      showLogo: true,
      showDate: true
    },
    sections: [
      {
        id: 'site-info',
        name: 'Site Information',
        items: [
          { id: 'site-name', name: 'Site Name', type: 'text', required: true },
          { id: 'address', name: 'Address', type: 'text', required: true },
          { id: 'client', name: 'Client', type: 'text', required: true },
          { id: 'site-type', name: 'Site Type', type: 'text', required: false },
          { id: 'site-image', name: 'Site Image', type: 'image', required: false }
        ]
      },
      {
        id: 'compliance-summary',
        name: 'Compliance Summary',
        items: [
          { id: 'total-subsections', name: 'Total Subsections', type: 'number', required: true },
          { id: 'compliant-count', name: 'Compliant Subsections', type: 'number', required: true },
          { id: 'non-compliant-count', name: 'Non-Compliant Subsections', type: 'number', required: true },
          { id: 'pending-count', name: 'Pending Review', type: 'number', required: true },
          { id: 'compliance-chart', name: 'Compliance Chart', type: 'chart', required: false }
        ]
      },
      {
        id: 'subsections-table',
        name: 'Subsections Overview',
        items: [
          { id: 'subsections-list', name: 'Subsections Table', type: 'table', required: true, 
            columns: ['Name', 'Tenant', 'Category', 'COC Status', 'Meter Serial'] }
        ]
      },
      {
        id: 'recent-inspections',
        name: 'Recent Inspections',
        items: [
          { id: 'inspections-list', name: 'Inspections Table', type: 'table', required: false,
            columns: ['Title', 'Date', 'Inspector', 'Status'] }
        ]
      },
      {
        id: 'notes',
        name: 'Notes & Observations',
        items: [
          { id: 'general-notes', name: 'General Notes', type: 'textarea', required: false }
        ]
      }
    ]
  },
  'subsection-report': {
    name: 'Subsection/Tenant Report',
    category: 'Subsections',
    description: 'Detailed report for a specific subsection including documents, compliance, and inspection history',
    coverPage: {
      title: 'Subsection Report',
      subtitle: 'Tenant Compliance Documentation',
      showLogo: true,
      showDate: true
    },
    sections: [
      {
        id: 'tenant-info',
        name: 'Tenant Information',
        items: [
          { id: 'subsection-name', name: 'Subsection Name', type: 'text', required: true },
          { id: 'tenant-name', name: 'Tenant Name', type: 'text', required: true },
          { id: 'category', name: 'Category', type: 'text', required: false },
          { id: 'description', name: 'Description', type: 'textarea', required: false }
        ]
      },
      {
        id: 'metering-info',
        name: 'Metering Information',
        items: [
          { id: 'meter-serial', name: 'Meter Serial Number', type: 'text', required: false },
          { id: 'ct-ratio', name: 'CT Ratio', type: 'text', required: false },
          { id: 'metering-status', name: 'Metering Status', type: 'select', required: false,
            options: ['Active', 'Inactive', 'Pending', 'Not Applicable'] }
        ]
      },
      {
        id: 'compliance-status',
        name: 'Compliance Status',
        items: [
          { id: 'coc-status', name: 'COC Status', type: 'select', required: true,
            options: ['Valid', 'Expired', 'Pending', 'Not Required'] },
          { id: 'coc-number', name: 'COC Number', type: 'text', required: false },
          { id: 'coc-issue-date', name: 'COC Issue Date', type: 'date', required: false },
          { id: 'coc-document', name: 'COC Document', type: 'file', required: false }
        ]
      },
      {
        id: 'documents',
        name: 'Documents',
        items: [
          { id: 'documents-list', name: 'Uploaded Documents', type: 'table', required: false,
            columns: ['File Name', 'Category', 'Upload Date'] }
        ]
      },
      {
        id: 'inspection-history',
        name: 'Inspection History',
        items: [
          { id: 'inspections-table', name: 'Past Inspections', type: 'table', required: false,
            columns: ['Date', 'Type', 'Inspector', 'Status', 'Notes'] }
        ]
      }
    ]
  },
  'floor-plan-report': {
    name: 'Floor Plan Annotations Report',
    category: 'Floor Plans',
    description: 'Floor plan with all pins, defects, and annotations documented',
    coverPage: {
      title: 'Floor Plan Report',
      subtitle: 'Site Annotations & Defects',
      showLogo: true,
      showDate: true
    },
    sections: [
      {
        id: 'floor-plan-image',
        name: 'Floor Plan',
        items: [
          { id: 'floor-plan', name: 'Floor Plan Image', type: 'image', required: true },
          { id: 'floor-plan-name', name: 'Floor Plan Name', type: 'text', required: true }
        ]
      },
      {
        id: 'pins-summary',
        name: 'Annotations Summary',
        items: [
          { id: 'total-pins', name: 'Total Pins', type: 'number', required: true },
          { id: 'open-defects', name: 'Open Defects', type: 'number', required: true },
          { id: 'resolved-pins', name: 'Resolved', type: 'number', required: true },
          { id: 'pins-chart', name: 'Status Chart', type: 'chart', required: false }
        ]
      },
      {
        id: 'pins-detail',
        name: 'Pin Details',
        items: [
          { id: 'pins-table', name: 'All Pins', type: 'table', required: true,
            columns: ['Pin #', 'Type', 'Title', 'Status', 'Priority', 'Assigned To', 'Due Date'] }
        ]
      },
      {
        id: 'defects-photos',
        name: 'Defect Photos',
        items: [
          { id: 'photos-gallery', name: 'Photo Gallery', type: 'gallery', required: false }
        ]
      }
    ]
  },
  'coc-validation-report': {
    name: 'COC Validation Report',
    category: 'Compliance',
    description: 'Certificate of Compliance validation report with findings and status',
    coverPage: {
      title: 'COC Validation Report',
      subtitle: 'Compliance Verification',
      showLogo: true,
      showDate: true
    },
    sections: [
      {
        id: 'validation-summary',
        name: 'Validation Summary',
        items: [
          { id: 'validation-status', name: 'Validation Status', type: 'select', required: true,
            options: ['Valid', 'Invalid', 'Pending Review', 'Expired'] },
          { id: 'validated-date', name: 'Validation Date', type: 'date', required: true },
          { id: 'validated-by', name: 'Validated By', type: 'text', required: false }
        ]
      },
      {
        id: 'document-info',
        name: 'Document Information',
        items: [
          { id: 'coc-number', name: 'COC Number', type: 'text', required: true },
          { id: 'issue-date', name: 'Issue Date', type: 'date', required: false },
          { id: 'coc-type', name: 'COC Type', type: 'text', required: false },
          { id: 'document-preview', name: 'Document Preview', type: 'image', required: false }
        ]
      },
      {
        id: 'findings',
        name: 'Validation Findings',
        items: [
          { id: 'violations-list', name: 'Violations Found', type: 'table', required: false,
            columns: ['Rule', 'Severity', 'Description', 'Recommendation'] },
          { id: 'compliance-score', name: 'Compliance Score', type: 'number', required: false }
        ]
      },
      {
        id: 'recommendations',
        name: 'Recommendations',
        items: [
          { id: 'action-items', name: 'Required Actions', type: 'textarea', required: false },
          { id: 'next-review-date', name: 'Next Review Date', type: 'date', required: false }
        ]
      }
    ]
  },
  'defect-report': {
    name: 'Defects/Snags Report',
    category: 'Defects',
    description: 'Report of all defects and snags with status and rectification details',
    coverPage: {
      title: 'Defects Report',
      subtitle: 'Snag List & Rectification Status',
      showLogo: true,
      showDate: true
    },
    sections: [
      {
        id: 'summary',
        name: 'Defects Summary',
        items: [
          { id: 'total-defects', name: 'Total Defects', type: 'number', required: true },
          { id: 'open-defects', name: 'Open', type: 'number', required: true },
          { id: 'in-progress', name: 'In Progress', type: 'number', required: true },
          { id: 'resolved', name: 'Resolved', type: 'number', required: true },
          { id: 'status-chart', name: 'Status Chart', type: 'chart', required: false }
        ]
      },
      {
        id: 'risk-breakdown',
        name: 'Risk Level Breakdown',
        items: [
          { id: 'high-risk', name: 'High Risk', type: 'number', required: false },
          { id: 'medium-risk', name: 'Medium Risk', type: 'number', required: false },
          { id: 'low-risk', name: 'Low Risk', type: 'number', required: false }
        ]
      },
      {
        id: 'defects-list',
        name: 'Defects Detail',
        items: [
          { id: 'defects-table', name: 'All Defects', type: 'table', required: true,
            columns: ['Title', 'Description', 'Risk Level', 'Status', 'Created', 'Rectified'] }
        ]
      },
      {
        id: 'photos',
        name: 'Defect Photos',
        items: [
          { id: 'before-photos', name: 'Before Photos', type: 'gallery', required: false },
          { id: 'after-photos', name: 'After Photos (Rectified)', type: 'gallery', required: false }
        ]
      }
    ]
  },
  'asset-verification-report': {
    name: 'Asset Verification Report',
    category: 'Assets',
    description: 'Meter register and asset verification documentation',
    coverPage: {
      title: 'Asset Verification Report',
      subtitle: 'Meter Register & Asset Documentation',
      showLogo: true,
      showDate: true
    },
    sections: [
      {
        id: 'site-info',
        name: 'Site Information',
        items: [
          { id: 'site-name', name: 'Site Name', type: 'text', required: true },
          { id: 'verification-date', name: 'Verification Date', type: 'date', required: true },
          { id: 'verified-by', name: 'Verified By', type: 'text', required: false }
        ]
      },
      {
        id: 'asset-summary',
        name: 'Asset Summary',
        items: [
          { id: 'total-meters', name: 'Total Meters', type: 'number', required: true },
          { id: 'verified-count', name: 'Verified', type: 'number', required: true },
          { id: 'discrepancies', name: 'Discrepancies Found', type: 'number', required: true }
        ]
      },
      {
        id: 'meter-register',
        name: 'Meter Register',
        items: [
          { id: 'meters-table', name: 'Meters List', type: 'table', required: true,
            columns: ['Premises ID', 'Meter Serial', 'Old Serial', 'CT Ratio', 'Breaker Size', 'Type', 'Status'] }
        ]
      },
      {
        id: 'comparison',
        name: 'Verification Comparison',
        items: [
          { id: 'comparison-table', name: 'Expected vs Actual', type: 'table', required: false,
            columns: ['Premises ID', 'Expected Serial', 'Actual Serial', 'Match', 'Notes'] }
        ]
      },
      {
        id: 'discrepancy-notes',
        name: 'Discrepancy Notes',
        items: [
          { id: 'notes', name: 'Notes', type: 'textarea', required: false },
          { id: 'photos', name: 'Evidence Photos', type: 'gallery', required: false }
        ]
      },
      {
        id: 'signatures',
        name: 'Signatures',
        items: [
          { id: 'verifier-signature', name: 'Verifier Signature', type: 'signature', required: true },
          { id: 'witness-signature', name: 'Witness Signature', type: 'signature', required: false }
        ]
      }
    ]
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const expectedApiKey = Deno.env.get('DOCBUILDER_PUBLIC_TOKEN')

    // Fail closed: never serve data when the API token is not configured
    if (!expectedApiKey) {
      return new Response(
        JSON.stringify({ error: 'DOCBUILDER_PUBLIC_TOKEN is not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Constant-time comparison via SHA-256 digests to avoid timing attacks
    const providedApiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const encoder = new TextEncoder()
    const [expectedDigest, providedDigest] = await Promise.all([
      crypto.subtle.digest('SHA-256', encoder.encode(expectedApiKey)),
      crypto.subtle.digest('SHA-256', encoder.encode(providedApiKey))
    ])
    const expectedBytes = new Uint8Array(expectedDigest)
    const providedBytes = new Uint8Array(providedDigest)
    let mismatch = 0
    for (let i = 0; i < expectedBytes.length; i++) {
      mismatch |= expectedBytes[i] ^ providedBytes[i]
    }

    if (mismatch !== 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch all data in parallel
    // NOTE: clients table is intentionally NOT queried - client PII (email, contact person)
    // must never be exposed through this endpoint
    const [
      { data: sites },
      { data: subsections },
      { data: inspections },
      { data: floorPlans },
      { data: inspectionTemplates },
      { data: snags },
      { data: siteAssets }
    ] = await Promise.all([
      supabase.from('sites').select('id, name, address, site_type, client_id').order('name'),
      supabase.from('subsections').select('id, name, description, category, tenant_name, coc_status, coc_number, meter_serial_number, site_id').order('name'),
      supabase.from('inspections').select('id, title, status, inspection_date, inspector_name, site_id, subsection_id, template_id').order('created_at', { ascending: false }),
      supabase.from('subsection_floor_plans').select('id, file_name, subsection_id').order('created_at', { ascending: false }),
      supabase.from('inspection_templates').select('id, name, category, description, sections_count, pages_count, sections, cover_page, tenants').order('name'),
      supabase.from('snags').select('id, title, status, risk_level, subsection_id').order('created_at', { ascending: false }),
      supabase.from('site_assets').select('id, premises_id, meter_serial_number, old_meter_serial_number, ct_ratio, breaker_size, meter_type, asset_category, site_id').order('premises_id')
    ])

    // Create lookup maps
    const siteMap = new Map(sites?.map(s => [s.id, s]) || [])
    const subsectionMap = new Map(subsections?.map(s => [s.id, s]) || [])

    // Build report types with full template structures and available data
    const reportTypes = Object.entries(reportTemplateStructures).map(([id, template]) => {
      let availableItems: any[] = []
      
      switch (id) {
        case 'site-summary':
        case 'asset-verification-report':
          availableItems = sites?.map(s => {
            return { id: s.id, name: s.name, address: s.address, client: null }
          }) || []
          break
        case 'subsection-report':
          availableItems = subsections?.map(s => {
            const site = siteMap.get(s.site_id)
            return { id: s.id, name: s.name, tenant: s.tenant_name, site: site?.name || null }
          }) || []
          break
        case 'floor-plan-report':
          availableItems = floorPlans?.map(fp => {
            const subsection = subsectionMap.get(fp.subsection_id)
            const site = subsection ? siteMap.get(subsection.site_id) : null
            return { id: fp.id, fileName: fp.file_name, subsection: subsection?.name || null, site: site?.name || null }
          }) || []
          break
        case 'coc-validation-report':
          // COC is now a manual per-subsection verdict (coc_status); no validation records.
          availableItems = subsections?.filter(s => s.coc_status).map(s => {
            const site = siteMap.get(s.site_id)
            return { id: s.id, status: s.coc_status, subsection: s.name || null, site: site?.name || null }
          }) || []
          break
        case 'defect-report':
          availableItems = snags?.map(s => {
            const subsection = subsectionMap.get(s.subsection_id)
            const site = subsection ? siteMap.get(subsection.site_id) : null
            return { id: s.id, title: s.title, status: s.status, subsection: subsection?.name || null, site: site?.name || null }
          }) || []
          break
      }

      return {
        id,
        ...template,
        requiredParams: id === 'site-summary' || id === 'asset-verification-report' ? ['siteId'] : 
                        id === 'subsection-report' || id === 'defect-report' ? ['subsectionId'] :
                        id === 'floor-plan-report' ? ['floorPlanId'] :
                        id === 'coc-validation-report' ? ['validationId'] : [],
        availableItems
      }
    })

    // Add inspection report template
    reportTypes.push({
      id: 'inspection-report',
      name: 'Inspection Report',
      category: 'Inspections',
      description: 'Full inspection report with all sections, items, photos, and signatures',
      coverPage: {
        title: 'Inspection Report',
        subtitle: 'Detailed Inspection Documentation',
        showLogo: true,
        showDate: true
      },
      sections: [
        {
          id: 'inspection-info',
          name: 'Inspection Information',
          items: [
            { id: 'title', name: 'Inspection Title', type: 'text', required: true },
            { id: 'date', name: 'Inspection Date', type: 'date', required: true },
            { id: 'inspector', name: 'Inspector Name', type: 'text', required: true },
            { id: 'status', name: 'Status', type: 'select', required: true, options: ['Pending', 'In Progress', 'Completed'] }
          ]
        },
        {
          id: 'template-sections',
          name: 'Template Sections',
          items: [
          { id: 'sections-content', name: 'Inspection Sections (loaded from template)', type: 'dynamic', required: true }
          ]
        },
        {
          id: 'signatures',
          name: 'Signatures',
          items: [
            { id: 'inspector-signature', name: 'Inspector Signature', type: 'signature', required: true },
            { id: 'client-signature', name: 'Client Signature', type: 'signature', required: false }
          ]
        }
      ],
      requiredParams: ['inspectionId'],
      availableItems: inspections?.map(i => {
        const site = siteMap.get(i.site_id)
        const subsection = subsectionMap.get(i.subsection_id)
        return { id: i.id, title: i.title, status: i.status, date: i.inspection_date, site: site?.name || null, subsection: subsection?.name || null }
      }) || []
    })

    const summary = {
      totalClients: 0,
      totalSites: sites?.length || 0,
      totalSubsections: subsections?.length || 0,
      totalInspections: inspections?.length || 0,
      totalFloorPlans: floorPlans?.length || 0,
      totalCocValidations: subsections?.filter(s => s.coc_status).length || 0,
      totalTemplates: inspectionTemplates?.length || 0,
      totalSnags: snags?.length || 0,
      totalAssets: siteAssets?.length || 0
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        app: 'wm-compliance',
        summary,
        reportTypes,
        inspectionTemplates: inspectionTemplates?.map(t => ({
          id: t.id,
          name: t.name,
          category: t.category,
          description: t.description,
          sectionsCount: t.sections_count,
          pagesCount: t.pages_count,
          sections: t.sections,
          coverPage: t.cover_page,
          tenants: t.tenants
        })) || [],
        // clients key kept for response-shape compatibility, but client PII
        // (names, emails, contact persons) is no longer exposed
        clients: []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Templates API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
