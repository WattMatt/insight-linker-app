import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, ArrowLeft, Info } from "lucide-react";
import { Link } from "react-router-dom";

const AdminClientPreview = () => {
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: clientInfo } = useQuery({
    queryKey: ["client-preview-info", selectedClientId],
    enabled: !!selectedClientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, sites(count)")
        .eq("id", selectedClientId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Client Portal Preview</h1>
          <p className="text-muted-foreground mt-2">
            Test the client portal experience as an admin
          </p>
        </div>
        <Link to="/users">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Users
          </Button>
        </Link>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This preview allows you to see the client portal as it appears to clients. 
          Select a client below to view their data and test the interface before sending invites.
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
                  <p>• Client: {clientInfo.company_name || clientInfo.name}</p>
                  <p>• You will see data filtered for this client only</p>
                  <p>• All features will be read-only</p>
                </div>
              </div>

              <Alert className="bg-orange-50 border-orange-200">
                <Info className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800">
                  <strong>Important:</strong> To preview as a client, you need to:
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>Temporarily assign yourself the "Client" role</li>
                    <li>Create a user_clients mapping linking your user to this client</li>
                    <li>Visit the client portal at <code className="bg-white px-1 py-0.5 rounded">/client-portal</code></li>
                    <li>Remove the role and mapping when done testing</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    // Add SQL script to console for manual execution
                    const userId = (await supabase.auth.getUser()).data.user?.id;
                    const sqlScript = `
-- TEMPORARY CLIENT PREVIEW SETUP
-- Run this in Supabase SQL Editor, then visit /client-portal

BEGIN;

-- 1. Add Client role (if not exists)
INSERT INTO public.user_roles (user_id, role)
VALUES ('${userId}', 'Client')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Create temporary client mapping
INSERT INTO public.user_clients (user_id, client_id)
VALUES ('${userId}', '${selectedClientId}')
ON CONFLICT (user_id) DO UPDATE SET client_id = '${selectedClientId}';

COMMIT;

-- TO REMOVE PREVIEW MODE AFTER TESTING:
-- DELETE FROM public.user_clients WHERE user_id = '${userId}';
-- DELETE FROM public.user_roles WHERE user_id = '${userId}' AND role = 'Client';
                    `.trim();
                    
                    navigator.clipboard.writeText(sqlScript);
                    alert("SQL script copied to clipboard! Run it in Supabase SQL Editor, then refresh the page and visit /client-portal");
                  }}
                  variant="outline"
                  className="gap-2"
                >
                  Copy Setup SQL
                </Button>
                <a href="/client-portal" target="_blank" rel="noopener noreferrer">
                  <Button className="gap-2">
                    <Eye className="h-4 w-4" />
                    Open Client Portal
                  </Button>
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alternative: Quick Test Account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            For faster testing, create a dedicated test client user account in the Users page. 
            You can then log in with that account to test the full client experience.
          </p>
          <Link to="/users">
            <Button variant="outline">Go to User Management</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminClientPreview;
