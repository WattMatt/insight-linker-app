import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronRight, Building2 } from "lucide-react";
import { type SiteTriageRow } from "@/lib/siteDeliverables";

const BAND_DOT = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
} satisfies Record<SiteTriageRow['band'], string>;

interface Props {
  rows: SiteTriageRow[];
  onSelectSite: (siteId: string) => void;
  limit?: number;
}

export function SitesNeedingAttention({ rows, onSelectSite, limit = 6 }: Props) {
  const shown = rows.filter(r => r.outstandingCount > 0).slice(0, limit);

  return (
    <Card className="glass-card border-none">
      <CardHeader>
        <CardTitle className="text-lg">Sites Needing Attention</CardTitle>
        <CardDescription>Ranked by blocking issues, then outstanding work</CardDescription>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No outstanding work across sites.</p>
        ) : (
          <div className="space-y-1">
            {shown.map(r => (
              <button
                type="button"
                key={r.siteId}
                onClick={() => onSelectSite(r.siteId)}
                className="w-full flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${BAND_DOT[r.band]}`} title={r.band} />
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{r.siteName}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {r.blockingCount > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {r.blockingCount}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{r.outstandingCount} outstanding</span>
                  <span className="text-xs font-medium">{r.completionPct}%</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
