import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { isSystemReportCategory } from "@/lib/documents/reportCategories";

export interface MoveDoc {
    id: string;
    file_name: string;
    file_url: string;             // needed to relocate the storage object
    source: "site" | "subsection";
    site_id: string | null;       // needed to build the new site-doc path
    subsection_id: string | null; // needed to build the new subsection-doc path
    category_id: string | null;
    category_name: string;
    coc_number: string | null;
}
interface Cat { id: string; name: string; is_system?: boolean }

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    docs: MoveDoc[];
    siteCategories: Cat[];
    onConfirm: (targetId: string, targetName: string) => void;
}

export function MoveDocumentsDialog({ open, onOpenChange, docs, siteCategories, onConfirm }: Props) {
    const [targetId, setTargetId] = useState<string>("");
    const [subCats, setSubCats] = useState<Cat[]>([]);

    const source = docs[0]?.source ?? "site";
    const mixedSource = new Set(docs.map(d => d.source)).size > 1;
    const subsectionIds = new Set(docs.filter(d => d.source === "subsection").map(d => d.subsection_id));
    const mixedSubsection = source === "subsection" && subsectionIds.size > 1;

    useEffect(() => {
        setTargetId("");
        if (open && source === "subsection" && subsectionIds.size === 1) {
            const ssId = [...subsectionIds][0];
            if (!ssId) return;
            supabase.from("document_categories").select("id, name, is_system").eq("subsection_id", ssId).order("order_index")
                .then(({ data }) => setSubCats((data as Cat[]) ?? []));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, source]);

    const options = useMemo(() => {
        const list = source === "subsection" ? subCats : siteCategories;
        return list.filter(c => !c.is_system); // locked categories are never move targets
    }, [source, subCats, siteCategories]);

    const hasCoc = docs.some(d => d.coc_number || /coc/i.test(d.category_name));
    const hasReport = docs.some(d => isSystemReportCategory(d.category_name));
    const blocked = mixedSource || mixedSubsection;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Move {docs.length} document{docs.length === 1 ? "" : "s"}</DialogTitle>
                    <DialogDescription>From “{docs[0]?.category_name}”. Only your own categories are listed.</DialogDescription>
                </DialogHeader>

                {blocked ? (
                    <p className="text-sm text-destructive py-2">
                        {mixedSource
                            ? "Site-level and subsection documents can't be moved together. Select one kind at a time."
                            : "These subsection documents belong to different subsections. Move them one subsection at a time."}
                    </p>
                ) : (
                    <div className="space-y-3 py-2">
                        <Select value={targetId} onValueChange={setTargetId}>
                            <SelectTrigger><SelectValue placeholder="Move to…" /></SelectTrigger>
                            <SelectContent>
                                {options.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {hasCoc && <p className="text-xs rounded-md border border-amber-500/50 bg-amber-500/10 p-2">A COC document is in this selection — its COC number &amp; status are kept; no COC checks are re-run.</p>}
                        {hasReport && <p className="text-xs rounded-md border border-amber-500/50 bg-amber-500/10 p-2">A generated report is in this selection — moving it out of its category removes it from the Reports view.</p>}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled={blocked || !targetId}
                        onClick={() => {
                            const t = options.find(o => o.id === targetId);
                            if (t) { onConfirm(t.id, t.name); onOpenChange(false); }
                        }}>Move</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
