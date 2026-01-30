/**
 * WYSIWYG Quality Dashboard Component
 * Shows the quality score and key metrics
 */

interface QualityDashboardProps {
  qualityRating?: number;
  totalItems: number;
  passedItems: number;
  failedItems: number;
  pendingItems: number;
  totalPhotos: number;
}

export function QualityDashboard({
  qualityRating,
  totalItems,
  passedItems,
  failedItems,
  pendingItems,
  totalPhotos,
}: QualityDashboardProps) {
  const score = qualityRating ?? Math.round((passedItems / Math.max(totalItems, 1)) * 100);
  
  // Determine color based on score
  const getScoreColor = () => {
    if (score >= 80) return { bg: 'bg-green-500', text: 'text-green-700', label: 'COMPLIANT' };
    if (score >= 60) return { bg: 'bg-yellow-500', text: 'text-yellow-700', label: 'PARTIAL' };
    return { bg: 'bg-red-500', text: 'text-red-700', label: 'NON-COMPLIANT' };
  };
  
  const scoreStyle = getScoreColor();

  return (
    <div className="w-full h-full bg-white flex flex-col p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#1e3a5f]">Quality Score Dashboard</h2>
        <p className="text-gray-500 text-sm mt-1">Inspection Summary & Compliance Overview</p>
      </div>
      
      {/* Main score circle */}
      <div className="flex justify-center mb-12">
        <div className="relative w-48 h-48">
          {/* Background circle */}
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${score * 2.83} 283`}
            />
          </svg>
          {/* Score text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold text-[#1e3a5f]">{score}%</span>
            <span className={`text-sm font-medium ${scoreStyle.text}`}>{scoreStyle.label}</span>
          </div>
        </div>
      </div>
      
      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto w-full">
        <KPICard 
          label="Items Passed" 
          value={passedItems} 
          color="bg-green-100 text-green-700 border-green-200" 
        />
        <KPICard 
          label="Items Failed" 
          value={failedItems} 
          color="bg-red-100 text-red-700 border-red-200" 
        />
        <KPICard 
          label="Pending Review" 
          value={pendingItems} 
          color="bg-yellow-100 text-yellow-700 border-yellow-200" 
        />
        <KPICard 
          label="Photos Captured" 
          value={totalPhotos} 
          color="bg-blue-100 text-blue-700 border-blue-200" 
        />
      </div>
      
      {/* SANS Compliance Notice */}
      <div className="mt-auto pt-8">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-xs text-gray-500">
            This inspection report complies with SANS 10142-1 electrical installation standards.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            CONFIDENTIAL - For authorized personnel only
          </p>
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg border p-4 text-center ${color}`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm mt-1">{label}</div>
    </div>
  );
}
