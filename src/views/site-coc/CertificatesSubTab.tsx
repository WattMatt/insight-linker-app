import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { verdictTone } from "@/lib/siteCoc/statusDisplay";
import { StatusPill } from "./StatusPill";
import type { CocCertRow } from "./useSiteCoc";

const CONF_TONE: Record<string, string> = {
  high: "bg-emerald-500",
  med: "bg-amber-500",
  low: "bg-red-500",
};

function Confidence({ value }: { value: string }) {
  const v = (value || "").toLowerCase();
  if (!v) return <span className="text-muted-foreground/60">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs capitalize">
      <span className={cn("h-2 w-2 rounded-full", CONF_TONE[v] ?? "bg-muted-foreground/40")} />
      {value}
    </span>
  );
}

const shortVerdict = (v: string) => (v || "—").split("—")[0].trim() || "—";

export function CertificatesSubTab({ rows }: { rows: CocCertRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No certificates imported yet.</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[1%] whitespace-nowrap">Shop</TableHead>
            <TableHead>Cert no</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Verdict</TableHead>
            <TableHead>Doc type</TableHead>
            <TableHead className="text-center">9(2)</TableHead>
            <TableHead>Issued</TableHead>
            <TableHead>Conf.</TableHead>
            <TableHead>Source file</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => {
            const unmatched = r.match_status === "unmatched";
            const isCoc = r.doc_type === "electrical_coc";
            return (
              <TableRow key={r.id} className={cn(unmatched && "bg-red-50/60 hover:bg-red-50")}>
                <TableCell className="whitespace-nowrap font-mono text-xs font-medium">
                  {r.shop_no_raw || "—"}
                  {unmatched && <StatusPill tone="red" label="unmatched" className="ml-2 align-middle" title="No matching subsection on this site" />}
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">{r.cert_no || "—"}</TableCell>
                <TableCell><span className="text-xs">{r.cert_type}</span></TableCell>
                <TableCell><StatusPill tone={verdictTone(r.verdict)} label={shortVerdict(r.verdict)} title={r.verdict || "—"} /></TableCell>
                <TableCell>
                  <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium",
                    isCoc ? "bg-sky-50 text-sky-700 border border-sky-200" : "bg-muted text-muted-foreground")}>
                    {r.doc_type || "—"}
                  </span>
                </TableCell>
                <TableCell className="text-center text-xs uppercase">{r.clause_9_2 || "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-xs tabular-nums">{r.issued_date ?? "—"}</TableCell>
                <TableCell><Confidence value={r.confidence} /></TableCell>
                <TableCell className="max-w-[18rem] truncate text-xs text-muted-foreground" title={r.source_file}>{r.source_file || "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
