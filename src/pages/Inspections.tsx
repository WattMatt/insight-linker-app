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
import { Plus, Trash2, ClipboardCheck, WifiOff, Link2Off } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { inspectionSchema } from "@/lib/validation-schemas";
import { z } from "zod";
import { useOfflineInspections } from "@/hooks/useOfflineInspections";
import { offlineDB } from "@/lib/offlineDB";

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

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Inspection | null>(null);
  const [assignSubsections, setAssignSubsections] = useState<Array<{ id: string; name: string }>>([]);
  const [assignSubsectionId, setAssignSubsectionId] = useState<string>("");
  const [assignSaving, setAssignSaving] = useState(false);

  const { createInspection, deleteInspection, isOnline } = useOfflineInspections();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch online data
      const [inspectionsRes, sitesRes] = await Promise.all([
        supabase
          .from("inspections")
          .select("*, sites(id, name, client_id, clients(id, name)), subsections(id, name)")
          .order("created_at", { ascending: false }),
        supabase.from("sites").select("id, name, clients(name)").order("name"),
      ]);

      if (inspectionsRes.error) throw inspectionsRes.error;
      if (sitesRes.error) throw sitesRes.error;

      let allInspections = inspectionsRes.data || [];

      // If offline, merge with offline inspections
      if (!isOnline) {
        const offlineInspections = await offlineDB.getUnsyncedInspections();
        // Add offline inspections to the list with all required fields
        const offlineMapped = offlineInspections.map(offline => {
          const site = sites.find(s => s.id === offline.site_id);
          return {
            id: offline.id,
            title: offline.title,
            description: offline.description,
            status: offline.status,
            inspection_date: offline.inspection_date,
            site_id: offline.site_id,
            subsection_id: null,
            sites: site ? {
              id: site.id,
              name: site.name,
              client_id: site.clients?.name || '',
              clients: {
                id: '',
                name: site.clients?.name || ''
              }
            } : { 
              id: offline.site_id, 
              name: 'Unknown Site', 
              client_id: '', 
              clients: { id: '', name: '' } 
            },
            subsections: undefined,
          };
        });
        allInspections = [...offlineMapped, ...allInspections] as any[];
      }

      setInspections(allInspections);
      setSites(sitesRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      
      // If completely offline, load from IndexedDB
      if (!isOnline) {
        try {
          const offlineInspections = await offlineDB.getUnsyncedInspections();
          const offlineMapped: Inspection[] = offlineInspections.map(offline => ({
            id: offline.id,
            title: offline.title,
            description: offline.description,
            status: offline.status,
            inspection_date: offline.inspection_date,
            site_id: offline.site_id,
            subsection_id: null,
            sites: { 
              id: offline.site_id, 
              name: 'Offline Site', 
              client_id: '', 
              clients: { id: '', name: '' } 
            },
            subsections: undefined,
          }));
          setInspections(offlineMapped as any[]);
          toast.info("Showing offline data only");
        } catch (dbError) {
          toast.error("Failed to load offline data");
        }
      } else {
        toast.error("Failed to fetch data");
      }
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

      await createInspection({
        title: validated.title,
        description: validated.description,
        status: validated.status,
        inspection_date: validated.inspection_date,
        site_id: validated.site_id,
        inspector_id: user?.id,
      });

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
      await deleteInspection(id);
      fetchData();
    } catch (error) {
      console.error("Error deleting inspection:", error);
      toast.error("Failed to delete inspection");
    }
  };

  const openAssignDialog = async (inspection: Inspection) => {
    setAssignTarget(inspection);
    setAssignSubsectionId("");
    setAssignSubsections([]);
    setAssignOpen(true);
    try {
      const { data, error } = await supabase
        .from("subsections")
        .select("id, name")
        .eq("site_id", inspection.site_id)
        .order("name");
      if (error) throw error;
      setAssignSubsections(data || []);
    } catch (err) {
      console.error("Failed to load subsections for site", err);
      toast.error("Could not load subsections for this site");
    }
  };

  const submitAssign = async () => {
    if (!assignTarget || !assignSubsectionId) return;
    setAssignSaving(true);
    try {
      const { error } = await supabase
        .from("inspections")
        .update({ subsection_id: assignSubsectionId })
        .eq("id", assignTarget.id);
      if (error) throw error;
      toast.success("Inspection linked to subsection");
      setAssignOpen(false);
      setAssignTarget(null);
      fetchData();
    } catch (err) {
      console.error("Failed to assign subsection", err);
      toast.error("Failed to link inspection");
    } finally {
      setAssignSaving(false);
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
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Inspections</h1>
            {!isOnline && (
              <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                <WifiOff className="h-3 w-3 mr-1" />
                Offline Mode
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-2">
            Manage electrical safety inspections {!isOnline && '(offline-first)'}
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
                      // Check if offline inspection
                      if (inspection.id.startsWith('offline_')) {
                        toast.info("This inspection is saved offline. Sync when online to view details.");
                        return;
                      }

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
                        openAssignDialog(inspection);
                      }
                    }}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {inspection.title}
                        {inspection.id.startsWith('offline_') && (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">
                            Offline
                          </Badge>
                        )}
                        {!inspection.id.startsWith('offline_') && !inspection.subsection_id && (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs gap-1"
                            title="Not linked to a subsection — click to assign"
                          >
                            <Link2Off className="h-3 w-3" />
                            Unlinked
                          </Badge>
                        )}
                      </div>
                    </TableCell>
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

      <Dialog open={assignOpen} onOpenChange={(open) => { setAssignOpen(open); if (!open) setAssignTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link inspection to a subsection</DialogTitle>
            <DialogDescription>
              {assignTarget
                ? `"${assignTarget.title}" at ${assignTarget.sites?.name} isn't linked to a subsection yet. Pick one to assign it to.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Subsection</Label>
            <Select value={assignSubsectionId} onValueChange={setAssignSubsectionId}>
              <SelectTrigger>
                <SelectValue placeholder={assignSubsections.length ? "Select a subsection" : "Loading…"} />
              </SelectTrigger>
              <SelectContent>
                {assignSubsections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignSubsections.length === 0 && (
              <p className="text-xs text-muted-foreground">This site has no subsections yet — create one from the site page first.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assignSaving}>Cancel</Button>
            <Button onClick={submitAssign} disabled={!assignSubsectionId || assignSaving}>
              {assignSaving ? "Linking…" : "Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inspections;
