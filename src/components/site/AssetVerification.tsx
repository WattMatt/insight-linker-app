import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Zap, Droplets, Trash2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { AssetTable } from "./AssetTable";
import { AssetComparisonTable } from "./AssetComparisonTable";
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

  // Fetch subsections for comparison
  const { data: subsections = [] } = useQuery({
    queryKey: ["site-subsections-for-comparison", siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsections")
        .select("id, name, meter_serial_number, ct_ratio, tenant_name")
        .eq("site_id", siteId)
        .order("name");

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch inspections with tenant images for each subsection
  const { data: inspectionsWithImages = [] } = useQuery({
    queryKey: ["site-inspections-images", siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("subsection_id, json_data")
        .eq("site_id", siteId)
        .not("json_data", "is", null);

      if (error) throw error;
      return data || [];
    },
  });

  // Build a map of subsection ID -> tenant images
  const subsectionImages = inspectionsWithImages.reduce<Record<string, { breakerImage?: string; ctRatioImage?: string; meterImage?: string }>>((acc, inspection) => {
    if (!inspection.subsection_id || !inspection.json_data) return acc;
    
    const jsonData = inspection.json_data as { tenants?: Array<{ breakerImage?: string; ctRatioImage?: string; meterImage?: string }> };
    const tenants = jsonData.tenants || [];
    
    // Get the first tenant with images (or combine from all tenants)
    for (const tenant of tenants) {
      if (!acc[inspection.subsection_id]) {
        acc[inspection.subsection_id] = {};
      }
      if (tenant.breakerImage && !acc[inspection.subsection_id].breakerImage) {
        acc[inspection.subsection_id].breakerImage = tenant.breakerImage;
      }
      if (tenant.ctRatioImage && !acc[inspection.subsection_id].ctRatioImage) {
        acc[inspection.subsection_id].ctRatioImage = tenant.ctRatioImage;
      }
      if (tenant.meterImage && !acc[inspection.subsection_id].meterImage) {
        acc[inspection.subsection_id].meterImage = tenant.meterImage;
      }
    }
    
    return acc;
  }, {});

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
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as (string | number)[][];

          console.log("Sheet names:", workbook.SheetNames);
          console.log("Total rows:", jsonData.length);

          const parsedAssets: ParsedAsset[] = [];
          let currentSection: "electrical" | "water" | null = null;
          let headerRow: (string | number)[] | null = null;
          let columnMap: Record<string, number> = {};

          const normalizeHeader = (header: string) => {
            return header.toLowerCase().replace(/[^a-z0-9]/g, "");
          };

          for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;

            const firstCell = String(row[0] || "").trim().toUpperCase();
            const secondCell = String(row[1] || "").trim().toUpperCase();

            // Detect section type by looking for "ELECTRICAL" or "WATER" labels
            if (firstCell === "ELECTRICAL" || secondCell === "ELECTRICAL") {
              currentSection = "electrical";
              console.log("Found ELECTRICAL section marker at row", i);
              continue;
            }
            if (firstCell === "WATER" || secondCell === "WATER") {
              currentSection = "water";
              console.log("Found WATER section marker at row", i);
              continue;
            }

            // Detect header rows (contains "Premises ID")
            const rowStrings = row.map((cell) => String(cell || "").toLowerCase());
            const hasPremisesId = rowStrings.some((cell) => cell.includes("premises id"));
            
            if (hasPremisesId) {
              headerRow = row;
              columnMap = {};
              row.forEach((cell, idx) => {
                const normalized = normalizeHeader(String(cell || ""));
                if (normalized) columnMap[normalized] = idx;
              });
              console.log("Found header row at", i, "for section:", currentSection);
              console.log("Column map:", columnMap);
              continue;
            }

            // Skip if we don't have a section or headers yet
            if (!currentSection || !headerRow || Object.keys(columnMap).length === 0) continue;

            // Get premises ID - could be in different columns
            const premisesIdIdx = columnMap["premisesid"] ?? columnMap["premiseid"] ?? 1;
            const premisesId = String(row[premisesIdIdx] || "").trim();

            // Skip empty rows or header-like rows
            if (!premisesId || premisesId.toLowerCase().includes("premises")) continue;

            // Helper to get column value
            const getCol = (keys: string[]): string => {
              for (const key of keys) {
                if (columnMap[key] !== undefined) {
                  return String(row[columnMap[key]] || "").trim();
                }
              }
              return "";
            };

            if (currentSection === "electrical") {
              const meterSerial = getCol(["meterserialnumber", "meterserno", "serialnumber", "serial"]);
              
              const asset: ParsedAsset = {
                premises_id: premisesId,
                trade_as: getCol(["tradeas", "trade", "tenant"]) || getCol(["tenant"]),
                asset_category: "electrical_meter",
                meter_type: getCol(["directdcurrenttransformerct", "directcurrenttransformer", "type", "metertype"]),
                ct_ratio: getCol(["ctratio", "ratio"]),
                meter_serial_number: meterSerial,
                breaker_size: getCol(["breakersize", "breaker"]),
                reading_at_commissioning: getCol(["readingatcomissioningofnewmeter", "readingatcommissioning", "reading"]),
                old_meter_serial_number: getCol(["oldmeterserialnumber", "oldmeterserial", "oldserial"]),
                last_meter_read_old: getCol(["lastmeterreadofoldmeter", "lastmeterread"]),
                comments: getCol(["comments", "comment", "notes"]),
              };

              if (meterSerial && meterSerial.length > 0) {
                parsedAssets.push(asset);
              }
            } else if (currentSection === "water") {
              const meterSerial = getCol(["meterserialnumber", "meterserno", "serialnumber", "serial"]);
              
              // Skip invalid meter serials
              if (!meterSerial || meterSerial === "TBC" || meterSerial.toLowerCase().includes("no water")) {
                continue;
              }

              const asset: ParsedAsset = {
                premises_id: premisesId,
                trade_as: getCol(["tradeas", "trade", "tenant"]) || getCol(["tenant"]),
                asset_category: "water_meter",
                meter_serial_number: meterSerial,
                tag: getCol(["tag"]),
                mbus_gateway_index: getCol(["mbusgatewayindex", "mbusindex", "gatewayindex"]),
                reading_at_commissioning: getCol(["readingatcomissioningofnewmeter", "readingatcommissioning", "reading"]),
                last_meter_read_old: getCol(["lastmeterreadofoldmeter", "lastmeterread"]),
                comments: getCol(["comments", "comment", "notes"]),
              };

              parsedAssets.push(asset);
            }
          }

          console.log("Total parsed assets:", parsedAssets.length);
          if (parsedAssets.length > 0) {
            console.log("Sample assets:", parsedAssets.slice(0, 3));
          }

          resolve(parsedAssets);
        } catch (error) {
          console.error("Excel parsing error:", error);
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
        <Tabs defaultValue="verification" className="space-y-4">
          <TabsList>
            <TabsTrigger value="verification" className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              Verification
            </TabsTrigger>
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

          <TabsContent value="verification">
            <AssetComparisonTable 
              assets={electricalAssets} 
              subsections={subsections}
              subsectionImages={subsectionImages}
            />
          </TabsContent>

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
