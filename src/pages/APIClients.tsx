import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Key, Copy, Eye, EyeOff, Trash2, RefreshCw, Activity, Shield } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface APIClient {
  id: string;
  name: string;
  client_id: string;
  client_secret: string;
  scopes: string[];
  is_active: boolean;
  created_at: string;
}

interface APILog {
  id: string;
  endpoint: string;
  method: string;
  status_code: number;
  created_at: string;
  ip_address: string;
  user_agent: string;
}

const APIClients = () => {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [createdClient, setCreatedClient] = useState<APIClient | null>(null);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["api-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as APIClient[];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["api-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_request_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as APILog[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("api_clients")
        .insert({ name, created_by: userData.user?.id })
        .select()
        .single();
      if (error) throw error;
      return data as APIClient;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-clients"] });
      setCreatedClient(data);
      setNewClientName("");
      toast.success("API client created successfully");
    },
    onError: (error) => {
      toast.error("Failed to create API client: " + error.message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("api_clients")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-clients"] });
      toast.success("Client status updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-clients"] });
      toast.success("API client deleted");
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const supabaseUrl = "https://oltzgidkjxwsukvkomof.supabase.co";

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Key className="h-8 w-8" />
            API Clients
          </h1>
          <p className="text-muted-foreground">
            Manage OAuth 2.0 API clients for external application access
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Client</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Client Name</Label>
                <Input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="e.g., External Dashboard App"
                />
              </div>
              <Button
                onClick={() => createMutation.mutate(newClientName)}
                disabled={!newClientName.trim() || createMutation.isPending}
                className="w-full"
              >
                {createMutation.isPending ? "Creating..." : "Create Client"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Show newly created client credentials */}
      {createdClient && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <CardTitle className="text-green-700 flex items-center gap-2">
              <Shield className="h-5 w-5" />
              New Client Created - Save These Credentials
            </CardTitle>
            <CardDescription className="text-green-600">
              This is the only time you'll see the client secret. Please save it securely.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div>
                <Label className="text-sm text-muted-foreground">Client ID</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-white rounded border text-sm">
                    {createdClient.client_id}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(createdClient.client_id, "Client ID")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Client Secret</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-white rounded border text-sm">
                    {createdClient.client_secret}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(createdClient.client_secret, "Client Secret")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setCreatedClient(null)}
              className="w-full"
            >
              I've Saved the Credentials
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">API Clients</TabsTrigger>
          <TabsTrigger value="logs">Request Logs</TabsTrigger>
          <TabsTrigger value="docs">API Documentation</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="p-6 text-center">Loading...</CardContent>
            </Card>
          ) : clients?.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No API clients created yet. Click "Create Client" to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {clients?.map((client) => (
                <Card key={client.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{client.name}</h3>
                          <Badge variant={client.is_active ? "default" : "secondary"}>
                            {client.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Created: {format(new Date(client.created_at), "PPp")}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            Client ID: {client.client_id}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(client.client_id, "Client ID")}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            Secret: {showSecrets[client.id] ? client.client_secret : "••••••••••••••••"}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setShowSecrets((prev) => ({ ...prev, [client.id]: !prev[client.id] }))}
                          >
                            {showSecrets[client.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                          {showSecrets[client.id] && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(client.client_secret, "Client Secret")}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <div className="flex gap-1 mt-2">
                          {client.scopes?.map((scope) => (
                            <Badge key={scope} variant="outline" className="text-xs">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={client.is_active}
                            onCheckedChange={(checked) =>
                              toggleMutation.mutate({ id: client.id, is_active: checked })
                            }
                          />
                          <span className="text-sm">{client.is_active ? "Enabled" : "Disabled"}</span>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete API Client?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will revoke all access tokens and permanently delete this client.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(client.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                API Request Logs
              </CardTitle>
              <CardDescription>Recent API requests from external applications</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No API requests yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs?.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">
                          {format(new Date(log.created_at), "PPp")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.method}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{log.endpoint}</TableCell>
                        <TableCell>
                          <Badge
                            variant={log.status_code < 400 ? "default" : "destructive"}
                          >
                            {log.status_code}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.ip_address || "N/A"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs">
          <Card>
            <CardHeader>
              <CardTitle>API Documentation</CardTitle>
              <CardDescription>How to integrate with the Reports API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">1. Get Access Token</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Use OAuth 2.0 client credentials flow to obtain an access token:
                </p>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`POST ${supabaseUrl}/functions/v1/oauth-token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET"
}`}
                </pre>
                <p className="text-sm text-muted-foreground mt-2">Response:</p>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "scope": "reports:read"
}`}
                </pre>
              </div>

              <div>
                <h3 className="font-semibold mb-2">2. List Available Reports</h3>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`GET ${supabaseUrl}/functions/v1/api-reports/available
Authorization: Bearer YOUR_ACCESS_TOKEN`}
                </pre>
              </div>

              <div>
                <h3 className="font-semibold mb-2">3. Generate Reports</h3>
                <p className="text-sm text-muted-foreground mb-2">Available report endpoints:</p>
                <ul className="list-disc list-inside text-sm space-y-2 mb-4">
                  <li><code>/generate/coc-validation</code> - COC Validation Report</li>
                  <li><code>/generate/inspection</code> - Inspection Report</li>
                  <li><code>/generate/site-summary</code> - Site Summary Report</li>
                  <li><code>/generate/subsection</code> - Subsection Report</li>
                  <li><code>/generate/floor-plan</code> - Floor Plan Report</li>
                </ul>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`POST ${supabaseUrl}/functions/v1/api-reports/generate/site-summary
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "site_id": "uuid-of-site"
}`}
                </pre>
                <p className="text-sm text-muted-foreground mt-2">
                  Response includes <code>content_base64</code> with the PDF content.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">4. Refresh Token</h3>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`POST ${supabaseUrl}/functions/v1/oauth-token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "YOUR_REFRESH_TOKEN"
}`}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default APIClients;
