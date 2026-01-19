/**
 * React Subsection Card Component
 * 
 * Renders subsection cards in the template preview using the shared
 * SubsectionCardSpec for layout consistency with PDF output.
 */

import React, { useEffect, useState } from 'react';
import { 
  SubsectionCardData, 
  SnagData,
  CARD_LAYOUT, 
  STATUS_COLORS, 
  RISK_COLORS,
  getCocStatusLabel,
  getComplianceLabel,
  generateSubsectionQRCode 
} from '@/lib/subsectionCardSpec';
import { CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';

interface SubsectionCardProps {
  data: SubsectionCardData;
  accentColor?: string;
  logoUrl?: string | null;
}

export function SubsectionCard({ data, accentColor = '#3b82f6', logoUrl }: SubsectionCardProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (data.qrCodeUrl) {
      generateSubsectionQRCode(data.qrCodeUrl, logoUrl)
        .then(setQrCodeDataUrl)
        .catch(console.error);
    }
  }, [data.qrCodeUrl, logoUrl]);

  const cocStatus = data.cocStatus || 'pending';
  const cocColors = STATUS_COLORS[cocStatus] || STATUS_COLORS.pending;
  const complianceColors = data.isCompliant === true 
    ? STATUS_COLORS.compliant 
    : data.isCompliant === false 
      ? STATUS_COLORS.nonCompliant 
      : { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' };

  return (
    <div 
      className="border rounded-lg bg-white overflow-hidden"
      style={{ 
        padding: CARD_LAYOUT.cardPadding,
        borderRadius: CARD_LAYOUT.cardBorderRadius,
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 
            className="font-bold text-gray-900"
            style={{ fontSize: CARD_LAYOUT.titleSize }}
          >
            {data.name}
          </h3>
          {data.tenantName && (
            <p className="text-gray-500 text-sm mt-0.5">{data.tenantName}</p>
          )}
        </div>
        {data.category && (
          <span 
            className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
            style={{ fontSize: CARD_LAYOUT.categoryBadgeSize }}
          >
            {data.category}
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="flex gap-4">
        {/* Left: Info */}
        <div className="flex-1 space-y-2">
          {/* COC Status */}
          <div className="flex items-center gap-2">
            <span 
              className="text-gray-500 w-20"
              style={{ fontSize: CARD_LAYOUT.labelSize }}
            >
              COC Status:
            </span>
            <StatusBadge 
              label={getCocStatusLabel(data.cocStatus)} 
              colors={cocColors}
              icon={getStatusIcon(cocStatus)}
            />
          </div>

          {/* COC Number */}
          {data.cocNumber && (
            <div className="flex items-center gap-2">
              <span 
                className="text-gray-500 w-20"
                style={{ fontSize: CARD_LAYOUT.labelSize }}
              >
                COC #:
              </span>
              <span style={{ fontSize: CARD_LAYOUT.valueSize }} className="text-gray-700">
                {data.cocNumber}
              </span>
            </div>
          )}

          {/* Metering Status */}
          <div className="flex items-center gap-2">
            <span 
              className="text-gray-500 w-20"
              style={{ fontSize: CARD_LAYOUT.labelSize }}
            >
              Metering:
            </span>
            <span style={{ fontSize: CARD_LAYOUT.valueSize }} className="text-gray-700">
              {data.meteringStatus || 'N/A'}
            </span>
          </div>

          {/* Meter S/N and CT Ratio side by side */}
          <div className="flex gap-4">
            <div>
              <span className="text-gray-400 text-xs block">Meter S/N</span>
              <span style={{ fontSize: CARD_LAYOUT.valueSize }} className="text-gray-700">
                {data.meterSerialNumber || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-gray-400 text-xs block">CT Ratio</span>
              <span style={{ fontSize: CARD_LAYOUT.valueSize }} className="text-gray-700">
                {data.ctRatio || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: QR Code */}
        <div className="flex flex-col items-center">
          {qrCodeDataUrl ? (
            <img 
              src={qrCodeDataUrl} 
              alt="QR Code"
              style={{ 
                width: CARD_LAYOUT.qrCodeSize, 
                height: CARD_LAYOUT.qrCodeSize 
              }}
              className="rounded"
            />
          ) : (
            <div 
              className="border border-dashed border-gray-300 rounded flex items-center justify-center"
              style={{ 
                width: CARD_LAYOUT.qrCodeSize, 
                height: CARD_LAYOUT.qrCodeSize 
              }}
            >
              <span className="text-gray-400 text-xs">No QR</span>
            </div>
          )}
          <span className="text-gray-400 text-[7px] mt-1">Scan for details</span>
        </div>
      </div>

      {/* Snags Section */}
      <div className="mt-3 pt-3 border-t">
        <SnagsSection snags={data.snags || []} />
      </div>

      {/* Compliance Footer */}
      <div className="mt-3 pt-3 border-t flex items-center gap-2">
        <span 
          className="text-gray-500 w-20"
          style={{ fontSize: CARD_LAYOUT.labelSize }}
        >
          Compliance:
        </span>
        <StatusBadge 
          label={getComplianceLabel(data.isCompliant)} 
          colors={complianceColors}
          icon={data.isCompliant === true ? <CheckCircle2 className="w-3 h-3" /> : 
                data.isCompliant === false ? <XCircle className="w-3 h-3" /> : null}
        />
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface StatusBadgeProps {
  label: string;
  colors: { bg: string; text: string; border?: string };
  icon?: React.ReactNode;
}

function StatusBadge({ label, colors, icon }: StatusBadgeProps) {
  return (
    <span 
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded"
      style={{ 
        backgroundColor: colors.bg, 
        color: colors.text,
        fontSize: CARD_LAYOUT.badgeFontSize,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

function getStatusIcon(status: string): React.ReactNode {
  switch (status) {
    case 'pass': return <CheckCircle2 className="w-3 h-3" />;
    case 'fail': return <XCircle className="w-3 h-3" />;
    case 'pending': return <Clock className="w-3 h-3" />;
    default: return null;
  }
}

interface SnagsSectionProps {
  snags: SnagData[];
}

function SnagsSection({ snags }: SnagsSectionProps) {
  if (!snags || snags.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <span 
          className="text-gray-500 w-20"
          style={{ fontSize: CARD_LAYOUT.labelSize }}
        >
          Snags:
        </span>
        <span className="text-green-700 text-sm italic flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          No open snags
        </span>
      </div>
    );
  }

  const displaySnags = snags.slice(0, CARD_LAYOUT.maxSnagsShown);
  const remainingCount = snags.length - displaySnags.length;

  return (
    <div>
      <span 
        className="text-gray-500 block mb-2"
        style={{ fontSize: CARD_LAYOUT.labelSize }}
      >
        Snags ({snags.length}):
      </span>
      <div className="space-y-1">
        {displaySnags.map(snag => {
          const riskColors = RISK_COLORS[snag.riskLevel] || RISK_COLORS.low;
          return (
            <div key={snag.id} className="flex items-center gap-2">
              <span 
                className="px-1.5 py-0.5 rounded text-[7px] font-medium uppercase"
                style={{ 
                  backgroundColor: riskColors.bg, 
                  color: riskColors.text 
                }}
              >
                {snag.riskLevel}
              </span>
              <span className="text-gray-700 text-sm truncate">{snag.title}</span>
            </div>
          );
        })}
        {remainingCount > 0 && (
          <span className="text-gray-500 text-sm italic">
            + {remainingCount} more snag{remainingCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// GRID COMPONENT
// ============================================================================

interface SubsectionGridProps {
  subsections: SubsectionCardData[];
  accentColor?: string;
  logoUrl?: string | null;
}

export function SubsectionGrid({ subsections, accentColor, logoUrl }: SubsectionGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {subsections.map(sub => (
        <SubsectionCard 
          key={sub.id} 
          data={sub} 
          accentColor={accentColor}
          logoUrl={logoUrl}
        />
      ))}
    </div>
  );
}
