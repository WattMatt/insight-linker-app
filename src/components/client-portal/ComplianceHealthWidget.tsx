import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Shield, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus
} from "lucide-react";

interface ComplianceStats {
  approved: number;
  pending: number;
  failed: number;
  missing: number;
  notRequired: number;
  total: number;
}

interface ComplianceHealthWidgetProps {
  stats: ComplianceStats;
  title?: string;
  showTrend?: boolean;
  previousScore?: number;
}

export function ComplianceHealthWidget({ 
  stats, 
  title = "Compliance Health",
  showTrend = false,
  previousScore
}: ComplianceHealthWidgetProps) {
  const complianceScore = stats.total > 0 
    ? Math.round(((stats.approved + stats.notRequired) / stats.total) * 100) 
    : 0;

  const getTrend = () => {
    if (!showTrend || previousScore === undefined) return null;
    const diff = complianceScore - previousScore;
    if (diff > 0) return { icon: TrendingUp, color: "text-green-500", value: `+${diff}%` };
    if (diff < 0) return { icon: TrendingDown, color: "text-red-500", value: `${diff}%` };
    return { icon: Minus, color: "text-muted-foreground", value: "0%" };
  };

  const trend = getTrend();

  const getScoreColor = () => {
    if (complianceScore >= 80) return "text-green-600";
    if (complianceScore >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreGradient = () => {
    if (complianceScore >= 80) return "from-green-500 to-emerald-500";
    if (complianceScore >= 50) return "from-yellow-500 to-amber-500";
    return "from-red-500 to-rose-500";
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5" />
            {title}
          </span>
          {trend && (
            <Badge variant="outline" className={`${trend.color} gap-1`}>
              <trend.icon className="h-3 w-3" />
              {trend.value}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Score Circle */}
        <div className="flex items-center gap-6">
          <div className="relative w-28 h-28">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              {/* Background circle */}
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted/30"
              />
              {/* Progress circle */}
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="url(#gradient)"
                strokeWidth="8"
                strokeDasharray={`${(complianceScore / 100) * 264} 264`}
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" className={`${getScoreGradient().includes('green') ? 'text-green-500' : getScoreGradient().includes('yellow') ? 'text-yellow-500' : 'text-red-500'}`} stopColor="currentColor" />
                  <stop offset="100%" className={`${getScoreGradient().includes('emerald') ? 'text-emerald-500' : getScoreGradient().includes('amber') ? 'text-amber-500' : 'text-rose-500'}`} stopColor="currentColor" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold ${getScoreColor()}`}>
                {complianceScore}%
              </span>
              <span className="text-xs text-muted-foreground">Score</span>
            </div>
          </div>

          {/* Stats breakdown */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Approved
              </span>
              <span className="font-medium">{stats.approved}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-yellow-500" />
                Pending
              </span>
              <span className="font-medium">{stats.pending}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm">
                <XCircle className="h-4 w-4 text-red-500" />
                Failed
              </span>
              <span className="font-medium">{stats.failed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Missing
              </span>
              <span className="font-medium">{stats.missing}</span>
            </div>
          </div>
        </div>

        {/* Status bars */}
        <div className="space-y-3">
          {[
            { label: "Approved", value: stats.approved, color: "bg-green-500", total: stats.total },
            { label: "Pending", value: stats.pending, color: "bg-yellow-500", total: stats.total },
            { label: "Issues", value: stats.failed + stats.missing, color: "bg-red-500", total: stats.total },
          ].map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium">
                  {item.value} / {item.total}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full ${item.color} transition-all duration-500`}
                  style={{ width: `${(item.value / Math.max(item.total, 1)) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default ComplianceHealthWidget;