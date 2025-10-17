import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { inspectionSchema } from "@/lib/validation-schemas";
import { z } from "zod";

interface Inspection {
  id: string;
  title: string;
  description: string | null;
  status: string;
  inspection_date: string | null;
  site_id: string;
  subsection_id: string | null;
  sites: {
    id: string;
    name: string;
    client_id: string;
    clients: {
      id: string;
      name: string;
    };
  };
  subsections?: {
    id: string;
    name: string;
  };
}

interface Site {
  id: string;
  name: string;
  clients: {
    name: string;
  };
}

const Inspections = () => {
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "Pending",
    inspection_date: "",
    site_id: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [inspectionsRes, sitesRes] = await Promise.all([
        supabase
          .from("inspections")
          .select("*, sites(id, name, client_id, clients(id, name)), subsections(id, name)")
          .order("created_at", { ascending: false }),
        supabase.from("sites").select("id, name, clients(name)").order("name"),
      ]);

      if (inspectionsRes.error) throw inspectionsRes.error;
      if (sitesRes.error) throw sitesRes.error;

      setInspections(inspectionsRes.data || []);
      setSites(sitesRes.data || []);
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
      const validated = inspectionSchema.parse(formData);
      
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from("inspections").insert([
        {
          ...validated,
          inspector_id: user?.id,
        } as any,  // Type assertion needed due to zod inference
      ]);

      if (error) throw error;

      toast.success("Inspection created successfully");
      setDialogOpen(false);
      setFormData({
        title: "",
        description: "",
        status: "Pending",
        inspection_date: "",
        site_id: "",
      });
      fetchData();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        error.errors.forEach(err => {
          toast.error(`${err.path.join('.')}: ${err.message}`);
        });
      } else {
        console.error("Error creating inspection:", error);
        toast.error(error.message || "Failed to create inspection");
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this inspection?")) return;

    try {
      const { error } = await supabase.from("inspections").delete().eq("id", id);
      if (error) throw error;

      toast.success("Inspection deleted successfully");
      fetchData();
    } catch (error) {
      console.error("Error deleting inspection:", error);
      toast.error("Failed to delete inspection");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Completed":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "In Progress":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "Pending":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading inspections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inspections</h1>
          <p className="text-muted-foreground mt-2">
            Manage electrical safety inspections
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={sites.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              New Inspection
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Inspection</DialogTitle>
              <DialogDescription>
                Schedule a new electrical inspection for a site.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="site">Site *</Label>
                  <Select
                    value={formData.site_id}
                    onValueChange={(value) => setFormData({ ...formData, site_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name} ({site.clients?.name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Inspection Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Electrical Safety Inspection"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Annual compliance check"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inspection_date">Inspection Date</Label>
                  <Input
                    id="inspection_date"
                    type="date"
                    value={formData.inspection_date}
                    onChange={(e) => setFormData({ ...formData, inspection_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status *</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Create Inspection</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {sites.length === 0 && (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="text-warning">No Sites Available</CardTitle>
            <CardDescription>
              You need to add at least one site before creating inspections. Go to the Sites page to add your first site.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Inspection List</CardTitle>
          <CardDescription>
            {inspections.length} {inspections.length === 1 ? "inspection" : "inspections"} recorded
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inspections.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No inspections yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first inspection to get started
              </p>
              {sites.length > 0 && (
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Inspection
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.map((inspection) => (
                  <TableRow 
                    key={inspection.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      if (inspection.subsection_id && inspection.subsections) {
                        // Navigate through the proper hierarchy
                        const clientId = inspection.sites.client_id;
                        const siteId = inspection.site_id;
                        const subsectionId = inspection.subsection_id;
                        const basePath = clientId 
                          ? `/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}` 
                          : `/sites/${siteId}/subsections/${subsectionId}`;
                        navigate(`${basePath}/inspections/${inspection.id}`);
                      } else {
                        toast.info("This inspection is not linked to a subsection");
                      }
                    }}
                  >
                    <TableCell className="font-medium">{inspection.title}</TableCell>
                    <TableCell>{inspection.sites?.name}</TableCell>
                    <TableCell>{inspection.sites?.clients?.name}</TableCell>
                    <TableCell>
                      {inspection.inspection_date
                        ? format(new Date(inspection.inspection_date), "MMM dd, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(inspection.status)}>
                        {inspection.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(inspection.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Inspections;
