import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, FileText, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Feedback {
  id: string;
  feedback_type: string;
  title: string;
  description: string;
  original_finding: string | null;
  suggested_improvement: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  implementation_notes: string | null;
  created_by: string | null;
}

export default function ValidationFeedback() {
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'reviewed' | 'implemented'>('pending');

  useEffect(() => {
    loadFeedback();
  }, [statusFilter]);

  const loadFeedback = async () => {
    try {
      let query = supabase
        .from('validation_feedback')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setFeedbackList(data || []);
    } catch (error) {
      console.error('Error loading feedback:', error);
      toast.error('Failed to load feedback');
    } finally {
      setLoading(false);
    }
  };

  const updateFeedbackStatus = async (
    id: string, 
    status: 'reviewed' | 'implemented' | 'rejected',
    notes?: string
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase
        .from('validation_feedback')
        .update({
          status,
          reviewed_by: session?.user.id,
          reviewed_at: new Date().toISOString(),
          implementation_notes: notes
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Feedback status updated');
      setReviewDialogOpen(false);
      loadFeedback();
    } catch (error) {
      console.error('Error updating feedback:', error);
      toast.error('Failed to update feedback');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'reviewed':
      case 'implemented':
        return <CheckCircle className="h-4 w-4" />;
      case 'rejected':
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'reviewed':
        return 'bg-blue-100 text-blue-800';
      case 'implemented':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'clarification':
        return 'bg-purple-100 text-purple-800';
      case 'correction':
        return 'bg-orange-100 text-orange-800';
      case 'enhancement':
        return 'bg-teal-100 text-teal-800';
      case 'edge_case':
        return 'bg-pink-100 text-pink-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const stats = {
    total: feedbackList.length,
    pending: feedbackList.filter(f => f.status === 'pending').length,
    implemented: feedbackList.filter(f => f.status === 'implemented').length,
    rejected: feedbackList.filter(f => f.status === 'rejected').length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading feedback...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Validation Feedback Management</h1>
        <p className="text-muted-foreground">
          Review and implement user feedback to improve COC validation accuracy
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.total}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <span className="text-2xl font-bold text-yellow-600">{stats.pending}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Implemented
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <span className="text-2xl font-bold text-green-600">{stats.implemented}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              <span className="text-2xl font-bold text-red-600">{stats.rejected}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feedback List */}
      <Card>
        <CardHeader>
          <CardTitle>Feedback Items</CardTitle>
          <CardDescription>
            Click on any item to review and take action
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
              <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
              <TabsTrigger value="implemented">Implemented</TabsTrigger>
            </TabsList>

            <TabsContent value={statusFilter} className="space-y-4">
              {feedbackList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No feedback items found</p>
                </div>
              ) : (
                feedbackList.map((feedback) => (
                  <Card
                    key={feedback.id}
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => {
                      setSelectedFeedback(feedback);
                      setReviewDialogOpen(true);
                    }}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={getTypeColor(feedback.feedback_type)}>
                              {feedback.feedback_type.replace('_', ' ')}
                            </Badge>
                            <Badge className={getStatusColor(feedback.status)}>
                              {getStatusIcon(feedback.status)}
                              <span className="ml-1">{feedback.status}</span>
                            </Badge>
                          </div>
                          <h3 className="font-semibold mb-1">{feedback.title}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {feedback.description}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Submitted {new Date(feedback.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Feedback</DialogTitle>
          </DialogHeader>
          
          {selectedFeedback && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Badge className={getTypeColor(selectedFeedback.feedback_type)}>
                  {selectedFeedback.feedback_type.replace('_', ' ')}
                </Badge>
                <Badge className={getStatusColor(selectedFeedback.status)}>
                  {selectedFeedback.status}
                </Badge>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Title</h3>
                <p>{selectedFeedback.title}</p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="whitespace-pre-wrap">{selectedFeedback.description}</p>
              </div>

              {selectedFeedback.original_finding && (
                <div>
                  <h3 className="font-semibold mb-2">Original Finding</h3>
                  <p className="whitespace-pre-wrap bg-muted p-3 rounded">
                    {selectedFeedback.original_finding}
                  </p>
                </div>
              )}

              {selectedFeedback.suggested_improvement && (
                <div>
                  <h3 className="font-semibold mb-2">Suggested Improvement</h3>
                  <p className="whitespace-pre-wrap bg-muted p-3 rounded">
                    {selectedFeedback.suggested_improvement}
                  </p>
                </div>
              )}

              {selectedFeedback.implementation_notes && (
                <div>
                  <h3 className="font-semibold mb-2">Implementation Notes</h3>
                  <p className="whitespace-pre-wrap">{selectedFeedback.implementation_notes}</p>
                </div>
              )}

              {selectedFeedback.status === 'pending' && (
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="default"
                    onClick={() => updateFeedbackStatus(selectedFeedback.id, 'implemented', 'Implemented in validation system')}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark as Implemented
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => updateFeedbackStatus(selectedFeedback.id, 'reviewed', 'Under review')}
                  >
                    Mark as Reviewed
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => updateFeedbackStatus(selectedFeedback.id, 'rejected', 'Not applicable')}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}