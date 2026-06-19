import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Loader2 } from "lucide-react";
import { useSiteCocLoad } from "./useSiteCocLoad";

export function SiteCocLoadCard({ siteId, onDone }: { siteId: string | undefined; onDone: () => void }) {
  const { loading, result, load } = useSiteCocLoad(siteId, onDone);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleFiles = (list: FileList | null) => { if (list && list.length) load(Array.from(list)); };

  const leftovers: Array<[string, string[]]> = result ? [
    ["Unmatched (no cert no. match)", result.unmatched],
    ["Ambiguous (number maps to >1 shop)", result.ambiguous],
    ["Needs its COC first", result.needsCoc],
    ["Failed", result.failed],
  ] : [];

  return (
    <Card>
      <CardHeader><CardTitle>Load COC files & evaluation reports</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${drag ? "bg-accent border-primary" : "bg-muted/20 hover:bg-muted/40"}`}
        >
          {loading
            ? <span className="inline-flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Routing files…</span>
            : <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Upload className="h-4 w-4" /> Drop COC PDFs + evaluation reports, or click to select. Auto-routed by COC number to the right shop.</span>}
          <input ref={inputRef} type="file" multiple className="hidden"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.html,.htm"
            onChange={e => { handleFiles(e.target.files); if (inputRef.current) inputRef.current.value = ""; }} />
        </div>

        {result && (
          <div className="space-y-2 text-sm">
            <p className="font-medium">Routed {result.routedCoc} COC + {result.routedEval} evaluation file(s).</p>
            {leftovers.map(([label, items]) => items.length > 0 && (
              <div key={label}>
                <p className="text-xs font-medium text-amber-700">{label} ({items.length})</p>
                <ul className="ml-4 list-disc text-xs text-muted-foreground">
                  {items.map(n => <li key={n} className="truncate">{n}</li>)}
                </ul>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Tip: unmatched usually means the shop isn't matched to a subsection yet (resolve on the Schedule tab), or the COC number isn't in the filename.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
