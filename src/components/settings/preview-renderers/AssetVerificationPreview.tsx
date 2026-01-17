// Asset Verification Report Preview - Matches actual PDF output
import React from "react";
import { ReportSection } from "@/components/pdf-editor/types";
import { cn } from "@/lib/utils";
import { Package, Zap, Droplet, CheckCircle, AlertTriangle } from "lucide-react";

interface AssetVerificationPreviewProps {
  section: ReportSection;
  zoom: number;
  colors: { primary: string; light: string; text: string };
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

export const AssetVerificationPreview: React.FC<AssetVerificationPreviewProps> = ({
  section,
  zoom,
  colors,
}) => {
  // ===== ASSET SUMMARY - KPI Row =====
  if (section.id === "asset-summary") {
    const kpiItems = section.kpiItems || [
      { id: "total", label: "Total Assets", field: "totalAssets", visible: true, color: "blue" },
      { id: "verified", label: "Verified", field: "cocPass", visible: true, color: "green" },
      { id: "pending", label: "Pending", field: "cocPending", visible: true, color: "orange" },
    ];

    const getKPIColor = (color?: string): string => {
      switch (color) {
        case "green": return "#16a34a";
        case "orange": return "#ea580c";
        case "blue": return "#2563eb";
        case "red": return "#dc2626";
        case "purple": return "#9333ea";
        default: return colors.primary;
      }
    };

    const values = { totalAssets: 45, cocPass: 38, cocPending: 7 };

    return (
      <div className="grid grid-cols-3 gap-2" style={{ marginTop: 8 * zoom }}>
        {kpiItems.filter(k => k.visible !== false).map((kpi) => (
          <div
            key={kpi.id}
            className="p-2 rounded text-center"
            style={{ 
              backgroundColor: `${getKPIColor(kpi.color)}10`,
              border: `1px solid ${getKPIColor(kpi.color)}20`
            }}
          >
            <PlaceholderBadge>
              <div 
                className="font-bold"
                style={{ fontSize: 14 * zoom, color: getKPIColor(kpi.color) }}
              >
                {(values as any)[kpi.field] || 0}
              </div>
            </PlaceholderBadge>
            <div 
              className="text-muted-foreground truncate"
              style={{ fontSize: 8 * zoom }}
            >
              {kpi.label}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ===== ELECTRICAL METERS TABLE =====
  if (section.id === "electrical-meters") {
    const columns = section.columns || [
      { id: "serial", label: "Serial Number", field: "serial", visible: true },
      { id: "premises", label: "Premises ID", field: "premises", visible: true },
      { id: "trade", label: "Trade As", field: "trade", visible: true },
      { id: "breaker", label: "Breaker Size", field: "breaker", visible: true },
      { id: "ct", label: "CT Ratio", field: "ct", visible: true },
    ];

    const visibleColumns = columns.filter(c => c.visible !== false);
    const meters = [
      { serial: "35778057", premises: "BULK METER", trade: "BULK SUPPLY", breaker: "1000A", ct: "1000/5A" },
      { serial: "35778055", premises: "SHOP 050", trade: "SHOPRITE", breaker: "800A", ct: "800/5A" },
      { serial: "36084016", premises: "SHOP 004", trade: "ACKERMANS", breaker: "63A", ct: "—" },
    ];

    return (
      <div style={{ marginTop: 8 * zoom }}>
        <div className="flex items-center gap-1 mb-1" style={{ fontSize: 8 * zoom }}>
          <Zap style={{ width: 10 * zoom, height: 10 * zoom }} className="text-yellow-600" />
          <span className="font-medium">Electrical Meters</span>
        </div>
        <div 
          className="flex p-1 rounded-t font-medium"
          style={{ 
            backgroundColor: colors.light, 
            color: colors.text,
            fontSize: 7 * zoom 
          }}
        >
          {visibleColumns.map(col => (
            <span key={col.id} className="flex-1 truncate">{col.label}</span>
          ))}
        </div>
        {meters.map((meter, i) => (
          <div 
            key={i} 
            className="flex p-1 border-b border-muted/30"
            style={{ fontSize: 7 * zoom }}
          >
            {visibleColumns.map(col => (
              <PlaceholderBadge key={col.id} className="flex-1 truncate">
                {(meter as any)[col.field]}
              </PlaceholderBadge>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ===== WATER METERS TABLE =====
  if (section.id === "water-meters") {
    const columns = section.columns || [
      { id: "serial", label: "Serial Number", field: "serial", visible: true },
      { id: "premises", label: "Premises ID", field: "premises", visible: true },
      { id: "trade", label: "Trade As", field: "trade", visible: true },
      { id: "type", label: "Meter Type", field: "type", visible: true },
    ];

    const visibleColumns = columns.filter(c => c.visible !== false);
    const meters = [
      { serial: "WM-001234", premises: "SHOP 001", trade: "RUSSELS", type: "20mm" },
      { serial: "WM-001235", premises: "SHOP 002", trade: "NB CELLULAR", type: "15mm" },
    ];

    return (
      <div style={{ marginTop: 8 * zoom }}>
        <div className="flex items-center gap-1 mb-1" style={{ fontSize: 8 * zoom }}>
          <Droplet style={{ width: 10 * zoom, height: 10 * zoom }} className="text-blue-600" />
          <span className="font-medium">Water Meters</span>
        </div>
        <div 
          className="flex p-1 rounded-t font-medium"
          style={{ 
            backgroundColor: colors.light, 
            color: colors.text,
            fontSize: 7 * zoom 
          }}
        >
          {visibleColumns.map(col => (
            <span key={col.id} className="flex-1 truncate">{col.label}</span>
          ))}
        </div>
        {meters.map((meter, i) => (
          <div 
            key={i} 
            className="flex p-1 border-b border-muted/30"
            style={{ fontSize: 7 * zoom }}
          >
            {visibleColumns.map(col => (
              <PlaceholderBadge key={col.id} className="flex-1 truncate">
                {(meter as any)[col.field]}
              </PlaceholderBadge>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ===== EQUIPMENT TABLE =====
  if (section.id === "equipment") {
    return (
      <div style={{ marginTop: 8 * zoom }}>
        <div className="flex items-center gap-1 mb-1" style={{ fontSize: 8 * zoom }}>
          <Package style={{ width: 10 * zoom, height: 10 * zoom }} className="text-purple-600" />
          <span className="font-medium">Other Equipment</span>
        </div>
        <div className="text-center py-3 text-muted-foreground italic" style={{ fontSize: 7 * zoom }}>
          Additional equipment assets will be listed here
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="text-center py-4 text-muted-foreground" style={{ fontSize: 9 * zoom }}>
      <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <div>Section: {section.title}</div>
    </div>
  );
};
