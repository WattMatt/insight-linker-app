// Load everything one inspection report needs (inspection, template, snags, tenants, document
// appendix) and shape it for generateInspectionReportPdf. Lifted unchanged from the former
// BulkInspectionReportGenerator so bulk output matches what it produced before.
import { supabase } from "@/integrations/supabase/client";
import { templateSupportsTenants } from "@/lib/templateTenants";
import type { InspectionReportData, ReportDocument } from "@/lib/pdfmakeInspectionReport";

/* eslint-disable @typescript-eslint/no-explicit-any -- template/json_data are untyped JSON */

export async function loadInspectionReportData(args: {
  inspectionId: string;
  templateId: string;
  subsectionId: string;
  subsectionName: string;
}): Promise<{ data: InspectionReportData; photoCount: number }> {
  const { inspectionId, templateId, subsectionId, subsectionName } = args;

  const { data: inspection, error: inspError } = await supabase
    .from('inspections')
    .select('*')
    .eq('id', inspectionId)
    .single();
  if (inspError || !inspection) throw new Error('Failed to fetch inspection');

  const { data: template, error: templateError } = await supabase
    .from('inspection_templates')
    .select('*')
    .eq('id', templateId)
    .single();
  if (templateError || !template) throw new Error('Failed to fetch template');

  const { data: snagsData } = await supabase
    .from('snags')
    .select('*')
    .eq('subsection_id', subsectionId);
  const snags = snagsData || [];

  const jsonData: Record<string, any> = (inspection.json_data as Record<string, any>) || {};
  const generalInfo = jsonData.generalInfo || {};
  const templateSections: any[] = Array.isArray(template.sections) ? template.sections : Object.values(template.sections || {});
  let photoCount = 0;

  const sections = templateSections.map((section: any) => {
    const sectionId = String(section.id ?? '');
    const items = Array.isArray(section.items) ? section.items : Object.values(section.items || {});
    return {
      title: section.name || sectionId,
      items: items.map((item: any, idx: number) => {
        const itemId = String(item.id ?? idx);
        const itemData = jsonData[sectionId]?.[itemId] || {};
        const photos = Array.isArray(itemData.photos) ? itemData.photos : [];
        photoCount += photos.length;
        return {
          label: item.name || itemId,
          value: itemData.status || itemData.value || 'N/A',
          type: item.type || 'text',
          notes: itemData.notes || '',
          photos,
        };
      }),
    };
  });

  // Document-field uploads for the appendix.
  const documents: ReportDocument[] = [];
  templateSections.forEach((section: any) => {
    const sectionId = String(section.id ?? '');
    const items = Array.isArray(section.items) ? section.items : Object.values(section.items || {});
    items.forEach((item: any, idx: number) => {
      const docs = jsonData[sectionId]?.[String(item.id ?? idx)]?.documents;
      if (Array.isArray(docs)) documents.push(...docs);
    });
  });

  snags.forEach((snag) => {
    if (Array.isArray(snag.photos)) photoCount += (snag.photos as string[]).length;
  });

  // Tenant meter/breaker/CT photos (EMB templates only).
  const tenants = (templateSupportsTenants(template) && Array.isArray(jsonData.tenants)) ? jsonData.tenants : [];
  const tenantsForPdf = tenants.map((tenant: any) => {
    photoCount += [tenant.meterImage, tenant.breakerImage, tenant.ctRatioImage].filter(Boolean).length;
    return {
      shopName: tenant.shopName || 'Unknown Tenant',
      shopNumber: tenant.shopNumber || '',
      meterSerialNumber: tenant.meterSerialNumber || '',
      breakerSize: tenant.breakerSize || '',
      ctSizeAndRatio: tenant.ctSizeAndRatio || '',
      meterImage: tenant.meterImage || null,
      breakerImage: tenant.breakerImage || null,
      ctRatioImage: tenant.ctRatioImage || null,
    };
  });

  return {
    photoCount,
    data: {
      inspectionId,
      templateName: template.name,
      inspectorName: generalInfo.inspectorName || inspection.inspector_name,
      inspectionDate: generalInfo.date || inspection.inspection_date,
      status: inspection.status,
      qualityRating: inspection.quality_rating ?? undefined,
      generalInfo,
      sections,
      tenants: tenantsForPdf,
      documents,
      snags: snags.map((snag) => ({
        title: snag.title,
        description: snag.description || undefined,
        status: snag.status,
        riskLevel: snag.risk_level || undefined,
        photos: Array.isArray(snag.photos) ? (snag.photos as string[]) : [],
      })),
      subsectionName,
    },
  };
}
