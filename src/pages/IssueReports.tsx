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
import { Eye, CheckCircle, Loader2, AlertCircle, Clock, Bug } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { RobustImage } from "@/components/RobustImage";

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
  needs_user_verification: boolean;
  verification_status: string;
  verified_at: string | null;
  rejection_reason: string | null;
  rejection_screenshot_url: string | null;
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
        updates.needs_user_verification = true;
        updates.verification_status = 'pending';
      }

      const { error } = await supabase
        .from('issue_reports')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      // Create notification if status changed to resolved
      if (status === 'resolved') {
        const { data: issue } = await supabase
          .from('issue_reports')
          .select('reported_by, description, user_email, user_name')
          .eq('id', id)
          .single();
        
        if (issue?.reported_by) {
          await supabase.from('notifications').insert({
            user_id: issue.reported_by,
            issue_report_id: id,
            message: `Your issue report "${issue.description.substring(0, 50)}..." has been resolved!`,
            type: 'issue_resolved'
          });

          // Send email to user
          await supabase.functions.invoke('send-email', {
            body: {
              to: issue.user_email,
              subject: '✅ Your Issue Has Been Resolved',
              html: `
                <h2>Good news, ${issue.user_name || 'there'}!</h2>
                <p>Your issue report has been resolved by our team.</p>
                <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
                  <strong>Issue:</strong> ${issue.description.substring(0, 200)}${issue.description.length > 200 ? '...' : ''}
                </div>
                ${notes ? `<p><strong>Admin Notes:</strong> ${notes}</p>` : ''}
                <p>Please log in to verify the fix and confirm that the issue is resolved.</p>
                <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                  Thank you for helping us improve!<br/>
                  The Admin Team
                </p>
              `,
            }
          });
        }
      }
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

  const handleDebugIssue = async () => {
    if (!selectedIssue) return;

    const debugInfo = `
🐛 ISSUE REPORT DEBUG INFO
========================

📧 Reported By: ${selectedIssue.user_name} (${selectedIssue.user_email})
📅 Date: ${format(new Date(selectedIssue.created_at), 'MMM d, yyyy HH:mm:ss')}
🔗 Page URL: ${selectedIssue.page_url}
📊 Category: ${selectedIssue.category}
⚠️ Severity: ${selectedIssue.severity}

📝 Description:
${selectedIssue.description}

🌐 Browser Info:
${JSON.stringify(selectedIssue.browser_info, null, 2)}

${selectedIssue.screenshot_url ? `📸 Screenshot: ${imageUrl || selectedIssue.screenshot_url}` : ''}

${selectedIssue.admin_notes ? `📋 Admin Notes:\n${selectedIssue.admin_notes}` : ''}
    `.trim();

    try {
      await navigator.clipboard.writeText(debugInfo);
      toast.success('Issue details copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
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
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Issue Reports</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Manage and resolve user-reported issues
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="text-xs md:text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl md:text-2xl font-bold">{issues?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="text-xs md:text-sm font-medium">New</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl md:text-2xl font-bold text-blue-500">
              {issues?.filter(i => i.status === 'new').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="text-xs md:text-sm font-medium">Progress</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl md:text-2xl font-bold text-yellow-500">
              {issues?.filter(i => i.status === 'in-progress').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="text-xs md:text-sm font-medium">Resolved</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl md:text-2xl font-bold text-green-500">
              {issues?.filter(i => i.status === 'resolved').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">All Reports</CardTitle>
          <CardDescription className="text-sm">
            Click on any report to view details
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 md:p-6">
          {/* Mobile Card View */}
          <div className="md:hidden divide-y">
            {issues?.map((issue) => (
              <div
                key={issue.id}
                onClick={() => handleViewDetails(issue)}
                className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(issue.status)}
                      <span className="text-xs font-medium capitalize">{issue.status}</span>
                    </div>
                    <p className="text-sm font-medium truncate">{issue.user_name}</p>
                  </div>
                  <Badge variant={getSeverityColor(issue.severity) as any} className="text-xs">
                    {issue.severity}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                  {issue.description}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{format(new Date(issue.created_at), 'MMM d, yyyy')}</span>
                  <Badge variant="outline" className="text-xs">{issue.category}</Badge>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verification</TableHead>
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
                      {issue.status === 'resolved' && issue.needs_user_verification && (
                        <Badge variant={issue.verification_status === 'verified' ? 'default' : issue.verification_status === 'rejected' ? 'destructive' : 'secondary'}>
                          {issue.verification_status === 'verified' ? '✓ Verified' : 
                           issue.verification_status === 'rejected' ? '✗ Rejected' : 
                           '⏳ Pending'}
                        </Badge>
                      )}
                      {issue.status === 'resolved' && !issue.needs_user_verification && issue.verified_at && (
                        <Badge variant="default">✓ Verified</Badge>
                      )}
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
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedIssue} onOpenChange={() => setSelectedIssue(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[95vw] md:w-full">
          <DialogHeader>
            <DialogTitle>Issue Report Details</DialogTitle>
            <DialogDescription>
              Review and update the issue status
            </DialogDescription>
          </DialogHeader>

          {selectedIssue && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <Button
                variant="outline"
                className="w-full"
                onClick={handleDebugIssue}
              >
                <Bug className="mr-2 h-4 w-4" />
                Copy Debug Info to Clipboard
              </Button>

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
                    <RobustImage
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

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setSelectedIssue(null)}
              className="w-full sm:w-auto"
            >
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
                className="w-full sm:w-auto"
              >
                {updateIssueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <CheckCircle className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Mark as Resolved</span>
                <span className="sm:hidden">Resolve</span>
              </Button>
            )}
            <Button 
              onClick={handleUpdateIssue} 
              disabled={updateIssueMutation.isPending}
              className="w-full sm:w-auto"
            >
              {updateIssueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
