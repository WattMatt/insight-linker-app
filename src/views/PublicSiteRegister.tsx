import { useEffect, useState } from "react";
import { useParams } from "@/lib/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// get_public_site_register returns this shape (see
// supabase/migrations/20260727101000_public_verdict_rpcs.sql). Bare-ID access (no
// token) is deliberate — the register aggregates per-subsection verdicts that are
// each already public via printed QR stickers, so the aggregate exposes nothing new.
interface SiteRegisterPayload {
  settings: {
    company_name: string;
    company_logo_url?: string;
  };
  site: {
    id: string;
    name: string;
  };
  counts: {
    required: number;
    pass: number;
    fail: number;
    pending: number;
    missing: number;
  };
  last_import: string | null;
}

const PublicSiteRegister = () => {
  const { siteId } = useParams();
  const [payload, setPayload] = useState<SiteRegisterPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (siteId) {
      fetchRegister();
    }
  }, [siteId]);

  const fetchRegister = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .rpc('get_public_site_register', { p_site_id: siteId });

      if (error) {
        console.error("Error fetching public site register:", error);
        return;
      }

      if (!data) {
        console.error("Site register not found");
        return;
      }

      setPayload(data as any as SiteRegisterPayload);
    } catch (error) {
      console.error("Error fetching public site register:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!payload || !payload.site) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Register not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { site, counts, last_import, settings } = payload;

  const lastImportLabel = last_import
    ? format(new Date(last_import), "d MMM yyyy, HH:mm")
    : "no imports yet";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Hero section with geometric pattern */}
      <div className="relative bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 text-white py-12 overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="geometric" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
                <circle cx="30" cy="30" r="25" fill="#d4a574" opacity="0.6"/>
                <polygon points="90,20 105,50 75,50" fill="#4a7c59" opacity="0.6"/>
                <polygon points="30,80 45,110 15,110" fill="#8b4513" opacity="0.6"/>
                <rect x="70" y="70" width="35" height="35" fill="#c85a3e" opacity="0.6"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#geometric)"/>
          </svg>
        </div>
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl font-bold mb-1">{site.name}</h2>
          <p className="text-slate-200 text-sm">COC Register</p>
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Card className="mb-6 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Register Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="rounded-lg border p-4 text-center bg-green-500/10 border-green-300">
                <p className="text-2xl font-bold text-green-600">{counts.pass}</p>
                <p className="text-xs text-muted-foreground mt-1">Compliant</p>
              </div>
              <div className="rounded-lg border p-4 text-center bg-red-500/10 border-red-300">
                <p className="text-2xl font-bold text-red-600">{counts.fail}</p>
                <p className="text-xs text-muted-foreground mt-1">Not compliant</p>
              </div>
              <div className="rounded-lg border p-4 text-center bg-muted">
                <p className="text-2xl font-bold text-muted-foreground">{counts.pending}</p>
                <p className="text-xs text-muted-foreground mt-1">Pending</p>
              </div>
              <div className="rounded-lg border p-4 text-center bg-muted">
                <p className="text-2xl font-bold text-muted-foreground">{counts.missing}</p>
                <p className="text-xs text-muted-foreground mt-1">No COC yet</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              COC-required subsections: {counts.required}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t mt-12 py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-3">
            {settings?.company_logo_url && (
              <img
                src={settings.company_logo_url}
                alt={settings.company_name || "Company Logo"}
                className="h-12 w-auto object-contain"
              />
            )}
            <p className="text-xs text-muted-foreground text-center">
              Powered by {settings?.company_name || 'Watson Mattheus Consulting Electrical Engineers (Pty) Ltd'}
            </p>
            <p className="text-xs text-muted-foreground text-center">
              Register last updated: {lastImportLabel}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicSiteRegister;
