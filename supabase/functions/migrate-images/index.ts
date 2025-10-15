import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MigrateImageRequest {
  imageUrl: string;
  bucket: 'site-images' | 'client-logos';
  fileName: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { imageUrl, bucket, fileName }: MigrateImageRequest = await req.json();

    // Remove any timestamp patterns from filename to ensure consistency
    const cleanFileName = fileName.replace(/-\d{13,}\./, '.');
    
    console.log(`Migrating image: ${imageUrl} to ${bucket}/${cleanFileName}`);
    
    // Check if file already exists
    const folderPath = cleanFileName.split('/').slice(0, -1).join('/');
    const fileNameOnly = cleanFileName.split('/').pop();
    
    const { data: existingFiles } = await supabase.storage
      .from(bucket)
      .list(folderPath, {
        search: fileNameOnly
      });

    if (existingFiles && existingFiles.length > 0) {
      console.log('File already exists, returning existing URL:', cleanFileName);
      
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(cleanFileName);

      return new Response(
        JSON.stringify({
          success: true,
          originalUrl: imageUrl,
          newUrl: urlData.publicUrl,
          bucket,
          fileName: cleanFileName,
          skipped: true
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Download the image from Firebase
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.statusText}`);
    }

    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();
    
    // Determine content type
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    
    console.log(`Downloaded image: ${imageBlob.size} bytes, type: ${contentType}`);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(cleanFileName, imageBuffer, {
        contentType,
        upsert: false, // Don't upsert since we checked above
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    console.log('Upload successful:', uploadData);

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(cleanFileName);

    const newUrl = urlData.publicUrl;
    console.log('New URL:', newUrl);

    return new Response(
      JSON.stringify({
        success: true,
        originalUrl: imageUrl,
        newUrl,
        bucket,
        fileName: cleanFileName,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error migrating image:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
