import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Plus, Layers, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Site {
  id: string;
  name: string;
  address: string | null;
  site_type: string | null;
  client_id: string;
  clients: {
    id: string;
    name: string;
  };
}

interface Subsection {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  coc_status: string;
  metering_status: string;
  is_compliant: boolean;
}

const SiteDetail = () => {
  const { clientId, siteId } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [subsections, setSubsections] = useState<Subsection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSiteData();
  }, [siteId]);

  const fetchSiteData = async () => {
    try {
      const [siteRes, subsectionsRes] = await Promise.all([
        supabase
          .from("sites")
          .select("*, clients(id, name)")
          .eq("id", siteId)
          .single(),
        supabase
          .from("subsections")
          .select("*")
          .eq("site_id", siteId)
          .order("name"),
      ]);

      if (siteRes.error) throw siteRes.error;
      if (subsectionsRes.error) throw subsectionsRes.error;

      setSite(siteRes.data);
      setSubsections(subsectionsRes.data || []);
    } catch (error) {
      console.error("Error fetching site data:", error);
      toast.error("Failed to fetch site data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold mb-2">Site not found</h3>
        <Button onClick={() => navigate(`/clients/${clientId}`)}>Back to Client</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Clients", href: "/clients" },
          { label: site.clients.name, href: `/clients/${clientId}` },
          { label: site.name },
        ]}
      />

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{site.name}</h1>
          <p className="text-muted-foreground mt-2">
            Electrical boards and subsections
          </p>
        </div>
      </div>

      {/* Site Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Site Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {site.site_type && (
            <div>
              <p className="text-sm text-muted-foreground">Type</p>
              <p className="font-medium">{site.site_type}</p>
            </div>
          )}
          {site.address && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-sm text-muted-foreground">Address</p>
                <p className="font-medium">{site.address}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subsections Card */}
      <Card>
        <CardHeader>
          <CardTitle>Subsections</CardTitle>
          <CardDescription>
            {subsections.length} {subsections.length === 1 ? "subsection" : "subsections"} at this site
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subsections.length === 0 ? (
            <div className="text-center py-12">
              <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No subsections yet</h3>
              <p className="text-muted-foreground mb-4">
                Add electrical boards or subsections to this site
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {subsections.map((subsection) => (
                <Card
                  key={subsection.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/${subsection.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{subsection.name}</CardTitle>
                      {subsection.category && (
                        <Badge variant="outline">{subsection.category}</Badge>
                      )}
                    </div>
                    {subsection.description && (
                      <CardDescription>{subsection.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">CoC Status:</span>
                        <Badge
                          variant="outline"
                          className={
                            subsection.coc_status === "Approved"
                              ? "bg-green-500/10 text-green-500"
                              : "bg-orange-500/10 text-orange-500"
                          }
                        >
                          {subsection.coc_status}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Compliant:</span>
                        <Badge
                          variant="outline"
                          className={
                            subsection.is_compliant
                              ? "bg-green-500/10 text-green-500"
                              : "bg-red-500/10 text-red-500"
                          }
                        >
                          {subsection.is_compliant ? "Yes" : "No"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SiteDetail;
