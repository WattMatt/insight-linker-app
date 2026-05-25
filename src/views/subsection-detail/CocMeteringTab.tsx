import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Upload, Download, Trash2, Eye, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InlineViolationOverrides } from "@/components/compliance/InlineViolationOverrides";
import type { SubsectionData, SupabaseDocument, DocumentCategory, CocDocData } from "./types";

interface CocMeteringTabProps {
  subsection: SubsectionData;
  subsectionId: string | undefined;
  supabaseDocuments: SupabaseDocument[];
  documentCategories: DocumentCategory[];
  cocValidations: Record<string, any>;
  cocExtractions: Record<string, any>;
  validatingDocId: string | null;
  deletingDocumentId: string | null;
  uploadingFile: boolean;
  setUploadingFile: (v: boolean) => void;
  setUploadCategoryId: (id: string | null) => void;
  setUploadFile: (file: File | null) => void;
  setDeleteDocumentId: (id: string | null) => void;
  setPreviewDocument: (doc: {file_name: string, file_url: string} | null) => void;
  setCocPreviewDoc: (doc: {id: string, file_name: string, file_url: string, uploaded_at: string} | null) => void;
  setCocPreviewDialogOpen: (open: boolean) => void;
  setSelectedValidationDocId: (id: string | null) => void;
  setValidationReportOpen: (open: boolean) => void;
  meterSerialNumber: string;
  setMeterSerialNumber: (v: string) => void;
  ctRatio: string;
  setCtRatio: (v: string) => void;
  saving: boolean;
  getDocCocData: (docId: string) => CocDocData;
  getCocDocuments: () => SupabaseDocument[];
  getSupabaseCocDocuments: () => SupabaseDocument[];
  getMeteringDocuments: () => SupabaseDocument[];
  getSupabaseMeteringDocuments: () => SupabaseDocument[];
  handleExtractCocData: (documentId: string, documentUrl: string, fileName: string, forceReextract?: boolean) => void;
  handleEditExtraction: (documentId: string, documentUrl: string, fileName: string) => void;
  handleDownloadDocument: (url: string, fileName: string) => void;
  handleSaveMeteringDetails: () => void;
  fetchSupabaseDocuments: () => void;
  fetchCocValidations: () => void;
  // COC preview state
  showCocPreview: boolean;
  setShowCocPreview: (v: boolean) => void;
  pendingDocumentForVerification: {id: string, url: string, name: string} | null;
  cocPreviewData: any;
  setCocPreviewData: React.Dispatch<React.SetStateAction<any>>;
  setPendingDocumentForVerification: React.Dispatch<React.SetStateAction<{id: string, url: string, name: string} | null>>;
}

export function CocMeteringTab({
  subsection,
  subsectionId,
  supabaseDocuments,
  documentCategories,
  cocValidations,
  cocExtractions,
  validatingDocId,
  deletingDocumentId,
  uploadingFile,
  setUploadingFile,
  setUploadCategoryId,
  setUploadFile,
  setDeleteDocumentId,
  setPreviewDocument,
  setCocPreviewDoc,
  setCocPreviewDialogOpen,
  setSelectedValidationDocId,
  setValidationReportOpen,
  meterSerialNumber,
  setMeterSerialNumber,
  ctRatio,
  setCtRatio,
  saving,
  getDocCocData,
  getCocDocuments,
  getSupabaseCocDocuments,
  getMeteringDocuments,
  getSupabaseMeteringDocuments,
  handleExtractCocData,
  handleEditExtraction,
  handleDownloadDocument,
  handleSaveMeteringDetails,
  fetchSupabaseDocuments,
  fetchCocValidations,
  showCocPreview,
  setShowCocPreview,
  pendingDocumentForVerification,
  cocPreviewData,
  setCocPreviewData,
  setPendingDocumentForVerification,
}: CocMeteringTabProps) {
  return (
    <div className="space-y-6">
      {/* Certificates of Compliance */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Certificates of Compliance</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Manage COC documents and their details.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Existing COC Documents */}
          {(() => {
            const cocDocs = getCocDocuments();
            const supabaseCocDocs = getSupabaseCocDocuments();
            const hasDocs = cocDocs.length > 0 || supabaseCocDocs.length > 0;

            return hasDocs ? (
              <div className="space-y-4">
                {supabaseCocDocs.map((doc) => (
                  <div key={doc.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3 flex-1">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{doc.file_name}</p>
                            {cocValidations[doc.id] && (
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    cocValidations[doc.id].status === 'Pass' ? 'default' :
                                    cocValidations[doc.id].status === 'Fail' ? 'destructive' :
                                    'secondary'
                                  }
                                  className="text-xs"
                                >
                                  {cocValidations[doc.id].status}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedValidationDocId(doc.id);
                                    setValidationReportOpen(true);
                                  }}
                                  title="View full validation report"
                                  className="h-6 w-6 p-0"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {new Date(doc.uploaded_at).toLocaleDateString()}
                          </p>
                          {cocValidations[doc.id]?.violations && cocValidations[doc.id].violations.length > 0 && (
                            <InlineViolationOverrides
                              validationId={cocValidations[doc.id].id}
                              violations={cocValidations[doc.id].violations}
                              reportData={cocValidations[doc.id].report_data}
                              onChanged={() => fetchCocValidations()}
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setCocPreviewDoc(doc as any);
                            setCocPreviewDialogOpen(true);
                          }}
                          title="Preview COC with validation details"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (cocExtractions[doc.id]) {
                              handleEditExtraction(doc.id, doc.file_url, doc.file_name);
                            } else {
                              handleExtractCocData(doc.id, doc.file_url, doc.file_name);
                            }
                          }}
                          disabled={validatingDocId === doc.id}
                          title={cocExtractions[doc.id] ? "Review existing COC extraction" : "Extract and verify COC against SANS 10142-1"}
                        >
                          {validatingDocId === doc.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : cocExtractions[doc.id] ? (
                            'Review COC'
                          ) : (
                            'Verify COC'
                          )}
                        </Button>
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

                    {/* COC Details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="text-xs text-muted-foreground">COC Number</p>
                        <p className="font-medium text-sm">{getDocCocData(doc.id).cocNumber || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Issue Date</p>
                        <p className="font-medium text-sm">
                          {getDocCocData(doc.id).cocIssueDate
                            ? format(new Date(getDocCocData(doc.id).cocIssueDate), "PPP")
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">COC Type</p>
                        <p className="font-medium text-sm">
                          {getDocCocData(doc.id).cocType ? (
                            <Badge variant="outline" className="text-xs">
                              {getDocCocData(doc.id).cocType}
                            </Badge>
                          ) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">COC Status</p>
                        <p className="font-medium text-sm">
                          {getDocCocData(doc.id).cocStatus === 'Approved' ? (
                            <Badge className="bg-green-500 text-white text-xs">Approved</Badge>
                          ) : getDocCocData(doc.id).cocStatus === 'Failed' ? (
                            <Badge variant="destructive" className="text-xs">Failed</Badge>
                          ) : '-'}
                        </p>
                      </div>
                    </div>
                    {!cocValidations[doc.id] && !cocExtractions[doc.id] && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Click "Verify COC" to extract and validate this certificate. Data will be saved automatically.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : null;
          })()}

          {/* Upload New COC */}
          <div>
            <p className="text-sm font-medium mb-2">Upload a new COC document</p>
            <label className="border-2 border-dashed rounded-lg p-8 text-center bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer block">
              <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {uploadingFile ? "Uploading..." : "Click to select or drag & drop files"}
              </p>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                disabled={uploadingFile}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const cocCategory = documentCategories.find(cat => cat.name === '01 COC');
                    if (cocCategory) {
                      setUploadCategoryId(cocCategory.id);
                      setUploadFile(file);

                      try {
                        if (!file) { toast.error("No file selected"); return; }
                        const maxSize = 50 * 1024 * 1024;
                        if (file.size > maxSize) {
                          toast.error(`File size exceeds maximum limit of 50MB. Selected file is ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
                          return;
                        }
                        const allowedTypes = [
                          'application/pdf',
                          'application/msword',
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                          'image/jpeg', 'image/jpg', 'image/png'
                        ];
                        if (!allowedTypes.includes(file.type)) {
                          toast.error(`Invalid file type. Please upload PDF, DOC, DOCX, JPG, or PNG files only.`);
                          return;
                        }

                        setUploadingFile(true);
                        toast.info("Uploading COC document...");

                        const timestamp = Date.now();
                        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                        const fileName = `${subsectionId}/${cocCategory.name}/${timestamp}-${sanitizedFileName}`;

                        const { data: uploadData, error: uploadError } = await supabase.storage
                          .from('documents')
                          .upload(fileName, file);

                        if (uploadError) {
                          if (process.env.NODE_ENV === 'development') console.error("Storage upload error:", uploadError);
                          throw new Error(`Upload failed: ${uploadError.message}`);
                        }
                        if (!uploadData?.path) throw new Error("Upload succeeded but no path returned");

                        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(uploadData.path);
                        if (!urlData?.publicUrl) throw new Error("Failed to generate public URL for uploaded file");

                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) throw new Error("User not authenticated");

                        const { error: insertError, data: newDoc } = await supabase
                          .from('subsection_documents')
                          .insert({
                            subsection_id: subsectionId,
                            category_id: cocCategory.id,
                            file_name: file.name,
                            file_url: urlData.publicUrl,
                            file_size: file.size,
                            uploaded_by: user.id
                          })
                          .select('id')
                          .single();

                        if (insertError) {
                          if (process.env.NODE_ENV === 'development') console.error("Database insert error:", insertError);
                          throw new Error(`Failed to save document record: ${insertError.message}`);
                        }
                        if (!newDoc) throw new Error("Document saved but no record returned");

                        toast.success("COC document uploaded successfully!");

                        if (newDoc && urlData.publicUrl) {
                          const { data: signedData } = await supabase.storage
                            .from('documents')
                            .createSignedUrl(uploadData.path, 3600);

                          const previewUrl = signedData?.signedUrl || urlData.publicUrl;

                          setCocPreviewData(null);
                          setShowCocPreview(true);
                          setPendingDocumentForVerification({
                            id: newDoc.id,
                            url: previewUrl,
                            name: sanitizedFileName
                          });
                        }

                        setUploadCategoryId(null);
                        setUploadFile(null);
                        fetchSupabaseDocuments();
                        e.target.value = '';
                      } catch (error: any) {
                        if (process.env.NODE_ENV === 'development') console.error("Error uploading COC document:", error);
                        let errorMessage = "Failed to upload COC document";
                        if (error?.message) errorMessage = error.message;
                        else if (typeof error === 'string') errorMessage = error;
                        else if (error?.error_description) errorMessage = error.error_description;
                        toast.error(errorMessage, { duration: 5000 });
                        e.target.value = '';
                      } finally {
                        setUploadingFile(false);
                      }
                    }
                  }
                }}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Metering Details & Documents */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle>Metering Details & Documents</CardTitle>
          {(!subsection?.meterSerialNumber && !meterSerialNumber) && (
            <Alert className="mt-2 bg-red-50 border-red-200">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-600">
                This information is a requirement for the subsection to pass compliance checks.
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Meter Serial Number</Label>
              <Input
                value={meterSerialNumber || subsection.meterSerialNumber || ''}
                onChange={(e) => setMeterSerialNumber(e.target.value)}
                placeholder="Enter meter serial number"
                className="mt-1"
              />
            </div>
            <div>
              <Label>CT Ratio</Label>
              <Input
                value={ctRatio || subsection.ctRatio || ''}
                onChange={(e) => setCtRatio(e.target.value)}
                placeholder="Enter CT ratio"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>Metering Documents</Label>
            {(() => {
              const meteringDocs = getMeteringDocuments();
              const supabaseMeteringDocs = getSupabaseMeteringDocuments();
              const hasDocs = meteringDocs.length > 0 || supabaseMeteringDocs.length > 0;

              return hasDocs ? (
                <div className="mt-2 space-y-2">
                  {supabaseMeteringDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="text-sm font-medium">{doc.file_name}</span>
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
                  ))}

                  {meteringDocs.map((doc: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{doc.file_name}</span>
                        <Badge variant="secondary" className="text-xs">Supabase</Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownloadDocument(doc.file_url, doc.file_name)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 p-4 bg-muted/50 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">
                    No metering documents uploaded.
                  </p>
                </div>
              );
            })()}
          </div>

          {/* Upload Metering Document */}
          <div>
            <p className="text-sm font-medium mb-2">Upload a new metering document</p>
            <label className="border-2 border-dashed rounded-lg p-8 text-center bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer block">
              <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {uploadingFile ? "Uploading..." : "Click to select or drag & drop files"}
              </p>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                disabled={uploadingFile}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const meteringCategory = documentCategories.find(cat => cat.name === '04 Metering');
                    if (meteringCategory) {
                      setUploadCategoryId(meteringCategory.id);
                      setUploadFile(file);

                      try {
                        setUploadingFile(true);
                        toast.info("Uploading metering document...");

                        const timestamp = Date.now();
                        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                        const fileName = `${subsectionId}/${meteringCategory.name}/${timestamp}-${sanitizedFileName}`;

                        const { data: uploadData, error: uploadError } = await supabase.storage
                          .from('documents')
                          .upload(fileName, file);

                        if (uploadError) throw uploadError;

                        const { data: urlData } = supabase.storage
                          .from('documents')
                          .getPublicUrl(uploadData.path);

                        const { data: { user } } = await supabase.auth.getUser();

                        const { error: insertError } = await supabase
                          .from('subsection_documents')
                          .insert({
                            subsection_id: subsectionId,
                            category_id: meteringCategory.id,
                            file_name: file.name,
                            file_url: urlData.publicUrl,
                            file_size: file.size,
                            uploaded_by: user?.id
                          });

                        if (insertError) throw insertError;

                        toast.success("Metering document uploaded successfully!");
                        setUploadCategoryId(null);
                        setUploadFile(null);
                        fetchSupabaseDocuments();
                        e.target.value = '';
                      } catch (error) {
                        if (process.env.NODE_ENV === 'development') console.error("Error uploading metering document:", error);
                        toast.error("Failed to upload metering document");
                      } finally {
                        setUploadingFile(false);
                      }
                    }
                  }
                }}
              />
            </label>
          </div>

          <Button
            onClick={handleSaveMeteringDetails}
            disabled={saving}
            className="w-full md:w-auto bg-blue-500 hover:bg-blue-600"
          >
            {saving ? "Saving..." : "Save Metering Details"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
