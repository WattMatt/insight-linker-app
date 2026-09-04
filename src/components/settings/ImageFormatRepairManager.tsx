import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ImageIcon, Loader2, Search, ShieldAlert, StopCircle, Wrench } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import {
  IMAGE_BUCKETS,
  scanBuckets,
  repairObjects,
  type ClassifiedObject,
  type RepairOutcome,
  type ScanProgress,
  type ScanResult,
} from "@/lib/imageRepair/legacyImageRepair";

const formatBytes = (n: number | null) => {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * Admin tool: find iPhone HEIC photos stored under a misleading label (for
 * example .jpg) that browsers cannot display, and re-encode them in place as
 * JPEG through the upload normaliser. Deliberately narrow — WebP/GIF/SVG and the
 * `documents` bucket are left untouched (see legacyImageRepair.ts). Scanning
 * reads only the first bytes of each file.
 */
export function ImageFormatRepairManager() {
  const { data: role } = useUserRole();
  const isAdmin = role === "Admin";

  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(new Set(IMAGE_BUCKETS));
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  // The buckets the current scan actually covered — the summary is built from
  // this, not from the live checkboxes (which re-enable the moment a scan ends).
  const [scannedBuckets, setScannedBuckets] = useState<string[]>([]);
  const [repairing, setRepairing] = useState(false);
  const [repairProgress, setRepairProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<RepairOutcome[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Leaving the Settings tab or navigating away unmounts this component; abort
  // any in-flight scan/repair so it does not keep rewriting storage unseen.
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!scanning && !repairing) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [scanning, repairing]);

  const busy = scanning || repairing;

  const repairable = useMemo(
    () => (scan?.objects ?? []).filter(o => o.verdict.kind === "repairable"),
    [scan],
  );
  const displayableCount = useMemo(
    () => (scan?.objects ?? []).filter(o => o.verdict.kind === "displayable").length,
    [scan],
  );
  const notImages = useMemo(
    () => (scan?.objects ?? []).filter(o => o.verdict.kind === "not-image"),
    [scan],
  );
  const bucketErrors = useMemo(
    () => (scan?.errors ?? []).filter(e => e.path === ""),
    [scan],
  );

  const perBucket = useMemo(() => {
    const rows = new Map<string, { checked: number; ok: number; repairable: number; displayable: number; notImage: number; errors: number; listingFailed: boolean }>();
    for (const b of scannedBuckets) rows.set(b, { checked: 0, ok: 0, repairable: 0, displayable: 0, notImage: 0, errors: 0, listingFailed: false });
    for (const o of scan?.objects ?? []) {
      const r = rows.get(o.bucket);
      if (!r) continue;
      r.checked++;
      if (o.verdict.kind === "ok") r.ok++;
      else if (o.verdict.kind === "repairable") r.repairable++;
      else if (o.verdict.kind === "displayable") r.displayable++;
      else r.notImage++;
    }
    for (const e of scan?.errors ?? []) {
      const r = rows.get(e.bucket);
      if (!r) continue;
      if (e.path === "") r.listingFailed = true;
      else r.errors++;
    }
    return [...rows.entries()];
  }, [scan, scannedBuckets]);

  const toggleBucket = (bucket: string, checked: boolean) => {
    setSelectedBuckets(prev => {
      const next = new Set(prev);
      if (checked) next.add(bucket);
      else next.delete(bucket);
      return next;
    });
  };

  const handleScan = async () => {
    const buckets = IMAGE_BUCKETS.filter(b => selectedBuckets.has(b));
    if (buckets.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setScanning(true);
    setScan(null);
    setOutcomes([]);
    setScanProgress({ bucket: buckets[0], listed: 0, checked: 0, phase: "listing" });
    setScannedBuckets(buckets);
    try {
      const result = await scanBuckets(buckets, {
        signal: controller.signal,
        onProgress: p => setScanProgress(p),
      });
      setScan(result);
      const bad = result.objects.filter(o => o.verdict.kind === "repairable").length;
      const total = result.objects.length;
      const noun = total === 1 ? "image" : "images";
      const failedBuckets = result.errors.filter(e => e.path === "").length;
      if (controller.signal.aborted) toast.info("Scan stopped");
      else if (failedBuckets > 0 && bad === 0) toast.warning(`Scan finished with ${failedBuckets} bucket${failedBuckets === 1 ? "" : "s"} that could not be listed`);
      else if (bad === 0) toast.success(`Scan complete — ${total} ${noun} checked, none need repair`);
      else toast.warning(`Scan complete — ${bad} of ${total} ${noun} need repair`);
    } catch (error) {
      console.error("Image scan failed:", error);
      toast.error("Scan failed");
    } finally {
      setScanning(false);
      abortRef.current = null;
    }
  };

  const handleRepair = async () => {
    if (repairable.length === 0) return;
    if (!confirm(`Re-encode ${repairable.length} image${repairable.length === 1 ? "" : "s"} in place as JPEG? The HEIC originals are replaced and this cannot be undone.`)) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRepairing(true);
    setOutcomes([]);
    setRepairProgress({ done: 0, total: repairable.length });
    try {
      const results = await repairObjects(repairable, {
        signal: controller.signal,
        onProgress: (done, total, last) => {
          setRepairProgress({ done, total });
          setOutcomes(prev => [...prev, last]);
        },
      });
      const repaired = results.filter(r => r.status === "repaired").length;
      const failed = results.length - repaired;
      if (controller.signal.aborted) toast.info(`Repair stopped — ${repaired} repaired`);
      else if (failed > 0) toast.warning(`${repaired} repaired, ${failed} failed`);
      else toast.success(`${repaired} image${repaired === 1 ? "" : "s"} repaired`);
      // Drop repaired objects from the pending list so the button reflects what is left.
      const done = new Set(results.filter(r => r.status === "repaired").map(r => `${r.bucket}/${r.path}`));
      setScan(prev => prev ? { ...prev, objects: prev.objects.map(o =>
        done.has(`${o.bucket}/${o.path}`) ? { ...o, verdict: { kind: "ok", format: "jpeg" } } as ClassifiedObject : o
      ) } : prev);
    } finally {
      setRepairing(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();

  if (role !== undefined && !isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Legacy image repair
          </CardTitle>
          <CardDescription>
            This tool rewrites stored images and is available to administrators only.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const scanLabel = scanProgress
    ? scanProgress.phase === "listing"
      ? `Listing ${scanProgress.bucket}…`
      : `${scanProgress.bucket}: ${scanProgress.checked} of ${scanProgress.listed} checked`
    : "Scanning…";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Legacy image repair
        </CardTitle>
        <CardDescription>
          Finds iPhone HEIC photos stored under a name browsers cannot open (for example a .jpg that
          actually holds HEIC bytes) and re-encodes them in place as JPEG. Reports already convert these
          when generating; this fixes them everywhere else. WebP, GIF and SVG display in browsers already
          and are left untouched, as are user-uploaded documents. Scanning reads only the first bytes of each file.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {IMAGE_BUCKETS.map(bucket => (
            <label key={bucket} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                disabled={busy}
                checked={selectedBuckets.has(bucket)}
                onCheckedChange={checked => toggleBucket(bucket, checked === true)}
              />
              <span className="font-mono text-xs">{bucket}</span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {busy ? (
            <Button variant="destructive" onClick={handleStop}>
              <StopCircle className="mr-2 h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button variant="outline" onClick={handleScan} disabled={selectedBuckets.size === 0}>
              <Search className="mr-2 h-4 w-4" />
              Scan for problem images
            </Button>
          )}
          {!busy && repairable.length > 0 && (
            <Button onClick={handleRepair}>
              <Wrench className="mr-2 h-4 w-4" />
              Repair {repairable.length} image{repairable.length === 1 ? "" : "s"}
            </Button>
          )}
          {scanning && (
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {scanLabel}
            </span>
          )}
        </div>

        {repairing && repairProgress && (
          <div className="space-y-1">
            <Progress value={(repairProgress.done / Math.max(1, repairProgress.total)) * 100} />
            <p className="text-xs text-muted-foreground">
              Repairing {repairProgress.done} of {repairProgress.total}
            </p>
          </div>
        )}

        {bucketErrors.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-1">
            <p className="font-medium text-destructive">Some buckets could not be listed</p>
            {bucketErrors.map(e => (
              <p key={e.bucket} className="text-muted-foreground">
                <span className="font-mono">{e.bucket}</span>: {e.error}
              </p>
            ))}
          </div>
        )}

        {scan && (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Bucket</th>
                  <th className="text-right px-3 py-2">Checked</th>
                  <th className="text-right px-3 py-2">OK</th>
                  <th className="text-right px-3 py-2">Need repair</th>
                  <th className="text-right px-3 py-2">Other images</th>
                  <th className="text-right px-3 py-2">Not images</th>
                </tr>
              </thead>
              <tbody>
                {perBucket.map(([bucket, r]) => (
                  <tr key={bucket} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">
                      {bucket}
                      {r.listingFailed && <span className="ml-2 text-destructive">listing failed</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.checked}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ok}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{r.repairable}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.displayable}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.notImage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {scan.skipped > 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                {scan.skipped} non-image file{scan.skipped === 1 ? "" : "s"} (PDFs, documents) skipped without reading.
              </p>
            )}
            {displayableCount > 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                {displayableCount} browser-displayable image{displayableCount === 1 ? "" : "s"} (WebP, GIF, SVG…) left untouched.
              </p>
            )}
          </div>
        )}

        {repairable.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Images needing repair</p>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <ul className="divide-y">
                {repairable.slice(0, 300).map(o => (
                  <li key={`${o.bucket}/${o.path}`} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                    <span className="font-mono truncate">{o.bucket}/{o.path}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline">{o.verdict.kind === "repairable" ? o.verdict.label : ""}</Badge>
                      <span className="text-muted-foreground tabular-nums">{formatBytes(o.size)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {repairable.length > 300 && (
              <p className="text-xs text-muted-foreground">Showing the first 300 of {repairable.length}.</p>
            )}
          </div>
        )}

        {notImages.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {notImages.length} object{notImages.length === 1 ? "" : "s"} with an image name but non-image contents
            (for example a stored error page) were left untouched — review them manually.
          </p>
        )}

        {outcomes.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Repair results</p>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <ul className="divide-y">
                {outcomes.slice(-300).map(o => (
                  <li key={`${o.bucket}/${o.path}`} className="px-3 py-1.5 text-xs space-y-0.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono truncate">{o.bucket}/{o.path}</span>
                      {o.status === "repaired" ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" variant="secondary">
                          {o.format.toUpperCase()} · {formatBytes(o.before)} → {formatBytes(o.after)}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Failed</Badge>
                      )}
                    </div>
                    {o.status === "failed" && <p className="text-destructive">{o.error}</p>}
                    {o.status === "repaired" && o.note && <p className="text-muted-foreground">{o.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Browsers and the app's offline cache may keep showing the old version of a repaired image for up to a week.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
