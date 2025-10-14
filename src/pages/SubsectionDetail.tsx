import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Subsection {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  coc_status: string;
  metering_status: string;
  is_compliant: boolean;
  is_coc_required: boolean;
  sites: {
    id: string;
    name: string;
    clients: {
      id: string;
      name: string;
    };
  };
}

interface Inspection {
  id: string;
  title: string;
  status: string;
  inspection_date: string | null;
  priority: string;
}

const SubsectionDetail = () => {
  const { clientId, siteId, subsectionId } = useParams();
  const navigate = useNavigate();
  const [subsection, setSubsection] = useState<Subsection | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubsectionData();
  }, [subsectionId]);

  const fetchSubsectionData = async () => {
    try {
      const [subsectionRes, inspectionsRes] = await Promise.all([
        supabase
          .from("subsections")
          .select("*, sites(id, name, clients(id, name))")
          .eq("id", subsectionId)
          .single(),
        supabase
          .from("inspections")
          .select("*")
          .eq("subsection_id", subsectionId)
          .order("created_at", { ascending: false }),
      ]);

      if (subsectionRes.error) throw subsectionRes.error;
      if (inspectionsRes.error) throw inspectionsRes.error;

      setSubsection(subsectionRes.data);
      setInspections(inspectionsRes.data || []);
    } catch (error) {
      console.error("Error fetching subsection data:", error);
      toast.error("Failed to fetch subsection data");
    } finally {
      setLoading(false);
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

  if (!subsection) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold mb-2">Subsection not found</h3>
        <Button onClick={() => navigate(`/clients/${clientId}/sites/${siteId}`)}>
          Back to Site
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Clients", href: "/clients" },
          { label: subsection.sites.clients.name, href: `/clients/${clientId}` },
          { label: subsection.sites.name, href: `/clients/${clientId}/sites/${siteId}` },
          { label: subsection.name },
        ]}
      />

      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{subsection.name}</h1>
            {subsection.category && (
              <Badge variant="outline">{subsection.category}</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-2">
            Inspections and compliance records
          </p>
        </div>
      </div>

      {/* Subsection Info Card */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compliance Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant="outline"
              className={
                subsection.is_compliant
                  ? "bg-green-500/10 text-green-500"
                  : "bg-red-500/10 text-red-500"
              }
            >
              {subsection.is_compliant ? "Compliant" : "Non-Compliant"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">CoC Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant="outline"
              className={
                subsection.coc_status === "Approved"
                  ? "bg-green-500/10 text-green-500"
                  : subsection.coc_status === "Pending"
                  ? "bg-yellow-500/10 text-yellow-500"
                  : "bg-orange-500/10 text-orange-500"
              }
            >
              {subsection.coc_status}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Metering Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant="outline"
              className={
                subsection.metering_status === "Installed"
                  ? "bg-green-500/10 text-green-500"
                  : "bg-orange-500/10 text-orange-500"
              }
            >
              {subsection.metering_status}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Inspections Card */}
      <Card>
        <CardHeader>
          <CardTitle>Inspections</CardTitle>
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
                Create an inspection for this subsection
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.map((inspection) => (
                  <TableRow key={inspection.id}>
                    <TableCell className="font-medium">{inspection.title}</TableCell>
                    <TableCell>
                      {inspection.inspection_date
                        ? format(new Date(inspection.inspection_date), "MMM dd, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getPriorityColor(inspection.priority)}>
                        {inspection.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(inspection.status)}>
                        {inspection.status}
                      </Badge>
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

export default SubsectionDetail;
