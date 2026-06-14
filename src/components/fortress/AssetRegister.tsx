import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, AlertTriangle, RefreshCw, Building2 } from "lucide-react";
import type { BuildingAsset, AssetCondition } from "@/lib/fortress/types";

// SCAFFOLD (Fortress building pack, S1-4). Presentational only — data is supplied via props
// by a future useBuildingAssets hook once the migrations are applied + types generated.
// This is the reference pattern for the other Fortress registers (OHS, Tenants, …).

const CONDITION_BADGE: Record<AssetCondition, string> = {
  Good: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  Fair: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  Poor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "N/A": "bg-muted text-muted-foreground",
};

const CONDITION_FILTERS: Array<"all" | AssetCondition> = ["all", "Good", "Fair", "Poor", "N/A"];

interface AssetRegisterProps {
  assets: BuildingAsset[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

export function AssetRegister({ assets, loading = false, error = false, onRetry }: AssetRegisterProps) {
  const [search, setSearch] = useState("");
  const [condition, setCondition] = useState<"all" | AssetCondition>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (condition !== "all" && (a.condition ?? "N/A") !== condition) return false;
      if (!q) return true;
      return [a.name, a.category, a.make_model, a.contractor].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [assets, search, condition]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
          <h3 className="font-semibold mb-1">Unable to load the asset register</h3>
          <p className="text-muted-foreground text-sm mb-4">Something went wrong loading building assets.</p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            Asset Register
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
        <div className="flex flex-wrap gap-2 pt-2">
          {CONDITION_FILTERS.map((c) => (
            <Button
              key={c}
              variant={condition === c ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setCondition(c)}
            >
              {c === "all" ? "All" : c}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mb-3 opacity-50" />
            <p className="font-medium">No building assets imported yet</p>
            <p className="text-sm">Import a building workbook to populate the asset register.</p>
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Asset</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Make / Model</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Next Service</TableHead>
                  <TableHead>Contractor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No assets match your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>{a.category}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{a.make_model || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={CONDITION_BADGE[a.condition ?? "N/A"]}>
                          {a.condition ?? "N/A"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{a.next_service_date || a.next_service_due || "-"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{a.contractor || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-sm text-muted-foreground mt-3">
          {filtered.length} of {assets.length} asset{assets.length === 1 ? "" : "s"}
        </p>
      </CardContent>
    </Card>
  );
}
