import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { firebaseData, path } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting Firebase to Supabase migration for path:', path);
    console.log('Data structure:', Object.keys(firebaseData || {}));

    // Determine table name from path
    const tableName = path.split('/').filter(Boolean).pop() || 'firebase_data';
    
    // Check if table exists and create if not
    const { data: existingTable, error: checkError } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);

    // If table doesn't exist, we'll insert into a generic migration table
    const targetTable = checkError ? 'temp_import' : tableName;

    console.log(`Using table: ${targetTable}`);

    // Convert Firebase data to array of records
    const records = [];
    if (typeof firebaseData === 'object' && firebaseData !== null) {
      for (const [key, value] of Object.entries(firebaseData)) {
        if (targetTable === 'temp_import') {
          records.push({
            data: { id: key, ...value as object }
          });
        } else {
          records.push({
            id: key,
            ...(typeof value === 'object' ? value : { value })
          });
        }
      }
    }

    console.log(`Prepared ${records.length} records for insertion`);

    // Insert data
    const { data: insertedData, error: insertError } = await supabase
      .from(targetTable)
      .insert(records)
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      throw insertError;
    }

    console.log(`Successfully inserted ${insertedData?.length || 0} records`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Migrated ${records.length} records to ${targetTable}`,
        table: targetTable,
        recordCount: records.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Migration error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
