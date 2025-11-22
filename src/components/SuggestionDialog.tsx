import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface SuggestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screenshot: string | null;
}

export function SuggestionDialog({ open, onOpenChange, screenshot }: SuggestionDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("feature");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Please log in to submit a suggestion");
        return;
      }

      // Get user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single();

      // Upload screenshot if provided
      let screenshotUrl = null;
      if (screenshot) {
        const blob = await (await fetch(screenshot)).blob();
        const fileName = `${user.id}/${Date.now()}.png`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("suggestion-screenshots")
          .upload(fileName, blob);

        if (uploadError) {
          console.error("Error uploading screenshot:", uploadError);
        } else {
          screenshotUrl = uploadData.path;
        }
      }

      // Get browser info
      const browserInfo = {
        userAgent: navigator.userAgent,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString(),
      };

      // Insert suggestion
      const { error: insertError } = await supabase
        .from("suggestions")
        .insert({
          reported_by: user.id,
          user_name: profile?.full_name || "Unknown",
          user_email: profile?.email || user.email || "unknown@example.com",
          title,
          description,
          priority,
          category,
          page_url: window.location.href,
          screenshot_url: screenshotUrl,
          browser_info: browserInfo,
        });

      if (insertError) throw insertError;

      // Send email notification to admin
      await supabase.functions.invoke('send-email', {
        body: {
          to: 'arno@wmeng.co.za',
          subject: `💡 New Suggestion: ${title}`,
          html: `
            <h2>New Suggestion Submitted</h2>
            <p><strong>From:</strong> ${profile?.full_name || user.email} (${profile?.email || user.email})</p>
            <p><strong>Priority:</strong> <span style="color: ${priority === 'high' ? 'red' : priority === 'medium' ? 'orange' : 'gray'}">${priority.toUpperCase()}</span></p>
            <p><strong>Category:</strong> ${category}</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <strong>${title}</strong><br/>
              <p style="margin-top: 8px;">${description}</p>
            </div>
            ${screenshotUrl ? '<p>📸 Screenshot attached</p>' : ''}
            <p><strong>Page:</strong> ${window.location.href}</p>
            <p style="margin-top: 20px;">
              <a href="${window.location.origin}/suggestions" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View in Admin Panel
              </a>
            </p>
          `,
        }
      });

      toast.success("Suggestion submitted successfully!");
      
      // Reset form
      setTitle("");
      setDescription("");
      setPriority("medium");
      setCategory("feature");
      onOpenChange(false);
    } catch (error) {
      console.error("Error submitting suggestion:", error);
      toast.error("Failed to submit suggestion");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit a Suggestion</DialogTitle>
          <DialogDescription>
            Share your ideas to help us improve the platform
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary of your suggestion"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your suggestion in detail..."
              className="min-h-[120px]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feature">New Feature</SelectItem>
                  <SelectItem value="improvement">Improvement</SelectItem>
                  <SelectItem value="ui">UI/UX</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {screenshot && (
            <div className="space-y-2">
              <Label>Screenshot</Label>
              <img
                src={screenshot}
                alt="Screenshot"
                className="w-full rounded-md border"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Suggestion
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}