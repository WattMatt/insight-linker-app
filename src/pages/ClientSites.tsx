import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Building2, Database, Upload } from "lucide-react";
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
  const [migratingImages, setMigratingImages] = useState(false);

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

        // Log all available fields to identify image field names
        console.log(`Site ${siteKey} fields:`, Object.keys(siteData));
        console.log(`Site ${siteKey} data sample:`, {
          ...siteData,
          // Truncate long fields for readability
          subsections: siteData.subsections ? '[subsections data]' : undefined
        });

        const site: Site = {
          id: siteKey,
          name: siteData.siteName || siteData.name || siteData.Name || siteKey,
          address: siteData.physicalAddress || siteData.address || siteData.Address || null,
          site_type: siteData.siteType || siteData.site_type || siteData.type || null,
          source: 'firebase' as const,
          site_image_url: siteData.siteImageUrl || siteData.site_image_url || siteData.siteImage || null,
          client_logo_url: siteData.clientLogoUrl || siteData.client_logo_url || siteData.clientLogo || 
                          siteData.projectLogoUrl || siteData.project_logo_url || siteData.projectLogo || null,
          project_logo_url: siteData.projectLogoUrl || siteData.project_logo_url || siteData.projectLogo || siteData.logo || null,
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

  const migrateSiteImages = async () => {
    setMigratingImages(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const site of sites) {
        // Check if site has images that need migration (Firebase URLs)
        const imagesToMigrate: { url: string; bucket: 'site-images'; fileName: string }[] = [];

        if (site.site_image_url && site.site_image_url.includes('firebase')) {
          imagesToMigrate.push({
            url: site.site_image_url,
            bucket: 'site-images',
            fileName: `${site.id}/site-image.png`,
          });
        }

        if (site.project_logo_url && site.project_logo_url.includes('firebase')) {
          imagesToMigrate.push({
            url: site.project_logo_url,
            bucket: 'site-images',
            fileName: `${site.id}/project-logo.png`,
          });
        }

        // Migrate each image
        for (const image of imagesToMigrate) {
          try {
            const { data, error } = await supabase.functions.invoke('migrate-images', {
              body: {
                imageUrl: image.url,
                bucket: image.bucket,
                fileName: image.fileName,
              },
            });

            if (error) throw error;

            if (data?.success) {
              // Update the site record with the new URL
              const updateData: any = {};
              
              if (image.fileName.includes('site-image')) {
                updateData.site_image_url = data.newUrl;
              } else if (image.fileName.includes('project-logo')) {
                updateData.client_logo_url = data.newUrl;
              }

              if (Object.keys(updateData).length > 0) {
                await supabase
                  .from('sites')
                  .update(updateData)
                  .eq('id', site.id);
              }

              successCount++;
            }
          } catch (err) {
            console.error(`Failed to migrate image for site ${site.name}:`, err);
            errorCount++;
          }
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully migrated ${successCount} image(s)`);
        // Refresh sites to show new URLs
        await fetchSites();
      }
      if (errorCount > 0) {
        toast.error(`Failed to migrate ${errorCount} image(s)`);
      }
    } catch (error) {
      console.error('Error during image migration:', error);
      toast.error('Failed to migrate images');
    } finally {
      setMigratingImages(false);
    }
  };

  const hasFirebaseImages = sites.some(site => 
    (site.site_image_url && site.site_image_url.includes('firebase')) ||
    (site.project_logo_url && site.project_logo_url.includes('firebase')) ||
    (site.client_logo_url && site.client_logo_url.includes('firebase'))
  );

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
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{clientName}</h1>
          <p className="text-muted-foreground mt-1">
            {sites.length} {sites.length === 1 ? 'site' : 'sites'}
          </p>
        </div>
        {hasFirebaseImages && !isFirebaseClient && (
          <Button 
            onClick={migrateSiteImages}
            disabled={migratingImages}
            variant="outline"
          >
            <Upload className="h-4 w-4 mr-2" />
            {migratingImages ? 'Migrating...' : 'Migrate Images to Supabase'}
          </Button>
        )}
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
                  navigate(`/clients/${clientId}/sites/${site.id}`);
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
                    {(site.site_image_url || site.client_logo_url) ? (
                      <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center p-1 flex-shrink-0">
                        <img
                          src={site.site_image_url || site.client_logo_url || ''}
                          alt="Site logo"
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
