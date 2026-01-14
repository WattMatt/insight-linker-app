import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileDown, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateCOCValidationPDF } from "@/lib/cocValidationPdfGenerator";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";

interface BulkCOCReportSaveProps {
  siteId: string;
  subsections: Array<{ id: string; name: string }>;
  onSaveComplete?: () => void;
}

interface SaveResult {
  subsectionId: string;
  subsectionName: string;
  cocNumber?: string;
  status: "pending" | "saving" | "success" | "error";
  error?: string;
}

export function BulkCOCReportSave({ siteId, subsections, onSaveComplete }: BulkCOCReportSaveProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SaveResult[]>([]);
  const [totalValidations, setTotalValidations] = useState(0);

  const handleBulkSave = async () => {
    setIsSaving(true);
    setProgress(0);
    setResults([]);

    try {
      // Fetch all COC validations for this site's subsections
      const subsectionIds = subsections.map(s => s.id);
      
      const { data: validations, error: fetchError } = await supabase
        .from("coc_validations")
        .select("*")
        .in("subsection_id", subsectionIds);

      if (fetchError) {
        throw fetchError;
      }

      if (!validations || validations.length === 0) {
        toast.info("No COC validations found to save");
        setIsSaving(false);
        return;
      }

      setTotalValidations(validations.length);

      // Initialize results
      const initialResults: SaveResult[] = validations.map(v => {
        const subsection = subsections.find(s => s.id === v.subsection_id);
        return {
          subsectionId: v.subsection_id,
          subsectionName: subsection?.name || "Unknown",
          cocNumber: (v.report_data as any)?.cocNumber,
          status: "pending" as const,
        };
      });
      setResults(initialResults);

      // Process each validation
      for (let i = 0; i < validations.length; i++) {
        const validation = validations[i];
        
        // Update status to saving
        setResults(prev => prev.map((r, idx) => 
          idx === i ? { ...r, status: "saving" as const } : r
        ));

        try {
          // Generate PDF
          const { blob, fileName } = await generateCOCValidationPDF({
            status: validation.status,
            validated_at: validation.validated_at,
            validated_by: validation.validated_by ?? undefined,
            report_data: validation.report_data as any,
            subsection_id: validation.subsection_id,
            document_id: validation.document_id,
          });

          // Save to documents
          const saveResult = await savePDFToDocuments({
            blob,
            fileName,
            subsectionId: validation.subsection_id,
            categoryName: getReportCategoryName("coc-validation"),
          });

          if (saveResult.success) {
            setResults(prev => prev.map((r, idx) => 
              idx === i ? { ...r, status: "success" as const } : r
            ));
          } else {
            setResults(prev => prev.map((r, idx) => 
              idx === i ? { ...r, status: "error" as const, error: saveResult.error } : r
            ));
          }
        } catch (error) {
          setResults(prev => prev.map((r, idx) => 
            idx === i ? { ...r, status: "error" as const, error: error instanceof Error ? error.message : "Unknown error" } : r
          ));
        }

        // Update progress
        setProgress(((i + 1) / validations.length) * 100);
      }

      const successCount = results.filter(r => r.status === "success").length;
      const errorCount = results.filter(r => r.status === "error").length;

      if (errorCount === 0) {
        toast.success(`All ${validations.length} COC reports saved successfully!`);
      } else {
        toast.warning(`Saved ${successCount} of ${validations.length} reports. ${errorCount} failed.`);
      }
      
      // Trigger refresh callback
      onSaveComplete?.();
    } catch (error) {
      console.error("Error in bulk save:", error);
      toast.error("Failed to save COC reports");
    } finally {
      setIsSaving(false);
    }
  };

  const successCount = results.filter(r => r.status === "success").length;
  const errorCount = results.filter(r => r.status === "error").length;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <FileDown className="h-4 w-4" />
        Bulk Save COC Reports
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Save COC Validation Reports</DialogTitle>
            <DialogDescription>
              Generate and save COC validation reports for all subsections with validations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!isSaving && results.length === 0 && (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-4">
                  This will generate PDF reports for all COC validations and save them to each subsection's documents.
                </p>
                <Button onClick={handleBulkSave}>
                  <FileDown className="h-4 w-4 mr-2" />
                  Start Bulk Save
                </Button>
              </div>
            )}

            {(isSaving || results.length > 0) && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} />
                </div>

                {results.length > 0 && (
                  <div className="flex gap-4 text-sm">
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      {successCount} Saved
                    </Badge>
                    {errorCount > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        {errorCount} Failed
                      </Badge>
                    )}
                  </div>
                )}

                <ScrollArea className="h-[300px] border rounded-md p-3">
                  <div className="space-y-2">
                    {results.map((result, index) => (
                      <div
                        key={`${result.subsectionId}-${index}`}
                        className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-md"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate text-sm">
                            {result.subsectionName}
                          </p>
                          {result.cocNumber && (
                            <p className="text-xs text-muted-foreground">
                              COC: {result.cocNumber}
                            </p>
                          )}
                          {result.error && (
                            <p className="text-xs text-destructive">
                              {result.error}
                            </p>
                          )}
                        </div>
                        <div className="ml-2 flex-shrink-0">
                          {result.status === "pending" && (
                            <Badge variant="secondary" className="text-xs">Pending</Badge>
                          )}
                          {result.status === "saving" && (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          )}
                          {result.status === "success" && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                          {result.status === "error" && (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {!isSaving && results.length > 0 && (
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => {
                      setResults([]);
                      setProgress(0);
                    }}>
                      Reset
                    </Button>
                    <Button onClick={() => setIsOpen(false)}>
                      Close
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
