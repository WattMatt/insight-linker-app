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
import { Search, CheckCircle2, AlertTriangle, XCircle, Minus, Image as ImageIcon, FileDown, Eye, Loader2 } from "lucide-react";
import { RobustImage } from "@/components/RobustImage";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { generateAssetVerificationReport } from "@/lib/assetVerificationReportGenerator";
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

interface Subsection {
  id: string;
  name: string;
  meter_serial_number: string | null;
  ct_ratio: string | null;
  tenant_name: string | null;
}

interface TenantImages {
  breakerImage?: string;
  ctRatioImage?: string;
  meterImage?: string;
}

export interface ComparisonResult {
  asset: Asset | null;
  subsection: Subsection | null;
  matchType: "matched" | "asset_only" | "subsection_only";
  meterSerialMatch: "match" | "mismatch" | "na";
  ctRatioMatch: "match" | "mismatch" | "na";
  hasDiscrepancy: boolean;
}

interface AssetComparisonTableProps {
  assets: Asset[];
  subsections: Subsection[];
  subsectionImages?: Record<string, TenantImages>;
  siteName: string;
  companyLogoUrl?: string | null;
}

// Normalize name for matching - strip prefixes like "YA - "
const normalizeForMatching = (name: string): string => {
  return name
    .toUpperCase()
    .replace(/^[A-Z]{2,3}\s*[-–]\s*/i, "") // Remove "YA - ", "YAM - " etc
    .replace(/\s+/g, " ")
    .trim();
};

// Compare two values - return match status
const compareValues = (
  assetValue: string | null | undefined,
  subsectionValue: string | null | undefined
): "match" | "mismatch" | "na" => {
  const normAsset = (assetValue || "")
    .toUpperCase()
    .replace(/[^A-Z0-9/]/g, "")
    .trim();
  const normSub = (subsectionValue || "")
    .toUpperCase()
    .replace(/[^A-Z0-9/]/g, "")
    .trim();

  // If both empty or N/A, it's not applicable
  if ((!normAsset || normAsset === "NA" || normAsset === "TBC") && 
      (!normSub || normSub === "NA" || normSub === "TBC")) {
    return "na";
  }

  // If only one has a value, it's a mismatch (data exists in one but not other)
  if (!normAsset || normAsset === "NA" || normAsset === "TBC") return "na";
  if (!normSub || normSub === "NA" || normSub === "TBC") return "na";

  return normAsset === normSub ? "match" : "mismatch";
};

export const AssetComparisonTable = ({
  assets,
  subsections,
  subsectionImages = {},
  siteName,
  companyLogoUrl,
}: AssetComparisonTableProps) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "matched" | "discrepancies" | "unmatched">("all");
  const [imageDialog, setImageDialog] = useState<{ url: string; title: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  // Build comparison results
  const comparisonResults = useMemo((): ComparisonResult[] => {
    const results: ComparisonResult[] = [];
    const matchedSubsectionIds = new Set<string>();

    // Match each asset to subsections
    for (const asset of assets) {
      const assetName = normalizeForMatching(asset.premises_id);
      const assetTrade = normalizeForMatching(asset.trade_as || "");

      // Find matching subsection
      let matchedSubsection: Subsection | null = null;

      for (const sub of subsections) {
        const subName = normalizeForMatching(sub.name);
        const subTenant = normalizeForMatching(sub.tenant_name || "");

        // Try matching asset premises_id or trade_as with subsection name or tenant_name
        if (
          assetName === subName ||
          assetTrade === subName ||
          (assetName && subTenant && assetName === subTenant) ||
          (assetTrade && subTenant && assetTrade === subTenant) ||
          // Fuzzy: check if one contains the other (for partial matches)
          (assetName.length > 5 && subName.includes(assetName)) ||
          (subName.length > 5 && assetName.includes(subName))
        ) {
          matchedSubsection = sub;
          matchedSubsectionIds.add(sub.id);
          break;
        }
      }

      const meterSerialMatch = matchedSubsection
        ? compareValues(asset.meter_serial_number, matchedSubsection.meter_serial_number)
        : "na";
      const ctRatioMatch = matchedSubsection
        ? compareValues(asset.ct_ratio, matchedSubsection.ct_ratio)
        : "na";

      results.push({
        asset,
        subsection: matchedSubsection,
        matchType: matchedSubsection ? "matched" : "asset_only",
        meterSerialMatch,
        ctRatioMatch,
        hasDiscrepancy: meterSerialMatch === "mismatch" || ctRatioMatch === "mismatch",
      });
    }

    // Add subsections that weren't matched
    for (const sub of subsections) {
      if (!matchedSubsectionIds.has(sub.id)) {
        results.push({
          asset: null,
          subsection: sub,
          matchType: "subsection_only",
          meterSerialMatch: "na",
          ctRatioMatch: "na",
          hasDiscrepancy: false,
        });
      }
    }

    return results;
  }, [assets, subsections]);

  // Filter results
  const filteredResults = useMemo(() => {
    let filtered = comparisonResults;

    // Apply filter
    switch (filter) {
      case "matched":
        filtered = filtered.filter((r) => r.matchType === "matched" && !r.hasDiscrepancy);
        break;
      case "discrepancies":
        filtered = filtered.filter((r) => r.hasDiscrepancy);
        break;
      case "unmatched":
        filtered = filtered.filter((r) => r.matchType !== "matched");
        break;
    }

    // Apply search
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((r) => {
        const assetName = r.asset?.premises_id?.toLowerCase() || "";
        const tradeName = r.asset?.trade_as?.toLowerCase() || "";
        const subName = r.subsection?.name?.toLowerCase() || "";
        return assetName.includes(searchLower) || tradeName.includes(searchLower) || subName.includes(searchLower);
      });
    }

    return filtered;
  }, [comparisonResults, filter, search]);

  // Stats
  const stats = useMemo(() => {
    const matched = comparisonResults.filter((r) => r.matchType === "matched");
    return {
      total: comparisonResults.length,
      matched: matched.length,
      matchedNoDiscrepancy: matched.filter((r) => !r.hasDiscrepancy).length,
      discrepancies: comparisonResults.filter((r) => r.hasDiscrepancy).length,
      assetOnly: comparisonResults.filter((r) => r.matchType === "asset_only").length,
      subsectionOnly: comparisonResults.filter((r) => r.matchType === "subsection_only").length,
    };
  }, [comparisonResults]);

  const getStatusBadge = (result: ComparisonResult) => {
    if (result.matchType === "asset_only") {
      return (
        <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
          <XCircle className="h-3 w-3 mr-1" />
          No Subsection
        </Badge>
      );
    }
    if (result.matchType === "subsection_only") {
      return (
        <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">
          <Minus className="h-3 w-3 mr-1" />
          No Asset
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
        Match
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
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getImagesForRow = (result: ComparisonResult): TenantImages | null => {
    if (!result.subsection) return null;
    return subsectionImages[result.subsection.id] || null;
  };

  const hasAnyImage = (images: TenantImages | null): boolean => {
    if (!images) return false;
    return !!(images.breakerImage || images.ctRatioImage || images.meterImage);
  };

  const handleExportReport = async () => {
    setGenerating(true);
    try {
      const { blob, filename } = await generateAssetVerificationReport({
        siteName,
        comparisonResults,
        stats,
        companyLogoUrl,
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Report exported successfully");
    } catch (error) {
      console.error('Failed to export report:', error);
      toast.error("Failed to export report");
    } finally {
      setGenerating(false);
    }
  };

  const handlePreviewReport = async () => {
    setGenerating(true);
    try {
      const { blob, filename } = await generateAssetVerificationReport({
        siteName,
        comparisonResults,
        stats,
        companyLogoUrl,
      });
      
      const url = URL.createObjectURL(blob);
      setPdfPreview({ url, filename });
    } catch (error) {
      console.error('Failed to preview report:', error);
      toast.error("Failed to generate preview");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setFilter("matched")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Matched</CardTitle>
            <div className="text-2xl font-bold text-green-600">{stats.matchedNoDiscrepancy}</div>
          </CardHeader>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setFilter("discrepancies")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Discrepancies</CardTitle>
            <div className="text-2xl font-bold text-amber-600">{stats.discrepancies}</div>
          </CardHeader>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setFilter("unmatched")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assets Only</CardTitle>
            <div className="text-2xl font-bold text-orange-600">{stats.assetOnly}</div>
          </CardHeader>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setFilter("unmatched")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Subsections Only</CardTitle>
            <div className="text-2xl font-bold text-blue-600">{stats.subsectionOnly}</div>
          </CardHeader>
        </Card>
      </div>

      {/* Filters and Export */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by premises ID or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Results</SelectItem>
                <SelectItem value="matched">Matches Only</SelectItem>
                <SelectItem value="discrepancies">Discrepancies Only</SelectItem>
                <SelectItem value="unmatched">Unmatched Only</SelectItem>
              </SelectContent>
            </Select>
            {filter !== "all" && (
              <Button variant="ghost" size="sm" onClick={() => setFilter("all")}>
                Clear Filter
              </Button>
            )}
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
                <TableHead>Asset / Subsection</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Meter Serial</TableHead>
                <TableHead>CT Ratio</TableHead>
                <TableHead>Breaker Size</TableHead>
                <TableHead>Photos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {filteredResults.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No results found
                  </TableCell>
                </TableRow>
              ) : (
                filteredResults.map((result, idx) => {
                  const images = getImagesForRow(result);
                  return (
                  <TableRow key={idx}>
                    <TableCell>
                      <div className="space-y-1">
                        {result.asset && (
                          <div className="font-medium text-sm">
                            <span className="text-muted-foreground text-xs">Asset:</span>{" "}
                            {result.asset.premises_id}
                            {result.asset.trade_as && (
                              <span className="text-muted-foreground ml-1">
                                ({result.asset.trade_as})
                              </span>
                            )}
                          </div>
                        )}
                        {result.subsection && (
                          <div className="text-sm">
                            <span className="text-muted-foreground text-xs">Subsection:</span>{" "}
                            {result.subsection.name}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(result)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getValueBadge(result.meterSerialMatch)}
                        <div className="text-sm space-y-0.5">
                          {result.asset?.meter_serial_number && (
                            <div className="text-muted-foreground">
                              A: {result.asset.meter_serial_number}
                            </div>
                          )}
                          {result.subsection?.meter_serial_number && (
                            <div>S: {result.subsection.meter_serial_number}</div>
                          )}
                          {!result.asset?.meter_serial_number && !result.subsection?.meter_serial_number && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getValueBadge(result.ctRatioMatch)}
                        <div className="text-sm space-y-0.5">
                          {result.asset?.ct_ratio && (
                            <div className="text-muted-foreground">A: {result.asset.ct_ratio}</div>
                          )}
                          {result.subsection?.ct_ratio && (
                            <div>S: {result.subsection.ct_ratio}</div>
                          )}
                          {!result.asset?.ct_ratio && !result.subsection?.ct_ratio && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {result.asset?.breaker_size || (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {hasAnyImage(images) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1">
                              <ImageIcon className="h-4 w-4" />
                              View
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {images?.breakerImage && (
                              <DropdownMenuItem
                                onClick={() => setImageDialog({ url: images.breakerImage!, title: "Breaker" })}
                              >
                                Breaker Photo
                              </DropdownMenuItem>
                            )}
                            {images?.ctRatioImage && (
                              <DropdownMenuItem
                                onClick={() => setImageDialog({ url: images.ctRatioImage!, title: "CT Ratio" })}
                              >
                                CT Ratio Photo
                              </DropdownMenuItem>
                            )}
                            {images?.meterImage && (
                              <DropdownMenuItem
                                onClick={() => setImageDialog({ url: images.meterImage!, title: "Meter" })}
                              >
                                Meter Photo
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Image Dialog */}
      <Dialog open={!!imageDialog} onOpenChange={() => setImageDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>{imageDialog?.title} Photo</DialogTitle>
          {imageDialog && (
            <RobustImage
              src={imageDialog.url}
              alt={imageDialog.title}
              className="w-full max-h-[70vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* PDF Preview Dialog with React-PDF */}
      <DocumentPreviewDialog
        open={!!pdfPreview}
        onOpenChange={(open) => {
          if (!open && pdfPreview) {
            URL.revokeObjectURL(pdfPreview.url);
            setPdfPreview(null);
          }
        }}
        fileUrl={pdfPreview?.url || ""}
        fileName={pdfPreview?.filename || "report.pdf"}
      />
    </div>
  );
};
