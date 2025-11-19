import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Briefcase } from "lucide-react";
import { useNavigate } from "react-router-dom";

const AdminContractorPreview = () => {
  const navigate = useNavigate();

  const { data: sites, isLoading, error } = useQuery({
    queryKey: ["sites-for-contractor-preview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("id, name, address, site_type, site_image_url, clients(name, company_name)")
        .order("name");

      if (error) throw error;
      
      // Generate signed URLs for site images (site-images bucket is private)
      const sitesWithSignedUrls = await Promise.all(
        (data || []).map(async (site) => {
          if (site.site_image_url) {
            try {
              // Extract path from URL
              const urlParts = site.site_image_url.split('/site-images/');
              if (urlParts.length > 1) {
                const path = urlParts[1].split('?')[0]; // Remove query params
                const { data: signedData } = await supabase.storage
                  .from('site-images')
                  .createSignedUrl(path, 3600); // 1 hour expiry
                
                if (signedData?.signedUrl) {
                  return { ...site, site_image_url: signedData.signedUrl };
                }
              }
            } catch (error) {
              console.error('Error generating signed URL for site image:', error);
            }
          }
          return site;
        })
      );
      
      return sitesWithSignedUrls;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-destructive">Error loading sites: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Briefcase className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contractor Portal Preview</h1>
          <p className="text-muted-foreground">
            Select a site to preview what contractors see for that site
          </p>
        </div>
      </div>

      {sites && sites.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <Card
              key={site.id}
              className="overflow-hidden hover:shadow-lg transition-shadow"
            >
              {site.site_image_url && (
                <div className="h-48 overflow-hidden">
                  <img
                    src={site.site_image_url}
                    alt={site.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <CardHeader>
                <CardTitle className="line-clamp-2">{site.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  {site.address && (
                    <p className="text-muted-foreground line-clamp-2">{site.address}</p>
                  )}
                  {site.site_type && (
                    <p className="text-muted-foreground">Type: {site.site_type}</p>
                  )}
                  {site.clients && (
                    <p className="text-xs text-muted-foreground">
                      Client: {site.clients.company_name || site.clients.name}
                    </p>
                  )}
                </div>
                <a 
                  href={`/contractor?preview=${site.id}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full"
                >
                  <Button className="w-full">
                    <Eye className="h-4 w-4 mr-2" />
                    Preview as Contractor
                  </Button>
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No sites available for preview
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminContractorPreview;
