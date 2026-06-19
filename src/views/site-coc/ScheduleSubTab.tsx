import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { scheduleStatusTone } from "@/lib/siteCoc/statusDisplay";
import { StatusPill } from "./StatusPill";
import type { CocScheduleRow } from "./useSiteCoc";

/** Short, scannable status label: the part before the em-dash ("OK", "MISSING", "FLAG", "N/A"). */
const shortStatus = (s: string) => (s || "—").split("—")[0].trim() || "—";

function CertChips({ value }: { value: string }) {
  const items = (value || "").split(";").map(v => v.trim()).filter(Boolean);
  if (!items.length) return <span className="text-muted-foreground/60">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((c, i) => (
        <span key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-tight">{c}</span>
      ))}
    </div>
  );
}

export function ScheduleSubTab({ rows }: { rows: CocScheduleRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No schedule imported yet.</p>;
  return (
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => {
            const unmatched = r.match_status === "unmatched";
            const req = r.coc_required.trim().toUpperCase();
            return (
              <TableRow key={r.id} className={cn(unmatched && "bg-red-50/60 hover:bg-red-50")}>
                <TableCell className="whitespace-nowrap font-mono text-xs font-medium align-top">
                  {r.shop_no_raw}
                  {unmatched && <StatusPill tone="red" label="unmatched" className="ml-2 align-middle" title="No matching subsection on this site" />}
                </TableCell>
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
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
