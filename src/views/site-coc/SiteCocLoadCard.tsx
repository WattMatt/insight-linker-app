import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, Trash2 } from "lucide-react";
import { useSiteCocPool, type PoolFile } from "./useSiteCocPool";
import type { SubsectionOption } from "./useSiteCoc";

function PoolRow({ file, subsections, onAssign, onDelete, busy }: {
  file: PoolFile; subsections: SubsectionOption[];
  onAssign: (f: PoolFile, sub: string, kind: "coc" | "eval") => void;
  onDelete: (f: PoolFile) => void; busy: boolean;
}) {
  const [kind, setKind] = useState<"coc" | "eval">(file.detected_kind === "eval" ? "eval" : "coc");
  const [sub, setSub] = useState<string>("");
  return (
    <tr className="border-b">
      <td className="p-2 text-xs max-w-[18rem] truncate" title={file.file_name}>{file.file_name}</td>
      <td className="p-2 font-mono text-xs whitespace-nowrap">{file.detected_cert_no ?? "—"}</td>
      <td className="p-2">
        <Select value={kind} onValueChange={(v) => setKind(v as "coc" | "eval")}>
          <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="coc">COC</SelectItem><SelectItem value="eval">Eval</SelectItem></SelectContent>
        </Select>
      </td>
      <td className="p-2">
        <Select value={sub} onValueChange={setSub}>
          <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Choose subsection…" /></SelectTrigger>
          <SelectContent>
            {subsections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.tenant_name && s.tenant_name !== s.name ? ` · ${s.tenant_name}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="p-2 text-right whitespace-nowrap">
        <Button size="sm" disabled={!sub || busy} onClick={() => onAssign(file, sub, kind)}>Assign</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(file)} title="Remove from pool"><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </td>
    </tr>
  );
}

export function SiteCocLoadCard({ siteId, subsections, onDone }: { siteId: string | undefined; subsections: SubsectionOption[]; onDone: () => void }) {
  const { pending, busy, upload, assignManual, remove } = useSiteCocPool(siteId, onDone);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const handleFiles = (l: FileList | null) => { if (l && l.length) upload(Array.from(l)); };

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
            ? <span className="inline-flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Working…</span>
            : <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Upload className="h-4 w-4" /> Drop all COC PDFs + evaluation reports. They upload to a pool; exact register matches auto-assign, the rest you assign below.</span>}
          <input ref={inputRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.html,.htm"
            onChange={e => { handleFiles(e.target.files); if (inputRef.current) inputRef.current.value = ""; }} />
        </div>

        {pending.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-amber-700">{pending.length} file(s) awaiting assignment</p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left bg-muted/40">
                  {["File", "Cert no", "Type", "Subsection", ""].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}
                </tr></thead>
                <tbody>
                  {pending.map(f => <PoolRow key={f.id} file={f} subsections={subsections} onAssign={assignManual} onDelete={remove} busy={busy} />)}
                </tbody>
              </table>
            </div>
          </div>
        ) : <p className="text-xs text-muted-foreground">No files awaiting assignment.</p>}
      </CardContent>
    </Card>
  );
}
