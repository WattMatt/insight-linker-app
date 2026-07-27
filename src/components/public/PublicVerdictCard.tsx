import { presentVerdict, type PublicVerdict } from "@/lib/publicVerdict";
import { CheckCircle2, XCircle, Clock, HelpCircle } from "lucide-react";

const STYLE: Record<string, { wrap: string; Icon: typeof CheckCircle2 }> = {
  "pass":          { wrap: "bg-green-50 border-green-200 text-green-800", Icon: CheckCircle2 },
  "pass-expiring": { wrap: "bg-green-50 border-amber-300 text-green-800", Icon: CheckCircle2 },
  "fail":          { wrap: "bg-red-50 border-red-200 text-red-800", Icon: XCircle },
  "pending":       { wrap: "bg-muted border-border text-muted-foreground", Icon: Clock },
  "missing":       { wrap: "bg-muted border-border text-muted-foreground", Icon: HelpCircle },
};

export const PublicVerdictCard = ({ verdict }: { verdict: PublicVerdict | null }) => {
  const p = presentVerdict(verdict, new Date());
  if (p.kind === "none") return null;
  const { wrap, Icon } = STYLE[p.kind];
  return (
    <div className={`rounded-lg border p-4 mb-6 ${wrap}`}>
      <div className="flex items-center gap-2 font-semibold text-lg">
        <Icon className="h-5 w-5" aria-hidden="true" /> {p.headline}
      </div>
      {p.sub && <p className="text-sm mt-1 opacity-80">{p.sub}</p>}
      <div className="text-sm mt-2 space-y-0.5">
        {verdict?.cert_number && <p>COC No. {verdict.cert_number}</p>}
        {verdict?.issue_date && <p>Issued {new Date(verdict.issue_date).toLocaleDateString()}</p>}
        {verdict?.expiry_date && <p>Expiry date {new Date(verdict.expiry_date).toLocaleDateString()}</p>}
      </div>
    </div>
  );
};
