import { useState } from "react";
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
  RefreshCw
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

interface BulkValidationSummary {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  passed: number;
  failedValidation: number;
}

interface BulkCOCValidationProps {
  siteId: string;
  siteName: string;
  onComplete?: () => void;
}

export function BulkCOCValidation({ siteId, siteName, onComplete }: BulkCOCValidationProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [skipValidated, setSkipValidated] = useState(true);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [summary, setSummary] = useState<BulkValidationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runBulkValidation = async () => {
    setIsRunning(true);
    setError(null);
    setResults([]);
    setSummary(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to run bulk validation');
      }

      toast.info('Starting bulk COC validation...', { 
        description: 'This may take several minutes depending on the number of documents.' 
      });

      const response = await supabase.functions.invoke('bulk-validate-coc', {
        body: {
          siteId,
          skipValidated,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Bulk validation failed');
      }

      const data = response.data;
      setResults(data.results || []);
      setSummary(data.summary);

      const { summary: s } = data;
      toast.success('Bulk validation complete!', {
        description: `Processed ${s.total} documents: ${s.success} validated, ${s.skipped} skipped, ${s.failed} failed`,
      });

      onComplete?.();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error('Bulk validation failed', { description: errorMessage });
    } finally {
      setIsRunning(false);
    }
  };

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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing COC documents... This may take several minutes.
            </div>
            <Progress value={undefined} className="w-full" />
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
                onClick={() => { setResults([]); setSummary(null); }}
                className="gap-1"
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
