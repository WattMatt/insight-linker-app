import { useEffect, useState } from "react";
import { useParams, useNavigate } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Building2, MapPin, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { siteSchema } from "@/lib/validation-schemas";
import { z } from "zod";
import { RobustImage } from "@/components/RobustImage";
import { EmptyState } from "@/components/EmptyState";
import { BulkSiteReportGenerator } from "@/components/BulkSiteReportGenerator";
import { useSiteScores } from "@/hooks/useSiteScores";
import { SiteHealthBadge } from "@/components/SiteHealthBadge";
import { SITE_TYPE_OPTIONS } from "@/lib/siteTypes";

interface Site {
  id: string;
  name: string;
  address: string | null;
  site_type: string | null;
  site_image_url: string | null;
  client_logo_url: string | null;
  client_id: string;
  clients: {
    name: string;
  };
}

interface Client {
  id: string;
  name: string;
}

interface ManagingAgency {
  id: string;
  name: string;
  client_id: string;
}

const Sites = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [agencies, setAgencies] = useState<ManagingAgency[]>([]);
  const [currentClient, setCurrentClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    site_type: "",
    client_id: "",
    managing_agency_id: "",
  });
  const { data: siteScores, isLoading: scoresLoading } = useSiteScores(sites.map(s => s.id));

  useEffect(() => {
    fetchData();
  }, [clientId]);

  const fetchData = async () => {
    try {
      let sitesQuery = supabase.from("sites").select("*, clients(name)").order("name", { ascending: true });

      // Filter by clientId if present in URL
      if (clientId) {
        sitesQuery = sitesQuery.eq("client_id", clientId);
      }

      const [sitesRes, clientsRes, agenciesRes] = await Promise.all([
        sitesQuery,
        supabase.from("clients").select("id, name").order("name"),
        supabase.from("managing_agencies").select("id, name, client_id").order("name"),
      ]);

      if (sitesRes.error) throw sitesRes.error;
      if (clientsRes.error) throw clientsRes.error;
      if (agenciesRes.error) throw agenciesRes.error;

      // Generate signed URLs for site images (site-images bucket is private)
      const sitesWithSignedUrls = await Promise.all(
        (sitesRes.data || []).map(async (site) => {
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

      setSites(sitesWithSignedUrls);
      setClients(clientsRes.data || []);
      setAgencies(agenciesRes.data || []);

      // Set current client if filtering by clientId
      if (clientId && clientsRes.data) {
        const client = clientsRes.data.find(c => c.id === clientId);
        setCurrentClient(client || null);
      }

      // Pre-fill client_id in form if viewing client-specific sites
      if (clientId) {
        setFormData(prev => ({ ...prev, client_id: clientId }));
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate input
      const validated = siteSchema.parse(formData);

      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from("sites").insert([
        {
          ...validated,
          // Not part of siteSchema (zod strips unknown keys); guarded by the
          // composite FK so it can only reference the chosen client's agency.
          managing_agency_id: formData.managing_agency_id || null,
          created_by: user?.id,
        } as any,  // Type assertion needed due to zod inference
      ]);

      if (error) throw error;

      toast.success("Site added successfully");
      setDialogOpen(false);
      setFormData({ name: "", address: "", site_type: "", client_id: "", managing_agency_id: "" });
      fetchData();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        error.errors.forEach(err => {
          toast.error(`${err.path.join('.')}: ${err.message}`);
        });
      } else {
        console.error("Error adding site:", error);
        toast.error(error.message || "Failed to add site");
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this site?")) return;

    try {
      const { error } = await supabase.from("sites").delete().eq("id", id);
      if (error) throw error;

      toast.success("Site deleted successfully");
      fetchData();
    } catch (error) {
      console.error("Error deleting site:", error);
      toast.error("Failed to delete site");
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
      {clientId && currentClient && (
        <Breadcrumbs
          items={[
            { label: "Clients", href: "/clients" },
            { label: currentClient.name, href: `/clients/${clientId}` },
            { label: "Sites" },
          ]}
        />
      )}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {currentClient ? `${currentClient.name} - Sites` : "Sites"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {currentClient
              ? `Manage sites for ${currentClient.name}`
              : "Manage inspection sites and locations"}
          </p>
        </div>
        <div className="flex items-center gap-2">
        {sites.length > 0 && (
          <BulkSiteReportGenerator
            sites={sites.map(s => ({ id: s.id, name: s.name, clientName: s.clients?.name || "" }))}
          />
        )}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={clients.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Add Site
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Site</DialogTitle>
              <DialogDescription>
                Create a new site location for inspections.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="client">Client *</Label>
                  <Select
                    value={formData.client_id}
                    onValueChange={(value) => setFormData({ ...formData, client_id: value, managing_agency_id: "" })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Site Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Main Building"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="site_type">Site Type</Label>
                  <Select
                    value={formData.site_type}
                    onValueChange={(value) => setFormData({ ...formData, site_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select site type" />
                    </SelectTrigger>
                    <SelectContent>
                      {SITE_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {formData.client_id && agencies.some(a => a.client_id === formData.client_id) && (
                  <div className="space-y-2">
                    <Label htmlFor="managing_agency">Managing Agency</Label>
                    <Select
                      value={formData.managing_agency_id || "none"}
                      onValueChange={(value) =>
                        setFormData({ ...formData, managing_agency_id: value === "none" ? "" : value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No agency</SelectItem>
                        {agencies
                          .filter(a => a.client_id === formData.client_id)
                          .map(agency => (
                            <SelectItem key={agency.id} value={agency.id}>
                              {agency.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Agency-scoped portal users only see sites assigned to their agency.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="123 Main St, City, State"
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Create Site</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {clients.length === 0 && (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="text-warning">No Clients Available</CardTitle>
            <CardDescription>
              You need to add at least one client before creating sites. Go to the Clients page to add your first client.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Site List</CardTitle>
          <CardDescription>
            {sites.length} {sites.length === 1 ? "site" : "sites"} registered
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sites.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No sites yet"
              description="Add your first site to start managing inspections for this client."
              actionLabel="Add First Site"
              onAction={() => setDialogOpen(true)}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sites.map((site) => (
                <Card
                  key={site.id}
                  className="group relative overflow-hidden transition-all cursor-pointer glass-card border-none hover:shadow-2xl"
                  onClick={() => navigate(`/clients/${site.client_id}/sites/${site.id}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {site.site_image_url ? (
                          <RobustImage
                            src={site.site_image_url}
                            alt={site.name}
                            className="h-12 w-12 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Building2 className="h-6 w-6 text-primary" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate">{site.name}</CardTitle>
                          <p className="text-xs text-muted-foreground truncate">{site.clients?.name}</p>
                        </div>
                      </div>
                      <SiteHealthBadge score={siteScores?.get(site.id)} isLoading={scoresLoading} className="mr-1" />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(site.id);
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Site
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {site.site_type && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        <Building2 className="h-3 w-3" />
                        <span>{site.site_type}</span>
                      </div>
                    )}
                    {site.address && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{site.address}</span>
                      </div>
                    )}
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

export default Sites;
