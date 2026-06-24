import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { useSiteCocPool } from "./useSiteCocPool";

export function SiteCocLoadCard({ pool }: { pool: ReturnType<typeof useSiteCocPool> }) {
  const { busy, progress, outcomes, upload } = pool;
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const lastBatch = useRef<File[]>([]);
  const handleFiles = (l: FileList | null) => {
    if (!l || !l.length) return;
    const arr = Array.from(l);
    lastBatch.current = arr;
    upload(arr);
  };

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
          {busy
            ? <span className="inline-flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> {progress ? `Uploading ${progress.done}/${progress.total}…` : "Working…"}</span>
            : <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Upload className="h-4 w-4" /> Drop all COC PDFs + evaluation reports. They upload to a pool; exact register matches auto-assign — assign the rest in the Assign tab.</span>}
          <input ref={inputRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.html,.htm"
            onChange={e => { handleFiles(e.target.files); if (inputRef.current) inputRef.current.value = ""; }} />
        </div>

        {!busy && outcomes.length > 0 && (
          <div className="space-y-1">
            {outcomes.map((o, i) => (
              <div key={i} className="flex items-center justify-between text-xs border-b py-1">
                <span className="truncate max-w-[24rem]" title={o.name}>{o.name}</span>
                {o.state === "uploaded"
                  ? <span className="text-emerald-600">uploaded{o.detectedCertNo ? ` · ${o.detectedCertNo}` : " · no cert no"}</span>
                  : <span className="flex items-center gap-2 text-destructive">failed
                      <Button size="sm" variant="ghost" className="h-6" disabled={busy}
                        onClick={() => { const f = lastBatch.current.find(x => x.name === o.name); if (f) upload([f]); }}>Retry</Button>
                    </span>}
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-1">Assign the unmatched files in the <strong>Assign</strong> tab.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
