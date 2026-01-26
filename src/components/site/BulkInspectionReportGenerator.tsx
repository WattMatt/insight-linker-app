import { useState, useCallback, useEffect } from "react";
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
  FileText,
  Camera,
  Download,
  StopCircle,
  RefreshCw,
  Image as ImageIcon
} from "lucide-react";
import { generateAndSaveInspectionReportPdfmake, InspectionReportData } from "@/lib/pdfmakeInspectionReport";

interface GenerationResult {
  subsectionId: string;
  subsectionName: string;
  inspectionId: string;
  templateName: string;
  status: 'success' | 'failed' | 'skipped' | 'no-inspection';
  fileName?: string;
  fileUrl?: string;
  photoCount?: number;
  error?: string;
}

interface SubsectionWithInspection {
  subsectionId: string;
  subsectionName: string;
  inspectionId: string | null;
  templateId: string | null;
  templateName: string | null;
  inspectionStatus: string | null;
  hasPhotos: boolean;
  photoCount: number;
  hasExistingReport: boolean;
}

interface BulkInspectionReportGeneratorProps {
  siteId: string;
  siteName: string;
  clientName?: string;
  siteLogoUrl?: string | null;
  onComplete?: () => void;
}

export function BulkInspectionReportGenerator({ 
  siteId, 
  siteName, 
  clientName,
  siteLogoUrl,
  onComplete 
}: BulkInspectionReportGeneratorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [shouldStop, setShouldStop] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [onlyWithPhotos, setOnlyWithPhotos] = useState(false);
  
  const [subsections, setSubsections] = useState<SubsectionWithInspection[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [currentItem, setCurrentItem] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // Fetch subsections with their inspections on mount
  const fetchSubsections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch subsections with their latest inspection
      const { data: subsectionsData, error: subsectionsError } = await supabase
        .from('subsections')
        .select(`
          id,
          name,
          inspections (
            id,
            template_id,
            status,
            json_data,
            inspection_templates (
              id,
              name
            )
          )
        `)
        .eq('site_id', siteId)
        .order('name');

      if (subsectionsError) {
        throw new Error(`Failed to fetch subsections: ${subsectionsError.message}`);
      }

      // Check for existing inspection reports
      const { data: existingReports } = await supabase
        .from('subsection_documents')
        .select('subsection_id, file_name')
        .in('subsection_id', (subsectionsData || []).map(s => s.id))
        .ilike('file_name', '%Inspection%Report%');

      const existingReportsBySubsection = new Set(
        (existingReports || []).map(r => r.subsection_id)
      );

      // Process subsections
      const processed: SubsectionWithInspection[] = (subsectionsData || []).map(sub => {
        // Get the most recent inspection with a template
        const inspections = (sub.inspections as any[]) || [];
        const latestInspection = inspections
          .filter(i => i.template_id)
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
        
        // Count photos in inspection data (sections + tenants)
        let photoCount = 0;
        if (latestInspection?.json_data) {
          const jsonData = latestInspection.json_data as Record<string, any>;
          Object.entries(jsonData).forEach(([key, section]: [string, any]) => {
            // Handle tenants array separately
            if (key === 'tenants' && Array.isArray(section)) {
              section.forEach((tenant: any) => {
                if (tenant.meterImage) photoCount++;
                if (tenant.breakerImage) photoCount++;
                if (tenant.ctRatioImage) photoCount++;
              });
            } else if (typeof section === 'object' && section !== null && key !== 'generalInfo') {
              Object.values(section).forEach((item: any) => {
                if (Array.isArray(item?.photos)) {
                  photoCount += item.photos.length;
                }
              });
            }
          });
        }

        return {
          subsectionId: sub.id,
          subsectionName: sub.name,
          inspectionId: latestInspection?.id || null,
          templateId: latestInspection?.template_id || null,
          templateName: latestInspection?.inspection_templates?.name || null,
          inspectionStatus: latestInspection?.status || null,
          hasPhotos: photoCount > 0,
          photoCount,
          hasExistingReport: existingReportsBySubsection.has(sub.id),
        };
      });

      setSubsections(processed);
      
      // Auto-select all subsections with inspections
      const withInspections = processed
        .filter(s => s.inspectionId)
        .map(s => s.subsectionId);
      setSelectedIds(new Set(withInspections));

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      toast.error('Failed to load subsections', { description: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchSubsections();
  }, [fetchSubsections]);

  // Toggle selection
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select/deselect all
  const toggleSelectAll = () => {
    const eligibleIds = subsections
      .filter(s => s.inspectionId)
      .map(s => s.subsectionId);
    
    if (selectedIds.size === eligibleIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleIds));
    }
  };

  // Generate a single report
  const generateSingleReport = async (sub: SubsectionWithInspection): Promise<GenerationResult> => {
    if (!sub.inspectionId || !sub.templateId) {
      return {
        subsectionId: sub.subsectionId,
        subsectionName: sub.subsectionName,
        inspectionId: '',
        templateName: '',
        status: 'no-inspection',
        error: 'No inspection with template found',
      };
    }

    try {
      // Fetch full inspection data
      const { data: inspection, error: inspError } = await supabase
        .from('inspections')
        .select('*')
        .eq('id', sub.inspectionId)
        .single();

      if (inspError || !inspection) {
        throw new Error('Failed to fetch inspection');
      }

      // Fetch template
      const { data: template, error: templateError } = await supabase
        .from('inspection_templates')
        .select('*')
        .eq('id', sub.templateId)
        .single();

      if (templateError || !template) {
        throw new Error('Failed to fetch template');
      }

      // Fetch snags
      const { data: snagsData } = await supabase
        .from('snags')
        .select('*')
        .eq('subsection_id', sub.subsectionId);
      const snags = snagsData || [];

      // Fetch signatures
      const { data: signaturesData } = await supabase
        .from('inspection_signatures')
        .select('*')
        .eq('inspection_id', sub.inspectionId);
      const signatures = signaturesData || [];

      // Build sections from template with photos
      const jsonData: Record<string, any> = (inspection.json_data as Record<string, any>) || {};
      const generalInfo = jsonData.generalInfo || {};
      
      const templateSections = Array.isArray(template.sections) ? template.sections : Object.values(template.sections || {});
      let totalPhotos = 0;
      
      const sectionsForPdf = templateSections.map((section: any) => {
        const sectionId = String(section.id ?? '');
        const items = Array.isArray(section.items) ? section.items : Object.values(section.items || {});
        
        return {
          title: section.name || sectionId,
          items: items.map((item: any, idx: number) => {
            const itemId = String(item.id ?? idx);
            const itemData = jsonData[sectionId]?.[itemId] || {};
            const photos = Array.isArray(itemData.photos) ? itemData.photos : [];
            totalPhotos += photos.length;
            
            return {
              label: item.name || itemId,
              value: itemData.status || itemData.value || 'N/A',
              type: item.type || 'text',
              notes: itemData.notes || '',
              photos: photos,
            };
          }),
        };
      });

      // Count snag photos
      snags.forEach(snag => {
        if (Array.isArray(snag.photos)) {
          totalPhotos += (snag.photos as string[]).length;
        }
      });

      // Extract tenant photos and count them
      const tenants = Array.isArray(jsonData.tenants) ? jsonData.tenants : [];
      const tenantsForPdf = tenants.map((tenant: any) => {
        const images: string[] = [];
        if (tenant.meterImage) images.push(tenant.meterImage);
        if (tenant.breakerImage) images.push(tenant.breakerImage);
        if (tenant.ctRatioImage) images.push(tenant.ctRatioImage);
        totalPhotos += images.length;
        return {
          shopName: tenant.shopName || 'Unknown Tenant',
          shopNumber: tenant.shopNumber || '',
          meterSerialNumber: tenant.meterSerialNumber || '',
          breakerSize: tenant.breakerSize || '',
          ctSizeAndRatio: tenant.ctSizeAndRatio || '',
          meterImage: tenant.meterImage || null,
          breakerImage: tenant.breakerImage || null,
          ctRatioImage: tenant.ctRatioImage || null,
        };
      });

      // Build inspection data for pdfmake
      const inspectionData: InspectionReportData = {
        inspectionId: sub.inspectionId,
        templateName: template.name,
        inspectorName: generalInfo.inspectorName || inspection.inspector_name,
        inspectionDate: generalInfo.date || inspection.inspection_date,
        status: inspection.status,
        qualityRating: inspection.quality_rating,
        generalInfo,
        sections: sectionsForPdf,
        tenants: tenantsForPdf,
        snags: snags.map(snag => ({
          title: snag.title,
          description: snag.description || undefined,
          status: snag.status,
          riskLevel: snag.risk_level || undefined,
          photos: Array.isArray(snag.photos) ? (snag.photos as string[]) : [],
        })),
        signatures: signatures.map(sig => ({
          name: sig.signer_name,
          role: sig.signer_type,
          signatureUrl: sig.signature_data,
          signedAt: sig.signed_at,
        })),
        subsectionName: sub.subsectionName,
      };

      // Generate PDF via pdfmake (client-side)
      console.log(`[BulkInspection] Generating pdfmake report for ${sub.subsectionName}`);
      
      const result = await generateAndSaveInspectionReportPdfmake({
        inspection: inspectionData,
        siteName,
        clientName,
        siteLogoUrl,
        subsectionId: sub.subsectionId,
        siteId,
      });

      if (!result.success) {
        throw new Error(result.error || 'PDF generation failed');
      }

      return {
        subsectionId: sub.subsectionId,
        subsectionName: sub.subsectionName,
        inspectionId: sub.inspectionId,
        templateName: template.name,
        status: 'success',
        fileName: result.fileName,
        fileUrl: result.fileUrl,
        photoCount: totalPhotos,
      };

    } catch (err) {
      return {
        subsectionId: sub.subsectionId,
        subsectionName: sub.subsectionName,
        inspectionId: sub.inspectionId || '',
        templateName: sub.templateName || '',
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  };

  // Run bulk generation
  const runBulkGeneration = async () => {
    setIsRunning(true);
    setIsStopping(false);
    setShouldStop(false);
    setError(null);
    setResults([]);
    setProgress({ current: 0, total: 0 });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in');
      }

      // Filter subsections to process
      let toProcess = subsections.filter(s => 
        selectedIds.has(s.subsectionId) && s.inspectionId
      );

      if (skipExisting) {
        toProcess = toProcess.filter(s => !s.hasExistingReport);
      }

      if (onlyWithPhotos) {
        toProcess = toProcess.filter(s => s.hasPhotos);
      }

      if (toProcess.length === 0) {
        toast.info('No subsections to process', { 
          description: 'All selected subsections have been filtered out by your options.' 
        });
        setIsRunning(false);
        return;
      }

      setProgress({ current: 0, total: toProcess.length });
      toast.info(`Generating ${toProcess.length} inspection reports...`);

      const allResults: GenerationResult[] = [];

      for (let i = 0; i < toProcess.length; i++) {
        if (shouldStop) {
          toast.info('Generation stopped by user');
          break;
        }

        const sub = toProcess[i];
        setCurrentItem(`${sub.subsectionName} (${sub.photoCount} photos)`);
        setProgress({ current: i + 1, total: toProcess.length });

        const result = await generateSingleReport(sub);
        allResults.push(result);
        setResults([...allResults]);

        // Brief delay between generations
        if (i < toProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setCurrentItem(null);

      const successCount = allResults.filter(r => r.status === 'success').length;
      const failedCount = allResults.filter(r => r.status === 'failed').length;
      const totalPhotos = allResults.reduce((sum, r) => sum + (r.photoCount || 0), 0);

      toast.success('Bulk generation complete!', {
        description: `Generated ${successCount} reports with ${totalPhotos} photos. ${failedCount} failed.`,
      });

      onComplete?.();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      toast.error('Bulk generation failed', { description: errorMessage });
    } finally {
      setIsRunning(false);
      setIsStopping(false);
      setCurrentItem(null);
    }
  };

  const handleStop = () => {
    setShouldStop(true);
    setIsStopping(true);
    toast.info('Stopping after current report...');
  };

  // Summary stats
  const summary = results.length > 0 ? {
    total: results.length,
    success: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    totalPhotos: results.reduce((sum, r) => sum + (r.photoCount || 0), 0),
  } : null;

  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  const eligibleCount = subsections.filter(s => s.inspectionId).length;
  const selectedCount = [...selectedIds].filter(id => 
    subsections.find(s => s.subsectionId === id && s.inspectionId)
  ).length;

  const getStatusIcon = (result: GenerationResult) => {
    if (result.status === 'skipped' || result.status === 'no-inspection') {
      return <SkipForward className="h-4 w-4 text-muted-foreground" />;
    }
    if (result.status === 'failed') {
      return <XCircle className="h-4 w-4 text-destructive" />;
    }
    return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  };

  const getStatusBadge = (result: GenerationResult) => {
    if (result.status === 'no-inspection') {
      return <Badge variant="outline">No Inspection</Badge>;
    }
    if (result.status === 'skipped') {
      return <Badge variant="outline">Skipped</Badge>;
    }
    if (result.status === 'failed') {
      return <Badge variant="destructive">Failed</Badge>;
    }
    return (
      <div className="flex items-center gap-2">
        <Badge className="bg-green-500">Generated</Badge>
        {result.photoCount && result.photoCount > 0 && (
          <Badge variant="outline" className="gap-1">
            <Camera className="h-3 w-3" />
            {result.photoCount}
          </Badge>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Bulk Inspection Report Generator
            </CardTitle>
            <CardDescription>
              Generate inspection reports for multiple subsections with all photographic evidence
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
              onClick={runBulkGeneration} 
              disabled={isRunning || isLoading || selectedCount === 0}
              className="gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" />
                  Generate Reports ({selectedCount})
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Options */}
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="skipExisting"
              checked={skipExisting}
              onCheckedChange={(checked) => setSkipExisting(checked === true)}
              disabled={isRunning}
            />
            <label htmlFor="skipExisting" className="text-sm font-medium">
              Skip subsections with existing reports
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="onlyWithPhotos"
              checked={onlyWithPhotos}
              onCheckedChange={(checked) => setOnlyWithPhotos(checked === true)}
              disabled={isRunning}
            />
            <label htmlFor="onlyWithPhotos" className="text-sm font-medium">
              Only include subsections with photos
            </label>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="p-3 bg-green-500/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-green-600">{summary.success}</p>
              <p className="text-xs text-muted-foreground">Generated</p>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-red-600">{summary.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
            <div className="p-3 bg-gray-500/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-600">{summary.skipped}</p>
              <p className="text-xs text-muted-foreground">Skipped</p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-blue-600">{summary.totalPhotos}</p>
              <p className="text-xs text-muted-foreground">Total Photos</p>
            </div>
          </div>
        )}

        {/* Progress indicator when running */}
        {isRunning && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing: {currentItem || 'Starting...'}</span>
              </div>
              <span className="text-muted-foreground">
                {progress.current} / {progress.total}
              </span>
            </div>
            <Progress value={progressPercent} className="w-full" />
          </div>
        )}

        {/* Subsection Selection List */}
        {!isRunning && results.length === 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Select Subsections ({selectedCount}/{eligibleCount})</h4>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={toggleSelectAll}
                disabled={isLoading}
              >
                {selectedCount === eligibleCount ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScrollArea className="h-[300px] border rounded-lg">
                <div className="p-2 space-y-1">
                  {subsections.map(sub => (
                    <div 
                      key={sub.subsectionId}
                      className={`flex items-center justify-between p-2 rounded-md ${
                        sub.inspectionId ? 'hover:bg-muted/50 cursor-pointer' : 'opacity-50'
                      }`}
                      onClick={() => sub.inspectionId && toggleSelection(sub.subsectionId)}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedIds.has(sub.subsectionId)}
                          disabled={!sub.inspectionId}
                          onCheckedChange={() => sub.inspectionId && toggleSelection(sub.subsectionId)}
                        />
                        <div>
                          <p className="font-medium text-sm">{sub.subsectionName}</p>
                          <p className="text-xs text-muted-foreground">
                            {sub.templateName || 'No inspection template'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {sub.hasPhotos && (
                          <Badge variant="outline" className="gap-1">
                            <ImageIcon className="h-3 w-3" />
                            {sub.photoCount}
                          </Badge>
                        )}
                        {sub.hasExistingReport && (
                          <Badge variant="secondary">Has Report</Badge>
                        )}
                        {!sub.inspectionId && (
                          <Badge variant="outline">No Inspection</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        {/* Results List */}
        {results.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Generation Results</h4>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { setResults([]); fetchSubsections(); }}
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
                    key={`${result.subsectionId}-${index}`}
                    className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {getStatusIcon(result)}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{result.subsectionName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {result.templateName || result.error}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 ml-2 flex items-center gap-2">
                      {getStatusBadge(result)}
                      {result.fileUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          asChild
                        >
                          <a href={result.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isRunning && results.length === 0 && subsections.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No subsections found for this site.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
