import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, Loader2, Pencil, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  siteShopCode,
  type ComparisonResult,
  type InspectionTenantMatch,
  type SiteShop,
} from "@/lib/assetVerification";
import { updateMeterRow, updateSubsection, type MeterRowPatch, type SubsectionPatch } from "./siteDataWrites";

interface SiteShopsEditorProps {
  siteShops: SiteShop[];
  meterRows: InspectionTenantMatch[];
  comparisonResults: ComparisonResult[];
  unregisteredMeters: InspectionTenantMatch[];
  readOnly?: boolean;
  onDataUpdated?: () => void;
}

/** Click-to-edit text. Enter saves, Escape cancels; saving an unchanged value is a no-op. */
function EditableText({
  value,
  placeholder,
  readOnly,
  onSave,
  className,
}: {
  value: string | null | undefined;
  placeholder?: string;
  readOnly?: boolean;
  onSave: (next: string) => Promise<void>;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const current = value ?? "";

  const save = async () => {
    if (draft === null) return;
    if (draft.trim() === current.trim()) {
      setDraft(null);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft.trim());
      setDraft(null);
    } catch (error) {
      console.error("Save failed:", error);
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (draft !== null) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft(null);
            }
          }}
          placeholder={placeholder}
          className="h-7 text-xs min-w-[7rem]"
          autoFocus
        />
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={save} disabled={saving} title="Save">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDraft(null)} title="Cancel">
          <X className="h-3 w-3 text-destructive" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 group/edit ${className ?? ""}`}>
      <span className={current ? "text-sm" : "text-xs text-muted-foreground italic"}>{current || placeholder || "—"}</span>
      {!readOnly && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 opacity-0 group-hover/edit:opacity-100 focus:opacity-100"
          onClick={() => setDraft(current)}
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

const rowKey = (r: Pick<InspectionTenantMatch, "inspectionId" | "tenantId" | "meterSerialNumber">) =>
  `${r.inspectionId}:${r.tenantId ?? r.meterSerialNumber}`;

/**
 * "Shops on site": the subsections (shops and boards) and the meter rows on the board
 * inspections, all editable in place. This is where a register row gets tied to what is on
 * site — by giving the subsection (or the meter row) the register's shop number — and where
 * meters found on site but missing from the register are listed.
 */
export const SiteShopsEditor = ({
  siteShops,
  meterRows,
  comparisonResults,
  unregisteredMeters,
  readOnly = false,
  onDataUpdated,
}: SiteShopsEditorProps) => {
  const [search, setSearch] = useState("");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const q = search.trim().toLowerCase();
  const hit = (...values: (string | null | undefined)[]) => !q || values.some((v) => (v || "").toLowerCase().includes(q));

  // Which register row each shop / meter row is tied to.
  const premisesByShop = useMemo(() => {
    const m = new Map<string, ComparisonResult>();
    for (const r of comparisonResults) if (r.siteShop && r.status !== "wrong_meter" && r.linkedBy) m.set(r.siteShop.id, r);
    return m;
  }, [comparisonResults]);
  const premisesByRow = useMemo(() => {
    const m = new Map<string, ComparisonResult>();
    for (const r of comparisonResults) if (r.inspectionMatch && r.status !== "wrong_meter") m.set(rowKey(r.inspectionMatch), r);
    return m;
  }, [comparisonResults]);
  const unregistered = useMemo(() => new Set(unregisteredMeters.map(rowKey)), [unregisteredMeters]);

  const saveShop = (shop: SiteShop, patch: SubsectionPatch) => async () => {
    await updateSubsection(shop.id, patch);
    toast.success(`${patch.name ?? shop.name} updated`);
    onDataUpdated?.();
  };
  const saveRow = (row: InspectionTenantMatch, patch: MeterRowPatch) => async () => {
    await updateMeterRow(row.inspectionId, row, patch);
    toast.success(`${row.subsectionName ?? "Meter"} · ${patch.shopName ?? row.shopName ?? ""} updated`);
    onDataUpdated?.();
  };

  const linkedCell = (r: ComparisonResult | undefined, fallback: ReactNode) =>
    r ? (
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{r.asset.premises_id}</div>
        {r.status === "verified" ? (
          <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-[10px]">Verified</Badge>
        ) : (
          <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px]">
            {r.serialMatch === "mismatch" ? "Register serial differs" : "Mismatch"}
          </Badge>
        )}
      </div>
    ) : (
      fallback
    );

  const shops = siteShops.filter(
    (s) => hit(s.name, s.shop_number, s.tenant_name, s.meter_serial_number) && (!onlyUnlinked || !premisesByShop.has(s.id)),
  );
  const rows = meterRows.filter(
    (r) =>
      hit(r.subsectionName, r.shopNumber, r.shopName, r.meterSerialNumber) &&
      (!onlyUnlinked || !premisesByRow.has(rowKey(r))),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search shops, numbers, tenants, serials..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="only-unlinked" checked={onlyUnlinked} onCheckedChange={setOnlyUnlinked} />
            <Label htmlFor="only-unlinked" className="text-sm">Only not tied to the register</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Shops and subsections</CardTitle>
          <CardDescription>
            A register row is tied to its shop by shop number. When the name already is the number
            (“SHOP G01-G06”) nothing is needed; otherwise set the shop number, e.g. Shop 1 for
            “Shoprite”, or DB-F1 for “Main DB F1 1st Floor North”.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subsection name</TableHead>
                <TableHead>Shop number</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Meter serial (site)</TableHead>
                <TableHead>Register row</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shops.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No subsections</TableCell>
                </TableRow>
              ) : (
                shops.map((shop) => {
                  const fromName = !shop.shop_number?.trim() && siteShopCode(shop) ? shop.name.replace(/^shop\b\.?\s*/i, "") : "";
                  return (
                    <TableRow key={shop.id}>
                      <TableCell>
                        <EditableText value={shop.name} readOnly={readOnly} onSave={(v) => saveShop(shop, { name: v })()} />
                      </TableCell>
                      <TableCell>
                        <EditableText
                          value={shop.shop_number}
                          placeholder={fromName ? `${fromName} (from name)` : "not set"}
                          readOnly={readOnly}
                          onSave={(v) => saveShop(shop, { shop_number: v || null })()}
                        />
                      </TableCell>
                      <TableCell>
                        <EditableText value={shop.tenant_name} readOnly={readOnly} onSave={(v) => saveShop(shop, { tenant_name: v || null })()} />
                      </TableCell>
                      <TableCell>
                        <EditableText
                          value={shop.meter_serial_number}
                          readOnly={readOnly}
                          onSave={(v) => saveShop(shop, { meter_serial_number: v || null })()}
                        />
                      </TableCell>
                      <TableCell>
                        {linkedCell(premisesByShop.get(shop.id), <span className="text-xs text-muted-foreground">not tied</span>)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Meters on board inspections
            {unregisteredMeters.length > 0 && (
              <Badge variant="outline" className="ml-2 text-orange-600 border-orange-300 bg-orange-50">
                {unregisteredMeters.length} not in register
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Each meter row as captured on site. Put the register’s shop number (e.g. G01-G06, DB-F3A)
            in Shop number to tie a row to its register entry; correct a mistyped serial here.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Board</TableHead>
                <TableHead>Shop number</TableHead>
                <TableHead>Shop name</TableHead>
                <TableHead>Meter serial</TableHead>
                <TableHead>CT / Breaker</TableHead>
                <TableHead>Register row</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No meter rows</TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const key = rowKey(row);
                  return (
                    <TableRow key={key} className={unregistered.has(key) ? "bg-orange-50/60 dark:bg-orange-950/20" : undefined}>
                      <TableCell className="text-sm text-muted-foreground">{row.subsectionName ?? "—"}</TableCell>
                      <TableCell>
                        <EditableText value={row.shopNumber} readOnly={readOnly} onSave={(v) => saveRow(row, { shopNumber: v })()} />
                      </TableCell>
                      <TableCell>
                        <EditableText value={row.shopName} readOnly={readOnly} onSave={(v) => saveRow(row, { shopName: v })()} />
                      </TableCell>
                      <TableCell>
                        <EditableText value={row.meterSerialNumber} readOnly={readOnly} onSave={(v) => saveRow(row, { meterSerialNumber: v })()} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {row.ctSizeAndRatio || "—"} · {row.breakerSize || "—"}
                      </TableCell>
                      <TableCell>
                        {linkedCell(
                          premisesByRow.get(key),
                          unregistered.has(key) ? (
                            <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-[10px]">Not in register</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          ),
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
    </div>
  );
};
