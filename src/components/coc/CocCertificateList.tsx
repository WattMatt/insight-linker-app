import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Download, Trash2, Loader2, Upload } from "lucide-react";
import { toCocDoc, groupCocDocuments, CocDoc } from "@/lib/cocHierarchy";
import type { SupabaseDocument } from "@/views/subsection-detail/types";

interface Props {
  cocDocuments: SupabaseDocument[];
  evaluationDocuments: SupabaseDocument[];
  deletingDocumentId: string | null;
  uploadingFile: boolean;
  setPreviewDocument: (doc: { file_name: string; file_url: string } | null) => void;
  handleDownloadDocument: (url: string, fileName: string) => void;
  setDeleteDocumentId: (id: string | null) => void;
  onUploadEvaluationReport: (parentCoc: { id: string; coc_number: string | null }, file: File) => Promise<void>;
}

const today = () => new Date().toISOString().slice(0, 10);

function StatusBadge({ d }: { d: CocDoc }) {
  if (d.cocStatus === "Fail") return <Badge variant="destructive" className="text-xs">Fail</Badge>;
  if (d.cocStatus === "Pass") return <Badge variant="default" className="text-xs">Pass</Badge>;
  return <Badge variant="secondary" className="text-xs">Awaiting verification</Badge>;
}

function DocActions({ raw, p }: { raw: SupabaseDocument; p: Props }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => p.setPreviewDocument({ file_name: raw.file_name, file_url: raw.file_url })} title="Preview document"><Eye className="h-4 w-4" /></Button>
      <Button size="sm" variant="ghost" onClick={() => p.handleDownloadDocument(raw.file_url, raw.file_name)} title="Download document"><Download className="h-4 w-4" /></Button>
      <Button size="sm" variant="ghost" onClick={() => p.setDeleteDocumentId(raw.id)} disabled={p.deletingDocumentId === raw.id}>
        {p.deletingDocumentId === raw.id ? <Loader2 className="h-4 w-4 animate-spin text-destructive" /> : <Trash2 className="h-4 w-4 text-destructive" />}
      </Button>
    </div>
  );
}

function CocRow({ raw, isInitial, ...p }: { raw: SupabaseDocument; isInitial: boolean } & Props) {
  const d: CocDoc = toCocDoc(raw);
  const meta = [
    d.cocNumber ? `No. ${d.cocNumber}` : "No cert number",
    d.cocIssueDate ? `Issued ${d.cocIssueDate}` : null,
    d.cocExpiryDate ? `Expires ${d.cocExpiryDate}` : null,
  ].filter(Boolean).join(" · ");
  const evalDoc = p.evaluationDocuments.find(e => e.parent_document_id === raw.id);

  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/40 rounded-md">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={isInitial ? "default" : "outline"} className="text-xs">{isInitial ? "Initial" : d.cocType}</Badge>
          <span className="text-sm font-medium truncate">{raw.file_name}</span>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge d={d} />
          <DocActions raw={raw} p={p} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{meta} — verdict comes from the imported verification register.</p>
      {evalDoc ? (
        <div className="rounded-md border bg-background px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <span className="text-xs font-medium text-muted-foreground">Evaluation report</span>
            <p className="text-sm truncate">{evalDoc.file_name}</p>
          </div>
          <DocActions raw={evalDoc} p={p} />
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-background px-3 py-2">
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="text-xs text-muted-foreground">No evaluation report yet</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <Upload className="h-4 w-4" /> Upload evaluation report
            </span>
            <input
              type="file"
              className="hidden"
              accept=".html,.htm,.pdf,.doc,.docx,.jpg,.jpeg,.png"
              disabled={p.uploadingFile}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) { await p.onUploadEvaluationReport({ id: raw.id, coc_number: d.cocNumber }, f); }
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}
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
