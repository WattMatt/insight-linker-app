import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, AlertTriangle, CheckCircle2, Database, Layers, FileText, RefreshCw, Download, Image, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { RobustImage } from "@/components/RobustImage";

interface MeterRegisterProps {
  siteId: string;
  siteName: string;
  readOnly?: boolean;
}

interface InspectionTenant {
  id: string;
  shopName?: string;
  shopNumber?: string;
  meterSerialNumber?: string;
  meterImage?: string;
  ctRatioImage?: string;
  ctSizeAndRatio?: string;
  breakerSize?: string;
}

interface InspectionSource {
  id: string;
  title: string;
  tenant: InspectionTenant;
}

interface MeterEntry {
  meter_serial_number: string;
  sources: {
    subsection?: { id: string; name: string; ct_ratio?: string };
    asset?: { id: string; premises_id: string; trade_as?: string; ct_ratio?: string; asset_category: string };
    inspection?: InspectionSource;
  };
  hasDiscrepancy: boolean;
  discrepancyDetails?: string;
}

export function MeterRegister({ siteId, siteName, readOnly = false }: MeterRegisterProps) {
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState("all");
  const [selectedImages, setSelectedImages] = useState<{ meterImage?: string; ctRatioImage?: string; title: string } | null>(null);

  // Fetch subsections with meter numbers
  const { data: subsections, refetch: refetchSubsections } = useQuery({
    queryKey: ['meter-register-subsections', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subsections')
        .select('id, name, meter_serial_number, ct_ratio')
        .eq('site_id', siteId)
        .not('meter_serial_number', 'is', null);
      
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch site assets with meter numbers
  const { data: assets, refetch: refetchAssets } = useQuery({
    queryKey: ['meter-register-assets', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_assets')
        .select('id, premises_id, trade_as, meter_serial_number, ct_ratio, asset_category')
        .eq('site_id', siteId)
        .not('meter_serial_number', 'is', null);
      
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch inspections with tenant meter data
  const { data: inspections, refetch: refetchInspections } = useQuery({
    queryKey: ['meter-register-inspections', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('id, title, json_data')
        .eq('site_id', siteId)
        .not('json_data', 'is', null);
      
      if (error) throw error;
      return data || [];
    }
  });

  const handleRefresh = () => {
    refetchSubsections();
    refetchAssets();
    refetchInspections();
    toast.success("Meter register refreshed");
  };

  // Consolidate all meter entries
  const consolidatedMeters = useMemo(() => {
    const meterMap = new Map<string, MeterEntry>();

    // Add subsection meters
    subsections?.forEach(sub => {
      if (!sub.meter_serial_number) return;
      const serial = sub.meter_serial_number.trim();
      
      if (!meterMap.has(serial)) {
        meterMap.set(serial, {
          meter_serial_number: serial,
          sources: {},
          hasDiscrepancy: false
        });
      }
      
      const entry = meterMap.get(serial)!;
      entry.sources.subsection = {
        id: sub.id,
        name: sub.name,
        ct_ratio: sub.ct_ratio || undefined
      };
    });

    // Add asset meters (only electrical meters for comparison)
    assets?.filter(a => a.asset_category === 'electrical_meter').forEach(asset => {
      if (!asset.meter_serial_number) return;
      const serial = asset.meter_serial_number.trim();
      
      if (!meterMap.has(serial)) {
        meterMap.set(serial, {
          meter_serial_number: serial,
          sources: {},
          hasDiscrepancy: false
        });
      }
      
      const entry = meterMap.get(serial)!;
      entry.sources.asset = {
        id: asset.id,
        premises_id: asset.premises_id,
        trade_as: asset.trade_as || undefined,
        ct_ratio: asset.ct_ratio || undefined,
        asset_category: asset.asset_category
      };
    });

    // Add inspection tenant meters (with images)
    inspections?.forEach(inspection => {
      const jsonData = inspection.json_data as Record<string, unknown> | null;
      if (!jsonData) return;
      
      const tenants = (jsonData.tenants as InspectionTenant[]) || [];
      tenants.forEach(tenant => {
        if (!tenant.meterSerialNumber) return;
        const serial = tenant.meterSerialNumber.trim();
        
        if (!meterMap.has(serial)) {
          meterMap.set(serial, {
            meter_serial_number: serial,
            sources: {},
            hasDiscrepancy: false
          });
        }
        
        const entry = meterMap.get(serial)!;
        // Only add if this inspection has images (prefer inspections with images)
        if (!entry.sources.inspection || (tenant.meterImage || tenant.ctRatioImage)) {
          entry.sources.inspection = {
            id: inspection.id,
            title: inspection.title,
            tenant: tenant
          };
        }
      });
    });

    // Check for discrepancies
    meterMap.forEach((entry) => {
      const { subsection, asset, inspection } = entry.sources;
      const sourceCount = [subsection, asset, inspection].filter(Boolean).length;
      
      if (sourceCount === 1) {
        if (subsection) {
          entry.hasDiscrepancy = true;
          entry.discrepancyDetails = "Only in subsections (missing from asset register & inspections)";
        } else if (asset) {
          entry.hasDiscrepancy = true;
          entry.discrepancyDetails = "Only in asset register (no subsection or inspection)";
        } else if (inspection) {
          entry.hasDiscrepancy = true;
          entry.discrepancyDetails = "Only in inspections (not registered in subsections or assets)";
        }
      } else if (subsection && asset) {
        // Both exist - check for CT ratio mismatch
        const subCT = subsection.ct_ratio?.toLowerCase().replace(/\s/g, '');
        const assetCT = asset.ct_ratio?.toLowerCase().replace(/\s/g, '');
        
        if (subCT && assetCT && subCT !== assetCT && subCT !== 'n/a' && assetCT !== 'n/a') {
          entry.hasDiscrepancy = true;
          entry.discrepancyDetails = `CT ratio mismatch: Subsection="${subsection.ct_ratio}" vs Asset="${asset.ct_ratio}"`;
        }
      }
    });

    return Array.from(meterMap.values()).sort((a, b) => 
      a.meter_serial_number.localeCompare(b.meter_serial_number)
    );
  }, [subsections, assets, inspections]);

  // Filter based on search and view
  const filteredMeters = useMemo(() => {
    let filtered = consolidatedMeters;

    // Filter by view
    if (activeView === "matched") {
      filtered = filtered.filter(m => 
        (m.sources.subsection || m.sources.asset || m.sources.inspection) && 
        ([m.sources.subsection, m.sources.asset, m.sources.inspection].filter(Boolean).length >= 2) &&
        !m.hasDiscrepancy
      );
    } else if (activeView === "discrepancies") {
      filtered = filtered.filter(m => m.hasDiscrepancy);
    } else if (activeView === "with-images") {
      filtered = filtered.filter(m => m.sources.inspection?.tenant.meterImage || m.sources.inspection?.tenant.ctRatioImage);
    } else if (activeView === "no-images") {
      filtered = filtered.filter(m => !m.sources.inspection?.tenant.meterImage && !m.sources.inspection?.tenant.ctRatioImage);
    }

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(m => 
        m.meter_serial_number.toLowerCase().includes(searchLower) ||
        m.sources.subsection?.name.toLowerCase().includes(searchLower) ||
        m.sources.asset?.premises_id.toLowerCase().includes(searchLower) ||
        m.sources.asset?.trade_as?.toLowerCase().includes(searchLower) ||
        m.sources.inspection?.tenant.shopName?.toLowerCase().includes(searchLower) ||
        m.sources.inspection?.tenant.shopNumber?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [consolidatedMeters, activeView, search]);

  // Stats
  const stats = useMemo(() => ({
    total: consolidatedMeters.length,
    matched: consolidatedMeters.filter(m => 
      ([m.sources.subsection, m.sources.asset, m.sources.inspection].filter(Boolean).length >= 2) && !m.hasDiscrepancy
    ).length,
    discrepancies: consolidatedMeters.filter(m => m.hasDiscrepancy).length,
    withImages: consolidatedMeters.filter(m => m.sources.inspection?.tenant.meterImage || m.sources.inspection?.tenant.ctRatioImage).length,
    noImages: consolidatedMeters.filter(m => !m.sources.inspection?.tenant.meterImage && !m.sources.inspection?.tenant.ctRatioImage).length
  }), [consolidatedMeters]);

  const handleExportCSV = () => {
    const headers = ['Meter Serial', 'Subsection Name', 'Subsection CT', 'Asset Premises', 'Asset Trade As', 'Asset CT', 'Inspection Shop', 'Inspection CT', 'Has Meter Image', 'Has CT Image', 'Status', 'Discrepancy'];
    const rows = consolidatedMeters.map(m => [
      m.meter_serial_number,
      m.sources.subsection?.name || '',
      m.sources.subsection?.ct_ratio || '',
      m.sources.asset?.premises_id || '',
      m.sources.asset?.trade_as || '',
      m.sources.asset?.ct_ratio || '',
      m.sources.inspection?.tenant.shopName || m.sources.inspection?.tenant.shopNumber || '',
      m.sources.inspection?.tenant.ctSizeAndRatio || '',
      m.sources.inspection?.tenant.meterImage ? 'Yes' : 'No',
      m.sources.inspection?.tenant.ctRatioImage ? 'Yes' : 'No',
      m.hasDiscrepancy ? 'Discrepancy' : 'OK',
      m.discrepancyDetails || ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${siteName.replace(/\s+/g, '_')}_meter_register.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Meter register exported");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold">Consolidated Meter Register</h3>
          <p className="text-sm text-muted-foreground">
            Meters from subsections, asset register &amp; inspections with images
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className={`cursor-pointer hover:border-primary/50 transition-colors ${activeView === 'all' ? 'border-primary ring-1 ring-primary' : ''}`} onClick={() => setActiveView("all")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Meters</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer hover:border-green-500/50 transition-colors ${activeView === 'matched' ? 'border-green-500 ring-1 ring-green-500' : ''}`} onClick={() => setActiveView("matched")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.matched}</p>
                <p className="text-xs text-muted-foreground">Matched (2+ sources)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer hover:border-amber-500/50 transition-colors ${activeView === 'discrepancies' ? 'border-amber-500 ring-1 ring-amber-500' : ''}`} onClick={() => setActiveView("discrepancies")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{stats.discrepancies}</p>
                <p className="text-xs text-muted-foreground">Discrepancies</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer hover:border-blue-500/50 transition-colors ${activeView === 'with-images' ? 'border-blue-500 ring-1 ring-blue-500' : ''}`} onClick={() => setActiveView("with-images")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Image className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{stats.withImages}</p>
                <p className="text-xs text-muted-foreground">With Images</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer hover:border-gray-500/50 transition-colors ${activeView === 'no-images' ? 'border-gray-500 ring-1 ring-gray-500' : ''}`} onClick={() => setActiveView("no-images")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-500/10">
                <ClipboardList className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-600">{stats.noImages}</p>
                <p className="text-xs text-muted-foreground">No Images</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-base">Meter Details</CardTitle>
              <CardDescription>
                {activeView === "all" && "Showing all meters"}
                {activeView === "matched" && "Showing matched meters (2+ sources)"}
                {activeView === "discrepancies" && "Showing meters with discrepancies"}
                {activeView === "with-images" && "Showing meters with inspection images"}
                {activeView === "no-images" && "Showing meters without images"}
                {` (${filteredMeters.length} results)`}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search meters..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Meter Serial</TableHead>
                  <TableHead className="font-semibold">Sources</TableHead>
                  <TableHead className="font-semibold">Inspection (Shop)</TableHead>
                  <TableHead className="font-semibold">CT Ratio</TableHead>
                  <TableHead className="font-semibold">Images</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMeters.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No meters found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMeters.map((meter) => (
                    <TableRow key={meter.meter_serial_number} className={meter.hasDiscrepancy ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}>
                      <TableCell className="font-mono font-medium">
                        {meter.meter_serial_number}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {meter.sources.subsection && (
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                              <Layers className="h-3 w-3 mr-1" />
                              {meter.sources.subsection.name}
                            </Badge>
                          )}
                          {meter.sources.asset && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                              <FileText className="h-3 w-3 mr-1" />
                              {meter.sources.asset.premises_id}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {meter.sources.inspection ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {meter.sources.inspection.tenant.shopName || meter.sources.inspection.tenant.shopNumber || 'Unnamed'}
                            </span>
                            <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                              {meter.sources.inspection.title}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {meter.sources.subsection?.ct_ratio && (
                            <Badge variant="outline" className="text-xs w-fit">
                              Sub: {meter.sources.subsection.ct_ratio}
                            </Badge>
                          )}
                          {meter.sources.asset?.ct_ratio && (
                            <Badge variant="outline" className="text-xs w-fit">
                              Asset: {meter.sources.asset.ct_ratio}
                            </Badge>
                          )}
                          {meter.sources.inspection?.tenant.ctSizeAndRatio && (
                            <Badge variant="outline" className="text-xs w-fit bg-green-50 text-green-700 border-green-200">
                              Insp: {meter.sources.inspection.tenant.ctSizeAndRatio}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {meter.sources.inspection?.tenant.meterImage || meter.sources.inspection?.tenant.ctRatioImage ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => setSelectedImages({
                              meterImage: meter.sources.inspection?.tenant.meterImage,
                              ctRatioImage: meter.sources.inspection?.tenant.ctRatioImage,
                              title: `${meter.meter_serial_number} - ${meter.sources.inspection?.tenant.shopName || 'Meter'}`
                            })}
                          >
                            <Image className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {meter.hasDiscrepancy ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 w-fit">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Issue
                            </Badge>
                            {meter.discrepancyDetails && (
                              <span className="text-xs text-amber-600 max-w-[200px]">{meter.discrepancyDetails}</span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 w-fit">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Image Preview Dialog */}
      <Dialog open={!!selectedImages} onOpenChange={() => setSelectedImages(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedImages?.title}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {selectedImages?.meterImage && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Meter Image</p>
                <RobustImage
                  src={selectedImages.meterImage}
                  alt="Meter"
                  className="w-full h-auto rounded-lg border"
                />
              </div>
            )}
            {selectedImages?.ctRatioImage && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">CT Ratio Image</p>
                <RobustImage
                  src={selectedImages.ctRatioImage}
                  alt="CT Ratio"
                  className="w-full h-auto rounded-lg border"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
