/**
 * Compliance Preview Renderer
 * Renders compliance report preview using UNIFIED site data
 * 
 * Uses template configuration for section visibility and formatting
 */
import React from "react";
import { ReportSection, ReportCustomization } from "@/components/pdf-editor/types";
import { UnifiedSubsection, UnifiedCocValidation, UnifiedKPIs } from "@/hooks/useUnifiedSiteData";
import { cn } from "@/lib/utils";
import { Shield, AlertCircle, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

interface CompliancePreviewRendererProps {
  sections: ReportSection[];
  customization: ReportCustomization;
  zoom: number;
  colors: { primary: string; light: string; text: string };
  siteName: string;
  clientName: string;
  subsections: UnifiedSubsection[];
  cocValidations: UnifiedCocValidation[];
  kpis: UnifiedKPIs;
}

const PlaceholderBadge: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className, style }) => (
  <span 
    className={cn("inline-block border border-dashed border-amber-400/60 bg-amber-50/40 rounded px-1 py-px", className)}
    style={style}
    title="Sample data - will be replaced with actual values"
  >
    {children}
  </span>
);

const EmptySectionPlaceholder: React.FC<{ sectionName: string }> = ({ sectionName }) => (
  <div className="flex items-center gap-2 p-4 border border-dashed border-gray-300 rounded bg-gray-50 text-muted-foreground italic">
    <AlertCircle className="w-4 h-4" />
    <span>No data available for {sectionName}</span>
  </div>
);

export const CompliancePreviewRenderer: React.FC<CompliancePreviewRendererProps> = ({
  sections,
  customization,
  zoom,
  colors,
  siteName,
  clientName,
  subsections,
  cocValidations,
  kpis,
}) => {
  const scale = (pt: number) => pt * zoom;
  
  const enabledSections = sections.filter(s => s.enabled).sort((a, b) => a.order - b.order);

  const getStatusColor = (status: 'success' | 'warning' | 'error' | 'muted') => {
    const colorMap = { success: '#16a34a', warning: '#ea580c', error: '#dc2626', muted: '#6b7280' };
    return colorMap[status];
  };

  // Find subsections with expiring COCs (within 90 days)
  const expiringCocs = subsections.filter(s => {
    if (!s.cocIssueDate) return false;
    const issueDate = new Date(s.cocIssueDate);
    const expiryDate = new Date(issueDate);
    expiryDate.setFullYear(expiryDate.getFullYear() + 2); // Assume 2 year validity
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry > 0 && daysUntilExpiry <= 90;
  });

  // Find non-compliant subsections
  const nonCompliant = subsections.filter(s => s.cocStatus === 'Missing' || s.cocStatus === 'Fail' || (!s.cocStatus && s.isCocRequired !== false));

  const renderSection = (section: ReportSection) => {
    if (!section.enabled) return null;

    // Compliance Summary (KPIs)
    if (section.id === 'compliance-summary') {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <h3 style={{ fontSize: scale(12), fontWeight: 'bold', color: colors.primary, marginBottom: scale(8), borderBottom: `2px solid ${colors.primary}`, paddingBottom: scale(4) }}>
            {section.title}
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-3 rounded" style={{ backgroundColor: `${colors.primary}10`, border: `1px solid ${colors.primary}30` }}>
              <PlaceholderBadge><span style={{ fontSize: scale(16), fontWeight: 'bold', color: colors.primary }}>{kpis.totalSubsections}</span></PlaceholderBadge>
              <div style={{ fontSize: scale(8), color: '#6b7280', marginTop: scale(2) }}>Total Subsections</div>
            </div>
            <div className="text-center p-3 rounded" style={{ backgroundColor: '#16a34a10', border: '1px solid #16a34a30' }}>
              <PlaceholderBadge><span style={{ fontSize: scale(16), fontWeight: 'bold', color: '#16a34a' }}>{kpis.cocPass}</span></PlaceholderBadge>
              <div style={{ fontSize: scale(8), color: '#6b7280', marginTop: scale(2) }}>Compliant</div>
            </div>
            <div className="text-center p-3 rounded" style={{ backgroundColor: '#dc262610', border: '1px solid #dc262630' }}>
              <PlaceholderBadge><span style={{ fontSize: scale(16), fontWeight: 'bold', color: '#dc2626' }}>{kpis.cocMissing}</span></PlaceholderBadge>
              <div style={{ fontSize: scale(8), color: '#6b7280', marginTop: scale(2) }}>Non-Compliant</div>
            </div>
            <div className="text-center p-3 rounded" style={{ backgroundColor: '#9333ea10', border: '1px solid #9333ea30' }}>
              <PlaceholderBadge><span style={{ fontSize: scale(16), fontWeight: 'bold', color: '#9333ea' }}>{kpis.complianceRate}%</span></PlaceholderBadge>
              <div style={{ fontSize: scale(8), color: '#6b7280', marginTop: scale(2) }}>Compliance Rate</div>
            </div>
          </div>
        </div>
      );
    }

    // COC Status by Site
    if (section.id === 'coc-status') {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <h3 style={{ fontSize: scale(12), fontWeight: 'bold', color: colors.primary, marginBottom: scale(8) }}>
            {section.title}
          </h3>
          {subsections.length > 0 ? (
            <table className="w-full border-collapse" style={{ fontSize: scale(8) }}>
              <thead>
                <tr style={{ backgroundColor: colors.light }}>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Shop Name</th>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Tenant</th>
                  <th className="border px-2 py-1 text-center" style={{ color: colors.text }}>COC Status</th>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>COC Number</th>
                </tr>
              </thead>
              <tbody>
                {subsections.slice(0, 10).map((sub, i) => (
                  <tr key={sub.id} style={{ backgroundColor: i % 2 === 1 ? colors.light : 'transparent' }}>
                    <td className="border px-2 py-1"><PlaceholderBadge>{sub.name}</PlaceholderBadge></td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{sub.tenantName || '-'}</PlaceholderBadge></td>
                    <td className="border px-2 py-1 text-center">
                      <PlaceholderBadge style={{ 
                        color: sub.cocStatus === 'Pass' ? getStatusColor('success') : 
                               sub.cocStatus === 'Pending' ? getStatusColor('warning') : 
                               sub.cocStatus === 'N/A' ? getStatusColor('muted') : getStatusColor('error')
                      }}>
                        {sub.cocStatus || 'Missing'}
                      </PlaceholderBadge>
                    </td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{sub.cocNumber || '-'}</PlaceholderBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptySectionPlaceholder sectionName="COC Status" />
          )}
          {subsections.length > 10 && (
            <div className="text-center text-muted-foreground text-xs italic mt-2">
              ...and {subsections.length - 10} more subsections
            </div>
          )}
        </div>
      );
    }

    // Expiring Certificates
    if (section.id === 'expiring-cocs') {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <h3 style={{ fontSize: scale(12), fontWeight: 'bold', color: colors.primary, marginBottom: scale(8) }}>
            {section.title}
          </h3>
          {expiringCocs.length > 0 ? (
            <div className="space-y-2">
              {expiringCocs.slice(0, 5).map(sub => (
                <div key={sub.id} className="flex items-center gap-3 p-2 border rounded" style={{ backgroundColor: '#fef3c710' }}>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <div className="flex-1">
                    <PlaceholderBadge className="font-medium">{sub.name}</PlaceholderBadge>
                    <div className="text-xs text-muted-foreground">
                      COC: <PlaceholderBadge>{sub.cocNumber}</PlaceholderBadge>
                    </div>
                  </div>
                  <div className="text-xs text-amber-600">Expiring soon</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground italic flex items-center justify-center gap-2" style={{ fontSize: scale(9) }}>
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              No certificates expiring within 90 days
            </div>
          )}
        </div>
      );
    }

    // Non-Compliant Items
    if (section.id === 'non-compliant') {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <h3 style={{ fontSize: scale(12), fontWeight: 'bold', color: colors.primary, marginBottom: scale(8) }}>
            {section.title}
          </h3>
          {nonCompliant.length > 0 ? (
            <div className="space-y-2">
              {nonCompliant.slice(0, 5).map(sub => (
                <div key={sub.id} className="flex items-center gap-3 p-2 border rounded" style={{ backgroundColor: '#fee2e210' }}>
                  <XCircle className="w-4 h-4 text-red-500" />
                  <div className="flex-1">
                    <PlaceholderBadge className="font-medium">{sub.name}</PlaceholderBadge>
                    <div className="text-xs text-muted-foreground">
                      Tenant: <PlaceholderBadge>{sub.tenantName || 'N/A'}</PlaceholderBadge>
                    </div>
                  </div>
                  <div className="text-xs text-red-600">{sub.cocStatus || 'Missing COC'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground italic flex items-center justify-center gap-2" style={{ fontSize: scale(9) }}>
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              All subsections are compliant
            </div>
          )}
          {nonCompliant.length > 5 && (
            <div className="text-center text-muted-foreground text-xs italic mt-2">
              ...and {nonCompliant.length - 5} more non-compliant items
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-4">
      {/* Cover Page */}
      <div 
        className="bg-white shadow-lg mx-auto relative overflow-hidden"
        style={{ 
          width: scale(595), 
          minHeight: scale(842), 
          padding: `${scale(60)}px ${scale(50)}px` 
        }}
      >
        {/* Header accent */}
        <div 
          className="absolute top-0 left-0 right-0" 
          style={{ height: scale(8), backgroundColor: colors.primary }}
        />
        
        {/* Cover content */}
        <div className="h-full flex flex-col justify-center items-center text-center">
          <Shield className="mb-6" style={{ width: scale(60), height: scale(60), color: colors.primary }} />
          <h1 style={{ fontSize: scale(24), fontWeight: 'bold', color: colors.primary, marginBottom: scale(12) }}>
            {customization.coverTitle || 'Compliance Report'}
          </h1>
          <h2 style={{ fontSize: scale(14), color: '#6b7280', marginBottom: scale(32) }}>
            {customization.coverSubtitle || 'Regulatory Compliance Overview'}
          </h2>
          <div style={{ fontSize: scale(14), color: '#374151' }}>
            <PlaceholderBadge className="font-medium">{siteName}</PlaceholderBadge>
          </div>
          <div style={{ fontSize: scale(12), color: '#6b7280', marginTop: scale(8) }}>
            <PlaceholderBadge>{clientName}</PlaceholderBadge>
          </div>
          {customization.includeDate && (
            <div style={{ fontSize: scale(11), color: '#9ca3af', marginTop: scale(24) }}>
              {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          )}
        </div>
      </div>

      {/* Content Pages */}
      <div 
        className="bg-white shadow-lg mx-auto"
        style={{ 
          width: scale(595), 
          minHeight: scale(842), 
          padding: `${scale(50)}px ${scale(50)}px` 
        }}
      >
        {/* Page header */}
        <div className="flex justify-between items-center border-b pb-2 mb-4" style={{ fontSize: scale(8), color: '#9ca3af' }}>
          <span>Compliance Report</span>
          <span>CONFIDENTIAL</span>
        </div>

        {/* Render all enabled sections */}
        {enabledSections.map(section => renderSection(section))}

        {/* Page footer */}
        {customization.includePageNumbers && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-between px-12" style={{ fontSize: scale(8), color: '#9ca3af' }}>
            <span>CONFIDENTIAL</span>
            <span>Page 2</span>
            <span>{new Date().toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompliancePreviewRenderer;
