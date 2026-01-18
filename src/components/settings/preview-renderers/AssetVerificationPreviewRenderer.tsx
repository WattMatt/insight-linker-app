/**
 * Asset Verification Preview Renderer
 * Renders asset verification report preview using UNIFIED site data
 * 
 * Uses template configuration for section visibility and formatting
 */
import React from "react";
import { ReportSection, ReportCustomization } from "@/components/pdf-editor/types";
import { UnifiedAsset, UnifiedSubsection, UnifiedKPIs } from "@/hooks/useUnifiedSiteData";
import { cn } from "@/lib/utils";
import { Package, AlertCircle, CheckCircle2, XCircle, Clock } from "lucide-react";

interface AssetVerificationPreviewRendererProps {
  sections: ReportSection[];
  customization: ReportCustomization;
  zoom: number;
  colors: { primary: string; light: string; text: string };
  siteName: string;
  clientName: string;
  assets: UnifiedAsset[];
  subsections: UnifiedSubsection[];
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

export const AssetVerificationPreviewRenderer: React.FC<AssetVerificationPreviewRendererProps> = ({
  sections,
  customization,
  zoom,
  colors,
  siteName,
  clientName,
  assets,
  subsections,
  kpis,
}) => {
  const scale = (pt: number) => pt * zoom;
  
  const enabledSections = sections.filter(s => s.enabled).sort((a, b) => a.order - b.order);
  
  // Filter assets by category
  const electricalMeters = assets.filter(a => a.assetCategory === 'electrical_meter' || a.assetCategory === 'electricity_meter');
  const waterMeters = assets.filter(a => a.assetCategory === 'water_meter');
  const equipment = assets.filter(a => !['electrical_meter', 'electricity_meter', 'water_meter'].includes(a.assetCategory));

  const getStatusColor = (status: 'success' | 'warning' | 'error' | 'muted') => {
    const colorMap = { success: '#16a34a', warning: '#ea580c', error: '#dc2626', muted: '#6b7280' };
    return colorMap[status];
  };

  const renderSection = (section: ReportSection) => {
    if (!section.enabled) return null;

    // Asset Summary (KPIs)
    if (section.id === 'asset-summary') {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <h3 style={{ fontSize: scale(12), fontWeight: 'bold', color: colors.primary, marginBottom: scale(8), borderBottom: `2px solid ${colors.primary}`, paddingBottom: scale(4) }}>
            {section.title}
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-3 rounded" style={{ backgroundColor: `${colors.primary}10`, border: `1px solid ${colors.primary}30` }}>
              <PlaceholderBadge><span style={{ fontSize: scale(16), fontWeight: 'bold', color: colors.primary }}>{kpis.totalAssets}</span></PlaceholderBadge>
              <div style={{ fontSize: scale(8), color: '#6b7280', marginTop: scale(2) }}>Total Assets</div>
            </div>
            <div className="text-center p-3 rounded" style={{ backgroundColor: '#16a34a10', border: '1px solid #16a34a30' }}>
              <PlaceholderBadge><span style={{ fontSize: scale(16), fontWeight: 'bold', color: '#16a34a' }}>{kpis.verifiedAssets}</span></PlaceholderBadge>
              <div style={{ fontSize: scale(8), color: '#6b7280', marginTop: scale(2) }}>Verified</div>
            </div>
            <div className="text-center p-3 rounded" style={{ backgroundColor: '#ea580c10', border: '1px solid #ea580c30' }}>
              <PlaceholderBadge><span style={{ fontSize: scale(16), fontWeight: 'bold', color: '#ea580c' }}>{kpis.pendingAssets}</span></PlaceholderBadge>
              <div style={{ fontSize: scale(8), color: '#6b7280', marginTop: scale(2) }}>Pending</div>
            </div>
            <div className="text-center p-3 rounded" style={{ backgroundColor: '#9333ea10', border: '1px solid #9333ea30' }}>
              <PlaceholderBadge><span style={{ fontSize: scale(16), fontWeight: 'bold', color: '#9333ea' }}>{Math.round((kpis.verifiedAssets / Math.max(kpis.totalAssets, 1)) * 100)}%</span></PlaceholderBadge>
              <div style={{ fontSize: scale(8), color: '#6b7280', marginTop: scale(2) }}>Verification Rate</div>
            </div>
          </div>
        </div>
      );
    }

    // Electrical Meters Table
    if (section.id === 'electrical-meters') {
      const meters = electricalMeters.length > 0 ? electricalMeters : assets.slice(0, 6);
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <h3 style={{ fontSize: scale(12), fontWeight: 'bold', color: colors.primary, marginBottom: scale(8) }}>
            {section.title}
          </h3>
          {meters.length > 0 ? (
            <table className="w-full border-collapse" style={{ fontSize: scale(8) }}>
              <thead>
                <tr style={{ backgroundColor: colors.light }}>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Serial Number</th>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Premises ID</th>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Trade As</th>
                  <th className="border px-2 py-1 text-center" style={{ color: colors.text }}>Breaker</th>
                  <th className="border px-2 py-1 text-center" style={{ color: colors.text }}>CT Ratio</th>
                </tr>
              </thead>
              <tbody>
                {meters.slice(0, 8).map((asset, i) => (
                  <tr key={asset.id} style={{ backgroundColor: i % 2 === 1 ? colors.light : 'transparent' }}>
                    <td className="border px-2 py-1"><PlaceholderBadge>{asset.meterSerialNumber || '-'}</PlaceholderBadge></td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{asset.premisesId}</PlaceholderBadge></td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{asset.tradeAs || '-'}</PlaceholderBadge></td>
                    <td className="border px-2 py-1 text-center"><PlaceholderBadge>{asset.breakerSize || '-'}</PlaceholderBadge></td>
                    <td className="border px-2 py-1 text-center"><PlaceholderBadge>{asset.ctRatio || '-'}</PlaceholderBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptySectionPlaceholder sectionName="Electrical Meters" />
          )}
        </div>
      );
    }

    // Water Meters Table
    if (section.id === 'water-meters') {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <h3 style={{ fontSize: scale(12), fontWeight: 'bold', color: colors.primary, marginBottom: scale(8) }}>
            {section.title}
          </h3>
          {waterMeters.length > 0 ? (
            <table className="w-full border-collapse" style={{ fontSize: scale(8) }}>
              <thead>
                <tr style={{ backgroundColor: colors.light }}>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Serial Number</th>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Premises ID</th>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Trade As</th>
                  <th className="border px-2 py-1 text-center" style={{ color: colors.text }}>Meter Type</th>
                </tr>
              </thead>
              <tbody>
                {waterMeters.slice(0, 5).map((asset, i) => (
                  <tr key={asset.id} style={{ backgroundColor: i % 2 === 1 ? colors.light : 'transparent' }}>
                    <td className="border px-2 py-1"><PlaceholderBadge>{asset.meterSerialNumber || '-'}</PlaceholderBadge></td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{asset.premisesId}</PlaceholderBadge></td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{asset.tradeAs || '-'}</PlaceholderBadge></td>
                    <td className="border px-2 py-1 text-center"><PlaceholderBadge>{asset.meterType || '-'}</PlaceholderBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-4 text-muted-foreground italic" style={{ fontSize: scale(9) }}>
              No water meters registered
            </div>
          )}
        </div>
      );
    }

    // Equipment Table
    if (section.id === 'equipment') {
      const equip = equipment.length > 0 ? equipment : [];
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <h3 style={{ fontSize: scale(12), fontWeight: 'bold', color: colors.primary, marginBottom: scale(8) }}>
            {section.title}
          </h3>
          {equip.length > 0 ? (
            <table className="w-full border-collapse" style={{ fontSize: scale(8) }}>
              <thead>
                <tr style={{ backgroundColor: colors.light }}>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Tag</th>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Category</th>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Location</th>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Comments</th>
                </tr>
              </thead>
              <tbody>
                {equip.slice(0, 5).map((asset, i) => (
                  <tr key={asset.id} style={{ backgroundColor: i % 2 === 1 ? colors.light : 'transparent' }}>
                    <td className="border px-2 py-1"><PlaceholderBadge>{asset.tag || '-'}</PlaceholderBadge></td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{asset.assetCategory}</PlaceholderBadge></td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{asset.premisesId}</PlaceholderBadge></td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{asset.comments || '-'}</PlaceholderBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-4 text-muted-foreground italic" style={{ fontSize: scale(9) }}>
              No additional equipment registered
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
          <Package className="mb-6" style={{ width: scale(60), height: scale(60), color: colors.primary }} />
          <h1 style={{ fontSize: scale(24), fontWeight: 'bold', color: colors.primary, marginBottom: scale(12) }}>
            {customization.coverTitle || 'Asset Verification Report'}
          </h1>
          <h2 style={{ fontSize: scale(14), color: '#6b7280', marginBottom: scale(32) }}>
            {customization.coverSubtitle || 'Asset Status Overview'}
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
          <span>Asset Verification Report</span>
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

export default AssetVerificationPreviewRenderer;
