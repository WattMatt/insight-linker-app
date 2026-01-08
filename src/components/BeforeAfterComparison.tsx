import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Camera, Upload, Trash2, ArrowLeftRight, Maximize2, X } from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { useImageUpload } from "@/hooks/useImageUpload";
import { toast } from "sonner";
import { RobustImage } from "./RobustImage";
import { supabase } from "@/integrations/supabase/client";

interface BeforeAfterComparisonProps {
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
  afterNotes?: string;
  rectifiedAt?: string;
  rectifiedBy?: string;
  onSaveAfterPhoto: (photoUrl: string, notes: string) => Promise<void>;
  onRemoveAfterPhoto?: () => Promise<void>;
  pinId?: string;
  readOnly?: boolean;
}

export const BeforeAfterComparison = ({
  beforePhotoUrl,
  afterPhotoUrl,
  afterNotes = "",
  rectifiedAt,
  rectifiedBy,
  onSaveAfterPhoto,
  onRemoveAfterPhoto,
  pinId,
  readOnly = false,
}: BeforeAfterComparisonProps) => {
  const { takePicture } = useCamera();
  const { uploadImage, uploading } = useImageUpload();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notes, setNotes] = useState(afterNotes);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleCapture = async () => {
    try {
      const photo = await takePicture();
      if (photo) {
        setPendingFile(photo);
        setPreviewUrl(URL.createObjectURL(photo));
      }
    } catch (error) {
      console.error("Error capturing photo:", error);
      toast.error("Failed to capture photo");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!pendingFile) {
      toast.error("Please capture or upload a photo first");
      return;
    }

    setIsUploading(true);
    try {
      const path = `rectification/${pinId || Date.now()}_${Date.now()}.jpg`;
      const result = await uploadImage(pendingFile, "floor-plan-photos", path);
      
      if (result?.url) {
        await onSaveAfterPhoto(result.url, notes);
        setPendingFile(null);
        setPreviewUrl(null);
        toast.success("Rectification photo saved");
      } else {
        throw new Error("Upload failed");
      }
    } catch (error) {
      console.error("Error saving rectification photo:", error);
      toast.error("Failed to save photo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (onRemoveAfterPhoto && confirm("Remove rectification photo?")) {
      try {
        await onRemoveAfterPhoto();
        setNotes("");
        toast.success("Rectification photo removed");
      } catch (error) {
        console.error("Error removing photo:", error);
        toast.error("Failed to remove photo");
      }
    }
  };

  const handleCancelPending = () => {
    setPendingFile(null);
    setPreviewUrl(null);
  };

  const displayAfterUrl = previewUrl || afterPhotoUrl;
  const hasBeforePhoto = !!beforePhotoUrl;
  const hasAfterPhoto = !!displayAfterUrl;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4" />
          Before / After Comparison
        </Label>
        {hasBeforePhoto && hasAfterPhoto && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(true)}
          >
            <Maximize2 className="w-4 h-4 mr-1" />
            Expand
          </Button>
        )}
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-4">
        {/* Before */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground text-center">Before</div>
          <div className="aspect-square border-2 border-dashed rounded-lg overflow-hidden bg-muted/50 flex items-center justify-center">
            {hasBeforePhoto ? (
              <RobustImage
                src={beforePhotoUrl!}
                alt="Before"
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setIsExpanded(true)}
              />
            ) : (
              <div className="text-center text-muted-foreground p-4">
                <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">No original photo</p>
              </div>
            )}
          </div>
        </div>

        {/* After */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground text-center">After</div>
          <div className="aspect-square border-2 border-dashed rounded-lg overflow-hidden bg-muted/50 flex items-center justify-center relative">
            {hasAfterPhoto ? (
              <>
                <RobustImage
                  src={displayAfterUrl!}
                  alt="After"
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setIsExpanded(true)}
                />
                {!readOnly && afterPhotoUrl && !previewUrl && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 w-6 h-6"
                    onClick={handleRemove}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
                {previewUrl && (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-2 right-2 w-6 h-6"
                    onClick={handleCancelPending}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </>
            ) : !readOnly ? (
              <div className="flex flex-col gap-2 p-2 w-full">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full"
                  onClick={handleCapture}
                  disabled={isUploading || uploading}
                >
                  <Camera className="w-4 h-4 mr-1" />
                  Capture
                </Button>
                <label className="w-full">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    asChild
                    disabled={isUploading || uploading}
                  >
                    <span>
                      <Upload className="w-4 h-4 mr-1" />
                      Upload
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            ) : (
              <div className="text-center text-muted-foreground p-4">
                <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">No rectification photo</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notes and Save (when pending) */}
      {previewUrl && !readOnly && (
        <div className="space-y-3 p-3 bg-muted/50 rounded-lg border">
          <div>
            <Label htmlFor="rectification-notes" className="text-sm">Rectification Notes</Label>
            <Textarea
              id="rectification-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the fix..."
              rows={2}
              className="mt-1"
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={isUploading || uploading}
            className="w-full"
          >
            {isUploading || uploading ? "Saving..." : "Save Rectification Photo"}
          </Button>
        </div>
      )}

      {/* Display existing notes */}
      {afterPhotoUrl && afterNotes && !previewUrl && (
        <div className="p-3 bg-muted/50 rounded-lg text-sm">
          <div className="font-medium mb-1">Rectification Notes:</div>
          <p className="text-muted-foreground">{afterNotes}</p>
          {rectifiedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Rectified: {new Date(rectifiedAt).toLocaleDateString()}
              {rectifiedBy && ` by ${rectifiedBy}`}
            </p>
          )}
        </div>
      )}

      {/* Expanded Modal View */}
      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Before / After Comparison</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="text-lg font-semibold text-center text-destructive">Before</div>
              <div className="aspect-video border rounded-lg overflow-hidden bg-muted">
                {hasBeforePhoto ? (
                  <RobustImage
                    src={beforePhotoUrl!}
                    alt="Before"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    No original photo
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-lg font-semibold text-center text-green-600">After</div>
              <div className="aspect-video border rounded-lg overflow-hidden bg-muted">
                {hasAfterPhoto ? (
                  <RobustImage
                    src={displayAfterUrl!}
                    alt="After"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    No rectification photo
                  </div>
                )}
              </div>
            </div>
          </div>
          {afterNotes && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <div className="font-medium mb-2">Rectification Notes:</div>
              <p>{afterNotes}</p>
              {rectifiedAt && (
                <p className="text-sm text-muted-foreground mt-2">
                  Rectified on {new Date(rectifiedAt).toLocaleString()}
                  {rectifiedBy && ` by ${rectifiedBy}`}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
