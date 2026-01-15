import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationResult {
  subsectionId: string;
  subsectionName: string;
  documentId: string;
  fileName: string;
  status: 'success' | 'failed' | 'skipped';
  validationStatus?: string;
  violationsCount?: number;
  error?: string;
}

// Using any for Supabase query results as nested joins have complex types

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { siteId, subsectionIds, skipValidated = true } = await req.json();

    if (!siteId) {
      return new Response(
        JSON.stringify({ error: 'siteId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header for calling validate-coc
    const authHeader = req.headers.get('Authorization');

    // Get all subsections with COC documents for this site
    let query = supabase
      .from('subsections')
      .select(`
        id,
        name,
        coc_type,
        subsection_documents!inner (
          id,
          file_name,
          file_url,
          coc_type,
          category_id,
          document_categories!inner (
            name
          )
        )
      `)
      .eq('site_id', siteId);

    // If specific subsection IDs provided, filter to those
    if (subsectionIds && subsectionIds.length > 0) {
      query = query.in('id', subsectionIds);
    }

    const { data: subsections, error: subsectionsError } = await query;

    if (subsectionsError) {
      console.error('Error fetching subsections:', subsectionsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch subsections', details: subsectionsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter to only COC documents
    const cocDocuments: Array<{
      subsectionId: string;
      subsectionName: string;
      subsectionCocType: string | null;
      documentId: string;
      fileName: string;
      fileUrl: string;
      documentCocType: string | null;
    }> = [];

    for (const subsection of (subsections as any[]) || []) {
      for (const doc of subsection.subsection_documents || []) {
        const categoryName = doc.document_categories?.name || '';
        if (categoryName.toLowerCase().includes('coc') || categoryName.toLowerCase().includes('certificate')) {
          // Skip validation report PDFs
          if (doc.file_name.includes('COC_Validation_Report')) {
            continue;
          }
          cocDocuments.push({
            subsectionId: subsection.id,
            subsectionName: subsection.name,
            subsectionCocType: subsection.coc_type,
            documentId: doc.id,
            fileName: doc.file_name,
            fileUrl: doc.file_url,
            documentCocType: doc.coc_type,
          });
        }
      }
    }

    console.log(`Found ${cocDocuments.length} COC documents to validate`);

    // Check which documents already have validations
    const documentIds = cocDocuments.map(d => d.documentId);
    const { data: existingValidations } = await supabase
      .from('coc_validations')
      .select('document_id')
      .in('document_id', documentIds);

    const validatedDocIds = new Set((existingValidations || []).map(v => v.document_id));

    // Process each document
    const results: ValidationResult[] = [];
    const validateCocUrl = `${supabaseUrl}/functions/v1/validate-coc`;

    for (const doc of cocDocuments) {
      // Skip already validated if flag is set
      if (skipValidated && validatedDocIds.has(doc.documentId)) {
        results.push({
          subsectionId: doc.subsectionId,
          subsectionName: doc.subsectionName,
          documentId: doc.documentId,
          fileName: doc.fileName,
          status: 'skipped',
          error: 'Already validated',
        });
        continue;
      }

      try {
        console.log(`Validating: ${doc.subsectionName} - ${doc.fileName}`);
        
        // Determine the approved COC type from subsection or document
        const approvedCocType = doc.documentCocType || doc.subsectionCocType;

        const response = await fetch(validateCocUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader || `Bearer ${supabaseServiceKey}`,
            'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
          },
          body: JSON.stringify({
            documentId: doc.documentId,
            documentUrl: doc.fileUrl,
            subsectionId: doc.subsectionId,
            approvedCocType: approvedCocType,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Validation failed for ${doc.fileName}:`, errorText);
          results.push({
            subsectionId: doc.subsectionId,
            subsectionName: doc.subsectionName,
            documentId: doc.documentId,
            fileName: doc.fileName,
            status: 'failed',
            error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`,
          });
          continue;
        }

        const validationResult = await response.json();
        
        results.push({
          subsectionId: doc.subsectionId,
          subsectionName: doc.subsectionName,
          documentId: doc.documentId,
          fileName: doc.fileName,
          status: 'success',
          validationStatus: validationResult.complianceStatus,
          violationsCount: validationResult.violations?.length || 0,
        });

        console.log(`✓ ${doc.subsectionName}: ${validationResult.complianceStatus} (${validationResult.violations?.length || 0} violations)`);

        // Small delay to avoid overwhelming the AI API
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (err) {
        const error = err as Error;
        console.error(`Error validating ${doc.fileName}:`, error);
        results.push({
          subsectionId: doc.subsectionId,
          subsectionName: doc.subsectionName,
          documentId: doc.documentId,
          fileName: doc.fileName,
          status: 'failed',
          error: error.message,
        });
      }
    }

    // Calculate summary
    const summary = {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      passed: results.filter(r => r.validationStatus === 'Pass').length,
      failedValidation: results.filter(r => r.validationStatus === 'Fail').length,
    };

    console.log('Bulk validation complete:', summary);

    return new Response(
      JSON.stringify({ 
        success: true, 
        summary,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const error = err as Error;
    console.error('Bulk validation error:', error);
    return new Response(
      JSON.stringify({ error: 'Bulk validation failed', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
