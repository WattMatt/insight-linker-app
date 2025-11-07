import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Clock, Eye, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { RobustImage } from "@/components/RobustImage";

interface VerificationItem {
  id: string;
  type: 'issue' | 'suggestion';
  title: string;
  description: string;
  user_name: string;
  user_email: string;
  status: string;
  verification_status: string;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  rejection_screenshot_url: string | null;
  resolved_at: string | null;
  created_at: string;
  page_url: string;
}

export default function VerificationManagement() {
  const [selectedItem, setSelectedItem] = useState<VerificationItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejectionImageUrl, setRejectionImageUrl] = useState<string | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ['verification-items'],
    queryFn: async () => {
      const [issues, suggestions] = await Promise.all([
        supabase
          .from('issue_reports')
          .select('*')
          .not('verification_status', 'is', null)
          .order('verified_at', { ascending: false }),
        supabase
          .from('suggestions')
          .select('*')
          .not('verification_status', 'is', null)
          .order('verified_at', { ascending: false })
      ]);

      const combined = [
        ...(issues.data || []).map(i => ({
          ...i,
          type: 'issue' as const,
          title: i.description
        })),
        ...(suggestions.data || []).map(s => ({
          ...s,
          type: 'suggestion' as const
        }))
      ].sort((a, b) => {
        const aDate = a.verified_at || a.resolved_at || a.created_at;
        const bDate = b.verified_at || b.resolved_at || b.created_at;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });

      return combined;
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (selectedItem?.rejection_screenshot_url) {
      const getSignedUrl = async () => {
        const { data } = await supabase.storage
          .from('issue-screenshots')
          .createSignedUrl(selectedItem.rejection_screenshot_url!, 3600);
        
        if (data) {
          setRejectionImageUrl(data.signedUrl);
        }
      };
      getSignedUrl();
    }
  }, [selectedItem]);

  const handleViewDetails = (item: VerificationItem) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const pendingItems = items?.filter(i => i.verification_status === 'pending') || [];
  const verifiedItems = items?.filter(i => i.verification_status === 'verified') || [];
  const rejectedItems = items?.filter(i => i.verification_status === 'rejected') || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const renderTable = (data: VerificationItem[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Verified</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No items found
              </TableCell>
            </TableRow>
          ) : (
            data.map((item) => (
              <TableRow key={`${item.type}-${item.id}`}>
                <TableCell className="whitespace-nowrap">
                  {format(new Date(item.verified_at || item.resolved_at || item.created_at), 'MMM dd, yyyy')}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {item.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{item.user_name}</span>
                    <span className="text-xs text-muted-foreground">{item.user_email}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {item.title}
                </TableCell>
                <TableCell>
                  <Badge variant={
                    item.status === 'resolved' ? 'default' :
                    item.status === 'implemented' ? 'default' :
                    item.status === 'in_progress' ? 'secondary' :
                    'outline'
                  }>
                    {item.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(item.verification_status)}
                    <span className="text-sm capitalize">
                      {item.verification_status}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewDetails(item)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading verification data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Verification Management</h1>
        <p className="text-muted-foreground mt-2">
          Track user feedback on resolved issues and implemented suggestions
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingItems.length}</div>
            <p className="text-xs text-muted-foreground">Awaiting user verification</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Verified
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{verifiedItems.length}</div>
            <p className="text-xs text-muted-foreground">Confirmed by users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rejectedItems.length}</div>
            <p className="text-xs text-muted-foreground">Need attention</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Verifications</CardTitle>
          <CardDescription>
            View and manage all user verification responses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({items?.length || 0})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({pendingItems.length})</TabsTrigger>
              <TabsTrigger value="verified">Verified ({verifiedItems.length})</TabsTrigger>
              <TabsTrigger value="rejected">Rejected ({rejectedItems.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              {renderTable(items || [])}
            </TabsContent>

            <TabsContent value="pending" className="mt-4">
              {renderTable(pendingItems)}
            </TabsContent>

            <TabsContent value="verified" className="mt-4">
              {renderTable(verifiedItems)}
            </TabsContent>

            <TabsContent value="rejected" className="mt-4">
              {renderTable(rejectedItems)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Verification Details</DialogTitle>
            <DialogDescription>
              User feedback on {selectedItem?.type === 'issue' ? 'issue resolution' : 'suggestion implementation'}
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium mb-1">Type</h4>
                  <Badge variant="outline">{selectedItem.type}</Badge>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-1">Verification Status</h4>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedItem.verification_status)}
                    <Badge variant={
                      selectedItem.verification_status === 'verified' ? 'default' :
                      selectedItem.verification_status === 'rejected' ? 'destructive' :
                      'secondary'
                    }>
                      {selectedItem.verification_status}
                    </Badge>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">User Information</h4>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm font-medium">{selectedItem.user_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedItem.user_email}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">{selectedItem.type === 'issue' ? 'Issue' : 'Suggestion'}</h4>
                <p className="text-sm">{selectedItem.title}</p>
              </div>

              {selectedItem.page_url && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Page URL</h4>
                  <a 
                    href={selectedItem.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline truncate block"
                  >
                    {selectedItem.page_url}
                  </a>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {selectedItem.resolved_at && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">Resolved On</h4>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(selectedItem.resolved_at), 'PPP')}
                    </p>
                  </div>
                )}
                {selectedItem.verified_at && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">Verified On</h4>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(selectedItem.verified_at), 'PPP')}
                    </p>
                  </div>
                )}
              </div>

              {selectedItem.verification_status === 'rejected' && (
                <>
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      Rejection Reason
                    </h4>
                    <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-lg">
                      <p className="text-sm">{selectedItem.rejection_reason || 'No reason provided'}</p>
                    </div>
                  </div>

                  {selectedItem.rejection_screenshot_url && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        Rejection Screenshot
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        {rejectionImageUrl ? (
                          <RobustImage
                            src={rejectionImageUrl}
                            alt="Rejection screenshot"
                            className="w-full"
                          />
                        ) : (
                          <div className="bg-muted p-8 text-center">
                            <p className="text-sm text-muted-foreground">Loading screenshot...</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
