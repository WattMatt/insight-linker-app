import { useState, useEffect } from "react";
import { useParams, useNavigate } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Building2, FileText, ClipboardCheck, Upload, Trash2, AlertCircle, Image, Pencil, Briefcase, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCategoryIcon, getCategoryColor } from "@/lib/subsectionCategories";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCamera } from "@/hooks/useCamera";
import { useSiteScores } from "@/hooks/useSiteScores";
import { SiteHealthBadge } from "@/components/SiteHealthBadge";

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
  managing_agency_id?: string | null;
  subsections?: Subsection[];
  inspections?: Inspection[];
}

interface ManagingAgency {
  id: string;
  name: string;
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
  const [agencies, setAgencies] = useState<ManagingAgency[]>([]);
  const [newAgencyName, setNewAgencyName] = useState("");
  const [savingAgency, setSavingAgency] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [deleteLogoConfirm, setDeleteLogoConfirm] = useState(false);
  const { takePicture } = useCamera();
  const { data: siteScores, isLoading: scoresLoading } = useSiteScores(sites.map(s => s.id));

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

      const { data: agencyRows, error: agencyError } = await supabase
        .from("managing_agencies")
        .select("id, name")
        .eq("client_id", clientId)
        .order("name");
      if (agencyError) throw agencyError;
      setAgencies(agencyRows || []);
    } catch (error) {
      console.error("Error fetching client data:", error);
      toast.error("Failed to fetch client data");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!clientId) return;
    setUploadingLogo(true);
    try {
      const path = `${clientId}/logo.${file.name.split('.').pop()}`;
      await supabase.storage.from('client-logos').upload(path, file, { upsert: true });
      const { data } = supabase.storage.from('client-logos').getPublicUrl(path);
      await supabase.from('clients').update({ 
        logo_url: `${data.publicUrl}?t=${Date.now()}` 
      }).eq('id', clientId);
      toast.success("Client logo uploaded - this logo will appear on all sites");
      fetchClientData();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      setLogoPreview(null);
    }
  };

  const handleDeleteLogo = async () => {
    if (!clientId) return;
    try {
      await supabase.from('clients').update({ logo_url: null }).eq('id', clientId);
      toast.success("Client logo deleted");
      fetchClientData();
    } catch (error) {
      toast.error('Failed to delete logo');
    }
  };

  const onCaptureLogo = async () => {
    try {
      const file = await takePicture({ preferCamera: false });
      if (file) {
        const reader = new FileReader();
        const previewPromise = new Promise<string>((resolve, reject) => {
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const result = await previewPromise;
        setLogoPreview(result);
        await handleLogoUpload(file);
      }
    } catch (error) {
      console.error("Logo capture error:", error);
      setLogoPreview(null);
    }
  };

  const isLegacyUrl = (url: string | null | undefined) => {
    if (!url) return false;
    return url.includes('firebasestorage.googleapis.com') ||
      url.includes('storage.googleapis.com') ||
      !url.includes('supabase.co/storage');
  };

  const clearLegacyUrl = async () => {
    if (!clientId) return;
    await supabase.from('clients').update({ logo_url: null }).eq('id', clientId);
    toast.success("Legacy URL removed. Please upload a new logo.");
    fetchClientData();
  };

  const handleAddAgency = async () => {
    const name = newAgencyName.trim();
    if (!clientId || !name) return;
    setSavingAgency(true);
    try {
      const { error } = await supabase
        .from("managing_agencies")
        .insert({ client_id: clientId, name });
      if (error) throw error;
      toast.success(`Managing agency "${name}" added`);
      setNewAgencyName("");
      fetchClientData();
    } catch (error: any) {
      toast.error(
        error?.code === "23505"
          ? `An agency named "${name}" already exists for this client`
          : error.message || "Failed to add managing agency",
      );
    } finally {
      setSavingAgency(false);
    }
  };

  const handleDeleteAgency = async (agency: ManagingAgency) => {
    try {
      const { error } = await supabase
        .from("managing_agencies")
        .delete()
        .eq("id", agency.id);
      if (error) throw error;
      toast.success(`Managing agency "${agency.name}" deleted`);
      fetchClientData();
    } catch (error: any) {
      toast.error(
        error?.code === "23503"
          ? `"${agency.name}" still has sites, users, or share links assigned — unassign them first`
          : error.message || "Failed to delete managing agency",
      );
    }
  };

  const handleAssignSiteAgency = async (siteId: string, agencyId: string | null) => {
    try {
      const { error } = await supabase
        .from("sites")
        .update({ managing_agency_id: agencyId })
        .eq("id", siteId);
      if (error) throw error;
      const agencyName = agencies.find(a => a.id === agencyId)?.name;
      toast.success(agencyId ? `Site assigned to ${agencyName}` : "Site unassigned from agency");
      // Reflect immediately; the assignment is also audited server-side in
      // agency_assignment_history.
      setSites(prev => prev.map(s => s.id === siteId ? { ...s, managing_agency_id: agencyId } : s));
    } catch (error: any) {
      toast.error(error.message || "Failed to update site agency");
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
          {/* Client Logo or Default Icon */}
          <div className="relative group">
            {client.logo_url && !isLegacyUrl(client.logo_url) ? (
              <img 
                src={client.logo_url} 
                alt={`${client.name} logo`}
                className="h-16 w-16 rounded-xl object-contain bg-muted border p-1"
              />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
            )}
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

        {/* Client Logo Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              Client Logo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This logo will be used across all sites for this client.
            </p>
            
            {logoPreview ? (
              <div className="relative w-full aspect-video max-w-[200px]">
                <img
                  src={logoPreview}
                  alt="Preview"
                  className="w-full h-full object-contain rounded border p-2 bg-muted"
                />
                <Badge variant="secondary" className="absolute top-1 left-1 text-xs">
                  Uploading...
                </Badge>
              </div>
            ) : client.logo_url ? (
              <div className="relative group w-full max-w-[200px] aspect-video">
                {isLegacyUrl(client.logo_url) ? (
                  <div className="w-full h-full border-2 border-dashed border-amber-500 rounded flex flex-col items-center justify-center text-muted-foreground p-3">
                    <AlertCircle className="h-5 w-5 text-amber-500 mb-1" />
                    <p className="text-xs text-center mb-2">Legacy URL</p>
                    <Button type="button" size="sm" variant="outline" onClick={clearLegacyUrl}>
                      Clear & Upload New
                    </Button>
                  </div>
                ) : (
                  <>
                    <img
                      src={client.logo_url}
                      alt="Client logo"
                      className="w-full h-full object-contain rounded border p-2 bg-muted"
                    />
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setDeleteLogoConfirm(true)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="w-full max-w-[200px] aspect-video border-2 border-dashed rounded flex items-center justify-center text-muted-foreground text-sm">
                No logo uploaded
              </div>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={onCaptureLogo}
              disabled={uploadingLogo}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
            </Button>
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

        {/* Managing Agencies */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Managing Agencies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Split this client's portfolio between agencies. Portal users assigned
              to an agency only see that agency's sites; users without one see the
              whole portfolio.
            </p>
            {agencies.length > 0 ? (
              <div className="space-y-2">
                {agencies.map((agency) => {
                  const assignedCount = sites.filter(s => s.managing_agency_id === agency.id).length;
                  return (
                    <div key={agency.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{agency.name}</span>
                        <Badge variant="outline">{assignedCount} {assignedCount === 1 ? "site" : "sites"}</Badge>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive"
                        onClick={() => handleDeleteAgency(agency)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No agencies yet — all of this client's users see the whole portfolio.
              </p>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Agency name, e.g. Broll"
                value={newAgencyName}
                onChange={(e) => setNewAgencyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddAgency();
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddAgency}
                disabled={savingAgency || !newAgencyName.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
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
                      <div className="flex items-center gap-2 text-xs">
                        {agencies.length > 0 && (
                          // The header click navigates; the agency picker must not.
                          <div onClick={(e) => e.stopPropagation()}>
                            <Select
                              value={site.managing_agency_id ?? "none"}
                              onValueChange={(value) =>
                                handleAssignSiteAgency(site.id, value === "none" ? null : value)
                              }
                            >
                              <SelectTrigger className="h-7 w-[150px] text-xs">
                                <SelectValue placeholder="Agency" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No agency</SelectItem>
                                {agencies.map((agency) => (
                                  <SelectItem key={agency.id} value={agency.id}>
                                    {agency.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <SiteHealthBadge score={siteScores?.get(site.id)} isLoading={scoresLoading} />
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

      {/* Delete Logo Confirmation */}
      <AlertDialog open={deleteLogoConfirm} onOpenChange={setDeleteLogoConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client Logo</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this client logo? This will remove the logo from all sites under this client.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleDeleteLogo();
                setDeleteLogoConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClientDetail;
