import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, Building2, Database, FileText, ClipboardCheck, Download } from "lucide-react";
import { toast } from "sonner";
import { readFirebaseData } from "@/lib/firebase";
import { migrateClientToSupabase } from "@/lib/migration";

// Data structures
interface Client {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  company_name?: string | null;
  logo_url?: string | null;
  source?: 'firebase' | 'supabase';
  firebaseId?: string;
}

interface Site {
  id: string;
  name: string;
  address: string | null;
  site_type: string | null;
  source?: 'firebase' | 'supabase';
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
  const [migrating, setMigrating] = useState(false);
  const [isFirebaseClient, setIsFirebaseClient] = useState(false);
  const [firebaseData, setFirebaseData] = useState<any>(null);

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

      if (supabaseClient) {
        // It's a Supabase client
        setClient({ ...supabaseClient, source: 'supabase' });
        
        // Process sites with nested data
        const processedSites = (supabaseClient.sites || []).map((site: any) => ({
          ...site,
          source: 'supabase',
          subsections: site.subsections || [],
          inspections: site.inspections || [],
        })).sort((a, b) => a.name.localeCompare(b.name));
        setSites(processedSites);
        setIsFirebaseClient(false);
      } else {
        // Check if it's a Firebase client ID
        setIsFirebaseClient(true);
        await fetchFirebaseClientData(clientId);
      }
    } catch (error) {
      console.error("Error fetching client data:", error);
      toast.error("Failed to fetch client data");
    } finally {
      setLoading(false);
    }
  };

  const fetchFirebaseClientData = async (firebaseClientId: string) => {
    try {
      const data = await readFirebaseData(`/clients/${firebaseClientId}`);
      if (!data) {
        toast.error("Client not found in Firebase");
        return;
      }

      setFirebaseData(data);
      
      // Transform Firebase client data
      setClient({
        id: firebaseClientId,
        name: data.name || data.clientName || data.Name || firebaseClientId,
        contact_person: data.contactPerson || data.contact_person || null,
        email: data.email || data.Email || null,
        phone: data.phone || data.Phone || null,
        company_name: data.companyName || data.company_name || null,
        logo_url: data.logoUrl || data.logo_url || null,
        source: 'firebase',
        firebaseId: firebaseClientId,
      });

      // Transform Firebase sites
      const firebaseSites = data.sites || data.Sites || {};
      const transformedSites: Site[] = Object.entries(firebaseSites).map(([siteId, siteData]: [string, any]) => {
        // Transform subsections
        const subsections = siteData.subsections || siteData.Subsections || {};
        const transformedSubsections = Object.entries(subsections).map(([subId, subData]: [string, any]) => {
          // Transform documents
          const documents = subData.documents || subData.Documents || {};
          const transformedDocuments = Object.entries(documents).map(([docId, docData]: [string, any]) => ({
            id: docId,
            file_name: docData.fileName || docData.file_name || docData.name || 'Unnamed Document',
            file_url: docData.fileUrl || docData.file_url || docData.url || '',
            category: docData.category || docData.Category || 'General',
          }));

          return {
            id: subId,
            name: subData.name || subData.subsectionName || subData.Name || 'Unnamed Subsection',
            description: subData.description || subData.Description || null,
            category: subData.category || subData.Category || null,
            documents: transformedDocuments,
          };
        });

        // Transform inspections
        const inspections = siteData.inspections || siteData.Inspections || {};
        const transformedInspections = Object.entries(inspections).map(([inspId, inspData]: [string, any]) => ({
          id: inspId,
          title: inspData.title || inspData.Title || 'Unnamed Inspection',
          status: inspData.status || inspData.Status || 'Pending',
          priority: inspData.priority || inspData.Priority || 'Medium',
          inspection_date: inspData.inspectionDate || inspData.inspection_date || null,
        }));

        return {
          id: siteId,
          name: siteData.name || siteData.siteName || siteData.Name || 'Unnamed Site',
          address: siteData.address || siteData.Address || null,
          site_type: siteData.siteType || siteData.site_type || siteData.type || null,
          source: 'firebase' as const,
          subsections: transformedSubsections,
          inspections: transformedInspections,
        };
      });

      setSites(transformedSites.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error("Error fetching Firebase data:", error);
      toast.error("Failed to fetch Firebase data");
    }
  };

  const handleMigrateClient = async () => {
    if (!client?.firebaseId || !firebaseData) {
      toast.error("Cannot migrate: Missing Firebase data");
      return;
    }

    setMigrating(true);
    const toastId = toast.loading(`Migrating ${client.name}...`);

    try {
      const result = await migrateClientToSupabase(
        client.firebaseId,
        firebaseData,
        (message) => {
          toast.loading(message, { id: toastId });
        }
      );

      if (result.success) {
        toast.success(
          `Successfully migrated ${client.name}! Sites: ${result.sitesCount}, Subsections: ${result.subsectionsCount}, Inspections: ${result.inspectionsCount}, Documents: ${result.documentsCount}`,
          { id: toastId, duration: 5000 }
        );
        // Navigate to the new Supabase client
        if (result.clientId) {
          navigate(`/clients/${result.clientId}`);
        }
      } else {
        toast.error(`Failed to migrate: ${result.error}`, { id: toastId });
      }
    } catch (error) {
      console.error("Migration error:", error);
      toast.error("Migration failed", { id: toastId });
    } finally {
      setMigrating(false);
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/clients")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
              <Badge variant={client.source === 'firebase' ? 'secondary' : 'default'}>
                <Database className="h-3 w-3 mr-1" />
                {client.source === 'firebase' ? 'Firebase' : 'Supabase'}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {sites.length} sites • {totalSubsections} subsections • {totalInspections} inspections • {totalDocuments} documents
            </p>
          </div>
        </div>
        {isFirebaseClient && (
          <Button onClick={handleMigrateClient} disabled={migrating}>
            <Download className="h-4 w-4 mr-2" />
            {migrating ? 'Migrating...' : 'Migrate to Supabase'}
          </Button>
        )}
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
                  <CardHeader className="cursor-pointer hover:bg-accent" onClick={() => !isFirebaseClient && navigate(`/sites/${site.id}`)}>
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
                                  {subsection.category && (
                                    <Badge variant="secondary" className="mt-2">{subsection.category}</Badge>
                                  )}
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
