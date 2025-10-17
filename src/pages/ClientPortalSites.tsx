import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, MapPin, Eye } from "lucide-react";
import { useClientInfo } from "@/hooks/useUserRole";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

const ClientPortalSites = () => {
  const [searchParams] = useSearchParams();
  const previewClientId = searchParams.get("preview");
  const { data: clientInfo } = useClientInfo(previewClientId || undefined);
  
  const { data: sites, isLoading } = useQuery({
    queryKey: ["client-sites", clientInfo?.client_id],
    enabled: !!clientInfo?.client_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("client_id", clientInfo!.client_id)
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {previewClientId && (
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Admin Preview Mode:</strong> Viewing sites for{" "}
            {clientInfo?.clients?.company_name || clientInfo?.clients?.name}
          </AlertDescription>
        </Alert>
      )}
      
      <div>
        <h1 className="text-3xl font-bold">Your Sites</h1>
        <p className="text-muted-foreground mt-2">
          View and access all sites under your management
        </p>
      </div>

      {sites && sites.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No sites found</p>
            <p className="text-sm text-muted-foreground">
              There are no sites associated with your account yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {sites?.map((site) => (
            <Card key={site.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {site.site_image_url ? (
                      <img 
                        src={site.site_image_url} 
                        alt={site.name}
                        className="h-12 w-12 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Building2 className="h-6 w-6 text-primary" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-xl">{site.name}</CardTitle>
                      {site.site_type && (
                        <p className="text-sm text-muted-foreground">{site.site_type}</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {site.address && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{site.address}</span>
                  </div>
                )}
                
                <Link to={`/client-portal/sites/${site.id}${previewClientId ? `?preview=${previewClientId}` : ''}`}>
                  <Button className="w-full gap-2">
                    <Eye className="h-4 w-4" />
                    View Site Details
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientPortalSites;
