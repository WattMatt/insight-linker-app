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
import { Separator } from "@/components/ui/separator";
import { 
    Settings, 
    FileText, 
    BarChart3, 
    Table, 
    ListChecks, 
    Image, 
    MapPin, 
    QrCode, 
    FileCheck, 
    AlertTriangle,
    Gauge,
    Building2
} from "lucide-react";

export interface ReportSection {
    id: string;
    title: string;
    description: string;
    enabled: boolean;
    icon: React.ReactNode;
    category?: 'cover' | 'overview' | 'details' | 'annexes';
}

interface ReportSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sections: ReportSection[];
    onSectionToggle: (sectionId: string, enabled: boolean) => void;
}

const categoryLabels: Record<string, string> = {
    cover: 'Cover Page Elements',
    overview: 'Overview & Metrics',
    details: 'Subsection Details',
    annexes: 'Annexes & Appendices',
};

export const ReportSettingsDialog: React.FC<ReportSettingsDialogProps> = ({
    open,
    onOpenChange,
    sections,
    onSectionToggle,
}) => {
    // Group sections by category
    const groupedSections = sections.reduce((acc, section) => {
        const cat = section.category || 'overview';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(section);
        return acc;
    }, {} as Record<string, ReportSection[]>);

    const categoryOrder = ['cover', 'overview', 'details', 'annexes'];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Report Settings
                    </DialogTitle>
                    <DialogDescription>
                        Configure which sections to include in your Site Overview Report
                    </DialogDescription>
                </DialogHeader>
                
                <ScrollArea className="max-h-[65vh] pr-4">
                    <div className="space-y-6 py-4">
                        {categoryOrder.map((category) => {
                            const categorySections = groupedSections[category];
                            if (!categorySections?.length) return null;
                            
                            return (
                                <div key={category}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <h3 className="text-sm font-semibold text-foreground">
                                            {categoryLabels[category]}
                                        </h3>
                                        <Separator className="flex-1" />
                                    </div>
                                    <div className="space-y-3">
                                        {categorySections.map((section) => (
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
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};

// Default sections configuration based on SITE_SUMMARY_REPORT_REVIEW.md
export const getDefaultReportSections = (): ReportSection[] => [
    // Cover Page Elements
    {
        id: "cover",
        title: "Cover Page",
        description: "Title page with site name, report type, and generation date",
        enabled: true,
        icon: <FileText className="h-4 w-4" />,
        category: 'cover',
    },
    {
        id: "client-logo",
        title: "Client Logo",
        description: "Display client logo on cover page (max 40x20mm)",
        enabled: true,
        icon: <Building2 className="h-4 w-4" />,
        category: 'cover',
    },
    {
        id: "site-image",
        title: "Site Image",
        description: "Hero image of the site on cover page",
        enabled: true,
        icon: <Image className="h-4 w-4" />,
        category: 'cover',
    },
    {
        id: "site-address",
        title: "Site Address",
        description: "Physical address and location details",
        enabled: true,
        icon: <MapPin className="h-4 w-4" />,
        category: 'cover',
    },
    {
        id: "prepared-by",
        title: "Prepared By/For",
        description: "Attribution for report authorship and recipient",
        enabled: true,
        icon: <FileText className="h-4 w-4" />,
        category: 'cover',
    },
    {
        id: "confidentiality",
        title: "Confidentiality Notice",
        description: "Legal confidentiality disclaimer on all pages",
        enabled: true,
        icon: <FileCheck className="h-4 w-4" />,
        category: 'cover',
    },
    
    // Overview & Metrics
    {
        id: "executive-summary",
        title: "Executive Summary",
        description: "Overview of key findings and recommendations",
        enabled: true,
        icon: <FileText className="h-4 w-4" />,
        category: 'overview',
    },
    {
        id: "health-metrics",
        title: "Health Metrics KPIs",
        description: "Overall health, COC compliance, metering, and snag-free percentages",
        enabled: true,
        icon: <Gauge className="h-4 w-4" />,
        category: 'overview',
    },
    {
        id: "category-breakdown",
        title: "Health by Category",
        description: "Compliance status cards grouped by category with color coding",
        enabled: true,
        icon: <BarChart3 className="h-4 w-4" />,
        category: 'overview',
    },
    {
        id: "summary-statistics",
        title: "Summary Statistics",
        description: "Key statistics table (subsection count, COC status, snags)",
        enabled: true,
        icon: <Table className="h-4 w-4" />,
        category: 'overview',
    },
    
    // Subsection Details
    {
        id: "subsection-table",
        title: "Subsection Details Table",
        description: "Comprehensive table listing all subsections with status",
        enabled: true,
        icon: <Table className="h-4 w-4" />,
        category: 'details',
    },
    {
        id: "subsection-qr-codes",
        title: "Subsection QR Codes",
        description: "Include QR code for each subsection in detail cards",
        enabled: true,
        icon: <QrCode className="h-4 w-4" />,
        category: 'details',
    },
    {
        id: "metering-details",
        title: "Metering Details",
        description: "Meter serial numbers and CT ratios per subsection",
        enabled: true,
        icon: <Gauge className="h-4 w-4" />,
        category: 'details',
    },
    {
        id: "snag-summary",
        title: "Snag Summary",
        description: "Outstanding snags and issues per subsection",
        enabled: true,
        icon: <AlertTriangle className="h-4 w-4" />,
        category: 'details',
    },
    
    // Annexes & Appendices
    {
        id: "coc-validation-summary",
        title: "COC Validation Summary",
        description: "Summary table of all COC validation results",
        enabled: true,
        icon: <ListChecks className="h-4 w-4" />,
        category: 'annexes',
    },
    {
        id: "coc-annexes",
        title: "COC Verification Annexes",
        description: "Detailed Certificate of Compliance validation reports",
        enabled: false,
        icon: <FileCheck className="h-4 w-4" />,
        category: 'annexes',
    },
];
