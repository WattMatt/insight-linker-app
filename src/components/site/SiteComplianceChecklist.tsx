import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Circle, AlertTriangle, ChevronRight } from "lucide-react";
import { useNavigate } from "@/lib/navigation";
import {
  DELIVERABLE_ORDER,
  type SiteDeliverablesSummary,
  type DeliverableResult,
  type DeliverableKey,
} from "@/lib/siteDeliverables";
import { buildActionHref } from "@/lib/buildActionHref";

const ACTION_VERB: Record<DeliverableKey, string> = {
  schematic: "Upload",
  asset_register: "Upload",
  thermal: "Upload",
  summary_report: "Generate",
  coc: "Set COC",
  metering: "Enter meter",
  inspections: "Create",
  snags: "Open",
};

function statusBadge(d: DeliverableResult) {
  if (d.status === "complete") return <Badge className="bg-emerald-500/15 text-emerald-700">✓</Badge>;
  if (d.status === "not_required") return <Badge variant="secondary">N/A</Badge>;
  if (d.kind === "count") return <Badge className="bg-amber-500/15 text-amber-700">{d.done}/{d.total}</Badge>;
  return <Badge className="bg-red-500/15 text-red-700">✕</Badge>;
}

function bucket(d: DeliverableResult): number {
  if (d.blocking) return 0;
  if (d.status === "outstanding") return 1;
  if (d.status === "not_required") return 2;
  return 3; // complete
}

interface Props {
  summary: SiteDeliverablesSummary;
  clientId: string;
  siteId: string;
}

export function SiteComplianceChecklist({ summary, clientId, siteId }: Props) {
  const navigate = useNavigate();
  const groups = [...summary.deliverables].sort(
    (a, b) => bucket(a) - bucket(b) || DELIVERABLE_ORDER.indexOf(a.key) - DELIVERABLE_ORDER.indexOf(b.key),
  );

  return (
    <Card className="glass-card border-none">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Get this site compliant</CardTitle>
          <div className="flex items-center gap-2">
            {summary.blockingCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {summary.blockingCount} blocking
              </Badge>
            )}
            <span className="text-sm font-semibold text-muted-foreground">
              {summary.completeCount} of {summary.applicableCount} complete · {summary.completionPct}%
            </span>
          </div>
        </div>
        <Progress value={summary.completionPct} className="mt-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        {groups.map((d) => {
          const done = d.status === "complete" || d.status === "not_required";
          return (
            <div key={d.key} className="rounded-lg border overflow-hidden">
              <div className={`flex items-center gap-2 px-3 py-2 ${done ? "opacity-70" : ""} bg-muted/30`}>
                {statusBadge(d)}
                <span className="text-sm font-medium">{d.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {d.status === "complete" ? "complete"
                    : d.status === "not_required" ? "not required"
                    : `${d.outstandingItems.length} outstanding`}
                </span>
              </div>
              {!done && d.outstandingItems.length > 0 && (
                <div className="p-2 space-y-1">
                  {d.outstandingItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => navigate(buildActionHref(item, { clientId, siteId }))}
                      className="w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {item.blocking
                          ? <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" aria-hidden="true" />
                          : <Circle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />}
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="flex items-center gap-1 shrink-0 text-xs font-semibold text-primary">
                        {ACTION_VERB[item.category]}
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
