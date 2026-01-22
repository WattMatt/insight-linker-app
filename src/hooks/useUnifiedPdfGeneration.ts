import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ============================================================================
// REPORT TYPE DEFINITIONS
// ============================================================================

export type ReportType = 
  | 'site-summary' 
  | 'coc-validation' 
  | 'inspection' 
  | 'site-drawing' 
  | 'fortress-checklist' 
  | 'calendar'
  | 'inspection-template';

// ============================================================================
// DATA INTERFACES
// ============================================================================

interface BaseReportData {
  reportType: ReportType;
  title: string;
  subtitle?: string;
  siteName?: string;
  siteId?: string;
  subsectionId?: string;
  clientName?: string;
  clientLogoUrl?: string;
  companyLogoUrl?: string;
  accentColor?: string;
  generatedAt?: string;
}

// COC Validation Report Data
export interface COCValidationReportData extends BaseReportData {
  reportType: 'coc-validation';
  cocNumber?: string;
  cocType?: string;
  evaluationDate?: string;
  overallStatus: string;
  installationSummary?: string;
  overallAssessment?: string;
  checks?: Array<{
    checkId: string;
    clause: string;
    description: string;
    result: string;
    measuredValue: string;
    limit: string;
    category: string;
  }>;
  criticalFailures?: Array<{
    category: string;
    clause: string;
    description: string;
    reason: string;
  }>;
  administrativeDetails?: {
    physicalAddress?: string;
    registeredPerson?: string;
    registrationNumber?: string;
    registrationType?: string;
  };
  technicalEvaluation?: Array<{
    section: string;
    requirement: string;
    finding: string;
    status: string;
  }>;
  recommendations?: string[];
}

// Inspection Report Data
export interface InspectionReportData extends BaseReportData {
  reportType: 'inspection';
  inspectionId: string;
  templateName?: string;
  inspectorName?: string;
  inspectionDate?: string;
  status?: string;
  qualityRating?: number;
  generalInfo?: Record<string, any>;
  sections?: Array<{
    title: string;
    items: Array<{
      label: string;
      value: string | boolean | number;
      type?: string;
    }>;
  }>;
  snags?: Array<{
    title: string;
    description?: string;
    status: string;
    riskLevel?: string;
  }>;
  signatures?: Array<{
    name: string;
    role?: string;
    signatureUrl?: string;
    signedAt?: string;
  }>;
}

// Site Drawing Report Data
export interface SiteDrawingReportData extends BaseReportData {
  reportType: 'site-drawing';
  subsectionName: string;
  pdfUrl?: string;
  drawingImageBase64?: string;
  pins: Array<{
    id: string;
    number: number;
    x: number;
    y: number;
    title: string;
    description: string;
    images?: Array<{ url: string; name: string }>;
  }>;
  generalInfo?: Record<string, any>;
}

// Fortress Checklist Report Data
export interface FortressChecklistReportData extends BaseReportData {
  reportType: 'fortress-checklist';
  overallProgress: number;
  sections: Array<{
    name: string;
    progress: number;
    items: Array<{
      id: string;
      label: string;
      isChecked: boolean;
      isNotApplicable: boolean;
      checkedAt?: string;
    }>;
  }>;
  stats: {
    completed: number;
    pending: number;
    notApplicable: number;
    total: number;
  };
}

// Calendar Report Data
export interface CalendarReportData extends BaseReportData {
  reportType: 'calendar';
  year: number;
  events: Array<{
    id: string;
    title: string;
    siteName?: string;
    startDate: string;
    endDate?: string;
    status: string;
    priority?: string;
    eventType?: string;
  }>;
  stats: {
    totalEvents: number;
    upcomingCount: number;
    completedCount: number;
    pendingCount: number;
  };
}

// Inspection Template Report Data
export interface InspectionTemplateReportData extends BaseReportData {
  reportType: 'inspection-template';
  templateName: string;
  category?: string;
  description?: string;
  sections: Array<{
    title: string;
    items: Array<{
      label: string;
      type: string;
      required?: boolean;
      options?: string[];
    }>;
  }>;
}

// Union type for all report data
export type UnifiedReportData = 
  | COCValidationReportData
  | InspectionReportData
  | SiteDrawingReportData
  | FortressChecklistReportData
  | CalendarReportData
  | InspectionTemplateReportData
  | (BaseReportData & { reportType: 'site-summary'; [key: string]: any });

// ============================================================================
// RESULT INTERFACE
// ============================================================================

interface GenerationResult {
  success: boolean;
  url?: string;
  filename?: string;
  blob?: Blob;
  error?: string;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useUnifiedPdfGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  const generatePdf = async (data: UnifiedReportData): Promise<GenerationResult> => {
    setIsGenerating(true);
    setProgress(10);

    try {
      setProgress(30);
      toast.info(`Generating ${getReportTypeName(data.reportType)} report...`);

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
      toast.success('Report generated successfully!');

      return {
        success: true,
        url: result.url,
        filename: result.filename,
      };

    } catch (error) {
      console.error('PDF generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`PDF generation failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsGenerating(false);
      setProgress(0);
    }
  };

  // Helper to generate and get blob for preview
  const generatePdfForPreview = async (data: UnifiedReportData): Promise<GenerationResult> => {
    setIsGenerating(true);
    setProgress(10);

    try {
      setProgress(30);

      const { data: result, error } = await supabase.functions.invoke('generate-pdf', {
        body: { ...data, returnBlob: true },
      });

      setProgress(80);

      if (error) {
        throw new Error(error.message || 'Failed to generate PDF');
      }

      // If we have a URL, fetch the blob for preview
      if (result?.url) {
        const response = await fetch(result.url);
        const blob = await response.blob();
        
        setProgress(100);
        
        return {
          success: true,
          url: result.url,
          filename: result.filename,
          blob,
        };
      }

      throw new Error('No URL received from generation');

    } catch (error) {
      console.error('PDF preview generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsGenerating(false);
      setProgress(0);
    }
  };

  return {
    generatePdf,
    generatePdfForPreview,
    isGenerating,
    progress,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getReportTypeName(reportType: ReportType): string {
  const names: Record<ReportType, string> = {
    'site-summary': 'Site Summary',
    'coc-validation': 'COC Validation',
    'inspection': 'Inspection',
    'site-drawing': 'Site Drawing',
    'fortress-checklist': 'Fortress Checklist',
    'calendar': 'Calendar',
    'inspection-template': 'Inspection Template',
  };
  return names[reportType] || 'Report';
}

// Helper to get report category name for saving
export function getReportCategory(reportType: ReportType): string {
  const categories: Record<ReportType, string> = {
    'site-summary': 'Site Summary Reports',
    'coc-validation': 'COC Validation Reports',
    'inspection': 'Inspection Reports',
    'site-drawing': 'Site Drawing Reports',
    'fortress-checklist': 'Marking Checklists',
    'calendar': 'Calendar Reports',
    'inspection-template': 'Inspection Templates',
  };
  return categories[reportType] || 'Generated Reports';
}
