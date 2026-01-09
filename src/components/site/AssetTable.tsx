import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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

interface Asset {
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

interface AssetTableProps {
  assets: Asset[];
  type: "electrical" | "water";
  onRefresh: () => void;
}

export const AssetTable = ({ assets, type, onRefresh }: AssetTableProps) => {
  const [search, setSearch] = useState("");
  const [deleteAssetId, setDeleteAssetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredAssets = assets.filter((asset) => {
    const searchLower = search.toLowerCase();
    return (
      asset.premises_id.toLowerCase().includes(searchLower) ||
      asset.trade_as?.toLowerCase().includes(searchLower) ||
      asset.meter_serial_number?.toLowerCase().includes(searchLower)
    );
  });

  const handleDeleteAsset = async () => {
    if (!deleteAssetId) return;

    setDeleting(true);
    try {
      const { error } = await supabase.from("site_assets").delete().eq("id", deleteAssetId);

      if (error) throw error;

      toast.success("Asset deleted successfully");
      setDeleteAssetId(null);
      onRefresh();
    } catch (error) {
      console.error("Error deleting asset:", error);
      toast.error("Failed to delete asset");
    } finally {
      setDeleting(false);
    }
  };

  const getMeterTypeBadge = (meterType: string | null) => {
    if (!meterType) return null;
    const type = meterType.toUpperCase();
    if (type.includes("CT")) {
      return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">CT</Badge>;
    }
    if (type.includes("3PH")) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">3PH Direct</Badge>;
    }
    if (type.includes("1PH")) {
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">1PH Direct</Badge>;
    }
    return <Badge variant="outline">{meterType}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="text-lg">
            {type === "electrical" ? "Electrical Meters" : "Water Meters"}
          </CardTitle>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">Premises ID</TableHead>
                <TableHead className="min-w-[180px]">Trade As</TableHead>
                {type === "electrical" && (
                  <>
                    <TableHead>Type</TableHead>
                    <TableHead>CT Ratio</TableHead>
                    <TableHead>Breaker</TableHead>
                  </>
                )}
                <TableHead className="min-w-[120px]">Meter Serial</TableHead>
                {type === "water" && (
                  <>
                    <TableHead>Tag</TableHead>
                    <TableHead>M-Bus Index</TableHead>
                  </>
                )}
                <TableHead>Comments</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={type === "electrical" ? 8 : 7} className="text-center py-8 text-muted-foreground">
                    {search ? "No assets match your search" : "No assets found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAssets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.premises_id}</TableCell>
                    <TableCell>{asset.trade_as || "-"}</TableCell>
                    {type === "electrical" && (
                      <>
                        <TableCell>{getMeterTypeBadge(asset.meter_type)}</TableCell>
                        <TableCell>{asset.ct_ratio || "-"}</TableCell>
                        <TableCell>{asset.breaker_size || "-"}</TableCell>
                      </>
                    )}
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {asset.meter_serial_number || "-"}
                      </code>
                    </TableCell>
                    {type === "water" && (
                      <>
                        <TableCell>{asset.tag || "-"}</TableCell>
                        <TableCell>{asset.mbus_gateway_index || "-"}</TableCell>
                      </>
                    )}
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                      {asset.comments || "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteAssetId(asset.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          Showing {filteredAssets.length} of {assets.length} {type === "electrical" ? "electrical" : "water"} meters
        </p>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteAssetId} onOpenChange={(open) => !open && setDeleteAssetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this asset. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAsset}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
