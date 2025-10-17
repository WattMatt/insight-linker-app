import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { TemplateBuilder } from "@/components/TemplateBuilder";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TemplateBuilderPage = () => {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const [loading, setLoading] = useState(!!templateId);
  const [templateData, setTemplateData] = useState<any>(null);

  useEffect(() => {
    if (templateId) {
      fetchTemplate();
    }
  }, [templateId]);

  const fetchTemplate = async () => {
    try {
      const { data, error } = await supabase
        .from("inspection_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (error) throw error;

      // Convert database sections format to builder format
      const sections = data.sections
        ? Object.entries(data.sections).map(([sectionId, sectionData]: [string, any]) => ({
            id: sectionId,
            name: sectionData.name,
            order_index: sectionData.order_index || 0,
            items: sectionData.items
              ? Object.entries(sectionData.items).map(([itemId, itemData]: [string, any]) => ({
                  id: itemId,
                  name: itemData.name,
                  type: itemData.type || "text",
                  required: itemData.required || false,
                  options: itemData.options,
                }))
              : [],
          }))
        : [];

      setTemplateData({
        name: data.name,
        category: data.category,
        description: data.description || "",
        sections,
        tenants: (data as any).tenants || [],
      });
    } catch (error) {
      console.error("Error fetching template:", error);
      toast.error("Failed to load template");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    navigate("/inspection-templates");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading template...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/inspection-templates")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Templates
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {templateId ? "Edit Template" : "Create New Template"}
        </h1>
        <p className="text-muted-foreground mt-2">
          {templateId
            ? "Modify the template structure, fields, and sections"
            : "Build a custom inspection template with your own sections and fields"}
        </p>
      </div>

      <TemplateBuilder
        templateId={templateId}
        initialData={templateData}
        onSave={handleSave}
      />
    </div>
  );
};

export default TemplateBuilderPage;
