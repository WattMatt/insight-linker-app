/**
 * PDF Template Gateway Hook
 * 
 * This is the MANDATORY entry point for all PDF report generation.
 * Every report generator MUST use this hook to fetch its template configuration
 * before generating any PDF content.
 * 
 * The template serves as the "gatekeeper" ensuring:
 * 1. Consistent branding across all reports
 * 2. User-configurable section visibility and order
 * 3. Unified accent colors and styling
 * 4. SANS compliance enforcement
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ReportCustomization, ReportSection, DEFAULT_CUSTOMIZATION } from "@/components/pdf-editor/types";

// Report types that have template support
export type TemplateReportType = 
  | 'site_summary' 
  | 'inspection' 
  | 'floor_plan' 
  | 'asset_verification' 
  | 'compliance'
  | 'coc_validation'
  | 'comprehensive_inspection';

export interface PDFTemplateConfig {
  id: string;
  name: string;
  reportType: TemplateReportType;
  customization: ReportCustomization;
  sections: ReportSection[];
  isDefault: boolean;
}

export interface AccentColors {
  primary: string;    // Main accent color hex
  light: string;      // Light background variant
  dark: string;       // Dark text variant
  rgb: string;        // RGB values for opacity use
}

// Accent color palette mapping
const ACCENT_COLOR_PALETTE: Record<string, AccentColors> = {
  blue: {
    primary: '#2563eb',
    light: '#dbeafe',
    dark: '#1e40af',
    rgb: '37, 99, 235',
  },
  green: {
    primary: '#16a34a',
    light: '#dcfce7',
    dark: '#166534',
    rgb: '22, 163, 74',
  },
  orange: {
    primary: '#ea580c',
    light: '#ffedd5',
    dark: '#c2410c',
    rgb: '234, 88, 12',
  },
  red: {
    primary: '#dc2626',
    light: '#fee2e2',
    dark: '#b91c1c',
    rgb: '220, 38, 38',
  },
  purple: {
    primary: '#9333ea',
    light: '#f3e8ff',
    dark: '#7e22ce',
    rgb: '147, 51, 234',
  },
};

// Default template configurations for each report type
const DEFAULT_TEMPLATES: Record<TemplateReportType, { customization: Partial<ReportCustomization>; sections: ReportSection[] }> = {
  site_summary: {
    customization: {
      coverTitle: "Site Summary Report",
      coverSubtitle: "Comprehensive Site Health & Compliance Overview",
      accentColor: "blue",
      includeDate: true,
      includePageNumbers: true,
    },
    sections: [
      { id: "health-metrics", title: "Health Metrics", type: "kpi", enabled: true, order: 0, editable: true },
      { id: "health-by-category", title: "Health by Category", type: "kpi", enabled: true, order: 1, editable: true },
      { id: "summary-statistics", title: "Summary Statistics", type: "table", enabled: true, order: 2, editable: true },
      { id: "subsection-details", title: "Subsection Details", type: "table", enabled: true, order: 3, editable: true },
      { id: "coc-validations", title: "COC Validation Summary", type: "table", enabled: true, order: 4, editable: true },
      { id: "inspections", title: "Recent Inspections", type: "table", enabled: false, order: 5, editable: true },
    ]
  },
  inspection: {
    customization: {
      coverTitle: "Inspection Report",
      coverSubtitle: "Detailed Inspection Findings",
      accentColor: "green",
      includeDate: true,
      includePageNumbers: true,
      includeTableOfContents: true,
    },
    sections: [
      { id: "inspection-details", title: "Inspection Details", type: "table", enabled: true, order: 0, editable: true },
      { id: "findings", title: "Findings", type: "table", enabled: true, order: 1, editable: true },
      { id: "photos", title: "Photo Evidence", type: "table", enabled: true, order: 2, editable: true },
      { id: "signatures", title: "Signatures", type: "table", enabled: true, order: 3, editable: true },
    ]
  },
  floor_plan: {
    customization: {
      coverTitle: "Floor Plan Report",
      coverSubtitle: "Annotation Summary",
      accentColor: "orange",
      includeDate: true,
      includePageNumbers: true,
    },
    sections: [
      { id: "floor-plan-image", title: "Floor Plan", type: "table", enabled: true, order: 0, editable: false },
      { id: "pins-summary", title: "Pins Summary", type: "kpi", enabled: true, order: 1, editable: true },
      { id: "pins-table", title: "Pin Details", type: "table", enabled: true, order: 2, editable: true },
    ]
  },
  asset_verification: {
    customization: {
      coverTitle: "Asset Verification Report",
      coverSubtitle: "Asset Status Overview",
      accentColor: "purple",
      includeDate: true,
      includePageNumbers: true,
    },
    sections: [
      { id: "asset-summary", title: "Asset Summary", type: "kpi", enabled: true, order: 0, editable: true },
      { id: "electrical-meters", title: "Electrical Meters", type: "table", enabled: true, order: 1, editable: true },
      { id: "water-meters", title: "Water Meters", type: "table", enabled: true, order: 2, editable: true },
      { id: "equipment", title: "Equipment", type: "table", enabled: true, order: 3, editable: true },
    ]
  },
  compliance: {
    customization: {
      coverTitle: "Compliance Report",
      coverSubtitle: "Regulatory Compliance Overview",
      accentColor: "blue",
      includeDate: true,
      includePageNumbers: true,
      includeTableOfContents: true,
    },
    sections: [
      { id: "compliance-summary", title: "Compliance Summary", type: "kpi", enabled: true, order: 0, editable: true },
      { id: "coc-status", title: "COC Status by Site", type: "table", enabled: true, order: 1, editable: true },
      { id: "expiring-cocs", title: "Expiring Certificates", type: "table", enabled: true, order: 2, editable: true },
      { id: "non-compliant", title: "Non-Compliant Items", type: "table", enabled: true, order: 3, editable: true },
    ]
  },
  coc_validation: {
    customization: {
      coverTitle: "COC Validation Report",
      coverSubtitle: "Certificate of Compliance Analysis",
      accentColor: "green",
      includeDate: true,
      includePageNumbers: true,
    },
    sections: [
      { id: "validation-status", title: "Validation Status", type: "kpi", enabled: true, order: 0, editable: true },
      { id: "admin-details", title: "Administrative Details", type: "table", enabled: true, order: 1, editable: true },
      { id: "technical-evaluation", title: "Technical Evaluation", type: "table", enabled: true, order: 2, editable: true },
      { id: "check-results", title: "Check Results", type: "table", enabled: true, order: 3, editable: true },
      { id: "critical-failures", title: "Critical Failures", type: "table", enabled: true, order: 4, editable: true },
      { id: "recommendations", title: "Recommendations", type: "text", enabled: true, order: 5, editable: true },
    ]
  },
  comprehensive_inspection: {
    customization: {
      coverTitle: "Comprehensive Inspection Report",
      coverSubtitle: "Full Site Inspection Analysis",
      accentColor: "green",
      includeDate: true,
      includePageNumbers: true,
      includeTableOfContents: true,
    },
    sections: [
      { id: "inspection-details", title: "Inspection Details", type: "table", enabled: true, order: 0, editable: true },
      { id: "findings", title: "Findings", type: "table", enabled: true, order: 1, editable: true },
      { id: "snag-summary", title: "Snag Summary", type: "table", enabled: true, order: 2, editable: true },
      { id: "before-after", title: "Before/After Photos", type: "table", enabled: true, order: 3, editable: true },
      { id: "compliance-checklist", title: "Compliance Checklist", type: "table", enabled: true, order: 4, editable: true },
      { id: "signatures", title: "Sign-off Section", type: "table", enabled: true, order: 5, editable: true },
    ]
  },
};

export interface UsePDFTemplateGatewayResult {
  // Core template data
  template: PDFTemplateConfig | null;
  loading: boolean;
  error: string | null;
  
  // Computed helpers
  customization: ReportCustomization;
  enabledSections: ReportSection[];
  accentColors: AccentColors;
  
  // Utility functions
  isSectionEnabled: (sectionId: string) => boolean;
  getSectionTitle: (sectionId: string) => string;
  getSectionOrder: (sectionId: string) => number;
  getColumnVisibility: (sectionId: string, columnId: string) => boolean;
  getKpiVisibility: (sectionId: string, kpiId: string) => boolean;
  
  // For runtime overrides
  mergeCustomization: (overrides: Partial<ReportCustomization>) => ReportCustomization;
  
  // Refetch if needed
  refetch: () => Promise<void>;
}

/**
 * Main hook for fetching PDF template configuration
 * This MUST be called by every report generator before creating PDF content
 */
export function usePDFTemplateGateway(reportType: TemplateReportType): UsePDFTemplateGatewayResult {
  const [template, setTemplate] = useState<PDFTemplateConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplate = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("pdf_report_templates")
        .select("*")
        .eq("report_type", reportType)
        .eq("is_default", true)
        .single();

      if (fetchError) {
        // If no template found, use defaults - this is not an error
        if (fetchError.code === 'PGRST116') {
          console.log(`No template found for ${reportType}, using defaults`);
          setTemplate(null);
          return;
        }
        throw fetchError;
      }

      // Parse JSON fields
      const parsed: PDFTemplateConfig = {
        id: data.id,
        name: data.name,
        reportType: data.report_type as TemplateReportType,
        isDefault: data.is_default,
        customization: typeof data.customization === 'string'
          ? JSON.parse(data.customization)
          : data.customization,
        sections: typeof data.sections === 'string'
          ? JSON.parse(data.sections)
          : data.sections || [],
      };

      setTemplate(parsed);
    } catch (err: any) {
      console.error("Error fetching PDF template:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [reportType]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  // Get customization with fallback to defaults
  const customization: ReportCustomization = {
    ...DEFAULT_CUSTOMIZATION,
    ...(DEFAULT_TEMPLATES[reportType]?.customization || {}),
    ...(template?.customization || {}),
    sections: template?.sections || DEFAULT_TEMPLATES[reportType]?.sections || [],
  };

  // Get enabled sections sorted by order
  const sections = template?.sections || DEFAULT_TEMPLATES[reportType]?.sections || [];
  const enabledSections = [...sections]
    .filter(s => s.enabled)
    .sort((a, b) => a.order - b.order);

  // Get accent colors
  const accentColors = ACCENT_COLOR_PALETTE[customization.accentColor] || ACCENT_COLOR_PALETTE.blue;

  // Utility functions
  const isSectionEnabled = (sectionId: string): boolean => {
    const section = sections.find(s => s.id === sectionId);
    return section?.enabled ?? true;
  };

  const getSectionTitle = (sectionId: string): string => {
    const section = sections.find(s => s.id === sectionId);
    return section?.title || sectionId;
  };

  const getSectionOrder = (sectionId: string): number => {
    const section = sections.find(s => s.id === sectionId);
    return section?.order ?? 999;
  };

  const getColumnVisibility = (sectionId: string, columnId: string): boolean => {
    const section = sections.find(s => s.id === sectionId);
    const column = section?.columns?.find(c => c.id === columnId);
    return column?.visible ?? true;
  };

  const getKpiVisibility = (sectionId: string, kpiId: string): boolean => {
    const section = sections.find(s => s.id === sectionId);
    const kpi = section?.kpiItems?.find(k => k.id === kpiId);
    return kpi?.visible ?? true;
  };

  const mergeCustomization = (overrides: Partial<ReportCustomization>): ReportCustomization => {
    return {
      ...customization,
      ...overrides,
    };
  };

  return {
    template,
    loading,
    error,
    customization,
    enabledSections,
    accentColors,
    isSectionEnabled,
    getSectionTitle,
    getSectionOrder,
    getColumnVisibility,
    getKpiVisibility,
    mergeCustomization,
    refetch: fetchTemplate,
  };
}

/**
 * Standalone function for fetching template (for non-hook contexts)
 * Use this in async functions that can't use hooks
 */
export async function fetchPDFTemplate(reportType: TemplateReportType): Promise<{
  customization: ReportCustomization;
  sections: ReportSection[];
  accentColors: AccentColors;
}> {
  console.log(`[fetchPDFTemplate] Fetching template for: ${reportType}`);
  
  try {
    const { data, error } = await supabase
      .from("pdf_report_templates")
      .select("*")
      .eq("report_type", reportType)
      .eq("is_default", true)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // Log what was fetched from database
    console.log(`[fetchPDFTemplate] Database result:`, {
      found: !!data,
      templateId: data?.id,
      templateName: data?.name,
      dbSectionsCount: Array.isArray(data?.sections) ? data.sections.length : 0,
    });

    const customization: ReportCustomization = {
      ...DEFAULT_CUSTOMIZATION,
      ...(DEFAULT_TEMPLATES[reportType]?.customization || {}),
      ...(data ? (typeof data.customization === 'string' ? JSON.parse(data.customization) : data.customization) : {}),
      sections: data?.sections || DEFAULT_TEMPLATES[reportType]?.sections || [],
    };

    const sections = data?.sections 
      ? (typeof data.sections === 'string' ? JSON.parse(data.sections) : data.sections)
      : DEFAULT_TEMPLATES[reportType]?.sections || [];

    const accentColors = ACCENT_COLOR_PALETTE[customization.accentColor] || ACCENT_COLOR_PALETTE.blue;

    // Log final merged configuration
    console.log(`[fetchPDFTemplate] Final config:`, {
      accentColor: customization.accentColor,
      coverTitle: customization.coverTitle,
      sectionsCount: sections.length,
      enabledSections: sections.filter((s: ReportSection) => s.enabled).map((s: ReportSection) => s.id),
    });

    return { customization, sections, accentColors };
  } catch (err) {
    console.error("[fetchPDFTemplate] Error fetching PDF template:", err);
    
    // Return defaults on error
    const defaults = DEFAULT_TEMPLATES[reportType] || DEFAULT_TEMPLATES.site_summary;
    const customization: ReportCustomization = {
      ...DEFAULT_CUSTOMIZATION,
      ...defaults.customization,
      sections: defaults.sections,
    };
    
    console.log(`[fetchPDFTemplate] Using defaults due to error`);
    
    return {
      customization,
      sections: defaults.sections,
      accentColors: ACCENT_COLOR_PALETTE.blue,
    };
  }
}

/**
 * Get accent color hex values
 * Utility for use in PDF generators
 */
export function getAccentColorPalette(colorName: string): AccentColors {
  return ACCENT_COLOR_PALETTE[colorName] || ACCENT_COLOR_PALETTE.blue;
}
