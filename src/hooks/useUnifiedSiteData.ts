/**
 * UNIFIED SITE DATA HOOK
 * 
 * This is the SINGLE source of data for PDF Template Manager previews.
 * When a site is selected, ALL report type tabs use this same data.
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────┐
 * │              PDFTemplateManager                 │
 * │  ┌─────────────────────────────────────────┐    │
 * │  │      Reference Site Selector            │    │
 * │  └─────────────────────────────────────────┘    │
 * │                      │                          │
 * │                      ▼                          │
 * │  ┌─────────────────────────────────────────┐    │
 * │  │      useUnifiedSiteData(siteId)         │    │ ← THIS HOOK
 * │  │      Returns ALL data for site          │    │
 * │  └─────────────────────────────────────────┘    │
 * │                      │                          │
 * │    ┌─────────────────┼─────────────────┐       │
 * │    ▼                 ▼                 ▼       │
 * │ [Site Summary]  [Inspection]  [Floor Plan]...  │
 * │   Preview        Preview        Preview        │
 * └─────────────────────────────────────────────────┘
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { factorScores, siteHealthScore, type SnagForHealth } from "@/lib/siteHealth";
import { hasValidCocStatus, hasFailedCocStatus } from "@/lib/complianceCalculations";

// ============================================================================
// DATA TYPES - All report types draw from these structures
// ============================================================================

export interface UnifiedSiteInfo {
  id: string;
  name: string;
  address: string | null;
  clientName: string;
  clientLogoUrl: string | null;
  siteImageUrl: string | null;
  consultantName: string | null;
  consultantCompany: string | null;
  supplyAuthority: string | null;
  nominatedMaxDemand: string | null;
}

export interface UnifiedSubsection {
  id: string;
  name: string;
  tenantName: string | null;
  category: string | null;
  cocStatus: string | null;
  cocNumber: string | null;
  cocIssueDate: string | null;
  cocType: string | null;
  meterSerialNumber: string | null;
  ctRatio: string | null;
  meteringStatus: string | null;
  isCompliant: boolean | null;
  isCocRequired: boolean | null;
  qrCodeUrl: string | null;
  documentCount: number;
  snagCount: number;
}

export interface UnifiedAsset {
  id: string;
  premisesId: string;
  tradeAs: string | null;
  meterSerialNumber: string | null;
  ctRatio: string | null;
  breakerSize: string | null;
  meterType: string | null;
  assetCategory: string;
  tag: string | null;
  comments: string | null;
}

export interface UnifiedInspection {
  id: string;
  title: string;
  status: string;
  inspectorName: string | null;
  inspectionDate: string | null;
  subsectionId: string | null;
  subsectionName: string | null;
  templateId: string | null;
  templateName: string | null;
  qualityRating: number | null;
  jsonData: Record<string, any> | null;
}

export interface UnifiedFloorPlan {
  id: string;
  fileName: string;
  fileUrl: string;
  subsectionId: string;
  subsectionName: string;
  pinCount: number;
  openPinCount: number;
  resolvedPinCount: number;
}

export interface UnifiedCocValidation {
  id: string;
  subsectionId: string;
  subsectionName: string;
  documentId: string;
  cocNumber: string | null;
  status: string;
  validatedAt: string;
  validatedBy: string | null;
}

export interface UnifiedKPIs {
  // Subsection metrics
  totalSubsections: number;
  cocPass: number;
  cocMissing: number;
  cocPending: number;
  cocNA: number;
  cocRequired: number;
  compliantCount: number;
  complianceRate: number;
  
  // Asset metrics
  totalAssets: number;
  verifiedAssets: number;
  pendingAssets: number;
  
  // Inspection metrics
  totalInspections: number;
  completedInspections: number;
  inProgressInspections: number;
  scheduledInspections: number;
  
  // Snag metrics
  totalSnags: number;
  openSnags: number;
  resolvedSnags: number;
  
  // Floor plan metrics
  totalFloorPlans: number;
  totalPins: number;
  openPins: number;
  
  // Calculated health
  overallHealth: number;
  meteringHealth: number;
  snagFreeRate: number;
}

export interface UnifiedSiteData {
  site: UnifiedSiteInfo | null;
  subsections: UnifiedSubsection[];
  assets: UnifiedAsset[];
  inspections: UnifiedInspection[];
  floorPlans: UnifiedFloorPlan[];
  cocValidations: UnifiedCocValidation[];
  kpis: UnifiedKPIs;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// SAMPLE DATA GENERATORS - Used when no site selected
// ============================================================================

const SAMPLE_TENANTS = [
  'Woolworths', 'Clicks Pharmacy', 'Pick n Pay', 'Spar', 'Checkers', 'Dischem',
  'Game', 'Mr Price', 'Ackermans', 'Pep Stores', 'Jet', 'Edgars'
];

const SAMPLE_CATEGORIES = ['Electrical Equipment', 'Line Shop', 'Fire Safety', 'Access Control'];

function generateSampleSubsections(): UnifiedSubsection[] {
  const statuses = ['Pass', 'Pass', 'Pass', 'Missing', 'Pending', 'Pass', 'N/A', 'Pass', 'Missing', 'Pass', 'Pending', 'Pass'];
  
  return Array.from({ length: 12 }, (_, i) => ({
    id: `sample-sub-${i + 1}`,
    name: `Shop ${String(i + 1).padStart(2, '0')} - ${SAMPLE_TENANTS[i]}`,
    tenantName: SAMPLE_TENANTS[i],
    category: SAMPLE_CATEGORIES[i % 4],
    cocStatus: statuses[i],
    cocNumber: statuses[i] === 'Pass' ? `COC-${String(2024001 + i).padStart(7, '0')}` : null,
    cocIssueDate: statuses[i] === 'Pass' ? new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000).toISOString() : null,
    cocType: i < 8 ? 'Commercial' : 'Industrial',
    meterSerialNumber: i < 8 ? `MTR-${10000 + i}` : null,
    ctRatio: i < 6 ? '200/5' : (i < 8 ? '100/5' : null),
    meteringStatus: i < 8 ? 'Installed' : 'Missing',
    isCompliant: statuses[i] === 'Pass',
    isCocRequired: statuses[i] !== 'N/A',
    qrCodeUrl: null,
    documentCount: Math.floor(Math.random() * 5) + 1,
    snagCount: i % 4 === 0 ? 2 : (i % 3 === 0 ? 1 : 0),
  }));
}

function generateSampleAssets(): UnifiedAsset[] {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `sample-asset-${i + 1}`,
    premisesId: `P-${1000 + i}`,
    tradeAs: SAMPLE_TENANTS[i % SAMPLE_TENANTS.length],
    meterSerialNumber: `SN-${String(50000 + i).padStart(6, '0')}`,
    ctRatio: i < 6 ? '200/5' : '100/5',
    breakerSize: ['20A', '32A', '40A', '63A'][i % 4],
    meterType: ['Electronic', 'Smart', 'Electronic', 'Smart'][i % 4],
    assetCategory: 'electrical_meter',
    tag: i < 4 ? `TAG-${i + 1}` : null,
    comments: null,
  }));
}

function generateSampleInspections(): UnifiedInspection[] {
  const statuses = ['Completed', 'Completed', 'In Progress', 'Scheduled', 'Pending'];
  const inspectors = ['John Smith', 'Sarah Jones', 'Mike Williams', 'Lisa Brown', 'David Wilson'];
  const titles = [
    'Electrical Installation Inspection',
    'Fire Safety Compliance Check',
    'Meter Verification Audit',
    'Annual COC Assessment',
    'Quarterly Safety Review'
  ];
  
  return titles.map((title, i) => ({
    id: `sample-insp-${i + 1}`,
    title,
    status: statuses[i],
    inspectorName: inspectors[i],
    inspectionDate: new Date(Date.now() - (i * 7 * 24 * 60 * 60 * 1000)).toISOString(),
    subsectionId: i < 3 ? `sample-sub-${i + 1}` : null,
    subsectionName: i < 3 ? `Shop ${String(i + 1).padStart(2, '0')}` : null,
    templateId: i < 2 ? 'template-1' : null,
    templateName: i < 2 ? 'Electrical Safety Template' : null,
    qualityRating: i < 2 ? 4 : null,
    jsonData: null,
  }));
}

function generateSampleFloorPlans(): UnifiedFloorPlan[] {
  return [
    { id: 'fp-1', fileName: 'Ground Floor.pdf', fileUrl: '', subsectionId: 'sample-sub-1', subsectionName: 'Main Building', pinCount: 12, openPinCount: 3, resolvedPinCount: 9 },
    { id: 'fp-2', fileName: 'First Floor.pdf', fileUrl: '', subsectionId: 'sample-sub-2', subsectionName: 'Electrical Room', pinCount: 8, openPinCount: 1, resolvedPinCount: 7 },
  ];
}

function calculateKPIs(subsections: UnifiedSubsection[], assets: UnifiedAsset[], inspections: UnifiedInspection[], floorPlans: UnifiedFloorPlan[], snags: SnagForHealth[]): UnifiedKPIs {
  const cocPass = subsections.filter(s => s.cocStatus === 'Pass').length;
  const cocMissing = subsections.filter(s => !s.cocStatus || s.cocStatus === 'Missing').length;
  const cocPending = subsections.filter(s => s.cocStatus === 'Pending').length;
  const cocNA = subsections.filter(s => s.cocStatus === 'N/A').length;
  const totalSnags = subsections.reduce((sum, s) => sum + s.snagCount, 0);
  const openSnags = Math.floor(totalSnags * 0.3);
  const totalPins = floorPlans.reduce((sum, fp) => sum + fp.pinCount, 0);
  const openPins = floorPlans.reduce((sum, fp) => sum + fp.openPinCount, 0);

  // Site Health from the single source of truth (siteHealth.ts). COC is tracked
  // separately (cocPass/complianceRate above) and is NOT folded into overallHealth.
  const f = factorScores(
    subsections.map(s => ({ id: s.id, metering_status: s.meteringStatus, meter_serial_number: s.meterSerialNumber })),
    snags,
    inspections.map(i => ({ subsection_id: i.subsectionId, status: i.status })),
  );

  return {
    totalSubsections: subsections.length,
    cocPass,
    cocMissing,
    cocPending,
    cocNA,
    cocRequired: subsections.length - cocNA,
    compliantCount: subsections.filter(s => s.isCompliant).length,
    complianceRate: subsections.length > 0 ? Math.round((cocPass / subsections.length) * 100 * 10) / 10 : 0,
    totalAssets: assets.length,
    verifiedAssets: Math.floor(assets.length * 0.8),
    pendingAssets: Math.floor(assets.length * 0.2),
    totalInspections: inspections.length,
    completedInspections: inspections.filter(i => i.status === 'Completed').length,
    inProgressInspections: inspections.filter(i => i.status === 'In Progress').length,
    scheduledInspections: inspections.filter(i => i.status === 'Scheduled').length,
    totalSnags,
    openSnags,
    resolvedSnags: totalSnags - openSnags,
    totalFloorPlans: floorPlans.length,
    totalPins,
    openPins,
    overallHealth: siteHealthScore(f),
    meteringHealth: f.metering,
    snagFreeRate: subsections.length > 0 ? Math.round(((subsections.length - subsections.filter(s => s.snagCount > 0).length) / subsections.length) * 100) : 0,
  };
}

function generateSampleData(): Omit<UnifiedSiteData, 'loading' | 'error' | 'refetch'> {
  const subsections = generateSampleSubsections();
  const assets = generateSampleAssets();
  const inspections = generateSampleInspections();
  const floorPlans = generateSampleFloorPlans();
  // Expand each subsection's snagCount into open sample snags for the health model.
  const sampleSnags: SnagForHealth[] = subsections.flatMap(s =>
    Array.from({ length: s.snagCount }, () => ({ subsection_id: s.id, status: 'Open', risk_level: 'Medium' }))
  );

  return {
    site: {
      id: 'sample-site',
      name: 'Sample Shopping Centre',
      address: '123 Main Street, Sandton, Johannesburg',
      clientName: 'Sample Property Group',
      clientLogoUrl: null,
      siteImageUrl: null,
      consultantName: 'John Consulting',
      consultantCompany: 'Electrical Consultants (Pty) Ltd',
      supplyAuthority: 'City Power',
      nominatedMaxDemand: '500kVA',
    },
    subsections,
    assets,
    inspections,
    floorPlans,
    cocValidations: subsections.filter(s => s.cocStatus === 'Pass').map((s, i) => ({
      id: `coc-val-${i}`,
      subsectionId: s.id,
      subsectionName: s.name,
      documentId: `doc-${i}`,
      cocNumber: s.cocNumber,
      status: 'Pass',
      validatedAt: new Date().toISOString(),
      validatedBy: 'System',
    })),
    kpis: calculateKPIs(subsections, assets, inspections, floorPlans, sampleSnags),
  };
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useUnifiedSiteData(siteId: string | null): UnifiedSiteData {
  const [data, setData] = useState<Omit<UnifiedSiteData, 'loading' | 'error' | 'refetch'>>(() => generateSampleData());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!siteId) {
      console.log('[useUnifiedSiteData] No site selected, using sample data');
      setData(generateSampleData());
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[useUnifiedSiteData] Fetching data for site:', siteId);

      // Fetch site with client info
      const { data: siteData, error: siteError } = await supabase
        .from("sites")
        .select(`
          id, name, address, site_image_url, client_logo_url,
          consultant_name, consultant_company, supply_authority, nominated_max_demand,
          clients!inner(name, logo_url)
        `)
        .eq("id", siteId)
        .single();

      if (siteError) throw siteError;

      const clientData = siteData.clients as any;
      const site: UnifiedSiteInfo = {
        id: siteData.id,
        name: siteData.name,
        address: siteData.address,
        clientName: clientData?.name || 'Unknown Client',
        clientLogoUrl: clientData?.logo_url || siteData.client_logo_url,
        siteImageUrl: siteData.site_image_url,
        consultantName: siteData.consultant_name,
        consultantCompany: siteData.consultant_company,
        supplyAuthority: siteData.supply_authority,
        nominatedMaxDemand: siteData.nominated_max_demand,
      };

      // Fetch subsections with document and snag counts
      const { data: subsectionsData } = await supabase
        .from("subsections")
        .select("*")
        .eq("site_id", siteId)
        .order("name");

      const subsections: UnifiedSubsection[] = await Promise.all(
        (subsectionsData || []).map(async (sub) => {
          const [docResult, snagResult] = await Promise.all([
            supabase.from("subsection_documents").select("*", { count: "exact", head: true }).eq("subsection_id", sub.id),
            supabase.from("snags").select("*", { count: "exact", head: true }).eq("subsection_id", sub.id).not("status", "in", '("rectified","Rectified")'),
          ]);

          return {
            id: sub.id,
            name: sub.name,
            tenantName: sub.tenant_name,
            category: sub.category,
            cocStatus: sub.coc_status,
            cocNumber: sub.coc_number,
            cocIssueDate: sub.coc_issue_date,
            cocType: sub.coc_type,
            meterSerialNumber: sub.meter_serial_number,
            ctRatio: sub.ct_ratio,
            meteringStatus: sub.metering_status,
            isCompliant: sub.is_compliant,
            isCocRequired: sub.is_coc_required,
            qrCodeUrl: sub.qr_code_url,
            documentCount: docResult.count || 0,
            snagCount: snagResult.count || 0,
          };
        })
      );

      // Fetch assets
      const { data: assetsData } = await supabase
        .from("site_assets")
        .select("*")
        .eq("site_id", siteId)
        .order("premises_id");

      const assets: UnifiedAsset[] = (assetsData || []).map(asset => ({
        id: asset.id,
        premisesId: asset.premises_id,
        tradeAs: asset.trade_as,
        meterSerialNumber: asset.meter_serial_number,
        ctRatio: asset.ct_ratio,
        breakerSize: asset.breaker_size,
        meterType: asset.meter_type,
        assetCategory: asset.asset_category,
        tag: asset.tag,
        comments: asset.comments,
      }));

      // Fetch inspections with template names
      const { data: inspectionsData } = await supabase
        .from("inspections")
        .select(`
          *,
          inspection_templates(name),
          subsections(name)
        `)
        .eq("site_id", siteId)
        .order("created_at", { ascending: false });

      const inspections: UnifiedInspection[] = (inspectionsData || []).map(insp => ({
        id: insp.id,
        title: insp.title,
        status: insp.status,
        inspectorName: insp.inspector_name,
        inspectionDate: insp.inspection_date,
        subsectionId: insp.subsection_id,
        subsectionName: (insp.subsections as any)?.name || null,
        templateId: insp.template_id,
        templateName: (insp.inspection_templates as any)?.name || null,
        qualityRating: insp.quality_rating,
        jsonData: insp.json_data as Record<string, any> | null,
      }));

      // Fetch floor plans with pin counts
      const subsectionIds = subsections.map(s => s.id);
      const { data: floorPlansData } = await supabase
        .from("subsection_floor_plans")
        .select(`
          id, file_name, file_url, subsection_id,
          subsections(name)
        `)
        .in("subsection_id", subsectionIds.length > 0 ? subsectionIds : ['none']);

      const floorPlans: UnifiedFloorPlan[] = await Promise.all(
        (floorPlansData || []).map(async (fp) => {
          const { data: pins } = await supabase
            .from("floor_plan_pins")
            .select("status")
            .eq("floor_plan_id", fp.id);

          const allPins = pins || [];
          return {
            id: fp.id,
            fileName: fp.file_name,
            fileUrl: fp.file_url,
            subsectionId: fp.subsection_id,
            subsectionName: (fp.subsections as any)?.name || 'Unknown',
            pinCount: allPins.length,
            openPinCount: allPins.filter(p => p.status === 'open' || p.status === 'in_progress').length,
            resolvedPinCount: allPins.filter(p => p.status === 'closed' || p.status === 'resolved').length,
          };
        })
      );

      // COC verdict is the subsection's manual coc_status. Derive a validation row for each
      // subsection that has a Pass/Fail verdict so downstream previews keep their COC view.
      const cocValidations: UnifiedCocValidation[] = subsections
        .filter(s => hasValidCocStatus(s.cocStatus) || hasFailedCocStatus(s.cocStatus))
        .map((s) => ({
          id: `coc-${s.id}`,
          subsectionId: s.id,
          subsectionName: s.name,
          documentId: '',
          cocNumber: s.cocNumber,
          status: s.cocStatus || '',
          validatedAt: '',
          validatedBy: null,
        }));

      // Fetch snags for Site Health (siteHealth.ts needs status + risk_level per subsection)
      const { data: snagsData } = await supabase
        .from("snags")
        .select("subsection_id, status, risk_level")
        .in("subsection_id", subsectionIds.length > 0 ? subsectionIds : ['none']);

      const healthSnags: SnagForHealth[] = (snagsData || []).map(s => ({
        subsection_id: s.subsection_id,
        status: s.status,
        risk_level: s.risk_level,
      }));

      const kpis = calculateKPIs(subsections, assets, inspections, floorPlans, healthSnags);

      setData({
        site,
        subsections,
        assets,
        inspections,
        floorPlans,
        cocValidations,
        kpis,
      });

      console.log('[useUnifiedSiteData] Data loaded:', {
        subsections: subsections.length,
        assets: assets.length,
        inspections: inspections.length,
        floorPlans: floorPlans.length,
        cocValidations: cocValidations.length,
      });

    } catch (err: any) {
      console.error('[useUnifiedSiteData] Error:', err);
      setError(err.message);
      // Fallback to sample data on error
      setData(generateSampleData());
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    ...data,
    loading,
    error,
    refetch: fetchData,
  };
}
