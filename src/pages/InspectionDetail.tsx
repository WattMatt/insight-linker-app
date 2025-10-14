import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Save, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Inspection {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  inspection_date: string | null;
  end_date: string | null;
  project_name: string | null;
  shop_number: string | null;
  shop_name: string | null;
  inspector_name: string | null;
  client_rep: string | null;
  consultant: string | null;
  contractor: string | null;
  testing_party: string | null;
  location: string | null;
  subsection_id: string;
  site_id: string;
  subsections: {
    id: string;
    name: string;
    sites: {
      id: string;
      name: string;
      clients: {
        id: string;
        name: string;
      };
    };
  };
}

const InspectionDetail = () => {
  const { clientId, siteId, subsectionId, inspectionId } = useParams();
  const navigate = useNavigate();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Inspection>>({});

  useEffect(() => {
    fetchInspectionData();
  }, [inspectionId]);

  const fetchInspectionData = async () => {
    try {
      const { data, error } = await supabase
        .from("inspections")
        .select("*, subsections(id, name, sites(id, name, clients(id, name)))")
        .eq("id", inspectionId)
        .single();

      if (error) throw error;
      setInspection(data);
      setFormData(data);
    } catch (error) {
      console.error("Error fetching inspection:", error);
      toast.error("Failed to fetch inspection data");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from("inspections")
        .update(formData)
        .eq("id", inspectionId);

      if (error) throw error;
      toast.success("Inspection updated successfully");
      setEditing(false);
      fetchInspectionData();
    } catch (error) {
      console.error("Error updating inspection:", error);
      toast.error("Failed to update inspection");
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "Medium":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "Low":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold mb-2">Inspection not found</h3>
        <Button onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}`)}>
          Back to Subsection
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Clients", href: "/clients" },
          { label: inspection.subsections.sites.clients.name, href: `/clients/${clientId}` },
          { label: inspection.subsections.sites.name, href: `/clients/${clientId}/sites/${siteId}` },
          { label: inspection.subsections.name, href: `/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}` },
          { label: inspection.title },
        ]}
      />

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{inspection.title}</h1>
          <p className="text-muted-foreground mt-2">
            {inspection.subsections.name} - {inspection.subsections.sites.name}
          </p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            </>
          ) : (
            <Button onClick={() => setEditing(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className={getStatusColor(inspection.status)}>
              {inspection.status}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className={getPriorityColor(inspection.priority)}>
              {inspection.priority}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Inspection Date</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {inspection.inspection_date
                ? format(new Date(inspection.inspection_date), "MMM dd, yyyy")
                : "Not scheduled"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Inspection Details */}
      <Card>
        <CardHeader>
          <CardTitle>Inspection Details</CardTitle>
          <CardDescription>
            {editing ? "Edit the inspection information below" : "View inspection information"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Inspection Title</Label>
                <Input
                  id="title"
                  value={formData.title || ""}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status || ""}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
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
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority || ""}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inspection_date">Inspection Date</Label>
                <Input
                  id="inspection_date"
                  type="date"
                  value={formData.inspection_date || ""}
                  onChange={(e) => setFormData({ ...formData, inspection_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project_name">Project Name</Label>
                <Input
                  id="project_name"
                  value={formData.project_name || ""}
                  onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inspector_name">Inspector Name</Label>
                <Input
                  id="inspector_name"
                  value={formData.inspector_name || ""}
                  onChange={(e) => setFormData({ ...formData, inspector_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={formData.location || ""}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Description</p>
                <p className="font-medium">{inspection.description || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Project Name</p>
                <p className="font-medium">{inspection.project_name || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Inspector Name</p>
                <p className="font-medium">{inspection.inspector_name || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Location</p>
                <p className="font-medium">{inspection.location || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Client Representative</p>
                <p className="font-medium">{inspection.client_rep || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Consultant</p>
                <p className="font-medium">{inspection.consultant || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Contractor</p>
                <p className="font-medium">{inspection.contractor || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Testing Party</p>
                <p className="font-medium">{inspection.testing_party || "—"}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InspectionDetail;
