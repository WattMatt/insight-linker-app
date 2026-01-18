/**
 * Full Site Summary Preview - TRUE WYSIWYG
 * Uses shared siteSummaryRenderSpec.ts for exact matching with PDF output.
 */
import React from "react";
import { ReportSection, ReportCustomization } from "@/components/pdf-editor/types";
import { cn } from "@/lib/utils";
import { QrCode, Building2 } from "lucide-react";
import { SampleSubsection, SampleKPIs } from "@/hooks/useSampleReportData";
import {
  LAYOUT,
  HEALTH_METRICS_CARDS,
  SUMMARY_STAT_ROWS,
  getAccentPalette,
  getSectionTitle,
  getEnabledSections,
  matchesSectionId,
  calculateMetrics,
  SubsectionData,
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
}) => {
  const accentPalette = getAccentPalette(customization.accentColor || 'blue');
  const colors = { primary: accentPalette.primary, light: accentPalette.light, text: accentPalette.dark };

  // Convert sample subsections to spec format
  const subsectionData: SubsectionData[] = (subsections || []).map(sub => ({
    id: sub.id,
    name: sub.name,
    category: sub.category || 'LS',
    cocStatus: sub.cocStatus,
    meteringStatus: sub.cocStatus === 'Pass' ? 'Installed' : 'Unknown',
    meterSerialNumber: sub.cocStatus === 'Pass' ? '35778057' : null,
    ctRatio: '100/5A',
    snagCount: sub.cocStatus === 'Pass' ? 0 : 2,
    isCompliant: sub.cocStatus === 'Pass',
  }));

  // Calculate metrics
  const metrics = calculateMetrics(subsectionData, kpis?.cocRequired, kpis?.snagOpen);
  if (kpis) {
    metrics.subsectionCount = kpis.totalSubsections || metrics.subsectionCount;
    metrics.cocCompliant = kpis.cocPass || metrics.cocCompliant;
    metrics.overallHealth = metrics.subsectionCount > 0 ? Math.round((metrics.cocCompliant / metrics.subsectionCount) * 100) : 0;
  }

  const enabledSections = getEnabledSections(sections || []);
  const scale = (pt: number) => pt * zoom;

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

  // Render section
  const renderSection = (section: ReportSection) => {
    if (!section.enabled) return null;
    const title = getSectionTitle(section);

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

    if (matchesSectionId(section, 'subsection-details')) {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <SectionHeader title={title} withBorder />
          <div className="space-y-3">
            {subsectionData.slice(0, 4).map(sub => (
              <div key={sub.id} className="border rounded p-3" style={{ fontSize: scale(9) }}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <PlaceholderBadge className="font-bold" style={{ color: colors.primary }}>{sub.name}</PlaceholderBadge>
                    <div style={{ fontSize: scale(8), color: STATUS_COLORS.muted }}>Category: {getCategoryAbbreviation(sub.category || 'Other')}</div>
                  </div>
                  <div className="bg-gray-100 rounded flex items-center justify-center" style={{ width: scale(55), height: scale(55) }}>
                    <QrCode style={{ width: scale(24), height: scale(24) }} className="text-gray-400" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1 text-gray-600">
                  <div>COC Status: <PlaceholderBadge style={{ color: sub.isCompliant ? STATUS_COLORS.success : STATUS_COLORS.muted }}>{sub.cocStatus || 'Not Set'}</PlaceholderBadge></div>
                  <div>Snags: <PlaceholderBadge style={{ color: sub.snagCount > 0 ? STATUS_COLORS.error : STATUS_COLORS.success }}>{sub.snagCount}</PlaceholderBadge></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

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

      {/* Content Pages */}
      <PageWrapper pageNum={2}>
        {enabledSections.slice(0, 3).map(section => renderSection(section))}
      </PageWrapper>

      {enabledSections.find(s => matchesSectionId(s, 'subsection-details')) && (
        <PageWrapper pageNum={3}>
          {renderSection(enabledSections.find(s => matchesSectionId(s, 'subsection-details'))!)}
        </PageWrapper>
      )}
    </div>
  );
};
