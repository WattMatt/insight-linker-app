/**
 * WYSIWYG Signature Page Component
 * Renders the signatures section
 */
import { format } from "date-fns";

interface Signature {
  name: string;
  role: string;
  signatureUrl?: string;
  signedAt?: string;
}

interface SignaturePageProps {
  signatures: Signature[];
  reportDate: string;
}

export function SignaturePage({ signatures, reportDate }: SignaturePageProps) {
  const formatRole = (role: string) => {
    const roleMap: Record<string, string> = {
      'inspector': 'Inspector',
      'contractor': 'Contractor',
      'client': 'Client Representative',
      'witness': 'Witness',
    };
    return roleMap[role?.toLowerCase()] || role;
  };

  return (
    <div className="w-full bg-white p-6 flex flex-col">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-[#1e3a5f]">
        <div className="w-10 h-10 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-[#1e3a5f]">Sign-Off & Authorisation</h3>
      </div>
      
      {/* Signatures grid */}
      {signatures && signatures.length > 0 ? (
        <div className="grid grid-cols-2 gap-6">
          {signatures.map((sig, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg p-4">
              <div className="mb-2">
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                  {formatRole(sig.role)}
                </span>
              </div>
              
              {/* Signature image or placeholder */}
              <div className="h-20 border-b border-gray-300 mb-3 flex items-end justify-center pb-2">
                {sig.signatureUrl ? (
                  <img 
                    src={sig.signatureUrl} 
                    alt={`${sig.name}'s signature`}
                    className="max-h-16 max-w-full object-contain"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <span className="text-gray-300 text-sm italic">Signature pending</span>
                )}
              </div>
              
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-800">{sig.name}</p>
                {sig.signedAt && (
                  <p className="text-xs text-gray-500">
                    Signed: {format(new Date(sig.signedAt), 'dd/MM/yyyy HH:mm')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {['Inspector', 'Contractor', 'Client Representative', 'Witness'].map((role, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg p-4">
              <div className="mb-2">
                <span className="text-xs text-gray-500 uppercase tracking-wide">{role}</span>
              </div>
              <div className="h-20 border-b border-gray-300 mb-3" />
              <div className="flex justify-between text-xs text-gray-400">
                <span>Name: _________________</span>
                <span>Date: _________________</span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Footer declaration */}
      <div className="mt-auto pt-8">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-600 text-center">
            I hereby declare that this inspection has been conducted in accordance with SANS 10142-1 
            and all findings accurately represent the condition of the electrical installation as observed 
            on {reportDate || format(new Date(), 'dd MMMM yyyy')}.
          </p>
        </div>
      </div>
    </div>
  );
}
