import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Zap, Trash2, RefreshCw, ShieldCheck, Gauge, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { AssetTable } from "./AssetTable";
import { AssetComparisonTable } from "./AssetComparisonTable";
import { MeterRegister } from "./MeterRegister";
import {
  parseAssetRows,
  buildInspectionMeterMatches,
  buildComparisonResults,
  type ParsedAsset,
  type InspectionRecord,
  type SubsectionNameRecord,
} from "@/lib/assetVerification";
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
    data: assetsDirect = [],
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
  const { data: inspectionsDirect = [] } = useQuery({
    queryKey: ["site-inspections-tenants", siteId],
    enabled: !isPublic,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("id, title, subsection_id, json_data")
        .eq("site_id", siteId)
        .not("json_data", "is", null);

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch subsection names for display purposes
  const { data: subsectionsDirect = [] } = useQuery({
    queryKey: ["site-subsections-names", siteId],
    enabled: !isPublic,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsections")
        .select("id, name")
        .eq("site_id", siteId);

      if (error) throw error;
      return data || [];
    },
  });

  // Resolve from the RPC payload in public mode, otherwise from the direct queries.
  const assets = ((isPublic ? review?.site_assets ?? [] : assetsDirect) as unknown) as SiteAssetRow[];
  const inspectionsWithTenants = (
    isPublic ? ((review?.inspections ?? []) as InspectionRecord[]).filter((i) => i.json_data != null) : inspectionsDirect
  ) as InspectionRecord[];
  const subsections = (isPublic ? ((review?.subsections ?? []) as SubsectionNameRecord[]) : subsectionsDirect) as SubsectionNameRecord[];
  const isLoading = isPublic ? reviewLoading : assetsLoading;
  const isError = isPublic ? reviewError : assetsError;
  const retry = () => (isPublic ? refetchReview() : refetch());

  // Electrical-only: water meters are out of scope for this feature.
  const electricalAssets = assets.filter((a) => a.asset_category === "electrical_meter");

  const inspectionMeterMatches = useMemo(
    () => buildInspectionMeterMatches(inspectionsWithTenants, subsections),
    [inspectionsWithTenants, subsections],
  );

  // Same definition as the verification table's green "Verified" card: matched AND no discrepancy.
  const verifiedCount = useMemo(
    () =>
      buildComparisonResults(electricalAssets, inspectionMeterMatches).filter((r) => r.verified && !r.hasDiscrepancy)
        .length,
    [electricalAssets, inspectionMeterMatches],
  );

  const parseExcelFile = async (file: File): Promise<ParsedAsset[]> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as (string | number)[][];
    return parseAssetRows(rows);
  };

  const insertAssets = async (parsedAssets: ParsedAsset[], replaceExisting: boolean) => {
    setUploading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const importBatchId = crypto.randomUUID();

      const assetsToInsert = parsedAssets.map((asset) => ({
        site_id: siteId,
        premises_id: asset.premises_id,
        trade_as: asset.trade_as || null,
        asset_category: "electrical_meter" as const,
        meter_serial_number: asset.meter_serial_number || null,
        meter_type: asset.meter_type || null,
        ct_ratio: asset.ct_ratio || null,
        breaker_size: asset.breaker_size || null,
        reading_at_commissioning: asset.reading_at_commissioning || null,
        old_meter_serial_number: asset.old_meter_serial_number || null,
        last_meter_read_old: asset.last_meter_read_old || null,
        comments: asset.comments || null,
        created_by: user?.user?.id || null,
        import_batch_id: importBatchId,
      }));

      // Insert the new batch first so a failure here never destroys the existing register.
      const { error: insertError } = await supabase.from("site_assets").insert(assetsToInsert);
      if (insertError) throw insertError;

      // Replace semantics: a register import represents the full electrical asset list for the
      // site. With the new rows safely in, drop the previous electrical rows (anything not in
      // this batch). If cleanup fails the user only sees duplicates, not data loss.
      if (replaceExisting) {
        const { error: cleanupError } = await supabase
          .from("site_assets")
          .delete()
          .eq("site_id", siteId)
          .eq("asset_category", "electrical_meter")
          .or(`import_batch_id.is.null,import_batch_id.neq.${importBatchId}`);
        if (cleanupError) {
          console.error("Failed to clear previous register:", cleanupError);
          toast.warning("Imported new meters, but couldn't remove the old ones — you may see duplicates.");
        }
      }

      toast.success(
        `${replaceExisting ? "Replaced register with" : "Imported"} ${parsedAssets.length} electrical meter${parsedAssets.length === 1 ? "" : "s"}`,
      );
      setPendingImport(null);
      refetch();
    } catch (error) {
      console.error("Error importing assets:", error);
      toast.error("Failed to import assets");
      if (replaceExisting) setPendingImport(parsedAssets); // preserve parsed rows for one-click retry
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

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
      parsedAssets = await parseExcelFile(file);
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
    await insertAssets(parsedAssets, false);
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
              <Button asChild disabled={uploading}>
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
              disabled={uploading}
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
                  disabled={uploading}
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
              assets={electricalAssets}
              inspectionMeterMatches={inspectionMeterMatches}
              siteName={siteName}
              readOnly={readOnly}
              onDataUpdated={() => {
                refetch();
                queryClient.invalidateQueries({ queryKey: ["site-inspections-tenants", siteId] });
              }}
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
                if (toImport) await insertAssets(toImport, true);
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
