import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle, RefreshCw, RotateCcw, StopCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listSiteReportTargets } from "@/lib/reports/registry/listTargets";
import { generateReportTarget } from "@/lib/reports/registry/generateTarget";
import { runReportTargets, type RunSummary } from "@/lib/reports/registry/runner";
import { reportStatus } from "@/lib/reports/registry/status";
import {
  REPORT_TYPE_LABELS,
  REPORT_TYPE_ORDER,
  type GenerateResult,
  type ReportStatus,
  type ReportTarget,
  type ReportType,
  type SiteReportContext,
} from "@/lib/reports/registry/types";

type RowRun = { state: "queued" | "generating" } | { state: "done"; result: GenerateResult };

interface AllReportsGeneratorProps {
  context: SiteReportContext;
  onComplete?: () => void;
}

const STATUS_BADGE: Record<ReportStatus | "no-data", { label: string; className: string }> = {
  missing: { label: "Missing", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  "out-of-date": { label: "Out of date", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  current: { label: "Current", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" },
  "no-data": { label: "No data", className: "bg-muted text-muted-foreground" },
};

/** A report needs generating when it is missing or stale — unless there is nothing to report on yet. */
const needsGenerating = (t: ReportTarget) => reportStatus(t) !== "current" && !(t.emptyReason && !t.existing);

export function AllReportsGenerator({ context, onComplete }: AllReportsGeneratorProps) {
  const [targets, setTargets] = useState<ReportTarget[]>([]);
  const [listErrors, setListErrors] = useState<Partial<Record<ReportType, string>>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowRuns, setRowRuns] = useState<Map<string, RowRun>>(new Map());
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<RunSummary | null>(null);

  // Refs, not state: the run loop is one long async call that must see Stop / unmount immediately.
  const stopRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Closing the tab kills an in-browser run; warn while one is in progress.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const load = useCallback(async (preselect: boolean) => {
    setLoading(true);
    try {
      const listing = await listSiteReportTargets(context);
      if (!mountedRef.current) return;
      setTargets(listing.targets);
      setListErrors(listing.errors);
      if (preselect) setSelected(new Set(listing.targets.filter(needsGenerating).map((t) => t.key)));
    } catch (e) {
      toast.error("Could not load the site's reports", { description: e instanceof Error ? e.message : undefined });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    // context is rebuilt by the parent each render; only the site identity should reload the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.siteId]);

  useEffect(() => { load(true); }, [load]);

  const groups = useMemo(
    () => REPORT_TYPE_ORDER.map((type) => ({ type, rows: targets.filter((t) => t.type === type) })),
    [targets],
  );

  const toggle = (key: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });

  const setGroup = (rows: ReportTarget[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => (on ? next.add(r.key) : next.delete(r.key)));
      return next;
    });

  const run = async (toRun: ReportTarget[]) => {
    if (toRun.length === 0) return;
    stopRef.current = false;
    setStopping(false);
    setRunning(true);
    setSummary(null);
    setProgress({ done: 0, total: toRun.length });
    setRowRuns(new Map(toRun.map((t) => [t.key, { state: "queued" } as RowRun])));

    const result = await runReportTargets(toRun, {
      generate: (target) => generateReportTarget(target, context),
      shouldStop: () => stopRef.current || !mountedRef.current,
      onStart: (target) => {
        if (mountedRef.current) setRowRuns((prev) => new Map(prev).set(target.key, { state: "generating" }));
      },
      onDone: (target, res, index, total) => {
        if (!mountedRef.current) return;
        setRowRuns((prev) => new Map(prev).set(target.key, { state: "done", result: res }));
        setProgress({ done: index + 1, total });
      },
    });

    if (!mountedRef.current) return;
    setRunning(false);
    setStopping(false);
    setSummary(result);
    if (result.failed === 0 && !result.stopped) toast.success(`${result.saved} report${result.saved === 1 ? "" : "s"} generated`);
    else toast.warning(`${result.saved} saved, ${result.failed} failed${result.stopped ? `, ${result.skipped} not run (stopped)` : ""}`);
    onComplete?.();
    // Refresh statuses but keep the user's selection as it was.
    await load(false);
  };

  const runSelected = () => run(targets.filter((t) => selected.has(t.key)));
  const failedTargets = targets.filter((t) => {
    const r = rowRuns.get(t.key);
    return r?.state === "done" && !r.result.ok;
  });

  const selectedCount = targets.filter((t) => selected.has(t.key)).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <CardTitle>All reports for this site</CardTitle>
            <CardDescription>
              Every report this site can produce. Missing and out-of-date reports are pre-selected; generating
              one replaces its previous copy. Keep this tab open while it runs.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" disabled={running || loading} onClick={() => load(false)}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              variant="outline" size="sm" disabled={running || loading}
              onClick={() => setSelected(new Set(targets.filter(needsGenerating).map((t) => t.key)))}
            >
              Select out of date &amp; missing
            </Button>
            <Button variant="outline" size="sm" disabled={running || loading} onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {(running || summary) && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between text-sm">
              <span>
                {running
                  ? `${stopping ? "Stopping after the current report… " : "Generating… "}${progress.done} of ${progress.total}`
                  : `${summary!.saved} saved · ${summary!.failed} failed${summary!.stopped ? ` · ${summary!.skipped} not run` : ""} · ${Math.round(summary!.durationMs / 1000)}s`}
              </span>
              {!running && summary && summary.supersedeBlocked > 0 && (
                <span className="flex items-center gap-1 text-amber-600 text-xs">
                  <AlertTriangle className="h-3 w-3" /> {summary.supersedeBlocked} old cop{summary.supersedeBlocked === 1 ? "y" : "ies"} kept (no permission to remove)
                </span>
              )}
            </div>
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
          </div>
        )}

        {loading && targets.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(({ type, rows }) => {
              const err = listErrors[type];
              if (rows.length === 0 && !err && type !== "inspection") return null;
              const allOn = rows.length > 0 && rows.every((r) => selected.has(r.key));
              return (
                <div key={type} className="rounded-lg border">
                  <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                      <Checkbox
                        checked={allOn}
                        disabled={running || rows.length === 0}
                        onCheckedChange={(c) => setGroup(rows, c === true)}
                      />
                      {REPORT_TYPE_LABELS[type]}
                      {type === "inspection" && <span className="text-muted-foreground font-normal">({rows.length})</span>}
                    </label>
                    {err && (
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-destructive" onClick={() => load(false)}>
                        <RotateCcw className="h-3 w-3" /> Retry
                      </Button>
                    )}
                  </div>
                  {err ? (
                    <p className="px-3 py-2 text-sm text-destructive">Could not load: {err}</p>
                  ) : rows.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No inspections with a template on this site.</p>
                  ) : (
                    <ScrollArea className={rows.length > 8 ? "h-80" : undefined}>
                      <div className="divide-y">
                        {rows.map((row) => (
                          <TargetRow
                            key={row.key}
                            target={row}
                            checked={selected.has(row.key)}
                            disabled={running}
                            run={rowRuns.get(row.key)}
                            onToggle={(on) => toggle(row.key, on)}
                          />
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Button
              variant="destructive" className="gap-2" disabled={stopping}
              onClick={() => { stopRef.current = true; setStopping(true); }}
            >
              <StopCircle className="h-4 w-4" /> Stop
            </Button>
          ) : (
            <Button className="gap-2" disabled={loading || selectedCount === 0} onClick={runSelected}>
              <PlayCircle className="h-4 w-4" /> Generate {selectedCount} report{selectedCount === 1 ? "" : "s"}
            </Button>
          )}
          {!running && failedTargets.length > 0 && (
            <Button variant="outline" className="gap-2" onClick={() => run(failedTargets)}>
              <RotateCcw className="h-4 w-4" /> Retry {failedTargets.length} failed
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TargetRow({ target, checked, disabled, run, onToggle }: {
  target: ReportTarget;
  checked: boolean;
  disabled: boolean;
  run?: RowRun;
  onToggle: (on: boolean) => void;
}) {
  const status = target.emptyReason && !target.existing ? "no-data" : reportStatus(target);
  const badge = STATUS_BADGE[status];
  const label = target.type === "inspection" ? target.label : target.emptyReason ?? "";

  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm">
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(c) => onToggle(c === true)} />
      <div className="min-w-0 flex-1">
        {label && <p className="truncate">{label}</p>}
        <p className="text-xs text-muted-foreground">
          {target.existing
            ? `Generated ${format(new Date(target.existing.createdAt), "d MMM yyyy HH:mm")}${target.existing.linked ? "" : " (older report, not linked to this inspection)"}`
            : "Never generated"}
        </p>
        {run?.state === "done" && !run.result.ok && (
          <p className="text-xs text-destructive break-words">{run.result.error}</p>
        )}
        {run?.state === "done" && run.result.ok && run.result.supersedeBlocked > 0 && (
          <p className="text-xs text-amber-600">Old copy kept: no permission to remove it</p>
        )}
      </div>
      <RunIndicator run={run} />
      <Badge variant="secondary" className={badge.className}>{badge.label}</Badge>
    </div>
  );
}

function RunIndicator({ run }: { run?: RowRun }) {
  if (!run) return null;
  if (run.state !== "done") {
    return run.state === "queued"
      ? <span className="text-xs text-muted-foreground">Queued</span>
      : <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  }
  return run.result.ok
    ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-4 w-4" />{Math.round(run.result.durationMs / 1000)}s</span>
    : <XCircle className="h-4 w-4 text-destructive" />;
}
