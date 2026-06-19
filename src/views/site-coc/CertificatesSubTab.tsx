import { Badge } from "@/components/ui/badge";
import type { CocCertRow } from "./useSiteCoc";

export function CertificatesSubTab({ rows }: { rows: CocCertRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No certificates imported yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b">
          {["Shop","Cert No","Type","Doc type","9(2)","Issued","Conf","File","Match"].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b">
              <td className="p-2 font-medium">{r.shop_no_raw}</td>
              <td className="p-2">{r.cert_no}</td>
              <td className="p-2">{r.cert_type}</td>
              <td className="p-2">{r.doc_type}</td>
              <td className="p-2">{r.clause_9_2}</td>
              <td className="p-2">{r.issued_date ?? ""}</td>
              <td className="p-2">{r.confidence}</td>
              <td className="p-2 max-w-[16rem] truncate" title={r.source_file}>{r.source_file}</td>
              <td className="p-2">{r.match_status === "unmatched" ? <Badge variant="destructive">unmatched</Badge> : <Badge variant="secondary">matched</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
