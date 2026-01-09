import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteSummaryReport } from "@/components/SiteSummaryReport";
import { Site } from "@/types/site";

interface SiteExportProps {
    site: Site;
}

export const SiteExport: React.FC<SiteExportProps> = ({ site }) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Export Report</CardTitle>
                <CardDescription>{site.name}</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                    Generate comprehensive site reports with all subsection data
                </p>
                <SiteSummaryReport
                    siteId={site.id}
                    siteName={site.name}
                    clientName={site.clients.name}
                />
            </CardContent>
        </Card>
    );
};
