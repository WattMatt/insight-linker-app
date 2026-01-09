import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Trash2, Download, Eye, Upload, Plus, Search, Filter, Building, Layers } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SiteDocument {
    id: string;
    file_name: string;
    file_url: string;
    category: string;
    category_id: string;
}

interface SubsectionDocument {
    id: string;
    file_name: string;
    file_url: string;
    subsection_id: string;
    subsection_name?: string;
    category_name?: string;
}

interface SiteDocumentCategory {
    id: string;
    name: string;
}

interface SiteDocumentsProps {
    documents: SiteDocument[];
    categories: SiteDocumentCategory[];
    subsectionDocuments?: SubsectionDocument[];
    subsections?: { id: string; name: string }[];
    onDeleteDocument: (id: string, name: string) => void;
    onPreview: (url: string, name: string) => void;
    onDownload: (url: string, name: string) => void;
    onUploadClick: (categoryId: string) => void;
    onCreateCategory: () => void;
    onDeleteCategory: (id: string, name: string) => void;
    onBulkDeleteCategories?: () => void;
}

export function SiteDocuments({
    documents,
    categories,
    subsectionDocuments = [],
    subsections = [],
    onDeleteDocument,
    onPreview,
    onDownload,
    onUploadClick,
    onCreateCategory,
    onDeleteCategory,
    onBulkDeleteCategories
}: SiteDocumentsProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeDocTab, setActiveDocTab] = useState("all");
    const [selectedSubsection, setSelectedSubsection] = useState<string>("all");

    // Combine and enrich subsection documents with subsection names
    const enrichedSubsectionDocs = useMemo(() => {
        return subsectionDocuments.map(doc => {
            const subsection = subsections.find(s => s.id === doc.subsection_id);
            return {
                ...doc,
                subsection_name: subsection?.name || "Unknown Subsection"
            };
        });
    }, [subsectionDocuments, subsections]);

    // Filter documents based on search and filters
    const filteredSiteDocs = useMemo(() => {
        return documents.filter(doc => 
            doc.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            doc.category.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [documents, searchQuery]);

    const filteredSubsectionDocs = useMemo(() => {
        let filtered = enrichedSubsectionDocs;
        
        if (searchQuery) {
            filtered = filtered.filter(doc =>
                doc.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                doc.subsection_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                doc.category_name?.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }
        
        if (selectedSubsection !== "all") {
            filtered = filtered.filter(doc => doc.subsection_id === selectedSubsection);
        }
        
        return filtered;
    }, [enrichedSubsectionDocs, searchQuery, selectedSubsection]);

    // Group subsection documents by subsection
    const groupedBySubsection = useMemo(() => {
        const groups: Record<string, SubsectionDocument[]> = {};
        filteredSubsectionDocs.forEach(doc => {
            const key = doc.subsection_name || "Unknown";
            if (!groups[key]) groups[key] = [];
            groups[key].push(doc);
        });
        return groups;
    }, [filteredSubsectionDocs]);

    const totalDocCount = documents.length + subsectionDocuments.length;

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
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button size="sm" onClick={onCreateCategory} variant="outline" className="gap-2">
                            <Plus className="h-4 w-4" />
                            <span className="hidden sm:inline">Add Category</span>
                        </Button>
                        {categories.length > 0 && onBulkDeleteCategories && (
                            <Button 
                                size="sm" 
                                variant="destructive" 
                                className="gap-2"
                                onClick={onBulkDeleteCategories}
                            >
                                <Trash2 className="h-4 w-4" />
                                <span>Delete All Categories</span>
                            </Button>
                        )}
                    </div>
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
                    {subsections.length > 0 && (
                        <Select value={selectedSubsection} onValueChange={setSelectedSubsection}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue placeholder="Filter by subsection" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Subsections</SelectItem>
                                {subsections.map(sub => (
                                    <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            {/* Document Source Tabs */}
            <Tabs value={activeDocTab} onValueChange={setActiveDocTab}>
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="all" className="gap-2">
                        <FileText className="h-4 w-4" />
                        <span className="hidden sm:inline">All</span>
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                            {totalDocCount}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="site" className="gap-2">
                        <Building className="h-4 w-4" />
                        <span className="hidden sm:inline">Site</span>
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                            {documents.length}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="subsections" className="gap-2">
                        <Layers className="h-4 w-4" />
                        <span className="hidden sm:inline">Subsections</span>
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                            {subsectionDocuments.length}
                        </Badge>
                    </TabsTrigger>
                </TabsList>

                {/* All Documents Tab */}
                <TabsContent value="all" className="mt-4 space-y-6">
                    {/* Site Documents Section */}
                    {filteredSiteDocs.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <Building className="h-4 w-4 text-primary" />
                                <h4 className="font-medium">Site Documents</h4>
                                <Badge variant="outline">{filteredSiteDocs.length}</Badge>
                            </div>
                            <SiteDocumentsList 
                                documents={filteredSiteDocs}
                                categories={categories}
                                onPreview={onPreview}
                                onDownload={onDownload}
                                onDeleteDocument={onDeleteDocument}
                                onUploadClick={onUploadClick}
                                onDeleteCategory={onDeleteCategory}
                            />
                        </div>
                    )}

                    {/* Subsection Documents Section */}
                    {Object.keys(groupedBySubsection).length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <Layers className="h-4 w-4 text-primary" />
                                <h4 className="font-medium">Subsection Documents</h4>
                                <Badge variant="outline">{filteredSubsectionDocs.length}</Badge>
                            </div>
                            <SubsectionDocumentsList 
                                groupedDocs={groupedBySubsection}
                                onPreview={onPreview}
                                onDownload={onDownload}
                            />
                        </div>
                    )}

                    {filteredSiteDocs.length === 0 && Object.keys(groupedBySubsection).length === 0 && (
                        <EmptyDocumentsState searchQuery={searchQuery} />
                    )}
                </TabsContent>

                {/* Site Documents Tab */}
                <TabsContent value="site" className="mt-4">
                    <SiteDocumentsList 
                        documents={filteredSiteDocs}
                        categories={categories}
                        onPreview={onPreview}
                        onDownload={onDownload}
                        onDeleteDocument={onDeleteDocument}
                        onUploadClick={onUploadClick}
                        onDeleteCategory={onDeleteCategory}
                    />
                    {filteredSiteDocs.length === 0 && categories.length === 0 && (
                        <EmptyDocumentsState searchQuery={searchQuery} />
                    )}
                </TabsContent>

                {/* Subsection Documents Tab */}
                <TabsContent value="subsections" className="mt-4">
                    {Object.keys(groupedBySubsection).length > 0 ? (
                        <SubsectionDocumentsList 
                            groupedDocs={groupedBySubsection}
                            onPreview={onPreview}
                            onDownload={onDownload}
                        />
                    ) : (
                        <EmptyDocumentsState searchQuery={searchQuery} isSubsection />
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}

// Site Documents List Component
function SiteDocumentsList({ 
    documents, 
    categories, 
    onPreview, 
    onDownload, 
    onDeleteDocument,
    onUploadClick,
    onDeleteCategory
}: {
    documents: SiteDocument[];
    categories: SiteDocumentCategory[];
    onPreview: (url: string, name: string) => void;
    onDownload: (url: string, name: string) => void;
    onDeleteDocument: (id: string, name: string) => void;
    onUploadClick: (categoryId: string) => void;
    onDeleteCategory: (id: string, name: string) => void;
}) {
    return (
        <Accordion type="multiple" defaultValue={categories.map(c => c.id)} className="space-y-3">
            {categories.map((category) => {
                const catDocs = documents.filter(doc => doc.category_id === category.id);

                return (
                    <AccordionItem key={category.id} value={category.id} className="border-none">
                        <Card className="glass-card border-none overflow-hidden">
                            <AccordionTrigger className="px-4 sm:px-6 py-3 sm:py-4 hover:no-underline hover:bg-primary/5 transition-colors">
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-sm sm:text-base">{category.name}</span>
                                        <Badge variant="secondary" className="text-xs">
                                            {catDocs.length} files
                                        </Badge>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 sm:px-6 pb-4">
                                <div className="space-y-2 mt-2">
                                    {catDocs.length === 0 ? (
                                        <div className="text-center py-6 sm:py-8 border-2 border-dashed rounded-lg bg-muted/20">
                                            <p className="text-sm text-muted-foreground mb-4">No documents in this category</p>
                                            <Button size="sm" variant="outline" onClick={() => onUploadClick(category.id)} className="gap-2">
                                                <Upload className="h-4 w-4" />
                                                Upload Document
                                            </Button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex justify-end mb-2">
                                                <Button size="sm" variant="ghost" onClick={() => onUploadClick(category.id)} className="gap-2 text-primary">
                                                    <Plus className="h-3 w-3" />
                                                    Add More
                                                </Button>
                                            </div>
                                            <div className="grid gap-2">
                                                {catDocs.map((doc) => (
                                                    <DocumentRow 
                                                        key={doc.id}
                                                        doc={doc}
                                                        onPreview={onPreview}
                                                        onDownload={onDownload}
                                                        onDelete={onDeleteDocument}
                                                    />
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    <div className="mt-4 sm:mt-6 pt-4 border-t flex justify-end gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 font-normal"
                                            onClick={() => onDeleteCategory(category.id, category.name)}
                                        >
                                            Delete Category
                                        </Button>
                                    </div>
                                </div>
                            </AccordionContent>
                        </Card>
                    </AccordionItem>
                );
            })}
        </Accordion>
    );
}

// Subsection Documents List Component
function SubsectionDocumentsList({
    groupedDocs,
    onPreview,
    onDownload
}: {
    groupedDocs: Record<string, SubsectionDocument[]>;
    onPreview: (url: string, name: string) => void;
    onDownload: (url: string, name: string) => void;
}) {
    const sortedGroups = Object.entries(groupedDocs).sort((a, b) => a[0].localeCompare(b[0]));

    return (
        <Accordion type="multiple" defaultValue={sortedGroups.map(([name]) => name)} className="space-y-3">
            {sortedGroups.map(([subsectionName, docs]) => (
                <AccordionItem key={subsectionName} value={subsectionName} className="border-none">
                    <Card className="glass-card border-none overflow-hidden">
                        <AccordionTrigger className="px-4 sm:px-6 py-3 sm:py-4 hover:no-underline hover:bg-primary/5 transition-colors">
                            <div className="flex items-center gap-2 sm:gap-3">
                                <Layers className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm sm:text-base">{subsectionName}</span>
                                    <Badge variant="secondary" className="text-xs">
                                        {docs.length} files
                                    </Badge>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 sm:px-6 pb-4">
                            <div className="grid gap-2 mt-2">
                                {docs.map((doc) => (
                                    <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border group hover:bg-primary/5 transition-colors gap-2">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                            <div className="min-w-0">
                                                <span className="text-sm font-medium truncate block">{doc.file_name}</span>
                                                {doc.category_name && (
                                                    <span className="text-xs text-muted-foreground">{doc.category_name}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity justify-end">
                                            <Button size="sm" variant="ghost" onClick={() => onPreview(doc.file_url, doc.file_name)}>
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => onDownload(doc.file_url, doc.file_name)}>
                                                <Download className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </AccordionContent>
                    </Card>
                </AccordionItem>
            ))}
        </Accordion>
    );
}

// Document Row Component
function DocumentRow({
    doc,
    onPreview,
    onDownload,
    onDelete
}: {
    doc: SiteDocument;
    onPreview: (url: string, name: string) => void;
    onDownload: (url: string, name: string) => void;
    onDelete: (id: string, name: string) => void;
}) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border group hover:bg-primary/5 transition-colors gap-2">
            <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{doc.file_name}</span>
            </div>
            <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity justify-end">
                <Button size="sm" variant="ghost" onClick={() => onPreview(doc.file_url, doc.file_name)}>
                    <Eye className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDownload(doc.file_url, doc.file_name)}>
                    <Download className="h-4 w-4" />
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(doc.id, doc.file_name)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

// Empty State Component
function EmptyDocumentsState({ searchQuery, isSubsection = false }: { searchQuery?: string; isSubsection?: boolean }) {
    return (
        <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
                {searchQuery 
                    ? `No documents match "${searchQuery}"`
                    : isSubsection 
                        ? "No subsection documents found"
                        : "No documents uploaded yet"
                }
            </p>
        </div>
    );
}