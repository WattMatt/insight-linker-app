import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Link2, 
  Plus, 
  Copy, 
  Trash2, 
  ExternalLink, 
  Clock,
  Eye,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { format } from "date-fns";

interface AccessLink {
  id: string;
  access_token: string;
  client_id: string | null;
  site_id: string | null;
  link_type: string;
  label: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  last_accessed_at: string | null;
  access_count: number;
  clients?: { name: string; company_name?: string } | null;
  sites?: { name: string } | null;
}

interface AccessLinkGeneratorProps {
  siteId?: string;
  clientId?: string;
}

export function AccessLinkGenerator({ siteId, clientId }: AccessLinkGeneratorProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    label: "",
    linkType: "site" as "site" | "client",
    selectedSiteId: siteId || "",
    selectedClientId: clientId || "",
    selectedAgencyId: "",
    expiresIn: "never" as "never" | "7d" | "30d" | "90d"
  });

  // Fetch existing access links
  const { data: accessLinks, isLoading } = useQuery({
    queryKey: ["access-links", siteId, clientId],
    queryFn: async () => {
      let query = supabase
        .from("client_access_links")
        .select(`
          *,
          clients:client_id(name, company_name),
          sites:site_id(name)
        `)
        .order("created_at", { ascending: false });

      if (siteId) {
        query = query.eq("site_id", siteId);
      } else if (clientId) {
        query = query.eq("client_id", clientId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AccessLink[];
    },
  });

  // Fetch sites for dropdown
  const { data: sites } = useQuery({
    queryKey: ["sites-for-links", clientId],
    queryFn: async () => {
      let query = supabase.from("sites").select("id, name, client_id");
      if (clientId) {
        query = query.eq("client_id", clientId);
      }
      const { data, error } = await query.order("name");
      if (error) throw error;
      return data;
    },
    enabled: !siteId,
  });

  // Fetch clients for dropdown
  const { data: clients } = useQuery({
    queryKey: ["clients-for-links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, company_name")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !clientId && !siteId,
  });

  const resolvedSiteId = siteId || formData.selectedSiteId || null;
  const resolvedClientId = clientId || formData.selectedClientId || null;
  const targetMissing =
    formData.linkType === "site" ? !resolvedSiteId : !resolvedClientId;

  // Managing agencies of the portfolio link's client. Optional narrowing: an
  // agency-scoped link only exposes that agency's slice of the portfolio.
  const { data: linkClientAgencies } = useQuery({
    queryKey: ["agencies-for-links", resolvedClientId],
    enabled: formData.linkType === "client" && !!resolvedClientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("managing_agencies")
        .select("id, name")
        .eq("client_id", resolvedClientId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Create access link mutation
  const createLinkMutation = useMutation({
    mutationFn: async () => {
      // Validate the target before creating a link to avoid dead/mis-scoped links
      if (formData.linkType === "site" && !resolvedSiteId) {
        throw new Error("Please select a site for this review link");
      }
      if (formData.linkType === "client" && !resolvedClientId) {
        throw new Error("Please select a client for this portfolio link");
      }

      const expiresAt = formData.expiresIn === "never"
        ? null 
        : new Date(Date.now() + {
            "7d": 7 * 24 * 60 * 60 * 1000,
            "30d": 30 * 24 * 60 * 60 * 1000,
            "90d": 90 * 24 * 60 * 60 * 1000
          }[formData.expiresIn]!).toISOString();

      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("client_access_links")
        .insert({
          label: formData.label || null,
          link_type: formData.linkType,
          site_id: resolvedSiteId,
          client_id: resolvedClientId,
          managing_agency_id:
            formData.linkType === "client" && formData.selectedAgencyId
              ? formData.selectedAgencyId
              : null,
          expires_at: expiresAt,
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["access-links"] });
      setIsDialogOpen(false);
      setFormData({
        label: "",
        linkType: "site",
        selectedSiteId: siteId || "",
        selectedClientId: clientId || "",
        selectedAgencyId: "",
        expiresIn: "never"
      });

      // Copy link to clipboard
      const linkPath = data.link_type === 'client' ? 'portfolio' : 'review';
      const link = `${window.location.origin}/${linkPath}/${data.access_token}`;
      navigator.clipboard.writeText(link);
      toast.success("Access link created and copied to clipboard!");
    },
    onError: (error: any) => {
      console.error("Error creating access link:", error);
      toast.error(error?.message || "Failed to create access link");
    },
  });

  // Delete access link mutation
  const deleteLinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_access_links")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-links"] });
      setDeleteId(null);
      toast.success("Access link deleted");
    },
    onError: (error) => {
      console.error("Error deleting access link:", error);
      toast.error("Failed to delete access link");
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("client_access_links")
        .update({ is_active: isActive })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-links"] });
      toast.success("Link status updated");
    },
    onError: (error) => {
      console.error("Error updating link:", error);
      toast.error("Failed to update link status");
    },
  });

  const copyLink = (token: string, linkType: string) => {
    const linkPath = linkType === 'client' ? 'portfolio' : 'review';
    const url = `${window.location.origin}/${linkPath}/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard!");
  };

  const openLink = (token: string, linkType: string) => {
    const linkPath = linkType === 'client' ? 'portfolio' : 'review';
    window.open(`${window.location.origin}/${linkPath}/${token}`, "_blank");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Shareable Access Links
            </CardTitle>
            <CardDescription>
              Create and manage public review links for clients
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Link
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Access Link</DialogTitle>
                <DialogDescription>
                  Generate a shareable link for clients to review site compliance
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="label">Label (optional)</Label>
                  <Input
                    id="label"
                    placeholder="e.g., Monthly Review - Jan 2024"
                    value={formData.label}
                    onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                  />
                </div>

                {!siteId && !clientId && (
                  <>
                    <div className="space-y-2">
                      <Label>Link Type</Label>
                      <Select
                        value={formData.linkType}
                        onValueChange={(v: "site" | "client") =>
                          setFormData(prev => ({ ...prev, linkType: v, selectedAgencyId: "" }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="site">Site Review</SelectItem>
                          <SelectItem value="client">Client Portfolio</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.linkType === "site" && (
                      <div className="space-y-2">
                        <Label>Select Site</Label>
                        <Select
                          value={formData.selectedSiteId}
                          onValueChange={(v) => 
                            setFormData(prev => ({ ...prev, selectedSiteId: v }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a site..." />
                          </SelectTrigger>
                          <SelectContent>
                            {sites?.map((site) => (
                              <SelectItem key={site.id} value={site.id}>
                                {site.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {formData.linkType === "client" && (
                      <div className="space-y-2">
                        <Label>Select Client</Label>
                        <Select
                          value={formData.selectedClientId}
                          onValueChange={(v) =>
                            setFormData(prev => ({ ...prev, selectedClientId: v, selectedAgencyId: "" }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a client..." />
                          </SelectTrigger>
                          <SelectContent>
                            {clients?.map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.company_name || client.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}

                {formData.linkType === "client" && (linkClientAgencies?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <Label>Managing Agency (optional)</Label>
                    <Select
                      value={formData.selectedAgencyId || "all"}
                      onValueChange={(v) =>
                        setFormData(prev => ({ ...prev, selectedAgencyId: v === "all" ? "" : v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Entire portfolio</SelectItem>
                        {linkClientAgencies?.map((agency) => (
                          <SelectItem key={agency.id} value={agency.id}>
                            {agency.name} only
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      An agency-scoped link only shows that agency's sites.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Expiration</Label>
                  <Select
                    value={formData.expiresIn}
                    onValueChange={(v: "never" | "7d" | "30d" | "90d") => 
                      setFormData(prev => ({ ...prev, expiresIn: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never expires</SelectItem>
                      <SelectItem value="7d">7 days</SelectItem>
                      <SelectItem value="30d">30 days</SelectItem>
                      <SelectItem value="90d">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createLinkMutation.mutate()}
                  disabled={createLinkMutation.isPending || targetMissing}
                >
                  {createLinkMutation.isPending ? "Creating..." : "Create & Copy Link"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : !accessLinks || accessLinks.length === 0 ? (
          <div className="text-center py-8">
            <Link2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No access links created yet</p>
            <p className="text-sm text-muted-foreground">
              Create a shareable link to give clients access to review their compliance status
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Last Accessed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accessLinks.map((link) => {
                const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
                const isValid = link.is_active && !isExpired;

                return (
                  <TableRow key={link.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{link.label || "Unnamed Link"}</p>
                        <p className="text-xs text-muted-foreground">
                          Created {format(new Date(link.created_at), "MMM d, yyyy")}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {link.sites?.name || link.clients?.company_name || link.clients?.name || "—"}
                    </TableCell>
                    <TableCell>
                      {isExpired ? (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                          <Clock className="h-3 w-3 mr-1" />
                          Expired
                        </Badge>
                      ) : link.is_active ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                          <XCircle className="h-3 w-3 mr-1" />
                          Disabled
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3 text-muted-foreground" />
                        {link.access_count}
                      </div>
                    </TableCell>
                    <TableCell>
                      {link.last_accessed_at 
                        ? format(new Date(link.last_accessed_at), "MMM d, yyyy HH:mm")
                        : "Never"
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => copyLink(link.access_token, link.link_type)}
                          title="Copy link"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openLink(link.access_token, link.link_type)}
                          title="Open link"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toggleActiveMutation.mutate({ 
                            id: link.id, 
                            isActive: !link.is_active 
                          })}
                          title={link.is_active ? "Disable link" : "Enable link"}
                        >
                          {link.is_active ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteId(link.id)}
                          title="Delete link"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Access Link?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently revoke access for anyone using this link. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteId && deleteLinkMutation.mutate(deleteId)}
              >
                Delete Link
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

export default AccessLinkGenerator;