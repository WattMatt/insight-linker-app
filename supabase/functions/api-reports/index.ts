import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Validate bearer token
async function validateToken(supabase: any, authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");
  
  const { data: tokenData, error } = await supabase
    .from("api_access_tokens")
    .select("*, api_clients(*)")
    .eq("access_token", token)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !tokenData || !tokenData.api_clients?.is_active) {
    return { valid: false, error: "Invalid or expired access token" };
  }

  // Update last_used_at
  await supabase
    .from("api_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenData.id);

  return { valid: true, clientId: tokenData.client_id, scopes: tokenData.scopes };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate token
    const authResult = await validateToken(supabase, req.headers.get("authorization"));
    if (!authResult.valid) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: authResult.error }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check scope
    if (!authResult.scopes?.includes("reports:read")) {
      return new Response(
        JSON.stringify({ error: "forbidden", message: "Insufficient scope for this operation" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const path = url.pathname.replace("/api-reports", "");

    // Log the request
    await supabase.from("api_request_logs").insert({
      client_id: authResult.clientId,
      endpoint: "/api-reports" + path,
      method: req.method,
      status_code: 200,
      request_params: Object.fromEntries(url.searchParams),
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    // Route handlers
    if (path === "/available" || path === "") {
      // List available report types and endpoints
      return new Response(
        JSON.stringify({
          report_types: [
            {
              type: "coc_validation",
              description: "Certificate of Compliance validation report",
              endpoint: "/generate/coc-validation",
              required_params: ["subsection_id", "document_id"],
            },
            {
              type: "inspection",
              description: "Inspection report with all sections and findings",
              endpoint: "/generate/inspection",
              required_params: ["inspection_id"],
            },
            {
              type: "site_summary",
              description: "Comprehensive site summary report",
              endpoint: "/generate/site-summary",
              required_params: ["site_id"],
            },
            {
              type: "subsection_report",
              description: "Detailed subsection compliance report",
              endpoint: "/generate/subsection",
              required_params: ["subsection_id"],
            },
            {
              type: "floor_plan",
              description: "Floor plan with annotations report",
              endpoint: "/generate/floor-plan",
              required_params: ["floor_plan_id"],
            },
          ],
          authentication: {
            type: "OAuth 2.0",
            token_endpoint: "/oauth-token",
            grant_types: ["client_credentials", "refresh_token"],
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (path.startsWith("/generate/")) {
      const reportType = path.replace("/generate/", "");
      const params = req.method === "POST" 
        ? await req.json() 
        : Object.fromEntries(url.searchParams);

      let reportData: any = null;

      switch (reportType) {
        case "coc-validation": {
          const { subsection_id, document_id } = params;
          if (!subsection_id || !document_id) {
            return new Response(
              JSON.stringify({ error: "bad_request", message: "subsection_id and document_id are required" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Fetch subsection data
          const { data: subsection } = await supabase
            .from("subsections")
            .select("*, sites(name, address, clients(name))")
            .eq("id", subsection_id)
            .single();

          // Fetch document data
          const { data: document } = await supabase
            .from("subsection_documents")
            .select("*")
            .eq("id", document_id)
            .single();

          // Fetch COC validation data
          const { data: validation } = await supabase
            .from("coc_validations")
            .select("*")
            .eq("document_id", document_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          reportData = {
            report_type: "coc_validation",
            generated_at: new Date().toISOString(),
            subsection: subsection || {},
            document: document || {},
            validation: validation || null,
            content_base64: generateCOCValidationPDFBase64(subsection, document, validation),
          };
          break;
        }

        case "inspection": {
          const { inspection_id } = params;
          if (!inspection_id) {
            return new Response(
              JSON.stringify({ error: "bad_request", message: "inspection_id is required" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const { data: inspection } = await supabase
            .from("inspections")
            .select("*, sites(name, address, clients(name)), inspection_templates(*), subsections(name)")
            .eq("id", inspection_id)
            .single();

          const { data: signatures } = await supabase
            .from("inspection_signatures")
            .select("*")
            .eq("inspection_id", inspection_id);

          reportData = {
            report_type: "inspection",
            generated_at: new Date().toISOString(),
            inspection: inspection || {},
            signatures: signatures || [],
            content_base64: generateInspectionPDFBase64(inspection, signatures),
          };
          break;
        }

        case "site-summary": {
          const { site_id } = params;
          if (!site_id) {
            return new Response(
              JSON.stringify({ error: "bad_request", message: "site_id is required" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const { data: site } = await supabase
            .from("sites")
            .select("*, clients(name)")
            .eq("id", site_id)
            .single();

          const { data: subsections } = await supabase
            .from("subsections")
            .select("*")
            .eq("site_id", site_id);

          const { data: inspections } = await supabase
            .from("inspections")
            .select("*")
            .eq("site_id", site_id)
            .order("inspection_date", { ascending: false });

          reportData = {
            report_type: "site_summary",
            generated_at: new Date().toISOString(),
            site: site || {},
            subsections: subsections || [],
            inspections: inspections || [],
            summary: {
              total_subsections: subsections?.length || 0,
              compliant_subsections: subsections?.filter((s: any) => s.coc_status === "approved").length || 0,
              total_inspections: inspections?.length || 0,
              pending_inspections: inspections?.filter((i: any) => i.status === "pending").length || 0,
            },
            content_base64: generateSiteSummaryPDFBase64(site, subsections, inspections),
          };
          break;
        }

        case "subsection": {
          const { subsection_id } = params;
          if (!subsection_id) {
            return new Response(
              JSON.stringify({ error: "bad_request", message: "subsection_id is required" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const { data: subsection } = await supabase
            .from("subsections")
            .select("*, sites(name, address, clients(name))")
            .eq("id", subsection_id)
            .single();

          const { data: documents } = await supabase
            .from("subsection_documents")
            .select("*")
            .eq("subsection_id", subsection_id);

          const { data: inspections } = await supabase
            .from("inspections")
            .select("*")
            .eq("subsection_id", subsection_id);

          reportData = {
            report_type: "subsection",
            generated_at: new Date().toISOString(),
            subsection: subsection || {},
            documents: documents || [],
            inspections: inspections || [],
            content_base64: generateSubsectionPDFBase64(subsection, documents, inspections),
          };
          break;
        }

        case "floor-plan": {
          const { floor_plan_id } = params;
          if (!floor_plan_id) {
            return new Response(
              JSON.stringify({ error: "bad_request", message: "floor_plan_id is required" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const { data: floorPlan } = await supabase
            .from("subsection_floor_plans")
            .select("*, subsections(name, sites(name))")
            .eq("id", floor_plan_id)
            .single();

          const { data: pins } = await supabase
            .from("floor_plan_pins")
            .select("*")
            .eq("floor_plan_id", floor_plan_id);

          reportData = {
            report_type: "floor_plan",
            generated_at: new Date().toISOString(),
            floor_plan: floorPlan || {},
            pins: pins || [],
            summary: {
              total_pins: pins?.length || 0,
              open_issues: pins?.filter((p: any) => p.status === "open").length || 0,
              resolved: pins?.filter((p: any) => p.status === "resolved" || p.status === "rectified").length || 0,
            },
            content_base64: generateFloorPlanPDFBase64(floorPlan, pins),
          };
          break;
        }

        default:
          return new Response(
            JSON.stringify({ error: "not_found", message: `Unknown report type: ${reportType}` }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
      }

      return new Response(
        JSON.stringify(reportData),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "not_found", message: "Endpoint not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("API Reports error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "server_error", message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// PDF Generation functions (simplified base64 text reports)
function generateCOCValidationPDFBase64(subsection: any, document: any, validation: any): string {
  const content = `
COC VALIDATION REPORT
=====================
Generated: ${new Date().toISOString()}

SUBSECTION INFORMATION
----------------------
Name: ${subsection?.name || "N/A"}
Site: ${subsection?.sites?.name || "N/A"}
Client: ${subsection?.sites?.clients?.name || "N/A"}

DOCUMENT INFORMATION
--------------------
File Name: ${document?.file_name || "N/A"}
COC Number: ${document?.coc_number || subsection?.coc_number || "N/A"}
COC Type: ${document?.coc_type || subsection?.coc_type || "N/A"}
Issue Date: ${document?.coc_issue_date || subsection?.coc_issue_date || "N/A"}

VALIDATION RESULTS
------------------
Status: ${validation?.status || "Not validated"}
Validated At: ${validation?.validated_at || "N/A"}
${validation?.violations ? `Violations: ${JSON.stringify(validation.violations, null, 2)}` : "No violations found"}

${validation?.report_data ? `Report Data: ${JSON.stringify(validation.report_data, null, 2)}` : ""}
  `.trim();
  
  return btoa(unescape(encodeURIComponent(content)));
}

function generateInspectionPDFBase64(inspection: any, signatures: any): string {
  const content = `
INSPECTION REPORT
=================
Generated: ${new Date().toISOString()}

INSPECTION DETAILS
------------------
Title: ${inspection?.title || "N/A"}
Status: ${inspection?.status || "N/A"}
Date: ${inspection?.inspection_date || "N/A"}
Site: ${inspection?.sites?.name || "N/A"}
Subsection: ${inspection?.subsections?.name || "N/A"}
Inspector: ${inspection?.inspector_name || "N/A"}

TEMPLATE
--------
Template: ${inspection?.inspection_templates?.name || "N/A"}
Category: ${inspection?.inspection_templates?.category || "N/A"}

INSPECTION DATA
---------------
${inspection?.json_data ? JSON.stringify(inspection.json_data, null, 2) : "No data recorded"}

SIGNATURES
----------
${signatures?.map((s: any) => `${s.signer_type}: ${s.signer_name} (${s.signed_at})`).join("\n") || "No signatures"}
  `.trim();
  
  return btoa(unescape(encodeURIComponent(content)));
}

function generateSiteSummaryPDFBase64(site: any, subsections: any, inspections: any): string {
  const content = `
SITE SUMMARY REPORT
===================
Generated: ${new Date().toISOString()}

SITE INFORMATION
----------------
Name: ${site?.name || "N/A"}
Address: ${site?.address || "N/A"}
Client: ${site?.clients?.name || "N/A"}
Type: ${site?.site_type || "N/A"}

COMPLIANCE SUMMARY
------------------
Total Subsections: ${subsections?.length || 0}
Compliant: ${subsections?.filter((s: any) => s.coc_status === "approved").length || 0}
Pending: ${subsections?.filter((s: any) => s.coc_status === "pending" || !s.coc_status).length || 0}
Failed: ${subsections?.filter((s: any) => s.coc_status === "failed").length || 0}

SUBSECTIONS
-----------
${subsections?.map((s: any) => `- ${s.name}: ${s.coc_status || "No Status"} (COC: ${s.coc_number || "N/A"})`).join("\n") || "No subsections"}

RECENT INSPECTIONS
------------------
${inspections?.slice(0, 10).map((i: any) => `- ${i.title}: ${i.status} (${i.inspection_date || "No date"})`).join("\n") || "No inspections"}
  `.trim();
  
  return btoa(unescape(encodeURIComponent(content)));
}

function generateSubsectionPDFBase64(subsection: any, documents: any, inspections: any): string {
  const content = `
SUBSECTION REPORT
=================
Generated: ${new Date().toISOString()}

SUBSECTION INFORMATION
----------------------
Name: ${subsection?.name || "N/A"}
Tenant: ${subsection?.tenant_name || "N/A"}
Category: ${subsection?.category || "N/A"}
Site: ${subsection?.sites?.name || "N/A"}
Client: ${subsection?.sites?.clients?.name || "N/A"}

COC COMPLIANCE
--------------
COC Number: ${subsection?.coc_number || "N/A"}
COC Type: ${subsection?.coc_type || "N/A"}
COC Status: ${subsection?.coc_status || "N/A"}
Issue Date: ${subsection?.coc_issue_date || "N/A"}

METERING
--------
Meter Serial: ${subsection?.meter_serial_number || "N/A"}
CT Ratio: ${subsection?.ct_ratio || "N/A"}
Metering Status: ${subsection?.metering_status || "N/A"}

DOCUMENTS (${documents?.length || 0})
-----------
${documents?.map((d: any) => `- ${d.file_name} (${d.uploaded_at})`).join("\n") || "No documents"}

INSPECTIONS (${inspections?.length || 0})
------------
${inspections?.map((i: any) => `- ${i.title}: ${i.status}`).join("\n") || "No inspections"}
  `.trim();
  
  return btoa(unescape(encodeURIComponent(content)));
}

function generateFloorPlanPDFBase64(floorPlan: any, pins: any): string {
  const content = `
FLOOR PLAN REPORT
=================
Generated: ${new Date().toISOString()}

FLOOR PLAN
----------
File: ${floorPlan?.file_name || "N/A"}
Subsection: ${floorPlan?.subsections?.name || "N/A"}
Site: ${floorPlan?.subsections?.sites?.name || "N/A"}

PIN SUMMARY
-----------
Total Pins: ${pins?.length || 0}
Open: ${pins?.filter((p: any) => p.status === "open").length || 0}
In Progress: ${pins?.filter((p: any) => p.status === "in_progress").length || 0}
Resolved: ${pins?.filter((p: any) => p.status === "resolved" || p.status === "rectified").length || 0}

PIN DETAILS
-----------
${pins?.map((p: any) => `
Pin #${p.pin_number}
  Type: ${p.pin_type}
  Status: ${p.status}
  Priority: ${p.priority || "Normal"}
  Title: ${p.title || "N/A"}
  Notes: ${p.notes || "N/A"}
  Position: (${p.x_position}, ${p.y_position})
`).join("\n") || "No pins"}
  `.trim();
  
  return btoa(unescape(encodeURIComponent(content)));
}
