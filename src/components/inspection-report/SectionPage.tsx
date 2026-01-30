/**
 * WYSIWYG Section Page Component
 * Renders a section with checklist items and photos
 */

interface SectionItem {
  label: string;
  value: string;
  type?: string;
  notes?: string;
  photos?: string[];
}

interface SectionPageProps {
  sectionNumber: number;
  title: string;
  items: SectionItem[];
}

export function SectionPage({ sectionNumber, title, items }: SectionPageProps) {
  // Get status badge styling
  const getStatusBadge = (value: string) => {
    const normalizedValue = value?.toLowerCase() || '';
    if (normalizedValue === 'pass' || normalizedValue === 'passed' || normalizedValue === 'compliant') {
      return 'bg-green-100 text-green-700 border-green-300';
    }
    if (normalizedValue === 'fail' || normalizedValue === 'failed' || normalizedValue === 'non-compliant') {
      return 'bg-red-100 text-red-700 border-red-300';
    }
    if (normalizedValue === 'n/a' || normalizedValue === 'na' || normalizedValue === 'not applicable') {
      return 'bg-gray-100 text-gray-600 border-gray-300';
    }
    return 'bg-blue-100 text-blue-700 border-blue-300';
  };

  return (
    <div className="w-full bg-white p-6">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-[#1e3a5f]">
        <div className="w-10 h-10 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center font-bold text-lg">
          {sectionNumber}
        </div>
        <h3 className="text-xl font-bold text-[#1e3a5f]">{title}</h3>
      </div>
      
      {/* Items list */}
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Item header */}
            <div className="flex items-center justify-between p-3 bg-gray-50">
              <span className="font-medium text-gray-800 text-sm">{item.label}</span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusBadge(item.value)}`}>
                {item.value?.toUpperCase() || 'N/A'}
              </span>
            </div>
            
            {/* Notes if present */}
            {item.notes && (
              <div className="px-3 py-2 bg-yellow-50 border-t border-yellow-100">
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Notes:</span> {item.notes}
                </p>
              </div>
            )}
            
            {/* Photos grid */}
            {item.photos && item.photos.length > 0 && (
              <div className="p-3 border-t border-gray-100">
                <div className="grid grid-cols-3 gap-2">
                  {item.photos.slice(0, 6).map((photo, photoIdx) => (
                    <div key={photoIdx} className="aspect-[4/3] bg-gray-100 rounded overflow-hidden">
                      <img 
                        src={photo} 
                        alt={`${item.label} photo ${photoIdx + 1}`}
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </div>
                  ))}
                </div>
                {item.photos.length > 6 && (
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    +{item.photos.length - 6} more photos
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
