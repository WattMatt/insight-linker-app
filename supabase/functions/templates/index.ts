const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate API key from DocBuilder
    const authHeader = req.headers.get('Authorization')
    const expectedApiKey = Deno.env.get('DOCBUILDER_PUBLIC_TOKEN')

    if (expectedApiKey && authHeader !== `Bearer ${expectedApiKey}`) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return available PDF templates/reports
    const templates = [
      {
        id: 'compliance-report-1',
        name: 'Monthly Compliance Report',
        description: 'Standard monthly compliance summary',
        category: 'Compliance',
      },
      {
        id: 'audit-checklist',
        name: 'Audit Checklist',
        description: 'Internal audit documentation template',
        category: 'Audit',
      },
      {
        id: 'incident-report',
        name: 'Incident Report Form',
        description: 'Document compliance incidents',
        category: 'Incidents',
      },
    ]

    return new Response(
      JSON.stringify({ 
        success: true,
        templates,
        app: 'wm-compliance'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
