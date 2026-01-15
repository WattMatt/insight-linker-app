import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { 
  PlayCircle, 
  CheckCircle2, 
  XCircle, 
  SkipForward, 
  Loader2,
  FileCheck,
  AlertTriangle,
  RefreshCw,
  StopCircle
} from "lucide-react";

interface ValidationResult {
  subsectionId: string;
  subsectionName: string;
  documentId: string;
  fileName: string;
  status: 'success' | 'failed' | 'skipped';
  validationStatus?: string;
  violationsCount?: number;
  error?: string;
}

interface COCDocument {
  subsectionId: string;
  subsectionName: string;
  documentId: string;
  fileName: string;
  fileUrl: string;
  documentCocType: string | null;
  subsectionCocType: string | null;
  alreadyValidated: boolean;
}

interface BulkCOCValidationProps {
  siteId: string;
  siteName: string;
  onComplete?: () => void;
}

export function BulkCOCValidation({ siteId, siteName, onComplete }: BulkCOCValidationProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [skipValidated, setSkipValidated] = useState(true);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentDoc, setCurrentDoc] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [shouldStop, setShouldStop] = useState(false);

  const fetchCOCDocuments = useCallback(async (): Promise<COCDocument[]> => {
    // Get all subsections with COC documents for this site
    const { data: subsections, error: subsectionsError } = await supabase
      .from('subsections')
      .select(`
        id,
        name,
        coc_type,
        subsection_documents!inner (
          id,
          file_name,
          file_url,
          coc_type,
          category_id,
          document_categories!inner (
            name
          )
        )
      `)
      .eq('site_id', siteId);

    if (subsectionsError) {
      throw new Error(`Failed to fetch subsections: ${subsectionsError.message}`);
    }

    // Get existing validations
    const { data: existingValidations } = await supabase
      .from('coc_validations')
      .select('document_id');

    const validatedDocIds = new Set((existingValidations || []).map(v => v.document_id));

    // Filter to only COC documents
    const cocDocuments: COCDocument[] = [];

    for (const subsection of subsections || []) {
      for (const doc of (subsection.subsection_documents as any[]) || []) {
        const categoryName = doc.document_categories?.name || '';
        if (categoryName.toLowerCase().includes('coc') || categoryName.toLowerCase().includes('certificate')) {
          // Skip validation report PDFs
          if (doc.file_name.includes('COC_Validation_Report')) {
            continue;
          }
          cocDocuments.push({
            subsectionId: subsection.id,
            subsectionName: subsection.name,
            documentId: doc.id,
            fileName: doc.file_name,
            fileUrl: doc.file_url,
            documentCocType: doc.coc_type,
            subsectionCocType: subsection.coc_type,
            alreadyValidated: validatedDocIds.has(doc.id),
          });
        }
      }
    }

    return cocDocuments;
  }, [siteId]);

  const validateSingleDocument = async (doc: COCDocument): Promise<ValidationResult> => {
    try {
      const approvedCocType = doc.documentCocType || doc.subsectionCocType;

      const response = await supabase.functions.invoke('validate-coc', {
        body: {
          documentId: doc.documentId,
          documentUrl: doc.fileUrl,
          subsectionId: doc.subsectionId,
          approvedCocType: approvedCocType,
        },
      });

      if (response.error) {
        return {
          subsectionId: doc.subsectionId,
          subsectionName: doc.subsectionName,
          documentId: doc.documentId,
          fileName: doc.fileName,
          status: 'failed',
          error: response.error.message,
        };
      }

      const validationResult = response.data;
      return {
        subsectionId: doc.subsectionId,
        subsectionName: doc.subsectionName,
        documentId: doc.documentId,
        fileName: doc.fileName,
        status: 'success',
        validationStatus: validationResult.complianceStatus,
        violationsCount: validationResult.violations?.length || 0,
      };
    } catch (err) {
      return {
        subsectionId: doc.subsectionId,
        subsectionName: doc.subsectionName,
        documentId: doc.documentId,
        fileName: doc.fileName,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  };

  const runBulkValidation = async () => {
    setIsRunning(true);
    setIsStopping(false);
    setShouldStop(false);
    setError(null);
    setResults([]);
    setProgress({ current: 0, total: 0 });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to run bulk validation');
      }

      toast.info('Fetching COC documents...'); 

      const allDocs = await fetchCOCDocuments();
      
      // Filter based on skipValidated option
      const docsToValidate = skipValidated 
        ? allDocs.filter(d => !d.alreadyValidated)
        : allDocs;
      
      const skippedDocs = skipValidated 
        ? allDocs.filter(d => d.alreadyValidated)
        : [];

      setProgress({ current: 0, total: docsToValidate.length });

      if (docsToValidate.length === 0) {
        toast.info('No documents to validate', { 
          description: `All ${allDocs.length} COC documents have already been validated.` 
        });
        
        // Add skipped results
        const skippedResults: ValidationResult[] = skippedDocs.map(doc => ({
          subsectionId: doc.subsectionId,
          subsectionName: doc.subsectionName,
          documentId: doc.documentId,
          fileName: doc.fileName,
          status: 'skipped' as const,
          error: 'Already validated',
        }));
        setResults(skippedResults);
        setIsRunning(false);
        return;
      }

      toast.info(`Starting validation of ${docsToValidate.length} documents...`);

      const allResults: ValidationResult[] = [];

      // Add skipped results first
      for (const doc of skippedDocs) {
        allResults.push({
          subsectionId: doc.subsectionId,
          subsectionName: doc.subsectionName,
          documentId: doc.documentId,
          fileName: doc.fileName,
          status: 'skipped',
          error: 'Already validated',
        });
      }

      // Process documents one at a time
      for (let i = 0; i < docsToValidate.length; i++) {
        // Check if user requested stop
        if (shouldStop) {
          toast.info('Validation stopped by user');
          break;
        }

        const doc = docsToValidate[i];
        setCurrentDoc(`${doc.subsectionName} - ${doc.fileName}`);
        setProgress({ current: i + 1, total: docsToValidate.length });

        const result = await validateSingleDocument(doc);
        allResults.push(result);
        setResults([...allResults]);

        // Brief delay between documents to avoid rate limiting
        if (i < docsToValidate.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setCurrentDoc(null);

      // Calculate summary
      const successCount = allResults.filter(r => r.status === 'success').length;
      const failedCount = allResults.filter(r => r.status === 'failed').length;
      const skippedCount = allResults.filter(r => r.status === 'skipped').length;
      const passedCount = allResults.filter(r => r.validationStatus === 'Pass').length;
      const failedValidationCount = allResults.filter(r => r.validationStatus === 'Fail').length;

      toast.success('Bulk validation complete!', {
        description: `Processed ${successCount} documents: ${passedCount} passed, ${failedValidationCount} failed compliance, ${skippedCount} skipped, ${failedCount} errors`,
      });

      onComplete?.();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error('Bulk validation failed', { description: errorMessage });
    } finally {
      setIsRunning(false);
      setIsStopping(false);
      setCurrentDoc(null);
    }
  };

  const handleStop = () => {
    setShouldStop(true);
    setIsStopping(true);
    toast.info('Stopping after current document...');
  };

  // Calculate summary from results
  const summary = results.length > 0 ? {
    total: results.length,
    success: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    passed: results.filter(r => r.validationStatus === 'Pass').length,
    failedValidation: results.filter(r => r.validationStatus === 'Fail').length,
  } : null;

  const getStatusIcon = (result: ValidationResult) => {
    if (result.status === 'skipped') {
      return <SkipForward className="h-4 w-4 text-muted-foreground" />;
    }
    if (result.status === 'failed') {
      return <XCircle className="h-4 w-4 text-destructive" />;
    }
    if (result.validationStatus === 'Pass') {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  };

  const getStatusBadge = (result: ValidationResult) => {
    if (result.status === 'skipped') {
      return <Badge variant="outline">Skipped</Badge>;
    }
    if (result.status === 'failed') {
      return <Badge variant="destructive">Error</Badge>;
    }
    if (result.validationStatus === 'Pass') {
      return <Badge className="bg-green-500">Pass</Badge>;
    }
    return <Badge variant="destructive">Fail ({result.violationsCount} issues)</Badge>;
  };

  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Bulk COC Validation
            </CardTitle>
            <CardDescription>
              Validate all COC documents for {siteName} against SANS 10142-1:2020
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {isRunning && (
              <Button 
                variant="outline"
                onClick={handleStop} 
                disabled={isStopping}
                className="gap-2"
              >
                <StopCircle className="h-4 w-4" />
                {isStopping ? 'Stopping...' : 'Stop'}
              </Button>
            )}
            <Button 
              onClick={runBulkValidation} 
              disabled={isRunning}
              className="gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" />
                  Run Bulk Validation
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Options */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="skipValidated"
            checked={skipValidated}
            onCheckedChange={(checked) => setSkipValidated(checked === true)}
            disabled={isRunning}
          />
          <label
            htmlFor="skipValidated"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Skip already validated documents
          </label>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
            <p className="font-medium">Validation Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="p-3 bg-green-500/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-green-600">{summary.passed}</p>
              <p className="text-xs text-muted-foreground">Passed</p>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-red-600">{summary.failedValidation}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-blue-600">{summary.success}</p>
              <p className="text-xs text-muted-foreground">Processed</p>
            </div>
            <div className="p-3 bg-gray-500/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-600">{summary.skipped}</p>
              <p className="text-xs text-muted-foreground">Skipped</p>
            </div>
            <div className="p-3 bg-orange-500/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-orange-600">{summary.failed}</p>
              <p className="text-xs text-muted-foreground">Errors</p>
            </div>
          </div>
        )}

        {/* Progress indicator when running */}
        {isRunning && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing: {currentDoc || 'Starting...'}</span>
              </div>
              <span className="text-muted-foreground">
                {progress.current} / {progress.total}
              </span>
            </div>
            <Progress value={progressPercent} className="w-full" />
          </div>
        )}

        {/* Results List */}
        {results.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Validation Results</h4>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { setResults([]); }}
                className="gap-1"
                disabled={isRunning}
              >
                <RefreshCw className="h-3 w-3" />
                Clear
              </Button>
            </div>
            <ScrollArea className="h-[300px] border rounded-lg">
              <div className="p-2 space-y-1">
                {results.map((result, index) => (
                  <div 
                    key={`${result.documentId}-${index}`}
                    className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {getStatusIcon(result)}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{result.subsectionName}</p>
                        <p className="text-xs text-muted-foreground truncate">{result.fileName}</p>
                        {result.error && (
                          <p className="text-xs text-destructive truncate">{result.error}</p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 ml-2">
                      {getStatusBadge(result)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Empty state */}
        {!isRunning && results.length === 0 && !error && (
          <div className="text-center py-8 text-muted-foreground">
            <FileCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Click "Run Bulk Validation" to validate all COC documents for this site.</p>
            <p className="text-sm mt-1">Each document will be checked against SANS 10142-1:2020 requirements.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
