import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rankSubsectionCandidates } from "@/lib/siteCoc/rankCandidates";
import type { PoolFile } from "./useSiteCocPool";
import type { SubsectionOption } from "./useSiteCoc";

const REASON_LABEL: Record<string, string> = {
  cert_has_no_subsection: "Cert found, shop not matched to a subsection",
  ambiguous_cert: "Cert number appears on more than one subsection",
  cert_not_found: "Cert number not in the imported schedule",
  no_cert_detected: "No cert number in the filename",
  assign_failed: "Assignment failed — retry",
};

function FileRow({ file, subsections, onAssign }: {
  file: PoolFile; subsections: SubsectionOption[];
  onAssign: (f: PoolFile, sub: string) => void;
}) {
  const [sub, setSub] = useState("");
  const suggestions = useMemo(
    () => rankSubsectionCandidates(file.detected_cert_no ?? file.file_name, subsections, 3).filter(c => c.score > 0.3),
    [file, subsections],
  );
  return (
    <div className="flex flex-col gap-2 border-b py-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-xs max-w-[18rem] truncate sm:flex-1" title={file.file_name}>{file.file_name}</span>
      <span className="font-mono text-xs whitespace-nowrap w-28">{file.detected_cert_no ?? "—"}</span>
      <div className="flex flex-wrap gap-1 sm:flex-1">
        {suggestions.map(s => (
          <Button key={s.id} size="sm" variant="outline" className="h-7" onClick={() => onAssign(file, s.id)}>
            {s.name} <span className="ml-1 text-[10px] text-muted-foreground">{Math.round(s.score * 100)}%</span>
          </Button>
        ))}
        {!suggestions.length && <span className="text-xs text-muted-foreground">no close match</span>}
      </div>
      <Select value={sub} onValueChange={(v) => { setSub(v); onAssign(file, v); }}>
        <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Choose subsection…" /></SelectTrigger>
        <SelectContent>
          {subsections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.tenant_name && s.tenant_name !== s.name ? ` · ${s.tenant_name}` : ""}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AssignSubTab({ pending, subsections, onAssign, onAssignMany, onReassign, busy }: {
  pending: PoolFile[];
  subsections: SubsectionOption[];
  onAssign: (f: PoolFile, sub: string) => void;
  onAssignMany: (files: PoolFile[], sub: string) => void;
  onReassign: () => void;
  busy: boolean;
}) {
  const [batchSub, setBatchSub] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const m = new Map<string, PoolFile[]>();
    for (const f of pending) {
      const k = f.reason ?? "cert_not_found";
      const arr = m.get(k) ?? [];
      arr.push(f);
      m.set(k, arr);
    }
    return Array.from(m.entries());
  }, [pending]);

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  if (!pending.length) {
    return <p className="text-sm text-muted-foreground">All uploaded COC files are assigned. Drop more files in the Load card to ingest.</p>;
  }

  const selectedFiles = pending.filter(f => selected.has(f.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{pending.length} file(s) awaiting assignment, grouped by reason.</p>
        <Button size="sm" variant="outline" disabled={busy} onClick={onReassign}>Re-run auto-assign</Button>
      </div>

      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
          <span className="text-sm">{selectedFiles.length} selected →</span>
          <Select value={batchSub} onValueChange={setBatchSub}>
            <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Assign all to…" /></SelectTrigger>
            <SelectContent>
              {subsections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.tenant_name && s.tenant_name !== s.name ? ` · ${s.tenant_name}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!batchSub || busy} onClick={() => { onAssignMany(selectedFiles, batchSub); setSelected(new Set()); setBatchSub(""); }}>Assign {selectedFiles.length}</Button>
        </div>
      )}

      {groups.map(([reason, files]) => (
        <div key={reason} className="space-y-1">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Badge variant="outline">{files.length}</Badge> {REASON_LABEL[reason] ?? reason}
          </h4>
          <div>
            {files.map(f => (
              <div key={f.id} className="flex items-start gap-2">
                <div className="pt-3"><Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f.id)} /></div>
                <div className="flex-1"><FileRow file={f} subsections={subsections} onAssign={onAssign} /></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
