import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpCircle, Bug, Lightbulb } from "lucide-react";
import { usePendingVerifications } from "@/hooks/usePendingVerifications";
import { cn } from "@/lib/utils";
import { IssueReportDialog } from "@/components/IssueReportDialog";
import { SuggestionDialog } from "@/components/SuggestionDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import html2canvas from "html2canvas";
import { toast } from "sonner";

export function HelpButton() {
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [suggestionDialogOpen, setSuggestionDialogOpen] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const { data: pendingVerifications } = usePendingVerifications();
  
  const hasPendingVerifications = (pendingVerifications?.length || 0) > 0;

  const captureScreenshot = async (type: 'issue' | 'suggestion') => {
    setIsCapturing(true);
    try {
      // Hide the help button temporarily
      const helpButton = document.querySelector('[data-help-button]') as HTMLElement;
      if (helpButton) helpButton.style.display = 'none';

      // Capture screenshot
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        scrollY: -window.scrollY,
        scrollX: -window.scrollX,
        windowHeight: window.innerHeight,
        windowWidth: window.innerWidth,
      });

      // Show the button again
      if (helpButton) helpButton.style.display = 'flex';

      // Convert to base64
      const screenshotData = canvas.toDataURL('image/png');
      setScreenshot(screenshotData);
      
      if (type === 'issue') {
        setIssueDialogOpen(true);
      } else {
        setSuggestionDialogOpen(true);
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      toast.error('Failed to capture screenshot');
      // Still open dialog even if screenshot fails
      if (type === 'issue') {
        setIssueDialogOpen(true);
      } else {
        setSuggestionDialogOpen(true);
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleCloseIssue = () => {
    setIssueDialogOpen(false);
    setScreenshot(null);
  };

  const handleCloseSuggestion = () => {
    setSuggestionDialogOpen(false);
    setScreenshot(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-help-button
            disabled={isCapturing}
            className={cn(
              "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 hover:scale-110 transition-transform",
              hasPendingVerifications && "bg-destructive hover:bg-destructive/90 animate-pulse"
            )}
            size="icon"
          >
            <HelpCircle className="h-6 w-6" />
            {hasPendingVerifications && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive border-2 border-background rounded-full" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => captureScreenshot('issue')}>
            <Bug className="mr-2 h-4 w-4" />
            Report an Issue
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => captureScreenshot('suggestion')}>
            <Lightbulb className="mr-2 h-4 w-4" />
            Submit a Suggestion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <IssueReportDialog
        open={issueDialogOpen}
        onOpenChange={handleCloseIssue}
        screenshot={screenshot}
      />

      <SuggestionDialog
        open={suggestionDialogOpen}
        onOpenChange={handleCloseSuggestion}
        screenshot={screenshot}
      />
    </>
  );
}
