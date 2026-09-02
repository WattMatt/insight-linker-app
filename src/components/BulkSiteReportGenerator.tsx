import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { CheckCircle2, FileBarChart, Loader2, StopCircle, XCircle } from "lucide-react";
import { generateSiteSummaryPdf } from "@/lib/report/siteSummaryPdf";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";

export interface BulkReportSite {
  id: string;
  name: string;
  clientName: string;
}

interface BulkSiteReportGeneratorProps {
  sites: BulkReportSite[];
  onComplete?: () => void;
}

type SiteRunState = "pending" | "generating" | "done" | "failed";

/**
 * Multi-site bulk generation: runs the shared Site Summary pipeline
 * (src/lib/report/siteSummaryPdf.ts) sequentially over the selected sites and
 * saves each PDF straight into that site's documents. Generation is
 * client-side pdfmake by design, so the loop is sequential with a cooperative
 * Stop — same contract as BulkInspectionReportGenerator.
 */
export const BulkSiteReportGenerator = ({ sites, onComplete }: BulkSiteReportGeneratorProps) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [runStates, setRunStates] = useState<Record<string, SiteRunState>>({});
  const stopRef = useRef(false);

  const toggleSite = (siteId: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(siteId);
      else next.delete(siteId);
      return next;
    });
  };

  const setRunState = (siteId: string, state: SiteRunState) =>
    setRunStates(prev => ({ ...prev, [siteId]: state }));

  const handleStop = () => {
    stopRef.current = true;
    toast.info("Stopping after the current site...");
  };

  const handleGenerate = async () => {
    const targets = sites.filter(s => selected.has(s.id));
    if (targets.length === 0) return;

    stopRef.current = false;
    setRunning(true);
    setRunStates(Object.fromEntries(targets.map(s => [s.id, "pending" as SiteRunState])));

    let saved = 0;
    let failed = 0;
    let stopped = false;

    for (const site of targets) {
      if (stopRef.current) {
        stopped = true;
        break;
      }

      setRunState(site.id, "generating");
      try {
        const { blob, filename } = await generateSiteSummaryPdf({
          siteId: site.id,
          siteName: site.name,
          clientName: site.clientName,
        });
        const result = await savePDFToDocuments({
          blob,
          fileName: filename,
          siteId: site.id,
          categoryName: getReportCategoryName("site-summary"),
        });
        if (!result.success) throw new Error(result.error || "Save failed");

        setRunState(site.id, "done");
        saved++;
      } catch (error) {
        console.error(`Bulk report failed for site ${site.name}:`, error);
        setRunState(site.id, "failed");
        failed++;
      }

      // Brief pause between sites so the UI stays responsive during heavy renders.
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setRunning(false);

    if (stopped) {
      toast.info(`Generation stopped — ${saved} report${saved === 1 ? "" : "s"} saved`);
    } else if (failed > 0) {
      toast.warning(`${saved} of ${targets.length} reports saved (${failed} failed)`);
    } else {
      toast.success(`${saved} report${saved === 1 ? "" : "s"} generated and saved`);
    }
    if (saved > 0) onComplete?.();
  };

  const stateIcon = (siteId: string) => {
    switch (runStates[siteId]) {
      case "generating":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "done":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const doneCount = Object.values(runStates).filter(s => s === "done" || s === "failed").length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return; // no accidental close mid-run
        setOpen(next);
        if (next) {
          setSelected(new Set(sites.map(s => s.id)));
          setRunStates({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileBarChart className="mr-2 h-4 w-4" />
          Bulk Reports
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Site Summary Reports</DialogTitle>
          <DialogDescription>
            Generate and save a Site Summary Report for each selected site. Reports
            appear in each site's Reports tab.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              disabled={running}
              checked={sites.length > 0 && selected.size === sites.length}
              onCheckedChange={(checked) =>
                setSelected(checked === true ? new Set(sites.map(s => s.id)) : new Set())
              }
            />
            Select all
          </label>
          <span>
            {running
              ? `${doneCount} of ${selected.size} processed`
              : `${selected.size} of ${sites.length} selected`}
          </span>
        </div>

        <ScrollArea className="max-h-72 rounded-md border p-2">
          <div className="space-y-1">
            {sites.map(site => (
              <label
                key={site.id}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox
                  disabled={running}
                  checked={selected.has(site.id)}
                  onCheckedChange={(checked) => toggleSite(site.id, checked === true)}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{site.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">{site.clientName}</span>
                </span>
                {stateIcon(site.id)}
              </label>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          {running ? (
            <Button variant="destructive" onClick={handleStop}>
              <StopCircle className="mr-2 h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button onClick={handleGenerate} disabled={selected.size === 0}>
              <FileBarChart className="mr-2 h-4 w-4" />
              Generate Reports ({selected.size})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
