import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, AlertTriangle, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  type SiteDeliverablesSummary, type DeliverableResult, type OutstandingItem,
} from "@/lib/siteDeliverables";

const BAND_TEXT: Record<'success' | 'warning' | 'danger', string> = {
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-red-600",
};

function StatusChip({ d }: { d: DeliverableResult }) {
  const muted = d.status === "not_required";
  const complete = d.status === "complete";
  const value = d.kind === "count" ? `${d.done}/${d.total}` : complete ? "Done" : "Outstanding";
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${muted ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2 min-w-0">
        {complete ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        ) : muted ? (
          <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-amber-600 shrink-0" />
        )}
        <span className="text-sm truncate">{d.label}</span>
      </div>
      <span className="text-xs font-medium text-muted-foreground shrink-0">
        {muted ? "N/A" : value}
      </span>
    </div>
  );
}

interface Props {
  summary: SiteDeliverablesSummary;
  onSelectItem?: (item: OutstandingItem) => void;
}

export function SiteReadinessPanel({ summary, onSelectItem }: Props) {
  const [showAll, setShowAll] = useState(false);
  const tasks = showAll ? summary.nextTasks : summary.nextTasks.slice(0, 6);

  return (
    <Card className="glass-card border-none">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Site Readiness</CardTitle>
          <div className="flex items-center gap-2">
            {summary.blockingCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {summary.blockingCount} blocking
              </Badge>
            )}
            <span className={`text-sm font-semibold ${BAND_TEXT[summary.band]}`}>
              {summary.completeCount} of {summary.applicableCount} complete · {summary.completionPct}%
            </span>
          </div>
        </div>
        <Progress value={summary.completionPct} className="mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {summary.deliverables.map(d => <StatusChip key={d.key} d={d} />)}
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">
            Next tasks{summary.outstandingCount > 0 ? ` (${summary.outstandingCount})` : ""}
          </h4>
          {summary.outstandingCount === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> All deliverables complete.
            </p>
          ) : (
            <div className="space-y-1">
              {tasks.map(item => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onSelectItem?.(item)}
                  className="w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {item.blocking
                      ? <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                      : <Circle className="h-4 w-4 text-amber-600 shrink-0" />}
                    <span className="truncate">{item.label}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
              {summary.nextTasks.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAll(v => !v)}
                  className="text-xs text-primary hover:underline px-3 py-1"
                >
                  {showAll ? "Show less" : `Show all ${summary.nextTasks.length}`}
                </button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
