import React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings, FileText, BarChart3, Table, ListChecks } from "lucide-react";

export interface ReportSection {
    id: string;
    title: string;
    description: string;
    enabled: boolean;
    icon: React.ReactNode;
}

interface ReportSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sections: ReportSection[];
    onSectionToggle: (sectionId: string, enabled: boolean) => void;
}

export const ReportSettingsDialog: React.FC<ReportSettingsDialogProps> = ({
    open,
    onOpenChange,
    sections,
    onSectionToggle,
}) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Report Settings
                    </DialogTitle>
                    <DialogDescription>
                        Select which sections to include in your generated reports
                    </DialogDescription>
                </DialogHeader>
                
                <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-4 py-4">
                        {sections.map((section) => (
                            <div
                                key={section.id}
                                className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 text-muted-foreground">
                                        {section.icon}
                                    </div>
                                    <div className="space-y-1">
                                        <Label 
                                            htmlFor={section.id} 
                                            className="text-sm font-medium cursor-pointer"
                                        >
                                            {section.title}
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            {section.description}
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    id={section.id}
                                    checked={section.enabled}
                                    onCheckedChange={(checked) => onSectionToggle(section.id, checked)}
                                />
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};

// Default sections configuration
export const getDefaultReportSections = (): ReportSection[] => [
    {
        id: "cover",
        title: "Cover Page",
        description: "Title page with site details and branding",
        enabled: true,
        icon: <FileText className="h-4 w-4" />,
    },
    {
        id: "executive-summary",
        title: "Executive Summary",
        description: "Overview of key findings and recommendations",
        enabled: true,
        icon: <FileText className="h-4 w-4" />,
    },
    {
        id: "health-overview",
        title: "Health Overview",
        description: "KPI cards showing compliance percentages",
        enabled: true,
        icon: <BarChart3 className="h-4 w-4" />,
    },
    {
        id: "health-metrics",
        title: "Health Metrics",
        description: "Detailed health metrics breakdown",
        enabled: true,
        icon: <BarChart3 className="h-4 w-4" />,
    },
    {
        id: "category-breakdown",
        title: "Health by Category",
        description: "Compliance status grouped by category",
        enabled: true,
        icon: <BarChart3 className="h-4 w-4" />,
    },
    {
        id: "summary-statistics",
        title: "Summary Statistics",
        description: "Key statistics table",
        enabled: true,
        icon: <Table className="h-4 w-4" />,
    },
    {
        id: "subsection-details",
        title: "Subsection Details",
        description: "Detailed list of all subsections",
        enabled: true,
        icon: <Table className="h-4 w-4" />,
    },
    {
        id: "coc-annexes",
        title: "COC Verification Annexes",
        description: "Certificate of Compliance validation results",
        enabled: true,
        icon: <ListChecks className="h-4 w-4" />,
    },
];
