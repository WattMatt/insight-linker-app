import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Trash2, Download, Eye, Upload, Plus } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

interface SiteDocument {
    id: string;
    file_name: string;
    file_url: string;
    category: string;
    category_id: string;
}

interface SiteDocumentCategory {
    id: string;
    name: string;
}

interface SiteDocumentsProps {
    documents: SiteDocument[];
    categories: SiteDocumentCategory[];
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
    onDeleteDocument,
    onPreview,
    onDownload,
    onUploadClick,
    onCreateCategory,
    onDeleteCategory,
    onBulkDeleteCategories
}: SiteDocumentsProps) {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Project Documentation</h3>
                <div className="flex items-center gap-2">
                    {categories.length > 0 && onBulkDeleteCategories && (
                        <Button 
                            size="sm" 
                            variant="outline" 
                            className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={onBulkDeleteCategories}
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete All
                        </Button>
                    )}
                    <Button size="sm" onClick={onCreateCategory} variant="outline" className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Category
                    </Button>
                </div>
            </div>

            <Accordion type="multiple" defaultValue={categories.map(c => c.id)} className="space-y-4">
                {categories.map((category) => {
                    const catDocs = documents.filter(doc => doc.category_id === category.id);

                    return (
                        <AccordionItem key={category.id} value={category.id} className="border-none">
                            <Card className="glass-card border-none overflow-hidden">
                                <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-primary/5 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <FileText className="h-5 w-5 text-primary" />
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold">{category.name}</span>
                                            <Badge variant="secondary">
                                                {catDocs.length} files
                                            </Badge>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-6 pb-4">
                                    <div className="space-y-2 mt-2">
                                        {catDocs.length === 0 ? (
                                            <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/20">
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
                                                        <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border group hover:bg-primary/5 transition-colors">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                                                <span className="text-sm font-medium truncate">{doc.file_name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                                                    onClick={() => onDeleteDocument(doc.id, doc.file_name)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}

                                        <div className="mt-6 pt-4 border-t flex justify-end gap-2">
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
        </div>
    );
}
