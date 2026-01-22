import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Download, Eye, Search, Filter, Building, Layers, FolderTree } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface SiteDocument {
    id: string;
    file_name: string;
    file_url: string;
    category?: string;
    category_id?: string;
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

interface UnifiedDocument {
    id: string;
    file_name: string;
    file_url: string;
    category_name: string;
    subsection_name: string;
    source: "site" | "subsection";
}

interface ClientPortalDocumentsProps {
    siteDocuments: SiteDocument[];
    siteCategories: SiteDocumentCategory[];
    subsectionDocuments: SubsectionDocument[];
    subsections: { id: string; name: string }[];
    onPreview: (url: string, name: string) => void;
    onDownload: (url: string, name: string) => void;
}

export function ClientPortalDocuments({
    siteDocuments,
    siteCategories,
    subsectionDocuments,
    subsections,
    onPreview,
    onDownload
}: ClientPortalDocumentsProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedSubsection, setSelectedSubsection] = useState<string>("all");
    const [groupBy, setGroupBy] = useState<"category" | "subsection">("category");

    // Create unified document list combining site and subsection documents
    const unifiedDocuments = useMemo(() => {
        const unified: UnifiedDocument[] = [];

        // Add site documents
        siteDocuments.forEach(doc => {
            const category = siteCategories.find(c => c.id === doc.category_id);
            unified.push({
                id: doc.id,
                file_name: doc.file_name,
                file_url: doc.file_url,
                category_name: category?.name || doc.category || "Uncategorized",
                subsection_name: "Site-Level",
                source: "site"
            });
        });

        // Add subsection documents
        subsectionDocuments.forEach(doc => {
            const subsection = subsections.find(s => s.id === doc.subsection_id);
            unified.push({
                id: doc.id,
                file_name: doc.file_name,
                file_url: doc.file_url,
                category_name: doc.category_name || "Uncategorized",
                subsection_name: subsection?.name || doc.subsection_name || "Unknown Subsection",
                source: "subsection"
            });
        });

        return unified;
    }, [siteDocuments, siteCategories, subsectionDocuments, subsections]);

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
                    subsectionDocuments.some(sd => sd.id === doc.id && sd.subsection_id === selectedSubsection)
                );
            }
        }

        return filtered;
    }, [unifiedDocuments, searchQuery, selectedSubsection, subsectionDocuments]);

    // Group documents by category
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

    // Group documents by subsection
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
    const sortedGroups = Object.entries(groupedDocs);

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

            {/* Grouped Document View */}
            {sortedGroups.length > 0 ? (
                <Accordion type="multiple" defaultValue={sortedGroups.map(([name]) => name)} className="space-y-3">
                    {sortedGroups.map(([groupName, docs]) => (
                        <AccordionItem key={groupName} value={groupName} className="border-none">
                            <Card className="overflow-hidden">
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
                                                        <span className="text-xs text-muted-foreground">
                                                            {groupBy === "category" ? doc.subsection_name : doc.category_name}
                                                            {doc.source === "site" && groupBy === "category" && (
                                                                <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">Site</Badge>
                                                            )}
                                                        </span>
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
            ) : (
                <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">
                        {searchQuery 
                            ? `No documents match "${searchQuery}"`
                            : "No documents available"
                        }
                    </p>
                </div>
            )}
        </div>
    );
}
