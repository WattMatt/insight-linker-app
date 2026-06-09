import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Real deactivation: bans/unbans the auth user so "Inactive" actually blocks
// sign-in and token refresh (not just a cosmetic profiles.status flag).
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Caller must be an authenticated Admin.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } =
      await supabaseClient.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    const { data: roleData, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (roleError || roleData?.role !== "Admin") {
      throw new Error("Only admins can change user access");
    }

    const { userId, active } = await req.json();
    if (!userId || typeof active !== "boolean") {
      throw new Error("userId and active (boolean) are required");
    }
    if (userId === user.id && active === false) {
      throw new Error("You cannot deactivate your own account");
    }

    // ban_duration 'none' = active; a long duration = banned (blocks login).
    const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
      userId,
      { ban_duration: active ? "none" : "876000h" }
    );
    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        success: true,
        message: active ? "User reactivated" : "User deactivated",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
