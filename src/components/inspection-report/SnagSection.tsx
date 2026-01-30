/**
 * WYSIWYG Snag Section Component
 * Renders defects/snags with their photos
 */

interface Snag {
  title: string;
  description?: string;
  status: string;
  riskLevel?: string;
  photos?: string[];
}

interface SnagSectionProps {
  snags: Snag[];
}

export function SnagSection({ snags }: SnagSectionProps) {
  if (!snags || snags.length === 0) {
    return null;
  }

  const getRiskBadge = (risk?: string) => {
    const level = risk?.toLowerCase() || 'low';
    if (level === 'high' || level === 'critical') {
      return 'bg-red-100 text-red-700 border-red-300';
    }
    if (level === 'medium') {
      return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    }
    return 'bg-green-100 text-green-700 border-green-300';
  };

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s === 'resolved' || s === 'complete' || s === 'closed') {
      return 'bg-green-100 text-green-700';
    }
    if (s === 'in_progress' || s === 'in progress') {
      return 'bg-blue-100 text-blue-700';
    }
    return 'bg-orange-100 text-orange-700';
  };

  return (
    <div className="w-full bg-white p-6">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-red-500">
        <div className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <h3 className="text-xl font-bold text-[#1e3a5f]">Snags & Defects</h3>
          <p className="text-sm text-gray-500">{snags.length} item{snags.length !== 1 ? 's' : ''} requiring attention</p>
        </div>
      </div>
      
      {/* Snag cards */}
      <div className="space-y-4">
        {snags.map((snag, idx) => (
          <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Snag header */}
            <div className="flex items-center justify-between p-3 bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1e3a5f] text-white text-xs flex items-center justify-center">
                  {idx + 1}
                </span>
                <span className="font-medium text-gray-800">{snag.title}</span>
              </div>
              <div className="flex items-center gap-2">
                {snag.riskLevel && (
                  <span className={`px-2 py-1 rounded text-xs font-medium border ${getRiskBadge(snag.riskLevel)}`}>
                    {snag.riskLevel.toUpperCase()}
                  </span>
                )}
                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadge(snag.status)}`}>
                  {snag.status?.replace('_', ' ').toUpperCase() || 'OPEN'}
                </span>
              </div>
            </div>
            
            {/* Description */}
            {snag.description && (
              <div className="px-3 py-2 border-t border-gray-100">
                <p className="text-sm text-gray-600">{snag.description}</p>
              </div>
            )}
            
            {/* Photos */}
            {snag.photos && snag.photos.length > 0 && (
              <div className="p-3 border-t border-gray-100">
                <div className="grid grid-cols-4 gap-2">
                  {snag.photos.slice(0, 4).map((photo, photoIdx) => (
                    <div key={photoIdx} className="aspect-square bg-gray-100 rounded overflow-hidden">
                      <img 
                        src={photo} 
                        alt={`Snag photo ${photoIdx + 1}`}
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
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
