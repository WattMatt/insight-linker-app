import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client with service role
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Parse Supabase storage URL to extract bucket and path
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    if (!url.includes('/storage/v1/object/public/')) return null;
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/storage/v1/object/public/');
    if (pathParts.length === 2) {
      const filePathWithBucket = pathParts[1];
      const firstSlashIndex = filePathWithBucket.indexOf('/');
      if (firstSlashIndex > 0) {
        return {
          bucket: filePathWithBucket.substring(0, firstSlashIndex),
          path: filePathWithBucket.substring(firstSlashIndex + 1),
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Build storage URL from bucket and path
function buildStorageUrl(baseUrl: string, bucket: string, path: string): string {
  return `${baseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

// Check if a file exists in storage
async function fileExists(supabase: any, bucket: string, path: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  return !error && data !== null;
}

// Find matching file in directory
async function findMatchingFile(
  supabase: any,
  bucket: string,
  originalPath: string
): Promise<string | null> {
  const lastSlashIndex = originalPath.lastIndexOf('/');
  if (lastSlashIndex <= 0) return null;

  const dirPath = originalPath.substring(0, lastSlashIndex);
  const targetFilename = originalPath.substring(lastSlashIndex + 1);

  // Extract key identifiers from filename
  // Pattern: SITE_NAME_sectionId_itemId_timestamp_index.ext
  const parts = targetFilename.split('_');
  const itemIdIndex = parts.findIndex(p => 
    ['boardOpen', 'boardClosed', 'internalLegend', 'mainBreaker', 'meter', 
     'ct', 'earthLeakage', 'other', 'cleanliness', 'mainCableGland', 
     'generalWiring'].includes(p)
  );
  
  const itemId = itemIdIndex >= 0 ? parts[itemIdIndex] : null;
  const indexMatch = targetFilename.match(/_(\d+)\.(jpg|jpeg|png|webp)$/i);
  const fileIndex = indexMatch ? indexMatch[1] : null;

  // List files in directory
  const { data: files, error } = await supabase.storage.from(bucket).list(dirPath, { limit: 100 });
  if (error || !files || files.length === 0) return null;

  // Strategy 1: Match by itemId and index
  if (itemId && fileIndex) {
    for (const file of files) {
      if (file.name.includes(itemId) && file.name.includes(`_${fileIndex}.`)) {
        return `${dirPath}/${file.name}`;
      }
    }
  }

  // Strategy 2: Match by itemId only
  if (itemId) {
    for (const file of files) {
      if (file.name.includes(itemId) && /\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
        return `${dirPath}/${file.name}`;
      }
    }
  }

  // Strategy 3: First image in directory
  const imageFile = files.find((f: any) => 
    /\.(jpg|jpeg|png|webp)$/i.test(f.name) && !f.name.startsWith('.')
  );
  
  return imageFile ? `${dirPath}/${imageFile.name}` : null;
}

// Process a single inspection's json_data
async function processInspectionPhotos(
  supabase: any,
  baseUrl: string,
  inspectionId: string,
  jsonData: any
): Promise<{ fixed: number; notFound: number; changes: string[] }> {
  let fixed = 0;
  let notFound = 0;
  const changes: string[] = [];
  let modified = false;

  // Helper to process a photo URL
  async function processPhotoUrl(url: string, location: string): Promise<string> {
    const parsed = parseStorageUrl(url);
    if (!parsed) return url;

    // Check if file exists
    const exists = await fileExists(supabase, parsed.bucket, parsed.path);
    if (exists) return url;

    // Try to find matching file
    const matchingPath = await findMatchingFile(supabase, parsed.bucket, parsed.path);
    if (matchingPath) {
      const newUrl = buildStorageUrl(baseUrl, parsed.bucket, matchingPath);
      changes.push(`${location}: ${parsed.path.split('/').pop()} → ${matchingPath.split('/').pop()}`);
      fixed++;
      modified = true;
      return newUrl;
    }

    notFound++;
    changes.push(`${location}: NOT FOUND - ${parsed.path.split('/').pop()}`);
    return url;
  }

  // Process photos in all known locations within json_data
  const sections = [
    'normalBoardImages', 'emergencyBoardImages', 'componentImages',
    'normalWiringImages', 'emergencyWiringImages'
  ];

  for (const sectionId of sections) {
    if (jsonData[sectionId] && typeof jsonData[sectionId] === 'object') {
      for (const [itemId, itemData] of Object.entries(jsonData[sectionId])) {
        if (itemData && typeof itemData === 'object') {
          const item = itemData as any;
          if (item.photos && Array.isArray(item.photos)) {
            for (let i = 0; i < item.photos.length; i++) {
              if (typeof item.photos[i] === 'string') {
                item.photos[i] = await processPhotoUrl(
                  item.photos[i], 
                  `${sectionId}.${itemId}[${i}]`
                );
              }
            }
          }
        }
      }
    }
  }

  // Process tenant photos
  if (jsonData.tenants && Array.isArray(jsonData.tenants)) {
    for (let t = 0; t < jsonData.tenants.length; t++) {
      const tenant = jsonData.tenants[t];
      if (tenant.meterImage) {
        tenant.meterImage = await processPhotoUrl(tenant.meterImage, `tenant[${t}].meterImage`);
      }
      if (tenant.breakerImage) {
        tenant.breakerImage = await processPhotoUrl(tenant.breakerImage, `tenant[${t}].breakerImage`);
      }
      if (tenant.ctRatioImage) {
        tenant.ctRatioImage = await processPhotoUrl(tenant.ctRatioImage, `tenant[${t}].ctRatioImage`);
      }
    }
  }

  // Update the inspection if modified
  if (modified) {
    const { error } = await supabase
      .from('inspections')
      .update({ json_data: jsonData, updated_at: new Date().toISOString() })
      .eq('id', inspectionId);

    if (error) {
      changes.push(`ERROR updating inspection: ${error.message}`);
    }
  }

  return { fixed, notFound, changes };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();
    const baseUrl = Deno.env.get('SUPABASE_URL')!;
    
    const body = await req.json().catch(() => ({}));
    const inspectionId = body.inspectionId;
    const dryRun = body.dryRun ?? false;
    
    console.log(`[fix-inspection-photos] Starting scan. inspectionId: ${inspectionId || 'ALL'}, dryRun: ${dryRun}`);

    // Query inspections
    let query = supabase
      .from('inspections')
      .select('id, title, json_data, site_id, subsection_id')
      .not('json_data', 'is', null);

    if (inspectionId) {
      query = query.eq('id', inspectionId);
    }

    const { data: inspections, error } = await query.limit(100);

    if (error) {
      throw new Error(`Failed to fetch inspections: ${error.message}`);
    }

    if (!inspections || inspections.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No inspections found', results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[fix-inspection-photos] Found ${inspections.length} inspections to process`);

    const results = [];
    let totalFixed = 0;
    let totalNotFound = 0;

    for (const inspection of inspections) {
      if (!inspection.json_data) continue;

      console.log(`[fix-inspection-photos] Processing: ${inspection.title} (${inspection.id})`);

      // Create a working copy
      const jsonDataCopy = JSON.parse(JSON.stringify(inspection.json_data));

      const result = await processInspectionPhotos(
        supabase,
        baseUrl,
        inspection.id,
        dryRun ? jsonDataCopy : inspection.json_data
      );

      if (result.changes.length > 0) {
        results.push({
          inspectionId: inspection.id,
          title: inspection.title,
          siteId: inspection.site_id,
          subsectionId: inspection.subsection_id,
          fixed: result.fixed,
          notFound: result.notFound,
          changes: result.changes,
        });
        totalFixed += result.fixed;
        totalNotFound += result.notFound;
      }
    }

    console.log(`[fix-inspection-photos] Complete. Fixed: ${totalFixed}, Not Found: ${totalNotFound}`);

    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        summary: {
          inspectionsProcessed: inspections.length,
          inspectionsWithIssues: results.length,
          totalFixed,
          totalNotFound,
        },
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[fix-inspection-photos] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
