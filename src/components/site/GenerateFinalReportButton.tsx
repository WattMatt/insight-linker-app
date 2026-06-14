import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Sparkles } from 'lucide-react';
import { useServerPdfGeneration } from '@/hooks/useServerPdfGeneration';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { completeDownloadHandoff, createPendingDownloadHandoff } from '@/lib/downloadHandoff';
import { downloadFile } from '@/lib/fileDownload';
import { getCategoryAbbreviation } from '@/lib/subsectionCategories';
import { hasValidCocStatus } from '@/lib/complianceCalculations';
import { siteGrade } from '@/lib/siteHealth';
import { toCocDoc, groupCocDocuments, cocDocFails } from '@/lib/cocHierarchy';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ReportSection } from './ReportSettingsDialog';

// A snag is closed/terminal if its status (case-insensitive) is rectified or closed.
const TERMINAL_SNAG_STATUSES = ['rectified', 'closed'];
const isSnagOpen = (status: string | null | undefined): boolean =>
  !TERMINAL_SNAG_STATUSES.includes((status || '').toLowerCase());

interface SiteData {
  id: string;
  name: string;
  address?: string;
  client?: {
    name?: string;
    logo_url?: string;
  };
}

interface GenerateFinalReportButtonProps {
  site: SiteData;
  companyLogoUrl?: string;
  accentColor?: string;
  reportSections?: ReportSection[];
  onReportSaved?: () => void;
}

export function GenerateFinalReportButton({
  site,
  companyLogoUrl,
  accentColor = '#2563eb',
  reportSections,
  onReportSaved,
}: GenerateFinalReportButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [previewStats, setPreviewStats] = useState<{
    subsectionCount: number;
    complianceRate: number;
  } | null>(null);
  const { generatePdf, isGenerating, progress } = useServerPdfGeneration();

  // Calculate subsection compliance (matching pdfmake version logic)
  const calculateSubsectionCompliance = (
    subsection: any,
    snags: any[]
  ): boolean => {
    if (subsection.is_coc_required && 
        !['Approved', 'Valid', 'Pass'].includes(subsection.coc_status || '')) {
      return false;
    }
    if (subsection.is_coc_required && 
        subsection.metering_status === 'Missing' && 
        !subsection.meter_serial_number) {
      return false;
    }
    const subsectionSnags = snags.filter(snag =>
      snag.subsection_id === subsection.id &&
      isSnagOpen(snag.status)
    );
    if (subsectionSnags.length > 0) {
      return false;
    }
    return true;
  };

  // Fetch all comprehensive data for the report
  const fetchComprehensiveData = async () => {
    setLoadingData(true);
    try {
      // Fetch subsections first to get IDs
      const { data: subsections, error: subsError } = await supabase
        .from('subsections')
        .select(`
          id, name, tenant_name, category, coc_status, coc_number, coc_type,
          coc_issue_date, meter_serial_number, ct_ratio, is_compliant,
          is_coc_required, metering_status, qr_code_url
        `)
        .eq('site_id', site.id)
        .order('category', { ascending: true });

      if (subsError) throw subsError;
      const subs = subsections || [];
      const subsectionIds = subs.map(s => s.id);

      // Fetch all additional data in parallel
      const [
        snagsRes,
        settingsRes,
        assetsRes,
        checklistRes,
        siteDocsRes,
        subsectionDocsRes,
        inspectionsRes,
      ] = await Promise.all([
        subsectionIds.length > 0
          ? supabase.from('snags').select('id, subsection_id, title, status, risk_level, description').in('subsection_id', subsectionIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('settings').select('qr_base_url, company_logo_url, primary_color').single(),
        supabase.from('site_assets').select('id, meter_serial_number, ct_ratio, breaker_size, premises_id, trade_as, asset_category').eq('site_id', site.id).eq('asset_category', 'electrical_meter'),
        supabase.from('site_marking_checklist').select('section_name, is_checked, status').eq('site_id', site.id),
        supabase.from('site_documents').select('id, file_name, category, site_document_categories(name)').eq('site_id', site.id),
        subsectionIds.length > 0
          ? supabase.from('subsection_documents').select('id, subsection_id, file_name, file_url, coc_number, coc_issue_date, coc_expiry_date, coc_type, coc_status, category_id, document_categories(name)').in('subsection_id', subsectionIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('inspections').select('id, json_data, subsection_id, status').eq('site_id', site.id),
      ]);

      const allSnags = snagsRes.data || [];
      const settings = settingsRes.data;
      const assets = assetsRes.data || [];
      const checklist = checklistRes.data || [];
      const siteDocs = siteDocsRes.data || [];
      const subDocs = subsectionDocsRes.data || [];
      const inspections = inspectionsRes.data || [];
      const qrBaseUrl = settings?.qr_base_url || (typeof window !== 'undefined' ? window.location.origin : 'https://insight-linker-app.vercel.app');

      // Transform subsections with full data
      const transformedSubsections = subs.map(sub => {
        const subSnags = allSnags.filter(s => s.subsection_id === sub.id);
        const openSnags = subSnags.filter(s => isSnagOpen(s.status));
        
        // Find matching asset for breaker size
        const subNameNorm = sub.name?.toLowerCase().trim() || '';
        const matchingAsset = assets.find(a => {
          const premisesNorm = a.premises_id?.toLowerCase().trim() || '';
          const tradeAsNorm = a.trade_as?.toLowerCase().trim() || '';
          return premisesNorm === subNameNorm || 
                 premisesNorm.endsWith(` - ${subNameNorm}`) ||
                 tradeAsNorm === subNameNorm ||
                 tradeAsNorm.endsWith(` - ${subNameNorm}`);
        });

        // COC verdict is the subsection's manual coc_status
        const validationStatus = sub.coc_status || null;

        return {
          id: sub.id,
          name: sub.name,
          tenantName: sub.tenant_name,
          category: sub.category,
          cocStatus: sub.coc_status,
          cocNumber: sub.coc_number,
          cocType: sub.coc_type,
          cocIssueDate: sub.coc_issue_date,
          meterSerialNumber: sub.meter_serial_number,
          ctRatio: sub.ct_ratio,
          breakerSize: matchingAsset?.breaker_size || null,
          isCompliant: calculateSubsectionCompliance(sub, allSnags),
          qrCodeUrl: sub.qr_code_url || `${qrBaseUrl}/public/subsections/${sub.id}`,
          validationStatus, // Include latest validation status
          snags: openSnags.map(sn => ({
            id: sn.id,
            title: sn.title,
            status: sn.status,
            riskLevel: sn.risk_level,
            description: sn.description,
          })),
        };
      });

      // Calculate summary stats from the manual coc_status verdict
      const cocRequired = subs.filter(s => s.is_coc_required).length;

      // Count compliant based on the manual coc_status verdict
      const cocValidCount = subs.filter(s => hasValidCocStatus(s.coc_status)).length;
      
      const meteringInstalled = subs.filter(s => s.meter_serial_number).length;
      const openSnagsTotal = allSnags.filter(s => isSnagOpen(s.status)).length;
      const compliantCount = transformedSubsections.filter(s => s.isCompliant === true).length;

      const summaryStats = {
        totalSubsections: subs.length,
        compliantCount,
        nonCompliantCount: subs.length - compliantCount,
        pendingCount: 0,
        cocValidCount,
        cocExpiredCount: subs.filter(s => s.coc_status?.toLowerCase().includes('expired')).length,
        cocMissingCount: subs.filter(s => !s.coc_status || s.coc_status.toLowerCase() === 'missing').length,
        cocRequired,
        meteringInstalled,
        openSnagsCount: openSnagsTotal,
        resolvedSnagsCount: allSnags.filter(s => !isSnagOpen(s.status)).length,
      };

      // Calculate category health
      const categoryGroups: Record<string, { total: number; compliant: number }> = {};
      transformedSubsections.forEach(sub => {
        const cat = sub.category || 'Uncategorized';
        if (!categoryGroups[cat]) {
          categoryGroups[cat] = { total: 0, compliant: 0 };
        }
        categoryGroups[cat].total++;
        if (sub.isCompliant) categoryGroups[cat].compliant++;
      });

      const categoryHealth = Object.entries(categoryGroups).map(([category, data]) => ({
        category,
        abbreviation: getCategoryAbbreviation(category),
        percentage: Math.round((data.compliant / Math.max(data.total, 1)) * 100),
      }));

      // Calculate documents summary
      const docCategoryMap: Record<string, number> = {};
      siteDocs.forEach(doc => {
        const catName = (doc.site_document_categories as any)?.name || doc.category || 'Uncategorized';
        docCategoryMap[catName] = (docCategoryMap[catName] || 0) + 1;
      });
      subDocs.forEach(doc => {
        const catName = (doc.document_categories as any)?.name || 'Uncategorized';
        docCategoryMap[catName] = (docCategoryMap[catName] || 0) + 1;
      });

      const documentsSummary = Object.entries(docCategoryMap).map(([category, count]) => ({
        category,
        count,
      }));

      // Calculate asset verification with schedule
      // Use the SAME matching logic as AssetVerification.tsx / AssetComparisonTable.tsx
      // Match by METER SERIAL NUMBER - this is the source of truth
      
      // Helper to normalize meter serial for consistent matching
      const normalizeMeterSerial = (serial: string | null | undefined): string => {
        if (!serial) return '';
        const normalized = serial.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
        if (normalized === 'NA' || normalized === 'TBC') return '';
        return normalized;
      };
      
      // Build a map of normalized meter serial -> tenant inspection data (same as AssetVerification)
      const inspectionMeterMatches = new Map<string, {
        meterSerialNumber: string;
        ctSizeAndRatio?: string;
        breakerSize?: string;
      }>();
      
      inspections.forEach(insp => {
        const jsonData = insp.json_data as any;
        if (jsonData?.tenants && Array.isArray(jsonData.tenants)) {
          jsonData.tenants.forEach((tenant: any) => {
            const tenantSerial = tenant.meterSerialNumber || '';
            if (!tenantSerial) return;
            
            const normalizedSerial = normalizeMeterSerial(tenantSerial);
            if (!normalizedSerial) return;
            
            // Only keep first match (consistent with UI behavior)
            if (!inspectionMeterMatches.has(normalizedSerial)) {
              inspectionMeterMatches.set(normalizedSerial, {
                meterSerialNumber: tenantSerial,
                ctSizeAndRatio: tenant.ctSizeAndRatio,
                breakerSize: tenant.breakerSize,
              });
            }
          });
        }
      });
      
      const assetSchedule = assets.map(asset => {
        const normalizedAssetSerial = normalizeMeterSerial(asset.meter_serial_number);
        
        // Match by meter serial number - this is the same logic as AssetComparisonTable
        const inspectionMatch = normalizedAssetSerial 
          ? inspectionMeterMatches.get(normalizedAssetSerial) || null
          : null;
        
        let status: 'verified' | 'discrepancy' | 'pending' = 'pending';
        let inspectedSerial = '-';
        let inspectedBreaker = '-';
        
        if (inspectionMatch) {
          inspectedSerial = inspectionMatch.meterSerialNumber || '-';
          inspectedBreaker = inspectionMatch.breakerSize || '-';
          
          // Check for discrepancies (CT ratio or breaker mismatch)
          const ctMatch = inspectionMatch.ctSizeAndRatio && asset.ct_ratio
            ? inspectionMatch.ctSizeAndRatio.replace(/\s/g, '').toLowerCase() === asset.ct_ratio.replace(/\s/g, '').toLowerCase()
            : true; // No discrepancy if one is missing
          const breakerMatch = inspectionMatch.breakerSize && asset.breaker_size
            ? inspectionMatch.breakerSize.replace(/\s/g, '').toLowerCase() === asset.breaker_size.replace(/\s/g, '').toLowerCase()
            : true; // No discrepancy if one is missing
          
          const hasDiscrepancy = !ctMatch || !breakerMatch;
          status = hasDiscrepancy ? 'discrepancy' : 'verified';
        }
        
        return {
          premisesId: asset.premises_id || asset.trade_as || '-',
          meterSerial: asset.meter_serial_number || '-',
          breakerSize: asset.breaker_size || '-',
          ctRatio: asset.ct_ratio || '-',
          inspectedSerial,
          inspectedBreaker,
          status,
        };
      });

      // Count statuses manually to avoid TypeScript narrowing issues
      let verifiedCount = 0;
      let discrepancyCount = 0;
      let pendingCount = 0;
      assetSchedule.forEach(a => {
        if (a.status === 'verified') verifiedCount++;
        else if (a.status === 'discrepancy') discrepancyCount++;
        else pendingCount++;
      });

      const assetVerification = {
        totalAssets: assets.length,
        verified: verifiedCount,
        discrepancies: discrepancyCount,
        pending: pendingCount,
        schedule: assetSchedule,
      };

      // Calculate fortress checklist with section breakdown
      const sectionGroups: Record<string, { total: number; completed: number }> = {};
      checklist.forEach(item => {
        const section = item.section_name || 'General';
        if (!sectionGroups[section]) {
          sectionGroups[section] = { total: 0, completed: 0 };
        }
        sectionGroups[section].total++;
        if (item.is_checked === true || item.status === 'completed') {
          sectionGroups[section].completed++;
        }
      });
      
      const completed = checklist.filter(c => c.is_checked === true || c.status === 'completed').length;
      const pending = checklist.filter(c => c.is_checked === false && c.status !== 'n/a').length;
      const notApplicable = checklist.filter(c => c.status === 'n/a').length;
      
      const fortressChecklist = {
        completed,
        pending,
        notApplicable,
        sections: Object.entries(sectionGroups).map(([name, data]) => ({
          name,
          progress: Math.round((data.completed / Math.max(data.total, 1)) * 100),
        })),
      };

      // Calculate health metrics. overallHealth is the unified siteHealth number
      // (siteHealth.ts) so the report matches on-screen Site Health.
      const healthSubs = subs.map(s => ({ id: s.id, metering_status: s.metering_status, meter_serial_number: s.meter_serial_number }));
      const healthSnagInputs = allSnags.map(s => ({ subsection_id: s.subsection_id, status: s.status, risk_level: s.risk_level }));
      const healthInspectionInputs = inspections.map(i => ({ subsection_id: i.subsection_id, status: i.status }));
      // Gate the overall grade: an un-worked site reports "Not graded" (-1 sentinel, honoured by the
      // generate-pdf edge function) rather than an inflated score.
      const grade = siteGrade(healthSubs, healthSnagInputs, healthInspectionInputs);
      const healthMetrics = {
        overallHealth: grade.score ?? -1,
        cocCompliance: Math.round((cocValidCount / Math.max(cocRequired || subs.length, 1)) * 100),
        meteringData: Math.round((meteringInstalled / Math.max(subs.length, 1)) * 100),
        snagFree: Math.round(((subs.length - Math.min(openSnagsTotal, subs.length)) / Math.max(subs.length, 1)) * 100),
      };

      // Per-document COC hierarchy (Initial + supplementaries) grouped by DB/tenant.
      const cocToday = new Date().toISOString().slice(0, 10);
      const isCocCert = (name?: string | null) => {
        const n = (name || '').toLowerCase();
        return n.includes('coc') && !n.includes('validation') && !n.includes('report');
      };
      const cocHierarchy = subs.map((sub) => {
        const docs = subDocs
          .filter((d: any) => d.subsection_id === sub.id && isCocCert(d.document_categories?.name))
          .map((d: any) => toCocDoc(d));
        const g = groupCocDocuments(docs, cocToday);
        const ordered = [g.initial, ...g.supplementaries].filter(Boolean) as ReturnType<typeof toCocDoc>[];
        return {
          subsectionName: sub.name || 'Unknown',
          tenantName: sub.tenant_name || null,
          rollup: g.rollup,
          rows: ordered.map((d, i) => ({
            type: i === 0 ? 'Initial' : d.cocType,
            number: d.cocNumber || '—',
            issue: d.cocIssueDate || '—',
            expiry: d.cocExpiryDate || '—',
            verdict: cocDocFails(d, cocToday) ? 'Fail' : d.cocStatus,
          })),
        };
      });

      return {
        subsections: transformedSubsections,
        summaryStats,
        healthMetrics,
        categoryHealth,
        documentsSummary,
        assetVerification,
        fortressChecklist,
        cocHierarchy,
        companyLogoUrl: companyLogoUrl || settings?.company_logo_url,
        accentColor: accentColor || settings?.primary_color || '#2563eb',
      };
    } finally {
      setLoadingData(false);
    }
  };

  const handleOpenDialog = async () => {
    setShowDialog(true);
    try {
      const data = await fetchComprehensiveData();
      setPreviewStats({
        subsectionCount: data.subsections.length,
        complianceRate: data.healthMetrics.overallHealth,
      });
    } catch (error) {
      console.error('Error loading preview data:', error);
      toast.error('Failed to load report data');
    }
  };

  const handleGenerate = async () => {
    const pendingDownload = createPendingDownloadHandoff();

    try {
      const data = await fetchComprehensiveData();
      
      // Get QR base URL from settings
      const { data: settings } = await supabase
        .from('settings')
        .select('qr_base_url')
        .single();
      const qrBaseUrl = settings?.qr_base_url || (typeof window !== 'undefined' ? window.location.origin : 'https://insight-linker-app.vercel.app');

      // Build enabled sections map from reportSections
      const enabledSections: Record<string, boolean> = {};
      reportSections?.forEach(section => {
        enabledSections[section.id] = section.enabled;
      });

      // If COC Annexes are enabled, derive annex rows from each subsection's manual coc_status verdict
      let cocAnnexes: any[] = [];
      if (enabledSections['coc-annexes']) {
        cocAnnexes = data.subsections.map((s: any) => ({
          subsectionId: s.id,
          subsectionName: s.name || 'Unknown',
          tenantName: s.tenantName,
          category: s.category,
          cocNumber: s.cocNumber,
          cocType: s.cocType,
          cocIssueDate: s.cocIssueDate,
          status: s.cocStatus || 'Missing',
          validatedAt: '',
          violations: undefined,
          reportData: undefined,
        }));
      }

      const result = await generatePdf({
        reportType: 'site-summary',
        siteId: site.id,
        siteName: site.name,
        siteAddress: site.address,
        clientName: site.client?.name,
        clientLogoUrl: site.client?.logo_url,
        companyLogoUrl: data.companyLogoUrl,
        accentColor: data.accentColor,
        qrBaseUrl,
        subsections: data.subsections,
        summaryStats: data.summaryStats,
        healthMetrics: data.healthMetrics,
        categoryHealth: data.categoryHealth,
        documentsSummary: data.documentsSummary,
        assetVerification: data.assetVerification,
        fortressChecklist: data.fortressChecklist,
        generatedAt: new Date().toLocaleDateString('en-ZA'),
        enabledSections,
        cocAnnexes: cocAnnexes.length > 0 ? cocAnnexes : undefined,
        cocHierarchy: data.cocHierarchy,
      });

      if (result) {
        if (pendingDownload) {
          await completeDownloadHandoff(pendingDownload, {
            fileName: result.filename,
            url: result.url,
          });
        } else {
          await downloadFile(result.url, result.filename);
        }
      }

      setShowDialog(false);

      // Trigger callback to refresh report list
      if (result && onReportSaved) {
        onReportSaved();
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const isBusy = isGenerating || loadingData;

  return (
    <>
      <Button
        onClick={handleOpenDialog}
        className="gap-2"
        variant="default"
      >
        <Sparkles className="h-4 w-4" />
        Generate Final Report
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Generate Final Report
            </DialogTitle>
            <DialogDescription>
              Generate a high-fidelity PDF report using server-side rendering for pixel-perfect output.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Site:</span>
                <span className="font-medium">{site.name}</span>
              </div>
              {previewStats ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subsections:</span>
                    <span className="font-medium">{previewStats.subsectionCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Overall Health:</span>
                    <span className={`font-medium ${previewStats.complianceRate < 0 ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {previewStats.complianceRate < 0 ? 'Not graded' : `${previewStats.complianceRate}%`}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {isGenerating && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-center text-muted-foreground">
                  {progress < 30 ? 'Preparing data...' :
                   progress < 80 ? 'Generating PDF...' :
                   progress < 100 ? 'Finalizing...' : 'Complete!'}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={isBusy || !previewStats}
              className="gap-2"
            >
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {loadingData ? 'Loading...' : 'Generating...'}
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Generate PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
