import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Search, CheckCircle2, AlertTriangle, XCircle, Image as ImageIcon, FileDown, Eye, Loader2, Pencil, Check, X } from "lucide-react";
import { RobustImage } from "@/components/RobustImage";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { generateAssetVerificationReport } from "@/lib/assetVerificationReportGenerator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Asset {
  id: string;
  premises_id: string;
  trade_as: string | null;
  meter_serial_number: string | null;
  ct_ratio: string | null;
  breaker_size: string | null;
  asset_category: string;
}

export interface InspectionTenantMatch {
  inspectionId: string;
  inspectionTitle: string;
  subsectionId: string | null;
  subsectionName?: string;
  shopName?: string;
  shopNumber?: string;
  meterSerialNumber: string;
  ctSizeAndRatio?: string;
  breakerSize?: string;
  meterImage?: string;
  ctRatioImage?: string;
  breakerImage?: string;
}

export interface ComparisonResult {
  asset: Asset;
  inspectionMatch: InspectionTenantMatch | null;
  verified: boolean;
  ctMatch: "match" | "mismatch" | "na";
  breakerMatch: "match" | "mismatch" | "na";
  hasDiscrepancy: boolean;
}

interface AssetComparisonTableProps {
  assets: Asset[];
  inspectionMeterMatches: Map<string, InspectionTenantMatch>;
  siteName: string;
  companyLogoUrl?: string | null;
  onDataUpdated?: () => void;
}

type EditingCell = {
  rowIndex: number;
  field: "meter_serial" | "ct_ratio" | "breaker_size";
  value: string;
} | null;

// Normalize meter serial for matching
const normalizeMeterSerial = (serial: string | null | undefined): string => {
  return (serial || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
};

// Compare two values
const compareValues = (
  assetValue: string | null | undefined,
  inspectionValue: string | null | undefined
): "match" | "mismatch" | "na" => {
  const normAsset = (assetValue || "").toUpperCase().replace(/[^A-Z0-9/]/g, "").trim();
  const normInspection = (inspectionValue || "").toUpperCase().replace(/[^A-Z0-9/]/g, "").trim();

  if ((!normAsset || normAsset === "NA" || normAsset === "TBC") && 
      (!normInspection || normInspection === "NA" || normInspection === "TBC")) {
    return "na";
  }

  if (!normAsset || normAsset === "NA" || normAsset === "TBC") return "na";
  if (!normInspection || normInspection === "NA" || normInspection === "TBC") return "na";

  return normAsset === normInspection ? "match" : "mismatch";
};

export const AssetComparisonTable = ({
  assets,
  inspectionMeterMatches,
  siteName,
  companyLogoUrl,
  onDataUpdated,
}: AssetComparisonTableProps) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "verified" | "discrepancies" | "unverified">("all");
  const [imageDialog, setImageDialog] = useState<{ url: string; title: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [saving, setSaving] = useState(false);

  // Build comparison results - match assets to inspections only
  const comparisonResults = useMemo((): ComparisonResult[] => {
    return assets.map(asset => {
      const normalizedSerial = normalizeMeterSerial(asset.meter_serial_number);
      const inspectionMatch = normalizedSerial && normalizedSerial !== "NA" && normalizedSerial !== "TBC"
        ? inspectionMeterMatches.get(normalizedSerial) || null
        : null;

      const ctMatch = inspectionMatch 
        ? compareValues(asset.ct_ratio, inspectionMatch.ctSizeAndRatio)
        : "na";
      
      const breakerMatch = inspectionMatch
        ? compareValues(asset.breaker_size, inspectionMatch.breakerSize)
        : "na";

      return {
        asset,
        inspectionMatch,
        verified: !!inspectionMatch,
        ctMatch,
        breakerMatch,
        hasDiscrepancy: ctMatch === "mismatch" || breakerMatch === "mismatch",
      };
    });
  }, [assets, inspectionMeterMatches]);

  // Filter results
  const filteredResults = useMemo(() => {
    let filtered = comparisonResults;

    switch (filter) {
      case "verified":
        filtered = filtered.filter((r) => r.verified && !r.hasDiscrepancy);
        break;
      case "discrepancies":
        filtered = filtered.filter((r) => r.hasDiscrepancy);
        break;
      case "unverified":
        filtered = filtered.filter((r) => !r.verified);
        break;
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((r) => {
        const assetName = r.asset.premises_id?.toLowerCase() || "";
        const tradeName = r.asset.trade_as?.toLowerCase() || "";
        const meterSerial = r.asset.meter_serial_number?.toLowerCase() || "";
        const shopName = r.inspectionMatch?.shopName?.toLowerCase() || "";
        return assetName.includes(searchLower) || tradeName.includes(searchLower) || 
               meterSerial.includes(searchLower) || shopName.includes(searchLower);
      });
    }

    return filtered;
  }, [comparisonResults, filter, search]);

  // Stats
  const stats = useMemo(() => {
    const verified = comparisonResults.filter((r) => r.verified);
    const withImages = comparisonResults.filter((r) => 
      r.inspectionMatch?.meterImage || r.inspectionMatch?.ctRatioImage || r.inspectionMatch?.breakerImage
    );
    return {
      total: comparisonResults.length,
      verified: verified.length,
      verifiedNoDiscrepancy: verified.filter((r) => !r.hasDiscrepancy).length,
      discrepancies: comparisonResults.filter((r) => r.hasDiscrepancy).length,
      unverified: comparisonResults.filter((r) => !r.verified).length,
      withImages: withImages.length,
    };
  }, [comparisonResults]);

  const getStatusBadge = (result: ComparisonResult) => {
    if (!result.verified) {
      return (
        <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
          <XCircle className="h-3 w-3 mr-1" />
          Not Verified
        </Badge>
      );
    }
    if (result.hasDiscrepancy) {
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Mismatch
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Verified
      </Badge>
    );
  };

  const getValueBadge = (status: "match" | "mismatch" | "na") => {
    switch (status) {
      case "match":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "mismatch":
        return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      default:
        return null;
    }
  };

  const handleSaveEdit = async (result: ComparisonResult, field: string, newValue: string) => {
    if (!result.asset) return;
    
    setSaving(true);
    try {
      const updateData: Record<string, string> = {};
      if (field === "meter_serial") updateData.meter_serial_number = newValue;
      if (field === "ct_ratio") updateData.ct_ratio = newValue;
      if (field === "breaker_size") updateData.breaker_size = newValue;
      
      const { error } = await supabase
        .from("site_assets")
        .update(updateData)
        .eq("id", result.asset.id);
        
      if (error) throw error;
      
      toast.success("Asset updated successfully");
      setEditingCell(null);
      onDataUpdated?.();
    } catch (error) {
      console.error("Error updating asset:", error);
      toast.error("Failed to update asset");
    } finally {
      setSaving(false);
    }
  };

  const handleExportReport = async () => {
    setGenerating(true);
    try {
      const reportStats = {
        total: stats.total,
        matched: stats.verified,
        matchedNoDiscrepancy: stats.verifiedNoDiscrepancy,
        discrepancies: stats.discrepancies,
        assetOnly: stats.unverified,
        subsectionOnly: 0,
        potentialMatches: 0,
      };
      
      // Convert to old format for report generator compatibility
      const convertedResults = comparisonResults.map(r => ({
        asset: r.asset,
        subsection: null,
        matchType: r.verified ? "matched" as const : "asset_only" as const,
        meterSerialMatch: r.verified ? "match" as const : "na" as const,
        ctRatioMatch: r.ctMatch,
        hasDiscrepancy: r.hasDiscrepancy,
      }));
      
      const result = await generateAssetVerificationReport({
        siteName,
        comparisonResults: convertedResults,
        stats: reportStats,
        companyLogoUrl,
      });
      
      // Download the blob
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success("Report exported successfully");
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const handlePreviewReport = async () => {
    setGenerating(true);
    try {
      const reportStats = {
        total: stats.total,
        matched: stats.verified,
        matchedNoDiscrepancy: stats.verifiedNoDiscrepancy,
        discrepancies: stats.discrepancies,
        assetOnly: stats.unverified,
        subsectionOnly: 0,
        potentialMatches: 0,
      };
      
      // Convert to old format for report generator compatibility
      const convertedResults = comparisonResults.map(r => ({
        asset: r.asset,
        subsection: null,
        matchType: r.verified ? "matched" as const : "asset_only" as const,
        meterSerialMatch: r.verified ? "match" as const : "na" as const,
        ctRatioMatch: r.ctMatch,
        hasDiscrepancy: r.hasDiscrepancy,
      }));
      
      const result = await generateAssetVerificationReport({
        siteName,
        comparisonResults: convertedResults,
        stats: reportStats,
        companyLogoUrl,
      });
      
      const url = URL.createObjectURL(result.blob);
      setPdfPreview({ url, filename: result.filename });
    } catch (error) {
      console.error("Error generating preview:", error);
      toast.error("Failed to generate preview");
    } finally {
      setGenerating(false);
    }
  };

  const renderEditableCell = (
    result: ComparisonResult,
    rowIndex: number,
    field: "meter_serial" | "ct_ratio" | "breaker_size",
    assetValue: string | null | undefined,
    inspectionValue: string | null | undefined,
    matchStatus: "match" | "mismatch" | "na"
  ) => {
    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.field === field;
    
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            value={editingCell.value}
            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
            className="h-7 text-xs w-24"
            autoFocus
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => handleSaveEdit(result, field, editingCell.value)}
            disabled={saving}
          >
            <Check className="h-3 w-3 text-green-600" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setEditingCell(null)}
          >
            <X className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{assetValue || "-"}</span>
          {matchStatus !== "na" && getValueBadge(matchStatus)}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
            onClick={() => setEditingCell({ rowIndex, field, value: assetValue || "" })}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
        {inspectionValue && matchStatus !== "na" && (
          <div className="text-xs text-muted-foreground">
            Inspection: {inspectionValue}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card 
          className={`cursor-pointer transition-all ${filter === "all" ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
          onClick={() => setFilter("all")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer transition-all ${filter === "verified" ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
          onClick={() => setFilter("verified")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.verifiedNoDiscrepancy}</div>
            <div className="text-xs text-muted-foreground">via inspections</div>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer transition-all ${filter === "discrepancies" ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
          onClick={() => setFilter("discrepancies")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600">Discrepancies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.discrepancies}</div>
            <div className="text-xs text-muted-foreground">CT/Breaker mismatch</div>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer transition-all ${filter === "unverified" ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
          onClick={() => setFilter("unverified")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-600">Not Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.unverified}</div>
            <div className="text-xs text-muted-foreground">no inspection match</div>
          </CardContent>
        </Card>

        <Card className="hover:bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">With Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.withImages}</div>
            <div className="text-xs text-muted-foreground">inspection photos</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search assets, meters, shops..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviewReport}
                disabled={generating || comparisonResults.length === 0}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                Preview
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleExportReport}
                disabled={generating || comparisonResults.length === 0}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4 mr-2" />
                )}
                Export PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset (Premises ID)</TableHead>
                <TableHead>Trade As</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Inspection Source</TableHead>
                <TableHead>Meter Serial</TableHead>
                <TableHead>CT Ratio</TableHead>
                <TableHead>Breaker Size</TableHead>
                <TableHead>Photos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredResults.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No results found
                  </TableCell>
                </TableRow>
              ) : (
                filteredResults.map((result, idx) => (
                  <TableRow key={result.asset.id} className="group">
                    <TableCell>
                      <div className="font-medium text-sm">{result.asset.premises_id}</div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {result.asset.trade_as || "-"}
                      </span>
                    </TableCell>
                    <TableCell>{getStatusBadge(result)}</TableCell>
                    <TableCell>
                      {result.inspectionMatch ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            {result.inspectionMatch.subsectionName || 
                             result.inspectionMatch.shopName || 
                             result.inspectionMatch.shopNumber || 
                             "Inspection"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {result.inspectionMatch.inspectionTitle}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {renderEditableCell(
                        result,
                        idx,
                        "meter_serial",
                        result.asset.meter_serial_number,
                        result.inspectionMatch?.meterSerialNumber,
                        result.verified ? "match" : "na"
                      )}
                    </TableCell>
                    <TableCell>
                      {renderEditableCell(
                        result,
                        idx,
                        "ct_ratio",
                        result.asset.ct_ratio,
                        result.inspectionMatch?.ctSizeAndRatio,
                        result.ctMatch
                      )}
                    </TableCell>
                    <TableCell>
                      {renderEditableCell(
                        result,
                        idx,
                        "breaker_size",
                        result.asset.breaker_size,
                        result.inspectionMatch?.breakerSize,
                        result.breakerMatch
                      )}
                    </TableCell>
                    <TableCell>
                      {result.inspectionMatch && (result.inspectionMatch.meterImage || result.inspectionMatch.ctRatioImage || result.inspectionMatch.breakerImage) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 gap-1">
                              <ImageIcon className="h-4 w-4" />
                              View
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {result.inspectionMatch.meterImage && (
                              <DropdownMenuItem
                                onClick={() => setImageDialog({ 
                                  url: result.inspectionMatch!.meterImage!, 
                                  title: "Meter Photo" 
                                })}
                              >
                                Meter Photo
                              </DropdownMenuItem>
                            )}
                            {result.inspectionMatch.ctRatioImage && (
                              <DropdownMenuItem
                                onClick={() => setImageDialog({ 
                                  url: result.inspectionMatch!.ctRatioImage!, 
                                  title: "CT Ratio Photo" 
                                })}
                              >
                                CT Ratio Photo
                              </DropdownMenuItem>
                            )}
                            {result.inspectionMatch.breakerImage && (
                              <DropdownMenuItem
                                onClick={() => setImageDialog({ 
                                  url: result.inspectionMatch!.breakerImage!, 
                                  title: "Breaker Photo" 
                                })}
                              >
                                Breaker Photo
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Image Dialog */}
      <Dialog open={!!imageDialog} onOpenChange={() => setImageDialog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>{imageDialog?.title}</DialogTitle>
          {imageDialog && (
            <RobustImage
              src={imageDialog.url}
              alt={imageDialog.title}
              className="w-full h-auto max-h-[70vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* PDF Preview Dialog */}
      {pdfPreview && (
        <DocumentPreviewDialog
          open={!!pdfPreview}
          onOpenChange={(open) => {
            if (!open) {
              URL.revokeObjectURL(pdfPreview.url);
              setPdfPreview(null);
            }
          }}
          fileUrl={pdfPreview.url}
          fileName={pdfPreview.filename}
        />
      )}
    </div>
  );
};
