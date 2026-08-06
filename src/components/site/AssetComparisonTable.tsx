import { useState, useMemo, useEffect, useCallback } from "react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Search, CheckCircle2, AlertTriangle, XCircle, Image as ImageIcon, Eye, Loader2, Pencil, Check, X, Trash2 } from "lucide-react";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import { storagePathFromUrl } from "@/lib/documents/paths";
import { RobustImage } from "@/components/RobustImage";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { generateInspectionBasedReport } from "@/lib/assetVerificationReportGenerator";
import { PDFComplianceCheck } from "@/lib/pdfMakeUtils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  normalizeMeterSerial,
  buildComparisonResults,
  type AssetForComparison as Asset,
  type InspectionTenantMatch,
  type ComparisonResult,
} from "@/lib/assetVerification";

interface SavedReport { id: string; file_name: string; file_url: string; created_at: string; }
const REPORT_CATEGORY = getReportCategoryName("asset-verification");

interface AssetComparisonTableProps {
  assets: Asset[];
  inspectionMeterMatches: Map<string, InspectionTenantMatch>;
  siteName: string;
  companyLogoUrl?: string | null;
  onDataUpdated?: () => void;
  readOnly?: boolean;
}

type EditingCell = {
  rowIndex: number;
  field: "meter_serial" | "ct_ratio" | "breaker_size";
  source: "asset" | "inspection";
  value: string;
} | null;

export const AssetComparisonTable = ({
  assets,
  inspectionMeterMatches,
  siteName,
  companyLogoUrl,
  onDataUpdated,
  readOnly = false,
}: AssetComparisonTableProps) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "verified" | "discrepancies" | "unverified">("all");
  const [imageDialog, setImageDialog] = useState<{ url: string; title: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string; blob?: Blob; complianceChecks?: PDFComplianceCheck; isObjectUrl?: boolean } | null>(null);
  const [savingToDocuments, setSavingToDocuments] = useState(false);
  const siteId = useMemo(() => {
    // Extract siteId from URL or other context if available
    const match = window.location.pathname.match(/sites\/([a-f0-9-]+)/);
    return match ? match[1] : undefined;
  }, []);
  const [generating, setGenerating] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [saving, setSaving] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [deletingReport, setDeletingReport] = useState<string | null>(null);

  const fetchSavedReports = useCallback(async () => {
    if (!siteId) return;
    const { data } = await supabase
      .from("site_documents")
      .select("id, file_name, file_url, created_at")
      .eq("site_id", siteId)
      .eq("category", REPORT_CATEGORY)
      .order("created_at", { ascending: false });
    setSavedReports((data ?? []) as unknown as SavedReport[]);
  }, [siteId]);
  useEffect(() => { fetchSavedReports(); }, [fetchSavedReports]);

  // Build comparison results - status is computed from inspections, never persisted.
  const comparisonResults = useMemo(
    () => buildComparisonResults(assets, inspectionMeterMatches),
    [assets, inspectionMeterMatches],
  );

  // Release the preview blob URL when it changes or the table unmounts.
  useEffect(() => {
    return () => {
      if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    };
  }, [pdfPreview?.url]);

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

  const handleSaveAssetEdit = async (result: ComparisonResult, field: string, newValue: string) => {
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

  const handleSaveInspectionEdit = async (result: ComparisonResult, field: string, newValue: string) => {
    if (!result.inspectionMatch) return;
    
    setSaving(true);
    try {
      // Fetch the current inspection data
      const { data: inspection, error: fetchError } = await supabase
        .from("inspections")
        .select("json_data")
        .eq("id", result.inspectionMatch.inspectionId)
        .single();
        
      if (fetchError) throw fetchError;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsonData = (inspection?.json_data as any) || {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tenants = (jsonData.tenants as any[]) || [];
      
      // Find the tenant with matching meter serial
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tenantIndex = tenants.findIndex((t: any) => {
        const tenantSerial = normalizeMeterSerial(t.meterSerialNumber as string);
        const matchSerial = normalizeMeterSerial(result.inspectionMatch?.meterSerialNumber);
        return tenantSerial === matchSerial;
      });
      
      if (tenantIndex === -1) {
        toast.error("Could not find matching tenant in inspection");
        return;
      }
      
      // Update the specific field in the tenant
      if (field === "meter_serial") tenants[tenantIndex].meterSerialNumber = newValue;
      if (field === "ct_ratio") tenants[tenantIndex].ctSizeAndRatio = newValue;
      if (field === "breaker_size") tenants[tenantIndex].breakerSize = newValue;
      
      // Save the updated json_data
      const { error: updateError } = await supabase
        .from("inspections")
        .update({ json_data: { ...jsonData, tenants } })
        .eq("id", result.inspectionMatch.inspectionId);
        
      if (updateError) throw updateError;
      
      toast.success("Inspection updated successfully");
      setEditingCell(null);
      onDataUpdated?.();
    } catch (error) {
      console.error("Error updating inspection:", error);
      toast.error("Failed to update inspection");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (result: ComparisonResult, field: string, newValue: string, source: "asset" | "inspection") => {
    if (source === "asset") {
      await handleSaveAssetEdit(result, field, newValue);
    } else {
      await handleSaveInspectionEdit(result, field, newValue);
    }
  };

  const handlePreviewReport = async () => {
    setGenerating(true);
    try {
      const result = await generateInspectionBasedReport({
        siteName,
        comparisonResults,
        stats,
        companyLogoUrl,
      });
      
      const url = URL.createObjectURL(result.blob);
      setPdfPreview({
        url,
        blob: result.blob,
        filename: result.filename,
        complianceChecks: result.complianceChecks,
        isObjectUrl: true,
      });
    } catch (error) {
      console.error("Error generating preview:", error);
      toast.error("Failed to generate preview");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveToDocuments = async () => {
    if (!pdfPreview || !pdfPreview.blob || !siteId) {
      toast.error("Unable to save: missing context");
      return;
    }
    const blob = pdfPreview.blob;
    
    setSavingToDocuments(true);
    try {
      const result = await savePDFToDocuments({
        blob,
        fileName: pdfPreview.filename,
        siteId,
        categoryName: getReportCategoryName("asset-verification"),
      });

      if (result.success) {
        toast.success("Asset verification report saved to documents!");
        if (pdfPreview.isObjectUrl) URL.revokeObjectURL(pdfPreview.url);
        setPdfPreview(null);
        fetchSavedReports();
      } else {
        toast.error(result.error || "Failed to save report");
      }
    } catch (error) {
      console.error("Error saving report:", error);
      toast.error("Failed to save report to documents");
    } finally {
      setSavingToDocuments(false);
    }
  };

  // Delete a saved report: remove the storage object (best-effort) then the site_documents row.
  const handleDeleteSavedReport = async (r: SavedReport) => {
    if (!window.confirm(`Delete "${r.file_name}"? This cannot be undone.`)) return;
    setDeletingReport(r.id);
    try {
      // storagePathFromUrl handles both legacy full URLs and bare-path rows.
      const path = r.file_url ? storagePathFromUrl(r.file_url) : null;
      if (path) await supabase.storage.from("documents").remove([path]);
      const { error } = await supabase.from("site_documents").delete().eq("id", r.id);
      if (error) throw error;
      toast.success("Report deleted");
      setSavedReports((prev) => prev.filter((x) => x.id !== r.id));
      if (pdfPreview && !pdfPreview.isObjectUrl && pdfPreview.url === r.file_url) setPdfPreview(null);
    } catch (error) {
      console.error("Error deleting report:", error);
      toast.error("Could not delete the report");
    } finally {
      setDeletingReport(null);
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
    const isEditingAsset = editingCell?.rowIndex === rowIndex && editingCell?.field === field && editingCell?.source === "asset";
    const isEditingInspection = editingCell?.rowIndex === rowIndex && editingCell?.field === field && editingCell?.source === "inspection";
    
    const renderEditInput = (source: "asset" | "inspection") => (
      <div className="flex items-center gap-1">
        <Input
          value={editingCell?.value || ""}
          onChange={(e) => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSaveEdit(result, field, editingCell?.value || "", source);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditingCell(null);
            }
          }}
          className="h-7 text-xs w-24"
          autoFocus
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => handleSaveEdit(result, field, editingCell?.value || "", source)}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
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

    return (
      <div className="space-y-1">
        {/* Asset Value Row */}
        <div className="flex items-center gap-2">
          {!readOnly && isEditingAsset ? (
            renderEditInput("asset")
          ) : (
            <>
              <span className="text-sm font-medium">{assetValue || "-"}</span>
              {matchStatus !== "na" && getValueBadge(matchStatus)}
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                  onClick={() => setEditingCell({ rowIndex, field, source: "asset", value: assetValue || "" })}
                  title="Edit asset value"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
        
        {/* Inspection Value Row */}
        {inspectionValue && matchStatus !== "na" && (
          <div className="flex items-center gap-1">
            {!readOnly && isEditingInspection ? (
              renderEditInput("inspection")
            ) : (
              <>
                <span className="text-xs text-muted-foreground">Inspection: {inspectionValue}</span>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => setEditingCell({ rowIndex, field, source: "inspection", value: inspectionValue || "" })}
                    title="Edit inspection value"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </Button>
                )}
              </>
            )}
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
            <Button
              variant="default"
              size="sm"
              onClick={handlePreviewReport}
              disabled={generating || comparisonResults.length === 0}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Eye className="h-4 w-4 mr-2" />
              )}
              {generating ? "Generating..." : "Generate PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {savedReports.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Saved reports</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-md border divide-y">
              {savedReports.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 p-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{r.file_name}</div>
                    <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => setPdfPreview({ url: r.file_url, filename: r.file_name })} title="Preview / download">
                      <Eye className="h-4 w-4" />
                    </Button>
                    {!readOnly && (
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteSavedReport(r)} disabled={deletingReport === r.id} title="Delete report">
                        {deletingReport === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* PDF Preview Dialog — generated report (with blob) or a saved report (url only) */}
      {pdfPreview && (
        <DocumentPreviewDialog
          open={!!pdfPreview}
          onOpenChange={(open) => {
            if (!open) {
              if (pdfPreview.isObjectUrl) URL.revokeObjectURL(pdfPreview.url);
              setPdfPreview(null);
            }
          }}
          fileUrl={pdfPreview.url}
          fileName={pdfPreview.filename}
          downloadBlobData={pdfPreview.blob}
          onSaveToDocuments={pdfPreview.blob ? handleSaveToDocuments : undefined}
          saveLocation="site"
          contextName={siteName}
          isSaving={savingToDocuments}
          complianceChecks={pdfPreview.complianceChecks}
        />
      )}
    </div>
  );
};
