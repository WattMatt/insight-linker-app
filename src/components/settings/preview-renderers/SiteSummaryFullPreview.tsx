/**
 * Full Site Summary Preview - TRUE WYSIWYG
 * Uses shared siteSummaryRenderSpec.ts for exact matching with PDF output.
 * 
 * Renders ALL 7 section types:
 * 1. Health Metrics (KPI cards)
 * 2. Health by Category (KPI cards per category)
 * 3. Summary Statistics (key-value table)
 * 4. Subsection Details (cards with all fields)
 * 5. Subsection QR Codes (QR code grid)
 * 6. COC Validations (table)
 * 7. Inspections (table)
 * 
 * IMPORTANT: Sections should NEVER return null - always render structure with placeholder if no data
 */
import React from "react";
import { ReportSection, ReportCustomization } from "@/components/pdf-editor/types";
import { cn } from "@/lib/utils";
import { QrCode, Building2, AlertCircle } from "lucide-react";
import { SampleSubsection, SampleKPIs, SampleInspection } from "@/hooks/useSampleReportData";
import {
  LAYOUT,
  HEALTH_METRICS_CARDS,
  SUMMARY_STAT_ROWS,
  COC_VALIDATION_COLUMNS,
  INSPECTION_COLUMNS,
  SUBSECTION_CARD_FIELDS,
  getAccentPalette,
  getSectionTitle,
  getEnabledSections,
  matchesSectionId,
  calculateMetrics,
  calculateCategoryHealth,
  findSectionSpec,
  SubsectionData,
  CocValidationData,
  STATUS_COLORS,
} from "@/lib/siteSummaryRenderSpec";
import { getCategoryAbbreviation } from "@/lib/subsectionCategories";

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
  inspections?: SampleInspection[];
  cocValidations?: CocValidationData[];
  onSectionTitleChange?: (sectionId: string, title: string) => void;
}

// Placeholder badge for sample data
const PlaceholderBadge: React.FC<{ 
  children: React.ReactNode; 
  className?: string; 
  style?: React.CSSProperties;
}> = ({ children, className, style }) => (
  <span 
    className={cn("inline-block border border-dashed border-amber-400/60 bg-amber-50/40 rounded px-1 py-px", className)}
    style={style}
    title="Sample data - will be replaced with actual values"
  >
    {children}
  </span>
);

// Empty section placeholder - shows when section has no data
const EmptySectionPlaceholder: React.FC<{ sectionName: string }> = ({ sectionName }) => (
  <div className="flex items-center gap-2 p-4 border border-dashed border-gray-300 rounded bg-gray-50 text-muted-foreground italic">
    <AlertCircle className="w-4 h-4" />
    <span>No data available for {sectionName} - will populate from site data</span>
  </div>
);

export const SiteSummaryFullPreview: React.FC<SiteSummaryFullPreviewProps> = ({
  sections,
  customization,
  zoom,
  siteName,
  clientName,
  siteAddress,
  clientLogoUrl,
  subsections,
  kpis,
  inspections = [],
  cocValidations = [],
}) => {
  const accentPalette = getAccentPalette(customization.accentColor || 'blue');
  const colors = { primary: accentPalette.primary, light: accentPalette.light, text: accentPalette.dark };

  // Debug logging
  console.log('[SiteSummaryFullPreview] Data received:', {
    sectionsCount: sections?.length || 0,
    subsectionsCount: subsections?.length || 0,
    inspectionsCount: inspections?.length || 0,
    cocValidationsCount: cocValidations?.length || 0,
    kpis,
  });

  // Convert sample subsections to spec format - use ACTUAL data from subsections
  const subsectionData: SubsectionData[] = (subsections || []).map(sub => ({
    id: sub.id,
    name: sub.name,
    category: sub.category || 'LS',
    cocStatus: sub.cocStatus,
    meteringStatus: sub.meteringStatus || (sub.meterSerialNumber ? 'Installed' : 'Unknown'),
    meterSerialNumber: sub.meterSerialNumber || null,
    ctRatio: sub.ctRatio || null,
    snagCount: sub.snagCount ?? 0,
    isCompliant: sub.isCompliant ?? (sub.cocStatus === 'Pass'),
  }));

  // Use actual COC validations - fallback to generating from subsection data only if none provided
  const sampleCocValidations: CocValidationData[] = cocValidations.length > 0 
    ? cocValidations 
    : subsectionData.map(sub => ({
        subsectionName: sub.name,
        cocNumber: sub.cocStatus === 'Pass' ? `COC-${sub.id.substring(0, 6).toUpperCase()}` : '-',
        status: sub.cocStatus || 'Pending',
        date: sub.cocStatus === 'Pass' ? new Date().toLocaleDateString() : '-',
      }));

  // Use actual inspections
  const sampleInspections = inspections.length > 0 ? inspections : [];

  // Calculate metrics
  const metrics = calculateMetrics(subsectionData, kpis?.cocRequired, kpis?.snagOpen);
  if (kpis) {
    metrics.subsectionCount = kpis.totalSubsections || metrics.subsectionCount;
    metrics.cocCompliant = kpis.cocPass || metrics.cocCompliant;
    metrics.overallHealth = metrics.subsectionCount > 0 ? Math.round((metrics.cocCompliant / metrics.subsectionCount) * 100) : 0;
  }

  // Calculate category health
  const categoryHealth = calculateCategoryHealth(subsectionData, getCategoryAbbreviation, 4);

  const enabledSections = getEnabledSections(sections || []);
  const scale = (pt: number) => pt * zoom;

  // Debug: Log enabled sections
  console.log('[SiteSummaryFullPreview] Enabled sections:', enabledSections.map(s => s.id));

  // Page break indicator
  const PageBreakIndicator: React.FC = () => (
    <div className="relative my-4 flex items-center justify-center">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t-2 border-dashed border-gray-300" />
      </div>
      <span className="relative bg-gray-100 px-2 text-xs text-gray-500 font-medium">
        PAGE BREAK
      </span>
    </div>
  );

  // Page wrapper
  const PageWrapper: React.FC<{ children: React.ReactNode; pageNum: number }> = ({ children, pageNum }) => (
    <div className="bg-white shadow-lg mx-auto relative" style={{ width: scale(LAYOUT.page.width), minHeight: scale(LAYOUT.page.height), padding: `${scale(LAYOUT.page.marginTop)}px ${scale(LAYOUT.page.marginRight)}px` }}>
      <div className="flex justify-between items-center border-b pb-2 mb-4" style={{ fontSize: scale(LAYOUT.footer.fontSize), color: STATUS_COLORS.muted }}>
        <span>Site Summary Report</span>
        <span>CONFIDENTIAL</span>
      </div>
      {children}
      {customization.includePageNumbers && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-between px-12" style={{ fontSize: scale(LAYOUT.footer.fontSize), color: '#9ca3af' }}>
          <span>CONFIDENTIAL</span>
          <span>Page {pageNum}</span>
          <span>{new Date().toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );

  // Section header
  const SectionHeader: React.FC<{ title: string; withBorder?: boolean }> = ({ title, withBorder }) => (
    <h2 style={{ fontSize: scale(LAYOUT.sectionHeader.fontSize), fontWeight: 'bold', color: colors.primary, marginBottom: scale(LAYOUT.sectionHeader.marginBottom), borderBottom: withBorder ? `2px solid ${colors.primary}` : undefined, paddingBottom: withBorder ? scale(4) : undefined }}>
      {title}
    </h2>
  );

  // KPI card
  const KpiCard: React.FC<{ value: string; label: string; color: string }> = ({ value, label, color }) => (
    <div className="text-center rounded" style={{ backgroundColor: `${color}10`, border: `1px solid ${color}30`, padding: scale(LAYOUT.kpiCard.padding) }}>
      <PlaceholderBadge><span style={{ fontSize: scale(LAYOUT.kpiCard.valueSize), fontWeight: 'bold', color }}>{value}</span></PlaceholderBadge>
      <div style={{ fontSize: scale(LAYOUT.kpiCard.labelSize), color: STATUS_COLORS.muted, marginTop: scale(2) }}>{label}</div>
    </div>
  );

  // Render section - NEVER returns null for enabled sections
  const renderSection = (section: ReportSection) => {
    if (!section.enabled) return null;
    const title = getSectionTitle(section);
    const spec = findSectionSpec(section.id);
    const showPageBreak = spec?.pageBreakBefore;

    // 1. Health Metrics (4 KPI cards)
    if (matchesSectionId(section, 'health-metrics')) {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <SectionHeader title={title} withBorder />
          <div className="grid grid-cols-4 gap-2">
            {HEALTH_METRICS_CARDS.map(card => (
              <KpiCard key={card.id} value={card.format(card.getValue(metrics))} label={card.label} color={card.color} />
            ))}
          </div>
        </div>
      );
    }

    // 2. Health by Category (KPI cards per category)
    if (matchesSectionId(section, 'health-by-category')) {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <SectionHeader title={title} />
          {categoryHealth.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {categoryHealth.map(cat => (
                <KpiCard 
                  key={cat.category}
                  value={`${cat.percentage}%`} 
                  label={cat.abbreviation} 
                  color={cat.percentage >= 80 ? STATUS_COLORS.success : 
                         cat.percentage >= 60 ? STATUS_COLORS.warning : STATUS_COLORS.error} 
                />
              ))}
            </div>
          ) : (
            <EmptySectionPlaceholder sectionName="Health by Category" />
          )}
        </div>
      );
    }

    // 3. Summary Statistics (key-value table)
    if (matchesSectionId(section, 'summary-statistics')) {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <SectionHeader title={title} />
          <div className="border rounded" style={{ fontSize: scale(LAYOUT.table.bodyFontSize) }}>
            {SUMMARY_STAT_ROWS.map((row, i) => (
              <div key={row.id} className="flex justify-between px-3 py-2 border-b last:border-b-0" style={{ backgroundColor: i % 2 === 0 ? colors.light : 'transparent' }}>
                <span className="text-gray-600">{row.label}</span>
                <PlaceholderBadge className="font-medium">{row.getValue(metrics)}</PlaceholderBadge>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 4. Subsection Details (cards with ALL fields)
    if (matchesSectionId(section, 'subsection-details')) {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          {showPageBreak && <PageBreakIndicator />}
          <SectionHeader title={title} withBorder />
          {subsectionData.length > 0 ? (
            <div className="space-y-3">
              {subsectionData.slice(0, 6).map(sub => (
                <div key={sub.id} className="border rounded p-3" style={{ fontSize: scale(9) }}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <PlaceholderBadge className="font-bold" style={{ color: colors.primary }}>{sub.name}</PlaceholderBadge>
                      <div style={{ fontSize: scale(LAYOUT.subsectionCard.categoryFontSize), color: STATUS_COLORS.muted }}>
                        Category: {getCategoryAbbreviation(sub.category || 'Other')}
                      </div>
                    </div>
                    <div className="bg-gray-100 rounded flex items-center justify-center" style={{ width: scale(LAYOUT.subsectionCard.qrCodeSize), height: scale(LAYOUT.subsectionCard.qrCodeSize) }}>
                      <QrCode style={{ width: scale(24), height: scale(24) }} className="text-gray-400" />
                    </div>
                  </div>
                  {/* Render ALL card fields from spec */}
                  <div className="grid grid-cols-3 gap-1 text-gray-600">
                    {SUBSECTION_CARD_FIELDS
                      .filter(field => !field.showIf || field.showIf(sub))
                      .map(field => (
                        <div key={field.id}>
                          {field.label}: <PlaceholderBadge style={{ color: field.getColor?.(sub) || STATUS_COLORS.muted }}>
                            {field.getValue(sub)}
                          </PlaceholderBadge>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
              {subsectionData.length > 6 && (
                <div className="text-center text-muted-foreground text-sm italic">
                  ...and {subsectionData.length - 6} more subsections
                </div>
              )}
            </div>
          ) : (
            <EmptySectionPlaceholder sectionName="Subsection Details" />
          )}
        </div>
      );
    }

    // 5. Subsection QR Codes (grid of QR codes)
    if (matchesSectionId(section, 'subsection-qr-codes')) {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <SectionHeader title={title} />
          {subsectionData.length > 0 ? (
            <div className="grid grid-cols-4 gap-3">
              {subsectionData.slice(0, 8).map(sub => (
                <div key={sub.id} className="border rounded p-2 text-center" style={{ fontSize: scale(8) }}>
                  <div className="bg-gray-100 rounded flex items-center justify-center mx-auto mb-1" style={{ width: scale(50), height: scale(50) }}>
                    <QrCode style={{ width: scale(30), height: scale(30) }} className="text-gray-400" />
                  </div>
                  <PlaceholderBadge className="truncate block" style={{ color: colors.primary }}>{sub.name}</PlaceholderBadge>
                </div>
              ))}
            </div>
          ) : (
            <EmptySectionPlaceholder sectionName="QR Codes" />
          )}
        </div>
      );
    }

    // 6. COC Validations (table)
    if (matchesSectionId(section, 'coc-validations')) {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          {showPageBreak && <PageBreakIndicator />}
          <SectionHeader title={title} withBorder />
          {sampleCocValidations.length > 0 ? (
            <table className="w-full border-collapse" style={{ fontSize: scale(LAYOUT.table.bodyFontSize) }}>
              <thead>
                <tr style={{ backgroundColor: colors.light }}>
                  {COC_VALIDATION_COLUMNS.map(col => (
                    <th 
                      key={col.id} 
                      className="border px-2 py-1 text-left font-medium"
                      style={{ 
                        textAlign: col.alignment || 'left',
                        fontSize: scale(LAYOUT.table.headerFontSize),
                        color: colors.text,
                      }}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleCocValidations.slice(0, 10).map((row, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 1 ? colors.light : 'transparent' }}>
                    <td className="border px-2 py-1"><PlaceholderBadge>{row.subsectionName}</PlaceholderBadge></td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{row.cocNumber}</PlaceholderBadge></td>
                    <td className="border px-2 py-1 text-center">
                      <PlaceholderBadge style={{ 
                        color: row.status === 'Pass' ? STATUS_COLORS.success : 
                               row.status === 'Pending' ? STATUS_COLORS.warning : STATUS_COLORS.muted 
                      }}>
                        {row.status}
                      </PlaceholderBadge>
                    </td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{row.date}</PlaceholderBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptySectionPlaceholder sectionName="COC Validations" />
          )}
          {sampleCocValidations.length > 10 && (
            <div className="text-center text-muted-foreground text-sm italic mt-2">
              ...and {sampleCocValidations.length - 10} more validations
            </div>
          )}
        </div>
      );
    }

    // 7. Inspections (table)
    if (matchesSectionId(section, 'inspections')) {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          {showPageBreak && <PageBreakIndicator />}
          <SectionHeader title={title} withBorder />
          {sampleInspections.length > 0 ? (
            <table className="w-full border-collapse" style={{ fontSize: scale(LAYOUT.table.bodyFontSize) }}>
              <thead>
                <tr style={{ backgroundColor: colors.light }}>
                  {INSPECTION_COLUMNS.map(col => (
                    <th 
                      key={col.id} 
                      className="border px-2 py-1 text-left font-medium"
                      style={{ 
                        textAlign: col.alignment || 'left',
                        fontSize: scale(LAYOUT.table.headerFontSize),
                        color: colors.text,
                      }}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleInspections.slice(0, 5).map((insp, i) => (
                  <tr key={insp.id} style={{ backgroundColor: i % 2 === 1 ? colors.light : 'transparent' }}>
                    <td className="border px-2 py-1"><PlaceholderBadge>{insp.title}</PlaceholderBadge></td>
                    <td className="border px-2 py-1">
                      <PlaceholderBadge style={{ 
                        color: insp.status === 'Completed' ? STATUS_COLORS.success : 
                               insp.status === 'In Progress' ? STATUS_COLORS.warning : STATUS_COLORS.muted 
                      }}>
                        {insp.status}
                      </PlaceholderBadge>
                    </td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{insp.inspectorName || '-'}</PlaceholderBadge></td>
                    <td className="border px-2 py-1">
                      <PlaceholderBadge>
                        {insp.inspectionDate ? new Date(insp.inspectionDate).toLocaleDateString() : '-'}
                      </PlaceholderBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptySectionPlaceholder sectionName="Inspections" />
          )}
        </div>
      );
    }

    // Unknown section - render placeholder
    console.warn(`[SiteSummaryFullPreview] Unknown section type: ${section.id}`);
    return (
      <div key={section.id} style={{ marginBottom: scale(20) }}>
        <SectionHeader title={title} />
        <EmptySectionPlaceholder sectionName={title} />
      </div>
    );
  };

  // Group sections for pages
  const page1Sections = enabledSections.filter(s => 
    matchesSectionId(s, 'health-metrics') || 
    matchesSectionId(s, 'health-by-category') || 
    matchesSectionId(s, 'summary-statistics')
  );
  
  const page2Sections = enabledSections.filter(s => 
    matchesSectionId(s, 'subsection-details') || 
    matchesSectionId(s, 'subsection-qr-codes')
  );

  const page3Sections = enabledSections.filter(s => 
    matchesSectionId(s, 'coc-validations')
  );

  const page4Sections = enabledSections.filter(s => 
    matchesSectionId(s, 'inspections')
  );

  // Debug: Log page groupings
  console.log('[SiteSummaryFullPreview] Page groupings:', {
    page1: page1Sections.map(s => s.id),
    page2: page2Sections.map(s => s.id),
    page3: page3Sections.map(s => s.id),
    page4: page4Sections.map(s => s.id),
  });

  return (
    <div className="space-y-4">
      {/* Cover Page */}
      <PageWrapper pageNum={1}>
        <div className="absolute top-0 left-0 right-0" style={{ height: scale(LAYOUT.cover.accentBarHeight), backgroundColor: colors.primary }} />
        <div className="flex flex-col items-center" style={{ paddingTop: scale(60) }}>
          {clientLogoUrl ? (
            <img src={clientLogoUrl} alt="Logo" style={{ height: scale(LAYOUT.cover.logoHeight), marginBottom: scale(LAYOUT.cover.logoPadding) }} />
          ) : (
            <div className="flex items-center justify-center rounded" style={{ width: scale(120), height: scale(LAYOUT.cover.logoHeight), backgroundColor: colors.light, marginBottom: scale(LAYOUT.cover.logoPadding) }}>
              <Building2 style={{ width: scale(24), height: scale(24), color: colors.primary }} />
            </div>
          )}
          <div className="rounded px-4 py-1 mb-4" style={{ backgroundColor: '#f3f4f6', fontSize: scale(10) }}>SITE SUMMARY REPORT</div>
          <h1 style={{ fontSize: scale(LAYOUT.cover.titleSize), fontWeight: 'bold', color: colors.primary, marginBottom: scale(8) }}>{customization.coverTitle || 'Site Summary Report'}</h1>
          <p style={{ fontSize: scale(LAYOUT.cover.subtitleSize), color: '#6b7280', marginBottom: scale(32) }}>{customization.coverSubtitle || 'Comprehensive Site Analysis'}</p>
          <div className="rounded p-4" style={{ backgroundColor: '#f9fafb', borderLeft: `4px solid ${colors.primary}`, width: '80%' }}>
            <div className="flex items-center gap-2 mb-2" style={{ fontSize: scale(12) }}>
              <Building2 style={{ width: scale(14), height: scale(14), color: colors.primary }} />
              <PlaceholderBadge className="font-semibold">{siteName}</PlaceholderBadge>
            </div>
            <div className="flex items-center gap-2 mb-2" style={{ fontSize: scale(11) }}>
              <span style={{ width: scale(14) }}>👤</span>
              <PlaceholderBadge>{clientName}</PlaceholderBadge>
            </div>
            {siteAddress && (
              <div className="flex items-center gap-2" style={{ fontSize: scale(10), color: '#6b7280' }}>
                <span style={{ width: scale(14) }}>📍</span>
                <PlaceholderBadge>{siteAddress}</PlaceholderBadge>
              </div>
            )}
          </div>
          {customization.includeDate && (
            <div className="mt-auto pt-16 text-center" style={{ paddingTop: scale(100), fontSize: scale(10), color: '#6b7280' }}>
              <PlaceholderBadge>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</PlaceholderBadge>
            </div>
          )}
        </div>
      </PageWrapper>

      {/* Page 2: Health Metrics, Health by Category, Summary Statistics */}
      {page1Sections.length > 0 && (
        <PageWrapper pageNum={2}>
          {page1Sections.map(section => renderSection(section))}
        </PageWrapper>
      )}

      {/* Page 3: Subsection Details & QR Codes */}
      {page2Sections.length > 0 && (
        <PageWrapper pageNum={3}>
          {page2Sections.map(section => renderSection(section))}
        </PageWrapper>
      )}

      {/* Page 4: COC Validations */}
      {page3Sections.length > 0 && (
        <PageWrapper pageNum={4}>
          {page3Sections.map(section => renderSection(section))}
        </PageWrapper>
      )}

      {/* Page 5: Inspections */}
      {page4Sections.length > 0 && (
        <PageWrapper pageNum={5}>
          {page4Sections.map(section => renderSection(section))}
        </PageWrapper>
      )}

      {/* Debug info when no sections are grouped to pages */}
      {page1Sections.length === 0 && page2Sections.length === 0 && page3Sections.length === 0 && page4Sections.length === 0 && (
        <PageWrapper pageNum={2}>
          <div className="p-4 border border-dashed border-orange-300 bg-orange-50 rounded">
            <h3 className="font-bold text-orange-700 mb-2">⚠️ No sections enabled</h3>
            <p className="text-orange-600 text-sm">
              Enable sections in the template configuration to see the preview.
              <br />
              Available sections: {sections.map(s => s.id).join(', ')}
            </p>
          </div>
        </PageWrapper>
      )}
    </div>
  );
};
