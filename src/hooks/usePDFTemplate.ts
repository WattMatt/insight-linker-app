import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ReportCustomization, ReportSection, DEFAULT_CUSTOMIZATION } from "@/components/pdf-editor/types";

interface PDFTemplate {
  id: string;
  name: string;
  report_type: string;
  customization: ReportCustomization;
  sections: ReportSection[];
}

type ReportType = 'site_summary' | 'inspection' | 'floor_plan' | 'asset_verification' | 'compliance';

export const usePDFTemplate = (reportType: ReportType) => {
  const [template, setTemplate] = useState<PDFTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTemplate = async () => {
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
          // If no template found, use defaults
          if (fetchError.code === 'PGRST116') {
            setTemplate(null);
            return;
          }
          throw fetchError;
        }

        // Parse JSON fields if needed
        const parsed: PDFTemplate = {
          ...data,
          customization: typeof data.customization === 'string'
            ? JSON.parse(data.customization)
            : data.customization,
          sections: typeof data.sections === 'string'
            ? JSON.parse(data.sections)
            : data.sections
        };

        setTemplate(parsed);
      } catch (err: any) {
        console.error("Error fetching PDF template:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplate();
  }, [reportType]);

  // Merge template customization with runtime overrides
  const getCustomization = (overrides?: Partial<ReportCustomization>): ReportCustomization => {
    const base = template?.customization || DEFAULT_CUSTOMIZATION;
    const sections = template?.sections || [];
    
    return {
      ...base,
      sections,
      ...overrides
    };
  };

  return {
    template,
    loading,
    error,
    getCustomization,
    sections: template?.sections || []
  };
};

export type { PDFTemplate, ReportType };
