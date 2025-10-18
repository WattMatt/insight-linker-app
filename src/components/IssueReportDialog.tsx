import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface IssueReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screenshot: string | null;
}

export function IssueReportDialog({ open, onOpenChange, screenshot }: IssueReportDialogProps) {
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [category, setCategory] = useState("general");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error("Please describe the issue");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to report issues");
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();

      // Upload screenshot if available
      let screenshotUrl = null;
      if (screenshot) {
        const blob = await fetch(screenshot).then(r => r.blob());
        const fileName = `${user.id}/${Date.now()}.png`;
        
        const { error: uploadError } = await supabase.storage
          .from('issue-screenshots')
          .upload(fileName, blob, {
            contentType: 'image/png',
            cacheControl: '3600',
          });

        if (uploadError) {
          console.error('Failed to upload screenshot:', uploadError);
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('issue-screenshots')
            .getPublicUrl(fileName);
          screenshotUrl = publicUrl;
        }
      }

      // Gather browser info
      const browserInfo = {
        userAgent: navigator.userAgent,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString(),
      };

      // Submit issue report
      const { error } = await supabase
        .from('issue_reports')
        .insert({
          reported_by: user.id,
          user_email: profile?.email || user.email || '',
          user_name: profile?.full_name || 'Unknown',
          description: description.trim(),
          severity,
          category,
          screenshot_url: screenshotUrl,
          page_url: window.location.href,
          browser_info: browserInfo,
          status: 'new',
        });

      if (error) throw error;

      toast.success("Issue report submitted successfully");
      setDescription("");
      setSeverity("medium");
      setCategory("general");
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to submit issue report:', error);
      toast.error("Failed to submit issue report");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
          <DialogDescription>
            Describe the issue you're experiencing. We've captured a screenshot to help our team understand the problem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {screenshot && (
            <div className="border rounded-lg overflow-hidden">
              <img src={screenshot} alt="Screenshot" className="w-full h-auto" />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Please describe the issue in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="severity">Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger id="severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low - Minor inconvenience</SelectItem>
                  <SelectItem value="medium">Medium - Impacts workflow</SelectItem>
                  <SelectItem value="high">High - Blocks critical tasks</SelectItem>
                  <SelectItem value="critical">Critical - System down</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="ui-bug">UI Bug</SelectItem>
                  <SelectItem value="data-error">Data Error</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="feature-request">Feature Request</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
