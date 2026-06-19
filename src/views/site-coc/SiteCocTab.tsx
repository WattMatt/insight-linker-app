import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSiteCoc } from "./useSiteCoc";
import { useSiteCocImport } from "./useSiteCocImport";
import { ScheduleSubTab } from "./ScheduleSubTab";
import { CertificatesSubTab } from "./CertificatesSubTab";
import { VerificationSubTab } from "./VerificationSubTab";
import { ReportSubTab } from "./ReportSubTab";
import { SiteCocLoadCard } from "./SiteCocLoadCard";

export function SiteCocTab({ siteId, siteName, clientName, siteAddress }: { siteId: string | undefined; siteName: string; clientName?: string | null; siteAddress?: string | null }) {
  const { schedule, certificates, batch, subsections, loading, refetch, resolveShop } = useSiteCoc(siteId);
  const { importing, runImport } = useSiteCocImport(siteId, refetch);
  const schedRef = useRef<HTMLInputElement>(null);
  const verifRef = useRef<HTMLInputElement>(null);
  const [schedFile, setSchedFile] = useState<File | null>(null);
  const [verifFile, setVerifFile] = useState<File | null>(null);

  const go = async () => {
    if (!schedFile || !verifFile) { toast.error("Select both the DB Schedule and Verification workbooks."); return; }
    await runImport(schedFile, verifFile);
    setSchedFile(null); setVerifFile(null);
    if (schedRef.current) schedRef.current.value = "";
    if (verifRef.current) verifRef.current.value = "";
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
          <Button onClick={go} disabled={importing || !schedFile || !verifFile}>
            {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {importing ? "Importing..." : "Import (replaces this site's COC data)"}
          </Button>
          {batch && (
            <p className="text-xs text-muted-foreground">
              Last import: {new Date(batch.created_at).toLocaleString()} · {batch.certs_imported} certs · {batch.shops_imported} shops · {batch.unmatched_count} unmatched
            </p>
          )}
        </CardContent>
      </Card>

      <SiteCocLoadCard siteId={siteId} subsections={subsections} onDone={refetch} />

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="certificates">Certificates</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule"><Card><CardContent className="pt-4">{loading ? "Loading…" : <ScheduleSubTab rows={schedule} subsections={subsections} onResolve={resolveShop} />}</CardContent></Card></TabsContent>
        <TabsContent value="certificates"><Card><CardContent className="pt-4">{loading ? "Loading…" : <CertificatesSubTab rows={certificates} />}</CardContent></Card></TabsContent>
        <TabsContent value="verification"><Card><CardContent className="pt-4">{loading ? "Loading…" : <VerificationSubTab rows={certificates} />}</CardContent></Card></TabsContent>
        <TabsContent value="report"><Card><CardContent className="pt-4"><ReportSubTab siteId={siteId} siteName={siteName} schedule={schedule} certificates={certificates} batch={batch} subsections={subsections} clientName={clientName} siteAddress={siteAddress} /></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
