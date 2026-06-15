import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Upload, Download, Trash2, Eye, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CocCertificateList } from "@/components/coc/CocCertificateList";
import { useSearchParams } from "@/lib/navigation";
import type { SubsectionData, SupabaseDocument, DocumentCategory } from "./types";

interface CocMeteringTabProps {
  subsection: SubsectionData;
  subsectionId: string | undefined;
  supabaseDocuments: SupabaseDocument[];
  documentCategories: DocumentCategory[];
  deletingDocumentId: string | null;
  uploadingFile: boolean;
  setUploadingFile: (v: boolean) => void;
  setUploadCategoryId: (id: string | null) => void;
  setUploadFile: (file: File | null) => void;
  setDeleteDocumentId: (id: string | null) => void;
  setPreviewDocument: (doc: {file_name: string, file_url: string} | null) => void;
  meterSerialNumber: string;
  setMeterSerialNumber: (v: string) => void;
  ctRatio: string;
  setCtRatio: (v: string) => void;
  saving: boolean;
  getSupabaseCocDocuments: () => SupabaseDocument[];
  getSupabaseMeteringDocuments: () => SupabaseDocument[];
  handleDownloadDocument: (url: string, fileName: string) => void;
  handleSaveMeteringDetails: () => void;
  fetchSupabaseDocuments: () => void;
  refetchSubsection: () => void;
}

export function CocMeteringTab({
  subsection,
  subsectionId,
  supabaseDocuments,
  documentCategories,
  deletingDocumentId,
  uploadingFile,
  setUploadingFile,
  setUploadCategoryId,
  setUploadFile,
  setDeleteDocumentId,
  setPreviewDocument,
  meterSerialNumber,
  setMeterSerialNumber,
  ctRatio,
  setCtRatio,
  saving,
  getSupabaseCocDocuments,
  getSupabaseMeteringDocuments,
  handleDownloadDocument,
  handleSaveMeteringDetails,
  fetchSupabaseDocuments,
  refetchSubsection,
}: CocMeteringTabProps) {
  const [searchParams] = useSearchParams();
  const meterInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchParams.get("focus") === "meter") {
      meterInputRef.current?.focus();
      meterInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [searchParams]);

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
          {/* Per-document COC capture: Initial + supplementaries, each with a Pass/Fail */}
          <CocCertificateList
            cocDocuments={getSupabaseCocDocuments()}
            deletingDocumentId={deletingDocumentId}
            onSaved={() => { fetchSupabaseDocuments(); refetchSubsection(); }}
            setPreviewDocument={setPreviewDocument}
            handleDownloadDocument={handleDownloadDocument}
            setDeleteDocumentId={setDeleteDocumentId}
          />

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
                ref={meterInputRef}
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
              const supabaseMeteringDocs = getSupabaseMeteringDocuments();
              const hasDocs = supabaseMeteringDocs.length > 0;

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
