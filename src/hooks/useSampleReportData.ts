import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SampleSite {
  id: string;
  name: string;
  clientName: string;
  address: string | null;
  logoUrl: string | null;
  clientLogoUrl: string | null;
}

// Interface for site selection with data quality info
export interface SiteWithStats {
  id: string;
  name: string;
  clientName: string;
  subsectionCount: number;
  inspectionCount: number;
  hasLogo: boolean;
  completenessScore: number;
}

export interface SampleSubsection {
  id: string;
  name: string;
  tenantName: string | null;
  category: string | null;
  cocStatus: string | null;
  documentCount: number;
  // Full data fields for actual reports
  meterSerialNumber: string | null;
  ctRatio: string | null;
  meteringStatus: string | null;
  isCompliant: boolean | null;
  snagCount: number;
}

export interface SampleAsset {
  id: string;
  serialNumber: string | null;
  premisesId: string;
  tradeAs: string | null;
  breakerSize: string | null;
  ctRatio: string | null;
  meterType: string | null;
}

// Extracted line shop data from inspection json_data
export interface LineShopData {
  id: string;
  shopName: string;
  shopNumber?: string;
  meterSerial?: string;
  ctRatio?: string;
  breakerSize?: string;
  cableSize?: string;
  meterSerialImages?: Record<string, { downloadURL: string; originalFilename: string }>;
  breakerSizeImages?: Record<string, { downloadURL: string; originalFilename: string }>;
  ctRatioImages?: Record<string, { downloadURL: string; originalFilename: string }>;
}

// Inspection finding from json_data sections
export interface InspectionFinding {
  id: string;
  name: string;
  status?: 'Pass' | 'Fail' | 'N/A';
  notes?: string;
  referenceStandard?: string;
  images?: Record<string, { downloadURL: string; originalFilename: string }>;
}

export interface SampleInspection {
  id: string;
  title: string;
  status: string;
  inspectorName: string | null;
  inspectionDate: string | null;
  siteName: string;
  subsectionName?: string;
  templateName?: string;
  // Rich data extracted from json_data
  lineShops?: LineShopData[];
  findings?: Record<string, InspectionFinding>;
  jsonData?: Record<string, any>;
}

export interface SampleKPIs {
  totalSubsections: number;
  cocPass: number;
  cocMissing: number;
  cocPending: number;
  cocRequired: number; // Total requiring COC
  complianceRate: number;
  totalAssets: number;
  totalInspections: number;
  completedInspections: number;
  snagOpen: number; // Open snags count
}

// COC Validation data for preview tables
export interface SampleCocValidation {
  subsectionName: string;
  cocNumber: string;
  status: string;
  date: string;
}

export interface SampleReportData {
  site: SampleSite | null;
  subsections: SampleSubsection[];
  assets: SampleAsset[];
  inspections: SampleInspection[];
  cocValidations: SampleCocValidation[];
  kpis: SampleKPIs;
  loading: boolean;
  error: string | null;
}

type ReportType = 'site_summary' | 'inspection' | 'floor_plan' | 'asset_verification' | 'compliance';

// ========== COMPLETE SAMPLE DATA GENERATION ==========
// Generate realistic sample data when no reference site is selected
// This ensures the preview ALWAYS shows all 7 section types properly

const SAMPLE_CATEGORIES = ['Electrical Equipment', 'Line Shop', 'Fire Safety', 'Access Control'];
const SAMPLE_COC_STATUSES = ['Pass', 'Pass', 'Pass', 'Missing', 'Pending', 'Pass', 'N/A', 'Pass', 'Missing', 'Pass', 'Pending', 'Pass'];
const SAMPLE_TENANT_NAMES = [
  'Woolworths', 'Clicks Pharmacy', 'Pick n Pay', 'Spar', 'Checkers', 'Dischem',
  'Game', 'Mr Price', 'Ackermans', 'Pep Stores', 'Jet', 'Edgars'
];

function generateCompleteSampleSubsections(): SampleSubsection[] {
  return Array.from({ length: 12 }, (_, i) => {
    const cocStatus = SAMPLE_COC_STATUSES[i];
    const hasMeter = i < 8; // 8 out of 12 have meters
    const category = SAMPLE_CATEGORIES[i % 4];
    
    return {
      id: `sample-sub-${i + 1}`,
      name: `Shop ${String(i + 1).padStart(2, '0')} - ${SAMPLE_TENANT_NAMES[i]}`,
      tenantName: SAMPLE_TENANT_NAMES[i],
      category,
      cocStatus,
      documentCount: Math.floor(Math.random() * 5) + 1,
      meterSerialNumber: hasMeter ? `MTR-${10000 + i}` : null,
      ctRatio: hasMeter && i < 6 ? '200/5' : (hasMeter ? '100/5' : null),
      meteringStatus: hasMeter ? 'Installed' : 'Missing',
      isCompliant: cocStatus === 'Pass',
      snagCount: i % 4 === 0 ? 2 : (i % 3 === 0 ? 1 : 0), // Some have snags
    };
  });
}

function generateCompleteSampleCocValidations(subsections: SampleSubsection[]): SampleCocValidation[] {
  return subsections.map((sub, i) => ({
    subsectionName: sub.name,
    cocNumber: sub.cocStatus === 'Pass' ? `COC-${String(2024001 + i).padStart(7, '0')}` : '-',
    status: sub.cocStatus || 'Pending',
    date: sub.cocStatus === 'Pass' 
      ? new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB')
      : '-',
  }));
}

function generateCompleteSampleInspections(siteName: string): SampleInspection[] {
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
    siteName,
    subsectionName: i < 3 ? `Shop ${String(i + 1).padStart(2, '0')}` : undefined,
    templateName: i < 2 ? 'Electrical Safety Template' : undefined,
  }));
}

function generateCompleteSampleAssets(): SampleAsset[] {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `sample-asset-${i + 1}`,
    serialNumber: `SN-${String(50000 + i).padStart(6, '0')}`,
    premisesId: `P-${1000 + i}`,
    tradeAs: SAMPLE_TENANT_NAMES[i % SAMPLE_TENANT_NAMES.length],
    breakerSize: ['20A', '32A', '40A', '63A'][i % 4],
    ctRatio: i < 6 ? '200/5' : '100/5',
    meterType: ['Electronic', 'Smart', 'Electronic', 'Smart'][i % 4],
  }));
}

function generateCompleteSampleKPIs(subsections: SampleSubsection[]): SampleKPIs {
  const total = subsections.length;
  const cocPass = subsections.filter(s => s.cocStatus === 'Pass').length;
  const cocMissing = subsections.filter(s => !s.cocStatus || s.cocStatus === 'Missing').length;
  const cocPending = subsections.filter(s => s.cocStatus === 'Pending').length;
  const snagOpen = subsections.reduce((sum, s) => sum + s.snagCount, 0);
  
  return {
    totalSubsections: total,
    cocPass,
    cocMissing,
    cocPending,
    cocRequired: total,
    complianceRate: total > 0 ? Math.round((cocPass / total) * 100 * 10) / 10 : 0,
    totalAssets: 10,
    totalInspections: 5,
    completedInspections: 2,
    snagOpen,
  };
}

function generateCompleteSampleData(siteName: string = 'Sample Shopping Centre'): {
  site: SampleSite;
  subsections: SampleSubsection[];
  assets: SampleAsset[];
  inspections: SampleInspection[];
  cocValidations: SampleCocValidation[];
  kpis: SampleKPIs;
} {
  const subsections = generateCompleteSampleSubsections();
  const assets = generateCompleteSampleAssets();
  const inspections = generateCompleteSampleInspections(siteName);
  const cocValidations = generateCompleteSampleCocValidations(subsections);
  const kpis = generateCompleteSampleKPIs(subsections);
  
  return {
    site: {
      id: 'sample-site-1',
      name: siteName,
      clientName: 'Sample Property Group',
      address: '123 Main Street, Sandton, Johannesburg',
      logoUrl: null,
      clientLogoUrl: null,
    },
    subsections,
    assets,
    inspections,
    cocValidations,
    kpis,
  };
}

// ========== HOOKS ==========

// Hook to fetch available sites with data quality stats for reference selection
export const useAvailableSites = () => {
  const [sites, setSites] = useState<SiteWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSites = async () => {
      try {
        // Fetch sites with counts
        const { data: sitesData, error } = await supabase
          .from("sites")
          .select(`
            id,
            name,
            site_image_url,
            clients!inner(name, logo_url)
          `)
          .order("name");

        if (error) throw error;

        // Get counts for each site
        const sitesWithStats = await Promise.all(
          (sitesData || []).map(async (site) => {
            const [subsectionRes, inspectionRes] = await Promise.all([
              supabase.from("subsections").select("id", { count: "exact", head: true }).eq("site_id", site.id),
              supabase.from("inspections").select("id", { count: "exact", head: true }).eq("site_id", site.id),
            ]);

            const clientData = site.clients as any;
            const subsectionCount = subsectionRes.count || 0;
            const inspectionCount = inspectionRes.count || 0;
            const hasLogo = !!(clientData?.logo_url || site.site_image_url);
            
            // Calculate completeness score (0-100)
            let score = 0;
            if (subsectionCount > 0) score += 30;
            if (subsectionCount > 10) score += 20;
            if (inspectionCount > 0) score += 20;
            if (inspectionCount > 5) score += 15;
            if (hasLogo) score += 15;

            return {
              id: site.id,
              name: site.name,
              clientName: clientData?.name || "Unknown",
              subsectionCount,
              inspectionCount,
              hasLogo,
              completenessScore: score,
            };
          })
        );

        // Sort by completeness score
        sitesWithStats.sort((a, b) => b.completenessScore - a.completenessScore);
        setSites(sitesWithStats);
      } catch (err) {
        console.error("Error fetching sites:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSites();
  }, []);

  return { sites, loading };
};

export const useSampleReportData = (reportType: ReportType, referenceSiteId?: string): SampleReportData => {
  const [site, setSite] = useState<SampleSite | null>(null);
  const [subsections, setSubsections] = useState<SampleSubsection[]>([]);
  const [assets, setAssets] = useState<SampleAsset[]>([]);
  const [inspections, setInspections] = useState<SampleInspection[]>([]);
  const [cocValidations, setCocValidations] = useState<SampleCocValidation[]>([]);
  const [kpis, setKpis] = useState<SampleKPIs>({
    totalSubsections: 0,
    cocPass: 0,
    cocMissing: 0,
    cocPending: 0,
    cocRequired: 0,
    complianceRate: 0,
    totalAssets: 0,
    totalInspections: 0,
    completedInspections: 0,
    snagOpen: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSampleData = async () => {
      try {
        setLoading(true);
        setError(null);

        // If no reference site, use complete sample data
        if (!referenceSiteId) {
          console.log('[useSampleReportData] No reference site - generating complete sample data');
          const sampleData = generateCompleteSampleData();
          setSite(sampleData.site);
          setSubsections(sampleData.subsections);
          setAssets(sampleData.assets);
          setInspections(sampleData.inspections);
          setCocValidations(sampleData.cocValidations);
          setKpis(sampleData.kpis);
          setLoading(false);
          return;
        }

        // Fetch site with client info using reference site
        const { data: siteData, error: siteError } = await supabase
          .from("sites")
          .select(`
            id,
            name,
            address,
            site_image_url,
            client_logo_url,
            clients!inner(name, logo_url)
          `)
          .eq("id", referenceSiteId)
          .single();

        if (siteError) {
          console.error("Error fetching site:", siteError);
          // Fallback to sample data
          const sampleData = generateCompleteSampleData();
          setSite(sampleData.site);
          setSubsections(sampleData.subsections);
          setAssets(sampleData.assets);
          setInspections(sampleData.inspections);
          setCocValidations(sampleData.cocValidations);
          setKpis(sampleData.kpis);
          setLoading(false);
          return;
        }

        const clientData = siteData.clients as any;
        const fetchedSite: SampleSite = {
          id: siteData.id,
          name: siteData.name,
          clientName: clientData?.name || "Sample Client",
          address: siteData.address,
          logoUrl: siteData.site_image_url,
          clientLogoUrl: clientData?.logo_url || siteData.client_logo_url,
        };
        setSite(fetchedSite);

        // Fetch ALL subsections for this site
        const { data: subsectionsData } = await supabase
          .from("subsections")
          .select("id, name, tenant_name, category, coc_status, meter_serial_number, ct_ratio, metering_status, is_compliant")
          .eq("site_id", siteData.id)
          .order("name");

        let subsectionsWithCounts: SampleSubsection[] = [];
        
        if (subsectionsData && subsectionsData.length > 0) {
          // Get document counts and snag counts for each subsection
          subsectionsWithCounts = await Promise.all(
            subsectionsData.map(async (sub) => {
              const [docResult, snagResult] = await Promise.all([
                supabase
                  .from("subsection_documents")
                  .select("*", { count: "exact", head: true })
                  .eq("subsection_id", sub.id),
                supabase
                  .from("snags")
                  .select("*", { count: "exact", head: true })
                  .eq("subsection_id", sub.id)
                  .not("status", "in", '("rectified","Rectified")')
              ]);

              return {
                id: sub.id,
                name: sub.name,
                tenantName: sub.tenant_name,
                category: sub.category,
                cocStatus: sub.coc_status,
                documentCount: docResult.count || 0,
                meterSerialNumber: sub.meter_serial_number,
                ctRatio: sub.ct_ratio,
                meteringStatus: sub.metering_status,
                isCompliant: sub.is_compliant,
                snagCount: snagResult.count || 0,
              };
            })
          );
          setSubsections(subsectionsWithCounts);

          // Fetch actual COC validations from database
          const subsectionIds = subsectionsWithCounts.map(s => s.id);
          const { data: cocValidationsData } = await supabase
            .from("coc_validations")
            .select(`
              id, status, validated_at,
              subsection_documents!inner(coc_number, subsection_id),
              subsections!inner(name)
            `)
            .in("subsection_id", subsectionIds);

          if (cocValidationsData && cocValidationsData.length > 0) {
            const cocVals: SampleCocValidation[] = cocValidationsData.map(val => {
              const doc = val.subsection_documents as any;
              const sub = val.subsections as any;
              return {
                subsectionName: sub?.name || 'Unknown',
                cocNumber: doc?.coc_number || '-',
                status: val.status || 'Pending',
                date: val.validated_at ? new Date(val.validated_at).toLocaleDateString() : '-',
              };
            });
            setCocValidations(cocVals);
          } else {
            // Generate from subsection COC status if no validations exist
            const cocVals: SampleCocValidation[] = subsectionsWithCounts
              .filter(sub => sub.cocStatus)
              .map(sub => ({
                subsectionName: sub.name,
                cocNumber: sub.cocStatus === 'Pass' ? `COC-${sub.id.substring(0, 6).toUpperCase()}` : '-',
                status: sub.cocStatus || 'Pending',
                date: sub.cocStatus === 'Pass' ? new Date().toLocaleDateString() : '-',
              }));
            setCocValidations(cocVals);
          }
        } else {
          // No subsections found - use sample data for subsections
          console.log('[useSampleReportData] No subsections found - using sample subsections');
          const sampleData = generateCompleteSampleData(fetchedSite.name);
          setSubsections(sampleData.subsections);
          setCocValidations(sampleData.cocValidations);
          subsectionsWithCounts = sampleData.subsections;
        }

        // Fetch ALL assets for this site
        const { data: assetsData } = await supabase
          .from("site_assets")
          .select("id, meter_serial_number, premises_id, trade_as, breaker_size, ct_ratio, meter_type")
          .eq("site_id", siteData.id)
          .order("premises_id");

        if (assetsData && assetsData.length > 0) {
          setAssets(
            assetsData.map((asset) => ({
              id: asset.id,
              serialNumber: asset.meter_serial_number,
              premisesId: asset.premises_id,
              tradeAs: asset.trade_as,
              breakerSize: asset.breaker_size,
              ctRatio: asset.ct_ratio,
              meterType: asset.meter_type,
            }))
          );
        } else {
          // Use sample assets
          setAssets(generateCompleteSampleAssets());
        }

        // Fetch ALL inspections for this site WITH json_data
        const { data: inspectionsData } = await supabase
          .from("inspections")
          .select(`
            id, title, status, inspector_name, inspection_date, json_data,
            subsections(name),
            inspection_templates(name)
          `)
          .eq("site_id", siteData.id)
          .order("inspection_date", { ascending: false });

        if (inspectionsData && inspectionsData.length > 0) {
          const richInspections: SampleInspection[] = inspectionsData.map((insp) => {
            const jsonData = insp.json_data as Record<string, any> | null;
            
            // Extract lineShops array if present
            let lineShops: LineShopData[] = [];
            if (jsonData?.lineShops && Array.isArray(jsonData.lineShops)) {
              lineShops = jsonData.lineShops.map((shop: any) => ({
                id: shop.id || '',
                shopName: shop.shopName || shop.name || '',
                shopNumber: shop.shopNumber || '',
                meterSerial: shop.meterSerial || '',
                ctRatio: shop.ctRatio || '',
                breakerSize: shop.breakerSize || '',
                cableSize: shop.cableSize || '',
                meterSerialImages: shop.meterSerialImages || {},
                breakerSizeImages: shop.breakerSizeImages || {},
                ctRatioImages: shop.ctRatioImages || {},
              }));
            }

            // Extract findings from various sections
            const findings: Record<string, InspectionFinding> = {};
            if (jsonData) {
              Object.entries(jsonData).forEach(([sectionKey, sectionData]) => {
                if (sectionKey === 'lineShops') return;
                if (typeof sectionData === 'object' && sectionData !== null) {
                  const section = sectionData as Record<string, any>;
                  if (section.status || section.notes || section.images) {
                    findings[sectionKey] = {
                      id: sectionKey,
                      name: sectionKey.replace(/([A-Z])/g, ' $1').trim(),
                      status: section.status,
                      notes: section.notes,
                      referenceStandard: section.referenceStandard,
                      images: section.images,
                    };
                  }
                  Object.entries(section).forEach(([itemKey, itemData]) => {
                    if (typeof itemData === 'object' && itemData !== null) {
                      const item = itemData as Record<string, any>;
                      if (item.status || item.notes || item.images) {
                        findings[`${sectionKey}.${itemKey}`] = {
                          id: itemKey,
                          name: itemKey.replace(/([A-Z])/g, ' $1').trim(),
                          status: item.status,
                          notes: item.notes,
                          referenceStandard: item.referenceStandard,
                          images: item.images,
                        };
                      }
                    }
                  });
                }
              });
            }

            const subsectionData = insp.subsections as any;
            const templateData = insp.inspection_templates as any;

            return {
              id: insp.id,
              title: insp.title || 'Untitled Inspection',
              status: insp.status,
              inspectorName: insp.inspector_name,
              inspectionDate: insp.inspection_date,
              siteName: siteData.name,
              subsectionName: subsectionData?.name,
              templateName: templateData?.name,
              lineShops: lineShops.length > 0 ? lineShops : undefined,
              findings: Object.keys(findings).length > 0 ? findings : undefined,
              jsonData: jsonData || undefined,
            };
          });

          setInspections(richInspections);
        } else {
          // Use sample inspections
          setInspections(generateCompleteSampleInspections(fetchedSite.name));
        }

        // Calculate KPIs from actual data
        const total = subsectionsWithCounts.length;
        const pass = subsectionsWithCounts.filter(s => s.cocStatus === 'Pass').length;
        const missing = subsectionsWithCounts.filter(s => !s.cocStatus || s.cocStatus === 'Missing').length;
        const snagOpen = subsectionsWithCounts.reduce((sum, s) => sum + s.snagCount, 0);

        const { count: totalAssetCount } = await supabase
          .from("site_assets")
          .select("*", { count: "exact", head: true })
          .eq("site_id", siteData.id);

        const { count: totalInspCount } = await supabase
          .from("inspections")
          .select("*", { count: "exact", head: true })
          .eq("site_id", siteData.id);

        const { count: completedInspCount } = await supabase
          .from("inspections")
          .select("*", { count: "exact", head: true })
          .eq("site_id", siteData.id)
          .eq("status", "Completed");

        setKpis({
          totalSubsections: total,
          cocPass: pass,
          cocMissing: missing,
          cocPending: total - pass - missing,
          cocRequired: total,
          complianceRate: total > 0 ? Math.round((pass / total) * 100 * 10) / 10 : 0,
          totalAssets: totalAssetCount || 0,
          totalInspections: totalInspCount || 0,
          completedInspections: completedInspCount || 0,
          snagOpen,
        });

      } catch (err: any) {
        console.error("Error fetching sample data:", err);
        setError(err.message);
        // Fallback to sample data on error
        const sampleData = generateCompleteSampleData();
        setSite(sampleData.site);
        setSubsections(sampleData.subsections);
        setAssets(sampleData.assets);
        setInspections(sampleData.inspections);
        setCocValidations(sampleData.cocValidations);
        setKpis(sampleData.kpis);
      } finally {
        setLoading(false);
      }
    };

    fetchSampleData();
  }, [reportType, referenceSiteId]);

  return {
    site,
    subsections,
    assets,
    inspections,
    cocValidations,
    kpis,
    loading,
    error,
  };
};
