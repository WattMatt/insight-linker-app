import React from "react";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  XCircle, 
  Camera, 
  FileText, 
  PenLine, 
  ListChecks,
  AlertTriangle,
  Clock,
  User,
  Building2,
  MapPin,
  Calendar
} from "lucide-react";
import { format } from "date-fns";

interface InspectionSection {
  id: string;
  name: string;
  order_index?: number;
  items?: InspectionItem[];
}

interface InspectionItem {
  id: string;
  name: string;
  type: 'checklist' | 'text' | 'photo' | 'signature' | 'number' | 'date';
  required?: boolean;
  options?: string[];
}

interface InspectionTemplatePreviewProps {
  template: {
    id: string;
    name: string;
    category: string;
    description: string | null;
    sections: InspectionSection[];
  };
  sampleData?: {
    siteName?: string;
    clientName?: string;
    address?: string;
    inspectorName?: string;
    inspectionDate?: string;
    logoUrl?: string | null;
  };
  zoom: number;
  colors: { primary: string; light: string; text: string };
}

const PlaceholderBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-amber-50 border border-dashed border-amber-300 rounded text-amber-700">
    {children}
  </span>
);

const getItemTypeIcon = (type: string) => {
  switch (type) {
    case 'checklist': return <ListChecks className="w-3 h-3" />;
    case 'photo': return <Camera className="w-3 h-3" />;
    case 'signature': return <PenLine className="w-3 h-3" />;
    case 'text': return <FileText className="w-3 h-3" />;
    default: return <FileText className="w-3 h-3" />;
  }
};

// Sample finding statuses for realistic preview
const sampleStatuses = ['pass', 'pass', 'fail', 'pass', 'n/a', 'pass', 'pending', 'pass'];

export const InspectionTemplatePreview: React.FC<InspectionTemplatePreviewProps> = ({
  template,
  sampleData,
  zoom,
  colors
}) => {
  const siteName = sampleData?.siteName || "Sample Site";
  const clientName = sampleData?.clientName || "Sample Client";
  const address = sampleData?.address || "123 Sample Street, City";
  const inspectorName = sampleData?.inspectorName || "John Inspector";
  const inspectionDate = sampleData?.inspectionDate || format(new Date(), 'dd MMM yyyy');

  // Page container style
  const pageStyle: React.CSSProperties = {
    width: 595 * zoom,
    minHeight: 842 * zoom,
    backgroundColor: 'white',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    position: 'relative',
    marginBottom: 16 * zoom,
  };

  const contentPadding = 40 * zoom;

  return (
    <div className="space-y-4">
      {/* COVER PAGE */}
      <div style={pageStyle}>
        {/* Top accent bar */}
        <div 
          className="absolute top-0 left-0 right-0"
          style={{ height: 8 * zoom, backgroundColor: colors.primary }}
        />
        
        <div style={{ padding: contentPadding, paddingTop: contentPadding + 8 * zoom }}>
          {/* Logo area */}
          <div style={{ marginBottom: 40 * zoom }}>
            {sampleData?.logoUrl ? (
              <img 
                src={sampleData.logoUrl} 
                alt="Logo"
                style={{ height: 60 * zoom, objectFit: 'contain' }}
              />
            ) : (
              <div 
                className="rounded flex items-center justify-center"
                style={{ 
                  width: 120 * zoom, 
                  height: 60 * zoom, 
                  backgroundColor: colors.light 
                }}
              >
                <Building2 style={{ width: 24 * zoom, height: 24 * zoom, color: colors.primary }} />
              </div>
            )}
          </div>

          {/* Title */}
          <div style={{ marginBottom: 60 * zoom }}>
            <h1 style={{ 
              fontSize: 28 * zoom, 
              fontWeight: 'bold', 
              color: colors.primary,
              marginBottom: 8 * zoom 
            }}>
              {template.name}
            </h1>
            <p style={{ fontSize: 14 * zoom, color: '#6b7280' }}>
              {template.description || "Inspection Report"}
            </p>
            <Badge 
              variant="outline" 
              style={{ 
                marginTop: 12 * zoom,
                fontSize: 10 * zoom,
                borderColor: colors.primary,
                color: colors.primary
              }}
            >
              {template.category}
            </Badge>
          </div>

          {/* Inspection details */}
          <div style={{ 
            fontSize: 12 * zoom, 
            lineHeight: 2,
            padding: 20 * zoom,
            backgroundColor: '#f9fafb',
            borderRadius: 8 * zoom,
            border: '1px solid #e5e7eb'
          }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 * zoom }}>
              <Building2 style={{ width: 14 * zoom, height: 14 * zoom, color: colors.primary }} />
              <span style={{ fontWeight: 600 }}>Site:</span>
              <PlaceholderBadge>{siteName}</PlaceholderBadge>
            </div>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 * zoom }}>
              <User style={{ width: 14 * zoom, height: 14 * zoom, color: colors.primary }} />
              <span style={{ fontWeight: 600 }}>Client:</span>
              <PlaceholderBadge>{clientName}</PlaceholderBadge>
            </div>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 * zoom }}>
              <MapPin style={{ width: 14 * zoom, height: 14 * zoom, color: colors.primary }} />
              <span style={{ fontWeight: 600 }}>Location:</span>
              <PlaceholderBadge>{address}</PlaceholderBadge>
            </div>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 * zoom }}>
              <User style={{ width: 14 * zoom, height: 14 * zoom, color: colors.primary }} />
              <span style={{ fontWeight: 600 }}>Inspector:</span>
              <PlaceholderBadge>{inspectorName}</PlaceholderBadge>
            </div>
            <div className="flex items-center gap-2">
              <Calendar style={{ width: 14 * zoom, height: 14 * zoom, color: colors.primary }} />
              <span style={{ fontWeight: 600 }}>Date:</span>
              <PlaceholderBadge>{inspectionDate}</PlaceholderBadge>
            </div>
          </div>

          {/* Template structure summary */}
          <div style={{ marginTop: 40 * zoom }}>
            <h3 style={{ fontSize: 12 * zoom, fontWeight: 600, marginBottom: 12 * zoom, color: colors.text }}>
              Template Structure
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {template.sections?.slice(0, 6).map((section, idx) => (
                <div 
                  key={section.id || idx}
                  className="flex items-center gap-2 p-2 rounded"
                  style={{ 
                    fontSize: 10 * zoom, 
                    backgroundColor: colors.light,
                    border: `1px solid ${colors.primary}20`
                  }}
                >
                  <span style={{ 
                    width: 20 * zoom, 
                    height: 20 * zoom, 
                    borderRadius: '50%', 
                    backgroundColor: colors.primary,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9 * zoom,
                    fontWeight: 600
                  }}>
                    {idx + 1}
                  </span>
                  <span className="truncate">{section.name}</span>
                </div>
              ))}
            </div>
            {(template.sections?.length || 0) > 6 && (
              <p style={{ fontSize: 9 * zoom, color: '#9ca3af', marginTop: 8 * zoom }}>
                +{(template.sections?.length || 0) - 6} more sections
              </p>
            )}
          </div>
        </div>

        {/* Page number */}
        <div 
          className="absolute bottom-4 left-0 right-0 text-center"
          style={{ fontSize: 10 * zoom, color: '#9ca3af' }}
        >
          Page 1
        </div>
      </div>

      {/* SECTION PAGES */}
      {template.sections?.map((section, sectionIdx) => (
        <div key={section.id || sectionIdx} style={pageStyle}>
          {/* Section header bar */}
          <div 
            style={{ 
              backgroundColor: colors.primary, 
              padding: `${12 * zoom}px ${contentPadding}px`,
              color: 'white'
            }}
          >
            <div className="flex items-center justify-between">
              <h2 style={{ fontSize: 14 * zoom, fontWeight: 600 }}>
                Section {sectionIdx + 1}: {section.name}
              </h2>
              <span style={{ fontSize: 10 * zoom, opacity: 0.8 }}>
                {section.items?.length || 0} items
              </span>
            </div>
          </div>

          <div style={{ padding: contentPadding }}>
            {/* Section items as checklist table */}
            {section.items && section.items.length > 0 ? (
              <table 
                className="w-full border-collapse"
                style={{ fontSize: 10 * zoom }}
              >
                <thead>
                  <tr style={{ backgroundColor: colors.light }}>
                    <th style={{ 
                      padding: `${8 * zoom}px`, 
                      textAlign: 'left', 
                      borderBottom: '1px solid #e5e7eb',
                      color: colors.text,
                      width: '5%'
                    }}>
                      #
                    </th>
                    <th style={{ 
                      padding: `${8 * zoom}px`, 
                      textAlign: 'left', 
                      borderBottom: '1px solid #e5e7eb',
                      color: colors.text,
                      width: '35%'
                    }}>
                      Item
                    </th>
                    <th style={{ 
                      padding: `${8 * zoom}px`, 
                      textAlign: 'center', 
                      borderBottom: '1px solid #e5e7eb',
                      color: colors.text,
                      width: '10%'
                    }}>
                      Type
                    </th>
                    <th style={{ 
                      padding: `${8 * zoom}px`, 
                      textAlign: 'center', 
                      borderBottom: '1px solid #e5e7eb',
                      color: colors.text,
                      width: '15%'
                    }}>
                      Status
                    </th>
                    <th style={{ 
                      padding: `${8 * zoom}px`, 
                      textAlign: 'left', 
                      borderBottom: '1px solid #e5e7eb',
                      color: colors.text,
                      width: '35%'
                    }}>
                      Notes / Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item, itemIdx) => {
                    const status = sampleStatuses[itemIdx % sampleStatuses.length];
                    return (
                      <tr 
                        key={item.id || itemIdx}
                        className="hover:bg-gray-50"
                      >
                        <td style={{ 
                          padding: `${6 * zoom}px ${8 * zoom}px`, 
                          borderBottom: '1px solid #f3f4f6',
                          color: '#6b7280'
                        }}>
                          {itemIdx + 1}
                        </td>
                        <td style={{ 
                          padding: `${6 * zoom}px ${8 * zoom}px`, 
                          borderBottom: '1px solid #f3f4f6'
                        }}>
                          <div className="flex items-center gap-1">
                            {item.name}
                            {item.required && (
                              <span style={{ color: '#dc2626' }}>*</span>
                            )}
                          </div>
                        </td>
                        <td style={{ 
                          padding: `${6 * zoom}px ${8 * zoom}px`, 
                          borderBottom: '1px solid #f3f4f6',
                          textAlign: 'center'
                        }}>
                          <span 
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                            style={{ 
                              backgroundColor: '#f3f4f6',
                              color: '#6b7280',
                              fontSize: 8 * zoom
                            }}
                          >
                            {getItemTypeIcon(item.type || 'checklist')}
                            {item.type || 'check'}
                          </span>
                        </td>
                        <td style={{ 
                          padding: `${6 * zoom}px ${8 * zoom}px`, 
                          borderBottom: '1px solid #f3f4f6',
                          textAlign: 'center'
                        }}>
                          {status === 'pass' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-white" style={{ backgroundColor: '#16a34a', fontSize: 8 * zoom }}>
                              <CheckCircle2 className="w-3 h-3" /> PASS
                            </span>
                          )}
                          {status === 'fail' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-white" style={{ backgroundColor: '#dc2626', fontSize: 8 * zoom }}>
                              <XCircle className="w-3 h-3" /> FAIL
                            </span>
                          )}
                          {status === 'pending' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-white" style={{ backgroundColor: '#ea580c', fontSize: 8 * zoom }}>
                              <Clock className="w-3 h-3" /> PENDING
                            </span>
                          )}
                          {status === 'n/a' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded" style={{ backgroundColor: '#e5e7eb', fontSize: 8 * zoom }}>
                              N/A
                            </span>
                          )}
                        </td>
                        <td style={{ 
                          padding: `${6 * zoom}px ${8 * zoom}px`, 
                          borderBottom: '1px solid #f3f4f6',
                          color: '#6b7280',
                          fontStyle: 'italic'
                        }}>
                          {item.type === 'photo' ? (
                            <span className="flex items-center gap-1">
                              <Camera className="w-3 h-3" />
                              <PlaceholderBadge>Photo attached</PlaceholderBadge>
                            </span>
                          ) : item.type === 'signature' ? (
                            <span className="flex items-center gap-1">
                              <PenLine className="w-3 h-3" />
                              <PlaceholderBadge>Signed</PlaceholderBadge>
                            </span>
                          ) : status === 'fail' ? (
                            <PlaceholderBadge>Requires remediation - see notes</PlaceholderBadge>
                          ) : (
                            <PlaceholderBadge>Sample value</PlaceholderBadge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div 
                className="text-center py-8 border-2 border-dashed rounded"
                style={{ fontSize: 11 * zoom, color: '#9ca3af' }}
              >
                <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p>No items defined in this section</p>
                <p style={{ fontSize: 9 * zoom }}>Add items to this section in the template builder</p>
              </div>
            )}

            {/* Section summary box */}
            <div 
              className="mt-4 p-3 rounded"
              style={{ 
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                fontSize: 9 * zoom
              }}
            >
              <div className="flex items-center justify-between">
                <span style={{ fontWeight: 600 }}>Section Summary</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                    <PlaceholderBadge>5 Pass</PlaceholderBadge>
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-red-600" />
                    <PlaceholderBadge>1 Fail</PlaceholderBadge>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-orange-600" />
                    <PlaceholderBadge>1 Pending</PlaceholderBadge>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Page number */}
          <div 
            className="absolute bottom-4 left-0 right-0 text-center"
            style={{ fontSize: 10 * zoom, color: '#9ca3af' }}
          >
            Page {sectionIdx + 2}
          </div>
        </div>
      ))}

      {/* SIGNATURE PAGE */}
      <div style={pageStyle}>
        <div style={{ padding: contentPadding }}>
          <h2 style={{ 
            fontSize: 16 * zoom, 
            fontWeight: 'bold', 
            color: colors.primary,
            marginBottom: 24 * zoom 
          }}>
            Inspection Sign-Off
          </h2>

          {/* Summary stats */}
          <div 
            className="grid grid-cols-4 gap-3"
            style={{ marginBottom: 40 * zoom }}
          >
            {[
              { label: 'Total Items', value: template.sections?.reduce((acc, s) => acc + (s.items?.length || 0), 0) || 0, color: '#2563eb' },
              { label: 'Passed', value: 'XX', color: '#16a34a' },
              { label: 'Failed', value: 'XX', color: '#dc2626' },
              { label: 'Completion', value: 'XX%', color: '#9333ea' },
            ].map((stat, idx) => (
              <div 
                key={idx}
                className="text-center p-3 rounded"
                style={{ 
                  backgroundColor: `${stat.color}10`,
                  border: `1px solid ${stat.color}30`
                }}
              >
                <div style={{ fontSize: 20 * zoom, fontWeight: 'bold', color: stat.color }}>
                  {typeof stat.value === 'number' ? stat.value : <PlaceholderBadge>{stat.value}</PlaceholderBadge>}
                </div>
                <div style={{ fontSize: 9 * zoom, color: '#6b7280' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Notes section */}
          <div style={{ marginBottom: 40 * zoom }}>
            <h3 style={{ fontSize: 12 * zoom, fontWeight: 600, marginBottom: 8 * zoom }}>
              General Notes & Observations
            </h3>
            <div 
              className="p-3 rounded border-2 border-dashed"
              style={{ 
                minHeight: 100 * zoom,
                backgroundColor: '#fafafa',
                fontSize: 10 * zoom,
                color: '#9ca3af',
                fontStyle: 'italic'
              }}
            >
              <PlaceholderBadge>Inspector notes will appear here...</PlaceholderBadge>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8" style={{ marginTop: 60 * zoom }}>
            <div>
              <div 
                className="border-b-2 border-gray-300 mb-2"
                style={{ height: 60 * zoom }}
              />
              <div style={{ fontSize: 10 * zoom, fontWeight: 600 }}>Inspector Signature</div>
              <div style={{ fontSize: 9 * zoom, color: '#6b7280' }}>
                Name: <PlaceholderBadge>{inspectorName}</PlaceholderBadge>
              </div>
              <div style={{ fontSize: 9 * zoom, color: '#6b7280' }}>
                Date: <PlaceholderBadge>{inspectionDate}</PlaceholderBadge>
              </div>
            </div>
            <div>
              <div 
                className="border-b-2 border-gray-300 mb-2"
                style={{ height: 60 * zoom }}
              />
              <div style={{ fontSize: 10 * zoom, fontWeight: 600 }}>Client Representative</div>
              <div style={{ fontSize: 9 * zoom, color: '#6b7280' }}>
                Name: <PlaceholderBadge>Client Rep Name</PlaceholderBadge>
              </div>
              <div style={{ fontSize: 9 * zoom, color: '#6b7280' }}>
                Date: _______________
              </div>
            </div>
          </div>
        </div>

        {/* Page number */}
        <div 
          className="absolute bottom-4 left-0 right-0 text-center"
          style={{ fontSize: 10 * zoom, color: '#9ca3af' }}
        >
          Page {(template.sections?.length || 0) + 2}
        </div>
      </div>
    </div>
  );
};
