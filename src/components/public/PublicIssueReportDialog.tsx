"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CaptchaTurnstile,
  type CaptchaTurnstileHandle,
} from "@/components/CaptchaTurnstile";

// Public, unauthenticated "report an issue" dialog for QR landing pages.
// POSTs multipart form data straight to the report-issue edge function,
// which does server-side Turnstile verification before creating a snag.
// No Supabase client / auth header involved — this must work for an
// anonymous visitor who scanned a QR code.

const MAX_PHOTOS = 3;

interface Props {
  subsectionId: string;
  trigger: React.ReactNode;
}

export function PublicIssueReportDialog({ subsectionId, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const captchaRef = useRef<CaptchaTurnstileHandle>(null);

  function resetCaptcha() {
    setCaptchaToken(null);
    captchaRef.current?.reset();
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setPhotos([]);
  }

  function handlePhotosChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPhotos(files.slice(0, MAX_PHOTOS));
  }

  async function handleSubmit() {
    if (!title.trim() || !captchaToken) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("turnstile_token", captchaToken);
      formData.append("subsection_id", subsectionId);
      formData.append("title", title);
      formData.append("description", description);
      for (const photo of photos) {
        formData.append("photos", photo);
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/report-issue`,
        {
          method: "POST",
          body: formData,
        },
      );

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success("Report submitted — thank you.");
        resetForm();
        setOpen(false);
      } else {
        toast.error(body.error || "Could not submit the report.");
      }
    } catch {
      toast.error("Could not submit the report. Please try again.");
    } finally {
      resetCaptcha();
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
          <DialogDescription>
            Let us know what&apos;s wrong with this subsection. No account needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="issue-title">Title</Label>
            <Input
              id="issue-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              placeholder="Briefly describe the issue"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issue-description">Description</Label>
            <Textarea
              id="issue-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              placeholder="Add any extra detail (optional)"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issue-photos">Photos (up to {MAX_PHOTOS})</Label>
            <Input
              id="issue-photos"
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotosChange}
            />
            {photos.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {photos.length} photo{photos.length === 1 ? "" : "s"} selected
              </p>
            )}
          </div>

          <CaptchaTurnstile ref={captchaRef} onTokenChange={setCaptchaToken} />
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || !captchaToken || submitting}
          >
            {submitting ? "Submitting..." : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
