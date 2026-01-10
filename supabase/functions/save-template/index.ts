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
    // Validate API key from DocBuilder (optional)
    const authHeader = req.headers.get('Authorization')
    const expectedApiKey = Deno.env.get('DOCBUILDER_PUBLIC_TOKEN')

    if (expectedApiKey && authHeader !== `Bearer ${expectedApiKey}`) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { template, action } = await req.json()

    if (!template) {
      return new Response(
        JSON.stringify({ error: 'Template is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log(`Received template: ${template.name}, action: ${action}`)

    // Map DocBuilder template format to database format
    const dbTemplate = {
      name: template.name,
      category: template.category || 'General',
      description: template.description || null,
      sections: template.sections || [],
      cover_page: template.coverPage || template.cover_page || null,
      tenants: template.tenants || null,
      sections_count: template.sections?.length || 0,
      pages_count: template.pagesCount || template.pages_count || null,
      updated_at: new Date().toISOString()
    }

    let result

    if (action === 'create' || (!template.id && action !== 'delete')) {
      // Create new template
      const { data, error } = await supabase
        .from('inspection_templates')
        .insert(dbTemplate)
        .select('id')
        .single()

      if (error) throw error
      result = { success: true, templateId: data.id, action: 'created' }
      console.log(`Created template: ${data.id}`)

    } else if (action === 'update' || template.id) {
      // Update existing template
      const { data, error } = await supabase
        .from('inspection_templates')
        .update(dbTemplate)
        .eq('id', template.id)
        .select('id')
        .single()

      if (error) throw error
      result = { success: true, templateId: data.id, action: 'updated' }
      console.log(`Updated template: ${data.id}`)

    } else if (action === 'delete' && template.id) {
      // Delete template
      const { error } = await supabase
        .from('inspection_templates')
        .delete()
        .eq('id', template.id)

      if (error) throw error
      result = { success: true, templateId: template.id, action: 'deleted' }
      console.log(`Deleted template: ${template.id}`)

    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action or missing template ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Save template error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
