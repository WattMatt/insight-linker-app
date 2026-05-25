import { Link } from "@/lib/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  Building2, 
  MapPin, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  ChevronRight,
  FileText
} from "lucide-react";

interface SiteStats {
  totalSubsections: number;
  compliantCount: number;
  pendingCount: number;
  failedCount: number;
  openSnags: number;
}

interface SiteOverviewCardProps {
  site: {
    id: string;
    name: string;
    address?: string;
    site_type?: string;
    site_image_url?: string;
  };
  stats: SiteStats;
  linkPrefix?: string;
}

export function SiteOverviewCard({ site, stats, linkPrefix = "/client-portal/sites" }: SiteOverviewCardProps) {
  const complianceRate = stats.totalSubsections > 0 
    ? Math.round((stats.compliantCount / stats.totalSubsections) * 100) 
    : 0;

  const getHealthColor = () => {
    if (complianceRate >= 80) return "text-green-600";
    if (complianceRate >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getProgressColor = () => {
    if (complianceRate >= 80) return "bg-green-500";
    if (complianceRate >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <Link to={`${linkPrefix}/${site.id}`}>
      <Card className="h-full hover:shadow-lg transition-all duration-200 hover:border-primary/50 cursor-pointer group">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-4">
            {/* Site Image or Placeholder */}
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              {site.site_image_url ? (
                <img 
                  src={site.site_image_url} 
                  alt={site.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Site Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg group-hover:text-primary transition-colors truncate">
                    {site.name}
                  </CardTitle>
                  {site.address && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1 truncate">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      {site.address}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </div>
              {site.site_type && (
                <Badge variant="outline" className="mt-2 text-xs">
                  {site.site_type}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Compliance Progress */}
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Compliance</span>
              <span className={`font-semibold ${getHealthColor()}`}>
                {complianceRate}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${getProgressColor()}`}
                style={{ width: `${complianceRate}%` }}
              />
            </div>
          </div>

          {/* Status Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <div className="p-1.5 rounded bg-muted">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">{stats.totalSubsections}</p>
                <p className="text-xs text-muted-foreground">Subsections</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <div className="p-1.5 rounded bg-green-100">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-green-600">{stats.compliantCount}</p>
                <p className="text-xs text-muted-foreground">Compliant</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <div className="p-1.5 rounded bg-yellow-100">
                <Clock className="h-3.5 w-3.5 text-yellow-600" />
              </div>
              <div>
                <p className="font-medium text-yellow-600">{stats.pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <div className="p-1.5 rounded bg-red-100">
                <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
              </div>
              <div>
                <p className="font-medium text-red-600">{stats.openSnags}</p>
                <p className="text-xs text-muted-foreground">Open Snags</p>
              </div>
            </div>
          </div>

          {/* Action hint */}
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground text-center group-hover:text-primary transition-colors">
              Click to view details →
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default SiteOverviewCard;