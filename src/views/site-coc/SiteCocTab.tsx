import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { liveMatchCounts } from "@/lib/siteCoc/coverage";
import type { SiteKpiBlock } from "@/lib/siteCoc/reportKpis";
import { useSiteCoc } from "./useSiteCoc";
import { useSiteCocImport } from "./useSiteCocImport";
import { useSiteCocPool } from "./useSiteCocPool";
import { ScheduleSubTab } from "./ScheduleSubTab";
import { CertificatesSubTab } from "./CertificatesSubTab";
import { VerificationSubTab } from "./VerificationSubTab";
import { ReportSubTab } from "./ReportSubTab";
import { AssignSubTab } from "./AssignSubTab";
import { SiteCocLoadCard } from "./SiteCocLoadCard";

export function SiteCocTab({ siteId, siteName, clientName, siteAddress, siteKpis, companyLogo }: { siteId: string | undefined; siteName: string; clientName?: string | null; siteAddress?: string | null; siteKpis?: SiteKpiBlock; companyLogo?: string | null }) {
  const { schedule, certificates, batch, subsections, loading, refetch, resolveShop, rerunAutoMatch } = useSiteCoc(siteId);
  const { importing, runImport } = useSiteCocImport(siteId, refetch);
  const pool = useSiteCocPool(siteId, refetch);
  const schedRef = useRef<HTMLInputElement>(null);
  const verifRef = useRef<HTMLInputElement>(null);
  const [schedFile, setSchedFile] = useState<File | null>(null);
  const [verifFile, setVerifFile] = useState<File | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [tab, setTab] = useState("schedule");

  const counts = liveMatchCounts(schedule);

  const go = async () => {
    if (!schedFile || !verifFile) { toast.error("Select both the DB Schedule and Verification workbooks."); return; }
    await runImport(schedFile, verifFile);
    setSchedFile(null); setVerifFile(null);
    if (schedRef.current) schedRef.current.value = "";
    if (verifRef.current) verifRef.current.value = "";
  };

  const onRerun = async () => {
    setRerunning(true);
    const n = await rerunAutoMatch();
    setRerunning(false);
    if (n) toast.success(`Matched ${n} more shop${n === 1 ? "" : "s"}.`);
    else toast.info("No new auto-matches found — the rest need manual assignment.");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Site COC — import</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm">DB Schedule workbook
              <input ref={schedRef} type="file" accept=".xlsx" className="mt-1 block w-full text-sm" onChange={e => setSchedFile(e.target.files?.[0] ?? null)} />
            </label>
            <label className="text-sm">Verification workbook
              <input ref={verifRef} type="file" accept=".xlsx" className="mt-1 block w-full text-sm" onChange={e => setVerifFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={go} disabled={importing || !schedFile || !verifFile}>
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {importing ? "Importing..." : "Import (replaces this site's COC data)"}
            </Button>
            <Button variant="outline" onClick={onRerun} disabled={rerunning || counts.unmatched === 0}>
              {rerunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Re-run auto-match
            </Button>
          </div>
          {batch && (
            <p className="text-xs text-muted-foreground">
              Last import: {new Date(batch.created_at).toLocaleString()} · {batch.certs_imported} certs · {batch.shops_imported} shops · {counts.matched} matched · {counts.unmatched} unmatched
            </p>
          )}
        </CardContent>
      </Card>

      <SiteCocLoadCard pool={pool} hasImport={!!batch} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="certificates">Certificates</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="assign">Exceptions{pool.pending.length ? ` (${pool.pending.length})` : ""}</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule"><Card><CardContent className="pt-4">{loading ? "Loading…" : <ScheduleSubTab rows={schedule} subsections={subsections} onResolve={resolveShop} />}</CardContent></Card></TabsContent>
        <TabsContent value="certificates"><Card><CardContent className="pt-4">{loading ? "Loading…" : <CertificatesSubTab rows={certificates} />}</CardContent></Card></TabsContent>
        <TabsContent value="verification"><Card><CardContent className="pt-4">{loading ? "Loading…" : <VerificationSubTab rows={certificates} />}</CardContent></Card></TabsContent>
        <TabsContent value="assign"><Card><CardContent className="pt-4"><AssignSubTab pending={pool.pending} subsections={subsections} onAssign={(f, s) => pool.assignManual(f, s, f.detected_kind === "eval" ? "eval" : "coc")} onAssignMany={pool.assignManyTo} onReassign={pool.reassign} onUpdateCertNo={pool.updateCertNo} onGoToSchedule={() => setTab("schedule")} hasImport={!!batch} busy={pool.busy} /></CardContent></Card></TabsContent>
        <TabsContent value="report"><Card><CardContent className="pt-4"><ReportSubTab siteId={siteId} siteName={siteName} schedule={schedule} certificates={certificates} batch={batch} subsections={subsections} clientName={clientName} siteAddress={siteAddress} siteKpis={siteKpis} companyLogo={companyLogo} /></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
