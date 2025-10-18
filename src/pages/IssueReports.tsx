import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { Eye, CheckCircle, Loader2, AlertCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface IssueReport {
  id: string;
  created_at: string;
  user_email: string;
  user_name: string;
  description: string;
  severity: string;
  category: string;
  status: string;
  screenshot_url: string | null;
  page_url: string;
  browser_info: any;
  admin_notes: string | null;
}

export default function IssueReports() {
  const [selectedIssue, setSelectedIssue] = useState<IssueReport | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Generate signed URL for screenshot
  useEffect(() => {
    const getSignedUrl = async () => {
      if (selectedIssue?.screenshot_url) {
        // Extract the path after 'issue-screenshots/'
        const urlParts = selectedIssue.screenshot_url.split('issue-screenshots/');
        if (urlParts.length > 1) {
          const path = urlParts[1];
          const { data } = await supabase.storage
            .from('issue-screenshots')
            .createSignedUrl(path, 3600);
          setImageUrl(data?.signedUrl || null);
        }
      } else {
        setImageUrl(null);
      }
    };
    getSignedUrl();
  }, [selectedIssue]);

  const { data: issues, isLoading } = useQuery({
    queryKey: ['issue-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('issue_reports')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as IssueReport[];
    },
  });

  const updateIssueMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes: string }) => {
      const updates: any = { status, admin_notes: notes };
      
      if (status === 'resolved') {
        const { data: { user } } = await supabase.auth.getUser();
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = user?.id;
      }

      const { error } = await supabase
        .from('issue_reports')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue-reports'] });
      toast.success('Issue updated successfully');
      setSelectedIssue(null);
    },
    onError: () => {
      toast.error('Failed to update issue');
    },
  });

  const handleViewDetails = (issue: IssueReport) => {
    setSelectedIssue(issue);
    setAdminNotes(issue.admin_notes || "");
    setNewStatus(issue.status);
  };

  const handleUpdateIssue = () => {
    if (!selectedIssue) return;
    updateIssueMutation.mutate({
      id: selectedIssue.id,
      status: newStatus,
      notes: adminNotes,
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new': return <AlertCircle className="h-4 w-4 text-blue-500" />;
      case 'in-progress': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'resolved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return null;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Issue Reports</h1>
        <p className="text-muted-foreground">
          Manage and resolve user-reported issues
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{issues?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">New</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {issues?.filter(i => i.status === 'new').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">
              {issues?.filter(i => i.status === 'in-progress').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {issues?.filter(i => i.status === 'resolved').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Reports</CardTitle>
          <CardDescription>
            Click on any report to view details and take action
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues?.map((issue) => (
                <TableRow key={issue.id}>
                  <TableCell>
                    {format(new Date(issue.created_at), 'MMM d, yyyy HH:mm')}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{issue.user_name}</div>
                      <div className="text-xs text-muted-foreground">{issue.user_email}</div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {issue.description}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{issue.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getSeverityColor(issue.severity) as any}>
                      {issue.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(issue.status)}
                      <span className="capitalize">{issue.status}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewDetails(issue)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedIssue} onOpenChange={() => setSelectedIssue(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Issue Report Details</DialogTitle>
            <DialogDescription>
              Review and update the issue status
            </DialogDescription>
          </DialogHeader>

          {selectedIssue && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium mb-1">Reported By</h4>
                  <p className="text-sm">{selectedIssue.user_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedIssue.user_email}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-1">Date</h4>
                  <p className="text-sm">
                    {format(new Date(selectedIssue.created_at), 'MMM d, yyyy HH:mm:ss')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium mb-1">Category</h4>
                  <Badge variant="outline">{selectedIssue.category}</Badge>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-1">Severity</h4>
                  <Badge variant={getSeverityColor(selectedIssue.severity) as any}>
                    {selectedIssue.severity}
                  </Badge>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-1">Description</h4>
                <p className="text-sm bg-muted p-3 rounded-md">{selectedIssue.description}</p>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-1">Page URL</h4>
                <p className="text-sm text-blue-500 hover:underline">
                  <a href={selectedIssue.page_url} target="_blank" rel="noopener noreferrer">
                    {selectedIssue.page_url}
                  </a>
                </p>
              </div>

              {selectedIssue.screenshot_url && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Screenshot</h4>
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Issue screenshot"
                      className="w-full border rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-48 border rounded-lg flex items-center justify-center bg-muted">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}

              <div>
                <h4 className="text-sm font-medium mb-1">Browser Information</h4>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                  {JSON.stringify(selectedIssue.browser_info, null, 2)}
                </pre>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Update Status</h4>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Admin Notes</h4>
                <Textarea
                  placeholder="Add notes about this issue..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelectedIssue(null)}>
              Cancel
            </Button>
            {selectedIssue?.status !== 'resolved' && (
              <Button 
                variant="default"
                onClick={() => {
                  if (!selectedIssue) return;
                  updateIssueMutation.mutate({
                    id: selectedIssue.id,
                    status: 'resolved',
                    notes: adminNotes,
                  });
                }}
                disabled={updateIssueMutation.isPending}
              >
                {updateIssueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <CheckCircle className="mr-2 h-4 w-4" />
                Mark as Resolved
              </Button>
            )}
            <Button onClick={handleUpdateIssue} disabled={updateIssueMutation.isPending}>
              {updateIssueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
