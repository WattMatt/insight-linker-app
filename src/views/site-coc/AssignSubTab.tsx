import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rankSubsectionCandidates } from "@/lib/siteCoc/rankCandidates";
import type { PoolFile } from "./useSiteCocPool";
import type { SubsectionOption } from "./useSiteCoc";

const REASON_LABEL: Record<string, string> = {
  cert_has_no_subsection: "Cert found in the register, but its shop isn't matched to a subsection",
  ambiguous_cert: "Cert number appears on more than one subsection — pick the right one",
  cert_not_found: "Cert number not in the imported register — check the workbook or fix the number",
  no_cert_detected: "No cert number detected in the filename — type it in to match",
  assign_failed: "Assignment failed — retry",
};

const EDITABLE_CERT_REASONS = new Set(["no_cert_detected", "cert_not_found"]);

function FileRow({ file, subsections, onAssign, onUpdateCertNo, busy }: {
  file: PoolFile; subsections: SubsectionOption[];
  onAssign: (f: PoolFile, sub: string) => void;
  onUpdateCertNo: (f: PoolFile, certNo: string) => void;
  busy: boolean;
}) {
  const [sub, setSub] = useState("");
  const [certNo, setCertNo] = useState(file.detected_cert_no ?? "");
  const canEditCert = EDITABLE_CERT_REASONS.has(file.reason ?? "");

  // Ambiguous certs already carry their candidate subsections — surface those
  // first; fall back to fuzzy name suggestions otherwise.
  const candidates = useMemo(() => {
    if (file.reason === "ambiguous_cert" && file.candidate_ids?.length) {
      return file.candidate_ids
        .map(id => subsections.find(s => s.id === id))
        .filter((s): s is SubsectionOption => !!s)
        .map(s => ({ id: s.id, name: s.name, score: 1 }));
    }
    return rankSubsectionCandidates(file.detected_cert_no ?? file.file_name, subsections, 3).filter(c => c.score > 0.3);
  }, [file, subsections]);

  return (
    <div className="flex flex-col gap-2 border-b py-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-xs max-w-[18rem] truncate sm:flex-1" title={file.file_name}>{file.file_name}</span>
      {canEditCert ? (
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); onUpdateCertNo(file, certNo.trim()); }}>
          <Input className="h-8 w-32 font-mono text-xs" placeholder="Cert no." value={certNo} onChange={(e) => setCertNo(e.target.value)} />
          <Button type="submit" size="sm" variant="outline" className="h-8" disabled={busy || certNo.trim() === (file.detected_cert_no ?? "")}>Match</Button>
        </form>
      ) : (
        <span className="font-mono text-xs whitespace-nowrap w-28">{file.detected_cert_no ?? "—"}</span>
      )}
      <div className="flex flex-wrap gap-1 sm:flex-1">
        {candidates.map(s => (
          <Button key={s.id} size="sm" variant="outline" className="h-7" onClick={() => onAssign(file, s.id)}>
            {s.name}{s.score < 1 && <span className="ml-1 text-[10px] text-muted-foreground">{Math.round(s.score * 100)}%</span>}
          </Button>
        ))}
        {!candidates.length && <span className="text-xs text-muted-foreground">no close match</span>}
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

export function AssignSubTab({ pending, subsections, onAssign, onAssignMany, onReassign, onUpdateCertNo, onGoToSchedule, hasImport, busy }: {
  pending: PoolFile[];
  subsections: SubsectionOption[];
  onAssign: (f: PoolFile, sub: string) => void;
  onAssignMany: (files: PoolFile[], sub: string) => void;
  onReassign: () => void;
  onUpdateCertNo: (f: PoolFile, certNo: string) => void;
  onGoToSchedule: () => void;
  hasImport: boolean;
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
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">No exceptions — every uploaded COC file is attached to its subsection.</p>
        {!hasImport && <p className="text-sm text-amber-700">No register imported yet. Import the DB Schedule and Verification workbooks first — files can only match after that.</p>}
      </div>
    );
  }

  const selectedFiles = pending.filter(f => selected.has(f.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{pending.length} file(s) need attention, grouped by what's wrong.</p>
        <Button size="sm" variant="outline" disabled={busy} onClick={onReassign}>Re-run auto-assign</Button>
      </div>

      {!hasImport && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          No register imported yet — import the DB Schedule and Verification workbooks, then re-run auto-assign.
        </p>
      )}

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
            {reason === "cert_has_no_subsection" && (
              <Button size="sm" variant="link" className="h-6 px-1" onClick={onGoToSchedule}>Fix in Schedule →</Button>
            )}
          </h4>
          <div>
            {files.map(f => (
              <div key={f.id} className="flex items-start gap-2">
                <div className="pt-3"><Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f.id)} /></div>
                <div className="flex-1"><FileRow file={f} subsections={subsections} onAssign={onAssign} onUpdateCertNo={onUpdateCertNo} busy={busy} /></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
