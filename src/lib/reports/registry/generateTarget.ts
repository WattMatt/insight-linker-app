// Generate + save one report target. Each branch calls the same generator the report's own tab
// uses, and every save goes through savePDFToDocuments so replace-on-save applies.
import { supabase } from "@/integrations/supabase/client";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import { generateAndSaveInspectionReportPdfmake } from "@/lib/pdfmakeInspectionReport";
import { loadInspectionReportData } from "@/lib/reports/inspectionReportData";
import { generateSiteSummaryPdf } from "@/lib/report/siteSummaryPdf";
import { generateFortressChecklistPdf } from "@/lib/fortressChecklistReportGenerator";
import { mergeFortressChecklist, buildFortressChecklistData } from "@/lib/report/fortressChecklistData";
import { generateInspectionBasedReport } from "@/lib/assetVerificationReportGenerator";
import {
  buildInspectionMeterMatches,
  buildInspectionMeterRows,
  buildComparisonResults,
  findUnregisteredMeters,
  summarizeResults,
  type AssetForComparison,
  type InspectionRecord,
  type SiteShop,
} from "@/lib/assetVerification";
import { loadSiteCocData, generateSiteCocReportPdf } from "@/lib/siteCoc/siteCocReportPdf";
import type { GenerateResult, ReportTarget, ReportType, SiteReportContext } from "./types";

type Built = { blob: Blob; filename: string; photoCount?: number };

async function buildSiteReport(type: Exclude<ReportType, "inspection">, ctx: SiteReportContext): Promise<Built> {
  const { siteId, siteName } = ctx;
  switch (type) {
    case "site-summary":
      return generateSiteSummaryPdf({ siteId, siteName, clientName: ctx.clientName ?? "" });

    case "fortress-checklist": {
      const { data, error } = await supabase.from("site_marking_checklist").select("*").eq("site_id", siteId);
      if (error) throw new Error(error.message);
      const result = await generateFortressChecklistPdf(
        buildFortressChecklistData({ siteId, siteName, items: mergeFortressChecklist(data ?? []) }),
      );
      if (!result.success || !result.blob) throw new Error(result.error || "Checklist generation failed");
      return { blob: result.blob, filename: result.filename || "Fortress_Checklist.pdf" };
    }

    case "site-coc": {
      const data = await loadSiteCocData(siteId);
      return generateSiteCocReportPdf({
        ...data,
        siteId,
        siteName,
        clientName: ctx.clientName,
        siteAddress: ctx.siteAddress,
        siteKpis: ctx.siteKpis,
        companyLogo: ctx.companyLogoUrl,
      });
    }

    case "asset-verification": {
      // Same queries and the same reconciliation as the Asset Verification tab (AssetVerification.tsx).
      const [assets, inspections, subsections] = await Promise.all([
        supabase.from("site_assets").select("*").eq("site_id", siteId).order("premises_id"),
        supabase.from("inspections").select("id, title, subsection_id, json_data").eq("site_id", siteId)
          .not("json_data", "is", null).order("created_at", { ascending: false }),
        supabase.from("subsections").select("id, name, tenant_name, meter_serial_number, shop_number")
          .eq("site_id", siteId).is("deleted_at", null).order("name"),
      ]);
      const failed = assets.error ?? inspections.error ?? subsections.error;
      if (failed) throw new Error(failed.message);
      const inspectionRows = (inspections.data ?? []) as unknown as InspectionRecord[];
      const siteShops = (subsections.data ?? []) as unknown as SiteShop[];
      // Electrical-only, as on the tab.
      const electrical = ((assets.data ?? []) as unknown as AssetForComparison[]).filter((a) => a.asset_category === "electrical_meter");
      const comparisonResults = buildComparisonResults(electrical, buildInspectionMeterMatches(inspectionRows, siteShops), siteShops);
      const result = await generateInspectionBasedReport({
        siteName,
        comparisonResults,
        stats: summarizeResults(comparisonResults),
        unregisteredMeters: findUnregisteredMeters(buildInspectionMeterRows(inspectionRows, siteShops), comparisonResults),
      });
      return { blob: result.blob, filename: result.filename };
    }
  }
}

export async function generateReportTarget(target: ReportTarget, ctx: SiteReportContext): Promise<GenerateResult> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  try {
    if (target.type === "inspection") {
      if (!target.inspectionId || !target.templateId || !target.subsectionId) {
        throw new Error("Inspection has no template");
      }
      const { data, photoCount } = await loadInspectionReportData({
        inspectionId: target.inspectionId,
        templateId: target.templateId,
        subsectionId: target.subsectionId,
        subsectionName: target.subsectionName ?? "",
      });
      const res = await generateAndSaveInspectionReportPdfmake({
        inspection: data,
        siteName: ctx.siteName,
        clientName: ctx.clientName ?? undefined,
        siteLogoUrl: ctx.siteLogoUrl,
        subsectionId: target.subsectionId,
        siteId: ctx.siteId,
      });
      if (!res.success) throw new Error(res.error || "Report generation failed");
      return {
        ok: true,
        durationMs: elapsed(),
        bytes: res.bytes ?? 0,
        photoCount,
        superseded: res.superseded ?? 0,
        supersedeBlocked: res.supersedeBlocked ?? 0,
      };
    }

    const built = await buildSiteReport(target.type, ctx);
    const saved = await savePDFToDocuments({
      blob: built.blob,
      fileName: built.filename,
      siteId: ctx.siteId,
      categoryName: getReportCategoryName(target.type),
    });
    if (!saved.success) throw new Error(saved.error || "Save failed");
    return {
      ok: true,
      durationMs: elapsed(),
      bytes: built.blob.size,
      photoCount: built.photoCount,
      superseded: saved.superseded ?? 0,
      supersedeBlocked: saved.supersedeBlocked ?? 0,
    };
  } catch (e) {
    return { ok: false, durationMs: elapsed(), error: e instanceof Error ? e.message : String(e) };
  }
}
