import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, FileText, MapPin, Download, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

const ClientPortalSiteDetail = () => {
  const { siteId } = useParams();

  const { data: site, isLoading: siteLoading } = useQuery({
    queryKey: ["client-site", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("id", siteId!)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: subsections, isLoading: subsectionsLoading } = useQuery({
    queryKey: ["client-subsections", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsections")
        .select("*")
        .eq("site_id", siteId!)
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ["client-site-documents", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_documents")
        .select("*")
        .eq("site_id", siteId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  if (siteLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!site) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-lg font-medium">Site not found</p>
          <Link to="/client-portal/sites">
            <Button className="mt-4">Back to Sites</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "compliant": return "bg-green-500";
      case "missing": return "bg-red-500";
      case "expired": return "bg-orange-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <div className="space-y-6">
      {/* Site Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {site.site_image_url ? (
                <img 
                  src={site.site_image_url} 
                  alt={site.name}
                  className="h-20 w-20 object-cover rounded-lg"
                />
              ) : (
                <div className="h-20 w-20 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Building2 className="h-10 w-10 text-primary" />
                </div>
              )}
              <div>
                <CardTitle className="text-2xl">{site.name}</CardTitle>
                {site.site_type && (
                  <p className="text-muted-foreground mt-1">{site.site_type}</p>
                )}
                {site.address && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                    <MapPin className="h-4 w-4" />
                    <span>{site.address}</span>
                  </div>
                )}
              </div>
            </div>
            <Link to="/client-portal/sites">
              <Button variant="outline">Back to Sites</Button>
            </Link>
          </div>
        </CardHeader>
        {(site.supply_authority || site.nominated_max_demand) && (
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {site.supply_authority && (
                <div>
                  <p className="text-sm text-muted-foreground">Supply Authority</p>
                  <p className="font-medium">{site.supply_authority}</p>
                </div>
              )}
              {site.nominated_max_demand && (
                <div>
                  <p className="text-sm text-muted-foreground">Nominated Max Demand</p>
                  <p className="font-medium">{site.nominated_max_demand}</p>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Subsections */}
      <Card>
        <CardHeader>
          <CardTitle>Subsections</CardTitle>
        </CardHeader>
        <CardContent>
          {subsectionsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : subsections && subsections.length > 0 ? (
            <div className="space-y-2">
              {subsections.map((subsection) => (
                <Link 
                  key={subsection.id}
                  to={`/client-portal/subsections/${subsection.id}`}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{subsection.name}</p>
                      {subsection.description && (
                        <p className="text-sm text-muted-foreground">{subsection.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {subsection.coc_status && (
                      <Badge 
                        variant="secondary"
                        className={`${getStatusColor(subsection.coc_status)} text-white`}
                      >
                        COC: {subsection.coc_status}
                      </Badge>
                    )}
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No subsections found for this site
            </p>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Site Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {docsLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : documents && documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div 
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">{doc.category}</p>
                    </div>
                  </div>
                  <a 
                    href={doc.file_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    download
                  >
                    <Button variant="ghost" size="sm" className="gap-2">
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No documents available for this site
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientPortalSiteDetail;
