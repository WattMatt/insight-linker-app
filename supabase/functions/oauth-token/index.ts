import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { grant_type, client_id, client_secret, refresh_token } = await req.json();

    // Validate grant type
    if (!["client_credentials", "refresh_token"].includes(grant_type)) {
      return new Response(
        JSON.stringify({ error: "unsupported_grant_type", error_description: "Only client_credentials and refresh_token grants are supported" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let clientRecord;

    if (grant_type === "client_credentials") {
      // Validate client credentials
      const { data: client, error: clientError } = await supabase
        .from("api_clients")
        .select("*")
        .eq("client_id", client_id)
        .eq("client_secret", client_secret)
        .eq("is_active", true)
        .single();

      if (clientError || !client) {
        return new Response(
          JSON.stringify({ error: "invalid_client", error_description: "Invalid client credentials" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      clientRecord = client;
    } else if (grant_type === "refresh_token") {
      // Validate refresh token
      const { data: tokenData, error: tokenError } = await supabase
        .from("api_access_tokens")
        .select("*, api_clients(*)")
        .eq("refresh_token", refresh_token)
        .gt("refresh_expires_at", new Date().toISOString())
        .single();

      if (tokenError || !tokenData || !tokenData.api_clients?.is_active) {
        return new Response(
          JSON.stringify({ error: "invalid_grant", error_description: "Invalid or expired refresh token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete old token
      await supabase.from("api_access_tokens").delete().eq("id", tokenData.id);
      clientRecord = tokenData.api_clients;
    }

    // Generate new tokens
    const accessToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const newRefreshToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000); // 30 days

    const { error: insertError } = await supabase.from("api_access_tokens").insert({
      client_id: clientRecord.id,
      access_token: accessToken,
      refresh_token: newRefreshToken,
      scopes: clientRecord.scopes,
      expires_at: expiresAt.toISOString(),
      refresh_expires_at: refreshExpiresAt.toISOString(),
    });

    if (insertError) {
      console.error("Token insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "server_error", error_description: "Failed to generate token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the request
    await supabase.from("api_request_logs").insert({
      client_id: clientRecord.id,
      endpoint: "/oauth-token",
      method: "POST",
      status_code: 200,
      request_params: { grant_type },
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return new Response(
      JSON.stringify({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: newRefreshToken,
        scope: clientRecord.scopes.join(" "),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("OAuth token error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "server_error", error_description: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
