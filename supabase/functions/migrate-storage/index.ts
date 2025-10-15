import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { firebaseStorageUrl, targetBucket, targetPath } = await req.json();

    if (!firebaseStorageUrl || !targetBucket) {
      throw new Error('Firebase storage URL and target bucket are required');
    }

    console.log('Migrating file:', { firebaseStorageUrl, targetBucket, targetPath });

    // Fetch the file from Firebase Storage
    const fileResponse = await fetch(firebaseStorageUrl);
    
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file from Firebase: ${fileResponse.statusText}`);
    }

    const fileBlob = await fileResponse.blob();
    const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
    
    // Extract filename from URL or use provided path
    const urlParts = new URL(firebaseStorageUrl).pathname.split('/');
    let filename = targetPath || decodeURIComponent(urlParts[urlParts.length - 1].split('?')[0]);
    
    // Remove any existing timestamp patterns to ensure consistency
    filename = filename.replace(/-\d{13,}\./, '.');

    console.log('Processing file:', { filename, size: fileBlob.size, contentType });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if file already exists
    const { data: existingFile } = await supabase.storage
      .from(targetBucket)
      .list(filename.split('/').slice(0, -1).join('/'), {
        search: filename.split('/').pop()
      });

    if (existingFile && existingFile.length > 0) {
      console.log('File already exists, skipping upload:', filename);
      
      // Get public URL for existing file
      const { data: urlData } = supabase.storage
        .from(targetBucket)
        .getPublicUrl(filename);

      return new Response(
        JSON.stringify({
          success: true,
          path: filename,
          publicUrl: urlData.publicUrl,
          skipped: true
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(targetBucket)
      .upload(filename, fileBlob, {
        contentType,
        upsert: false, // Don't upsert since we checked above
      });

    if (error) {
      console.error('Upload error:', error);
      throw error;
    }

    console.log('File uploaded successfully:', data);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(targetBucket)
      .getPublicUrl(filename);

    return new Response(
      JSON.stringify({
        success: true,
        path: data.path,
        publicUrl: urlData.publicUrl,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Migration error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
