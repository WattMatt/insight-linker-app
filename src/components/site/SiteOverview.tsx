import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Layers, Shield, AlertCircle, CheckCircle, MapPin, Building, User, Mail,
  FileText, TrendingUp, TrendingDown, Minus, Target, ClipboardCheck, ArrowRight,
  Sparkles
} from "lucide-react";
import { Site, SiteStats } from "@/types/site";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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
  status?: "success" | "warning" | "danger" | "info" | "purple";
  onClick?: () => void;
  details?: { label: string; value: number | string }[];
  delay?: number;
}

const KPICard = ({ title, value, subtitle, icon, progress, trend, trendLabel, status = "info", onClick, details, delay = 0 }: KPICardProps) => {
  const statusConfig = {
    success: {
      gradient: "from-emerald-500/10 via-emerald-500/5 to-transparent",
      iconBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      progressBar: "bg-emerald-500",
      border: "hover:border-emerald-500/30",
      glow: "group-hover:shadow-emerald-500/10"
    },
    warning: {
      gradient: "from-amber-500/10 via-amber-500/5 to-transparent",
      iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      progressBar: "bg-amber-500",
      border: "hover:border-amber-500/30",
      glow: "group-hover:shadow-amber-500/10"
    },
    danger: {
      gradient: "from-red-500/10 via-red-500/5 to-transparent",
      iconBg: "bg-red-500/15 text-red-600 dark:text-red-400",
      progressBar: "bg-red-500",
      border: "hover:border-red-500/30",
      glow: "group-hover:shadow-red-500/10"
    },
    info: {
      gradient: "from-blue-500/10 via-blue-500/5 to-transparent",
      iconBg: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
      progressBar: "bg-blue-500",
      border: "hover:border-blue-500/30",
      glow: "group-hover:shadow-blue-500/10"
    },
    purple: {
      gradient: "from-purple-500/10 via-purple-500/5 to-transparent",
      iconBg: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
      progressBar: "bg-purple-500",
      border: "hover:border-purple-500/30",
      glow: "group-hover:shadow-purple-500/10"
    }
  };

  const config = statusConfig[status];

  return (
    <Card 
      className={cn(
        "group relative overflow-hidden border bg-card/50 backdrop-blur-sm transition-all duration-300",
        onClick && "cursor-pointer",
        config.border,
        config.glow,
        "hover:shadow-xl hover:-translate-y-1"
      )}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
    >
      {/* Gradient Background */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500",
        config.gradient
      )} />
      
      {/* Decorative Circle */}
      <div className={cn(
        "absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-500",
        status === "success" && "bg-emerald-500",
        status === "warning" && "bg-amber-500",
        status === "danger" && "bg-red-500",
        status === "info" && "bg-blue-500",
        status === "purple" && "bg-purple-500"
      )} />

      <CardContent className="relative p-5">
        <div className="flex items-start justify-between mb-4">
          <div className={cn(
            "flex items-center justify-center h-12 w-12 rounded-xl transition-transform duration-300 group-hover:scale-110",
            config.iconBg
          )}>
            {icon}
          </div>
          
          {trend && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
              trend === "up" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              trend === "down" && "bg-red-500/10 text-red-600 dark:text-red-400",
              trend === "neutral" && "bg-muted text-muted-foreground"
            )}>
              {trend === "up" && <TrendingUp className="h-3 w-3" />}
              {trend === "down" && <TrendingDown className="h-3 w-3" />}
              {trend === "neutral" && <Minus className="h-3 w-3" />}
              {trendLabel}
            </div>
          )}
        </div>

        <div className="space-y-1 mb-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
        </div>
        
        {progress !== undefined && (
          <div className="mb-3">
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div 
                className={cn("h-full rounded-full transition-all duration-700 ease-out", config.progressBar)}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        
        <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>

        {details && details.length > 0 && (
          <div className="pt-3 border-t border-border/50 space-y-2">
            {details.map((detail, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{detail.label}</span>
                <span className="font-semibold">{detail.value}</span>
              </div>
            ))}
          </div>
        )}

        {onClick && (
          <div className="flex items-center text-xs text-primary font-medium pt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span>View details</span>
            <ArrowRight className="h-3 w-3 ml-1 group-hover:translate-x-1 transition-transform duration-300" />
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
      const { data: subsections } = await supabase
        .from("subsections")
        .select("id")
        .eq("site_id", site.id);
      
      const subsectionIds = subsections?.map(s => s.id) || [];
      
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
      
      const { data: inspections } = await supabase
        .from("inspections")
        .select("id, status, inspection_date")
        .eq("site_id", site.id);
      
      const completedInspections = inspections?.filter(i => i.status === "Completed" || i.status === "Done").length || 0;
      const pendingInspections = inspections?.filter(i => i.status === "Pending" || i.status === "Scheduled").length || 0;
      
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
      }

      const { data: subsectionDetails } = await supabase
        .from("subsections")
        .select("metering_status, meter_serial_number")
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
        inspections: { total: inspections?.length || 0, completed: completedInspections, pending: pendingInspections },
        snagStats,
        metering: { installed: meteringInstalled, pending: meteringPending, total: subsectionDetails?.length || 0 }
      };
    },
    staleTime: 30000
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

  const getHealthStatus = (rate: number): "success" | "warning" | "danger" => {
    if (rate >= 80) return "success";
    if (rate >= 50) return "warning";
    return "danger";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Primary KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Site Health"
          value={`${siteHealthRate}%`}
          subtitle={`${stats.compliantCount} of ${stats.totalSubsections} fully compliant`}
          icon={<CheckCircle className="h-6 w-6" />}
          progress={siteHealthRate}
          status={getHealthStatus(siteHealthRate)}
          onClick={onTabChange ? () => onTabChange("compliance") : undefined}
          details={[
            { label: "Compliant", value: stats.compliantCount },
            { label: "Non-compliant", value: stats.totalSubsections - stats.compliantCount }
          ]}
          delay={0}
        />

        <KPICard
          title="COC Compliance"
          value={`${cocComplianceRate}%`}
          subtitle={`${stats.cocApprovedCount} of ${stats.cocRequiredCount} approved`}
          icon={<Shield className="h-6 w-6" />}
          progress={cocComplianceRate}
          status={getHealthStatus(cocComplianceRate)}
          onClick={onTabChange ? () => onTabChange("subsections") : undefined}
          details={[
            { label: "Approved", value: stats.cocApprovedCount },
            { label: "Pending", value: stats.cocRequiredCount - stats.cocApprovedCount }
          ]}
          delay={50}
        />

        <KPICard
          title="Open Snags"
          value={stats.openSnags}
          subtitle="Issues requiring attention"
          icon={<AlertCircle className="h-6 w-6" />}
          status={stats.openSnags === 0 ? "success" : stats.openSnags > 10 ? "danger" : "warning"}
          onClick={onTabChange ? () => onTabChange("subsections") : undefined}
          details={extendedStats ? [
            { label: "Critical/High", value: (extendedStats.snagStats.critical + extendedStats.snagStats.high) },
            { label: "Rectified", value: extendedStats.snagStats.rectified }
          ] : undefined}
          delay={100}
        />

        <KPICard
          title="Subsections"
          value={stats.totalSubsections}
          subtitle="Total registered locations"
          icon={<Layers className="h-6 w-6" />}
          status="purple"
          onClick={onTabChange ? () => onTabChange("subsections") : undefined}
          details={extendedStats ? [
            { label: "Metered", value: extendedStats.metering.installed },
            { label: "Pending Meter", value: extendedStats.metering.pending }
          ] : undefined}
          delay={150}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Documents"
          value={extendedStats?.totalDocs || 0}
          subtitle="Total files uploaded"
          icon={<FileText className="h-6 w-6" />}
          status="info"
          onClick={onTabChange ? () => onTabChange("documents") : undefined}
          details={extendedStats ? [
            { label: "Site-Level", value: extendedStats.siteDocsCount },
            { label: "Subsection", value: extendedStats.subsectionDocsCount }
          ] : undefined}
          delay={200}
        />

        <KPICard
          title="Inspections"
          value={extendedStats?.inspections.total || 0}
          subtitle="Total inspections recorded"
          icon={<ClipboardCheck className="h-6 w-6" />}
          status={extendedStats?.inspections.pending ? "warning" : "success"}
          details={extendedStats ? [
            { label: "Completed", value: extendedStats.inspections.completed },
            { label: "Pending", value: extendedStats.inspections.pending }
          ] : undefined}
          delay={250}
        />

        <KPICard
          title="Floor Plan Items"
          value={extendedStats?.floorPlanStats.total || 0}
          subtitle="Marked annotations"
          icon={<Target className="h-6 w-6" />}
          status={extendedStats?.floorPlanStats.open === 0 ? "success" : "warning"}
          progress={extendedStats?.floorPlanStats.total 
            ? Math.round((extendedStats.floorPlanStats.closed / extendedStats.floorPlanStats.total) * 100)
            : 100}
          details={extendedStats ? [
            { label: "Open/In Progress", value: extendedStats.floorPlanStats.open },
            { label: "Closed", value: extendedStats.floorPlanStats.closed }
          ] : undefined}
          delay={300}
        />

        <KPICard
          title="Snag Resolution"
          value={`${snagResolutionRate}%`}
          subtitle="Issues resolved"
          icon={<Sparkles className="h-6 w-6" />}
          progress={snagResolutionRate}
          status={getHealthStatus(snagResolutionRate)}
          details={extendedStats ? [
            { label: "Total Snags", value: extendedStats.snagStats.total },
            { label: "Rectified", value: extendedStats.snagStats.rectified }
          ] : undefined}
          delay={350}
        />
      </div>

      {/* Site Info Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="group relative overflow-hidden border bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary">
                <Building className="h-4 w-4" />
              </div>
              Site Information
            </CardTitle>
            <CardDescription>General details about the location</CardDescription>
          </CardHeader>
          <CardContent className="relative space-y-4">
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

        <Card className="group relative overflow-hidden border bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary">
                <User className="h-4 w-4" />
              </div>
              Consultant Details
            </CardTitle>
            <CardDescription>Contact information for the site consultant</CardDescription>
          </CardHeader>
          <CardContent className="relative space-y-4">
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
