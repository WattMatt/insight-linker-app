import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate API key from DocBuilder (optional - skip if not set)
    const authHeader = req.headers.get('Authorization')
    const expectedApiKey = Deno.env.get('DOCBUILDER_PUBLIC_TOKEN')

    if (expectedApiKey && authHeader !== `Bearer ${expectedApiKey}`) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch all clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name, company_name, email, contact_person')
      .order('name')

    if (clientsError) throw clientsError

    // Fetch all sites with client info
    const { data: sites, error: sitesError } = await supabase
      .from('sites')
      .select('id, name, address, site_type, client_id')
      .order('name')

    if (sitesError) throw sitesError

    // Fetch all subsections with site info
    const { data: subsections, error: subsectionsError } = await supabase
      .from('subsections')
      .select('id, name, description, category, tenant_name, coc_status, coc_number, meter_serial_number, site_id')
      .order('name')

    if (subsectionsError) throw subsectionsError

    // Fetch all inspections
    const { data: inspections, error: inspectionsError } = await supabase
      .from('inspections')
      .select('id, title, status, inspection_date, inspector_name, site_id, subsection_id, template_id')
      .order('created_at', { ascending: false })

    if (inspectionsError) throw inspectionsError

    // Fetch floor plans
    const { data: floorPlans, error: floorPlansError } = await supabase
      .from('subsection_floor_plans')
      .select('id, file_name, subsection_id')
      .order('created_at', { ascending: false })

    if (floorPlansError) throw floorPlansError

    // Fetch COC validations
    const { data: cocValidations, error: cocError } = await supabase
      .from('coc_validations')
      .select('id, status, validated_at, subsection_id, document_id')
      .order('validated_at', { ascending: false })

    if (cocError) throw cocError

    // Fetch inspection templates with full structure
    const { data: templates, error: templatesError } = await supabase
      .from('inspection_templates')
      .select('id, name, category, description, sections_count, pages_count, sections, cover_page, tenants')
      .order('name')

    if (templatesError) throw templatesError

    // Fetch snags for defect reports
    const { data: snags, error: snagsError } = await supabase
      .from('snags')
      .select('id, title, status, risk_level, subsection_id')
      .order('created_at', { ascending: false })

    if (snagsError) throw snagsError

    // Create lookup maps for joining
    const clientMap = new Map(clients?.map(c => [c.id, c]) || [])
    const siteMap = new Map(sites?.map(s => [s.id, s]) || [])
    const subsectionMap = new Map(subsections?.map(s => [s.id, s]) || [])

    // Build report types index
    const reportTypes = [
      {
        id: 'site-summary',
        name: 'Site Summary Report',
        description: 'Comprehensive overview of a site including all subsections, compliance status, and metrics',
        category: 'Sites',
        requiredParams: ['siteId'],
        availableItems: sites?.map(s => {
          const client = clientMap.get(s.client_id)
          return {
            id: s.id,
            name: s.name,
            address: s.address,
            client: client?.name || client?.company_name || null
          }
        }) || []
      },
      {
        id: 'subsection-report',
        name: 'Subsection/Tenant Report',
        description: 'Detailed report for a specific subsection including documents, compliance, and inspection history',
        category: 'Subsections',
        requiredParams: ['subsectionId'],
        availableItems: subsections?.map(s => {
          const site = siteMap.get(s.site_id)
          return {
            id: s.id,
            name: s.name,
            tenant: s.tenant_name,
            category: s.category,
            cocStatus: s.coc_status,
            site: site?.name || null
          }
        }) || []
      },
      {
        id: 'inspection-report',
        name: 'Inspection Report',
        description: 'Full inspection report with all sections, items, photos, and signatures',
        category: 'Inspections',
        requiredParams: ['inspectionId'],
        availableItems: inspections?.map(i => {
          const site = siteMap.get(i.site_id)
          const subsection = subsectionMap.get(i.subsection_id)
          return {
            id: i.id,
            title: i.title,
            status: i.status,
            date: i.inspection_date,
            inspector: i.inspector_name,
            site: site?.name || null,
            subsection: subsection?.name || null
          }
        }) || []
      },
      {
        id: 'floor-plan-report',
        name: 'Floor Plan Annotations Report',
        description: 'Floor plan with all pins, defects, and annotations documented',
        category: 'Floor Plans',
        requiredParams: ['floorPlanId'],
        availableItems: floorPlans?.map(fp => {
          const subsection = subsectionMap.get(fp.subsection_id)
          const site = subsection ? siteMap.get(subsection.site_id) : null
          return {
            id: fp.id,
            fileName: fp.file_name,
            subsection: subsection?.name || null,
            site: site?.name || null
          }
        }) || []
      },
      {
        id: 'coc-validation-report',
        name: 'COC Validation Report',
        description: 'Certificate of Compliance validation report with findings and status',
        category: 'Compliance',
        requiredParams: ['validationId'],
        availableItems: cocValidations?.map(v => {
          const subsection = subsectionMap.get(v.subsection_id)
          const site = subsection ? siteMap.get(subsection.site_id) : null
          return {
            id: v.id,
            status: v.status,
            validatedAt: v.validated_at,
            subsection: subsection?.name || null,
            site: site?.name || null
          }
        }) || []
      },
      {
        id: 'defect-report',
        name: 'Defects/Snags Report',
        description: 'Report of all defects and snags with status and rectification details',
        category: 'Defects',
        requiredParams: ['subsectionId'],
        availableItems: snags?.map(s => {
          const subsection = subsectionMap.get(s.subsection_id)
          const site = subsection ? siteMap.get(subsection.site_id) : null
          return {
            id: s.id,
            title: s.title,
            status: s.status,
            riskLevel: s.risk_level,
            subsection: subsection?.name || null,
            site: site?.name || null
          }
        }) || []
      },
      {
        id: 'asset-verification-report',
        name: 'Asset Verification Report',
        description: 'Meter register and asset verification documentation',
        category: 'Assets',
        requiredParams: ['siteId'],
        availableItems: sites?.map(s => ({
          id: s.id,
          name: s.name,
          address: s.address
        })) || []
      }
    ]

    // Build summary stats
    const summary = {
      totalClients: clients?.length || 0,
      totalSites: sites?.length || 0,
      totalSubsections: subsections?.length || 0,
      totalInspections: inspections?.length || 0,
      totalFloorPlans: floorPlans?.length || 0,
      totalCocValidations: cocValidations?.length || 0,
      totalTemplates: templates?.length || 0,
      totalSnags: snags?.length || 0
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        app: 'wm-compliance',
        summary,
        reportTypes,
        inspectionTemplates: templates?.map(t => ({
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
        clients: clients?.map(c => ({
          id: c.id,
          name: c.name,
          companyName: c.company_name,
          email: c.email,
          contactPerson: c.contact_person
        })) || []
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
