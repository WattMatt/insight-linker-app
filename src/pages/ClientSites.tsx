import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Building2, Database } from "lucide-react";
import { toast } from "sonner";
import { readFirebaseData } from "@/lib/firebase";

interface Site {
  id: string;
  name: string;
  address: string | null;
  site_type: string | null;
  source?: 'firebase' | 'supabase';
  site_image_url?: string | null;
  client_logo_url?: string | null;
  project_logo_url?: string | null;
}

const ClientSites = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [clientName, setClientName] = useState<string>('');
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFirebaseClient, setIsFirebaseClient] = useState(false);

  useEffect(() => {
    if (clientId) {
      fetchSites();
    }
  }, [clientId]);

  const fetchSites = async () => {
    try {
      setLoading(true);

      // First try to fetch from Supabase
      const { data: supabaseClient, error: clientError } = await supabase
        .from("clients")
        .select("name, sites(*)")
        .eq("id", clientId)
        .maybeSingle();

      if (supabaseClient) {
        // It's a Supabase client
        setClientName(supabaseClient.name);
        const supabaseSites = (supabaseClient.sites || []).map((site: any) => ({
          ...site,
          source: 'supabase' as const,
        }));
        setSites(supabaseSites);
        setIsFirebaseClient(false);
      } else {
        // Try Firebase
        setIsFirebaseClient(true);
        await fetchFirebaseSites(clientId!);
      }
    } catch (error) {
      console.error("Error fetching sites:", error);
      toast.error("Failed to fetch sites");
    } finally {
      setLoading(false);
    }
  };

  const fetchFirebaseSites = async (firebaseClientId: string) => {
    try {
      const data = await readFirebaseData(`/clients/${firebaseClientId}`);
      if (!data) {
        toast.error("Client not found in Firebase");
        return;
      }

      setClientName(data.name || data.clientName || data.Name || firebaseClientId);

      // Get all keys that look like site keys (they contain underscores or special chars, not "name", "email", etc.)
      const allKeys = Object.keys(data);
      const siteKeys = allKeys.filter(key => 
        !['name', 'clientName', 'Name', 'email', 'phone', 'logo', 'logoUrl', 'created', 'updated'].some(excludeKey => 
          key.toLowerCase().includes(excludeKey.toLowerCase())
        ) && key.length > 3
      );
      
      console.log('Site keys found for client:', firebaseClientId, siteKeys);

      const transformedSites: Site[] = [];

      for (const siteKey of siteKeys) {
        const siteData = data[siteKey];
        
        // Skip if not an object
        if (typeof siteData !== 'object' || siteData === null) continue;

        const site: Site = {
          id: siteKey,
          name: siteData.siteName || siteData.name || siteData.Name || siteKey,
          address: siteData.physicalAddress || siteData.address || siteData.Address || null,
          site_type: siteData.siteType || siteData.site_type || siteData.type || null,
          source: 'firebase' as const,
          site_image_url: siteData.siteImageUrl || siteData.site_image_url || null,
          client_logo_url: siteData.clientLogoUrl || siteData.client_logo_url || null,
          project_logo_url: siteData.projectLogoUrl || siteData.project_logo_url || null,
        };

        transformedSites.push(site);
      }

      console.log('Transformed sites:', transformedSites);
      setSites(transformedSites);
    } catch (error) {
      console.error("Error fetching Firebase sites:", error);
      toast.error("Failed to fetch Firebase sites");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading sites...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/clients")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{clientName}</h1>
          <p className="text-muted-foreground mt-1">
            {sites.length} {sites.length === 1 ? 'site' : 'sites'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sites.length > 0 ? (
          sites.map((site) => (
            <Card
              key={site.id}
              className="cursor-pointer hover:shadow-lg transition-shadow overflow-hidden"
              onClick={() => {
                if (!isFirebaseClient) {
                  navigate(`/sites/${site.id}`);
                } else {
                  toast.info("Firebase sites are read-only. Please migrate the client first.");
                }
              }}
            >
              {/* Site Image Header */}
              {(site.project_logo_url || site.site_image_url) && (
                <div className="h-32 w-full bg-muted flex items-center justify-center overflow-hidden">
                  <img
                    src={site.project_logo_url || site.site_image_url || ''}
                    alt={site.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}
              
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {site.client_logo_url ? (
                      <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center p-1 flex-shrink-0">
                        <img
                          src={site.client_logo_url}
                          alt="Client logo"
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <Building2 className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{site.name}</CardTitle>
                      {site.site_type && (
                        <p className="text-sm text-muted-foreground">{site.site_type}</p>
                      )}
                    </div>
                  </div>
                  <Badge variant={site.source === 'firebase' ? 'secondary' : 'default'} className="ml-2 flex-shrink-0">
                    <Database className="h-3 w-3 mr-1" />
                    {site.source === 'firebase' ? 'Firebase' : 'Supabase'}
                  </Badge>
                </div>
              </CardHeader>
              {site.address && (
                <CardContent>
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{site.address}</span>
                  </div>
                </CardContent>
              )}
            </Card>
          ))
        ) : (
          <div className="col-span-full text-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No sites found</h3>
            <p className="text-muted-foreground">
              This client does not have any sites yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientSites;
