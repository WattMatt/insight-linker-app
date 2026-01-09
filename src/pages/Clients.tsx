import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, MoreVertical, Upload, Building2, Trash2, Pencil } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { clientSchema } from "@/lib/validation-schemas";
import { z } from "zod";
import { EmptyState } from "@/components/EmptyState";

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
  sitesCount?: number;
}

const Clients = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteLogoConfirm, setDeleteLogoConfirm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    company_name: "",
    primary_contact_email: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchAllClients();
  }, []);

  const fetchAllClients = async () => {
    try {
      setLoading(true);

      // Fetch only from Supabase
      const supabaseData = await fetchSupabaseClients();
      setClients(supabaseData.map(c => ({ ...c, source: 'supabase' as const })));
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
      .select("*, sites(id)");

    if (error) {
      console.error("Error fetching Supabase clients:", error);
      return [];
    }

    // Client-side case-insensitive alphabetical sorting
    const sortedData = (data || []).sort((a, b) => {
      const nameA = (a.name || '').toLowerCase().trim();
      const nameB = (b.name || '').toLowerCase().trim();
      return nameA.localeCompare(nameB);
    });

    // Map and count sites for each client
    return sortedData.map(client => ({
      ...client,
      sitesCount: (client.sites as any[])?.length || 0,
      sites: undefined, // Remove sites array to keep data clean
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form data
    const validation = clientSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0].toString()] = err.message;
        }
      });
      setFormErrors(errors);
      toast.error("Please fix the validation errors");
      return;
    }

    const validated = validation.data;

    try {
      setUploading(true);
      setFormErrors({});
      const { data: { user } } = await supabase.auth.getUser();

      let logo_url = null;

      // Upload logo if provided
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `new-client-${Date.now()}/logo.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('client-logos')
          .upload(fileName, logoFile, {
            upsert: true
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('client-logos')
          .getPublicUrl(fileName);

        logo_url = publicUrl;
      }

      const { error } = await supabase.from("clients").insert([
        {
          ...validated,
          logo_url: logo_url ? `${logo_url}?t=${Date.now()}` : null,
          created_by: user?.id,
        } as any,  // Type assertion needed due to zod inference
      ]);

      if (error) throw error;

      // If logo was uploaded, rename the folder to use the actual client ID
      if (logo_url) {
        const insertedClient = await supabase
          .from("clients")
          .select("id")
          .eq("logo_url", logo_url)
          .single();

        if (insertedClient.data) {
          const fileExt = logoFile!.name.split('.').pop();
          const oldPath = `new-client-${Date.now()}/logo.${fileExt}`;
          const newPath = `${insertedClient.data.id}/logo.${fileExt}`;

          // Copy to new location
          const { data: fileData } = await supabase.storage
            .from('client-logos')
            .download(oldPath);

          if (fileData) {
            await supabase.storage
              .from('client-logos')
              .upload(newPath, fileData, { upsert: true });

            // Delete old file
            await supabase.storage
              .from('client-logos')
              .remove([oldPath]);

            // Update URL with cache-busting
            const { data: { publicUrl: newPublicUrl } } = supabase.storage
              .from('client-logos')
              .getPublicUrl(newPath);

            await supabase
              .from("clients")
              .update({ logo_url: `${newPublicUrl}?t=${Date.now()}` })
              .eq("id", insertedClient.data.id);
          }
        }
      }

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
      setLogoPreview(null);
      fetchAllClients();
    } catch (error) {
      console.error("Error adding client:", error);
      toast.error("Failed to add client");
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name || "",
      contact_person: client.contact_person || "",
      email: client.email || "",
      phone: client.phone || "",
      company_name: client.company_name || "",
      primary_contact_email: client.primary_contact_email || "",
    });
    setLogoFile(null);
    setLogoPreview(null);
    setFormErrors({});
    setEditDialogOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    // Validate form data
    const validation = clientSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0].toString()] = err.message;
        }
      });
      setFormErrors(errors);
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      setUploading(true);
      setFormErrors({});

      let logo_url = editingClient.logo_url;

      // Upload new logo if provided
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `${editingClient.id}/logo.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('client-logos')
          .upload(fileName, logoFile, {
            upsert: true
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('client-logos')
          .getPublicUrl(fileName);

        logo_url = publicUrl;
      }

      const { error } = await supabase
        .from("clients")
        .update({
          ...formData,
          logo_url: logo_url ? `${logo_url}?t=${Date.now()}` : editingClient.logo_url,
        })
        .eq("id", editingClient.id);

      if (error) throw error;

      toast.success("Client updated successfully");
      setEditDialogOpen(false);
      setEditingClient(null);
      setFormData({
        name: "",
        contact_person: "",
        email: "",
        phone: "",
        company_name: "",
        primary_contact_email: ""
      });
      setLogoFile(null);
      setLogoPreview(null);
      fetchAllClients();
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error("Failed to update client");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!editingClient?.logo_url) return;

    try {
      // Extract file path from URL and delete from storage
      const url = new URL(editingClient.logo_url);
      const pathParts = url.pathname.split('/');
      const bucketIndex = pathParts.indexOf('client-logos');
      if (bucketIndex !== -1) {
        const filePath = pathParts.slice(bucketIndex + 1).join('/');

        const { error: storageError } = await supabase.storage
          .from('client-logos')
          .remove([filePath]);

        if (storageError) {
          console.error("Error deleting logo from storage:", storageError);
        }
      }

      // Update client record to remove logo URL
      const { error: updateError } = await supabase
        .from('clients')
        .update({ logo_url: null })
        .eq('id', editingClient.id);

      if (updateError) throw updateError;

      toast.success("Logo deleted successfully");
      setEditingClient({ ...editingClient, logo_url: null });
      setDeleteLogoConfirm(false);
      fetchAllClients();
    } catch (error) {
      console.error("Error deleting logo:", error);
      toast.error("Failed to delete logo");
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
            Manage your clients and their sites
          </p>
        </div>
      </div>

      {/* Client Grid */}
      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Get started by creating your first client. You can then add sites and start inspections."
          actionLabel="Create First Client"
          onAction={() => setDialogOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {clients.map((client) => (
            <Card
              key={client.id}
              className="group cursor-pointer hover:shadow-lg transition-all relative glass-card border-none"
              onClick={() => navigate(`/clients/${client.id}/sites`)}
            >
              <CardContent className="p-6">
                {/* Action Menu */}
                <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(client)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Client
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(client.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Client
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="w-32 h-20 flex items-center justify-center bg-muted/50 rounded-lg group-hover:bg-primary/10 transition-colors">
                    {client.logo_url ? (
                      <img
                        key={client.logo_url}
                        src={client.logo_url}
                        alt={client.name}
                        className="max-w-full max-h-full object-contain p-2"
                      />
                    ) : (
                      <Building2 className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
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

          {/* Create New Client Card - Small version for when list is not empty */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Card className="group cursor-pointer hover:shadow-lg transition-all border-dashed border-2 hover:border-primary/50 hover:bg-primary/5">
                <CardContent className="p-6 h-full flex items-center justify-center min-h-[180px]">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="p-3 bg-muted rounded-full group-hover:bg-primary/10 transition-colors">
                      <Plus className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
                    </div>
                    <p className="font-medium text-muted-foreground group-hover:text-foreground transition-colors">Add Client</p>
                  </div>
                </CardContent>
              </Card>
            </DialogTrigger>
            {/* Dialog content matches existing */}
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
                      {formErrors.name && (
                        <p className="text-sm text-destructive">{formErrors.name}</p>
                      )}
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
                        {formErrors.primary_contact_email && (
                          <p className="text-sm text-destructive">{formErrors.primary_contact_email}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold">Branding</h3>
                    <p className="text-sm text-muted-foreground">Upload a logo for the client</p>
                    <div className="space-y-2">
                      <Label>Client Logo</Label>
                      {logoPreview && (
                        <div className="mb-2">
                          <img
                            src={logoPreview}
                            alt="Logo preview"
                            className="w-32 h-24 object-contain border rounded p-2 bg-muted"
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-4">
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
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setLogoFile(file);
                            if (file) {
                              const preview = URL.createObjectURL(file);
                              setLogoPreview(preview);
                            } else {
                              setLogoPreview(null);
                            }
                          }}
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

          {/* Edit Client Dialog */}
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Client</DialogTitle>
                <DialogDescription>
                  Update the client details and logo.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpdate}>
                <div className="space-y-6 py-4">
                  <div className="space-y-4">
                    <h3 className="font-semibold">Client Details</h3>
                    <div className="space-y-2">
                      <Label htmlFor="edit-name">Client Name *</Label>
                      <Input
                        id="edit-name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Fortress Fund"
                        required
                      />
                      {formErrors.name && (
                        <p className="text-sm text-destructive">{formErrors.name}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold">Development Manager / Consultant Details</h3>
                    <div className="space-y-2">
                      <Label htmlFor="edit-company_name">Company Name</Label>
                      <Input
                        id="edit-company_name"
                        value={formData.company_name}
                        onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                        placeholder="e.g., Watson Mattheus Consulting Electrical Engineers"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-contact_person">Primary Contact Name</Label>
                        <Input
                          id="edit-contact_person"
                          value={formData.contact_person}
                          onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                          placeholder="e.g., Ernst De Beer"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-primary_contact_email">Primary Contact Email</Label>
                        <Input
                          id="edit-primary_contact_email"
                          type="email"
                          value={formData.primary_contact_email}
                          onChange={(e) => setFormData({ ...formData, primary_contact_email: e.target.value })}
                          placeholder="e.g., ernst@wmeng.co.za"
                        />
                        {formErrors.primary_contact_email && (
                          <p className="text-sm text-destructive">{formErrors.primary_contact_email}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold">Branding</h3>
                    {editingClient?.logo_url && (
                      <div className="space-y-3">
                        <Label>Current Logo</Label>
                        <div className="relative group w-fit">
                          <div className="border rounded-lg p-2 w-32 h-20 flex items-center justify-center bg-muted">
                            <img
                              key={editingClient.logo_url}
                              src={editingClient.logo_url}
                              alt="Client logo"
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="absolute -top-2 -right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setDeleteLogoConfirm(true)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Upload New Logo</Label>
                      {logoPreview && (
                        <div className="mb-2">
                          <img
                            src={logoPreview}
                            alt="Logo preview"
                            className="w-32 h-24 object-contain border rounded p-2 bg-muted"
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => document.getElementById('edit-logo-upload')?.click()}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Choose File
                        </Button>
                        <input
                          id="edit-logo-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setLogoFile(file);
                            if (file) {
                              const preview = URL.createObjectURL(file);
                              setLogoPreview(preview);
                            } else {
                              setLogoPreview(null);
                            }
                          }}
                        />
                        <span className="text-sm text-muted-foreground">
                          {logoFile ? logoFile.name : "No file chosen"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={uploading}>
                    {uploading ? "Updating..." : "Update Client"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Delete Logo Confirmation */}
          <AlertDialog open={deleteLogoConfirm} onOpenChange={setDeleteLogoConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Logo</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this logo? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteLogo}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
    </div>
  );
};

export default Clients;
