import { useState, useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, AlertTriangle, CheckCircle2, XCircle, Database, Layers, FileText, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";

interface MeterRegisterProps {
  siteId: string;
  siteName: string;
}

interface MeterEntry {
  meter_serial_number: string;
  sources: {
    subsection?: { id: string; name: string; ct_ratio?: string };
    asset?: { id: string; premises_id: string; trade_as?: string; ct_ratio?: string; asset_category: string };
  };
  hasDiscrepancy: boolean;
  discrepancyDetails?: string;
}

export function MeterRegister({ siteId, siteName }: MeterRegisterProps) {
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState("all");

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

  const handleRefresh = () => {
    refetchSubsections();
    refetchAssets();
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

    // Check for discrepancies
    meterMap.forEach((entry, serial) => {
      const { subsection, asset } = entry.sources;
      
      // Check if only in one source
      if (subsection && !asset) {
        entry.hasDiscrepancy = true;
        entry.discrepancyDetails = "Only in subsections (not in asset register)";
      } else if (!subsection && asset) {
        entry.hasDiscrepancy = true;
        entry.discrepancyDetails = "Only in asset register (no subsection)";
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
  }, [subsections, assets]);

  // Filter based on search and view
  const filteredMeters = useMemo(() => {
    let filtered = consolidatedMeters;

    // Filter by view
    if (activeView === "matched") {
      filtered = filtered.filter(m => m.sources.subsection && m.sources.asset && !m.hasDiscrepancy);
    } else if (activeView === "discrepancies") {
      filtered = filtered.filter(m => m.hasDiscrepancy);
    } else if (activeView === "subsection-only") {
      filtered = filtered.filter(m => m.sources.subsection && !m.sources.asset);
    } else if (activeView === "asset-only") {
      filtered = filtered.filter(m => !m.sources.subsection && m.sources.asset);
    }

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(m => 
        m.meter_serial_number.toLowerCase().includes(searchLower) ||
        m.sources.subsection?.name.toLowerCase().includes(searchLower) ||
        m.sources.asset?.premises_id.toLowerCase().includes(searchLower) ||
        m.sources.asset?.trade_as?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [consolidatedMeters, activeView, search]);

  // Stats
  const stats = useMemo(() => ({
    total: consolidatedMeters.length,
    matched: consolidatedMeters.filter(m => m.sources.subsection && m.sources.asset && !m.hasDiscrepancy).length,
    discrepancies: consolidatedMeters.filter(m => m.hasDiscrepancy).length,
    subsectionOnly: consolidatedMeters.filter(m => m.sources.subsection && !m.sources.asset).length,
    assetOnly: consolidatedMeters.filter(m => !m.sources.subsection && m.sources.asset).length
  }), [consolidatedMeters]);

  const handleExportCSV = () => {
    const headers = ['Meter Serial', 'Subsection Name', 'Subsection CT', 'Asset Premises', 'Asset Trade As', 'Asset CT', 'Status', 'Discrepancy'];
    const rows = consolidatedMeters.map(m => [
      m.meter_serial_number,
      m.sources.subsection?.name || '',
      m.sources.subsection?.ct_ratio || '',
      m.sources.asset?.premises_id || '',
      m.sources.asset?.trade_as || '',
      m.sources.asset?.ct_ratio || '',
      m.hasDiscrepancy ? 'Discrepancy' : (m.sources.subsection && m.sources.asset ? 'Matched' : 'Partial'),
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
            All meter serial numbers from subsections and asset register
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
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setActiveView("all")}>
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

        <Card className="cursor-pointer hover:border-green-500/50 transition-colors" onClick={() => setActiveView("matched")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.matched}</p>
                <p className="text-xs text-muted-foreground">Matched</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-amber-500/50 transition-colors" onClick={() => setActiveView("discrepancies")}>
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

        <Card className="cursor-pointer hover:border-blue-500/50 transition-colors" onClick={() => setActiveView("subsection-only")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Layers className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{stats.subsectionOnly}</p>
                <p className="text-xs text-muted-foreground">Subsection Only</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-purple-500/50 transition-colors" onClick={() => setActiveView("asset-only")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <FileText className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">{stats.assetOnly}</p>
                <p className="text-xs text-muted-foreground">Asset Only</p>
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
                {activeView === "matched" && "Showing matched meters"}
                {activeView === "discrepancies" && "Showing meters with discrepancies"}
                {activeView === "subsection-only" && "Showing meters only in subsections"}
                {activeView === "asset-only" && "Showing meters only in asset register"}
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
                  <TableHead className="font-semibold">Subsection</TableHead>
                  <TableHead className="font-semibold">Asset Register</TableHead>
                  <TableHead className="font-semibold">CT Ratio</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMeters.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
                        {meter.sources.subsection ? (
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-blue-500 shrink-0" />
                            <span className="text-sm">{meter.sources.subsection.name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {meter.sources.asset ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{meter.sources.asset.premises_id}</span>
                            {meter.sources.asset.trade_as && (
                              <span className="text-xs text-muted-foreground">{meter.sources.asset.trade_as}</span>
                            )}
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
                        </div>
                      </TableCell>
                      <TableCell>
                        {meter.hasDiscrepancy ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 w-fit">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Discrepancy
                            </Badge>
                            {meter.discrepancyDetails && (
                              <span className="text-xs text-amber-600">{meter.discrepancyDetails}</span>
                            )}
                          </div>
                        ) : meter.sources.subsection && meter.sources.asset ? (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 w-fit">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Matched
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300 w-fit">
                            Partial
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
    </div>
  );
}
