import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Building2, Layers, Shield, AlertCircle, CheckCircle, MapPin, Building, User, Mail,
  FileText, TrendingUp, TrendingDown, Minus, Clock, Target, ClipboardCheck, ArrowRight
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Site, SiteStats } from "@/types/site";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SiteOverviewProps {
  site: Site;
  stats: SiteStats | null;
  onTabChange?: (tab: string) => void;
}

interface KPICardProps {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  progress?: number;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  status?: "success" | "warning" | "danger" | "info";
  onClick?: () => void;
  details?: { label: string; value: number | string }[];
}

const KPICard = ({ title, value, subtitle, icon, progress, trend, trendLabel, status = "info", onClick, details }: KPICardProps) => {
  const statusColors = {
    success: "text-green-500",
    warning: "text-orange-500",
    danger: "text-red-500",
    info: "text-blue-500"
  };

  const progressColors = {
    success: "bg-green-500",
    warning: "bg-orange-500",
    danger: "bg-red-500",
    info: "bg-blue-500"
  };

  return (
    <Card 
      className={cn(
        "glass-card border-none transition-all duration-300",
        onClick && "cursor-pointer hover:shadow-lg hover:scale-[1.02] hover:border-primary/20"
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={statusColors[status]}>{icon}</div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight">{value}</span>
          {trend && (
            <div className={cn(
              "flex items-center text-xs font-medium",
              trend === "up" && "text-green-500",
              trend === "down" && "text-red-500",
              trend === "neutral" && "text-muted-foreground"
            )}>
              {trend === "up" && <TrendingUp className="h-3 w-3 mr-0.5" />}
              {trend === "down" && <TrendingDown className="h-3 w-3 mr-0.5" />}
              {trend === "neutral" && <Minus className="h-3 w-3 mr-0.5" />}
              {trendLabel}
            </div>
          )}
        </div>
        
        {progress !== undefined && (
          <div className="space-y-1">
            <Progress value={progress} className="h-2" />
          </div>
        )}
        
        <p className="text-xs text-muted-foreground">{subtitle}</p>

        {details && details.length > 0 && (
          <div className="pt-2 border-t space-y-1">
            {details.map((detail, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{detail.label}</span>
                <span className="font-medium">{detail.value}</span>
              </div>
            ))}
          </div>
        )}

        {onClick && (
          <div className="flex items-center text-xs text-primary font-medium pt-1">
            View details <ArrowRight className="h-3 w-3 ml-1" />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export function SiteOverview({ site, stats, onTabChange }: SiteOverviewProps) {
  // Fetch additional metrics
  const { data: extendedStats } = useQuery({
    queryKey: ["site-extended-stats", site.id],
    queryFn: async () => {
      // Get subsection IDs for this site
      const { data: subsections } = await supabase
        .from("subsections")
        .select("id")
        .eq("site_id", site.id);
      
      const subsectionIds = subsections?.map(s => s.id) || [];
      
      // Get documents count
      const { count: siteDocsCount } = await supabase
        .from("site_documents")
        .select("*", { count: "exact", head: true })
        .eq("site_id", site.id);
      
      let subsectionDocsCount = 0;
      if (subsectionIds.length > 0) {
        const { count } = await supabase
          .from("subsection_documents")
          .select("*", { count: "exact", head: true })
          .in("subsection_id", subsectionIds);
        subsectionDocsCount = count || 0;
      }
      
      // Get floor plan pins count
      let floorPlanStats = { total: 0, open: 0, closed: 0 };
      if (subsectionIds.length > 0) {
        const { data: floorPlans } = await supabase
          .from("subsection_floor_plans")
          .select("id")
          .in("subsection_id", subsectionIds);
        
        if (floorPlans && floorPlans.length > 0) {
          const floorPlanIds = floorPlans.map(fp => fp.id);
          const { data: pins } = await supabase
            .from("floor_plan_pins")
            .select("status")
            .in("floor_plan_id", floorPlanIds);
          
          floorPlanStats.total = pins?.length || 0;
          floorPlanStats.open = pins?.filter(p => p.status === "open" || p.status === "in_progress").length || 0;
          floorPlanStats.closed = pins?.filter(p => p.status === "closed" || p.status === "finished").length || 0;
        }
      }
      
      // Get inspections
      const { data: inspections } = await supabase
        .from("inspections")
        .select("id, status, inspection_date")
        .eq("site_id", site.id);
      
      const completedInspections = inspections?.filter(i => i.status === "Completed" || i.status === "Done").length || 0;
      const pendingInspections = inspections?.filter(i => i.status === "Pending" || i.status === "Scheduled").length || 0;
      
      // Get snag breakdown
      let snagStats = { critical: 0, high: 0, medium: 0, low: 0, rectified: 0, total: 0 };
      if (subsectionIds.length > 0) {
        const { data: snags } = await supabase
          .from("snags")
          .select("status, risk_level")
          .in("subsection_id", subsectionIds);
        
        snagStats.total = snags?.length || 0;
        snagStats.rectified = snags?.filter(s => s.status === "rectified" || s.status === "Rectified").length || 0;
        snagStats.critical = snags?.filter(s => s.risk_level === "Critical" && s.status !== "rectified" && s.status !== "Rectified").length || 0;
        snagStats.high = snags?.filter(s => s.risk_level === "High" && s.status !== "rectified" && s.status !== "Rectified").length || 0;
        snagStats.medium = snags?.filter(s => (s.risk_level === "Medium" || !s.risk_level) && s.status !== "rectified" && s.status !== "Rectified").length || 0;
        snagStats.low = snags?.filter(s => s.risk_level === "Low" && s.status !== "rectified" && s.status !== "Rectified").length || 0;
      }

      // Get metering breakdown
      const { data: subsectionDetails } = await supabase
        .from("subsections")
        .select("metering_status, meter_serial_number, coc_status, is_coc_required")
        .eq("site_id", site.id);

      const meteringInstalled = subsectionDetails?.filter(s => 
        s.metering_status === "Installed" || s.meter_serial_number
      ).length || 0;
      const meteringPending = subsectionDetails?.filter(s => 
        s.metering_status === "Pending" || (!s.meter_serial_number && s.metering_status !== "Not Required")
      ).length || 0;
      
      return {
        totalDocs: (siteDocsCount || 0) + subsectionDocsCount,
        siteDocsCount: siteDocsCount || 0,
        subsectionDocsCount,
        floorPlanStats,
        inspections: {
          total: inspections?.length || 0,
          completed: completedInspections,
          pending: pendingInspections
        },
        snagStats,
        metering: {
          installed: meteringInstalled,
          pending: meteringPending,
          total: subsectionDetails?.length || 0
        }
      };
    },
    staleTime: 30000 // Cache for 30 seconds
  });

  if (!stats) return null;

  const cocComplianceRate = stats.cocRequiredCount > 0
    ? Math.round((stats.cocApprovedCount / stats.cocRequiredCount) * 100)
    : 100;

  const siteHealthRate = stats.totalSubsections > 0
    ? Math.round((stats.compliantCount / stats.totalSubsections) * 100)
    : 100;

  const snagResolutionRate = extendedStats?.snagStats.total 
    ? Math.round((extendedStats.snagStats.rectified / extendedStats.snagStats.total) * 100)
    : 100;

  const getHealthStatus = (rate: number) => {
    if (rate >= 80) return "success";
    if (rate >= 50) return "warning";
    return "danger";
  };

  const openSnags = stats.openSnags;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Primary KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Site Health"
          value={`${siteHealthRate}%`}
          subtitle={`${stats.compliantCount} of ${stats.totalSubsections} fully compliant`}
          icon={<CheckCircle className="h-5 w-5" />}
          progress={siteHealthRate}
          status={getHealthStatus(siteHealthRate)}
          onClick={onTabChange ? () => onTabChange("compliance") : undefined}
          details={[
            { label: "Compliant", value: stats.compliantCount },
            { label: "Non-compliant", value: stats.totalSubsections - stats.compliantCount }
          ]}
        />

        <KPICard
          title="COC Compliance"
          value={`${cocComplianceRate}%`}
          subtitle={`${stats.cocApprovedCount} of ${stats.cocRequiredCount} approved`}
          icon={<Shield className="h-5 w-5" />}
          progress={cocComplianceRate}
          status={getHealthStatus(cocComplianceRate)}
          onClick={onTabChange ? () => onTabChange("subsections") : undefined}
          details={[
            { label: "Approved", value: stats.cocApprovedCount },
            { label: "Pending", value: stats.cocRequiredCount - stats.cocApprovedCount }
          ]}
        />

        <KPICard
          title="Open Snags"
          value={openSnags}
          subtitle="Issues requiring attention"
          icon={<AlertCircle className="h-5 w-5" />}
          status={openSnags === 0 ? "success" : openSnags > 10 ? "danger" : "warning"}
          onClick={onTabChange ? () => onTabChange("subsections") : undefined}
          details={extendedStats ? [
            { label: "Critical/High", value: (extendedStats.snagStats.critical + extendedStats.snagStats.high) },
            { label: "Rectified", value: extendedStats.snagStats.rectified }
          ] : undefined}
        />

        <KPICard
          title="Subsections"
          value={stats.totalSubsections}
          subtitle="Total registered locations"
          icon={<Layers className="h-5 w-5" />}
          status="info"
          onClick={onTabChange ? () => onTabChange("subsections") : undefined}
          details={extendedStats ? [
            { label: "Metered", value: extendedStats.metering.installed },
            { label: "Pending Meter", value: extendedStats.metering.pending }
          ] : undefined}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Documents"
          value={extendedStats?.totalDocs || 0}
          subtitle="Total files uploaded"
          icon={<FileText className="h-5 w-5" />}
          status="info"
          onClick={onTabChange ? () => onTabChange("documents") : undefined}
          details={extendedStats ? [
            { label: "Site-Level", value: extendedStats.siteDocsCount },
            { label: "Subsection", value: extendedStats.subsectionDocsCount }
          ] : undefined}
        />

        <KPICard
          title="Inspections"
          value={extendedStats?.inspections.total || 0}
          subtitle="Total inspections recorded"
          icon={<ClipboardCheck className="h-5 w-5" />}
          status={extendedStats?.inspections.pending ? "warning" : "success"}
          details={extendedStats ? [
            { label: "Completed", value: extendedStats.inspections.completed },
            { label: "Pending", value: extendedStats.inspections.pending }
          ] : undefined}
        />

        <KPICard
          title="Floor Plan Items"
          value={extendedStats?.floorPlanStats.total || 0}
          subtitle="Marked annotations"
          icon={<Target className="h-5 w-5" />}
          status={extendedStats?.floorPlanStats.open === 0 ? "success" : "warning"}
          progress={extendedStats?.floorPlanStats.total 
            ? Math.round((extendedStats.floorPlanStats.closed / extendedStats.floorPlanStats.total) * 100)
            : 100}
          details={extendedStats ? [
            { label: "Open/In Progress", value: extendedStats.floorPlanStats.open },
            { label: "Closed", value: extendedStats.floorPlanStats.closed }
          ] : undefined}
        />

        <KPICard
          title="Snag Resolution"
          value={`${snagResolutionRate}%`}
          subtitle="Issues resolved"
          icon={<TrendingUp className="h-5 w-5" />}
          progress={snagResolutionRate}
          status={getHealthStatus(snagResolutionRate)}
          details={extendedStats ? [
            { label: "Total Snags", value: extendedStats.snagStats.total },
            { label: "Rectified", value: extendedStats.snagStats.rectified }
          ] : undefined}
        />
      </div>

      {/* Site Info Cards */}
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
