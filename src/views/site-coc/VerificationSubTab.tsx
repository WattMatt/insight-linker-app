import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { COC_SANS_RULES } from "@/lib/siteCoc/sansRules";
import { ruleTone, verdictTone, TONE_CELL } from "@/lib/siteCoc/statusDisplay";
import { StatusPill } from "./StatusPill";
import type { CocCertRow } from "./useSiteCoc";

const BANDS = [
  { key: "A", label: "Admin", rules: COC_SANS_RULES.filter(r => r.group === "A") },
  { key: "B", label: "Install", rules: COC_SANS_RULES.filter(r => r.group === "B") },
  { key: "C", label: "Tests", rules: COC_SANS_RULES.filter(r => r.group === "C") },
];

const glyph = (v: string | undefined) => {
  const t = (v ?? "").toUpperCase();
  if (t === "PASS") return "✓";
  if (t === "FAIL") return "✗";
  if (t === "CV") return "CV";
  if (t === "N/A") return "–";
  return "·";
};

const shortVerdict = (v: string) => (v || "—").split("—")[0].trim() || "—";

function Legend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1"><span className="text-emerald-600">✓</span> Pass</span>
      <span className="inline-flex items-center gap-1"><span className="font-semibold text-red-600">✗</span> Fail</span>
      <span className="inline-flex items-center gap-1"><span className="text-amber-600">CV</span> Cannot verify</span>
      <span className="inline-flex items-center gap-1"><span>–</span> N/A</span>
    </div>
  );
}

export function VerificationSubTab({ rows }: { rows: CocCertRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No verifications imported yet.</p>;
  const fixedHead = "h-auto p-2 align-middle text-xs";
  return (
    <div>
      <Legend />
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b-0">
              <TableHead rowSpan={2} className={cn(fixedHead, "sticky left-0 z-20 bg-muted/80")}>Shop</TableHead>
              <TableHead rowSpan={2} className={cn(fixedHead, "bg-muted/60")}>Cert no</TableHead>
              <TableHead rowSpan={2} className={cn(fixedHead, "bg-muted/60 text-center")}>Type</TableHead>
              <TableHead rowSpan={2} className={cn(fixedHead, "bg-muted/60")}>Verdict</TableHead>
              {BANDS.map(b => (
                <TableHead key={b.key} colSpan={b.rules.length}
                  className="h-auto p-1 text-center text-[11px] font-semibold uppercase tracking-wide border-l bg-muted/40">
                  {b.label}
                </TableHead>
              ))}
            </TableRow>
            <TableRow className="hover:bg-transparent">
              {BANDS.flatMap(b => b.rules.map((r, i) => (
                <TableHead key={r.code}
                  title={`${r.code} ${r.label}`}
                  className={cn("h-auto p-1 text-center text-[10px] font-medium bg-muted/40", i === 0 && "border-l")}>
                  {r.code}
                </TableHead>
              )))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id} className="text-xs">
                <TableCell className="sticky left-0 z-10 bg-background font-mono text-xs font-medium whitespace-nowrap p-2">{r.shop_no_raw || "—"}</TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap p-2">{r.cert_no || "—"}</TableCell>
                <TableCell className="text-center p-2">{r.cert_type ? r.cert_type[0] : ""}</TableCell>
                <TableCell className="p-2"><StatusPill tone={verdictTone(r.verdict)} label={shortVerdict(r.verdict)} title={r.verdict || "—"} /></TableCell>
                {BANDS.flatMap(b => b.rules.map((rule, i) => {
                  const v = r.rules?.[rule.code];
                  return (
                    <TableCell key={rule.code}
                      title={`${rule.code} ${rule.label}: ${v ?? "—"}`}
                      className={cn("p-1 text-center", TONE_CELL[ruleTone(v)], i === 0 && "border-l")}>
                      {glyph(v)}
                    </TableCell>
                  );
                }))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
