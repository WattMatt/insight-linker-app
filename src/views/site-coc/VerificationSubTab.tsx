import { COC_SANS_RULES } from "@/lib/siteCoc/sansRules";
import type { CocCertRow } from "./useSiteCoc";

const cell = (v: string | undefined) => {
  const t = (v ?? "").toUpperCase();
  if (t === "PASS") return <span className="text-emerald-600" title="PASS">✓</span>;
  if (t === "FAIL") return <span className="text-red-600 font-bold" title="FAIL">✗</span>;
  if (t === "CV") return <span className="text-amber-600" title="cannot verify">CV</span>;
  if (t === "N/A") return <span className="text-muted-foreground" title="N/A">–</span>;
  return <span className="text-muted-foreground">·</span>;
};

export function VerificationSubTab({ rows }: { rows: CocCertRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No verifications imported yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left border-b">
          <th className="p-1 font-medium sticky left-0 bg-background">Shop</th>
          <th className="p-1 font-medium">Cert No</th>
          <th className="p-1 font-medium">Type</th>
          <th className="p-1 font-medium">Verdict</th>
          {COC_SANS_RULES.map(r => <th key={r.code} className="p-1 font-medium text-center" title={`${r.code} ${r.label}`}>{r.code}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b">
              <td className="p-1 font-medium sticky left-0 bg-background">{r.shop_no_raw}</td>
              <td className="p-1">{r.cert_no}</td>
              <td className="p-1">{r.cert_type ? r.cert_type[0] : ""}</td>
              <td className="p-1" title={r.reasons}>{r.verdict}</td>
              {COC_SANS_RULES.map(rule => <td key={rule.code} className="p-1 text-center">{cell(r.rules?.[rule.code])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
