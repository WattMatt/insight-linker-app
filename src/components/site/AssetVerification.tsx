import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Zap, Droplets, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { AssetTable } from "./AssetTable";
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
}

interface ParsedAsset {
  premises_id: string;
  trade_as: string;
  asset_category: "electrical_meter" | "water_meter";
  meter_serial_number: string;
  meter_type?: string;
  ct_ratio?: string;
  breaker_size?: string;
  reading_at_commissioning?: string;
  old_meter_serial_number?: string;
  last_meter_read_old?: string;
  tag?: string;
  mbus_gateway_index?: string;
  comments?: string;
}

export const AssetVerification = ({ siteId, siteName }: AssetVerificationProps) => {
  const [uploading, setUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const { data: assets = [], isLoading, refetch } = useQuery({
    queryKey: ["site-assets", siteId],
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

  const electricalAssets = assets.filter((a) => a.asset_category === "electrical_meter");
  const waterAssets = assets.filter((a) => a.asset_category === "water_meter");

  const parseExcelFile = async (file: File): Promise<ParsedAsset[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];

          const parsedAssets: ParsedAsset[] = [];
          let currentSection: "electrical" | "water" | null = null;

          for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0 || !row[0]) continue;

            const firstCell = String(row[0] || "").trim();

            // Detect section headers
            if (firstCell === "Premises ID") {
              // Check if this is electrical or water section by looking at headers
              const headers = row.map((h) => String(h || "").toLowerCase());
              if (headers.includes("breaker size") || headers.includes("ct ratio")) {
                currentSection = "electrical";
              } else if (headers.includes("m-bus gateway index") || headers.includes("tag")) {
                currentSection = "water";
              }
              continue;
            }

            // Skip empty or header rows
            if (!firstCell || firstCell.startsWith("Premises")) continue;

            if (currentSection === "electrical" && firstCell.startsWith("YA")) {
              const asset: ParsedAsset = {
                premises_id: firstCell,
                trade_as: String(row[1] || ""),
                asset_category: "electrical_meter",
                meter_type: String(row[2] || ""),
                ct_ratio: String(row[3] || ""),
                meter_serial_number: String(row[4] || ""),
                breaker_size: String(row[5] || ""),
                reading_at_commissioning: String(row[6] || ""),
                old_meter_serial_number: String(row[7] || ""),
                last_meter_read_old: String(row[8] || ""),
                comments: String(row[9] || ""),
              };
              if (asset.meter_serial_number) {
                parsedAssets.push(asset);
              }
            } else if (currentSection === "water" && firstCell.startsWith("YA")) {
              const asset: ParsedAsset = {
                premises_id: firstCell,
                trade_as: String(row[1] || ""),
                asset_category: "water_meter",
                meter_serial_number: String(row[2] || ""),
                tag: String(row[3] || ""),
                mbus_gateway_index: String(row[4] || ""),
                reading_at_commissioning: String(row[5] || ""),
                last_meter_read_old: String(row[6] || ""),
                comments: String(row[7] || ""),
              };
              if (asset.meter_serial_number && asset.meter_serial_number !== "TBC" && asset.meter_serial_number !== "NO WATER SUPPLY") {
                parsedAssets.push(asset);
              }
            }
          }

          resolve(parsedAssets);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast.error("Please upload an Excel file (.xlsx or .xls)");
      return;
    }

    setUploading(true);
    try {
      toast.info("Parsing Excel file...");
      const parsedAssets = await parseExcelFile(file);

      if (parsedAssets.length === 0) {
        toast.error("No valid assets found in the file");
        return;
      }

      toast.info(`Found ${parsedAssets.length} assets. Importing...`);

      const importBatchId = crypto.randomUUID();
      const { data: user } = await supabase.auth.getUser();

      const assetsToInsert = parsedAssets.map((asset) => ({
        site_id: siteId,
        premises_id: asset.premises_id,
        trade_as: asset.trade_as || null,
        asset_category: asset.asset_category,
        meter_serial_number: asset.meter_serial_number || null,
        meter_type: asset.meter_type || null,
        ct_ratio: asset.ct_ratio || null,
        breaker_size: asset.breaker_size || null,
        reading_at_commissioning: asset.reading_at_commissioning || null,
        old_meter_serial_number: asset.old_meter_serial_number || null,
        last_meter_read_old: asset.last_meter_read_old || null,
        tag: asset.tag || null,
        mbus_gateway_index: asset.mbus_gateway_index || null,
        comments: asset.comments || null,
        created_by: user?.user?.id || null,
        import_batch_id: importBatchId,
      }));

      const { error } = await supabase.from("site_assets").insert(assetsToInsert);

      if (error) throw error;

      const electricalCount = parsedAssets.filter((a) => a.asset_category === "electrical_meter").length;
      const waterCount = parsedAssets.filter((a) => a.asset_category === "water_meter").length;

      toast.success(
        `Imported ${parsedAssets.length} assets (${electricalCount} electrical, ${waterCount} water meters)`
      );
      refetch();
    } catch (error) {
      console.error("Error importing assets:", error);
      toast.error("Failed to import assets");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
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
            Manage and verify assets for {siteName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {assets.length > 0 && (
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
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Assets</CardDescription>
            <CardTitle className="text-3xl">{assets.length}</CardTitle>
          </CardHeader>
        </Card>
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
              <Droplets className="h-4 w-4 text-blue-500" />
              <CardDescription>Water Meters</CardDescription>
            </div>
            <CardTitle className="text-3xl">{waterAssets.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Asset Tables */}
      {assets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-2">No Assets Imported</h3>
            <p className="text-muted-foreground max-w-md mb-4">
              Upload an Excel asset register to import electrical and water meter data for this site.
            </p>
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
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="electrical" className="space-y-4">
          <TabsList>
            <TabsTrigger value="electrical" className="gap-2">
              <Zap className="h-4 w-4" />
              Electrical Meters
              <Badge variant="secondary" className="ml-1">
                {electricalAssets.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="water" className="gap-2">
              <Droplets className="h-4 w-4" />
              Water Meters
              <Badge variant="secondary" className="ml-1">
                {waterAssets.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="electrical">
            <AssetTable assets={electricalAssets} type="electrical" onRefresh={refetch} />
          </TabsContent>

          <TabsContent value="water">
            <AssetTable assets={waterAssets} type="water" onRefresh={refetch} />
          </TabsContent>
        </Tabs>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Assets?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {assets.length} assets from this site. This action cannot be undone.
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
    </div>
  );
};
