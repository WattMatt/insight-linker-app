import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileText, Plus, RefreshCw, Trash2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ComprehensiveInspectionReport } from "@/components/ComprehensiveInspectionReport";
import type { SubsectionData, SiteData } from "./types";

interface InspectionsTabProps {
  subsection: SubsectionData;
  siteData: SiteData;
  inspectionArray: [string, any][];
  subsectionId: string | undefined;
  siteId: string | undefined;
  clientId: string | undefined;
  actualClientId: string | null;
  companyLogo: string | null;
  snags: any[];
  availableTemplates: Array<{id: string, name: string, category: string}>;
  linkedTemplate: {id: string, name: string, category: string} | null;
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  isCreateInspectionOpen: boolean;
  setIsCreateInspectionOpen: (open: boolean) => void;
  newInspectionDate: string;
  setNewInspectionDate: (date: string) => void;
  deleteInspectionId: string | null;
  setDeleteInspectionId: (id: string | null) => void;
  fixingTemplates: boolean;
  handleCreateInspection: () => void;
  handleUpdateInspectionStatus: (inspectionId: string, newStatus: string) => void;
  handleDeleteInspection: () => void;
  handleFixTemplateLinks: () => void;
  navigate: (path: string) => void;
}

export function InspectionsTab({
  subsection,
  siteData,
  inspectionArray,
  subsectionId,
  siteId,
  clientId,
  actualClientId,
  companyLogo,
  snags,
  availableTemplates,
  linkedTemplate,
  selectedTemplateId,
  setSelectedTemplateId,
  isCreateInspectionOpen,
  setIsCreateInspectionOpen,
  newInspectionDate,
  setNewInspectionDate,
  deleteInspectionId,
  setDeleteInspectionId,
  fixingTemplates,
  handleCreateInspection,
  handleUpdateInspectionStatus,
  handleDeleteInspection,
  handleFixTemplateLinks,
  navigate,
}: InspectionsTabProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Inspections</CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleFixTemplateLinks}
              disabled={fixingTemplates}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${fixingTemplates ? 'animate-spin' : ''}`} />
              {fixingTemplates ? 'Fixing...' : 'Fix Template Links'}
            </Button>
            <Dialog open={isCreateInspectionOpen} onOpenChange={setIsCreateInspectionOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  New Inspection
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New Inspection</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {linkedTemplate && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        This subsection is linked to the <strong>{linkedTemplate.name}</strong> template by default.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="templateSelect">Inspection Template</Label>
                    <Select
                      value={selectedTemplateId || linkedTemplate?.id || ""}
                      onValueChange={setSelectedTemplateId}
                    >
                      <SelectTrigger id="templateSelect" className="bg-background">
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {availableTemplates.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            <div>
                              <p className="font-medium">{template.name}</p>
                              <p className="text-xs text-muted-foreground">{template.category}</p>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inspectionDate">Inspection Date</Label>
                    <Input
                      id="inspectionDate"
                      type="date"
                      value={newInspectionDate}
                      onChange={(e) => setNewInspectionDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => {
                    setIsCreateInspectionOpen(false);
                    setSelectedTemplateId("");
                    setNewInspectionDate("");
                  }}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateInspection}>
                    Create Inspection
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {inspectionArray.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No inspections found for this subsection</p>
            </div>
          ) : (
            <div className="space-y-3">
              {inspectionArray.map(([id, inspection]) => (
                <div
                  key={id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                >
                  <div
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => {
                      const basePath = (actualClientId || clientId)
                        ? `/clients/${actualClientId || clientId}/sites/${siteId}/subsections/${subsectionId}`
                        : `/sites/${siteId}/subsections/${subsectionId}`;
                      navigate(`${basePath}/inspections/${id}`);
                    }}
                  >
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {(() => {
                          const template = availableTemplates.find(t => t.id === inspection.templateId);
                          return template?.name || inspection.title || inspection.type || 'Inspection';
                        })()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {inspection.date ? format(new Date(inspection.date), "dd MMMM yyyy") : "No date"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={inspection.status || 'Pending'}
                      onValueChange={(value) => handleUpdateInspectionStatus(id, value)}
                    >
                      <SelectTrigger className="w-32" onClick={(e) => e.stopPropagation()}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    {inspection.status === 'Completed' && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <ComprehensiveInspectionReport
                          inspectionData={{
                            id,
                            templateId: inspection.templateId,
                            status: inspection.status,
                            inspection_date: inspection.date,
                          }}
                          siteName={siteData?.siteName || 'Unknown Site'}
                          subsectionName={subsection?.name || 'Unknown Subsection'}
                          templateId={inspection.templateId}
                          subsectionId={subsectionId}
                          siteLogoUrl={companyLogo}
                          inspectionId={id}
                          clientName={siteData?.clientInfo}
                          snags={snags.filter(s => s.status?.toLowerCase() !== 'rectified' && s.status?.toLowerCase() !== 'closed')}
                        />
                      </div>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteInspectionId(id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteInspectionId !== null} onOpenChange={() => setDeleteInspectionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Inspection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this inspection? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInspection} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
