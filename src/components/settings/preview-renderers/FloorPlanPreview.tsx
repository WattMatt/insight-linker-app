// Floor Plan Report Preview - Matches actual PDF output
import React from "react";
import { ReportSection } from "@/components/pdf-editor/types";
import { cn } from "@/lib/utils";
import { MapPin, Image, AlertCircle, CheckCircle } from "lucide-react";

interface FloorPlanPreviewProps {
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

export const FloorPlanPreview: React.FC<FloorPlanPreviewProps> = ({
  section,
  zoom,
  colors,
}) => {
  // ===== FLOOR PLAN IMAGE =====
  if (section.id === "floor-plan-image") {
    return (
      <div 
        className="aspect-video bg-muted/20 rounded border border-dashed border-muted flex items-center justify-center relative"
        style={{ marginTop: 8 * zoom }}
      >
        <Image style={{ width: 32 * zoom, height: 32 * zoom }} className="text-muted-foreground" />
        <div 
          className="absolute top-2 left-3 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center"
          style={{ fontSize: 8 * zoom }}
        >
          1
        </div>
        <div 
          className="absolute top-6 right-8 bg-orange-500 text-white rounded-full w-5 h-5 flex items-center justify-center"
          style={{ fontSize: 8 * zoom }}
        >
          2
        </div>
        <div 
          className="absolute bottom-4 left-1/3 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center"
          style={{ fontSize: 8 * zoom }}
        >
          3
        </div>
        <div className="absolute bottom-2 right-2 text-muted-foreground italic" style={{ fontSize: 7 * zoom }}>
          Floor plan with annotated pins
        </div>
      </div>
    );
  }

  // ===== PINS SUMMARY - KPI Row =====
  if (section.id === "pins-summary") {
    const kpiItems = section.kpiItems || [
      { id: "total", label: "Total Pins", field: "totalSubsections", visible: true, color: "blue" },
      { id: "open", label: "Open", field: "cocMissing", visible: true, color: "orange" },
      { id: "resolved", label: "Resolved", field: "cocPass", visible: true, color: "green" },
    ];

    const getKPIColor = (color?: string): string => {
      switch (color) {
        case "green": return "#16a34a";
        case "orange": return "#ea580c";
        case "blue": return "#2563eb";
        case "red": return "#dc2626";
        default: return colors.primary;
      }
    };

    const values = { totalSubsections: 15, cocMissing: 4, cocPass: 11 };

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

  // ===== PIN DETAILS TABLE =====
  if (section.id === "pins-table") {
    const pins = [
      { number: 1, type: "Snag", title: "Exposed wiring", status: "Open", priority: "High" },
      { number: 2, type: "Info", title: "DB location", status: "Resolved", priority: "Low" },
      { number: 3, type: "Snag", title: "Missing cover", status: "Resolved", priority: "Medium" },
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
          <span className="w-6">#</span>
          <span className="flex-1">Title</span>
          <span className="w-14">Type</span>
          <span className="w-14">Status</span>
        </div>
        {pins.map((pin, i) => (
          <div 
            key={i} 
            className="flex p-1 border-b border-muted/30 items-center"
            style={{ fontSize: 8 * zoom }}
          >
            <span className="w-6 font-medium">{pin.number}</span>
            <PlaceholderBadge className="flex-1 truncate">
              {pin.title}
            </PlaceholderBadge>
            <span className="w-14">{pin.type}</span>
            <PlaceholderBadge className="w-14">
              <span className={pin.status === "Resolved" ? "text-green-600" : "text-orange-600"}>
                {pin.status}
              </span>
            </PlaceholderBadge>
          </div>
        ))}
      </div>
    );
  }

  // Fallback
  return (
    <div className="text-center py-4 text-muted-foreground" style={{ fontSize: 9 * zoom }}>
      <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <div>Section: {section.title}</div>
    </div>
  );
};
