import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/navigation";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import {
  ShieldCheck, FileCheck, Gauge, ClipboardCheck, AlertTriangle, Bug,
  Workflow, ListChecks, Thermometer, FileText, CalendarClock,
  ChevronRight, TrendingUp, CheckCircle2,
} from "lucide-react";
import { readiness, computeSiteHealth } from "@/lib/siteHealth";
import { cocExpiryBuckets, snagAging } from "@/lib/kpiMetrics";
import { snagStatusBucket } from "@/lib/subsectionStatus";
import { buildActionHref } from "@/lib/buildActionHref";
import type {
  SiteDeliverablesSummary, DeliverableResult, OutstandingItem, DeliverableKey,
} from "@/lib/siteDeliverables";

type Sub = {
  id: string;
  name: string;
  category: string | null;
  coc_status: string;
  coc_expiry_date?: string | null;
  metering_status: string;
  meter_serial_number?: string | null;
  is_compliant: boolean | null;
  is_coc_required: boolean;
};

interface ComplianceDashboardProps {
  siteId: string;
  clientId: string;
  subsections: Sub[];
  inspections: Array<{ id: string; subsection_id: string | null; inspection_date: string; json_data: any }>;
  deliverablesSummary: SiteDeliverablesSummary;
}

type SnagRow = {
  id: string;
  subsection_id: string | null;
  status: string | null;
  risk_level: string | null;
  created_at: string | null;
  rectified_at: string | null;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const DELIVERABLE_ICON: Record<DeliverableKey, typeof Bug> = {
  snags: Bug,
  coc: FileCheck,
  inspections: ClipboardCheck,
  metering: Gauge,
  schematic: Workflow,
  asset_register: ListChecks,
  thermal: Thermometer,
  summary_report: FileText,
};

const deliverableColor = (d: DeliverableResult) => {
  if (d.status === "not_required") return "text-muted-foreground";
  if (d.status === "complete") return "text-green-600 dark:text-green-400";
  if (d.blocking) return "text-red-600 dark:text-red-400";
  return "text-yellow-600 dark:text-yellow-400";
};

type Snap = { captured_at: string; health_score: number | null; outstanding_count: number | null; completion_pct: number | null };

const Spark = ({ label, data, dataKey, color }: { label: string; data: Snap[]; dataKey: keyof Snap; color: string }) => (
  <div>
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data}>
        <Line type="monotone" dataKey={dataKey as string} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

export const ComplianceDashboard = ({
  siteId, clientId, subsections, inspections, deliverablesSummary,
}: ComplianceDashboardProps) => {
  const [snagRows, setSnagRows] = useState<SnagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [snagError, setSnagError] = useState(false);
  const [snapshots, setSnapshots] = useState<Snap[]>([]);
  const navigate = useNavigate();

  // Snags carry timestamps/risk we need for aging + readiness; the rest of the dashboard
  // is derived from props (deliverablesSummary, subsections, inspections) with no fetch.
  useEffect(() => {
    const run = async () => {
      try {
        setSnagError(false);
        const ids = subsections.map((s) => s.id);
        if (ids.length === 0) { setSnagRows([]); return; }
        const { data, error } = await supabase
          .from("snags")
          .select("id, subsection_id, status, risk_level, created_at, rectified_at")
          .in("subsection_id", ids);
        if (error) throw error;
        setSnagRows(data ?? []);

        // Trend snapshots — cast: generated DB types don't include the new table until regen;
        // table may also not exist yet in an env, so this fails soft to the placeholder.
        const { data: snaps } = await (supabase as any)
          .from("site_health_snapshots")
          .select("captured_at, health_score, outstanding_count, completion_pct")
          .eq("site_id", siteId)
          .order("captured_at", { ascending: true })
          .limit(60);
        if (snaps) setSnapshots(snaps as Snap[]);
      } catch (e) {
        console.error("KPI snag fetch failed:", e);
        setSnagError(true);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [siteId, subsections]);

  const ds = deliverablesSummary;
  const snagsForHealth = snagRows.map((s) => ({ subsection_id: s.subsection_id ?? "", status: s.status, risk_level: s.risk_level }));
  const rd = readiness(subsections, snagsForHealth, inspections);
  // 0/0 is "nothing captured", not "100% ready" — an empty site must never look done.
  const readyPct = rd.total ? Math.round((rd.ready / rd.total) * 100) : 0;
  const health = computeSiteHealth(subsections, snagsForHealth, inspections);

  const counts = { open: 0, inProgress: 0, closed: 0 };
  for (const s of snagRows) counts[snagStatusBucket(s.status)]++;
  const totalSnags = counts.open + counts.inProgress + counts.closed;
  const aging = snagAging(snagRows, todayISO());
  const exp = cocExpiryBuckets(subsections, todayISO());
  const cocRequired = subsections.some((s) => s.is_coc_required);

  const go = (item: OutstandingItem) => navigate(buildActionHref(item, { clientId, siteId }));
  const goDeliverable = (d: DeliverableResult) =>
    go(d.outstandingItems[0] ?? { id: d.key, category: d.key, label: d.label, severity: "none", blocking: false });
  const goCategory = (key: DeliverableKey) => {
    const d = ds.deliverables.find((x) => x.key === key);
    if (d) goDeliverable(d);
  };

  return (
    <div className="space-y-6">
      {/* Hero: readiness + handover completion */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              Subsections ready
            </CardTitle>
            <CardDescription>Operational health {health.score}%</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                {rd.ready}<span className="text-lg text-muted-foreground"> / {rd.total}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {rd.total ? `${readyPct}% ready for handover` : "no subsections captured yet"}
              </span>
            </div>
            <Progress value={readyPct} className="mt-2 h-2" />
            <div className="flex flex-wrap gap-2 mt-3">
              {rd.failing.metering > 0 && <Badge variant="destructive">{rd.failing.metering} metering</Badge>}
              {rd.failing.snags > 0 && <Badge variant="destructive">{rd.failing.snags} snags</Badge>}
              {rd.failing.inspection > 0 && <Badge variant="secondary">{rd.failing.inspection} inspection</Badge>}
              {rd.total > 0 && rd.ready === rd.total && (
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20">All ready</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card
          className={ds.nextTasks.length ? "cursor-pointer hover:border-border transition-colors" : ""}
          onClick={() => ds.nextTasks[0] && go(ds.nextTasks[0])}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                Handover completion
              </span>
              {ds.nextTasks.length > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{ds.completionPct}%</span>
              <span className="text-sm text-muted-foreground">{ds.completeCount} of {ds.applicableCount} deliverables</span>
            </div>
            <Progress value={ds.completionPct} className="mt-2 h-2" />
            <div className="flex flex-wrap gap-2 mt-3">
              {ds.blockingCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />{ds.blockingCount} blocking
                </Badge>
              )}
              <Badge variant="secondary">{ds.outstandingCount} outstanding</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deliverables grid */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">Deliverables — click any to jump to its items</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ds.deliverables.map((d) => {
            const Icon = DELIVERABLE_ICON[d.key];
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => goDeliverable(d)}
                className="flex items-center justify-between gap-2 rounded-md border border-transparent bg-muted/40 px-3 py-2 text-left hover:border-border transition-colors"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Icon className={`h-4 w-4 ${deliverableColor(d)}`} />
                  {d.label}
                </span>
                {d.status === "complete" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : d.status === "not_required" ? (
                  <span className="text-xs text-muted-foreground">n/a</span>
                ) : (
                  <Badge variant={d.blocking ? "destructive" : "secondary"} className="text-xs">
                    {d.done}/{d.total}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Snag risk & aging + COC expiry */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card
          className={totalSnags ? "cursor-pointer hover:border-border transition-colors" : ""}
          onClick={() => totalSnags && goCategory("snags")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-muted-foreground" />
                Snags — risk &amp; aging
              </span>
              {totalSnags > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading snags…</p>
            ) : snagError ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />Couldn't load snag data — try refreshing.
              </p>
            ) : totalSnags === 0 ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />No snags recorded
              </p>
            ) : (
              <>
                <div className="flex h-2.5 rounded-full overflow-hidden mb-2">
                  <div className="bg-red-500" style={{ width: `${(counts.open / totalSnags) * 100}%` }} />
                  <div className="bg-yellow-500" style={{ width: `${(counts.inProgress / totalSnags) * 100}%` }} />
                  <div className="bg-green-500" style={{ width: `${(counts.closed / totalSnags) * 100}%` }} />
                </div>
                <div className="flex gap-4 text-xs mb-3">
                  <span className="text-red-600 dark:text-red-400">● {counts.open} open</span>
                  <span className="text-yellow-600 dark:text-yellow-400">● {counts.inProgress} in progress</span>
                  <span className="text-green-600 dark:text-green-400">● {counts.closed} closed</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-xs text-red-600 dark:text-red-400">High-risk open</p>
                    <p className="text-lg font-semibold">{aging.criticalOpen}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Oldest open</p>
                    <p className="text-lg font-semibold">{aging.oldestOpenDays === null ? "—" : `${aging.oldestOpenDays}d`}</p>
                  </div>
                </div>
                {aging.medianResolveDays !== null && (
                  <p className="text-xs text-muted-foreground mt-2">Median time to resolve: {aging.medianResolveDays}d</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card
          className={cocRequired ? "cursor-pointer hover:border-border transition-colors" : ""}
          onClick={() => cocRequired && goCategory("coc")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                COC expiry
              </span>
              {cocRequired && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!cocRequired ? (
              <p className="text-sm text-muted-foreground">No COC required for this site.</p>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-md bg-red-500/10 px-3 py-2">
                  <span className="text-sm text-red-600 dark:text-red-400">Expiring ≤ 30 days</span>
                  <span className="text-lg font-semibold text-red-600 dark:text-red-400">{exp.within30}</span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-yellow-500/10 px-3 py-2">
                  <span className="text-sm text-yellow-700 dark:text-yellow-500">Expiring ≤ 90 days</span>
                  <span className="text-lg font-semibold text-yellow-700 dark:text-yellow-500">{exp.within90}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-1">
                  <span className="text-sm text-muted-foreground">Already expired</span>
                  <span className="text-base font-medium text-muted-foreground">{exp.expired}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trends (Part 2 wires real data) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Trends
          </CardTitle>
          <CardDescription>Weekly health, outstanding &amp; completion</CardDescription>
        </CardHeader>
        <CardContent>
          {snapshots.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Collecting data — weekly trends appear here once snapshots accrue.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <Spark label="Health score" data={snapshots} dataKey="health_score" color="hsl(var(--chart-2))" />
              <Spark label="Outstanding" data={snapshots} dataKey="outstanding_count" color="hsl(var(--destructive))" />
              <Spark label="Completion %" data={snapshots} dataKey="completion_pct" color="hsl(var(--chart-1))" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
