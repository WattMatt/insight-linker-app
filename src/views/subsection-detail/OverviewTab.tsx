import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, FileText } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSearchParams } from "@/lib/navigation";
import { hasValidCocStatus } from "@/lib/complianceCalculations";
import type { SubsectionData, SiteData, EditFormData } from "./types";

interface OverviewTabProps {
  subsection: SubsectionData;
  setSubsection: React.Dispatch<React.SetStateAction<SubsectionData | null>>;
  siteData: SiteData;
  inspectionArray: [string, any][];
  hasSnags: boolean;
  hasIncompleteInspections: boolean;
  isNotCompliant: boolean;
  openSnagsCount: number;
  snags: any[];
  supabaseDocuments: any[];
  subsectionId: string | undefined;
  siteId: string | undefined;
  clientId: string | undefined;
  actualClientId: string | null;
  editFormData: EditFormData;
  setEditFormData: React.Dispatch<React.SetStateAction<EditFormData>>;
  setActiveTab: (tab: string) => void;
  navigate: (path: string) => void;
}

export function OverviewTab({
  subsection,
  setSubsection,
  siteData,
  inspectionArray,
  hasSnags,
  hasIncompleteInspections,
  isNotCompliant,
  openSnagsCount,
  snags,
  supabaseDocuments,
  subsectionId,
  siteId,
  clientId,
  actualClientId,
  editFormData,
  setEditFormData,
  setActiveTab,
  navigate,
}: OverviewTabProps) {
  const [searchParams] = useSearchParams();
  const highlightSnagId = searchParams.get("snag");
  useEffect(() => {
    if (!highlightSnagId) return;
    const el = document.querySelector(`[data-snag-id="${highlightSnagId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.classList.add("ring-2", "ring-primary");
    const t = setTimeout(() => el?.classList.remove("ring-2", "ring-primary"), 2500);
    return () => clearTimeout(t);
  }, [highlightSnagId, snags]);

  return (
    <div className="space-y-4">
      {/* Compliance Alert */}
      {isNotCompliant && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Compliance Status: Fail</strong>
            <br />
            This status is determined by open snags, COC validation, and inspection completion status. The following issues were found:
            <ul className="list-disc list-inside mt-2">
              {hasSnags && <li>{openSnagsCount} open snag{openSnagsCount !== 1 ? 's' : ''} requiring attention</li>}
              {hasIncompleteInspections && (
                <li>
                  Not all inspections have been marked as completed.
                  {inspectionArray.length > 0 && (
                    <span className="text-sm block ml-4 mt-1">
                      ({inspectionArray.filter(([_, insp]) => !insp?.status || insp.status !== 'Completed').length} of {inspectionArray.length} incomplete)
                    </span>
                  )}
                </li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Subsection Details */}
      <Card>
        <CardHeader>
          <CardTitle>Subsection Details</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Subsection Name</p>
            <p className="font-medium">{subsection.name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Tenant Name</p>
            <p className="font-medium">{subsection.tenantName || siteData.siteName}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">COC Required</p>
            <div className="flex items-center gap-2">
              <Badge variant={subsection.isCocRequired ? "default" : "secondary"}>
                {subsection.isCocRequired ? "Yes" : "No"}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={async () => {
                  const newValue = !subsection.isCocRequired;
                  try {
                    const { error } = await supabase
                      .from('subsections')
                      .update({ is_coc_required: newValue })
                      .eq('id', subsectionId);

                    if (error) throw error;

                    setSubsection({ ...subsection, isCocRequired: newValue });
                    setEditFormData({ ...editFormData, is_coc_required: newValue });
                    toast.success(`COC requirement ${newValue ? 'enabled' : 'disabled'}`);
                  } catch (error) {
                    if (process.env.NODE_ENV === 'development') console.error('Error toggling COC requirement:', error);
                    toast.error('Failed to update COC requirement');
                  }
                }}
              >
                {subsection.isCocRequired ? "Disable" : "Enable"}
              </Button>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Overall Status</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                   <span className="inline-block cursor-help">
                    <Badge
                      variant="outline"
                      className={
                        (() => {
                          if (subsection.isCocRequired && !hasValidCocStatus(subsection.cocStatus)) return "bg-red-500/10 text-red-500";
                          if (subsection.isCocRequired && subsection.meteringStatus === 'Missing' && !subsection.meterSerialNumber) return "bg-red-500/10 text-red-500";
                          if (openSnagsCount > 0) return "bg-red-500/10 text-red-500";
                          if (hasIncompleteInspections) return "bg-red-500/10 text-red-500";
                          return "bg-green-500/10 text-green-500";
                        })()
                      }
                    >
                      {(() => {
                        if (subsection.isCocRequired && !hasValidCocStatus(subsection.cocStatus)) return "Fail";
                        if (subsection.isCocRequired && subsection.meteringStatus === 'Missing' && !subsection.meterSerialNumber) return "Fail";
                        if (openSnagsCount > 0) return "Fail";
                        if (hasIncompleteInspections) return "Fail";
                        return "Pass";
                      })()}
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {(() => {
                    const reasons: string[] = [];
                    if (subsection.isCocRequired && !hasValidCocStatus(subsection.cocStatus)) {
                      reasons.push(`CoC status is "${subsection.cocStatus || 'Missing'}" (needs a passing COC)`);
                    }
                    if (subsection.isCocRequired && subsection.meteringStatus === 'Missing' && !subsection.meterSerialNumber) {
                      reasons.push('Metering data is missing');
                    }
                    if (openSnagsCount > 0) {
                      reasons.push(`Has ${openSnagsCount} open snag${openSnagsCount > 1 ? 's' : ''}`);
                    }
                    if (hasIncompleteInspections) {
                      const incompleteCount = inspectionArray.filter(([_, insp]) => !insp?.status || insp.status !== 'Completed').length;
                      reasons.push(`${incompleteCount} of ${inspectionArray.length} inspection${inspectionArray.length > 1 ? 's' : ''} not completed`);
                    }

                    if (reasons.length === 0) {
                      return <p className="text-sm">All compliance requirements met</p>;
                    }

                    return (
                      <div>
                        <p className="font-semibold mb-1">Failing because:</p>
                        <ul className="text-xs space-y-1">
                          {reasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">CoC Status</p>
            {(() => {
              if (!subsection.isCocRequired) {
                return (
                  <Badge variant="outline" className="bg-muted/50 text-muted-foreground">
                    N/A
                  </Badge>
                );
              }
              const isPass = hasValidCocStatus(subsection.cocStatus);
              return (
                <Badge
                  variant="outline"
                  className={isPass ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}
                >
                  {subsection.cocStatus || "Missing"}
                </Badge>
              );
            })()}
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Metering Status</p>
            <Badge
              variant="outline"
              className={
                subsection.meteringStatus === "Installed" || subsection.meterSerialNumber
                  ? "bg-green-500/10 text-green-500"
                  : subsection.isCocRequired
                  ? "bg-red-500/10 text-red-500"
                  : "bg-gray-500/10 text-gray-500"
              }
            >
              {subsection.isCocRequired
                ? (subsection.meteringStatus === "Installed" || subsection.meterSerialNumber ? "Installed" : subsection.meteringStatus || "Missing")
                : "N/A"}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Open Snags</p>
            <Badge
              variant="outline"
              className={openSnagsCount > 0 ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"}
            >
              {openSnagsCount}
            </Badge>
            {snags.length > 0 && (
              <div className="mt-3 space-y-2">
                {(highlightSnagId ? snags : snags.slice(0, 5)).map((snag) => (
                  <div key={snag.id} data-snag-id={snag.id} className="flex items-center justify-between p-2 border rounded text-sm">
                    <span className="truncate flex-1 mr-2">{snag.title}</span>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          snag.risk_level === 'critical' ? 'bg-red-500/20 text-red-600 border-red-300' :
                          snag.risk_level === 'high' ? 'bg-orange-500/20 text-orange-600 border-orange-300' :
                          snag.risk_level === 'medium' ? 'bg-yellow-500/20 text-yellow-600 border-yellow-300' :
                          'bg-green-500/20 text-green-600 border-green-300'
                        }
                      >
                        {snag.risk_level || 'low'}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={snag.status === 'Open' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}
                      >
                        {snag.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                {!highlightSnagId && snags.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center">+{snags.length - 5} more snags</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Inspections */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Inspections
            <Button
              variant="link"
              size="sm"
              onClick={() => setActiveTab("inspections")}
            >
              View All
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inspectionArray.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inspections found</p>
          ) : (
            <div className="space-y-2">
              {inspectionArray.slice(0, 3).map(([id, inspection]) => (
                <div
                  key={id}
                  className="flex justify-between items-center p-3 border rounded cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    const basePath = (actualClientId || clientId)
                      ? `/clients/${actualClientId || clientId}/sites/${siteId}/subsections/${subsectionId}`
                      : `/sites/${siteId}/subsections/${subsectionId}`;
                    navigate(`${basePath}/inspections/${id}`);
                  }}
                >
                  <div>
                    <p className="font-medium">
                      {inspection.title || inspection.type || 'Inspection'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {inspection.date ? format(new Date(inspection.date), "dd MMMM yyyy") : "No date"}
                    </p>
                  </div>
                  <Badge variant="default" className="bg-blue-500">
                    Completed
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Documents
            <Button
              variant="link"
              size="sm"
              onClick={() => setActiveTab("documents")}
            >
              View All
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {supabaseDocuments.length} file(s) found for this subsection.
          </p>
        </CardContent>
      </Card>

      {/* Certificate of Compliance */}
      {subsection.cocNumber && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Certificate of Compliance
              <Button
                variant="link"
                size="sm"
                onClick={() => setActiveTab("coc-metering")}
              >
                View All
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <p className="font-medium">{subsection.name}.pdf</p>
                <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                  <span>COC #: {subsection.cocNumber}</span>
                  {subsection.cocIssueDate && (
                    <span>Issue Date: {format(new Date(subsection.cocIssueDate), "yyyy-MM-dd")}</span>
                  )}
                  {subsection.cocType && (
                    <span>Type: {subsection.cocType}</span>
                  )}
                </div>
              </div>
              <Badge
                variant="outline"
                className={hasValidCocStatus(subsection.cocStatus) ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}
              >
                {subsection.cocStatus || "Missing"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
