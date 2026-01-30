/**
 * WYSIWYG Tenant Section Component
 * Renders tenant verification cards with meter/breaker photos
 */

interface Tenant {
  shopName: string;
  shopNumber?: string;
  meterSerialNumber?: string;
  breakerSize?: string;
  ctSizeAndRatio?: string;
  meterImage?: string;
  breakerImage?: string;
  ctRatioImage?: string;
}

interface TenantSectionProps {
  tenants: Tenant[];
}

export function TenantSection({ tenants }: TenantSectionProps) {
  if (!tenants || tenants.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-white p-6">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-[#0d9488]">
        <div className="w-10 h-10 rounded-full bg-[#0d9488] text-white flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-[#1e3a5f]">Tenant Information</h3>
      </div>
      
      {/* Tenant cards grid */}
      <div className="grid grid-cols-1 gap-4">
        {tenants.map((tenant, idx) => (
          <TenantCard key={idx} tenant={tenant} index={idx} />
        ))}
      </div>
    </div>
  );
}

function TenantCard({ tenant, index }: { tenant: Tenant; index: number }) {
  const hasPhotos = tenant.meterImage || tenant.breakerImage || tenant.ctRatioImage;
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Tenant header */}
      <div className="bg-[#f0fdfa] p-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium text-[#1e3a5f]">
              {tenant.shopName || `Tenant ${index + 1}`}
            </span>
            {tenant.shopNumber && (
              <span className="ml-2 text-sm text-gray-500">
                (Shop #{tenant.shopNumber})
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Tenant details */}
      <div className="p-3">
        <div className="grid grid-cols-3 gap-4 text-sm">
          {tenant.meterSerialNumber && (
            <div>
              <span className="text-gray-500 block text-xs">Meter Serial</span>
              <span className="font-medium text-gray-800">{tenant.meterSerialNumber}</span>
            </div>
          )}
          {tenant.breakerSize && (
            <div>
              <span className="text-gray-500 block text-xs">Breaker Size</span>
              <span className="font-medium text-gray-800">{tenant.breakerSize}</span>
            </div>
          )}
          {tenant.ctSizeAndRatio && (
            <div>
              <span className="text-gray-500 block text-xs">CT Ratio</span>
              <span className="font-medium text-gray-800">{tenant.ctSizeAndRatio}</span>
            </div>
          )}
        </div>
        
        {/* Verification photos */}
        {hasPhotos && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {tenant.meterImage && (
              <div className="space-y-1">
                <div className="aspect-square bg-gray-100 rounded overflow-hidden">
                  <img 
                    src={tenant.meterImage} 
                    alt="Meter"
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                </div>
                <p className="text-xs text-center text-gray-500">Meter</p>
              </div>
            )}
            {tenant.breakerImage && (
              <div className="space-y-1">
                <div className="aspect-square bg-gray-100 rounded overflow-hidden">
                  <img 
                    src={tenant.breakerImage} 
                    alt="Breaker"
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                </div>
                <p className="text-xs text-center text-gray-500">Breaker</p>
              </div>
            )}
            {tenant.ctRatioImage && (
              <div className="space-y-1">
                <div className="aspect-square bg-gray-100 rounded overflow-hidden">
                  <img 
                    src={tenant.ctRatioImage} 
                    alt="CT Ratio"
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                </div>
                <p className="text-xs text-center text-gray-500">CT Ratio</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
