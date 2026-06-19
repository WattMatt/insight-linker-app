import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Edit, Trash2, Loader2 } from "lucide-react";
import { getCategoryIcon, getCategoryColor } from "@/lib/subsectionCategories";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { InteractiveFloorPlan } from "@/components/InteractiveFloorPlan";

import {
  useSubsectionDetail,
  OverviewTab,
  InspectionsTab,
  DocumentsTab,
  CocMeteringTab,
  CreateSubsectionForm,
  SubsectionDialogs,
} from "./subsection-detail";

const SubsectionDetail = () => {
  const hook = useSubsectionDetail();

  // Loading state
  if (hook.loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // New subsection creation
  if (hook.subsectionId === "new") {
    return (
      <CreateSubsectionForm
        editFormData={hook.editFormData}
        setEditFormData={hook.setEditFormData}
        saving={hook.saving}
        clientId={hook.clientId}
        siteId={hook.siteId}
        handleCreateSubsection={hook.handleCreateSubsection}
        navigate={hook.navigate}
      />
    );
  }

  // Data not found
  if (!hook.subsection || !hook.siteData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Subsection data not found</p>
          <Button className="mt-4" onClick={() => {
            const basePath = (hook.actualClientId || hook.clientId) ? `/clients/${hook.actualClientId || hook.clientId}/sites/${hook.siteId}` : `/sites/${hook.siteId}`;
            hook.navigate(basePath);
          }}>
            Back to Site
          </Button>
        </div>
      </div>
    );
  }

  const { subsection, siteData } = hook;

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Clients", href: "/clients", icon: "client" },
          { label: siteData?.clientInfo || "Client", href: `/clients/${hook.actualClientId || hook.clientId}`, icon: "client" },
          { label: siteData?.siteName || "Site", href: `/clients/${hook.actualClientId || hook.clientId}/sites/${hook.siteId}`, icon: "site" },
          { label: subsection.name, icon: "subsection" }
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              {subsection.category && (() => {
                const CategoryIcon = getCategoryIcon(subsection.category);
                const colors = getCategoryColor(subsection.category);
                return (
                  <div className={`w-10 h-10 rounded flex items-center justify-center ${colors.bg} ${colors.text}`}>
                    <CategoryIcon className="h-6 w-6" />
                  </div>
                );
              })()}
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {subsection.name}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {siteData.siteName} • {subsection.category || "General"}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Export Reports</Button>
          <Button variant="outline" onClick={hook.handleOpenEditDialog}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            onClick={() => hook.setDeleteSubsectionDialogOpen(true)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={hook.activeTab} onValueChange={hook.setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="inspections">Inspections</TabsTrigger>
          <TabsTrigger value="floor-plan">Floor Plan</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="coc-metering">COC Docs & Metering Data</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            subsection={subsection}
            setSubsection={hook.setSubsection}
            siteData={siteData}
            inspectionArray={hook.inspectionArray}
            hasSnags={hook.hasSnags}
            hasIncompleteInspections={hook.hasIncompleteInspections}
            isNotCompliant={hook.isNotCompliant}
            openSnagsCount={hook.openSnagsCount}
            snags={hook.snags}
            supabaseDocuments={hook.supabaseDocuments}
            subsectionId={hook.subsectionId}
            siteId={hook.siteId}
            clientId={hook.clientId}
            actualClientId={hook.actualClientId}
            editFormData={hook.editFormData}
            setEditFormData={hook.setEditFormData}
            setActiveTab={hook.setActiveTab}
            navigate={hook.navigate}
          />
        </TabsContent>

        <TabsContent value="inspections">
          <InspectionsTab
            subsection={subsection}
            siteData={siteData}
            inspectionArray={hook.inspectionArray}
            subsectionId={hook.subsectionId}
            siteId={hook.siteId}
            clientId={hook.clientId}
            actualClientId={hook.actualClientId}
            companyLogo={hook.companyLogo}
            snags={hook.snags}
            availableTemplates={hook.availableTemplates}
            linkedTemplate={hook.linkedTemplate}
            selectedTemplateId={hook.selectedTemplateId}
            setSelectedTemplateId={hook.setSelectedTemplateId}
            isCreateInspectionOpen={hook.isCreateInspectionOpen}
            setIsCreateInspectionOpen={hook.setIsCreateInspectionOpen}
            newInspectionDate={hook.newInspectionDate}
            setNewInspectionDate={hook.setNewInspectionDate}
            deleteInspectionId={hook.deleteInspectionId}
            setDeleteInspectionId={hook.setDeleteInspectionId}
            fixingTemplates={hook.fixingTemplates}
            handleCreateInspection={hook.handleCreateInspection}
            handleDeleteInspection={hook.handleDeleteInspection}
            handleFixTemplateLinks={hook.handleFixTemplateLinks}
            navigate={hook.navigate}
          />
        </TabsContent>

        <TabsContent value="floor-plan" className="space-y-4">
          <InteractiveFloorPlan
            subsectionId={hook.subsectionId || ''}
            projectName={siteData?.clientInfo || 'Unknown Client'}
            siteName={siteData?.siteName || 'Unknown Site'}
            subsectionName={subsection?.name || 'Unknown Subsection'}
          />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab
            supabaseDocuments={hook.supabaseDocuments}
            documentCategories={hook.documentCategories}
            uploadingFile={hook.uploadingFile}
            uploadCategoryId={hook.uploadCategoryId}
            setUploadCategoryId={hook.setUploadCategoryId}
            uploadFile={hook.uploadFile}
            setUploadFile={hook.setUploadFile}
            setDeleteDocumentId={hook.setDeleteDocumentId}
            deletingDocumentId={hook.deletingDocumentId}
            createCategoryOpen={hook.createCategoryOpen}
            setCreateCategoryOpen={hook.setCreateCategoryOpen}
            newCategoryName={hook.newCategoryName}
            setNewCategoryName={hook.setNewCategoryName}
            deleteCategoryId={hook.deleteCategoryId}
            setDeleteCategoryId={hook.setDeleteCategoryId}
            fixingCategories={hook.fixingCategories}
            setPreviewDocument={hook.setPreviewDocument}
            handleFixCategories={hook.handleFixCategories}
            handleCreateCategory={hook.handleCreateCategory}
            handleDeleteCategory={hook.handleDeleteCategory}
            handleDocumentUpload={hook.handleDocumentUpload}
            handleDownloadDocument={hook.handleDownloadDocument}
          />
        </TabsContent>

        <TabsContent value="coc-metering">
          <CocMeteringTab
            subsection={subsection}
            subsectionId={hook.subsectionId}
            supabaseDocuments={hook.supabaseDocuments}
            documentCategories={hook.documentCategories}
            deletingDocumentId={hook.deletingDocumentId}
            uploadingFile={hook.uploadingFile}
            setUploadingFile={hook.setUploadingFile}
            setUploadCategoryId={hook.setUploadCategoryId}
            setUploadFile={hook.setUploadFile}
            setDeleteDocumentId={hook.setDeleteDocumentId}
            setPreviewDocument={hook.setPreviewDocument}
            meterSerialNumber={hook.meterSerialNumber}
            setMeterSerialNumber={hook.setMeterSerialNumber}
            ctRatio={hook.ctRatio}
            setCtRatio={hook.setCtRatio}
            saving={hook.saving}
            getSupabaseCocDocuments={hook.getSupabaseCocDocuments}
            getSupabaseEvaluationDocuments={hook.getSupabaseEvaluationDocuments}
            getSupabaseMeteringDocuments={hook.getSupabaseMeteringDocuments}
            onUploadEvaluationReport={hook.handleUploadEvaluationReport}
            handleDownloadDocument={hook.handleDownloadDocument}
            handleSaveMeteringDetails={hook.handleSaveMeteringDetails}
            fetchSupabaseDocuments={hook.fetchSupabaseDocuments}
            refetchSubsection={hook.fetchSubsectionData}
          />
        </TabsContent>
      </Tabs>

      {/* Shared delete-document confirmation. Mounted at the page level (not inside a tab) so it
          works from BOTH the Documents tab and the COC & Metering tab — inactive tabs unmount,
          which is why the COC delete button previously did nothing. */}
      <AlertDialog open={hook.deleteDocumentId !== null} onOpenChange={() => hook.setDeleteDocumentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={hook.deletingDocumentId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const doc = hook.supabaseDocuments.find(d => d.id === hook.deleteDocumentId);
                if (doc) hook.handleDeleteDocument(hook.deleteDocumentId!, doc.file_name);
              }}
              disabled={hook.deletingDocumentId !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {hook.deletingDocumentId !== null ? (
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

      {/* All Dialogs */}
      <SubsectionDialogs
        subsection={subsection}
        isEditDialogOpen={hook.isEditDialogOpen}
        setIsEditDialogOpen={hook.setIsEditDialogOpen}
        editFormData={hook.editFormData}
        setEditFormData={hook.setEditFormData}
        saving={hook.saving}
        handleSaveEdit={hook.handleSaveEdit}
        deleteSubsectionDialogOpen={hook.deleteSubsectionDialogOpen}
        setDeleteSubsectionDialogOpen={hook.setDeleteSubsectionDialogOpen}
        handleDeleteSubsection={hook.handleDeleteSubsection}
        previewDocument={hook.previewDocument}
        setPreviewDocument={hook.setPreviewDocument}
      />
    </div>
  );
};

export default SubsectionDetail;
