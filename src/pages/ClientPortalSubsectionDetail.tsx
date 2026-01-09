import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useClientInfo } from "@/hooks/useUserRole";
import { useEffect } from "react";
import { Breadcrumbs } from "@/components/Breadcrumb";

const ClientPortalSubsectionDetail = () => {
  const { subsectionId } = useParams();
  const [searchParams] = useSearchParams();
  const previewClientId = searchParams.get("preview");
  const { data: clientInfo } = useClientInfo(previewClientId || undefined);
  const queryClient = useQueryClient();

  const { data: subsection, isLoading: subsectionLoading } = useQuery({
    queryKey: ["client-subsection", subsectionId, clientInfo?.client_id],
    enabled: !!subsectionId && !!clientInfo?.client_id,
    queryFn: async () => {
      // Fetch subsection with site info including client_id for verification
      const { data, error } = await supabase
        .from("subsections")
        .select("*, sites(name, id, client_id)")
        .eq("id", subsectionId!)
        .single();

      if (error) throw error;
      
      // Verify client owns this subsection's site
      if (data?.sites?.client_id !== clientInfo!.client_id) {
        throw new Error("Access denied: You don't have permission to view this subsection");
      }
      
      return data;
    },
  });

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ["client-subsection-documents", subsectionId],
    enabled: !!subsectionId && !!subsection, // Only fetch if subsection access is verified
    queryFn: async () => {
      // RLS policies ensure client can only see documents for their subsections
      const { data, error } = await supabase
        .from("subsection_documents")
        .select("*, document_categories(name)")
        .eq("subsection_id", subsectionId!)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Set up real-time subscriptions
  useEffect(() => {
    if (!subsectionId) return;

    // Subscribe to subsection changes
    const subsectionChannel = supabase
      .channel(`client-subsection-${subsectionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subsections',
          filter: `id=eq.${subsectionId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["client-subsection", subsectionId] });
        }
      )
      .subscribe();

    // Subscribe to document changes
    const documentsChannel = supabase
      .channel(`client-subsection-docs-${subsectionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subsection_documents',
          filter: `subsection_id=eq.${subsectionId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["client-subsection-documents", subsectionId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subsectionChannel);
      supabase.removeChannel(documentsChannel);
    };
  }, [subsectionId, queryClient]);

  const handleDownload = async (url: string, fileName: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Error downloading document:", error);
    }
  };

  if (subsectionLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!subsection) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-lg font-medium">Subsection not found</p>
          <Link to="/client-portal/sites">
            <Button className="mt-4">Back to Sites</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "compliant": return "bg-green-500";
      case "missing": return "bg-red-500";
      case "expired": return "bg-orange-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumbs 
        items={[
          { label: "Sites", href: `/client-portal/sites${previewClientId ? `?preview=${previewClientId}` : ''}`, icon: "site" },
          { label: subsection.sites?.name || "Site", href: `/client-portal/sites/${subsection.site_id}${previewClientId ? `?preview=${previewClientId}` : ''}`, icon: "site" },
          { label: subsection.name, icon: "subsection" }
        ]} 
      />

      {previewClientId && (
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Admin Preview Mode:</strong> Viewing as{" "}
            {clientInfo?.clients?.company_name || clientInfo?.clients?.name}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Subsection Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 bg-primary/10 rounded-lg flex items-center justify-center">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">{subsection.name}</CardTitle>
                {subsection.description && (
                  <p className="text-muted-foreground mt-1">{subsection.description}</p>
                )}
                <p className="text-sm text-muted-foreground mt-2">
                  Site: {subsection.sites?.name}
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {subsection.coc_status && (
              <div>
                <p className="text-sm text-muted-foreground">COC Status</p>
                <Badge className={`${getStatusColor(subsection.coc_status)} text-white mt-1`}>
                  {subsection.coc_status}
                </Badge>
              </div>
            )}
            {subsection.coc_number && (
              <div>
                <p className="text-sm text-muted-foreground">COC Number</p>
                <p className="font-medium mt-1">{subsection.coc_number}</p>
              </div>
            )}
            {subsection.coc_issue_date && (
              <div>
                <p className="text-sm text-muted-foreground">COC Issue Date</p>
                <p className="font-medium mt-1">
                  {new Date(subsection.coc_issue_date).toLocaleDateString()}
                </p>
              </div>
            )}
            {subsection.coc_type && (
              <div>
                <p className="text-sm text-muted-foreground">COC Type</p>
                <p className="font-medium mt-1">{subsection.coc_type}</p>
              </div>
            )}
            {subsection.tenant_name && (
              <div>
                <p className="text-sm text-muted-foreground">Tenant Name</p>
                <p className="font-medium mt-1">{subsection.tenant_name}</p>
              </div>
            )}
            {subsection.meter_serial_number && (
              <div>
                <p className="text-sm text-muted-foreground">Meter Serial Number</p>
                <p className="font-medium mt-1">{subsection.meter_serial_number}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {docsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : documents && documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div 
                  key={doc.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{doc.file_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {doc.document_categories && (
                          <Badge variant="secondary" className="text-xs">
                            {doc.document_categories.name}
                          </Badge>
                        )}
                        {doc.file_size && (
                          <span className="text-xs text-muted-foreground">
                            {(doc.file_size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="gap-2"
                    onClick={() => handleDownload(doc.file_url, doc.file_name)}
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No documents available for this subsection
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientPortalSubsectionDetail;
