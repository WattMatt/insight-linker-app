import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { scheduleStatusTone } from "@/lib/siteCoc/statusDisplay";
import { assignedSubsectionIds, unassignedCocRequired } from "@/lib/siteCoc/coverage";
import { StatusPill } from "./StatusPill";
import type { CocScheduleRow, SubsectionOption } from "./useSiteCoc";

const shortStatus = (s: string) => (s || "—").split("—")[0].trim() || "—";

function CertChips({ value }: { value: string }) {
  const items = (value || "").split(";").map(v => v.trim()).filter(Boolean);
  if (!items.length) return <span className="text-muted-foreground/60">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((c, i) => <span key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-tight">{c}</span>)}
    </div>
  );
}

interface Props {
  rows: CocScheduleRow[];
  subsections: SubsectionOption[];
  onResolve: (scheduleRowId: string, shopNoRaw: string, subsectionId: string) => void;
}

export function ScheduleSubTab({ rows, subsections, onResolve }: Props) {
  const assigned = assignedSubsectionIds(rows);
  const gaps = unassignedCocRequired(subsections, assigned);
  const subName = new Map(subsections.map(s => [s.id, s.name]));

  if (!rows.length && !gaps.length) return <p className="text-sm text-muted-foreground">No schedule imported yet.</p>;

  return (
    <div className="space-y-2">
      {gaps.length > 0 && (
        <p className="text-xs font-medium text-amber-700">
          {gaps.length} COC-required subsection{gaps.length === 1 ? "" : "s"} have no COC on file.
        </p>
      )}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[1%] whitespace-nowrap">Shop</TableHead>
              <TableHead>Trading name</TableHead>
              <TableHead className="text-center">Req.</TableHead>
              <TableHead>Initial COC(s)</TableHead>
              <TableHead>Supplementary COC(s)</TableHead>
              <TableHead className="text-right">Files</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Subsection</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => {
              const unmatched = r.match_status === "unmatched";
              const req = r.coc_required.trim().toUpperCase();
              return (
                <TableRow key={r.id} className={cn(unmatched && "bg-red-50/60 hover:bg-red-50")}>
                  <TableCell className="whitespace-nowrap font-mono text-xs font-medium align-top">{r.shop_no_raw}</TableCell>
                  <TableCell className="align-top">{r.trading_name}</TableCell>
                  <TableCell className="text-center align-top">
                    <span className={cn("text-xs font-medium", req === "Y" ? "text-foreground" : "text-muted-foreground")}>
                      {req === "N/A" ? "N/A" : req || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="align-top"><CertChips value={r.initial_cert_nos} /></TableCell>
                  <TableCell className="align-top"><CertChips value={r.supplementary_cert_nos} /></TableCell>
                  <TableCell className="text-right tabular-nums align-top">{r.files_count ?? "—"}</TableCell>
                  <TableCell className="align-top">
                    <StatusPill tone={scheduleStatusTone(r.status)} label={shortStatus(r.status)} title={r.status || "—"} />
                  </TableCell>
                  <TableCell className="align-top min-w-[12rem]">
                    {r.subsection_id
                      ? <span className="text-xs">{subName.get(r.subsection_id) ?? "—"}</span>
                      : (
                        <Select onValueChange={(v) => onResolve(r.id, r.shop_no_raw, v)}>
                          <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Assign subsection…" /></SelectTrigger>
                          <SelectContent>
                            {gaps.map(s => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}{s.tenant_name && s.tenant_name !== s.name ? ` · ${s.tenant_name}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                  </TableCell>
                </TableRow>
              );
            })}

            {gaps.map(s => (
              <TableRow key={`gap-${s.id}`} className="bg-amber-50/40">
                <TableCell className="align-top text-muted-foreground/60">—</TableCell>
                <TableCell className="align-top font-medium">{s.name}{s.tenant_name && s.tenant_name !== s.name ? ` · ${s.tenant_name}` : ""}</TableCell>
                <TableCell className="text-center align-top text-xs font-medium">Y</TableCell>
                <TableCell className="align-top text-muted-foreground/60">—</TableCell>
                <TableCell className="align-top text-muted-foreground/60">—</TableCell>
                <TableCell className="text-right align-top text-muted-foreground/60">—</TableCell>
                <TableCell className="align-top"><StatusPill tone="red" label="No COC" title="No COC on file" /></TableCell>
                <TableCell className="align-top text-xs">{s.name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
