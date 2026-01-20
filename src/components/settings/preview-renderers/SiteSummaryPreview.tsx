// Site Summary Report Preview - Matches actual PDF output
import React from "react";
import { ReportSection, KPIItem } from "@/components/pdf-editor/types";
import { cn } from "@/lib/utils";
import { Database, QrCode, Building2, FileCheck, ClipboardCheck, CheckCircle2, Circle } from "lucide-react";

interface SiteSummaryPreviewProps {
  section: ReportSection;
  zoom: number;
  colors: { primary: string; light: string; text: string };
  sampleData: {
    subsections: any[];
    kpis: {
      totalSubsections: number;
      cocPass: number;
      cocMissing: number;
      cocPending: number;
      complianceRate: number;
      totalAssets: number;
    };
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

export const SiteSummaryPreview: React.FC<SiteSummaryPreviewProps> = ({
  section,
  zoom,
  colors,
  sampleData,
}) => {
  const kpis = sampleData.kpis;
  const subsections = sampleData.subsections;

  // ===== HEALTH METRICS - KPI Row =====
  if (section.id === "health-metrics" || section.id === "compliance") {
    const kpiItems = section.kpiItems || [
      { id: "health", label: "Overall Health", field: "overallHealth", visible: true, color: "green" },
      { id: "coc", label: "COC Compliance", field: "cocCompliance", visible: true, color: "orange" },
      { id: "metering", label: "Metering Data", field: "meteringData", visible: true, color: "blue" },
      { id: "snags", label: "Snag Free", field: "snagFree", visible: true, color: "red" },
    ];

    const getKPIValue = (field: string): string => {
      switch (field) {
        case "overallHealth": return `${Math.round((kpis.cocPass / (kpis.totalSubsections || 1)) * 100)}%`;
        case "cocCompliance": return `${kpis.complianceRate}%`;
        case "meteringData": return "87%";
        case "snagFree": return "92%";
        default: return "—";
      }
    };

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

    return (
      <div className="grid grid-cols-4 gap-2" style={{ marginTop: 8 * zoom }}>
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
                {getKPIValue(kpi.field)}
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

  // ===== HEALTH BY CATEGORY - Category KPIs =====
  if (section.id === "health-by-category") {
    const categories = ["Line Shop", "Anchor", "ATM", "Kiosk"];
    return (
      <div className="grid grid-cols-4 gap-2" style={{ marginTop: 8 * zoom }}>
        {categories.map((cat, i) => (
          <div
            key={cat}
            className="p-2 rounded text-center"
            style={{ backgroundColor: colors.light }}
          >
            <PlaceholderBadge>
              <div 
                className="font-bold"
                style={{ fontSize: 14 * zoom, color: colors.primary }}
              >
                {[72, 85, 100, 60][i]}%
              </div>
            </PlaceholderBadge>
            <div 
              className="text-muted-foreground truncate"
              style={{ fontSize: 8 * zoom }}
            >
              {cat}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ===== SUMMARY STATISTICS - Info Table =====
  if (section.id === "summary-statistics" || section.id === "site-info") {
    const stats = [
      ["Total Subsections", kpis.totalSubsections.toString()],
      ["COC Required", Math.round(kpis.totalSubsections * 0.85).toString()],
      ["COC Compliant", kpis.cocPass.toString()],
      ["Metering Installed", Math.round(kpis.totalSubsections * 0.87).toString()],
      ["Open Snags", "12"],
      ["Overall Health Rate", `${kpis.complianceRate}%`],
    ];

    return (
      <div className="space-y-1" style={{ marginTop: 8 * zoom }}>
        {stats.map(([label, value], i) => (
          <div 
            key={i} 
            className="flex justify-between py-1 border-b border-muted/30"
            style={{ fontSize: 9 * zoom }}
          >
            <span className="text-muted-foreground">{label}</span>
            <PlaceholderBadge>
              <span className="font-medium">{value}</span>
            </PlaceholderBadge>
          </div>
        ))}
      </div>
    );
  }

  // ===== SUBSECTION DETAILS - Cards with QR Codes =====
  if (section.id === "subsection-details" || section.id === "subsections") {
    const displaySubs = subsections.slice(0, 3);
    return (
      <div className="space-y-2" style={{ marginTop: 8 * zoom }}>
        {displaySubs.map((sub, i) => (
          <div 
            key={i} 
            className="border border-muted/50 rounded p-2"
            style={{ fontSize: 8 * zoom }}
          >
            <div className="flex justify-between items-start mb-1">
              <div>
                <PlaceholderBadge className="font-semibold text-primary">
                  {sub.name}
                </PlaceholderBadge>
                <div className="text-muted-foreground" style={{ fontSize: 7 * zoom }}>
                  Category: {sub.category || "LS"}
                </div>
              </div>
              <div 
                className="w-8 h-8 bg-muted/30 rounded flex items-center justify-center"
                title="QR Code"
              >
                <QrCode style={{ width: 14 * zoom, height: 14 * zoom }} className="text-muted-foreground" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 text-muted-foreground">
              <div>COC: <PlaceholderBadge>{sub.cocStatus || "Pass"}</PlaceholderBadge></div>
              <div>Breaker: <PlaceholderBadge>60A</PlaceholderBadge></div>
              <div>Metering: <PlaceholderBadge>Installed</PlaceholderBadge></div>
              <div>S/N: <PlaceholderBadge>12345678</PlaceholderBadge></div>
              <div>Snags: <PlaceholderBadge>0</PlaceholderBadge></div>
              <div>Compliant: <PlaceholderBadge className="text-green-600">✓</PlaceholderBadge></div>
            </div>
          </div>
        ))}
        {subsections.length > 3 && (
          <div className="text-center text-muted-foreground italic" style={{ fontSize: 7 * zoom }}>
            + {subsections.length - 3} more subsections...
          </div>
        )}
      </div>
    );
  }

  // ===== COC VALIDATIONS - Data Table =====
  if (section.id === "coc-validations" || section.id === "documents") {
    const columns = section.columns || [
      { id: "subsection", label: "Subsection", field: "subsection", visible: true },
      { id: "cocNumber", label: "COC Number", field: "cocNumber", visible: true },
      { id: "status", label: "Status", field: "status", visible: true },
      { id: "date", label: "Date", field: "date", visible: true },
    ];

    const visibleColumns = columns.filter(c => c.visible !== false);
    const sampleRows = [
      { subsection: "SHOP 001", cocNumber: "COC-2026-0012", status: "Pass", date: "12 Jan 2026" },
      { subsection: "SHOP 002", cocNumber: "COC-2026-0015", status: "Fail", date: "10 Jan 2026" },
      { subsection: "SHOP 003", cocNumber: "COC-2025-0089", status: "Pass", date: "05 Jan 2026" },
    ];

    return (
      <div style={{ marginTop: 8 * zoom }}>
        <div 
          className="flex p-1 rounded-t font-medium"
          style={{ 
            backgroundColor: colors.light, 
            color: colors.text,
            fontSize: 8 * zoom 
          }}
        >
          {visibleColumns.map(col => (
            <span key={col.id} className="flex-1 truncate">{col.label}</span>
          ))}
        </div>
        {sampleRows.map((row, i) => (
          <div 
            key={i} 
            className="flex p-1 border-b border-muted/30"
            style={{ fontSize: 8 * zoom }}
          >
            {visibleColumns.map(col => (
              <PlaceholderBadge key={col.id} className="flex-1 truncate">
                {col.field === "status" ? (
                  <span className={row.status === "Pass" ? "text-green-600" : "text-red-600"}>
                    {row.status}
                  </span>
                ) : (
                  (row as any)[col.field]
                )}
              </PlaceholderBadge>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ===== QR CODES SECTION =====
  if (section.id === "subsection-qr-codes") {
    return (
      <div className="text-center py-4" style={{ fontSize: 9 * zoom }}>
        <div className="flex justify-center gap-3 mb-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-12 h-12 bg-muted/30 rounded flex items-center justify-center">
              <QrCode style={{ width: 20 * zoom, height: 20 * zoom }} className="text-muted-foreground" />
            </div>
          ))}
        </div>
        <span className="text-muted-foreground italic">
          QR codes embedded in subsection cards
        </span>
      </div>
    );
  }

  // ===== INSPECTIONS TABLE =====
  if (section.id === "inspections") {
    const columns = section.columns || [
      { id: "title", label: "Title", field: "title", visible: true },
      { id: "status", label: "Status", field: "status", visible: true },
      { id: "inspector", label: "Inspector", field: "inspector", visible: true },
      { id: "date", label: "Date", field: "date", visible: true },
    ];

    const visibleColumns = columns.filter(c => c.visible !== false);
    const sampleRows = [
      { title: "Electrical Inspection", status: "Completed", inspector: "John Smith", date: "15 Jan 2026" },
      { title: "Fire Safety Check", status: "In Progress", inspector: "Jane Doe", date: "14 Jan 2026" },
    ];

    return (
      <div style={{ marginTop: 8 * zoom }}>
        <div 
          className="flex p-1 rounded-t font-medium"
          style={{ 
            backgroundColor: colors.light, 
            color: colors.text,
            fontSize: 8 * zoom 
          }}
        >
          {visibleColumns.map(col => (
            <span key={col.id} className="flex-1 truncate">{col.label}</span>
          ))}
        </div>
        {sampleRows.map((row, i) => (
          <div 
            key={i} 
            className="flex p-1 border-b border-muted/30"
            style={{ fontSize: 8 * zoom }}
          >
            {visibleColumns.map(col => (
              <PlaceholderBadge key={col.id} className="flex-1 truncate">
                {(row as any)[col.field]}
              </PlaceholderBadge>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ===== ASSET VERIFICATION SECTION =====
  if (section.id === "asset-verification" || section.id === "asset-summary") {
    const assetKpis = [
      { label: "Electrical Meters", value: kpis.totalAssets.toString(), color: "#2563eb" },
      { label: "Verified", value: Math.round(kpis.totalAssets * 0.7).toString(), color: "#16a34a" },
      { label: "Discrepancies", value: Math.round(kpis.totalAssets * 0.15).toString(), color: "#ea580c" },
      { label: "Pending", value: Math.round(kpis.totalAssets * 0.15).toString(), color: "#6b7280" },
    ];

    return (
      <div style={{ marginTop: 8 * zoom }}>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {assetKpis.map((kpi, i) => (
            <div
              key={i}
              className="p-2 rounded text-center"
              style={{ 
                backgroundColor: `${kpi.color}10`,
                border: `1px solid ${kpi.color}20`
              }}
            >
              <PlaceholderBadge>
                <div 
                  className="font-bold"
                  style={{ fontSize: 14 * zoom, color: kpi.color }}
                >
                  {kpi.value}
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
        <div className="text-center" style={{ fontSize: 9 * zoom }}>
          <PlaceholderBadge className="font-medium">
            Verification Rate: 85%
          </PlaceholderBadge>
        </div>
      </div>
    );
  }

  // ===== FORTRESS CHECKLIST SECTION =====
  if (section.id === "fortress-checklist") {
    const sampleSections = [
      { name: "RMU Compliance", progress: 85, done: 14, total: 17 },
      { name: "Mini Substations", progress: 65, done: 22, total: 34 },
      { name: "Main DB", progress: 100, done: 20, total: 20 },
      { name: "Earthing & Lightning", progress: 33, done: 1, total: 3 },
    ];

    return (
      <div style={{ marginTop: 8 * zoom }}>
        {/* Overall Progress KPIs */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="p-2 rounded text-center" style={{ backgroundColor: '#16a34a10', border: '1px solid #16a34a20' }}>
            <PlaceholderBadge>
              <div className="font-bold" style={{ fontSize: 14 * zoom, color: '#16a34a' }}>72%</div>
            </PlaceholderBadge>
            <div className="text-muted-foreground truncate" style={{ fontSize: 8 * zoom }}>Progress</div>
          </div>
          <div className="p-2 rounded text-center" style={{ backgroundColor: '#16a34a10', border: '1px solid #16a34a20' }}>
            <PlaceholderBadge>
              <div className="font-bold" style={{ fontSize: 14 * zoom, color: '#16a34a' }}>96</div>
            </PlaceholderBadge>
            <div className="text-muted-foreground truncate" style={{ fontSize: 8 * zoom }}>Completed</div>
          </div>
          <div className="p-2 rounded text-center" style={{ backgroundColor: '#6b728010', border: '1px solid #6b728020' }}>
            <PlaceholderBadge>
              <div className="font-bold" style={{ fontSize: 14 * zoom, color: '#6b7280' }}>24</div>
            </PlaceholderBadge>
            <div className="text-muted-foreground truncate" style={{ fontSize: 8 * zoom }}>Pending</div>
          </div>
          <div className="p-2 rounded text-center" style={{ backgroundColor: '#2563eb10', border: '1px solid #2563eb20' }}>
            <PlaceholderBadge>
              <div className="font-bold" style={{ fontSize: 14 * zoom, color: '#2563eb' }}>13</div>
            </PlaceholderBadge>
            <div className="text-muted-foreground truncate" style={{ fontSize: 8 * zoom }}>N/A</div>
          </div>
        </div>

        {/* Section Progress Table */}
        <div className="text-xs font-medium mb-1" style={{ fontSize: 9 * zoom }}>Section Progress</div>
        <div 
          className="flex p-1 rounded-t font-medium"
          style={{ backgroundColor: colors.light, color: colors.text, fontSize: 7 * zoom }}
        >
          <span className="flex-1">Section</span>
          <span className="w-10 text-center">Done</span>
          <span className="w-10 text-center">Total</span>
          <span className="w-12 text-center">Progress</span>
        </div>
        {sampleSections.map((sec, i) => (
          <div 
            key={i} 
            className="flex p-1 border-b border-muted/30 items-center"
            style={{ fontSize: 7 * zoom, backgroundColor: i % 2 === 1 ? '#f9fafb' : 'transparent' }}
          >
            <span className="flex-1 flex items-center gap-1">
              <ClipboardCheck className="w-3 h-3 text-muted-foreground" />
              {sec.name}
            </span>
            <PlaceholderBadge className="w-10 text-center text-green-600">{sec.done}</PlaceholderBadge>
            <span className="w-10 text-center text-muted-foreground">{sec.total}</span>
            <span 
              className="w-12 text-center font-medium border border-dashed border-amber-400/60 bg-amber-50/40 rounded px-1 py-px"
              style={{ 
                color: sec.progress >= 80 ? '#16a34a' : sec.progress >= 50 ? '#ea580c' : '#dc2626' 
              }}
            >
              {sec.progress}%
            </span>
          </div>
        ))}
        <div className="text-center text-muted-foreground italic mt-1" style={{ fontSize: 7 * zoom }}>
          + 4 more sections...
        </div>
      </div>
    );
  }

  // Fallback for unknown sections
  return (
    <div className="text-center py-4 text-muted-foreground" style={{ fontSize: 9 * zoom }}>
      <FileCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <div>Section: {section.title}</div>
      <div className="text-xs italic">Custom content</div>
    </div>
  );
};
