import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Zap, Trash2, RefreshCw, ShieldCheck, Gauge, AlertTriangle, CheckCircle2, Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { AssetTable } from "./AssetTable";
import { AssetComparisonTable } from "./AssetComparisonTable";
import { MeterRegister } from "./MeterRegister";
import { SiteShopsEditor } from "./SiteShopsEditor";
import {
  parseAssetRows,
  dedupeParsedAssets,
  buildInspectionMeterMatches,
  buildInspectionMeterRows,
  buildComparisonResults,
  summarizeResults,
  findUnregisteredMeters,
  type ParsedAsset,
  type InspectionRecord,
  type SiteShop,
} from "@/lib/assetVerification";
import { syncSubsectionSerialsFromRegister, describeSync, type SyncResult } from "./syncSubsectionSerials";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AssetVerificationProps {
  siteId: string;
  siteName: string;
  readOnly?: boolean;
  accessToken?: string; // public review: read via token-scoped RPC, not tables
}

// Shape shared by the child tables (superset of what AssetComparisonTable + AssetTable consume).
interface SiteAssetRow {
  id: string;
  premises_id: string;
  trade_as: string | null;
  asset_category: string;
  meter_serial_number: string | null;
  meter_type: string | null;
  ct_ratio: string | null;
  breaker_size: string | null;
  reading_at_commissioning: string | null;
  old_meter_serial_number: string | null;
  last_meter_read_old: string | null;
  tag: string | null;
  mbus_gateway_index: string | null;
  comments: string | null;
}

const MAX_IMPORT_BYTES = 10 * 1024 * 1024; // 10MB
// Stable empty default so an unloaded query does not hand the memos a new array every render.
const NO_ROWS: never[] = [];

export const AssetVerification = ({ siteId, siteName, readOnly = false, accessToken }: AssetVerificationProps) => {
  const [uploading, setUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Re-import replaces the existing register; hold the parsed rows until the user confirms.
  const [pendingImport, setPendingImport] = useState<ParsedAsset[] | null>(null);
  const queryClient = useQueryClient();

  // Public (anonymous) review reads through the token-scoped RPC; admin and authenticated
  // client-portal modes keep direct table reads.
  const isPublic = readOnly && !!accessToken;

  const {
    data: review,
    isLoading: reviewLoading,
    isError: reviewError,
    refetch: refetchReview,
  } = useQuery({
    queryKey: ["public-site-review-assets", siteId, accessToken],
    enabled: isPublic,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_public_site_review", { p_token: accessToken!, p_site_id: siteId });
      if (error) throw error;
      return (data ?? {}) as Record<string, unknown>;
    },
  });

  const {
    data: assetsDirect = NO_ROWS,
    isLoading: assetsLoading,
    isError: assetsError,
    refetch,
  } = useQuery({
    queryKey: ["site-assets", siteId],
    enabled: !isPublic,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_assets")
        .select("*")
        .eq("site_id", siteId)
        .order("premises_id");

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch inspections with tenant data (meter serial, CT ratio, breaker, images)
  const { data: inspectionsDirect = NO_ROWS } = useQuery({
    queryKey: ["site-inspections-tenants", siteId],
    enabled: !isPublic,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("id, title, subsection_id, json_data")
        .eq("site_id", siteId)
        .not("json_data", "is", null)
        // Deterministic: when two inspections record the same meter, the newest one is used.
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Subsections are the shops (and boards) found on site: name, shop number, tenant and the
  // meter serial captured there. They tie register rows to site data by shop number.
  const { data: subsectionsDirect = NO_ROWS } = useQuery({
    queryKey: ["site-subsections-names", siteId],
    enabled: !isPublic,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsections")
        .select("id, name, tenant_name, meter_serial_number, shop_number")
        .eq("site_id", siteId)
        .is("deleted_at", null)
        .order("name");

      if (error) throw error;
      return data || [];
    },
  });

  // Resolve from the RPC payload in public mode, otherwise from the direct queries.
  // Memoized so the reconciliation below only re-runs when the data actually changes.
  const assets = useMemo(
    () => ((isPublic ? review?.site_assets ?? [] : assetsDirect) as unknown) as SiteAssetRow[],
    [isPublic, review, assetsDirect],
  );
  const inspectionsWithTenants = useMemo(
    () =>
      (isPublic
        ? ((review?.inspections ?? []) as InspectionRecord[]).filter((i) => i.json_data != null)
        : inspectionsDirect) as InspectionRecord[],
    [isPublic, review, inspectionsDirect],
  );
  const subsections = useMemo(
    () => (isPublic ? ((review?.subsections ?? []) as SiteShop[]) : subsectionsDirect) as SiteShop[],
    [isPublic, review, subsectionsDirect],
  );
  const isLoading = isPublic ? reviewLoading : assetsLoading;
  const isError = isPublic ? reviewError : assetsError;
  const retry = () => (isPublic ? refetchReview() : refetch());
  // No import until the existing register is known — see handleFileUpload.
  const importBlocked = uploading || isLoading || isError;

  // Electrical-only: water meters are out of scope for this feature.
  const electricalAssets = useMemo(() => assets.filter((a) => a.asset_category === "electrical_meter"), [assets]);

  const inspectionMeterMatches = useMemo(
    () => buildInspectionMeterMatches(inspectionsWithTenants, subsections),
    [inspectionsWithTenants, subsections],
  );
  const meterRows = useMemo(
    () => buildInspectionMeterRows(inspectionsWithTenants, subsections),
    [inspectionsWithTenants, subsections],
  );

  // One reconciliation for every surface (cards, table, shops tab, PDF) so they can never disagree.
  const comparisonResults = useMemo(
    () => buildComparisonResults(electricalAssets, inspectionMeterMatches, subsections),
    [electricalAssets, inspectionMeterMatches, subsections],
  );
  const unregisteredMeters = useMemo(
    () => findUnregisteredMeters(meterRows, comparisonResults),
    [meterRows, comparisonResults],
  );
  const verifiedCount = useMemo(() => summarizeResults(comparisonResults).verifiedNoDiscrepancy, [comparisonResults]);

  const refreshSiteData = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["site-inspections-tenants", siteId] });
    queryClient.invalidateQueries({ queryKey: ["site-subsections-names", siteId] });
  };

  const parseExcelFile = async (file: File): Promise<ParsedAsset[]> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as (string | number)[][];
    return parseAssetRows(rows);
  };

  // A register import is always the full electrical asset list for the site, so it always
  // replaces — there is no append. Delete and insert run in one database transaction
  // (replace_site_register): either the new register is in place or the old one is untouched.
  // The old browser-side insert-then-delete left the whole register twice whenever the delete
  // was skipped or failed.
  const importRegister = async (parsedAssets: ParsedAsset[]) => {
    const hadRegister = electricalAssets.length > 0;
    setUploading(true);
    try {
      const { error: replaceError } = await supabase.rpc("replace_site_register", {
        p_site_id: siteId,
        p_rows: parsedAssets as unknown as Json,
      });
      if (replaceError) throw replaceError;

      // Root cause of "linked but no photos" and understated metering: subsections.meter_serial_number
      // was never populated from the register. Write it through now — blank-only, never overwriting —
      // exactly as the manual subsection form does (serial + metering_status together).
      let sync: SyncResult | null = null;
      try {
        sync = await syncSubsectionSerialsFromRegister(siteId, parsedAssets);
      } catch (syncError) {
        console.error("Subsection serial sync failed:", syncError);
        toast.warning("Register imported, but meter serials could not be linked to subsections.");
      }

      toast.success(
        `${hadRegister ? "Replaced register with" : "Imported"} ${parsedAssets.length} electrical meter${parsedAssets.length === 1 ? "" : "s"}`,
      );
      if (sync) {
        const summary = describeSync(sync);
        if (summary.success) toast.success(summary.success);
        if (summary.warning) toast.warning(summary.warning, { duration: 10000 });
      }
      setPendingImport(null);
      refetch();
    } catch (error) {
      console.error("Error importing assets:", error);
      toast.error("Failed to import assets — the existing register was not changed");
      if (hadRegister) setPendingImport(parsedAssets); // preserve parsed rows for one-click retry
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    // Until the current register has loaded we cannot tell whether this import replaces one,
    // so the replace confirmation would be skipped. Refuse rather than guess.
    if (isLoading || isError) {
      toast.error(
        isError
          ? "Couldn't load this site's existing register. Refresh before importing."
          : "Still loading this site's existing register — try again in a moment.",
      );
      return;
    }

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast.error("Please upload an Excel file (.xlsx or .xls)");
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error("File is too large (max 10MB)");
      return;
    }

    setUploading(true);
    let parsedAssets: ParsedAsset[];
    try {
      toast.info("Parsing Excel file...");
      const { assets, duplicates } = dedupeParsedAssets(await parseExcelFile(file));
      parsedAssets = assets;
      if (duplicates.length > 0) {
        const names = [...new Set(duplicates.map((d) => d.premises_id))];
        toast.warning(
          `The file lists ${duplicates.length} meter${duplicates.length === 1 ? "" : "s"} more than once (same premises and serial) — imported once: ${names.slice(0, 5).join(", ")}${names.length > 5 ? ", …" : ""}`,
          { duration: 10000 },
        );
      }
    } catch (error) {
      console.error("Excel parsing error:", error);
      toast.error("Could not read that Excel file");
      setUploading(false);
      return;
    }
    setUploading(false);

    if (parsedAssets.length === 0) {
      toast.error("No electrical meters found in the file");
      return;
    }

    // If a register already exists, confirm replacement before writing.
    if (electricalAssets.length > 0) {
      setPendingImport(parsedAssets);
      return;
    }
    await importRegister(parsedAssets);
  };

  const handleDeleteAllAssets = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("site_assets").delete().eq("site_id", siteId);

      if (error) throw error;

      toast.success("All assets deleted successfully");
      setDeleteDialogOpen(false);
      refetch();
    } catch (error) {
      console.error("Error deleting assets:", error);
      toast.error("Failed to delete assets");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Asset Verification</h2>
          <p className="text-muted-foreground">
            Manage and verify electrical meters for {siteName}
          </p>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => retry()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {electricalAssets.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            )}
            <label htmlFor="excel-upload">
              <Button asChild disabled={importBlocked}>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? "Importing..." : "Import Excel"}
                </span>
              </Button>
            </label>
            <input
              id="excel-upload"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
              disabled={importBlocked}
            />
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <CardDescription>Electrical Meters</CardDescription>
            </div>
            <CardTitle className="text-3xl">{electricalAssets.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <CardDescription>Verified via inspections</CardDescription>
            </div>
            <CardTitle className="text-3xl">{verifiedCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Asset Tables */}
      {isError ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Unable to load assets</h3>
            <p className="text-muted-foreground max-w-md mb-4">
              Something went wrong loading the asset data. Please try again.
            </p>
            <Button variant="outline" onClick={() => retry()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : electricalAssets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-2">No Assets Available</h3>
            <p className="text-muted-foreground max-w-md mb-4">
              {readOnly
                ? "No asset data has been imported for this site yet."
                : "Upload an Excel asset register to import electrical meter data for this site."}
            </p>
            {!readOnly && (
              <>
                <label htmlFor="excel-upload-empty">
                  <Button asChild>
                    <span>
                      <Upload className="h-4 w-4 mr-2" />
                      Import Asset Register
                    </span>
                  </Button>
                </label>
                <input
                  id="excel-upload-empty"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={importBlocked}
                />
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="verification" className="space-y-4">
          <TabsList>
            <TabsTrigger value="verification" className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              Verification
            </TabsTrigger>
            <TabsTrigger value="site-shops" className="gap-2">
              <Store className="h-4 w-4" />
              Shops on site
              {unregisteredMeters.length > 0 && (
                <Badge variant="secondary" className="ml-1" title="Meters found on site with no register row">
                  {unregisteredMeters.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="meter-register" className="gap-2">
              <Gauge className="h-4 w-4" />
              Meter Register
            </TabsTrigger>
            <TabsTrigger value="electrical" className="gap-2">
              <Zap className="h-4 w-4" />
              Electrical Meters
              <Badge variant="secondary" className="ml-1">
                {electricalAssets.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="verification">
            <AssetComparisonTable
              comparisonResults={comparisonResults}
              unregisteredMeters={unregisteredMeters}
              siteId={siteId}
              siteName={siteName}
              readOnly={readOnly}
              onDataUpdated={refreshSiteData}
            />
          </TabsContent>

          <TabsContent value="site-shops">
            <SiteShopsEditor
              siteShops={subsections}
              meterRows={meterRows}
              comparisonResults={comparisonResults}
              unregisteredMeters={unregisteredMeters}
              readOnly={readOnly}
              onDataUpdated={refreshSiteData}
            />
          </TabsContent>

          <TabsContent value="meter-register">
            <MeterRegister siteId={siteId} siteName={siteName} readOnly={readOnly} />
          </TabsContent>

          <TabsContent value="electrical">
            <AssetTable assets={electricalAssets} type="electrical" onRefresh={refetch} readOnly={readOnly} />
          </TabsContent>
        </Tabs>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Assets?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {electricalAssets.length} electrical meters from this site. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAllAssets}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Replace-on-import Confirmation Dialog */}
      <AlertDialog open={!!pendingImport} onOpenChange={(open) => !open && setPendingImport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing register?</AlertDialogTitle>
            <AlertDialogDescription>
              This site already has {electricalAssets.length} electrical meter{electricalAssets.length === 1 ? "" : "s"}.
              Importing will replace them with the {pendingImport?.length ?? 0} meter
              {(pendingImport?.length ?? 0) === 1 ? "" : "s"} from this file. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={uploading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const toImport = pendingImport;
                setPendingImport(null);
                if (toImport) await importRegister(toImport);
              }}
              disabled={uploading}
            >
              {uploading ? "Replacing..." : "Replace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
