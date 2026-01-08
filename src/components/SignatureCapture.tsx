import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pen, Trash2, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SignatureData {
  id: string;
  signer_type: string;
  signer_name: string;
  signer_email: string | null;
  signature_data: string;
  signature_url: string | null;
  signed_at: string;
}

interface SignatureCaptureProps {
  inspectionId: string;
  signerType: 'inspector' | 'contractor' | 'client' | 'witness';
  title: string;
  onSignatureSaved?: (signature: SignatureData) => void;
  existingSignature?: SignatureData | null;
}

export const SignatureCapture = ({
  inspectionId,
  signerType,
  title,
  onSignatureSaved,
  existingSignature,
}: SignatureCaptureProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [signature, setSignature] = useState<SignatureData | null>(existingSignature || null);

  useEffect(() => {
    if (existingSignature) {
      setSignature(existingSignature);
      setSignerName(existingSignature.signer_name);
      setSignerEmail(existingSignature.signer_email || "");
    }
  }, [existingSignature]);

  useEffect(() => {
    if (isDialogOpen && canvasRef.current) {
      initCanvas();
    }
  }, [isDialogOpen]);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Set drawing style
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Clear canvas with white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    setHasSignature(false);
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    initCanvas();
  };

  const saveSignature = async () => {
    if (!signerName.trim()) {
      toast.error("Please enter signer name");
      return;
    }

    if (!hasSignature) {
      toast.error("Please draw a signature");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsSaving(true);

    try {
      // Convert canvas to base64
      const signatureData = canvas.toDataURL("image/png");

      // Save to database
      const { data, error } = await supabase
        .from("inspection_signatures")
        .upsert(
          {
            inspection_id: inspectionId,
            signer_type: signerType,
            signer_name: signerName.trim(),
            signer_email: signerEmail.trim() || null,
            signature_data: signatureData,
            signed_at: new Date().toISOString(),
          },
          {
            onConflict: "inspection_id,signer_type",
          }
        )
        .select()
        .single();

      if (error) throw error;

      setSignature(data);
      setIsDialogOpen(false);
      toast.success("Signature saved successfully");

      if (onSignatureSaved) {
        onSignatureSaved(data);
      }
    } catch (error) {
      console.error("Error saving signature:", error);
      toast.error("Failed to save signature");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSignature = async () => {
    if (!signature) return;

    try {
      const { error } = await supabase
        .from("inspection_signatures")
        .delete()
        .eq("id", signature.id);

      if (error) throw error;

      setSignature(null);
      setSignerName("");
      setSignerEmail("");
      toast.success("Signature removed");
    } catch (error) {
      console.error("Error deleting signature:", error);
      toast.error("Failed to remove signature");
    }
  };

  return (
    <>
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            {signature && (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <Check className="h-3 w-3 mr-1" />
                Signed
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {signature ? (
            <div className="space-y-3">
              <div className="bg-muted/50 p-3 rounded-lg">
                <img
                  src={signature.signature_data}
                  alt="Signature"
                  className="max-h-20 mx-auto"
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{signature.signer_name}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(signature.signed_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={deleteSignature}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full h-20 border-dashed"
              onClick={() => setIsDialogOpen(true)}
            >
              <Pen className="h-5 w-5 mr-2" />
              Tap to Sign
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="signerName">Full Name *</Label>
              <Input
                id="signerName"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Enter full name"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="signerEmail">Email (optional)</Label>
              <Input
                id="signerEmail"
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder="Enter email address"
              />
            </div>

            <div className="space-y-2">
              <Label>Signature</Label>
              <div className="border rounded-lg bg-white relative">
                <canvas
                  ref={canvasRef}
                  className="w-full h-40 touch-none cursor-crosshair"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={clearSignature}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Draw your signature above
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSaving}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={saveSignature} disabled={isSaving || !hasSignature}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Save Signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
