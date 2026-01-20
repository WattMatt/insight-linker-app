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

interface ReportData {
  reportType: 'site-summary' | 'compliance' | 'inspection' | 'floor-plan';
  siteId: string;
  siteName: string;
  siteAddress?: string;
  clientName?: string;
  clientLogoUrl?: string;
  companyLogoUrl?: string;
  accentColor?: string;
  subsections?: SubsectionData[];
  summaryStats?: SummaryStats;
  categoryHealth?: CategoryHealthData[];
  documentsSummary?: DocumentCategoryData[];
  generatedAt?: string;
}

export function useServerPdfGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  const generatePdf = async (data: ReportData): Promise<void> => {
    setIsGenerating(true);
    setProgress(10);

    try {
      setProgress(30);
      toast.info('Generating high-fidelity PDF report...');

      const { data: result, error } = await supabase.functions.invoke('generate-pdf', {
        body: data,
      });

      setProgress(80);

      if (error) {
        console.error('PDF generation error:', error);
        throw new Error(error.message || 'Failed to generate PDF');
      }

      if (!result?.pdf) {
        throw new Error('No PDF data received');
      }

      setProgress(90);

      // Convert base64 to blob and download
      const pdfData = atob(result.pdf);
      const bytes = new Uint8Array(pdfData.length);
      for (let i = 0; i < pdfData.length; i++) {
        bytes[i] = pdfData.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || 'report.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setProgress(100);
      toast.success('PDF report downloaded successfully!');

    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
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
