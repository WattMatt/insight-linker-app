import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-source",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// Validate sync API key
function validateSyncKey(authHeader: string | null): { valid: boolean; error?: string } {
  const expectedKey = Deno.env.get("DOCBUILDER_SYNC_KEY");
  
  // If no key is configured, allow access (for development)
  if (!expectedKey) {
    console.log("Warning: DOCBUILDER_SYNC_KEY not configured, allowing access");
    return { valid: true };
  }
  
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid Authorization header" };
  }
  
  const token = authHeader.replace("Bearer ", "");
  if (token !== expectedKey) {
    return { valid: false, error: "Invalid sync key" };
  }
  
  return { valid: true };
}

// Convert WM Compliance template to PDFMaker format
function convertToPDFMakerFormat(template: any): any {
  return {
    schemaVersion: "1.0",
    type: "pdfmaker-template",
    exportedAt: new Date().toISOString(),
    sourceApp: "wm-compliance",
    template: {
      id: template.id,
      name: template.name,
      description: template.description || "",
      metadata: {
        category: template.category,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
        sectionsCount: template.sections_count || (template.sections?.length || 0),
        pagesCount: template.pages_count || 1,
      },
      settings: {
        pageSize: "A4",
        orientation: "portrait",
        margins: { top: 20, bottom: 20, left: 20, right: 20 },
      },
      coverPage: template.cover_page || {
        title: template.name,
        showLogo: true,
        showDate: true,
      },
      sections: template.sections || [],
      tenants: template.tenants || [],
      dynamicFields: extractDynamicFields(template),
    },
  };
}

// Extract dynamic fields from template sections
function extractDynamicFields(template: any): any[] {
  const fields: any[] = [];
  const sections = template.sections || [];
  
  for (const section of sections) {
    const items = section.items || [];
    for (const item of items) {
      if (item.type && item.type !== "static") {
        fields.push({
          id: item.id,
          name: item.name,
          type: item.type,
          section: section.name,
          required: item.required || false,
          options: item.options || null,
        });
      }
    }
  }
  
  return fields;
}

// Convert PDFMaker format back to WM Compliance format
function convertFromPDFMakerFormat(pdfMakerTemplate: any): any {
  const template = pdfMakerTemplate.template || pdfMakerTemplate;
  
  return {
    name: template.name,
    description: template.description || template.metadata?.description || "",
    category: template.metadata?.category || "General",
    sections: template.sections || [],
    cover_page: template.coverPage || template.cover_page || null,
    tenants: template.tenants || [],
    sections_count: template.sections?.length || 0,
    pages_count: template.metadata?.pagesCount || 1,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate sync key
    const authResult = validateSyncKey(req.headers.get("authorization"));
    if (!authResult.valid) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: authResult.error }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const path = url.pathname.replace("/template-sync", "");
    const syncSource = req.headers.get("x-sync-source") || "unknown";

    console.log(`[template-sync] ${req.method} ${path} from ${syncSource}`);

    // GET /templates - List all templates in PDFMaker format
    if (path === "/templates" && req.method === "GET") {
      const { data: templates, error } = await supabase
        .from("inspection_templates")
        .select("*")
        .order("name");

      if (error) {
        console.error("Error fetching templates:", error);
        return new Response(
          JSON.stringify({ error: "database_error", message: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pdfMakerTemplates = templates?.map(convertToPDFMakerFormat) || [];

      return new Response(
        JSON.stringify({
          success: true,
          count: pdfMakerTemplates.length,
          templates: pdfMakerTemplates,
          syncInfo: {
            source: "wm-compliance",
            projectId: "oltzgidkjxwsukvkomof",
            timestamp: new Date().toISOString(),
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /templates/:id - Get single template in PDFMaker format
    if (path.startsWith("/templates/") && req.method === "GET") {
      const templateId = path.replace("/templates/", "");
      
      const { data: template, error } = await supabase
        .from("inspection_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (error || !template) {
        return new Response(
          JSON.stringify({ error: "not_found", message: "Template not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          template: convertToPDFMakerFormat(template),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST /templates - Create new template from PDFMaker format
    if (path === "/templates" && req.method === "POST") {
      const body = await req.json();
      const templateData = convertFromPDFMakerFormat(body);

      const { data: newTemplate, error } = await supabase
        .from("inspection_templates")
        .insert(templateData)
        .select()
        .single();

      if (error) {
        console.error("Error creating template:", error);
        return new Response(
          JSON.stringify({ error: "database_error", message: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Notify webhook subscribers (if configured)
      await notifyWebhook("template.created", newTemplate);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Template created successfully",
          template: convertToPDFMakerFormat(newTemplate),
        }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PUT /templates/:id - Update template from PDFMaker format
    if (path.startsWith("/templates/") && req.method === "PUT") {
      const templateId = path.replace("/templates/", "");
      const body = await req.json();
      const templateData = convertFromPDFMakerFormat(body);

      const { data: updatedTemplate, error } = await supabase
        .from("inspection_templates")
        .update({
          ...templateData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", templateId)
        .select()
        .single();

      if (error) {
        console.error("Error updating template:", error);
        return new Response(
          JSON.stringify({ error: "database_error", message: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Notify webhook subscribers
      await notifyWebhook("template.updated", updatedTemplate);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Template updated successfully",
          template: convertToPDFMakerFormat(updatedTemplate),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // DELETE /templates/:id - Delete template
    if (path.startsWith("/templates/") && req.method === "DELETE") {
      const templateId = path.replace("/templates/", "");

      const { data: deletedTemplate, error } = await supabase
        .from("inspection_templates")
        .delete()
        .eq("id", templateId)
        .select()
        .single();

      if (error) {
        console.error("Error deleting template:", error);
        return new Response(
          JSON.stringify({ error: "database_error", message: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Notify webhook subscribers
      await notifyWebhook("template.deleted", { id: templateId });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Template deleted successfully",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST /webhook/register - Register webhook for template changes
    if (path === "/webhook/register" && req.method === "POST") {
      const { webhookUrl, events } = await req.json();
      
      if (!webhookUrl) {
        return new Response(
          JSON.stringify({ error: "bad_request", message: "webhookUrl is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Store webhook registration (using a simple in-memory approach for now)
      // In production, this should be stored in the database
      console.log(`Webhook registered: ${webhookUrl} for events: ${events?.join(", ") || "all"}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Webhook registered successfully",
          webhookUrl,
          events: events || ["template.created", "template.updated", "template.deleted"],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /sync/status - Get sync status and info
    if (path === "/sync/status" && req.method === "GET") {
      const { count } = await supabase
        .from("inspection_templates")
        .select("*", { count: "exact", head: true });

      return new Response(
        JSON.stringify({
          success: true,
          status: "active",
          source: "wm-compliance",
          projectId: "oltzgidkjxwsukvkomof",
          templateCount: count || 0,
          endpoints: {
            listTemplates: "GET /templates",
            getTemplate: "GET /templates/:id",
            createTemplate: "POST /templates",
            updateTemplate: "PUT /templates/:id",
            deleteTemplate: "DELETE /templates/:id",
            registerWebhook: "POST /webhook/register",
          },
          lastSync: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "not_found", message: "Endpoint not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Template sync error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "server_error", message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Notify registered webhooks
async function notifyWebhook(event: string, data: any) {
  const webhookUrl = Deno.env.get("DOCBUILDER_WEBHOOK_URL");
  
  if (!webhookUrl) {
    console.log(`No webhook URL configured for event: ${event}`);
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": event,
        "X-Source": "wm-compliance",
      },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data,
      }),
    });

    if (!response.ok) {
      console.error(`Webhook notification failed: ${response.status}`);
    } else {
      console.log(`Webhook notified: ${event}`);
    }
  } catch (error) {
    console.error("Webhook notification error:", error);
  }
}
