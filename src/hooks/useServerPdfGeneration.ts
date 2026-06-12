import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SubsectionData {
  id: string;
  name: string;
  tenantName?: string;
  category?: string;
  cocStatus?: string;
  cocNumber?: string;
  cocType?: string;
  cocIssueDate?: string;
  meterSerialNumber?: string;
  ctRatio?: string;
  breakerSize?: string;
  isCompliant?: boolean;
  qrCodeUrl?: string;
  snags?: Array<{
    id: string;
    title: string;
    status: string;
    riskLevel?: string;
    description?: string;
  }>;
}

interface SummaryStats {
  totalSubsections: number;
  compliantCount: number;
  nonCompliantCount: number;
  pendingCount: number;
  cocValidCount: number;
  cocExpiredCount: number;
  cocMissingCount: number;
  cocRequired?: number;
  meteringInstalled?: number;
  openSnagsCount: number;
  resolvedSnagsCount: number;
}

interface CategoryHealthData {
  category: string;
  abbreviation: string;
  percentage: number;
}

interface DocumentCategoryData {
  category: string;
  count: number;
}

interface HealthMetrics {
  overallHealth: number;
  cocCompliance: number;
  meteringData: number;
  snagFree: number;
}

interface AssetVerificationData {
  totalAssets: number;
  verified: number;
  discrepancies: number;
  pending: number;
}

interface FortressChecklistData {
  completed: number;
  pending: number;
  notApplicable: number;
}

interface COCAnnexData {
  subsectionId: string;
  subsectionName: string;
  tenantName?: string;
  category?: string;
  cocNumber?: string;
  cocType?: string;
  cocIssueDate?: string;
  status: string;
  validatedAt: string;
  violations?: any;
  reportData?: any;
}

interface ReportData {
  reportType: 'site-summary' | 'compliance' | 'inspection' | 'floor-plan';
  siteId: string;
  siteName: string;
  siteAddress?: string;
  clientName?: string;
  clientLogoUrl?: string;
  companyLogoUrl?: string;
  accentColor?: string;
  qrBaseUrl?: string;
  subsections?: SubsectionData[];
  summaryStats?: SummaryStats;
  healthMetrics?: HealthMetrics;
  categoryHealth?: CategoryHealthData[];
  documentsSummary?: DocumentCategoryData[];
  assetVerification?: AssetVerificationData;
  fortressChecklist?: FortressChecklistData;
  generatedAt?: string;
  enabledSections?: Record<string, boolean>;
  cocAnnexes?: COCAnnexData[];
  cocHierarchy?: CocHierarchyGroup[];
}

export interface CocHierarchyGroup {
  subsectionName: string;
  tenantName?: string | null;
  rollup: 'Pass' | 'Fail' | 'Pending' | 'Missing';
  rows: { type: string; number: string; issue: string; expiry: string; verdict: string }[];
}

export function useServerPdfGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  const generatePdf = async (data: ReportData): Promise<{ url: string; filename: string } | null> => {
    setIsGenerating(true);
    setProgress(10);

    try {
      setProgress(30);
      toast.info('Generating report and saving to storage...');

      const { data: result, error } = await supabase.functions.invoke('generate-pdf', {
        body: data,
      });

      setProgress(80);

      if (error) {
        console.error('PDF generation error:', error);
        throw new Error(error.message || 'Failed to generate PDF');
      }

      if (!result?.url) {
        throw new Error('No storage URL received');
      }

      setProgress(100);
      toast.success('Report saved successfully!');

      return {
        url: result.url,
        filename: result.filename,
      };

    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    } finally {
      setIsGenerating(false);
      setProgress(0);
    }
  };

  return {
    generatePdf,
    isGenerating,
    progress,
  };
}
