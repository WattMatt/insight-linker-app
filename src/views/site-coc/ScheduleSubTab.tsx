import { Badge } from "@/components/ui/badge";
import type { CocScheduleRow } from "./useSiteCoc";

export function ScheduleSubTab({ rows }: { rows: CocScheduleRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No schedule imported yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b">
          {["Shop","Trading","COC Req.","Initial","Supplementary","Files","Status","Match"].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b">
              <td className="p-2 font-medium">{r.shop_no_raw}</td>
              <td className="p-2">{r.trading_name}</td>
              <td className="p-2">{r.coc_required}</td>
              <td className="p-2">{r.initial_cert_nos}</td>
              <td className="p-2">{r.supplementary_cert_nos}</td>
              <td className="p-2">{r.files_count ?? ""}</td>
              <td className="p-2">{r.status}</td>
              <td className="p-2">{r.match_status === "unmatched"
                ? <Badge variant="destructive">unmatched</Badge>
                : <Badge variant="secondary">matched</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
