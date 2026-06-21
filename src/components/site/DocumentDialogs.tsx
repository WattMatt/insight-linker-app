import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";

interface DocumentDialogsProps {
    createCategoryOpen: boolean;
    setCreateCategoryOpen: (open: boolean) => void;
    newCategoryName: string;
    setNewCategoryName: (name: string) => void;
    onCreateCategory: (e: React.FormEvent) => void;
    uploadCategoryId: string | null;
    setUploadCategoryId: (id: string | null) => void;
    uploadFiles: File[];
    setUploadFiles: (files: File[]) => void;
    onUploadDocument: (e: React.FormEvent) => void;
    deleteCategoryId: string | null;
    setDeleteCategoryId: (id: string | null) => void;
    onDeleteCategory: (id: string, name: string) => void;
    categories: Array<{ id: string, name: string }>;
}

export function DocumentDialogs({
    createCategoryOpen,
    setCreateCategoryOpen,
    newCategoryName,
    setNewCategoryName,
    onCreateCategory,
    uploadCategoryId,
    setUploadCategoryId,
    uploadFiles,
    setUploadFiles,
    onUploadDocument,
    deleteCategoryId,
    setDeleteCategoryId,
    onDeleteCategory,
    categories
}: DocumentDialogsProps) {
    return (
        <>
            {/* Create Category Dialog */}
            <Dialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Document Category</DialogTitle>
                        <DialogDescription>Add a new category for organizing site documents</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={onCreateCategory}>
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
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCreateCategoryOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={!newCategoryName.trim()}>
                                Create Category
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Upload Document Dialog */}
            <Dialog open={uploadCategoryId !== null} onOpenChange={(open) => {
                if (!open) {
                    setUploadCategoryId(null);
                    setUploadFiles([]);
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Upload Documents</DialogTitle>
                        <DialogDescription>Upload one or more files to the selected category (max 50 MB each).</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={onUploadDocument}>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="document-file">Document Files *</Label>
                                <Input
                                    id="document-file"
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.svg"
                                    onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
                                    required={uploadFiles.length === 0}
                                />
                                {uploadFiles.length > 0 && (
                                    <ul className="text-sm text-muted-foreground mt-2 list-disc pl-5">
                                        {uploadFiles.map((f, i) => <li key={i}>{f.name}</li>)}
                                    </ul>
                                )}
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => {
                                setUploadCategoryId(null);
                                setUploadFiles([]);
                            }}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={uploadFiles.length === 0}>
                                <Upload className="h-4 w-4 mr-2" />
                                Upload
                            </Button>
                        </DialogFooter>
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
                                const category = categories.find(c => c.id === deleteCategoryId);
                                if (category) onDeleteCategory(deleteCategoryId!, category.name);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
