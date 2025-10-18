import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";
import { IssueReportDialog } from "@/components/IssueReportDialog";
import html2canvas from "html2canvas";
import { toast } from "sonner";

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const captureScreenshot = async () => {
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
      setOpen(true);
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      toast.error('Failed to capture screenshot');
      // Still open dialog even if screenshot fails
      setOpen(true);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setScreenshot(null);
  };

  return (
    <>
      <Button
        data-help-button
        onClick={captureScreenshot}
        disabled={isCapturing}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 hover:scale-110 transition-transform"
        size="icon"
      >
        <HelpCircle className="h-6 w-6" />
      </Button>

      <IssueReportDialog
        open={open}
        onOpenChange={handleClose}
        screenshot={screenshot}
      />
    </>
  );
}
