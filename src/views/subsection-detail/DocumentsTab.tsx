import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileText, Plus, Upload, Download, Trash2, Eye, Loader2 } from "lucide-react";
import type { SupabaseDocument, DocumentCategory } from "./types";

interface DocumentsTabProps {
  supabaseDocuments: SupabaseDocument[];
  documentCategories: DocumentCategory[];
  uploadingFile: boolean;
  uploadCategoryId: string | null;
  setUploadCategoryId: (id: string | null) => void;
  uploadFile: File | null;
  setUploadFile: (file: File | null) => void;
  deleteDocumentId: string | null;
  setDeleteDocumentId: (id: string | null) => void;
  deletingDocumentId: string | null;
  createCategoryOpen: boolean;
  setCreateCategoryOpen: (open: boolean) => void;
  newCategoryName: string;
  setNewCategoryName: (name: string) => void;
  deleteCategoryId: string | null;
  setDeleteCategoryId: (id: string | null) => void;
  fixingCategories: boolean;
  setPreviewDocument: (doc: {file_name: string, file_url: string} | null) => void;
  handleFixCategories: () => void;
  handleCreateCategory: (e: React.FormEvent) => void;
  handleDeleteCategory: (categoryId: string, categoryName: string) => void;
  handleDocumentUpload: (e: React.FormEvent) => void;
  handleDeleteDocument: (documentId: string, fileName: string) => void;
  handleDownloadDocument: (url: string, fileName: string) => void;
}

export function DocumentsTab({
  supabaseDocuments,
  documentCategories,
  uploadingFile,
  uploadCategoryId,
  setUploadCategoryId,
  uploadFile,
  setUploadFile,
  deleteDocumentId,
  setDeleteDocumentId,
  deletingDocumentId,
  createCategoryOpen,
  setCreateCategoryOpen,
  newCategoryName,
  setNewCategoryName,
  deleteCategoryId,
  setDeleteCategoryId,
  fixingCategories,
  setPreviewDocument,
  handleFixCategories,
  handleCreateCategory,
  handleDeleteCategory,
  handleDocumentUpload,
  handleDeleteDocument,
  handleDownloadDocument,
}: DocumentsTabProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Manage documents for this subsection</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleFixCategories}
                size="sm"
                variant="outline"
                disabled={fixingCategories}
              >
                <FileText className="h-4 w-4 mr-2" />
                {fixingCategories ? 'Fixing...' : 'Fix Categories'}
              </Button>
              <Button onClick={() => setCreateCategoryOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Category
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {documentCategories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No document categories yet. Create one to get started.</p>
            </div>
          ) : (
            <Accordion
              type="multiple"
              className="w-full"
              defaultValue={documentCategories.map(cat => cat.id)}
            >
              {documentCategories.map((category) => {
                const categoryDocs = supabaseDocuments.filter(doc => doc.category_id === category.id);

                return (
                  <AccordionItem key={category.id} value={category.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{category.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{categoryDocs.length}</Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteCategoryId(category.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 pl-7 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setUploadCategoryId(category.id)}
                          className="mb-3"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload to {category.name}
                        </Button>
                        {categoryDocs.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4">No documents in this category yet.</p>
                        ) : (
                          categoryDocs.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <div className="w-2 h-2 rounded-full bg-primary" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{doc.file_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(doc.uploaded_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setPreviewDocument({ file_name: doc.file_name, file_url: doc.file_url })}
                                  title="Preview document"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDownloadDocument(doc.file_url, doc.file_name)}
                                  title="Download document"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDeleteDocumentId(doc.id)}
                                  disabled={deletingDocumentId === doc.id}
                                >
                                  {deletingDocumentId === doc.id ? (
                                    <Loader2 className="h-4 w-4 text-destructive animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Delete Document Dialog */}
      <AlertDialog open={deleteDocumentId !== null} onOpenChange={() => setDeleteDocumentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingDocumentId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const doc = supabaseDocuments.find(d => d.id === deleteDocumentId);
                if (doc) handleDeleteDocument(deleteDocumentId!, doc.file_name);
              }}
              disabled={deletingDocumentId !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingDocumentId !== null ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Category Dialog */}
      <Dialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Document Category</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateCategory}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">Category Name *</Label>
                <Input
                  id="category-name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g., 08 Test Reports"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateCategoryOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newCategoryName.trim()}>
                Create Category
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={uploadCategoryId !== null} onOpenChange={(open) => {
        if (!open) {
          setUploadCategoryId(null);
          setUploadFile(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleDocumentUpload}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="document-file">Document File *</Label>
                <Input
                  id="document-file"
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  required={!uploadFile}
                />
                {uploadFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {uploadFile.name}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setUploadCategoryId(null);
                setUploadFile(null);
              }}>
                Cancel
              </Button>
              <Button type="submit" disabled={!uploadFile || uploadingFile}>
                <Upload className="h-4 w-4 mr-2" />
                {uploadingFile ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Category Dialog */}
      <AlertDialog open={deleteCategoryId !== null} onOpenChange={() => setDeleteCategoryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this category? All documents in this category will also be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const category = documentCategories.find(c => c.id === deleteCategoryId);
                if (category) handleDeleteCategory(deleteCategoryId!, category.name);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
