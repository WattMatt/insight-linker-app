/**
 * Full Site Summary Preview - Matches actual SiteSummaryReport.tsx PDF output
 * This component renders a preview that mirrors the exact sections and structure
 * that will be generated in the final PDF.
 */
import React from "react";
import { ReportSection, ReportCustomization } from "@/components/pdf-editor/types";
import { cn } from "@/lib/utils";
import { QrCode, Building2 } from "lucide-react";
import { SampleSubsection, SampleKPIs } from "@/hooks/useSampleReportData";

interface SiteSummaryFullPreviewProps {
  sections: ReportSection[];
  customization: ReportCustomization;
  zoom: number;
  colors: { primary: string; light: string; text: string };
  siteName: string;
  clientName: string;
  siteAddress: string | null;
  clientLogoUrl: string | null;
  subsections: SampleSubsection[];
  kpis: SampleKPIs;
  onSectionTitleChange?: (sectionId: string, title: string) => void;
}

// Placeholder indicator for sample data
const PlaceholderBadge: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <span 
    className={cn(
      "inline-block border border-dashed border-amber-400/60 bg-amber-50/40 rounded px-1 py-px",
      className
    )}
    title="Sample data - will be replaced with actual values"
  >
    {children}
  </span>
);

export const SiteSummaryFullPreview: React.FC<SiteSummaryFullPreviewProps> = ({
  sections,
  customization,
  zoom,
  colors,
  siteName,
  clientName,
  siteAddress,
  clientLogoUrl,
  subsections,
  kpis,
}) => {
  // Sort sections by order
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  
  // Calculate metrics like the actual PDF generator
  const subsectionCount = kpis.totalSubsections || subsections.length || 1;
  const cocCompliant = kpis.cocPass || 0;
  const cocRequired = subsectionCount;
  const meteringInstalled = Math.round(subsectionCount * 0.9);
  const openSnags = Math.round(subsectionCount * 0.1);
  const overallHealth = Math.round((cocCompliant / subsectionCount) * 100);
  const cocCompliance = cocRequired > 0 ? Math.round((cocCompliant / cocRequired) * 100) : 0;
  const meteringData = Math.round((meteringInstalled / subsectionCount) * 100);
  const snagFree = 100 - Math.round((openSnags / subsectionCount) * 100);

  // Page wrapper component matching A4 styling
  const PageWrapper: React.FC<{ children: React.ReactNode; pageNum: number; title?: string }> = ({ children, pageNum }) => (
    <div 
      className="bg-white shadow-lg mx-auto relative"
      style={{
        width: 595 * zoom,
        minHeight: 842 * zoom,
        padding: `${40 * zoom}px ${50 * zoom}px`,
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center border-b pb-2 mb-4" style={{ fontSize: 9 * zoom, color: '#6b7280' }}>
        <span>Site Summary Report</span>
        <span>CONFIDENTIAL - For authorized use only</span>
      </div>
      
      {children}
      
      {/* Footer */}
      {customization.includePageNumbers && (
        <div 
          className="absolute bottom-4 left-0 right-0 flex justify-between px-12"
          style={{ fontSize: 8 * zoom, color: '#9ca3af' }}
        >
          <span>CONFIDENTIAL - For authorized use only</span>
          <span>Page {pageNum}</span>
          <span>{new Date().toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );

  // Render each section based on ID - matching SiteSummaryReport.tsx structure
  const renderSection = (section: ReportSection) => {
    if (!section.enabled) return null;

    switch (section.id) {
      case "health-metrics":
      case "compliance":
        return (
          <div key={section.id} style={{ marginBottom: 20 * zoom }}>
            <h2 
              style={{ 
                fontSize: 14 * zoom, 
                fontWeight: 'bold', 
                color: colors.primary,
                marginBottom: 12 * zoom,
                borderBottom: `2px solid ${colors.primary}`,
                paddingBottom: 4 * zoom,
              }}
            >
              {section.title || 'Health Metrics'}
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: `${overallHealth}%`, label: 'Overall Health', color: '#16a34a' },
                { value: `${cocCompliance}%`, label: 'COC Compliance', color: '#ea580c' },
                { value: `${meteringData}%`, label: 'Metering Data', color: '#2563eb' },
                { value: `${snagFree}%`, label: 'Snag Free', color: '#dc2626' },
              ].map((kpi, i) => (
                <div
                  key={i}
                  className="text-center rounded p-2"
                  style={{ 
                    backgroundColor: `${kpi.color}10`,
                    border: `1px solid ${kpi.color}30`,
                  }}
                >
                  <PlaceholderBadge>
                    <span style={{ fontSize: 18 * zoom, fontWeight: 'bold', color: kpi.color }}>
                      {kpi.value}
                    </span>
                  </PlaceholderBadge>
                  <div style={{ fontSize: 8 * zoom, color: '#6b7280', marginTop: 2 * zoom }}>
                    {kpi.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case "health-by-category":
        return (
          <div key={section.id} style={{ marginBottom: 20 * zoom }}>
            <h2 
              style={{ 
                fontSize: 14 * zoom, 
                fontWeight: 'bold', 
                color: colors.primary,
                marginBottom: 12 * zoom,
              }}
            >
              {section.title || 'Health by Category'}
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {['Line Shop', 'Anchor', 'ATM', 'Electrical'].map((cat, i) => (
                <div
                  key={cat}
                  className="text-center rounded p-2"
                  style={{ backgroundColor: colors.light }}
                >
                  <PlaceholderBadge>
                    <span style={{ fontSize: 16 * zoom, fontWeight: 'bold', color: colors.primary }}>
                      {[72, 85, 100, 45][i]}%
                    </span>
                  </PlaceholderBadge>
                  <div style={{ fontSize: 8 * zoom, color: '#6b7280', marginTop: 2 * zoom }}>
                    {cat}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case "summary-statistics":
      case "site-info":
        return (
          <div key={section.id} style={{ marginBottom: 20 * zoom }}>
            <h2 
              style={{ 
                fontSize: 14 * zoom, 
                fontWeight: 'bold', 
                color: colors.primary,
                marginBottom: 12 * zoom,
              }}
            >
              {section.title || 'Site Information'}
            </h2>
            <div className="border rounded" style={{ fontSize: 10 * zoom }}>
              {[
                ['Total Subsections', subsectionCount.toString()],
                ['COC Required', cocRequired.toString()],
                ['COC Compliant', cocCompliant.toString()],
                ['Metering Installed', meteringInstalled.toString()],
                ['Open Snags', openSnags.toString()],
                ['Overall Health Rate', `${overallHealth}%`],
              ].map(([label, value], i) => (
                <div 
                  key={i}
                  className="flex justify-between px-3 py-2 border-b last:border-b-0"
                  style={{ backgroundColor: i % 2 === 0 ? colors.light : 'transparent' }}
                >
                  <span className="text-gray-600">{label}</span>
                  <PlaceholderBadge className="font-medium">{value}</PlaceholderBadge>
                </div>
              ))}
            </div>
          </div>
        );

      case "subsection-details":
      case "subsections":
        const displaySubs = subsections.slice(0, 4);
        return (
          <div key={section.id} style={{ marginBottom: 20 * zoom }}>
            <h2 
              style={{ 
                fontSize: 14 * zoom, 
                fontWeight: 'bold', 
                color: colors.primary,
                marginBottom: 12 * zoom,
                borderBottom: `2px solid ${colors.primary}`,
                paddingBottom: 4 * zoom,
              }}
            >
              {section.title || 'Subsections Overview'}
            </h2>
            <div className="space-y-3">
              {displaySubs.map((sub, i) => (
                <div 
                  key={i}
                  className="border rounded p-3"
                  style={{ fontSize: 9 * zoom }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <PlaceholderBadge className="font-bold">
                        <span style={{ color: colors.primary, fontSize: 11 * zoom }}>
                          {sub.name}
                        </span>
                      </PlaceholderBadge>
                      <div className="text-gray-500" style={{ fontSize: 8 * zoom }}>
                        Category: {sub.category || 'LS'}
                      </div>
                    </div>
                    <div 
                      className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center"
                      title="QR Code"
                    >
                      <QrCode style={{ width: 24 * zoom, height: 24 * zoom }} className="text-gray-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-gray-600">
                    <div>COC Status: <PlaceholderBadge>{sub.cocStatus || 'Missing'}</PlaceholderBadge></div>
                    <div>Metering: <PlaceholderBadge>Installed</PlaceholderBadge></div>
                    <div>Meter S/N: <PlaceholderBadge>35778057</PlaceholderBadge></div>
                    <div>CT Ratio: <PlaceholderBadge>100/5A</PlaceholderBadge></div>
                    <div>Snags: <PlaceholderBadge className={sub.cocStatus === 'Pass' ? 'text-green-600' : 'text-red-600'}>
                      {sub.cocStatus === 'Pass' ? '0' : '2'}
                    </PlaceholderBadge></div>
                    <div>Compliance: 
                      <PlaceholderBadge className={sub.cocStatus === 'Pass' ? 'text-green-600' : 'text-red-600'}>
                        {sub.cocStatus === 'Pass' ? '✓ Compliant' : '✗ Non-Compliant'}
                      </PlaceholderBadge>
                    </div>
                  </div>
                </div>
              ))}
              {subsections.length > 4 && (
                <div className="text-center text-gray-400 italic" style={{ fontSize: 9 * zoom }}>
                  + {subsections.length - 4} more subsection cards in full report...
                </div>
              )}
            </div>
          </div>
        );

      case "coc-validations":
      case "documents":
        return (
          <div key={section.id} style={{ marginBottom: 20 * zoom }}>
            <h2 
              style={{ 
                fontSize: 14 * zoom, 
                fontWeight: 'bold', 
                color: colors.primary,
                marginBottom: 12 * zoom,
              }}
            >
              {section.title || 'COC Validation Summary'}
            </h2>
            <div className="border rounded overflow-hidden" style={{ fontSize: 9 * zoom }}>
              <div 
                className="grid grid-cols-4 gap-2 p-2 font-medium"
                style={{ backgroundColor: colors.light, color: colors.text }}
              >
                <span>Subsection</span>
                <span>COC Number</span>
                <span>Status</span>
                <span>Date</span>
              </div>
              {[
                ['SHOP 001', 'COC-2026-0012', 'Pass', '12 Jan 2026'],
                ['SHOP 002', 'COC-2026-0015', 'Fail', '10 Jan 2026'],
                ['GENERATOR', 'COC-2025-0089', 'Pass', '05 Jan 2026'],
              ].map((row, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 p-2 border-t">
                  <PlaceholderBadge>{row[0]}</PlaceholderBadge>
                  <PlaceholderBadge>{row[1]}</PlaceholderBadge>
                  <PlaceholderBadge className={row[2] === 'Pass' ? 'text-green-600' : 'text-red-600'}>
                    {row[2]}
                  </PlaceholderBadge>
                  <PlaceholderBadge>{row[3]}</PlaceholderBadge>
                </div>
              ))}
            </div>
          </div>
        );

      case "inspections":
        return (
          <div key={section.id} style={{ marginBottom: 20 * zoom }}>
            <h2 
              style={{ 
                fontSize: 14 * zoom, 
                fontWeight: 'bold', 
                color: colors.primary,
                marginBottom: 12 * zoom,
              }}
            >
              {section.title || 'Recent Inspections'}
            </h2>
            <div className="border rounded overflow-hidden" style={{ fontSize: 9 * zoom }}>
              <div 
                className="grid grid-cols-4 gap-2 p-2 font-medium"
                style={{ backgroundColor: colors.light, color: colors.text }}
              >
                <span>Title</span>
                <span>Status</span>
                <span>Inspector</span>
                <span>Date</span>
              </div>
              {[
                ['Electrical Inspection', 'Completed', 'John Smith', '15 Jan 2026'],
                ['Fire Safety Check', 'In Progress', 'Jane Doe', '14 Jan 2026'],
              ].map((row, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 p-2 border-t">
                  <PlaceholderBadge>{row[0]}</PlaceholderBadge>
                  <PlaceholderBadge>{row[1]}</PlaceholderBadge>
                  <PlaceholderBadge>{row[2]}</PlaceholderBadge>
                  <PlaceholderBadge>{row[3]}</PlaceholderBadge>
                </div>
              ))}
            </div>
          </div>
        );

      case "subsection-qr-codes":
        return (
          <div key={section.id} className="text-center py-4 text-gray-500 italic" style={{ fontSize: 9 * zoom }}>
            <QrCode className="w-8 h-8 mx-auto mb-2 opacity-50" />
            QR codes are embedded within each subsection card above
          </div>
        );

      default:
        return null;
    }
  };

  const enabledSections = sortedSections.filter(s => s.enabled);
  
  return (
    <div className="space-y-4">
      {/* Cover Page */}
      <PageWrapper pageNum={1} title="Cover">
        <div 
          className="absolute top-0 left-0 right-0"
          style={{ height: 8 * zoom, backgroundColor: colors.primary }}
        />
        
        <div className="flex flex-col items-center pt-12" style={{ paddingTop: 60 * zoom }}>
          {/* Logo */}
          {clientLogoUrl ? (
            <img src={clientLogoUrl} alt="Logo" style={{ height: 60 * zoom, marginBottom: 20 * zoom }} />
          ) : (
            <div 
              className="flex items-center justify-center rounded"
              style={{ width: 120 * zoom, height: 60 * zoom, backgroundColor: colors.light, marginBottom: 20 * zoom }}
            >
              <Building2 style={{ width: 24 * zoom, height: 24 * zoom, color: colors.primary }} />
            </div>
          )}
          
          {/* Report badge */}
          <div 
            className="rounded px-4 py-1 mb-4"
            style={{ backgroundColor: '#f3f4f6', fontSize: 10 * zoom }}
          >
            SITE SUMMARY REPORT
          </div>
          
          {/* Title */}
          <h1 style={{ fontSize: 24 * zoom, fontWeight: 'bold', color: colors.primary, marginBottom: 8 * zoom }}>
            {customization.coverTitle || 'Site Summary Report'}
          </h1>
          <p style={{ fontSize: 14 * zoom, color: '#6b7280', marginBottom: 32 * zoom }}>
            {customization.coverSubtitle || 'Comprehensive Site Analysis'}
          </p>
          
          {/* Info box */}
          <div 
            className="rounded p-4"
            style={{ 
              backgroundColor: '#f9fafb',
              borderLeft: `4px solid ${colors.primary}`,
              width: '80%',
            }}
          >
            <div className="flex items-center gap-2 mb-2" style={{ fontSize: 12 * zoom }}>
              <Building2 style={{ width: 14 * zoom, height: 14 * zoom, color: colors.primary }} />
              <PlaceholderBadge className="font-semibold">{siteName}</PlaceholderBadge>
            </div>
            <div className="flex items-center gap-2 mb-2" style={{ fontSize: 11 * zoom }}>
              <span style={{ width: 14 * zoom }}>👤</span>
              <PlaceholderBadge>{clientName}</PlaceholderBadge>
            </div>
            {siteAddress && (
              <div className="flex items-center gap-2" style={{ fontSize: 10 * zoom, color: '#6b7280' }}>
                <span style={{ width: 14 * zoom }}>📍</span>
                <PlaceholderBadge>{siteAddress}</PlaceholderBadge>
              </div>
            )}
          </div>
          
          {/* Footer info */}
          <div className="mt-auto pt-16 text-center" style={{ paddingTop: 100 * zoom }}>
            {customization.includeDate && (
              <div style={{ fontSize: 10 * zoom, color: '#6b7280' }}>
                <PlaceholderBadge>
                  {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </PlaceholderBadge>
              </div>
            )}
          </div>
        </div>
      </PageWrapper>
      
      {/* Content Pages */}
      <PageWrapper pageNum={2} title="Overview">
        {enabledSections.slice(0, 3).map((section) => renderSection(section))}
      </PageWrapper>
      
      {/* Subsection Cards Page */}
      {enabledSections.find(s => s.id === 'subsection-details' || s.id === 'subsections') && (
        <PageWrapper pageNum={3} title="Subsections">
          {renderSection(enabledSections.find(s => s.id === 'subsection-details' || s.id === 'subsections')!)}
        </PageWrapper>
      )}
      
      {/* COC Validations Page */}
      {enabledSections.find(s => s.id === 'coc-validations' || s.id === 'documents')?.enabled && (
        <PageWrapper pageNum={4} title="COC Validations">
          {renderSection(enabledSections.find(s => s.id === 'coc-validations' || s.id === 'documents')!)}
        </PageWrapper>
      )}
    </div>
  );
};
