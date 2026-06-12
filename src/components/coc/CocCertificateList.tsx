import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Download, Trash2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { toCocDoc, groupCocDocuments, cocDocFails, CocDoc, CocType } from "@/lib/cocHierarchy";
import type { SupabaseDocument } from "@/views/subsection-detail/types";

interface Props {
  cocDocuments: SupabaseDocument[];
  deletingDocumentId: string | null;
  onSaved: () => void; // call fetchSupabaseDocuments + refetchSubsection
  setPreviewDocument: (doc: { file_name: string; file_url: string } | null) => void;
  handleDownloadDocument: (url: string, fileName: string) => void;
  setDeleteDocumentId: (id: string | null) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

function CocRow({ raw, isInitial, ...p }: { raw: SupabaseDocument; isInitial: boolean } & Props) {
  const d: CocDoc = toCocDoc(raw);
  const [type, setType] = useState<CocType>(d.cocType);
  const [number, setNumber] = useState(d.cocNumber ?? "");
  const [issue, setIssue] = useState(d.cocIssueDate ?? "");
  const [expiry, setExpiry] = useState(d.cocExpiryDate ?? "");
  const [status, setStatus] = useState<"Pass" | "Fail" | "Pending">(d.cocStatus === "Missing" ? "Pending" : d.cocStatus);
  const [saving, setSaving] = useState(false);
  const failing = cocDocFails({ ...d, cocStatus: status, cocExpiryDate: expiry || null }, today());

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("subsection_documents").update({
      coc_type: type, coc_number: number.trim() || null,
      coc_issue_date: issue || null, coc_expiry_date: expiry || null, coc_status: status,
    }).eq("id", raw.id);
    setSaving(false);
    if (error) { toast.error(`Failed to save COC: ${error.message}`); return; }
    toast.success("COC saved");
    p.onSaved();
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/40 rounded-md">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={isInitial ? "default" : "outline"} className="text-xs">{isInitial ? "Initial" : type}</Badge>
          <span className="text-sm font-medium truncate">{raw.file_name}</span>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant={failing ? "destructive" : status === "Pass" ? "default" : "secondary"} className="text-xs">
            {failing ? "Fail" : status}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => p.setPreviewDocument({ file_name: raw.file_name, file_url: raw.file_url })} title="Preview document"><Eye className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => p.handleDownloadDocument(raw.file_url, raw.file_name)} title="Download document"><Download className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => p.setDeleteDocumentId(raw.id)} disabled={p.deletingDocumentId === raw.id}>
            {p.deletingDocumentId === raw.id ? <Loader2 className="h-4 w-4 animate-spin text-destructive" /> : <Trash2 className="h-4 w-4 text-destructive" />}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground">Type</label>
          <Select value={type} onValueChange={(v) => setType(v as CocType)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Initial">Initial</SelectItem>
              <SelectItem value="Supplementary">Supplementary</SelectItem>
              <SelectItem value="Temporary">Temporary</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><label className="text-xs text-muted-foreground">COC number</label><Input className="h-8" value={number} onChange={(e) => setNumber(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground">Issue</label><Input className="h-8" type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground">Expiry</label><Input className="h-8" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
        <div>
          <label className="text-xs text-muted-foreground">Verdict</label>
          <Select value={status} onValueChange={(v) => setStatus(v as "Pass" | "Fail" | "Pending")}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Pass">Pass</SelectItem>
              <SelectItem value="Fail">Fail</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}Save
        </Button>
      </div>
    </div>
  );
}

export function CocCertificateList(p: Props) {
  const docs = p.cocDocuments.map(toCocDoc);
  if (docs.length === 0) {
    return <p className="text-sm text-muted-foreground">No COC certificates uploaded yet. Upload one below.</p>;
  }
  const group = groupCocDocuments(docs, today());
  const rawById = new Map(p.cocDocuments.map((r) => [r.id, r]));
  return (
    <div className="space-y-2">
      {group.initial && <CocRow raw={rawById.get(group.initial.id)!} isInitial {...p} />}
      {group.supplementaries.length > 0 && (
        <div className="ml-4 border-l-2 border-border pl-3 space-y-2">
          {group.supplementaries.map((s) => <CocRow key={s.id} raw={rawById.get(s.id)!} isInitial={false} {...p} />)}
        </div>
      )}
    </div>
  );
}
