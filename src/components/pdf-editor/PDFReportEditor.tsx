import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Layers,
  Settings,
  Eye,
  Download,
  Loader2,
  Check,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { CoverPageEditor } from "./CoverPageEditor";
import { SectionToggle } from "./SectionToggle";
import { SectionEditor } from "./SectionEditor";
import { ReportOptionsPanel } from "./ReportOptionsPanel";
import {
  ReportCustomization,
  ReportSection,
  DEFAULT_CUSTOMIZATION,
} from "./types";

interface PDFReportEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteName: string;
  clientName: string;
  reportType: "site-summary" | "asset-verification" | "inspection";
  initialSections: ReportSection[];
  onGenerate: (customization: ReportCustomization) => Promise<void>;
  onPreview?: (customization: ReportCustomization) => Promise<string>;
}

export const PDFReportEditor: React.FC<PDFReportEditorProps> = ({
  open,
  onOpenChange,
  siteName,
  clientName,
  reportType,
  initialSections,
  onGenerate,
  onPreview,
}) => {
  const [customization, setCustomization] = useState<ReportCustomization>({
    ...DEFAULT_CUSTOMIZATION,
    coverTitle: getDefaultTitle(reportType),
    coverSubtitle: getDefaultSubtitle(reportType),
    sections: initialSections,
  });
  
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setCustomization({
        ...DEFAULT_CUSTOMIZATION,
        coverTitle: getDefaultTitle(reportType),
        coverSubtitle: getDefaultSubtitle(reportType),
        sections: initialSections,
      });
      setEditingSection(null);
      setHasChanges(false);
    }
  }, [open, reportType, initialSections]);

  const updateCustomization = useCallback((updates: Partial<ReportCustomization>) => {
    setCustomization((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  }, []);

  const handleSectionToggle = useCallback((id: string, enabled: boolean) => {
    setCustomization((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === id ? { ...s, enabled } : s
      ),
    }));
    setHasChanges(true);
  }, []);

  const handleSectionMove = useCallback((id: string, direction: "up" | "down") => {
    setCustomization((prev) => {
      const sections = [...prev.sections];
      const index = sections.findIndex((s) => s.id === id);
      if (index === -1) return prev;

      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= sections.length) return prev;

      // Swap order values
      const temp = sections[index].order;
      sections[index].order = sections[newIndex].order;
      sections[newIndex].order = temp;

      // Swap positions
      [sections[index], sections[newIndex]] = [sections[newIndex], sections[index]];

      return { ...prev, sections };
    });
    setHasChanges(true);
  }, []);

  const handleSectionUpdate = useCallback(
    (sectionId: string, updates: Partial<ReportSection>) => {
      setCustomization((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, ...updates } : s
        ),
      }));
      setHasChanges(true);
    },
    []
  );

  const handleReset = useCallback(() => {
    setCustomization({
      ...DEFAULT_CUSTOMIZATION,
      coverTitle: getDefaultTitle(reportType),
      coverSubtitle: getDefaultSubtitle(reportType),
      sections: initialSections,
    });
    setEditingSection(null);
    setHasChanges(false);
    toast.info("Reset to defaults");
  }, [reportType, initialSections]);

  const handlePreview = useCallback(async () => {
    if (!onPreview) return;
    
    setPreviewing(true);
    try {
      await onPreview(customization);
    } catch (error) {
      toast.error("Failed to generate preview");
    } finally {
      setPreviewing(false);
    }
  }, [customization, onPreview]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      await onGenerate(customization);
      toast.success("Report generated successfully");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  }, [customization, onGenerate, onOpenChange]);

  const sortedSections = [...customization.sections].sort(
    (a, b) => a.order - b.order
  );
  const enabledCount = customization.sections.filter((s) => s.enabled).length;
  const currentEditingSection = editingSection
    ? customization.sections.find((s) => s.id === editingSection)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Customize Report
              </DialogTitle>
              <DialogDescription>
                Edit content, toggle sections, and customize before generating
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Badge variant="outline" className="bg-primary/10">
                  Unsaved changes
                </Badge>
              )}
              <Badge variant="secondary">
                {enabledCount} of {customization.sections.length} sections
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <Separator className="mt-4" />

        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="sections" className="h-full flex flex-col">
            <div className="px-6 pt-2">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="cover" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Cover Page
                </TabsTrigger>
                <TabsTrigger value="sections" className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Sections
                </TabsTrigger>
                <TabsTrigger value="options" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Options
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1 p-6 pt-4" style={{ maxHeight: "calc(90vh - 250px)" }}>
              <TabsContent value="cover" className="m-0">
                <CoverPageEditor
                  customization={customization}
                  onChange={updateCustomization}
                  siteName={siteName}
                  clientName={clientName}
                />
              </TabsContent>

              <TabsContent value="sections" className="m-0 space-y-3">
                {currentEditingSection ? (
                  <SectionEditor
                    section={currentEditingSection}
                    onUpdate={handleSectionUpdate}
                    onClose={() => setEditingSection(null)}
                  />
                ) : (
                  sortedSections.map((section, index) => (
                    <SectionToggle
                      key={section.id}
                      section={section}
                      onToggle={handleSectionToggle}
                      onMoveUp={() => handleSectionMove(section.id, "up")}
                      onMoveDown={() => handleSectionMove(section.id, "down")}
                      onEdit={
                        section.editable
                          ? () => setEditingSection(section.id)
                          : undefined
                      }
                      canMoveUp={index > 0}
                      canMoveDown={index < sortedSections.length - 1}
                      isEditing={editingSection === section.id}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="options" className="m-0">
                <ReportOptionsPanel
                  customization={customization}
                  onChange={updateCustomization}
                />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>

        <Separator />

        <div className="p-6 pt-4 flex items-center justify-between">
          <Button variant="outline" onClick={handleReset} disabled={!hasChanges}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>

          <div className="flex items-center gap-2">
            {onPreview && (
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={previewing || generating}
              >
                {previewing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                Preview
              </Button>
            )}
            <Button onClick={handleGenerate} disabled={generating || previewing}>
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Generate PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

function getDefaultTitle(reportType: string): string {
  switch (reportType) {
    case "site-summary":
      return "Site Summary Report";
    case "asset-verification":
      return "Asset Verification Report";
    case "inspection":
      return "Inspection Report";
    default:
      return "Report";
  }
}

function getDefaultSubtitle(reportType: string): string {
  switch (reportType) {
    case "site-summary":
      return "Comprehensive Site Health & Compliance Overview";
    case "asset-verification":
      return "Asset Register vs Inspection Data Verification";
    case "inspection":
      return "Detailed Inspection Findings";
    default:
      return "";
  }
}
