import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, ArrowLeft, Info } from "lucide-react";
import { Link } from "@/lib/navigation";

const AdminClientPreview = () => {
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  const { data: clients, isLoading: clientsLoading, error: clientsError } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("company_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: clientInfo } = useQuery({
    queryKey: ["client-preview-info", selectedClientId],
    enabled: !!selectedClientId,
    queryFn: async () => {
      const { count: sitesCount } = await supabase
        .from("sites")
        .select("*", { count: "exact", head: true })
        .eq("client_id", selectedClientId);

      const { data: client } = await supabase
        .from("clients")
        .select("*")
        .eq("id", selectedClientId)
        .single();

      return {
        client,
        sitesCount: sitesCount || 0,
      };
    },
  });

  if (clientsLoading) {
    return <div className="space-y-6">Loading clients...</div>;
  }

  if (clientsError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Error loading clients: {clientsError.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          As an admin, you can preview the client portal for any client. 
          Select a client below to see their portal view with real data.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Select Client to Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Client</label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client to preview" />
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

          {selectedClientId && clientInfo && (
            <div className="space-y-4 pt-4 border-t">
              <div>
                <p className="text-sm font-medium">Preview Information:</p>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <p>• Client: {clientInfo.client.company_name || clientInfo.client.name}</p>
                  <p>• Sites: {clientInfo.sitesCount}</p>
                  <p>• You will see data filtered for this client only</p>
                  <p>• All features will be in preview mode</p>
                </div>
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  Click the button below to open the client portal in preview mode. 
                  You'll see exactly what this client sees, including their sites, 
                  documents, and calendar events.
                </AlertDescription>
              </Alert>

              <div className="flex gap-2">
                <a 
                  href={`/client-portal?preview=${selectedClientId}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button className="w-full gap-2">
                    <Eye className="h-4 w-4" />
                    Open Client Portal Preview
                  </Button>
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How Preview Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• As an admin, you have special preview access to all client data</p>
          <p>• The preview parameter identifies which client's view you want to see</p>
          <p>• All data is filtered automatically based on the selected client</p>
          <p>• This allows you to test the client experience before sending invites</p>
          <p>• Regular client users will only see their own client's data</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminClientPreview;
