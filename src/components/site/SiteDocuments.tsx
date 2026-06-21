import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Trash2, Download, Eye, Plus, Search, Filter, Building, Layers, FolderTree, MoreVertical, Pencil, FolderInput, History, ArrowUp, ArrowDown, Lock, Upload } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface SiteDocument {
    id: string;
    file_name: string;
    file_url: string;
    category: string;
    category_id: string;
    file_size?: number | null;
    created_at?: string | null;
    uploaded_by?: string | null;
    site_id?: string | null;
}

interface SubsectionDocument {
    id: string;
    file_name: string;
    file_url: string;
    subsection_id: string;
    subsection_name?: string;
    category_name?: string;
    category_id?: string | null;
    file_size?: number | null;
    uploaded_at?: string | null;
    uploaded_by?: string | null;
    coc_number?: string | null;
}

interface SiteDocumentCategory {
    id: string;
    name: string;
    is_system?: boolean;
    order_index?: number;
}

// Unified document type for combined view
interface UnifiedDocument {
    id: string;
    file_name: string;
    file_url: string;
    category_name: string;
    category_id: string | null;
    subsection_name: string;
    subsection_id: string | null;
    site_id: string | null;
    file_size: number | null;
    uploaded_at: string | null;
    uploaded_by: string | null;
    coc_number: string | null;
    source: "site" | "subsection";
    original: SiteDocument | SubsectionDocument;
}

interface SiteDocumentsProps {
    documents: SiteDocument[];
    categories: SiteDocumentCategory[];
    subsectionDocuments?: SubsectionDocument[];
    subsections?: { id: string; name: string }[];
    canManage?: boolean;
    onDeleteDocument: (id: string, name: string, source: "site" | "subsection") => void;
    onPreview: (url: string, name: string) => void;
    onDownload: (url: string, name: string) => void;
    onUploadClick: (categoryId: string) => void;
    onCreateCategory: () => void;
    onDeleteCategory: (id: string, name: string) => void;
    onBulkDeleteCategories?: () => void;
    onBulkDeleteDocumentsInCategory?: (categoryId: string, categoryName: string) => void;
    onRenameDocument: (doc: UnifiedDocument, newName: string) => void;
    onMoveDocuments: (docs: UnifiedDocument[]) => void;
    onDeleteDocuments: (docs: UnifiedDocument[]) => void;
    onViewHistory: (doc: UnifiedDocument) => void;
    onRenameCategory: (categoryId: string, newName: string) => void;
    onReorderCategory: (categoryId: string, direction: "up" | "down") => void;
}

function formatMeta(doc: UnifiedDocument): string {
    const parts: string[] = [];
    if (doc.file_size != null) {
        const mb = doc.file_size / (1024 * 1024);
        parts.push(mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(doc.file_size / 1024))} KB`);
    }
    if (doc.uploaded_at) parts.push(new Date(doc.uploaded_at).toLocaleDateString());
    parts.push(doc.uploaded_by ? doc.uploaded_by : "—");
    return parts.join(" · ");
}

export function SiteDocuments({
    documents,
    categories,
    subsectionDocuments = [],
    subsections = [],
    canManage = false,
    onDeleteDocument,
    onPreview,
    onDownload,
    onUploadClick,
    onCreateCategory,
    onDeleteCategory,
    onBulkDeleteCategories,
    onBulkDeleteDocumentsInCategory,
    onRenameDocument,
    onMoveDocuments,
    onDeleteDocuments,
    onViewHistory,
    onRenameCategory,
    onReorderCategory,
}: SiteDocumentsProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedSubsection, setSelectedSubsection] = useState<string>("all");
    const [groupBy, setGroupBy] = useState<"category" | "subsection">("category");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editingDocId, setEditingDocId] = useState<string | null>(null);
    const [editingDocValue, setEditingDocValue] = useState("");
    const [editingCatId, setEditingCatId] = useState<string | null>(null);
    const [editingCatValue, setEditingCatValue] = useState("");

    // Create unified document list combining site and subsection documents
    const unifiedDocuments = useMemo(() => {
        const unified: UnifiedDocument[] = [];

        documents.forEach(doc => {
            const category = categories.find(c => c.id === doc.category_id);
            unified.push({
                id: doc.id,
                file_name: doc.file_name,
                file_url: doc.file_url,
                category_name: category?.name || doc.category || "Uncategorized",
                category_id: doc.category_id ?? null,
                subsection_name: "Site-Level",
                subsection_id: null,
                site_id: doc.site_id ?? null,
                file_size: doc.file_size ?? null,
                uploaded_at: doc.created_at ?? null,
                uploaded_by: doc.uploaded_by ?? null,
                coc_number: null,
                source: "site",
                original: doc,
            });
        });

        subsectionDocuments.forEach(doc => {
            const subsection = subsections.find(s => s.id === doc.subsection_id);
            unified.push({
                id: doc.id,
                file_name: doc.file_name,
                file_url: doc.file_url,
                category_name: doc.category_name || "Uncategorized",
                category_id: doc.category_id ?? null,
                subsection_name: subsection?.name || doc.subsection_name || "Unknown Subsection",
                subsection_id: doc.subsection_id ?? null,
                site_id: null,
                file_size: doc.file_size ?? null,
                uploaded_at: doc.uploaded_at ?? null,
                uploaded_by: doc.uploaded_by ?? null,
                coc_number: doc.coc_number ?? null,
                source: "subsection",
                original: doc,
            });
        });

        return unified;
    }, [documents, categories, subsectionDocuments, subsections]);

    // Filter documents based on search and subsection filter
    const filteredDocuments = useMemo(() => {
        let filtered = unifiedDocuments;

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(doc =>
                doc.file_name.toLowerCase().includes(query) ||
                doc.category_name.toLowerCase().includes(query) ||
                doc.subsection_name.toLowerCase().includes(query)
            );
        }

        if (selectedSubsection !== "all") {
            if (selectedSubsection === "site-level") {
                filtered = filtered.filter(doc => doc.source === "site");
            } else {
                filtered = filtered.filter(doc =>
                    doc.source === "subsection" &&
                    (doc.original as SubsectionDocument).subsection_id === selectedSubsection
                );
            }
        }

        return filtered;
    }, [unifiedDocuments, searchQuery, selectedSubsection]);

    const groupedByCategory = useMemo(() => {
        const groups: Record<string, UnifiedDocument[]> = {};
        filteredDocuments.forEach(doc => {
            const key = doc.category_name;
            if (!groups[key]) groups[key] = [];
            groups[key].push(doc);
        });
        const sortedGroups: Record<string, UnifiedDocument[]> = {};
        Object.keys(groups).sort().forEach(key => {
            sortedGroups[key] = groups[key];
        });
        return sortedGroups;
    }, [filteredDocuments]);

    const groupedBySubsection = useMemo(() => {
        const groups: Record<string, UnifiedDocument[]> = {};
        filteredDocuments.forEach(doc => {
            const key = doc.subsection_name;
            if (!groups[key]) groups[key] = [];
            groups[key].push(doc);
        });
        const sortedGroups: Record<string, UnifiedDocument[]> = {};
        const keys = Object.keys(groups).sort((a, b) => {
            if (a === "Site-Level") return -1;
            if (b === "Site-Level") return 1;
            return a.localeCompare(b);
        });
        keys.forEach(key => {
            sortedGroups[key] = groups[key];
        });
        return sortedGroups;
    }, [filteredDocuments]);

    const totalDocCount = unifiedDocuments.length;
    const groupedDocs = groupBy === "category" ? groupedByCategory : groupedBySubsection;
    const categoryByName = useMemo(() => new Map(categories.map(c => [c.name, c])), [categories]);

    const toggleSelect = (id: string) => setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const clearSelection = () => setSelectedIds(new Set());
    const selectedDocs = useMemo(
        () => unifiedDocuments.filter(d => selectedIds.has(d.id)),
        [unifiedDocuments, selectedIds],
    );
    const mixedSource = new Set(selectedDocs.map(d => d.source)).size > 1;

    const startRename = (doc: UnifiedDocument) => {
        const dot = doc.file_name.lastIndexOf(".");
        setEditingDocValue(dot > 0 ? doc.file_name.slice(0, dot) : doc.file_name);
        setEditingDocId(doc.id);
    };
    const commitRename = (doc: UnifiedDocument) => {
        const v = editingDocValue.trim();
        if (v) onRenameDocument(doc, v);
        setEditingDocId(null);
    };

    return (
        <div className="space-y-6">
            {/* Header with search and filters */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                        <h3 className="text-lg font-semibold">Project Documentation</h3>
                        <p className="text-sm text-muted-foreground">
                            {totalDocCount} total documents
                        </p>
                    </div>
                    {canManage && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <Button size="sm" onClick={onCreateCategory} variant="outline" className="gap-2">
                                <Plus className="h-4 w-4" />
                                <span className="hidden sm:inline">Add Category</span>
                            </Button>
                            {categories.length > 0 && onBulkDeleteCategories && (
                                <Button size="sm" variant="destructive" className="gap-2" onClick={onBulkDeleteCategories}>
                                    <Trash2 className="h-4 w-4" />
                                    <span>Delete All Categories</span>
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* Search and Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search documents..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Select value={selectedSubsection} onValueChange={setSelectedSubsection}>
                        <SelectTrigger className="w-full sm:w-[200px]">
                            <Filter className="h-4 w-4 mr-2" />
                            <SelectValue placeholder="Filter by location" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Locations</SelectItem>
                            <SelectItem value="site-level">Site-Level Only</SelectItem>
                            {subsections.map(sub => (
                                <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Grouping Toggle */}
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Group by:</span>
                        <ToggleGroup
                            type="single"
                            value={groupBy}
                            onValueChange={(value) => value && setGroupBy(value as "category" | "subsection")}
                            className="bg-background rounded-lg p-1 border"
                        >
                            <ToggleGroupItem value="category" aria-label="Group by category" className="gap-1.5 text-xs px-3">
                                <FolderTree className="h-3.5 w-3.5" />
                                Category
                            </ToggleGroupItem>
                            <ToggleGroupItem value="subsection" aria-label="Group by subsection" className="gap-1.5 text-xs px-3">
                                <Layers className="h-3.5 w-3.5" />
                                Subsection
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        {filteredDocuments.length} of {totalDocCount} documents
                    </div>
                </div>
            </div>

            {/* Bulk action bar */}
            {canManage && selectedDocs.length > 0 && (
                <div className="flex items-center gap-3 rounded-md border bg-primary/5 px-3 py-2">
                    <span className="text-sm font-medium">{selectedDocs.length} selected</span>
                    <Button size="sm" variant="outline" disabled={mixedSource}
                        title={mixedSource ? "Site-level and subsection documents can't be moved together" : undefined}
                        onClick={() => onMoveDocuments(selectedDocs)}>
                        <FolderInput className="h-4 w-4 mr-1" /> Move to…
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive"
                        onClick={() => { onDeleteDocuments(selectedDocs); clearSelection(); }}>
                        Delete
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={clearSelection}>Clear</Button>
                </div>
            )}

            {/* Grouped Document View */}
            {Object.keys(groupedDocs).length > 0 ? (
                <Accordion type="multiple" defaultValue={[]} className="space-y-3">
                    {Object.entries(groupedDocs).map(([groupName, docs]) => {
                        const cat = groupBy === "category" ? categoryByName.get(groupName) : undefined;
                        const isSystem = !!cat?.is_system;
                        const isEditingCat = !!cat && editingCatId === cat.id;
                        return (
                            <AccordionItem key={groupName} value={groupName} className="border-none">
                                <Card className="glass-card border-none overflow-hidden relative">
                                    {isEditingCat ? (
                                        <div className="px-4 sm:px-6 py-3 flex items-center gap-2">
                                            <Input value={editingCatValue} autoFocus className="h-8 max-w-xs text-sm"
                                                onChange={(e) => setEditingCatValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") { const v = editingCatValue.trim(); if (v && cat) onRenameCategory(cat.id, v); setEditingCatId(null); }
                                                    if (e.key === "Escape") setEditingCatId(null);
                                                }} />
                                            <Button size="sm" variant="ghost" onClick={() => { const v = editingCatValue.trim(); if (v && cat) onRenameCategory(cat.id, v); setEditingCatId(null); }}>Save</Button>
                                            <Button size="sm" variant="ghost" onClick={() => setEditingCatId(null)}>Cancel</Button>
                                        </div>
                                    ) : (
                                        <>
                                            <AccordionTrigger className="px-4 sm:px-6 py-3 sm:py-4 hover:no-underline hover:bg-primary/5 transition-colors">
                                                <div className="flex items-center gap-2 sm:gap-3">
                                                    {groupBy === "category" ? (
                                                        <FolderTree className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                                                    ) : groupName === "Site-Level" ? (
                                                        <Building className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                                                    ) : (
                                                        <Layers className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                                                    )}
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-semibold text-sm sm:text-base">{groupName}</span>
                                                        <Badge variant="secondary" className="text-xs">{docs.length} files</Badge>
                                                        {isSystem && (
                                                            <Badge variant="outline" className="text-[10px]"><Lock className="h-3 w-3 mr-1" /> system</Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </AccordionTrigger>
                                            {canManage && groupBy === "category" && cat && !isSystem && (
                                                <div className="absolute right-3 top-2.5 z-10" onClick={(e) => e.stopPropagation()}>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild><Button size="sm" variant="ghost"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => onUploadClick(cat.id)}><Upload className="h-4 w-4 mr-2" /> Upload here</DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => { setEditingCatValue(cat.name); setEditingCatId(cat.id); }}><Pencil className="h-4 w-4 mr-2" /> Rename</DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => onReorderCategory(cat.id, "up")}><ArrowUp className="h-4 w-4 mr-2" /> Move up</DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => onReorderCategory(cat.id, "down")}><ArrowDown className="h-4 w-4 mr-2" /> Move down</DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => onBulkDeleteDocumentsInCategory?.(cat.id, cat.name)}>Empty (delete all files)</DropdownMenuItem>
                                                            <DropdownMenuItem className="text-destructive" onClick={() => onDeleteCategory(cat.id, cat.name)}>Delete category</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    <AccordionContent className="px-4 sm:px-6 pb-4">
                                        <div className="grid gap-2 mt-2">
                                            {docs.map((doc) => (
                                                <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border group hover:bg-primary/5 transition-colors gap-2">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        {canManage && (
                                                            <Checkbox checked={selectedIds.has(doc.id)} onCheckedChange={() => toggleSelect(doc.id)} className="mr-1" />
                                                        )}
                                                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                                        <div className="min-w-0">
                                                            {editingDocId === doc.id ? (
                                                                <span className="flex items-center gap-1">
                                                                    <Input value={editingDocValue} autoFocus className="h-7 text-sm"
                                                                        onChange={(e) => setEditingDocValue(e.target.value)}
                                                                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(doc); if (e.key === "Escape") setEditingDocId(null); }} />
                                                                    <Button size="sm" variant="ghost" onClick={() => commitRename(doc)}>Save</Button>
                                                                    <Button size="sm" variant="ghost" onClick={() => setEditingDocId(null)}>Cancel</Button>
                                                                </span>
                                                            ) : (
                                                                <span className="text-sm font-medium truncate block">{doc.file_name}</span>
                                                            )}
                                                            <span className="text-xs text-muted-foreground block">
                                                                {groupBy === "category" ? doc.subsection_name : doc.category_name}
                                                                {doc.source === "site" && groupBy === "category" && (
                                                                    <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">Site</Badge>
                                                                )}
                                                            </span>
                                                            <span className="text-[11px] text-muted-foreground/80 block">{formatMeta(doc)}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity justify-end">
                                                        <Button size="sm" variant="ghost" onClick={() => onPreview(doc.file_url, doc.file_name)}>
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                        <Button size="sm" variant="ghost" onClick={() => onDownload(doc.file_url, doc.file_name)}>
                                                            <Download className="h-4 w-4" />
                                                        </Button>
                                                        {canManage && (
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild><Button size="sm" variant="ghost"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem onClick={() => startRename(doc)}><Pencil className="h-4 w-4 mr-2" /> Rename</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => onMoveDocuments([doc])}><FolderInput className="h-4 w-4 mr-2" /> Move to…</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => onViewHistory(doc)}><History className="h-4 w-4 mr-2" /> History</DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem className="text-destructive" onClick={() => onDeleteDocument(doc.id, doc.file_name, doc.source)}>
                                                                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </AccordionContent>
                                </Card>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            ) : (
                <EmptyDocumentsState searchQuery={searchQuery} />
            )}
        </div>
    );
}

// Empty State Component
function EmptyDocumentsState({ searchQuery }: { searchQuery?: string }) {
    return (
        <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
                {searchQuery
                    ? `No documents match "${searchQuery}"`
                    : "No documents uploaded yet"
                }
            </p>
        </div>
    );
}
