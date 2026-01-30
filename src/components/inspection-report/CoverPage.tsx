/**
 * WYSIWYG Cover Page Component
 * Renders the cover page of the inspection report
 */
import { format } from "date-fns";

interface CoverPageProps {
  logoUrl?: string | null;
  templateName: string;
  subsectionName: string;
  siteName: string;
  clientName?: string;
  inspectorName?: string;
  inspectionDate?: string;
  status?: string;
}

export function CoverPage({
  logoUrl,
  templateName,
  subsectionName,
  siteName,
  clientName,
  inspectorName,
  inspectionDate,
  status,
}: CoverPageProps) {
  const formattedDate = inspectionDate 
    ? format(new Date(inspectionDate), 'dd MMMM yyyy')
    : format(new Date(), 'dd MMMM yyyy');

  return (
    <div className="relative w-full h-full bg-white flex flex-col">
      {/* Top accent bar */}
      <div className="h-4 bg-[#1e3a5f] absolute top-0 left-0 right-0" />
      
      {/* Logo section */}
      <div className="mt-24 flex justify-center">
        {logoUrl ? (
          <img 
            src={logoUrl} 
            alt="Company Logo"
            className="h-24 max-w-[200px] object-contain"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="h-24 w-48 border-2 border-dashed border-gray-300 rounded flex items-center justify-center">
            <span className="text-gray-400 text-sm">[Company Logo]</span>
          </div>
        )}
      </div>
      
      {/* Main title */}
      <div className="mt-16 text-center">
        <h1 className="text-3xl font-bold text-[#1e3a5f] uppercase tracking-wide">
          {templateName || 'Inspection Report'}
        </h1>
        <h2 className="text-xl text-[#2d5a7f] mt-4">
          {subsectionName}
        </h2>
      </div>
      
      {/* Metadata block */}
      <div className="mt-auto mb-32 mx-auto w-[80%] max-w-md">
        <div className="border-l-4 border-[#0d9488] pl-6 space-y-3">
          <MetadataRow label="Site" value={siteName} />
          {clientName && <MetadataRow label="Client" value={clientName} />}
          {inspectorName && <MetadataRow label="Inspector" value={inspectorName} />}
          <MetadataRow label="Date" value={formattedDate} />
          {status && (
            <MetadataRow 
              label="Status" 
              value={status.charAt(0).toUpperCase() + status.slice(1)} 
            />
          )}
        </div>
      </div>
      
      {/* Bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-[#0d9488]" />
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <span className="text-gray-500 w-24 text-sm">{label}:</span>
      <span className="text-[#1e3a5f] font-medium text-sm">{value}</span>
    </div>
  );
}
