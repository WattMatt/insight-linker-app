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
  complianceRate: number;
  totalAssets: number;
  totalInspections: number;
  completedInspections: number;
}

export interface SampleReportData {
  site: SampleSite | null;
  subsections: SampleSubsection[];
  assets: SampleAsset[];
  inspections: SampleInspection[];
  kpis: SampleKPIs;
  loading: boolean;
  error: string | null;
}

type ReportType = 'site_summary' | 'inspection' | 'floor_plan' | 'asset_verification' | 'compliance';

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
  const [kpis, setKpis] = useState<SampleKPIs>({
    totalSubsections: 0,
    cocPass: 0,
    cocMissing: 0,
    cocPending: 0,
    complianceRate: 0,
    totalAssets: 0,
    totalInspections: 0,
    completedInspections: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSampleData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch site with client info - use reference site if provided
        let query = supabase
          .from("sites")
          .select(`
            id,
            name,
            address,
            site_image_url,
            client_logo_url,
            clients!inner(name, logo_url)
          `);

        if (referenceSiteId) {
          query = query.eq("id", referenceSiteId);
        }
        
        const { data: siteData, error: siteError } = await query.limit(1).single();

        if (siteError && siteError.code !== 'PGRST116') {
          console.error("Error fetching site:", siteError);
        }

        if (siteData) {
          const clientData = siteData.clients as any;
          setSite({
            id: siteData.id,
            name: siteData.name,
            clientName: clientData?.name || "Sample Client",
            address: siteData.address,
            logoUrl: siteData.site_image_url,
            clientLogoUrl: clientData?.logo_url || siteData.client_logo_url,
          });

          // Fetch subsections for this site
          const { data: subsectionsData } = await supabase
            .from("subsections")
            .select("id, name, tenant_name, category, coc_status")
            .eq("site_id", siteData.id)
            .limit(5);

          if (subsectionsData) {
            // Get document counts for each subsection
            const subsectionsWithCounts = await Promise.all(
              subsectionsData.map(async (sub) => {
                const { count } = await supabase
                  .from("subsection_documents")
                  .select("*", { count: "exact", head: true })
                  .eq("subsection_id", sub.id);

                return {
                  id: sub.id,
                  name: sub.name,
                  tenantName: sub.tenant_name,
                  category: sub.category,
                  cocStatus: sub.coc_status,
                  documentCount: count || 0,
                };
              })
            );
            setSubsections(subsectionsWithCounts);
          }

          // Fetch assets for this site
          const { data: assetsData } = await supabase
            .from("site_assets")
            .select("id, meter_serial_number, premises_id, trade_as, breaker_size, ct_ratio, meter_type")
            .eq("site_id", siteData.id)
            .limit(5);

          if (assetsData) {
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
          }

          // Fetch inspections for this site - WITH json_data for rich content
          const { data: inspectionsData } = await supabase
            .from("inspections")
            .select(`
              id, title, status, inspector_name, inspection_date, json_data,
              subsections(name),
              inspection_templates(name)
            `)
            .eq("site_id", siteData.id)
            .not("json_data", "is", null)
            .order("updated_at", { ascending: false })
            .limit(10);

          if (inspectionsData) {
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

              // Extract findings from various sections in json_data
              const findings: Record<string, InspectionFinding> = {};
              if (jsonData) {
                Object.entries(jsonData).forEach(([sectionKey, sectionData]) => {
                  if (sectionKey === 'lineShops') return; // Skip, handled above
                  if (typeof sectionData === 'object' && sectionData !== null) {
                    // Check if it's a section with items (has status/notes/images)
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
                    // Check nested items
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

            // Filter to inspections that actually have data
            const inspectionsWithData = richInspections.filter(
              i => (i.lineShops && i.lineShops.length > 0) || (i.findings && Object.keys(i.findings).length > 0)
            );

            setInspections(inspectionsWithData.length > 0 ? inspectionsWithData : richInspections.slice(0, 5));
          }

          // Calculate KPIs
          const { count: totalSubs } = await supabase
            .from("subsections")
            .select("*", { count: "exact", head: true })
            .eq("site_id", siteData.id);

          const { count: passCount } = await supabase
            .from("subsections")
            .select("*", { count: "exact", head: true })
            .eq("site_id", siteData.id)
            .eq("coc_status", "Pass");

          const { count: missingCount } = await supabase
            .from("subsections")
            .select("*", { count: "exact", head: true })
            .eq("site_id", siteData.id)
            .or("coc_status.is.null,coc_status.eq.Missing");

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

          const total = totalSubs || 0;
          const pass = passCount || 0;
          const missing = missingCount || 0;

          setKpis({
            totalSubsections: total,
            cocPass: pass,
            cocMissing: missing,
            cocPending: total - pass - missing,
            complianceRate: total > 0 ? Math.round((pass / total) * 100 * 10) / 10 : 0,
            totalAssets: totalAssetCount || 0,
            totalInspections: totalInspCount || 0,
            completedInspections: completedInspCount || 0,
          });
        }
      } catch (err: any) {
        console.error("Error fetching sample data:", err);
        setError(err.message);
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
    kpis,
    loading,
    error,
  };
};
