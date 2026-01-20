import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Sparkles } from 'lucide-react';
import { useServerPdfGeneration } from '@/hooks/useServerPdfGeneration';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

interface SubsectionData {
  id: string;
  name: string;
  tenant_name?: string;
  category?: string;
  coc_status?: string;
  coc_number?: string;
  coc_type?: string;
  coc_issue_date?: string;
  meter_serial_number?: string;
  ct_ratio?: string;
  is_compliant?: boolean;
  qr_code_url?: string;
  snags?: Array<{
    id: string;
    title: string;
    status: string;
    risk_level?: string;
    description?: string;
  }>;
}

interface SiteData {
  id: string;
  name: string;
  address?: string;
  client?: {
    name?: string;
    logo_url?: string;
  };
}

interface GenerateFinalReportButtonProps {
  site: SiteData;
  subsections: SubsectionData[];
  companyLogoUrl?: string;
  accentColor?: string;
}

export function GenerateFinalReportButton({
  site,
  subsections,
  companyLogoUrl,
  accentColor = '#6366f1',
}: GenerateFinalReportButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const { generatePdf, isGenerating, progress } = useServerPdfGeneration();

  // Calculate summary stats
  const summaryStats = {
    totalSubsections: subsections.length,
    compliantCount: subsections.filter(s => s.is_compliant === true).length,
    nonCompliantCount: subsections.filter(s => s.is_compliant === false).length,
    pendingCount: subsections.filter(s => s.is_compliant === null || s.is_compliant === undefined).length,
    cocValidCount: subsections.filter(s => s.coc_status?.toLowerCase().includes('valid')).length,
    cocExpiredCount: subsections.filter(s => s.coc_status?.toLowerCase().includes('expired')).length,
    cocMissingCount: subsections.filter(s => !s.coc_status || s.coc_status.toLowerCase() === 'missing').length,
    openSnagsCount: subsections.reduce((acc, s) => 
      acc + (s.snags?.filter(sn => sn.status !== 'resolved' && sn.status !== 'Resolved').length || 0), 0),
    resolvedSnagsCount: subsections.reduce((acc, s) => 
      acc + (s.snags?.filter(sn => sn.status === 'resolved' || sn.status === 'Resolved').length || 0), 0),
  };

  const handleGenerate = async () => {
    // Transform subsections to API format
    const transformedSubsections = subsections.map(sub => ({
      id: sub.id,
      name: sub.name,
      tenantName: sub.tenant_name,
      category: sub.category,
      cocStatus: sub.coc_status,
      cocNumber: sub.coc_number,
      cocType: sub.coc_type,
      cocIssueDate: sub.coc_issue_date,
      meterSerialNumber: sub.meter_serial_number,
      ctRatio: sub.ct_ratio,
      isCompliant: sub.is_compliant,
      qrCodeUrl: sub.qr_code_url,
      snags: sub.snags?.map(sn => ({
        id: sn.id,
        title: sn.title,
        status: sn.status,
        riskLevel: sn.risk_level,
        description: sn.description,
      })),
    }));

    try {
      await generatePdf({
        reportType: 'site-summary',
        siteId: site.id,
        siteName: site.name,
        siteAddress: site.address,
        clientName: site.client?.name,
        clientLogoUrl: site.client?.logo_url,
        companyLogoUrl,
        accentColor,
        subsections: transformedSubsections,
        summaryStats,
        generatedAt: new Date().toLocaleDateString('en-ZA'),
      });
      setShowDialog(false);
    } catch (error) {
      // Error already handled in hook
    }
  };

  return (
    <>
      <Button
        onClick={() => setShowDialog(true)}
        className="gap-2"
        variant="default"
      >
        <Sparkles className="h-4 w-4" />
        Generate Final Report
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Generate Final Report
            </DialogTitle>
            <DialogDescription>
              Generate a high-fidelity PDF report using server-side rendering for pixel-perfect output.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Site:</span>
                <span className="font-medium">{site.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subsections:</span>
                <span className="font-medium">{subsections.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Compliance Rate:</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {Math.round((summaryStats.compliantCount / Math.max(summaryStats.totalSubsections, 1)) * 100)}%
                </span>
              </div>
            </div>

            {isGenerating && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-center text-muted-foreground">
                  {progress < 30 ? 'Preparing data...' :
                   progress < 80 ? 'Generating PDF...' :
                   progress < 100 ? 'Finalizing...' : 'Complete!'}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Generate PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
