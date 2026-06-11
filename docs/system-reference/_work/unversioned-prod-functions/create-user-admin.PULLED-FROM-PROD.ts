// ⚠️ REFERENCE ONLY — NOT A DEPLOYABLE FUNCTION. Do not move this into supabase/functions/.
// Source pulled from PROD via `supabase functions download create-user-admin --project-ref oltzgidkjxwsukvkomof`
// on 2026-06-11 for review (see GAPS.md G-SEC-09). This function is CRITICAL: unauthenticated,
// service-role, creates email-confirmed users from the raw request body with NO auth check.
// Preserved here only so it can be re-implemented WITH proper guards if a real need surfaces.
// The deployed copy should be DELETED. Verbatim as downloaded:

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { email, password, full_name } = await req.json();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name
      }
    });
    if (error) throw error;
    return new Response(JSON.stringify({
      success: true,
      user_id: data.user.id
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
