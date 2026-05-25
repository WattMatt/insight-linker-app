import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "@/lib/navigation";

interface Inspection {
    id: string;
    subsection_id: string | null;
    inspection_date: string;
    json_data: any;
}

interface SiteLevelInspectionsProps {
    inspections: Inspection[];
    siteId: string;
    clientId?: string;
    onCreateClick: () => void;
}

export function SiteLevelInspections({ inspections, siteId, clientId, onCreateClick }: SiteLevelInspectionsProps) {
    const navigate = useNavigate();
    const siteInspections = inspections.filter(i => !i.subsection_id);
    
    const getInspectionUrl = (inspectionId: string) => {
        // Site-level inspections don't have a subsection, so navigate to inspections list with filter
        // Since there's no dedicated route for site-level inspection detail, we'll use the inspections page
        return clientId 
            ? `/clients/${clientId}/sites/${siteId}?tab=inspections&inspectionId=${inspectionId}`
            : `/sites/${siteId}?tab=inspections&inspectionId=${inspectionId}`;
    };

    return (
        <Card className="glass-card border-none overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Site Inspections</CardTitle>
                    <CardDescription>
                        Site-wide inspections (Site Drawings, Progress Reports, etc.)
                    </CardDescription>
                </div>
                <Button onClick={onCreateClick} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Inspection
                </Button>
            </CardHeader>
            <CardContent>
                {siteInspections.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p className="text-muted-foreground font-medium">No site-level inspections yet</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">Create a Site Drawing or Progress Report for the entire site to get started</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {siteInspections
                            .slice(0, 5)
                            .map((inspection) => (
                                <div
                                    key={inspection.id}
                                    className="flex items-center justify-between p-4 border rounded-xl hover:bg-primary/5 cursor-pointer transition-colors group"
                                    onClick={() => navigate(getInspectionUrl(inspection.id))}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                            <FileText className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-semibold">{inspection.json_data?.title || 'Untitled Inspection'}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {inspection.inspection_date ? format(new Date(inspection.inspection_date), 'PPP') : 'No date'}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="font-normal">
                                        {inspection.json_data?.status || 'Pending'}
                                    </Badge>
                                </div>
                            ))}
                        {siteInspections.length > 5 && (
                            <Button
                                variant="ghost"
                                className="w-full mt-2 text-primary hover:bg-primary/5"
                                onClick={() => navigate(clientId ? `/clients/${clientId}/sites/${siteId}?tab=inspections` : `/sites/${siteId}?tab=inspections`)}
                            >
                                View all {siteInspections.length} inspections
                            </Button>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
