// Asset Verification Report Preview - Uses actual reference project data
import React from "react";
import { ReportSection } from "@/components/pdf-editor/types";
import { cn } from "@/lib/utils";
import { Package, Zap, Droplet, CheckCircle, AlertTriangle, Camera } from "lucide-react";
import { SampleInspection, LineShopData } from "@/hooks/useSampleReportData";

interface AssetVerificationPreviewProps {
  section: ReportSection;
  zoom: number;
  colors: { primary: string; light: string; text: string };
  // Real data from reference project
  inspections?: SampleInspection[];
  kpis?: {
    totalAssets: number;
    totalSubsections: number;
  };
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

// Helper to extract all lineShops from inspections
const extractLineShops = (inspections?: SampleInspection[]): LineShopData[] => {
  if (!inspections) return [];
  
  const allShops: LineShopData[] = [];
  inspections.forEach(insp => {
    if (insp.lineShops) {
      allShops.push(...insp.lineShops);
    }
  });
  return allShops;
};

export const AssetVerificationPreview: React.FC<AssetVerificationPreviewProps> = ({
  section,
  zoom,
  colors,
  inspections,
  kpis,
}) => {
  // Extract actual meter data from inspections
  const lineShops = extractLineShops(inspections);
  const hasRealData = lineShops.length > 0;

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

    // Use real data if available
    const values = {
      totalAssets: hasRealData ? lineShops.length : (kpis?.totalAssets || 45),
      cocPass: hasRealData ? lineShops.filter(s => s.meterSerial).length : 38,
      cocPending: hasRealData ? lineShops.filter(s => !s.meterSerial).length : 7,
    };

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
            <div 
              className="font-bold"
              style={{ fontSize: 14 * zoom, color: getKPIColor(kpi.color) }}
            >
              {(values as any)[kpi.field] || 0}
            </div>
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

  // ===== ELECTRICAL METERS TABLE - Use real lineShops data =====
  if (section.id === "electrical-meters") {
    const columns = section.columns || [
      { id: "serial", label: "Serial Number", field: "meterSerial", visible: true },
      { id: "shop", label: "Shop Name", field: "shopName", visible: true },
      { id: "breaker", label: "Breaker Size", field: "breakerSize", visible: true },
      { id: "ct", label: "CT Ratio", field: "ctRatio", visible: true },
      { id: "cable", label: "Cable Size", field: "cableSize", visible: true },
    ];

    const visibleColumns = columns.filter(c => c.visible !== false);
    
    // Use actual data from inspections or fallback to sample
    const metersToShow = hasRealData 
      ? lineShops.slice(0, 6).map(shop => ({
          meterSerial: shop.meterSerial || '—',
          shopName: shop.shopName,
          shopNumber: shop.shopNumber || shop.shopName,
          breakerSize: shop.breakerSize || '—',
          ctRatio: shop.ctRatio || '—',
          cableSize: shop.cableSize || '—',
          hasPhoto: !!(shop.meterSerialImages && Object.keys(shop.meterSerialImages).length > 0),
        }))
      : [
          { meterSerial: "35778057", shopName: "BULK METER", shopNumber: "BULK", breakerSize: "1000A", ctRatio: "1000/5A", cableSize: "185mm", hasPhoto: false },
          { meterSerial: "35778055", shopName: "SHOPRITE", shopNumber: "050", breakerSize: "800A", ctRatio: "800/5A", cableSize: "120mm", hasPhoto: false },
          { meterSerial: "36084016", shopName: "ACKERMANS", shopNumber: "004", breakerSize: "63A", ctRatio: "—", cableSize: "16mm", hasPhoto: false },
        ];

    return (
      <div style={{ marginTop: 8 * zoom }}>
        <div className="flex items-center gap-1 mb-1" style={{ fontSize: 8 * zoom }}>
          <Zap style={{ width: 10 * zoom, height: 10 * zoom }} className="text-yellow-600" />
          <span className="font-medium">Electrical Meters</span>
          {hasRealData && (
            <span className="text-green-600 ml-2">({lineShops.length} from reference project)</span>
          )}
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
          <span style={{ width: 24 * zoom }}>📷</span>
        </div>
        {metersToShow.map((meter, i) => (
          <div 
            key={i} 
            className="flex p-1 border-b border-muted/30 items-center"
            style={{ fontSize: 7 * zoom }}
          >
            {visibleColumns.map(col => (
              <span key={col.id} className="flex-1 truncate">
                {(meter as any)[col.field] || '—'}
              </span>
            ))}
            <span style={{ width: 24 * zoom }}>
              {meter.hasPhoto && <Camera className="w-3 h-3 text-green-600" />}
            </span>
          </div>
        ))}
        {hasRealData && lineShops.length > 6 && (
          <div className="text-center py-1 text-muted-foreground" style={{ fontSize: 7 * zoom }}>
            +{lineShops.length - 6} more meters...
          </div>
        )}
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
