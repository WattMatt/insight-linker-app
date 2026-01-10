import React, { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteSummaryReport } from "@/components/SiteSummaryReport";
import { PDFReportEditor, ReportCustomization, ReportSection } from "@/components/pdf-editor";
import { Site } from "@/types/site";
import { FileText, Sparkles, Download } from "lucide-react";

interface SiteExportProps {
    site: Site;
}

// Define default sections for Site Summary Report
const createDefaultSections = (): ReportSection[] => [
    {
        id: "cover",
        title: "Cover Page",
        type: "text",
        enabled: true,
        order: 1,
        editable: false,
    },
    {
        id: "executive-summary",
        title: "Executive Summary",
        type: "summary",
        enabled: true,
        order: 2,
        editable: true,
        data: { content: "" },
    },
    {
        id: "health-overview",
        title: "Health Overview",
        type: "kpi",
        enabled: true,
        order: 3,
        editable: false,
    },
    {
        id: "health-metrics",
        title: "Health Metrics",
        type: "chart",
        enabled: true,
        order: 4,
        editable: false,
    },
    {
        id: "category-breakdown",
        title: "Health by Category",
        type: "chart",
        enabled: true,
        order: 5,
        editable: false,
    },
    {
        id: "summary-statistics",
        title: "Summary Statistics",
        type: "table",
        enabled: true,
        order: 6,
        editable: true,
        data: {
            columns: ["Metric", "Value"],
            rows: [],
        },
    },
    {
        id: "subsection-details",
        title: "Subsection Details",
        type: "table",
        enabled: true,
        order: 7,
        editable: false,
    },
    {
        id: "coc-annexes",
        title: "COC Verification Annexes",
        type: "table",
        enabled: true,
        order: 8,
        editable: false,
    },
];

export const SiteExport: React.FC<SiteExportProps> = ({ site }) => {
    const [editorOpen, setEditorOpen] = useState(false);
    
    const defaultSections = useMemo(() => createDefaultSections(), []);

    const handleGenerateWithCustomization = async (customization: ReportCustomization) => {
        // This will be passed to SiteSummaryReport or called directly
        // For now, we'll close the editor and let the existing generation handle it
        console.log("Generating with customization:", customization);
        setEditorOpen(false);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Export Report
                </CardTitle>
                <CardDescription>{site.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Generate comprehensive site reports with all subsection data
                </p>
                
                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Quick Generate - existing functionality */}
                    <div className="flex-1">
                        <SiteSummaryReport
                            siteId={site.id}
                            siteName={site.name}
                            clientName={site.clients.name}
                        />
                    </div>
                    
                    {/* Customize & Generate */}
                    <Button
                        variant="outline"
                        className="flex items-center gap-2"
                        onClick={() => setEditorOpen(true)}
                    >
                        <Sparkles className="h-4 w-4" />
                        Customize Report
                    </Button>
                </div>
                
                <PDFReportEditor
                    open={editorOpen}
                    onOpenChange={setEditorOpen}
                    siteName={site.name}
                    clientName={site.clients.name}
                    reportType="site-summary"
                    initialSections={defaultSections}
                    onGenerate={handleGenerateWithCustomization}
                />
            </CardContent>
        </Card>
    );
};
