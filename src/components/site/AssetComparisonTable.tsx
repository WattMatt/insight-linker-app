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
import { Search, CheckCircle2, AlertTriangle, XCircle, Minus, Image as ImageIcon, FileDown, Eye, Loader2, Link2, Unlink, Pencil, Check, X } from "lucide-react";
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
  asset: Asset | null;
  subsection: Subsection | null;
  matchType: "matched" | "asset_only" | "subsection_only";
  matchMethod: "name" | "meter_serial" | "manual" | "none";
  meterSerialMatch: "match" | "mismatch" | "na";
  ctRatioMatch: "match" | "mismatch" | "na";
  hasDiscrepancy: boolean;
  // For unmatched subsections: if their meter serial exists somewhere in asset register
  potentialAssetMatch?: Asset;
  // Matched inspection tenant data
  inspectionMatch?: InspectionTenantMatch;
}

interface AssetComparisonTableProps {
  assets: Asset[];
  subsections: Subsection[];
  subsectionImages?: Record<string, TenantImages>;
  inspectionMeterMatches?: Map<string, InspectionTenantMatch>;
  siteName: string;
  companyLogoUrl?: string | null;
  onDataUpdated?: () => void;
}

type EditingCell = {
  rowIndex: number;
  field: "meter_serial" | "ct_ratio" | "breaker_size";
  source: "asset" | "subsection";
  value: string;
} | null;

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
  inspectionMeterMatches = new Map(),
  siteName,
  companyLogoUrl,
  onDataUpdated,
}: AssetComparisonTableProps) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "matched" | "discrepancies" | "unmatched">("all");
  const [imageDialog, setImageDialog] = useState<{ url: string; title: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [saving, setSaving] = useState(false);
  // Manual links: assetId -> subsectionId
  const [manualLinks, setManualLinks] = useState<Record<string, string>>({});

  // Get unmatched subsections for dropdown
  const getAvailableSubsections = (currentAssetId: string) => {
    const linkedSubsectionIds = new Set(Object.values(manualLinks));
    const autoMatchedSubsectionIds = new Set(
      comparisonResults
        .filter(r => r.matchType === "matched" && r.matchMethod !== "manual")
        .map(r => r.subsection?.id)
        .filter(Boolean)
    );
    
    return subsections.filter(sub => 
      !linkedSubsectionIds.has(sub.id) && 
      !autoMatchedSubsectionIds.has(sub.id)
    );
  };

  // Get unmatched assets for dropdown  
  const getAvailableAssets = (currentSubsectionId: string) => {
    const linkedAssetIds = new Set(Object.keys(manualLinks));
    const autoMatchedAssetIds = new Set(
      comparisonResults
        .filter(r => r.matchType === "matched" && r.matchMethod !== "manual")
        .map(r => r.asset?.id)
        .filter(Boolean)
    );
    
    return assets.filter(asset => 
      !linkedAssetIds.has(asset.id) && 
      !autoMatchedAssetIds.has(asset.id)
    );
  };

  const handleManualLink = (assetId: string, subsectionId: string) => {
    setManualLinks(prev => ({ ...prev, [assetId]: subsectionId }));
  };

  const handleUnlink = (assetId: string) => {
    setManualLinks(prev => {
      const next = { ...prev };
      delete next[assetId];
      return next;
    });
  };

  // Normalize meter serial for matching
  const normalizeMeterSerial = (serial: string | null | undefined): string => {
    return (serial || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
  };

  // Build comparison results
  const comparisonResults = useMemo((): ComparisonResult[] => {
    const results: ComparisonResult[] = [];
    const matchedSubsectionIds = new Set<string>();
    const matchedAssetIds = new Set<string>();

    // First pass: Apply manual links
    for (const [assetId, subsectionId] of Object.entries(manualLinks)) {
      const asset = assets.find(a => a.id === assetId);
      const subsection = subsections.find(s => s.id === subsectionId);
      
      if (asset && subsection) {
        matchedSubsectionIds.add(subsectionId);
        matchedAssetIds.add(assetId);
        
        const meterSerialMatch = compareValues(asset.meter_serial_number, subsection.meter_serial_number);
        const ctRatioMatch = compareValues(asset.ct_ratio, subsection.ct_ratio);
        
        results.push({
          asset,
          subsection,
          matchType: "matched",
          matchMethod: "manual",
          meterSerialMatch,
          ctRatioMatch,
          hasDiscrepancy: meterSerialMatch === "mismatch" || ctRatioMatch === "mismatch",
        });
      }
    }

    // Second pass: Match by name
    for (const asset of assets) {
      if (matchedAssetIds.has(asset.id)) continue;
      
      const assetName = normalizeForMatching(asset.premises_id);
      const assetTrade = normalizeForMatching(asset.trade_as || "");

      let matchedSubsection: Subsection | null = null;

      for (const sub of subsections) {
        if (matchedSubsectionIds.has(sub.id)) continue;
        
        const subName = normalizeForMatching(sub.name);
        const subTenant = normalizeForMatching(sub.tenant_name || "");

        if (
          assetName === subName ||
          assetTrade === subName ||
          (assetName && subTenant && assetName === subTenant) ||
          (assetTrade && subTenant && assetTrade === subTenant) ||
          (assetName.length > 5 && subName.includes(assetName)) ||
          (subName.length > 5 && assetName.includes(subName))
        ) {
          matchedSubsection = sub;
          matchedSubsectionIds.add(sub.id);
          matchedAssetIds.add(asset.id);
          break;
        }
      }

      if (matchedSubsection) {
        const meterSerialMatch = compareValues(asset.meter_serial_number, matchedSubsection.meter_serial_number);
        const ctRatioMatch = compareValues(asset.ct_ratio, matchedSubsection.ct_ratio);

        results.push({
          asset,
          subsection: matchedSubsection,
          matchType: "matched",
          matchMethod: "name",
          meterSerialMatch,
          ctRatioMatch,
          hasDiscrepancy: meterSerialMatch === "mismatch" || ctRatioMatch === "mismatch",
        });
      }
    }

    // Third pass: Match by meter serial number (for remaining unmatched)
    for (const asset of assets) {
      if (matchedAssetIds.has(asset.id)) continue;
      
      const assetMeter = normalizeMeterSerial(asset.meter_serial_number);
      if (!assetMeter || assetMeter === "NA" || assetMeter === "TBC") continue;

      let matchedSubsection: Subsection | null = null;

      for (const sub of subsections) {
        if (matchedSubsectionIds.has(sub.id)) continue;
        
        const subMeter = normalizeMeterSerial(sub.meter_serial_number);
        if (subMeter && assetMeter === subMeter) {
          matchedSubsection = sub;
          matchedSubsectionIds.add(sub.id);
          matchedAssetIds.add(asset.id);
          break;
        }
      }

      if (matchedSubsection) {
        const ctRatioMatch = compareValues(asset.ct_ratio, matchedSubsection.ct_ratio);

        results.push({
          asset,
          subsection: matchedSubsection,
          matchType: "matched",
          matchMethod: "meter_serial",
          meterSerialMatch: "match",
          ctRatioMatch,
          hasDiscrepancy: ctRatioMatch === "mismatch",
        });
      }
    }

    // Add remaining unmatched assets
    for (const asset of assets) {
      if (!matchedAssetIds.has(asset.id)) {
        results.push({
          asset,
          subsection: null,
          matchType: "asset_only",
          matchMethod: "none",
          meterSerialMatch: "na",
          ctRatioMatch: "na",
          hasDiscrepancy: false,
        });
      }
    }

    // Build a map of all meter serial numbers in assets for quick lookup
    const assetMeterSerialMap = new Map<string, Asset>();
    for (const asset of assets) {
      const normalized = normalizeMeterSerial(asset.meter_serial_number);
      if (normalized && normalized !== "NA" && normalized !== "TBC") {
        assetMeterSerialMap.set(normalized, asset);
      }
    }

    // Add remaining unmatched subsections
    for (const sub of subsections) {
      if (!matchedSubsectionIds.has(sub.id)) {
        // Check if this subsection's meter serial exists anywhere in the asset register
        const subMeter = normalizeMeterSerial(sub.meter_serial_number);
        const potentialMatch = subMeter ? assetMeterSerialMap.get(subMeter) : undefined;
        
        results.push({
          asset: null,
          subsection: sub,
          matchType: "subsection_only",
          matchMethod: "none",
          meterSerialMatch: "na",
          ctRatioMatch: "na",
          hasDiscrepancy: false,
          potentialAssetMatch: potentialMatch,
        });
      }
    }

    // Add inspection matches to all results based on meter serial
    results.forEach(result => {
      if (result.asset?.meter_serial_number) {
        const normalizedAssetMeter = normalizeMeterSerial(result.asset.meter_serial_number);
        if (normalizedAssetMeter && inspectionMeterMatches.has(normalizedAssetMeter)) {
          result.inspectionMatch = inspectionMeterMatches.get(normalizedAssetMeter);
        }
      }
    });

    return results;
  }, [assets, subsections, manualLinks, normalizeMeterSerial, inspectionMeterMatches]);

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
    const subsectionOnlyResults = comparisonResults.filter((r) => r.matchType === "subsection_only");
    return {
      total: comparisonResults.length,
      matched: matched.length,
      matchedNoDiscrepancy: matched.filter((r) => !r.hasDiscrepancy).length,
      discrepancies: comparisonResults.filter((r) => r.hasDiscrepancy).length,
      assetOnly: comparisonResults.filter((r) => r.matchType === "asset_only").length,
      subsectionOnly: subsectionOnlyResults.length,
      potentialMatches: subsectionOnlyResults.filter((r) => r.potentialAssetMatch).length,
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
      if (result.potentialAssetMatch) {
        return (
          <div className="flex flex-col gap-1">
            <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Found in Register
            </Badge>
            <span className="text-xs text-muted-foreground">
              {result.potentialAssetMatch.premises_id}
            </span>
          </div>
        );
      }
      return (
        <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">
          <Minus className="h-3 w-3 mr-1" />
          No Asset
        </Badge>
      );
    }
    if (result.hasDiscrepancy) {
      return (
        <div className="flex flex-col gap-1">
          <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Mismatch
          </Badge>
          {result.matchMethod !== "name" && (
            <span className="text-xs text-muted-foreground">
              via {result.matchMethod === "meter_serial" ? "Meter #" : result.matchMethod === "manual" ? "Manual" : ""}
            </span>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Match
        </Badge>
        {result.matchMethod !== "name" && (
          <span className="text-xs text-muted-foreground">
            via {result.matchMethod === "meter_serial" ? "Meter #" : result.matchMethod === "manual" ? "Manual" : ""}
          </span>
        )}
      </div>
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

  // Handle inline edit save
  const handleSaveEdit = async () => {
    if (!editingCell) return;
    
    setSaving(true);
    try {
      const { rowIndex, field, source, value } = editingCell;
      const result = filteredResults[rowIndex];
      
      if (source === "asset" && result.asset) {
        const updateData: Record<string, string | null> = {};
        if (field === "meter_serial") updateData.meter_serial_number = value || null;
        if (field === "ct_ratio") updateData.ct_ratio = value || null;
        if (field === "breaker_size") updateData.breaker_size = value || null;
        
        const { error } = await supabase
          .from("site_assets")
          .update(updateData)
          .eq("id", result.asset.id);
          
        if (error) throw error;
        toast.success("Asset updated successfully");
      } else if (source === "subsection" && result.subsection) {
        const updateData: Record<string, string | null> = {};
        if (field === "meter_serial") updateData.meter_serial_number = value || null;
        if (field === "ct_ratio") updateData.ct_ratio = value || null;
        
        const { error } = await supabase
          .from("subsections")
          .update(updateData)
          .eq("id", result.subsection.id);
          
        if (error) throw error;
        toast.success("Subsection updated successfully");
      }
      
      setEditingCell(null);
      onDataUpdated?.();
    } catch (error) {
      console.error("Failed to save edit:", error);
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (rowIndex: number, field: EditingCell["field"], source: EditingCell["source"], currentValue: string) => {
    setEditingCell({ rowIndex, field, source, value: currentValue });
  };

  const cancelEditing = () => {
    setEditingCell(null);
  };

  // Editable value component
  const EditableValue = ({ 
    rowIndex, 
    field, 
    source, 
    value, 
    label 
  }: { 
    rowIndex: number; 
    field: EditingCell["field"]; 
    source: EditingCell["source"]; 
    value: string | null; 
    label: string;
  }) => {
    const isEditing = editingCell?.rowIndex === rowIndex && 
                      editingCell?.field === field && 
                      editingCell?.source === source;
    
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs">{label}:</span>
          <Input
            value={editingCell.value}
            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
            className="h-6 w-24 text-xs px-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveEdit();
              if (e.key === "Escape") cancelEditing();
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={handleSaveEdit}
            disabled={saving}
          >
            <Check className="h-3 w-3 text-green-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={cancelEditing}
            disabled={saving}
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
      );
    }
    
    return (
      <div 
        className="group flex items-center gap-1 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
        onClick={() => startEditing(rowIndex, field, source, value || "")}
      >
        <span className={source === "asset" ? "text-muted-foreground" : ""}>
          {label}: {value || "-"}
        </span>
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    );
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
      <div className="grid gap-4 md:grid-cols-5">
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
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setFilter("unmatched")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Found in Register</CardTitle>
            <div className="text-2xl font-bold text-purple-600">{stats.potentialMatches}</div>
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
                <TableHead>Link</TableHead>
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
                      {/* Link controls for unmatched items */}
                      {result.matchType === "asset_only" && result.asset && (
                        <Select
                          value=""
                          onValueChange={(subsectionId) => handleManualLink(result.asset!.id, subsectionId)}
                        >
                          <SelectTrigger className="w-[160px] h-8 text-xs">
                            <div className="flex items-center gap-1">
                              <Link2 className="h-3 w-3" />
                              <SelectValue placeholder="Link to..." />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailableSubsections(result.asset.id).map(sub => (
                              <SelectItem key={sub.id} value={sub.id} className="text-xs">
                                <div className="flex flex-col">
                                  <span>{sub.name}</span>
                                  {sub.meter_serial_number && (
                                    <span className="text-muted-foreground text-xs">
                                      Meter: {sub.meter_serial_number}
                                    </span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                            {getAvailableSubsections(result.asset.id).length === 0 && (
                              <div className="p-2 text-xs text-muted-foreground">No unlinked subsections</div>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                      {result.matchType === "subsection_only" && result.subsection && (
                        <Select
                          value=""
                          onValueChange={(assetId) => handleManualLink(assetId, result.subsection!.id)}
                        >
                          <SelectTrigger className="w-[160px] h-8 text-xs">
                            <div className="flex items-center gap-1">
                              <Link2 className="h-3 w-3" />
                              <SelectValue placeholder="Link to..." />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailableAssets(result.subsection.id).map(asset => (
                              <SelectItem key={asset.id} value={asset.id} className="text-xs">
                                <div className="flex flex-col">
                                  <span>{asset.premises_id}</span>
                                  {asset.meter_serial_number && (
                                    <span className="text-muted-foreground text-xs">
                                      Meter: {asset.meter_serial_number}
                                    </span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                            {getAvailableAssets(result.subsection.id).length === 0 && (
                              <div className="p-2 text-xs text-muted-foreground">No unlinked assets</div>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                      {result.matchType === "matched" && result.matchMethod === "manual" && result.asset && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => handleUnlink(result.asset!.id)}
                        >
                          <Unlink className="h-3 w-3 mr-1" />
                          Unlink
                        </Button>
                      )}
                      {result.matchType === "matched" && result.matchMethod !== "manual" && (
                        <span className="text-xs text-muted-foreground">Auto</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {result.inspectionMatch ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Verified
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {result.inspectionMatch.subsectionName || result.inspectionMatch.shopName || result.inspectionMatch.shopNumber || 'Inspection'}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {result.inspectionMatch.ctSizeAndRatio && (
                              <Badge variant="secondary" className="text-xs">
                                CT: {result.inspectionMatch.ctSizeAndRatio}
                              </Badge>
                            )}
                            {result.inspectionMatch.breakerSize && (
                              <Badge variant="secondary" className="text-xs">
                                Brk: {result.inspectionMatch.breakerSize}
                              </Badge>
                            )}
                          </div>
                          {(result.inspectionMatch.meterImage || result.inspectionMatch.ctRatioImage || result.inspectionMatch.breakerImage) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1">
                                  <ImageIcon className="h-3 w-3" />
                                  Photos
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {result.inspectionMatch.meterImage && (
                                  <DropdownMenuItem
                                    onClick={() => setImageDialog({ url: result.inspectionMatch!.meterImage!, title: "Meter (Inspection)" })}
                                  >
                                    Meter Photo
                                  </DropdownMenuItem>
                                )}
                                {result.inspectionMatch.ctRatioImage && (
                                  <DropdownMenuItem
                                    onClick={() => setImageDialog({ url: result.inspectionMatch!.ctRatioImage!, title: "CT Ratio (Inspection)" })}
                                  >
                                    CT Ratio Photo
                                  </DropdownMenuItem>
                                )}
                                {result.inspectionMatch.breakerImage && (
                                  <DropdownMenuItem
                                    onClick={() => setImageDialog({ url: result.inspectionMatch!.breakerImage!, title: "Breaker (Inspection)" })}
                                  >
                                    Breaker Photo
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getValueBadge(result.meterSerialMatch)}
                        <div className="text-sm space-y-0.5">
                          {result.asset && (
                            <EditableValue
                              rowIndex={idx}
                              field="meter_serial"
                              source="asset"
                              value={result.asset.meter_serial_number}
                              label="A"
                            />
                          )}
                          {result.subsection && (
                            <EditableValue
                              rowIndex={idx}
                              field="meter_serial"
                              source="subsection"
                              value={result.subsection.meter_serial_number}
                              label="S"
                            />
                          )}
                          {!result.asset && !result.subsection && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getValueBadge(result.ctRatioMatch)}
                        <div className="text-sm space-y-0.5">
                          {result.asset && (
                            <EditableValue
                              rowIndex={idx}
                              field="ct_ratio"
                              source="asset"
                              value={result.asset.ct_ratio}
                              label="A"
                            />
                          )}
                          {result.subsection && (
                            <EditableValue
                              rowIndex={idx}
                              field="ct_ratio"
                              source="subsection"
                              value={result.subsection.ct_ratio}
                              label="S"
                            />
                          )}
                          {!result.asset && !result.subsection && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {result.asset ? (
                          <EditableValue
                            rowIndex={idx}
                            field="breaker_size"
                            source="asset"
                            value={result.asset.breaker_size}
                            label=""
                          />
                        ) : (
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
