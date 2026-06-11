import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle } from "lucide-react";
import html2canvas from "html2canvas";
import { format } from "date-fns";

interface PendingVerification {
  id: string;
  type: 'issue' | 'suggestion';
  title: string;
  description: string;
  resolved_at: string;
}

interface VerificationDialogProps {
  verification: PendingVerification | null;
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
}

export function VerificationDialog({ verification, open, onClose, onVerified }: VerificationDialogProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectionForm, setShowRejectionForm] = useState(false);

  if (!verification) return null;

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const table = verification.type === 'issue' ? 'issue_reports' : 'suggestions';
      const { error } = await supabase
        .from(table)
        .update({
          verification_status: 'verified',
          verified_at: new Date().toISOString(),
          verified_by: user.id,
          needs_user_verification: false
        })
        .eq('id', verification.id);

      if (error) throw error;

      toast.success("Thank you for confirming the fix!");
      onVerified();
      onClose();
    } catch (error) {
      console.error('Error verifying:', error);
      toast.error("Failed to verify. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error("Please describe why the issue is not fixed");
      return;
    }

    setIsVerifying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Capture screenshot
      let screenshotUrl = null;
      try {
        const canvas = await html2canvas(document.body, {
          useCORS: true,
          allowTaint: true,
          scrollY: -window.scrollY,
          scrollX: -window.scrollX,
          windowHeight: window.innerHeight,
          windowWidth: window.innerWidth,
        });
        const blob = await new Promise<Blob>((resolve) => 
          canvas.toBlob((b) => resolve(b!), 'image/png')
        );

        const fileName = `${user.id}/${Date.now()}.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('issue-screenshots')
          .upload(fileName, blob);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('issue-screenshots')
          .getPublicUrl(uploadData.path);
        
        screenshotUrl = publicUrl;
      } catch (error) {
        console.error('Failed to capture screenshot:', error);
      }

      const table = verification.type === 'issue' ? 'issue_reports' : 'suggestions';
      const { error } = await supabase
        .from(table)
        .update({
          verification_status: 'rejected',
          verified_at: new Date().toISOString(),
          verified_by: user.id,
          rejection_reason: rejectionReason,
          rejection_screenshot_url: screenshotUrl,
          // issue_reports uses hyphenated status vocabulary; leave suggestions as-is
          status: verification.type === 'issue' ? 'in-progress' : 'in_progress', // Move back to in-progress
          needs_user_verification: false
        })
        .eq('id', verification.id);

      if (error) throw error;

      toast.success("We'll review this again. Thank you for the feedback!");
      onVerified();
      onClose();
      setShowRejectionForm(false);
      setRejectionReason("");
    } catch (error) {
      console.error('Error rejecting verification:', error);
      toast.error("Failed to submit feedback. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Verify Fix</DialogTitle>
          <DialogDescription>
            We've {verification.type === 'issue' ? 'resolved the issue' : 'implemented the suggestion'} you reported. 
            Please confirm if it's working correctly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">
              {verification.type === 'issue' ? 'Issue' : 'Suggestion'}
            </h4>
            <p className="text-sm text-muted-foreground">{verification.description}</p>
          </div>

          {verification.resolved_at && (
            <div>
              <h4 className="font-medium mb-2">Resolved On</h4>
              <p className="text-sm text-muted-foreground">
                {format(new Date(verification.resolved_at), 'PPP')}
              </p>
            </div>
          )}

          {showRejectionForm && (
            <div>
              <label className="text-sm font-medium mb-2 block">
                Why is this not fixed? What's still wrong?
              </label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Please describe what's still not working..."
                rows={4}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {!showRejectionForm ? (
            <>
              <Button
                variant="outline"
                onClick={() => setShowRejectionForm(true)}
                disabled={isVerifying}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Not Fixed
              </Button>
              <Button
                onClick={handleVerify}
                disabled={isVerifying}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Yes, It's Fixed!
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRejectionForm(false);
                  setRejectionReason("");
                }}
                disabled={isVerifying}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                disabled={isVerifying}
                variant="destructive"
              >
                {isVerifying ? "Submitting..." : "Submit Feedback"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
