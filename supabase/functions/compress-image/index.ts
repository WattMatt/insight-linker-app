import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompressImageRequest {
  sourcePath: string;    // Path within bucket (e.g., "inspections/abc123/photo.jpg")
  bucket?: string;       // Bucket name (default: "inspection-photos")
  maxWidth?: number;     // Target width (default: 800)
  quality?: number;      // JPEG quality 1-100 (default: 70)
}

interface CompressImageResponse {
  success: boolean;
  originalSize?: number;
  compressedSize?: number;
  path?: string;
  url?: string;
  error?: string;
}

// Detect image type from magic bytes
function detectImageType(bytes: Uint8Array): string {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

// Convert ArrayBuffer to Base64 in chunks (avoid stack overflow)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binaryString = '';
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length));
    binaryString += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binaryString);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: CompressImageRequest = await req.json();
    const { 
      sourcePath, 
      bucket = 'inspection-photos',
      maxWidth = 800,
      quality = 70 
    } = body;

    if (!sourcePath) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing sourcePath' } as CompressImageResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[compress-image] Processing: ${bucket}/${sourcePath}`);
    console.log(`[compress-image] Target: ${maxWidth}px, ${quality}% quality`);

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // G-SEC-12: require an authenticated user. The anon key is a valid JWT but resolves
    // to no user, so anon/anon-key-only callers are rejected. App callers send a real
    // user JWT via functions.invoke, so this does not affect legitimate use.
    const __authHeader = req.headers.get('Authorization') || '';
    const __jwt = __authHeader.replace('Bearer ', '');
    const { data: { user: __caller } = { user: null }, error: __authErr } =
      __jwt ? await supabase.auth.getUser(__jwt) : { data: { user: null }, error: new Error('missing token') } as any;
    if (__authErr || !__caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Download original image
    const { data: originalBlob, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(sourcePath);

    if (downloadError || !originalBlob) {
      console.error('[compress-image] Download failed:', downloadError?.message);
      return new Response(
        JSON.stringify({ success: false, error: `Download failed: ${downloadError?.message}` } as CompressImageResponse),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const originalSize = originalBlob.size;
    console.log(`[compress-image] Original size: ${Math.round(originalSize / 1024)}KB`);

    // Try to use Supabase Image Transformation (requires Pro plan)
    // If that fails, we'll just save the original but with proper extension
    let compressedData: ArrayBuffer = await originalBlob.arrayBuffer();
    let compressedSize: number = compressedData.byteLength;
    let usedTransformation = false;

    // Try fetching with transformation parameters
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(sourcePath, 60, {
        transform: {
          width: maxWidth,
          quality: quality,
        }
      });

    if (!signedUrlError && signedUrlData?.signedUrl) {
      try {
        const transformResponse = await fetch(signedUrlData.signedUrl, {
          signal: AbortSignal.timeout(30000)
        });
        
        if (transformResponse.ok) {
          compressedData = await transformResponse.arrayBuffer();
          compressedSize = compressedData.byteLength;
          usedTransformation = true;
          console.log(`[compress-image] Transformed size: ${Math.round(compressedSize / 1024)}KB (${Math.round((1 - compressedSize / originalSize) * 100)}% reduction)`);
        }
      } catch (fetchErr) {
        console.warn('[compress-image] Transformation fetch failed:', fetchErr);
      }
    }

    // Log if we used original data
    if (!usedTransformation) {
      console.log('[compress-image] Transformation not available, keeping original');
    }

    // Determine new file extension and path
    const contentType = detectImageType(new Uint8Array(compressedData));
    const newExt = contentType === 'image/jpeg' ? 'jpg' : 
                   contentType === 'image/png' ? 'png' : 
                   contentType === 'image/webp' ? 'webp' : 'jpg';
    
    // Generate new path with _compressed suffix (or replace original)
    const pathWithoutExt = sourcePath.replace(/\.[^.]+$/, '');
    const compressedPath = `${pathWithoutExt}_compressed.${newExt}`;

    // Upload compressed image
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(compressedPath, compressedData, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[compress-image] Upload failed:', uploadError.message);
      return new Response(
        JSON.stringify({ success: false, error: `Upload failed: ${uploadError.message}` } as CompressImageResponse),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(compressedPath);

    console.log(`[compress-image] Success: ${compressedPath}`);
    console.log(`[compress-image] Size: ${Math.round(originalSize / 1024)}KB → ${Math.round(compressedSize / 1024)}KB`);

    const response: CompressImageResponse = {
      success: true,
      originalSize,
      compressedSize,
      path: compressedPath,
      url: urlData.publicUrl,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[compress-image] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' } as CompressImageResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
