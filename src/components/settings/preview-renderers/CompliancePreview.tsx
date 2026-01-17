// Compliance Report Preview - Matches actual PDF output
import React from "react";
import { ReportSection } from "@/components/pdf-editor/types";
import { cn } from "@/lib/utils";
import { Shield, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";

interface CompliancePreviewProps {
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

export const CompliancePreview: React.FC<CompliancePreviewProps> = ({
  section,
  zoom,
  colors,
}) => {
  // ===== COMPLIANCE SUMMARY - KPI Row =====
  if (section.id === "compliance-summary") {
    const kpiItems = section.kpiItems || [
      { id: "total", label: "Total Subsections", field: "totalSubsections", visible: true, color: "blue" },
      { id: "compliant", label: "Compliant", field: "cocPass", visible: true, color: "green" },
      { id: "non-compliant", label: "Non-Compliant", field: "cocMissing", visible: true, color: "red" },
      { id: "rate", label: "Compliance Rate", field: "complianceRate", visible: true, color: "purple" },
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

    const getKPIValue = (field: string): string => {
      switch (field) {
        case "totalSubsections": return "116";
        case "cocPass": return "42";
        case "cocMissing": return "74";
        case "complianceRate": return "36%";
        default: return "—";
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
                style={{ fontSize: 12 * zoom, color: getKPIColor(kpi.color) }}
              >
                {getKPIValue(kpi.field)}
              </div>
            </PlaceholderBadge>
            <div 
              className="text-muted-foreground truncate"
              style={{ fontSize: 7 * zoom }}
            >
              {kpi.label}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ===== COC STATUS TABLE =====
  if (section.id === "coc-status") {
    const columns = section.columns || [
      { id: "name", label: "Shop Name", field: "name", visible: true },
      { id: "tenant", label: "Tenant", field: "tenant", visible: true },
      { id: "cocStatus", label: "COC Status", field: "cocStatus", visible: true },
    ];

    const visibleColumns = columns.filter(c => c.visible !== false);
    const rows = [
      { name: "SHOP 001", tenant: "RUSSELS", cocStatus: "Pass" },
      { name: "SHOP 002", tenant: "NB CELLULAR", cocStatus: "Missing" },
      { name: "SHOP 003", tenant: "OPTOMETRIST", cocStatus: "Pass" },
      { name: "SHOP 004", tenant: "HAIR SALON", cocStatus: "Expired" },
    ];

    const getStatusColor = (status: string): string => {
      switch (status.toLowerCase()) {
        case "pass":
        case "valid":
        case "approved": return "text-green-600";
        case "missing": return "text-red-600";
        case "expired": return "text-orange-600";
        case "pending": return "text-yellow-600";
        default: return "text-muted-foreground";
      }
    };

    const getStatusIcon = (status: string) => {
      switch (status.toLowerCase()) {
        case "pass":
        case "valid":
        case "approved": return <CheckCircle style={{ width: 10 * zoom, height: 10 * zoom }} className="text-green-600" />;
        case "missing": return <XCircle style={{ width: 10 * zoom, height: 10 * zoom }} className="text-red-600" />;
        case "expired": return <AlertTriangle style={{ width: 10 * zoom, height: 10 * zoom }} className="text-orange-600" />;
        default: return <Clock style={{ width: 10 * zoom, height: 10 * zoom }} className="text-yellow-600" />;
      }
    };

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
        {rows.map((row, i) => (
          <div 
            key={i} 
            className="flex p-1 border-b border-muted/30 items-center"
            style={{ fontSize: 8 * zoom }}
          >
            {visibleColumns.map(col => (
              <span key={col.id} className="flex-1 truncate">
                {col.field === "cocStatus" ? (
                  <span className="flex items-center gap-1">
                    {getStatusIcon(row.cocStatus)}
                    <PlaceholderBadge className={getStatusColor(row.cocStatus)}>
                      {row.cocStatus}
                    </PlaceholderBadge>
                  </span>
                ) : (
                  <PlaceholderBadge>{(row as any)[col.field]}</PlaceholderBadge>
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ===== EXPIRING COCS =====
  if (section.id === "expiring-cocs") {
    const expiring = [
      { name: "SHOP 015", tenant: "CELL C", expiryDate: "15 Feb 2026", daysLeft: 29 },
      { name: "SHOP 022", tenant: "VODACOM", expiryDate: "28 Feb 2026", daysLeft: 42 },
    ];

    return (
      <div style={{ marginTop: 8 * zoom }}>
        <div className="flex items-center gap-1 mb-1" style={{ fontSize: 8 * zoom }}>
          <Clock style={{ width: 10 * zoom, height: 10 * zoom }} className="text-orange-600" />
          <span className="font-medium text-orange-600">Expiring Soon</span>
        </div>
        {expiring.map((item, i) => (
          <div 
            key={i} 
            className="flex justify-between items-center py-1 border-b border-muted/30"
            style={{ fontSize: 8 * zoom }}
          >
            <div>
              <PlaceholderBadge className="font-medium">{item.name}</PlaceholderBadge>
              <span className="text-muted-foreground ml-1">({item.tenant})</span>
            </div>
            <PlaceholderBadge className="text-orange-600">
              {item.daysLeft} days
            </PlaceholderBadge>
          </div>
        ))}
      </div>
    );
  }

  // ===== NON-COMPLIANT ITEMS =====
  if (section.id === "non-compliant") {
    const items = [
      { name: "SHOP 002", reason: "COC Missing - Never submitted" },
      { name: "SHOP 007", reason: "COC Expired - 45 days overdue" },
      { name: "SHOP 012", reason: "COC Failed - RCD trip time exceeded" },
    ];

    return (
      <div style={{ marginTop: 8 * zoom }}>
        <div className="flex items-center gap-1 mb-1" style={{ fontSize: 8 * zoom }}>
          <XCircle style={{ width: 10 * zoom, height: 10 * zoom }} className="text-red-600" />
          <span className="font-medium text-red-600">Non-Compliant Items</span>
        </div>
        {items.map((item, i) => (
          <div 
            key={i} 
            className="py-1 border-b border-muted/30"
            style={{ fontSize: 8 * zoom }}
          >
            <PlaceholderBadge className="font-medium">{item.name}</PlaceholderBadge>
            <div className="text-muted-foreground" style={{ fontSize: 7 * zoom }}>
              {item.reason}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Fallback
  return (
    <div className="text-center py-4 text-muted-foreground" style={{ fontSize: 9 * zoom }}>
      <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <div>Section: {section.title}</div>
    </div>
  );
};
