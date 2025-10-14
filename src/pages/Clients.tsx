import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, MoreVertical, Upload, Building2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

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
}

const Clients = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    company_name: "",
    primary_contact_email: "",
  });

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Failed to fetch clients");
    } finally {
      setLoading(false);
    }
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
      fetchClients();
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
      fetchClients();
    } catch (error) {
      console.error("Error deleting client:", error);
      toast.error("Failed to delete client");
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-2">
            An overview of all clients
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {clients.map((client) => (
          <Card
            key={client.id}
            className="group cursor-pointer hover:shadow-lg transition-shadow relative"
            onClick={() => navigate(`/clients/${client.id}`)}
          >
            <CardContent className="p-6">
              <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDelete(client.id)}
                    >
                      Delete Client
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex flex-col items-center text-center space-y-3">
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
                    {client.company_name || client.contact_person || "No sites"}
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
    </div>
  );
};

export default Clients;
