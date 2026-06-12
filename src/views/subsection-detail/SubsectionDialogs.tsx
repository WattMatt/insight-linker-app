import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SUBSECTION_CATEGORIES } from "@/lib/subsectionCategories";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import type { SubsectionData, EditFormData } from "./types";

interface SubsectionDialogsProps {
  subsection: SubsectionData;
  // Edit dialog
  isEditDialogOpen: boolean;
  setIsEditDialogOpen: (open: boolean) => void;
  editFormData: EditFormData;
  setEditFormData: React.Dispatch<React.SetStateAction<EditFormData>>;
  saving: boolean;
  handleSaveEdit: () => void;
  // Delete subsection dialog
  deleteSubsectionDialogOpen: boolean;
  setDeleteSubsectionDialogOpen: (open: boolean) => void;
  handleDeleteSubsection: () => void;
  // Document Preview
  previewDocument: {file_name: string, file_url: string} | null;
  setPreviewDocument: (doc: {file_name: string, file_url: string} | null) => void;
}

export function SubsectionDialogs({
  subsection,
  isEditDialogOpen,
  setIsEditDialogOpen,
  editFormData,
  setEditFormData,
  saving,
  handleSaveEdit,
  deleteSubsectionDialogOpen,
  setDeleteSubsectionDialogOpen,
  handleDeleteSubsection,
  previewDocument,
  setPreviewDocument,
}: SubsectionDialogsProps) {
  return (
    <>
      {/* Edit Subsection Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Edit Subsection</DialogTitle>
            <p className="text-sm text-muted-foreground">
              A subsection can be a tenant, a piece of equipment, or a specific area on site.
            </p>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Subsection Category */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Subsection Category *</Label>
              <div className="grid grid-cols-2 gap-3">
                {SUBSECTION_CATEGORIES.map((category) => {
                  const CategoryIcon = category.icon;
                  const isSelected = editFormData.category === category.value;

                  return (
                    <button
                      key={category.value}
                      type="button"
                      onClick={() => setEditFormData({...editFormData, category: category.value})}
                      className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                        isSelected
                          ? `${category.color.border} ${category.color.bg}`
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className={`h-8 w-8 flex items-center justify-center ${category.color.bg} ${category.color.text} rounded`}>
                        <CategoryIcon className="h-5 w-5" />
                      </div>
                      <span className="font-medium text-sm">{category.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subsection Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-base font-medium">
                Subsection Name *
              </Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                placeholder="e.g., Shop 101, Main LV Board"
                className="h-11"
              />
            </div>

            {/* Tenant Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-tenant" className="text-base font-medium">
                Tenant Name (Optional)
              </Label>
              <Input
                id="edit-tenant"
                value={editFormData.tenant_name}
                onChange={(e) => setEditFormData({...editFormData, tenant_name: e.target.value})}
                placeholder="e.g., ABC Retailers"
                className="h-11"
              />
            </div>

            {/* COC Required */}
            <div className="space-y-3">
              <Label className="text-base font-medium">
                Is a Certificate of Compliance (COC) required for this subsection?
              </Label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setEditFormData({...editFormData, is_coc_required: true})}
                  className={`flex items-center gap-2 ${
                    editFormData.is_coc_required ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                    editFormData.is_coc_required ? "border-primary" : "border-muted-foreground"
                  }`}>
                    {editFormData.is_coc_required && (
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <span>Yes</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditFormData({...editFormData, is_coc_required: false})}
                  className={`flex items-center gap-2 ${
                    !editFormData.is_coc_required ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                    !editFormData.is_coc_required ? "border-primary" : "border-muted-foreground"
                  }`}>
                    {!editFormData.is_coc_required && (
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <span>No</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={saving || !editFormData.name || !editFormData.category}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Subsection Confirmation Dialog */}
      <AlertDialog open={deleteSubsectionDialogOpen} onOpenChange={setDeleteSubsectionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subsection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{subsection?.name}"? This will permanently delete all associated inspections, documents, snags, and QR codes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubsection}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document Preview Dialog */}
      <DocumentPreviewDialog
        open={previewDocument !== null}
        onOpenChange={(open) => !open && setPreviewDocument(null)}
        fileUrl={previewDocument?.file_url || ''}
        fileName={previewDocument?.file_name || ''}
      />
    </>
  );
}
