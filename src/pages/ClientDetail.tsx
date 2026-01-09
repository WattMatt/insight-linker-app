import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Building2, FileText, ClipboardCheck } from "lucide-react";
import { getCategoryIcon, getCategoryColor } from "@/lib/subsectionCategories";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/Breadcrumb";

// Data structures
interface Client {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  company_name?: string | null;
  logo_url?: string | null;
}

interface Site {
  id: string;
  name: string;
  address: string | null;
  site_type: string | null;
  subsections?: Subsection[];
  inspections?: Inspection[];
}

interface Subsection {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  documents?: DocumentItem[];
}

interface Inspection {
  id: string;
  title: string;
  status: string;
  priority?: string;
  inspection_date?: string | null;
}

interface DocumentItem {
  id: string;
  file_name: string;
  file_url: string;
  category?: string;
}

const ClientDetail = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clientId) {
      fetchClientData();
    }
  }, [clientId]);

  const fetchClientData = async () => {
    try {
      setLoading(true);

      // First check if this is a Supabase client
      const { data: supabaseClient, error: clientError } = await supabase
        .from("clients")
        .select("*, sites(*, subsections(*, subsection_documents(*)), inspections(*))")
        .eq("id", clientId)
        .maybeSingle();

      if (!supabaseClient) {
        toast.error("Client not found");
        return;
      }

      // Set client data
      setClient(supabaseClient);
      
      // Process sites with nested data
      const processedSites = (supabaseClient.sites || []).map((site: any) => ({
        ...site,
        subsections: site.subsections || [],
        inspections: site.inspections || [],
      })).sort((a, b) => a.name.localeCompare(b.name));
      setSites(processedSites);
    } catch (error) {
      console.error("Error fetching client data:", error);
      toast.error("Failed to fetch client data");
    } finally {
      setLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading client...</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Client not found</p>
          <Button className="mt-4" onClick={() => navigate("/clients")}>
            Back to Clients
          </Button>
        </div>
      </div>
    );
  }

  const totalSubsections = sites.reduce((sum, site) => sum + (site.subsections?.length || 0), 0);
  const totalInspections = sites.reduce((sum, site) => sum + (site.inspections?.length || 0), 0);
  const totalDocuments = sites.reduce((sum, site) => {
    return sum + (site.subsections?.reduce((docSum, sub) => docSum + (sub.documents?.length || 0), 0) || 0);
  }, 0);

  return (
    <div className="space-y-6">
      <Breadcrumbs 
        items={[
          { label: "Clients", href: "/clients", icon: "client" },
          { label: client.name, icon: "client" }
        ]} 
      />
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
            <p className="text-muted-foreground mt-1">
              {sites.length} sites • {totalSubsections} subsections • {totalInspections} inspections • {totalDocuments} documents
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Client Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {client.company_name && (
              <div>
                <p className="text-sm text-muted-foreground">Company</p>
                <p className="font-medium">{client.company_name}</p>
              </div>
            )}
            {client.contact_person && (
              <div>
                <p className="text-sm text-muted-foreground">Contact Person</p>
                <p className="font-medium">{client.contact_person}</p>
              </div>
            )}
            {client.email && (
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{client.email}</p>
              </div>
            )}
            {client.phone && (
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{client.phone}</p>
              </div>
            )}
            {!client.contact_person && !client.email && !client.phone && (
              <p className="text-muted-foreground">No contact information available</p>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Sites</span>
              <span className="font-bold">{sites.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Subsections</span>
              <span className="font-bold">{totalSubsections}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Inspections</span>
              <span className="font-bold">{totalInspections}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Documents</span>
              <span className="font-bold">{totalDocuments}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sites with nested structure */}
      <Card>
        <CardHeader>
          <CardTitle>Sites & Structure</CardTitle>
        </CardHeader>
        <CardContent>
          {sites.length > 0 ? (
            <div className="space-y-4">
              {sites.map((site) => (
                <Card key={site.id} className="border-2">
                  <CardHeader className="cursor-pointer hover:bg-accent" onClick={() => navigate(`/clients/${clientId}/sites/${site.id}`)}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-primary" />
                        <div>
                          <CardTitle className="text-lg">{site.name}</CardTitle>
                          {site.address && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3" />
                              {site.address}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <Badge variant="outline">{site.subsections?.length || 0} subsections</Badge>
                        <Badge variant="outline">{site.inspections?.length || 0} inspections</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="subsections">
                      <TabsList>
                        <TabsTrigger value="subsections">
                          Subsections ({site.subsections?.length || 0})
                        </TabsTrigger>
                        <TabsTrigger value="inspections">
                          Inspections ({site.inspections?.length || 0})
                        </TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="subsections" className="space-y-2">
                        {site.subsections && site.subsections.length > 0 ? (
                          site.subsections.map((subsection) => (
                            <div key={subsection.id} className="border rounded-lg p-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="font-medium">{subsection.name}</p>
                                  {subsection.description && (
                                    <p className="text-sm text-muted-foreground mt-1">{subsection.description}</p>
                                  )}
                                  {subsection.category && (() => {
                                    const CategoryIcon = getCategoryIcon(subsection.category);
                                    const colors = getCategoryColor(subsection.category);
                                    return (
                                      <div className="flex items-center gap-2 mt-2">
                                        <div className={`h-5 w-5 flex items-center justify-center ${colors.bg} ${colors.text} rounded`}>
                                          <CategoryIcon className="h-3 w-3" />
                                        </div>
                                        <span className="text-xs">{subsection.category}</span>
                                      </div>
                                    );
                                  })()}
                                </div>
                                {subsection.documents && subsection.documents.length > 0 && (
                                  <Badge variant="outline" className="ml-2">
                                    <FileText className="h-3 w-3 mr-1" />
                                    {subsection.documents.length} docs
                                  </Badge>
                                )}
                              </div>
                              {subsection.documents && subsection.documents.length > 0 && (
                                <div className="mt-3 space-y-1 pl-4 border-l-2">
                                  {subsection.documents.map((doc) => (
                                    <div key={doc.id} className="text-sm flex items-center gap-2">
                                      <FileText className="h-3 w-3 text-muted-foreground" />
                                      <span className="text-muted-foreground">{doc.file_name}</span>
                                      {doc.category && <Badge variant="outline" className="text-xs">{doc.category}</Badge>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground py-4">No subsections</p>
                        )}
                      </TabsContent>
                      
                      <TabsContent value="inspections" className="space-y-2">
                        {site.inspections && site.inspections.length > 0 ? (
                          site.inspections.map((inspection) => (
                            <div key={inspection.id} className="border rounded-lg p-3">
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-2">
                                  <ClipboardCheck className="h-4 w-4 text-primary mt-1" />
                                  <div>
                                    <p className="font-medium">{inspection.title}</p>
                                    {inspection.inspection_date && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {new Date(inspection.inspection_date).toLocaleDateString()}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Badge variant={inspection.status === 'Completed' ? 'default' : 'secondary'}>
                                    {inspection.status}
                                  </Badge>
                                  {inspection.priority && (
                                    <Badge variant="outline">{inspection.priority}</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground py-4">No inspections</p>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No sites found for this client</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientDetail;
