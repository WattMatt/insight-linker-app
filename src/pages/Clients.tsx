import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, MoreVertical, Upload, Building2, Download, Database } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  fetchFirebaseClients, 
  migrateClientToSupabase, 
  migrateAllFromFirebase,
  type MigrationProgress 
} from "@/lib/migration";

interface Client {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  company_name: string | null;
  primary_contact_email: string | null;
  created_at: string;
  source?: 'firebase' | 'supabase';
  firebaseId?: string;
  _rawData?: any;
  sitesCount?: number;
}

const Clients = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'firebase' | 'supabase'>('all');
  const [migrating, setMigrating] = useState(false);
  const [bulkMigrationOpen, setBulkMigrationOpen] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    company_name: "",
    primary_contact_email: "",
  });

  useEffect(() => {
    fetchAllClients();
  }, []);

  const fetchAllClients = async () => {
    try {
      setLoading(true);

      // Fetch from both sources in parallel
      const [supabaseData, firebaseData] = await Promise.all([
        fetchSupabaseClients(),
        fetchFirebaseClients(),
      ]);

      // Combine both sources
      const combined = [
        ...supabaseData.map(c => ({ ...c, source: 'supabase' as const })),
        ...firebaseData,
      ];

      setClients(combined);
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Failed to fetch clients");
    } finally {
      setLoading(false);
    }
  };

  const fetchSupabaseClients = async (): Promise<Client[]> => {
    const { data, error } = await supabase
      .from("clients")
      .select("*, sites(id)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching Supabase clients:", error);
      return [];
    }
    
    // Map and count sites for each client
    return (data || []).map(client => ({
      ...client,
      sitesCount: (client.sites as any[])?.length || 0,
      sites: undefined, // Remove sites array to keep data clean
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      let logo_url = null;

      // Upload logo if provided
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('client-logos')
          .upload(filePath, logoFile, {
            upsert: true
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('client-logos')
          .getPublicUrl(filePath);

        logo_url = publicUrl;
      }
      
      const { error } = await supabase.from("clients").insert([
        {
          ...formData,
          logo_url,
          created_by: user?.id,
        },
      ]);

      if (error) throw error;

      toast.success("Client added successfully");
      setDialogOpen(false);
      setFormData({ 
        name: "", 
        contact_person: "", 
        email: "", 
        phone: "",
        company_name: "",
        primary_contact_email: ""
      });
      setLogoFile(null);
      fetchAllClients();
    } catch (error) {
      console.error("Error adding client:", error);
      toast.error("Failed to add client");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this client?")) return;

    try {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;

      toast.success("Client deleted successfully");
      fetchAllClients();
    } catch (error) {
      console.error("Error deleting client:", error);
      toast.error("Failed to delete client");
    }
  };

  const handleMigrateClient = async (client: Client) => {
    if (!client.firebaseId || !client._rawData) {
      toast.error("Cannot migrate: Missing Firebase data");
      return;
    }

    setMigrating(true);
    const toastId = toast.loading(`Migrating ${client.name}...`);

    try {
      const result = await migrateClientToSupabase(
        client.firebaseId,
        client._rawData,
        (message) => {
          toast.loading(message, { id: toastId });
        }
      );

      if (result.success) {
        toast.success(
          `Successfully migrated ${client.name}!\n` +
          `Sites: ${result.sitesCount}, Subsections: ${result.subsectionsCount}, ` +
          `Inspections: ${result.inspectionsCount}, Documents: ${result.documentsCount}`,
          { id: toastId, duration: 5000 }
        );
        fetchAllClients();
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

  const handleBulkMigration = async () => {
    setBulkMigrationOpen(false);
    setMigrating(true);
    const toastId = toast.loading("Starting bulk migration...");

    try {
      const result = await migrateAllFromFirebase((progress) => {
        setMigrationProgress(progress);
        toast.loading(
          `Migrating ${progress.currentEntity} (${progress.itemsMigrated}/${progress.totalItems})`,
          { id: toastId }
        );
      });

      toast.success(
        `Bulk migration complete!\n` +
        `Success: ${result.success}, Failed: ${result.failed}`,
        { id: toastId, duration: 5000 }
      );

      if (result.errors.length > 0) {
        console.error("Migration errors:", result.errors);
      }

      fetchAllClients();
    } catch (error) {
      console.error("Bulk migration error:", error);
      toast.error("Bulk migration failed", { id: toastId });
    } finally {
      setMigrating(false);
      setMigrationProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading clients...</p>
        </div>
      </div>
    );
  }

  const filteredClients = clients.filter((client) => {
    if (activeTab === 'all') return true;
    return client.source === activeTab;
  });

  const firebaseCount = clients.filter(c => c.source === 'firebase').length;
  const supabaseCount = clients.filter(c => c.source === 'supabase').length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-2">
            Managing {firebaseCount} Firebase and {supabaseCount} Supabase clients
          </p>
        </div>
        {firebaseCount > 0 && (
          <Button
            onClick={() => setBulkMigrationOpen(true)}
            disabled={migrating}
            variant="outline"
          >
            <Download className="mr-2 h-4 w-4" />
            Migrate All from Firebase ({firebaseCount})
          </Button>
        )}
      </div>

      {/* Migration Progress */}
      {migrationProgress && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Migrating: {migrationProgress.currentEntity}</span>
                <span>{migrationProgress.percentage}%</span>
              </div>
              <Progress value={migrationProgress.percentage} />
              <p className="text-xs text-muted-foreground">
                {migrationProgress.itemsMigrated} of {migrationProgress.totalItems} clients
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Migration Confirmation Dialog */}
      <Dialog open={bulkMigrationOpen} onOpenChange={setBulkMigrationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Migrate All Clients from Firebase</DialogTitle>
            <DialogDescription>
              This will migrate {firebaseCount} clients and all their nested data (sites, subsections, inspections, documents) from Firebase to Supabase.
              This process may take several minutes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkMigrationOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkMigration}>
              Start Migration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filter Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All ({clients.length})</TabsTrigger>
          <TabsTrigger value="firebase">
            Firebase ({firebaseCount})
          </TabsTrigger>
          <TabsTrigger value="supabase">
            Supabase ({supabaseCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredClients.map((client) => (
              <Card
                key={client.id}
                className="group cursor-pointer hover:shadow-lg transition-shadow relative"
                onClick={() => {
                  if (client.source === 'supabase') {
                    navigate(`/clients/${client.id}`);
                  } else {
                    toast.info("Firebase clients are read-only. Please migrate to view details.");
                  }
                }}
              >
                <CardContent className="p-6">
                  {/* Source Badge */}
                  <div className="absolute top-2 left-2">
                    <Badge 
                      variant={client.source === 'firebase' ? 'secondary' : 'default'}
                      className="flex items-center gap-1"
                    >
                      <Database className="h-3 w-3" />
                      {client.source === 'firebase' ? 'Firebase' : 'Supabase'}
                    </Badge>
                  </div>

                  {/* Action Menu */}
                  <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {client.source === 'firebase' ? (
                          <DropdownMenuItem
                            onClick={() => handleMigrateClient(client)}
                            disabled={migrating}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Migrate to Supabase
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDelete(client.id)}
                          >
                            Delete Client
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex flex-col items-center text-center space-y-3 mt-6">
                    <div className="w-32 h-20 flex items-center justify-center bg-muted rounded-lg">
                      {client.logo_url ? (
                        <img
                          src={client.logo_url}
                          alt={client.name}
                          className="max-w-full max-h-full object-contain p-2"
                        />
                      ) : (
                        <Building2 className="h-10 w-10 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold">{client.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {client.sitesCount !== undefined 
                          ? `${client.sitesCount} ${client.sitesCount === 1 ? 'site' : 'sites'}`
                          : 'No sites'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
        ))}

            {/* Create New Client Card */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Card className="group cursor-pointer hover:shadow-lg transition-shadow border-dashed">
              <CardContent className="p-6 h-full flex items-center justify-center">
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="w-32 h-20 flex items-center justify-center bg-muted rounded-lg">
                    <Plus className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <p className="font-semibold">Create New Client</p>
                </div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Client</DialogTitle>
              <DialogDescription>
                Fill in the details for the new client.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-6 py-4">
                <div className="space-y-4">
                  <h3 className="font-semibold">Client Details</h3>
                  <div className="space-y-2">
                    <Label htmlFor="name">Client Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Fortress Fund"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">Development Manager / Consultant Details</h3>
                  <div className="space-y-2">
                    <Label htmlFor="company_name">Company Name</Label>
                    <Input
                      id="company_name"
                      value={formData.company_name}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                      placeholder="e.g., Watson Mattheus Consulting Electrical Engineers"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contact_person">Primary Contact Name</Label>
                      <Input
                        id="contact_person"
                        value={formData.contact_person}
                        onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                        placeholder="e.g., Ernst De Beer"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="primary_contact_email">Primary Contact Email</Label>
                      <Input
                        id="primary_contact_email"
                        type="email"
                        value={formData.primary_contact_email}
                        onChange={(e) => setFormData({ ...formData, primary_contact_email: e.target.value })}
                        placeholder="e.g., ernst@wmeng.co.za"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">Branding</h3>
                  <p className="text-sm text-muted-foreground">Upload a logo for the client</p>
                  <div className="space-y-2">
                    <Label>Client Logo</Label>
                    <div className="flex items-center gap-4">
                      {logoFile && (
                        <div className="border rounded-lg p-2 w-20 h-20 flex items-center justify-center">
                          <span className="text-xs text-muted-foreground text-center">Preview</span>
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById('logo-upload')?.click()}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Choose File
                      </Button>
                      <input
                        id="logo-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                      />
                      <span className="text-sm text-muted-foreground">
                        {logoFile ? logoFile.name : "No file chosen"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? "Creating..." : "Create Client"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
            </Dialog>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Clients;
