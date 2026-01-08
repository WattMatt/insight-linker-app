import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Tenant {
  id: string;
  breakerImage?: string;
  ctRatioImage?: string;
  meterImage?: string;
  [key: string]: unknown;
}

interface FixResult {
  inspectionId: string;
  tenantId: string;
  field: string;
  originalUrl: string;
  fixedUrl: string | null;
  status: 'fixed' | 'not_found' | 'already_valid';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results: FixResult[] = [];
    let fixedCount = 0;
    let notFoundCount = 0;
    let alreadyValidCount = 0;

    // Get all inspections with tenant data
    const { data: inspections, error: fetchError } = await supabase
      .from("inspections")
      .select("id, json_data")
      .not("json_data->tenants", "is", null);

    if (fetchError) {
      throw new Error(`Failed to fetch inspections: ${fetchError.message}`);
    }

    console.log(`Found ${inspections?.length || 0} inspections with tenant data`);

    for (const inspection of inspections || []) {
      const jsonData = inspection.json_data as Record<string, unknown>;
      const tenants = jsonData?.tenants as Tenant[] | undefined;
      
      if (!tenants || !Array.isArray(tenants)) continue;

      let updated = false;
      const updatedTenants = [...tenants];

      for (let i = 0; i < updatedTenants.length; i++) {
        const tenant = updatedTenants[i];
        const imageFields = ['breakerImage', 'ctRatioImage', 'meterImage'] as const;

        for (const field of imageFields) {
          const imageUrl = tenant[field];
          if (!imageUrl || typeof imageUrl !== 'string') continue;

          // Extract path from URL
          const pathMatch = imageUrl.match(/inspection-photos\/(.+?)(?:\?|$)/);
          if (!pathMatch) continue;

          const fullPath = decodeURIComponent(pathMatch[1].split('?')[0]);
          const pathParts = fullPath.split('/');
          const fileName = pathParts.pop();
          const folderPath = pathParts.join('/');

          if (!fileName || !folderPath) continue;

          // Check if file exists
          const { data: files, error: listError } = await supabase.storage
            .from('inspection-photos')
            .list(folderPath, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } });

          if (listError) {
            console.error(`Error listing folder ${folderPath}:`, listError);
            continue;
          }

          // Check for exact match
          const exactMatch = files?.find(f => f.name === fileName);
          if (exactMatch) {
            results.push({
              inspectionId: inspection.id,
              tenantId: tenant.id,
              field,
              originalUrl: imageUrl,
              fixedUrl: null,
              status: 'already_valid'
            });
            alreadyValidCount++;
            continue;
          }

          // Find the most recent image in folder
          const imageFile = files?.find(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name));
          
          if (imageFile) {
            const { data: urlData } = supabase.storage
              .from('inspection-photos')
              .getPublicUrl(`${folderPath}/${imageFile.name}`);

            updatedTenants[i] = {
              ...tenant,
              [field]: urlData.publicUrl
            };
            updated = true;
            fixedCount++;

            results.push({
              inspectionId: inspection.id,
              tenantId: tenant.id,
              field,
              originalUrl: imageUrl,
              fixedUrl: urlData.publicUrl,
              status: 'fixed'
            });

            console.log(`Fixed: ${field} for tenant ${tenant.id} in inspection ${inspection.id}`);
          } else {
            results.push({
              inspectionId: inspection.id,
              tenantId: tenant.id,
              field,
              originalUrl: imageUrl,
              fixedUrl: null,
              status: 'not_found'
            });
            notFoundCount++;
          }
        }
      }

      // Update the inspection if any tenant images were fixed
      if (updated) {
        const updatedJsonData = {
          ...jsonData,
          tenants: updatedTenants
        };

        const { error: updateError } = await supabase
          .from("inspections")
          .update({ json_data: updatedJsonData })
          .eq("id", inspection.id);

        if (updateError) {
          console.error(`Failed to update inspection ${inspection.id}:`, updateError);
        } else {
          console.log(`Updated inspection ${inspection.id}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalProcessed: results.length,
          fixed: fixedCount,
          notFound: notFoundCount,
          alreadyValid: alreadyValidCount
        },
        details: results
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error fixing tenant images:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500 
      }
    );
  }
});
