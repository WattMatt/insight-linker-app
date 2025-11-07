import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Lightbulb, 
  CheckCircle, 
  Clock, 
  Star,
  Copy,
  Calendar
} from "lucide-react";
import { format } from "date-fns";

interface Suggestion {
  id: string;
  created_at: string;
  updated_at: string;
  reported_by: string | null;
  user_name: string | null;
  user_email: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  page_url: string;
  screenshot_url: string | null;
  browser_info: any;
  admin_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  needs_user_verification: boolean;
  verification_status: string;
  verified_at: string | null;
  rejection_reason: string | null;
  rejection_screenshot_url: string | null;
}

export default function Suggestions() {
  const queryClient = useQueryClient();
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suggestions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Suggestion[];
    },
  });

  useEffect(() => {
    if (selectedSuggestion?.screenshot_url) {
      const getSignedUrl = async () => {
        const { data } = await supabase.storage
          .from("suggestion-screenshots")
          .createSignedUrl(selectedSuggestion.screenshot_url!, 3600);
        
        if (data) {
          setImageUrl(data.signedUrl);
        }
      };
      getSignedUrl();
    }
  }, [selectedSuggestion]);

  const updateSuggestionMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      admin_notes,
    }: {
      id: string;
      status: string;
      admin_notes: string;
    }) => {
      const updates: any = {
        status,
        admin_notes,
        updated_at: new Date().toISOString(),
      };

      if (status === "implemented" || status === "rejected") {
        const { data: { user } } = await supabase.auth.getUser();
        updates.resolved_by = user?.id;
        updates.resolved_at = new Date().toISOString();
        
        // Request user verification for implemented suggestions
        if (status === "implemented") {
          updates.needs_user_verification = true;
          updates.verification_status = 'pending';
        }
      }

      const { error } = await supabase
        .from("suggestions")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions"] });
      toast.success("Suggestion updated successfully");
      setSelectedSuggestion(null);
    },
    onError: (error) => {
      console.error("Error updating suggestion:", error);
      toast.error("Failed to update suggestion");
    },
  });

  const handleViewDetails = (suggestion: Suggestion) => {
    setSelectedSuggestion(suggestion);
    setAdminNotes(suggestion.admin_notes || "");
    setNewStatus(suggestion.status);
  };

  const handleUpdateSuggestion = () => {
    if (!selectedSuggestion) return;

    updateSuggestionMutation.mutate({
      id: selectedSuggestion.id,
      status: newStatus,
      admin_notes: adminNotes,
    });
  };

  const handleDebugSuggestion = (suggestion: Suggestion) => {
    const debugInfo = `💡 SUGGESTION DEBUG INFO
========================

📧 Reported By: ${suggestion.user_name} (${suggestion.user_email})
📅 Date: ${format(new Date(suggestion.created_at), "MMM dd, yyyy HH:mm:ss")}
🔗 Page URL: ${suggestion.page_url}
📊 Category: ${suggestion.category}
⭐ Priority: ${suggestion.priority}

📝 Title:
${suggestion.title}

📝 Description:
${suggestion.description}

🌐 Browser Info:
${JSON.stringify(suggestion.browser_info, null, 2)}

${suggestion.screenshot_url ? `📸 Screenshot: ${imageUrl}` : ""}
`;

    navigator.clipboard.writeText(debugInfo);
    toast.success("Suggestion info copied to clipboard!");
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "new":
        return <Star className="h-4 w-4" />;
      case "under_review":
        return <Clock className="h-4 w-4" />;
      case "implemented":
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Lightbulb className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const newCount = suggestions?.filter((s) => s.status === "new").length || 0;
  const underReviewCount =
    suggestions?.filter((s) => s.status === "under_review").length || 0;
  const implementedCount =
    suggestions?.filter((s) => s.status === "implemented").length || 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Suggestions</h1>
          <p className="text-muted-foreground">
            Review and manage user feature suggestions
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{newCount}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Under Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{underReviewCount}</div>
            <p className="text-xs text-muted-foreground">
              Being evaluated
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Implemented</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{implementedCount}</div>
            <p className="text-xs text-muted-foreground">
              Successfully added
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Suggestions</CardTitle>
          <CardDescription>
            View and manage all user suggestions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Verification</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions?.map((suggestion) => (
                <TableRow key={suggestion.id}>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(suggestion.created_at), "MMM dd, yyyy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{suggestion.user_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {suggestion.user_email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {suggestion.title}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{suggestion.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getPriorityColor(suggestion.priority)}>
                      {suggestion.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(suggestion.status)}
                      <span className="capitalize">
                        {suggestion.status.replace("_", " ")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {suggestion.status === 'implemented' && suggestion.needs_user_verification && (
                      <Badge variant={suggestion.verification_status === 'verified' ? 'default' : suggestion.verification_status === 'rejected' ? 'destructive' : 'secondary'}>
                        {suggestion.verification_status === 'verified' ? '✓ Verified' : 
                         suggestion.verification_status === 'rejected' ? '✗ Rejected' : 
                         '⏳ Pending'}
                      </Badge>
                    )}
                    {suggestion.status === 'implemented' && !suggestion.needs_user_verification && suggestion.verified_at && (
                      <Badge variant="default">✓ Verified</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewDetails(suggestion)}
                      >
                        View Details
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDebugSuggestion(suggestion)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={!!selectedSuggestion}
        onOpenChange={() => setSelectedSuggestion(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Suggestion Details</DialogTitle>
            <DialogDescription>
              Review and update the suggestion
            </DialogDescription>
          </DialogHeader>

          {selectedSuggestion && (
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <p className="font-medium">{selectedSuggestion.title}</p>
              </div>

              <div>
                <Label>Description</Label>
                <p className="text-sm">{selectedSuggestion.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <p className="text-sm">
                    <Badge variant="outline">{selectedSuggestion.category}</Badge>
                  </p>
                </div>
                <div>
                  <Label>Priority</Label>
                  <p className="text-sm">
                    <Badge variant={getPriorityColor(selectedSuggestion.priority)}>
                      {selectedSuggestion.priority}
                    </Badge>
                  </p>
                </div>
              </div>

              <div>
                <Label>Submitted By</Label>
                <p className="text-sm">
                  {selectedSuggestion.user_name} ({selectedSuggestion.user_email})
                </p>
              </div>

              <div>
                <Label>Page URL</Label>
                <p className="text-sm text-muted-foreground truncate">
                  {selectedSuggestion.page_url}
                </p>
              </div>

              {imageUrl && (
                <div>
                  <Label>Screenshot</Label>
                  <img
                    src={imageUrl}
                    alt="Suggestion screenshot"
                    className="w-full rounded-md border mt-2"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="under_review">Under Review</SelectItem>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="implemented">Implemented</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="notes">Admin Notes</Label>
                <Textarea
                  id="notes"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about this suggestion..."
                  className="min-h-[100px]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedSuggestion(null)}
            >
              Cancel
            </Button>
            {selectedSuggestion && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleDebugSuggestion(selectedSuggestion)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy to AI
                </Button>
                <Button onClick={handleUpdateSuggestion}>
                  Save Changes
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}