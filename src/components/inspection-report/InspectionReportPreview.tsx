/**
 * WYSIWYG Inspection Report Preview
 * Main component that renders the full report for preview and PDF generation
 */
import { useRef, useState, useEffect } from "react";
import { format } from "date-fns";
import { CoverPage } from "./CoverPage";
import { QualityDashboard } from "./QualityDashboard";
import { SectionPage } from "./SectionPage";
import { TenantSection } from "./TenantSection";
import { SnagSection } from "./SnagSection";
import { SignaturePage } from "./SignaturePage";
import { generatePdfFromPages, waitForImages } from "@/lib/wysiwygPdfGenerator";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { downloadBlob } from "@/lib/fileDownload";

export interface InspectionSection {
  title: string;
  items: {
    label: string;
    value: string;
    type?: string;
    notes?: string;
    photos?: string[];
  }[];
}

export interface InspectionTenant {
  shopName: string;
  shopNumber?: string;
  meterSerialNumber?: string;
  breakerSize?: string;
  ctSizeAndRatio?: string;
  meterImage?: string;
  breakerImage?: string;
  ctRatioImage?: string;
}

export interface InspectionSnag {
  title: string;
  description?: string;
  status: string;
  riskLevel?: string;
  photos?: string[];
}

export interface InspectionSignature {
  name: string;
  role: string;
  signatureUrl?: string;
  signedAt?: string;
}

export interface InspectionReportData {
  templateName: string;
  subsectionName: string;
  siteName: string;
  clientName?: string;
  logoUrl?: string | null;
  inspectorName?: string;
  inspectionDate?: string;
  status?: string;
  qualityRating?: number;
  sections: InspectionSection[];
  tenants?: InspectionTenant[];
  snags?: InspectionSnag[];
  signatures?: InspectionSignature[];
}

interface InspectionReportPreviewProps {
  data: InspectionReportData;
  onPdfGenerated?: (result: {
    success: boolean;
    url?: string;
    blob?: Blob;
    error?: string;
  }) => void;
}

export function InspectionReportPreview({ data, onPdfGenerated }: InspectionReportPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<(HTMLDivElement | null)[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);

  // Calculate stats for dashboard
  const calculateStats = () => {
    let totalItems = 0;
    let passedItems = 0;
    let failedItems = 0;
    let pendingItems = 0;
    let totalPhotos = 0;

    data.sections.forEach(section => {
      section.items.forEach(item => {
        totalItems++;
        const value = item.value?.toLowerCase() || '';
        if (value === 'pass' || value === 'passed' || value === 'compliant') {
          passedItems++;
        } else if (value === 'fail' || value === 'failed' || value === 'non-compliant') {
          failedItems++;
        } else if (value !== 'n/a' && value !== 'na' && value !== 'not applicable') {
          pendingItems++;
        }
        totalPhotos += item.photos?.length || 0;
      });
    });

    return { totalItems, passedItems, failedItems, pendingItems, totalPhotos };
  };

  const stats = calculateStats();
  const reportDate = data.inspectionDate 
    ? format(new Date(data.inspectionDate), 'dd MMMM yyyy')
    : format(new Date(), 'dd MMMM yyyy');

  // Wait for images to load
  useEffect(() => {
    if (containerRef.current) {
      waitForImages(containerRef.current).then(() => {
        setImagesLoaded(true);
      });
    }
  }, [data]);

  const handleGeneratePdf = async () => {
    const pendingDownload = createPendingDownloadHandoff();
    setIsGenerating(true);
    
    try {
      // Wait a bit for any final rendering
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Filter out null pages and get valid elements
      const validPages = pagesRef.current.filter((page): page is HTMLDivElement => page !== null);
      
      if (validPages.length === 0) {
        throw new Error('No pages to capture');
      }

      console.log('[WYSIWYG Preview] Generating PDF with', validPages.length, 'pages');
      
      const result = await generatePdfFromPages(validPages, {
        scale: 2,
        quality: 0.95,
        onProgress: (current, total) => {
          console.log(`[WYSIWYG Preview] Capturing page ${current}/${total}`);
        },
      });

      onPdfGenerated?.({
        ...result,
        pendingDownload,
      });
    } catch (error) {
      console.error('[WYSIWYG Preview] PDF generation error:', error);
      onPdfGenerated?.({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate PDF',
        pendingDownload,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Build pages array
  let pageIndex = 0;

  return (
    <div className="flex flex-col h-full">
      {/* Generate button */}
      <div className="flex justify-end p-4 border-b bg-muted/30">
        <Button 
          onClick={handleGeneratePdf} 
          disabled={isGenerating || !imagesLoaded}
          className="gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating PDF...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Download PDF
            </>
          )}
        </Button>
      </div>
      
      {/* Scrollable preview container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto bg-gray-200 p-8"
        style={{ maxHeight: 'calc(100vh - 200px)' }}
      >
        <div className="flex flex-col items-center gap-8">
          {/* Page 1: Cover */}
          <div 
            ref={el => { pagesRef.current[pageIndex++] = el; }}
            className="wysiwyg-page"
            style={{
              width: '210mm',
              minHeight: '297mm',
              backgroundColor: 'white',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <CoverPage
              logoUrl={data.logoUrl}
              templateName={data.templateName}
              subsectionName={data.subsectionName}
              siteName={data.siteName}
              clientName={data.clientName}
              inspectorName={data.inspectorName}
              inspectionDate={data.inspectionDate}
              status={data.status}
            />
          </div>

          {/* Page 2: Quality Dashboard */}
          <div 
            ref={el => { pagesRef.current[pageIndex++] = el; }}
            className="wysiwyg-page"
            style={{
              width: '210mm',
              minHeight: '297mm',
              backgroundColor: 'white',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            }}
          >
            <QualityDashboard
              qualityRating={data.qualityRating}
              totalItems={stats.totalItems}
              passedItems={stats.passedItems}
              failedItems={stats.failedItems}
              pendingItems={stats.pendingItems}
              totalPhotos={stats.totalPhotos}
            />
          </div>

          {/* Section pages */}
          {data.sections.map((section, sectionIdx) => (
            <div 
              key={`section-${sectionIdx}`}
              ref={el => { pagesRef.current[pageIndex++] = el; }}
              className="wysiwyg-page"
              style={{
                width: '210mm',
                minHeight: '297mm',
                backgroundColor: 'white',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              }}
            >
              <SectionPage
                sectionNumber={sectionIdx + 1}
                title={section.title}
                items={section.items}
              />
            </div>
          ))}

          {/* Tenant section (if applicable) */}
          {data.tenants && data.tenants.length > 0 && (
            <div 
              ref={el => { pagesRef.current[pageIndex++] = el; }}
              className="wysiwyg-page"
              style={{
                width: '210mm',
                minHeight: '297mm',
                backgroundColor: 'white',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              }}
            >
              <TenantSection tenants={data.tenants} />
            </div>
          )}

          {/* Snags section (if applicable) */}
          {data.snags && data.snags.length > 0 && (
            <div 
              ref={el => { pagesRef.current[pageIndex++] = el; }}
              className="wysiwyg-page"
              style={{
                width: '210mm',
                minHeight: '297mm',
                backgroundColor: 'white',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              }}
            >
              <SnagSection snags={data.snags} />
            </div>
          )}

          {/* Signatures page */}
          <div 
            ref={el => { pagesRef.current[pageIndex++] = el; }}
            className="wysiwyg-page"
            style={{
              width: '210mm',
              minHeight: '297mm',
              backgroundColor: 'white',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            }}
          >
            <SignaturePage
              signatures={data.signatures || []}
              reportDate={reportDate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export { InspectionReportPreview as default };
