import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Building2, Layers, Shield, AlertCircle, CheckCircle, MapPin, Building, User, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Site, SiteStats } from "@/types/site";

interface SiteOverviewProps {
    site: Site;
    stats: SiteStats | null;
}

export function SiteOverview({ site, stats }: SiteOverviewProps) {
    if (!stats) return null;

    const cocComplianceRate = stats.cocRequiredCount > 0
        ? Math.round((stats.cocApprovedCount / stats.cocRequiredCount) * 100)
        : 100;

    const siteHealthRate = stats.totalSubsections > 0
        ? Math.round((stats.compliantCount / stats.totalSubsections) * 100)
        : 100;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="glass-card border-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Site Health</CardTitle>
                        <CheckCircle className={`h-4 w-4 ${siteHealthRate === 100 ? 'text-green-500' : 'text-orange-500'}`} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{siteHealthRate}%</div>
                        <Progress value={siteHealthRate} className="mt-2 h-2" />
                        <p className="text-xs text-muted-foreground mt-1">
                            {stats.compliantCount} of {stats.totalSubsections} compliant
                        </p>
                    </CardContent>
                </Card>

                <Card className="glass-card border-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">COC Compliance</CardTitle>
                        <Shield className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{cocComplianceRate}%</div>
                        <Progress value={cocComplianceRate} className="mt-2 h-2" />
                        <p className="text-xs text-muted-foreground mt-1">
                            {stats.cocApprovedCount} of {stats.cocRequiredCount} approved
                        </p>
                    </CardContent>
                </Card>

                <Card className="glass-card border-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Open Snags</CardTitle>
                        <AlertCircle className={`h-4 w-4 ${stats.openSnags > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.openSnags}</div>
                        <p className="text-xs text-muted-foreground">Across all subsections</p>
                    </CardContent>
                </Card>

                <Card className="glass-card border-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Subsections</CardTitle>
                        <Layers className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalSubsections}</div>
                        <p className="text-xs text-muted-foreground">Total registered</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="glass-card border-none">
                    <CardHeader>
                        <CardTitle>Site Information</CardTitle>
                        <CardDescription>General details about the location</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-start gap-3">
                            <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium">Address</p>
                                <p className="text-sm text-muted-foreground">{site.address || "No address provided"}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Building className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium">Site Type</p>
                                <p className="text-sm text-muted-foreground">{site.site_type || "N/A"}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass-card border-none">
                    <CardHeader>
                        <CardTitle>Consultant Details</CardTitle>
                        <CardDescription>Contact information for the site consultant</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-start gap-3">
                            <User className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium">Name</p>
                                <p className="text-sm text-muted-foreground">
                                    {site.consultant_name || "N/A"}
                                    {site.consultant_company ? ` (${site.consultant_company})` : ""}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Mail className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium">Contact</p>
                                <p className="text-sm text-muted-foreground">{site.consultant_contact || "N/A"}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
