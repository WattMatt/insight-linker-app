// Inspection Report Preview - Uses actual reference project data
import React from "react";
import { ReportSection } from "@/components/pdf-editor/types";
import { cn } from "@/lib/utils";
import { Camera, CheckCircle, AlertTriangle, FileSignature, User, ExternalLink } from "lucide-react";
import { SampleInspection, InspectionFinding } from "@/hooks/useSampleReportData";

interface InspectionPreviewProps {
  section: ReportSection;
  zoom: number;
  colors: { primary: string; light: string; text: string };
  // Real data from reference project
  inspection?: SampleInspection;
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
  inspection,
}) => {
  const hasRealData = !!inspection?.findings || !!inspection?.lineShops;

  // ===== INSPECTION DETAILS =====
  if (section.id === "inspection-details") {
    const details = inspection ? [
      ["Inspection Title", inspection.title || "Untitled Inspection"],
      ["Location", inspection.subsectionName || "Site-level"],
      ["Inspector", inspection.inspectorName || "—"],
      ["Date", inspection.inspectionDate || "—"],
      ["Status", inspection.status || "In Progress"],
      ["Template", inspection.templateName || "Custom"],
    ] : [
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
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </div>
    );
  }

  // ===== FINDINGS - Uses actual findings from json_data =====
  if (section.id === "findings") {
    // Extract findings from inspection data
    const findingsToShow: Array<{ name: string; status: string; notes: string; hasPhoto: boolean }> = [];
    
    if (inspection?.findings) {
      Object.values(inspection.findings).slice(0, 8).forEach((finding: InspectionFinding) => {
        findingsToShow.push({
          name: finding.name,
          status: finding.status?.toLowerCase() || 'pending',
          notes: finding.notes || '',
          hasPhoto: !!(finding.images && Object.keys(finding.images).length > 0),
        });
      });
    }

    // Fallback to sample if no real findings
    if (findingsToShow.length === 0) {
      findingsToShow.push(
        { name: "Earth Continuity", status: "pass", notes: "", hasPhoto: false },
        { name: "Insulation Resistance", status: "pass", notes: "", hasPhoto: true },
        { name: "RCD Function Test", status: "fail", notes: "Trip time exceeded", hasPhoto: true },
        { name: "Circuit Breaker Labels", status: "pass", notes: "", hasPhoto: false },
      );
    }

    return (
      <div className="space-y-1" style={{ marginTop: 8 * zoom }}>
        {hasRealData && (
          <div className="text-xs text-green-600 mb-2">
            ✓ Showing {findingsToShow.length} actual findings from reference project
          </div>
        )}
        {findingsToShow.map((item, i) => (
          <div 
            key={i} 
            className="flex items-center gap-2 py-1 border-b border-muted/30"
            style={{ fontSize: 9 * zoom }}
          >
            {item.status === "pass" ? (
              <CheckCircle className="text-green-600" style={{ width: 12 * zoom, height: 12 * zoom }} />
            ) : item.status === "fail" ? (
              <AlertTriangle className="text-red-600" style={{ width: 12 * zoom, height: 12 * zoom }} />
            ) : (
              <div className="w-3 h-3 rounded-full bg-orange-400" style={{ width: 12 * zoom, height: 12 * zoom }} />
            )}
            <span className="flex-1 truncate">{item.name}</span>
            {item.hasPhoto && (
              <Camera className="text-blue-600" style={{ width: 10 * zoom, height: 10 * zoom }} />
            )}
            <span className={cn(
              "px-1.5 py-0.5 rounded text-white",
              item.status === "pass" ? "bg-green-600" : 
              item.status === "fail" ? "bg-red-600" : "bg-orange-500"
            )} style={{ fontSize: 7 * zoom }}>
              {item.status.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // ===== PHOTOS - Show actual photos from findings =====
  if (section.id === "photos") {
    // Collect all photos from findings
    const photos: Array<{ url: string; caption: string }> = [];
    
    if (inspection?.findings) {
      Object.entries(inspection.findings).forEach(([key, finding]) => {
        if (finding.images) {
          Object.values(finding.images).forEach((img: any) => {
            if (img.downloadURL) {
              photos.push({
                url: img.downloadURL,
                caption: finding.name,
              });
            }
          });
        }
      });
    }

    // Also check lineShops for photos
    if (inspection?.lineShops) {
      inspection.lineShops.slice(0, 3).forEach(shop => {
        const allImages = [
          ...(shop.meterSerialImages ? Object.values(shop.meterSerialImages) : []),
          ...(shop.breakerSizeImages ? Object.values(shop.breakerSizeImages) : []),
          ...(shop.ctRatioImages ? Object.values(shop.ctRatioImages) : []),
        ];
        allImages.slice(0, 2).forEach((img: any) => {
          if (img.downloadURL) {
            photos.push({
              url: img.downloadURL,
              caption: shop.shopName,
            });
          }
        });
      });
    }

    return (
      <div style={{ marginTop: 8 * zoom }}>
        {photos.length > 0 ? (
          <>
            <div className="text-xs text-green-600 mb-2">
              ✓ {photos.length} actual photos from reference project
            </div>
            <div className="grid grid-cols-3 gap-2">
              {photos.slice(0, 6).map((photo, i) => (
                <div key={i} className="relative">
                  <img 
                    src={photo.url} 
                    alt={photo.caption}
                    className="aspect-square object-cover rounded border"
                    style={{ width: '100%' }}
                  />
                  <div 
                    className="absolute bottom-0 left-0 right-0 bg-black/60 text-white px-1 truncate"
                    style={{ fontSize: 6 * zoom }}
                  >
                    {photo.caption}
                  </div>
                </div>
              ))}
            </div>
            {photos.length > 6 && (
              <div className="text-center mt-1 text-muted-foreground" style={{ fontSize: 7 * zoom }}>
                +{photos.length - 6} more photos
              </div>
            )}
          </>
        ) : (
          <>
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
          </>
        )}
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
              <div style={{ fontSize: 7 * zoom }}>
                {i === 0 && inspection?.inspectorName ? inspection.inspectorName : "John Smith"}
              </div>
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
