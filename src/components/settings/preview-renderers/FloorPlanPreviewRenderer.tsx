/**
 * Floor Plan Preview Renderer
 * Renders floor plan report preview using UNIFIED site data
 * 
 * Uses template configuration for section visibility and formatting
 */
import React from "react";
import { ReportSection, ReportCustomization } from "@/components/pdf-editor/types";
import { UnifiedFloorPlan, UnifiedKPIs } from "@/hooks/useUnifiedSiteData";
import { cn } from "@/lib/utils";
import { Map, AlertCircle, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

interface FloorPlanPreviewRendererProps {
  sections: ReportSection[];
  customization: ReportCustomization;
  zoom: number;
  colors: { primary: string; light: string; text: string };
  siteName: string;
  clientName: string;
  floorPlans: UnifiedFloorPlan[];
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

export const FloorPlanPreviewRenderer: React.FC<FloorPlanPreviewRendererProps> = ({
  sections,
  customization,
  zoom,
  colors,
  siteName,
  clientName,
  floorPlans,
  kpis,
}) => {
  const scale = (pt: number) => pt * zoom;
  
  const enabledSections = sections.filter(s => s.enabled).sort((a, b) => a.order - b.order);
  
  const getStatusColor = (status: 'success' | 'warning' | 'error' | 'muted') => {
    const colors = { success: '#16a34a', warning: '#ea580c', error: '#dc2626', muted: '#6b7280' };
    return colors[status];
  };

  const renderSection = (section: ReportSection) => {
    if (!section.enabled) return null;

    // Floor Plan Image section
    if (section.id === 'floor-plan-image') {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <h3 style={{ fontSize: scale(12), fontWeight: 'bold', color: colors.primary, marginBottom: scale(8) }}>
            {section.title}
          </h3>
          {floorPlans.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {floorPlans.slice(0, 2).map(fp => (
                <div key={fp.id} className="border rounded-lg p-3 bg-gray-50">
                  <div className="aspect-video bg-gray-200 rounded flex items-center justify-center mb-2">
                    <Map className="w-12 h-12 text-gray-400" />
                  </div>
                  <PlaceholderBadge className="font-medium block text-center">{fp.fileName}</PlaceholderBadge>
                  <div className="text-xs text-muted-foreground text-center mt-1">
                    {fp.subsectionName}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptySectionPlaceholder sectionName="Floor Plans" />
          )}
        </div>
      );
    }

    // Pins Summary (KPIs)
    if (section.id === 'pins-summary') {
      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <h3 style={{ fontSize: scale(12), fontWeight: 'bold', color: colors.primary, marginBottom: scale(8) }}>
            {section.title}
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-3 rounded" style={{ backgroundColor: `${colors.primary}10`, border: `1px solid ${colors.primary}30` }}>
              <PlaceholderBadge><span style={{ fontSize: scale(16), fontWeight: 'bold', color: colors.primary }}>{kpis.totalPins}</span></PlaceholderBadge>
              <div style={{ fontSize: scale(8), color: '#6b7280', marginTop: scale(2) }}>Total Pins</div>
            </div>
            <div className="text-center p-3 rounded" style={{ backgroundColor: '#ea580c10', border: '1px solid #ea580c30' }}>
              <PlaceholderBadge><span style={{ fontSize: scale(16), fontWeight: 'bold', color: '#ea580c' }}>{kpis.openPins}</span></PlaceholderBadge>
              <div style={{ fontSize: scale(8), color: '#6b7280', marginTop: scale(2) }}>Open</div>
            </div>
            <div className="text-center p-3 rounded" style={{ backgroundColor: '#16a34a10', border: '1px solid #16a34a30' }}>
              <PlaceholderBadge><span style={{ fontSize: scale(16), fontWeight: 'bold', color: '#16a34a' }}>{kpis.totalPins - kpis.openPins}</span></PlaceholderBadge>
              <div style={{ fontSize: scale(8), color: '#6b7280', marginTop: scale(2) }}>Resolved</div>
            </div>
            <div className="text-center p-3 rounded" style={{ backgroundColor: '#9333ea10', border: '1px solid #9333ea30' }}>
              <PlaceholderBadge><span style={{ fontSize: scale(16), fontWeight: 'bold', color: '#9333ea' }}>{kpis.totalFloorPlans}</span></PlaceholderBadge>
              <div style={{ fontSize: scale(8), color: '#6b7280', marginTop: scale(2) }}>Floor Plans</div>
            </div>
          </div>
        </div>
      );
    }

    // Pins Table
    if (section.id === 'pins-table') {
      const allPins = floorPlans.flatMap(fp => 
        Array.from({ length: Math.min(fp.pinCount, 3) }, (_, i) => ({
          id: `${fp.id}-pin-${i}`,
          number: i + 1,
          floorPlan: fp.fileName,
          type: i % 2 === 0 ? 'Snag' : 'Observation',
          status: i === 0 ? 'Open' : (i === 1 ? 'In Progress' : 'Resolved'),
          priority: i === 0 ? 'High' : 'Medium',
        }))
      ).slice(0, 8);

      return (
        <div key={section.id} style={{ marginBottom: scale(20) }}>
          <h3 style={{ fontSize: scale(12), fontWeight: 'bold', color: colors.primary, marginBottom: scale(8) }}>
            {section.title}
          </h3>
          {allPins.length > 0 ? (
            <table className="w-full border-collapse" style={{ fontSize: scale(8) }}>
              <thead>
                <tr style={{ backgroundColor: colors.light }}>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>#</th>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Floor Plan</th>
                  <th className="border px-2 py-1 text-left" style={{ color: colors.text }}>Type</th>
                  <th className="border px-2 py-1 text-center" style={{ color: colors.text }}>Status</th>
                  <th className="border px-2 py-1 text-center" style={{ color: colors.text }}>Priority</th>
                </tr>
              </thead>
              <tbody>
                {allPins.map((pin, i) => (
                  <tr key={pin.id} style={{ backgroundColor: i % 2 === 1 ? colors.light : 'transparent' }}>
                    <td className="border px-2 py-1"><PlaceholderBadge>{pin.number}</PlaceholderBadge></td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{pin.floorPlan}</PlaceholderBadge></td>
                    <td className="border px-2 py-1"><PlaceholderBadge>{pin.type}</PlaceholderBadge></td>
                    <td className="border px-2 py-1 text-center">
                      <PlaceholderBadge style={{ 
                        color: pin.status === 'Resolved' ? getStatusColor('success') : 
                               pin.status === 'In Progress' ? getStatusColor('warning') : getStatusColor('error')
                      }}>
                        {pin.status}
                      </PlaceholderBadge>
                    </td>
                    <td className="border px-2 py-1 text-center">
                      <PlaceholderBadge style={{ 
                        color: pin.priority === 'High' ? getStatusColor('error') : getStatusColor('warning')
                      }}>
                        {pin.priority}
                      </PlaceholderBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptySectionPlaceholder sectionName="Pin Details" />
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
          <Map className="mb-6" style={{ width: scale(60), height: scale(60), color: colors.primary }} />
          <h1 style={{ fontSize: scale(24), fontWeight: 'bold', color: colors.primary, marginBottom: scale(12) }}>
            {customization.coverTitle || 'Floor Plan Report'}
          </h1>
          <h2 style={{ fontSize: scale(14), color: '#6b7280', marginBottom: scale(32) }}>
            {customization.coverSubtitle || 'Annotation Summary'}
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
          <span>Floor Plan Report</span>
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

export default FloorPlanPreviewRenderer;
