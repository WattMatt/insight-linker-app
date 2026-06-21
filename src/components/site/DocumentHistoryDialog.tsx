import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    documentId: string | null;
    documentName: string;
}
interface LogRow { id: string; action: string; user_email: string; created_at: string | null; details: string | null }

const ACTION_LABEL: Record<string, string> = {
    document_renamed: "Renamed",
    document_moved: "Moved",
    document_deleted: "Deleted",
};

export function DocumentHistoryDialog({ open, onOpenChange, documentId, documentName }: Props) {
    const [rows, setRows] = useState<LogRow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !documentId) return;
        setLoading(true);
        supabase.from("activity_logs")
            .select("id, action, user_email, created_at, details")
            .ilike("details", `%"document_id":"${documentId}"%`)
            .order("created_at", { ascending: false })
            .then(({ data }) => { setRows((data as LogRow[]) ?? []); setLoading(false); });
    }, [open, documentId]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>History</DialogTitle>
                    <DialogDescription className="truncate">{documentName}</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2 max-h-80 overflow-auto">
                    {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
                    {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">No recorded changes.</p>}
                    {rows.map(r => (
                        <div key={r.id} className="text-sm border-b pb-2">
                            <span className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</span>
                            <span className="text-muted-foreground"> · {r.user_email} · {r.created_at ? new Date(r.created_at).toLocaleString() : ""}</span>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
