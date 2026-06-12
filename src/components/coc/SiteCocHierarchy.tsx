import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, Check, X, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toCocDoc, groupCocDocuments, cocDocFails, CocGroup } from "@/lib/cocHierarchy";

interface SubsectionLite { id: string; name: string; tenantName?: string | null; }
interface Props { subsections: SubsectionLite[]; }

const today = () => new Date().toISOString().slice(0, 10);

const rollupBadge = (g: CocGroup): { label: string; variant: "default" | "destructive" | "secondary" } =>
  g.rollup === "Fail" ? { label: "Non-compliant", variant: "destructive" }
  : g.rollup === "Pass" ? { label: "Compliant", variant: "default" }
  : g.rollup === "Missing" ? { label: "No COC", variant: "secondary" }
  : { label: "Pending", variant: "secondary" };

export function SiteCocHierarchy({ subsections }: Props) {
  const [byId, setById] = useState<Record<string, CocGroup>>({});

  useEffect(() => {
    const ids = subsections.map((s) => s.id);
    if (ids.length === 0) { setById({}); return; }
    (async () => {
      const { data } = await supabase
        .from("subsection_documents")
        .select("id, subsection_id, file_name, file_url, coc_number, coc_issue_date, coc_expiry_date, coc_type, coc_status, document_categories(name)")
        .in("subsection_id", ids);
      const groups: Record<string, CocGroup> = {};
      for (const s of subsections) {
        const docs = ((data ?? []) as any[])
          .filter((r) => r.subsection_id === s.id)
          .filter((r) => {
            const n = (r.document_categories?.name ?? "").toLowerCase();
            return n.includes("coc") && !n.includes("validation") && !n.includes("report");
          })
          .map(toCocDoc);
        groups[s.id] = groupCocDocuments(docs, today());
      }
      setById(groups);
    })();
  }, [subsections]);

  return (
    <Card>
      <CardHeader><CardTitle>Certificates of Compliance</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {subsections.map((s) => {
          const g = byId[s.id] ?? { initial: null, supplementaries: [], rollup: "Missing" as const };
          const b = rollupBadge(g);
          return (
            <div key={s.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{s.name}</span>
                  {s.tenantName && <span className="text-muted-foreground text-sm">· {s.tenantName}</span>}
                </div>
                <Badge variant={b.variant} className="text-xs">{b.label}</Badge>
              </div>
              {g.initial ? (
                <div className="mt-2 space-y-1">
                  <CocLine label="Initial" number={g.initial.cocNumber} fail={cocDocFails(g.initial, today())} status={g.initial.cocStatus} />
                  {g.supplementaries.length > 0 && (
                    <div className="ml-4 border-l-2 border-border pl-3 space-y-1">
                      {g.supplementaries.map((d) => (
                        <CocLine key={d.id} label={d.cocType} number={d.cocNumber} fail={cocDocFails(d, today())} status={d.cocStatus} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground flex items-center gap-1"><FileText className="h-4 w-4" />No certificate uploaded yet</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CocLine({ label, number, fail, status }: { label: string; number: string | null; fail: boolean; status: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-muted/40 rounded">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">{label}</Badge>
        <span className="font-mono text-xs">{number || "—"}</span>
      </div>
      <Badge variant={fail ? "destructive" : status === "Pass" ? "default" : "secondary"} className="text-xs">
        {fail ? <X className="h-3 w-3 mr-1" /> : status === "Pass" ? <Check className="h-3 w-3 mr-1" /> : null}{fail ? "Fail" : status}
      </Badge>
    </div>
  );
}
