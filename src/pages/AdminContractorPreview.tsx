import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Briefcase, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SITES_PER_PAGE = 12;

const AdminContractorPreview = () => {
  const navigate = useNavigate();
  const observerTarget = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["sites-for-contractor-preview"],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * SITES_PER_PAGE;
      const to = from + SITES_PER_PAGE - 1;

      const { data, error, count } = await supabase
        .from("sites")
        .select("id, name, address, site_type, site_image_url, clients(name, company_name)", { count: "exact" })
        .order("name")
        .range(from, to);

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
      
      return { sites: sitesWithSignedUrls, totalCount: count || 0 };
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.sites.length, 0);
      return totalFetched < lastPage.totalCount ? allPages.length : undefined;
    },
    initialPageParam: 0,
  });

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const sites = data?.pages.flatMap((page) => page.sites) || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
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
      {sites.length > 0 ? (
        <>
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
                  <Button
                    onClick={() => navigate(`/contractor?preview=${site.id}`)}
                    className="w-full"
                    variant="outline"
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Preview as Contractor
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Intersection observer target for infinite scroll */}
          <div ref={observerTarget} className="h-20 flex items-center justify-center">
            {isFetchingNextPage && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading more sites...</span>
              </div>
            )}
          </div>
        </>
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
