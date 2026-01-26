import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchCompressRequest {
  bucket?: string;           // Bucket to process (default: "inspection-photos")
  prefix?: string;           // Optional folder prefix to limit scope
  maxWidth?: number;         // Target width (default: 800)
  quality?: number;          // JPEG quality 1-100 (default: 70)
  minSizeKB?: number;        // Only compress files larger than this (default: 150)
  dryRun?: boolean;          // If true, only report what would be done
  limit?: number;            // Max files to process in one run (default: 50)
}

interface ProcessedFile {
  path: string;
  originalSize: number;
  compressedSize?: number;
  status: 'compressed' | 'skipped' | 'error' | 'already_compressed';
  error?: string;
}

interface BatchCompressResponse {
  success: boolean;
  processed: number;
  compressed: number;
  skipped: number;
  errors: number;
  totalSavings: number;
  files: ProcessedFile[];
  continuationToken?: string;
}

// Detect image type from magic bytes
function detectImageType(bytes: Uint8Array): string {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

// Recursively list all files in a bucket, including subdirectories
async function listAllFiles(
  supabase: any,
  bucket: string,
  prefix: string = ''
): Promise<Array<{ name: string; path: string; metadata?: any }>> {
  const allFiles: Array<{ name: string; path: string; metadata?: any }> = [];
  
  const { data: items, error } = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: 1000 });
  
  if (error) {
    console.error(`[batch-compress] Error listing ${prefix}:`, error.message);
    return allFiles;
  }
  
  for (const item of items || []) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
    
    // Check if it's a folder (no metadata.mimetype means it's a folder)
    if (!item.metadata || item.id === null) {
      // It's a folder, recurse into it
      console.log(`[batch-compress] Scanning folder: ${itemPath}`);
      const subFiles = await listAllFiles(supabase, bucket, itemPath);
      allFiles.push(...subFiles);
    } else {
      // It's a file
      allFiles.push({ name: item.name, path: itemPath, metadata: item.metadata });
    }
  }
  
  return allFiles;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: BatchCompressRequest = await req.json();
    const { 
      bucket = 'inspection-photos',
      prefix = '',
      maxWidth = 800,
      quality = 70,
      minSizeKB = 150,
      dryRun = false,
      limit = 50,
    } = body;

    console.log(`[batch-compress] Starting batch compression`);
    console.log(`[batch-compress] Bucket: ${bucket}, Prefix: ${prefix || '(all folders)'}`);
    console.log(`[batch-compress] Settings: ${maxWidth}px, ${quality}% quality, min ${minSizeKB}KB`);
    console.log(`[batch-compress] Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}, Limit: ${limit}`);

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Recursively list ALL files in the bucket
    console.log(`[batch-compress] Scanning bucket recursively...`);
    const allFiles = await listAllFiles(supabase, bucket, prefix);
    console.log(`[batch-compress] Found ${allFiles.length} total files in bucket`);

    // Filter to only image files that need processing
    const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'heic'];
    const imageFiles = allFiles.filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const isImage = ext && imageExtensions.includes(ext);
      const isAlreadyCompressed = file.name.includes('_compressed') || file.path.includes('_compressed');
      return isImage && !isAlreadyCompressed;
    });

    console.log(`[batch-compress] Found ${imageFiles.length} image files to evaluate`);

    const processedFiles: ProcessedFile[] = [];
    let compressed = 0;
    let skipped = 0;
    let errors = 0;
    let totalSavings = 0;

    // Process files up to limit
    const filesToProcess = imageFiles.slice(0, limit);

    for (const file of filesToProcess) {
      const filePath = file.path; // Already includes the full path from recursive listing
      
      try {
        // Download to check actual size
        const { data: blob, error: downloadError } = await supabase.storage
          .from(bucket)
          .download(filePath);

        if (downloadError || !blob) {
          processedFiles.push({
            path: filePath,
            originalSize: 0,
            status: 'error',
            error: downloadError?.message || 'Download failed',
          });
          errors++;
          continue;
        }

        const originalSize = blob.size;
        const sizeKB = Math.round(originalSize / 1024);

        // Skip if below threshold
        if (sizeKB < minSizeKB) {
          processedFiles.push({
            path: filePath,
            originalSize,
            status: 'skipped',
          });
          skipped++;
          console.log(`[batch-compress] Skipped (${sizeKB}KB < ${minSizeKB}KB): ${file.name}`);
          continue;
        }

        // Check if compressed version already exists
        const compressedPath = filePath.replace(/\.[^.]+$/, '_compressed.jpg');
        const { data: existingCompressed } = await supabase.storage
          .from(bucket)
          .download(compressedPath);

        if (existingCompressed) {
          processedFiles.push({
            path: filePath,
            originalSize,
            status: 'already_compressed',
          });
          skipped++;
          console.log(`[batch-compress] Already has compressed version: ${file.name}`);
          continue;
        }

        if (dryRun) {
          // In dry run, just report what would happen
          processedFiles.push({
            path: filePath,
            originalSize,
            status: 'skipped', // Would be compressed in live run
          });
          console.log(`[batch-compress] Would compress (${sizeKB}KB): ${file.name}`);
          continue;
        }

        // Try to use Supabase Image Transformation
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(filePath, 120, {
            transform: {
              width: maxWidth,
              quality: quality,
            }
          });

        let compressedData: ArrayBuffer;
        let compressedSize: number;

        if (!signedUrlError && signedUrlData?.signedUrl) {
          try {
            const transformResponse = await fetch(signedUrlData.signedUrl, {
              signal: AbortSignal.timeout(30000)
            });
            
            if (transformResponse.ok) {
              compressedData = await transformResponse.arrayBuffer();
              compressedSize = compressedData.byteLength;
            } else {
              throw new Error('Transform response not OK');
            }
          } catch {
            // Fallback: use original (no server-side compression available)
            console.warn(`[batch-compress] Transformation not available for: ${file.name}`);
            compressedData = await blob.arrayBuffer();
            compressedSize = compressedData.byteLength;
          }
        } else {
          compressedData = await blob.arrayBuffer();
          compressedSize = compressedData.byteLength;
        }

        // Only save if actually smaller
        if (compressedSize >= originalSize * 0.9) {
          processedFiles.push({
            path: filePath,
            originalSize,
            compressedSize,
            status: 'skipped',
          });
          skipped++;
          console.log(`[batch-compress] No significant reduction for: ${file.name}`);
          continue;
        }

        // Upload compressed version
        const contentType = detectImageType(new Uint8Array(compressedData));
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(compressedPath, compressedData, {
            contentType,
            upsert: true,
          });

        if (uploadError) {
          processedFiles.push({
            path: filePath,
            originalSize,
            status: 'error',
            error: uploadError.message,
          });
          errors++;
          continue;
        }

        const savings = originalSize - compressedSize;
        totalSavings += savings;
        compressed++;

        processedFiles.push({
          path: filePath,
          originalSize,
          compressedSize,
          status: 'compressed',
        });

        console.log(`[batch-compress] Compressed: ${file.name} (${Math.round(originalSize / 1024)}KB → ${Math.round(compressedSize / 1024)}KB)`);

      } catch (err) {
        processedFiles.push({
          path: filePath,
          originalSize: 0,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        errors++;
      }
    }

    const response: BatchCompressResponse = {
      success: true,
      processed: processedFiles.length,
      compressed,
      skipped,
      errors,
      totalSavings,
      files: processedFiles,
      continuationToken: imageFiles.length > limit ? `offset_${limit}` : undefined,
    };

    console.log(`[batch-compress] Complete: ${compressed} compressed, ${skipped} skipped, ${errors} errors`);
    console.log(`[batch-compress] Total savings: ${Math.round(totalSavings / 1024)}KB`);

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[batch-compress] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
