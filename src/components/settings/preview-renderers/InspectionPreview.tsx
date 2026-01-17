// Inspection Report Preview - Matches actual PDF output
import React from "react";
import { ReportSection } from "@/components/pdf-editor/types";
import { cn } from "@/lib/utils";
import { Camera, CheckCircle, AlertTriangle, FileSignature, User } from "lucide-react";

interface InspectionPreviewProps {
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

export const InspectionPreview: React.FC<InspectionPreviewProps> = ({
  section,
  zoom,
  colors,
}) => {
  // ===== INSPECTION DETAILS =====
  if (section.id === "inspection-details") {
    const details = [
      ["Inspection Title", "Electrical Safety Inspection"],
      ["Location", "SHOP 001 - Main Floor"],
      ["Inspector", "John Smith"],
      ["Date", "17 January 2026"],
      ["Status", "Completed"],
      ["Template", "Electrical Compliance Check"],
    ];

    return (
      <div className="space-y-1" style={{ marginTop: 8 * zoom }}>
        {details.map(([label, value], i) => (
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

  // ===== FINDINGS - Checklist Items =====
  if (section.id === "findings") {
    const findings = [
      { name: "Earth Continuity", status: "pass", notes: "" },
      { name: "Insulation Resistance", status: "pass", notes: "" },
      { name: "RCD Function Test", status: "fail", notes: "Trip time exceeded" },
      { name: "Circuit Breaker Labels", status: "pass", notes: "" },
    ];

    return (
      <div className="space-y-1" style={{ marginTop: 8 * zoom }}>
        {findings.map((item, i) => (
          <div 
            key={i} 
            className="flex items-center gap-2 py-1 border-b border-muted/30"
            style={{ fontSize: 9 * zoom }}
          >
            {item.status === "pass" ? (
              <CheckCircle className="text-green-600" style={{ width: 12 * zoom, height: 12 * zoom }} />
            ) : (
              <AlertTriangle className="text-red-600" style={{ width: 12 * zoom, height: 12 * zoom }} />
            )}
            <span className="flex-1">{item.name}</span>
            <PlaceholderBadge>
              <span className={item.status === "pass" ? "text-green-600" : "text-red-600"}>
                {item.status.toUpperCase()}
              </span>
            </PlaceholderBadge>
          </div>
        ))}
      </div>
    );
  }

  // ===== PHOTOS - Evidence Gallery =====
  if (section.id === "photos") {
    return (
      <div style={{ marginTop: 8 * zoom }}>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map(i => (
            <div 
              key={i} 
              className="aspect-square bg-muted/30 rounded flex items-center justify-center border border-dashed border-muted"
            >
              <Camera style={{ width: 16 * zoom, height: 16 * zoom }} className="text-muted-foreground" />
            </div>
          ))}
        </div>
        <div className="text-center mt-2 text-muted-foreground italic" style={{ fontSize: 7 * zoom }}>
          Inspection photos with captions
        </div>
      </div>
    );
  }

  // ===== SIGNATURES =====
  if (section.id === "signatures") {
    return (
      <div className="grid grid-cols-2 gap-3" style={{ marginTop: 8 * zoom }}>
        {["Inspector", "Client Representative"].map((role, i) => (
          <div key={i} className="text-center">
            <div 
              className="h-12 border-b-2 border-muted mb-1 flex items-end justify-center"
            >
              <FileSignature style={{ width: 20 * zoom, height: 20 * zoom }} className="text-muted-foreground mb-1" />
            </div>
            <div style={{ fontSize: 8 * zoom }} className="text-muted-foreground">{role}</div>
            <PlaceholderBadge>
              <div style={{ fontSize: 7 * zoom }}>John Smith</div>
            </PlaceholderBadge>
          </div>
        ))}
      </div>
    );
  }

  // Fallback
  return (
    <div className="text-center py-4 text-muted-foreground" style={{ fontSize: 9 * zoom }}>
      <div>Section: {section.title}</div>
    </div>
  );
};
