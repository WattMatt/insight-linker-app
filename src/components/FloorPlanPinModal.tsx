import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Camera, Trash2, Save, Upload, MapPin } from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { toast } from "sonner";

interface PinData {
  id?: string;
  pin_type: 'snag' | 'observation';
  title: string;
  notes: string;
  priority?: string;
  status: 'open' | 'resolved';
  assigned_contractor?: string;
  due_date?: string;
  photo_url?: string;
}

interface FloorPlanPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: PinData, photo?: File) => Promise<void>;
  onDelete?: () => Promise<void>;
  onMove?: () => void;
  initialData?: PinData;
  pinNumber: number;
}

const CONTRACTORS = [
  "General Contractor",
  "Plumbing",
  "Electrical",
  "HVAC",
  "Carpentry",
  "Painting",
  "Flooring",
  "Roofing",
  "Other"
];

export const FloorPlanPinModal = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  onMove,
  initialData,
  pinNumber,
}: FloorPlanPinModalProps) => {
  const { takePicture } = useCamera();
  // Show type selection for new pins (no title) or if explicitly in type mode
  const isNewPin = !initialData?.title;
  const [step, setStep] = useState<'type' | 'details'>(isNewPin ? 'type' : 'details');
  const [formData, setFormData] = useState<PinData>({
    pin_type: 'snag',
    title: '',
    notes: '',
    status: 'open',
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      // Show type selection for new pins (those without a title)
      const isNewPin = !initialData.title;
      setStep(isNewPin ? 'type' : 'details');
      if (initialData.photo_url) {
        setPhotoPreview(initialData.photo_url);
      }
    } else {
      setFormData({
        pin_type: 'snag',
        title: '',
        notes: '',
        status: 'open',
      });
      setStep('type');
      setPhotoFile(null);
      setPhotoPreview(null);
    }
  }, [initialData, isOpen]);

  const handleTypeSelect = (type: 'snag' | 'observation') => {
    setFormData({ ...formData, pin_type: type });
    setStep('details');
  };

  const handlePhotoCapture = async () => {
    try {
      const photo = await takePicture();
      if (photo) {
        setPhotoFile(photo);
        setPhotoPreview(URL.createObjectURL(photo));
      }
    } catch (error) {
      console.error("Error capturing photo:", error);
      toast.error("Failed to capture photo");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handleSave = async () => {
    console.log("handleSave called", { formData, photoPreview, initialData });
    
    if (!formData.title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    if (!photoPreview && !initialData?.photo_url) {
      toast.error("Please add a photo");
      return;
    }

    setIsSaving(true);
    try {
      console.log("Calling onSave with:", formData);
      await onSave(formData, photoFile || undefined);
      onClose();
    } catch (error) {
      console.error("Error saving pin:", error);
      toast.error("Failed to save pin");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    
    if (confirm("Are you sure you want to delete this item?")) {
      try {
        await onDelete();
        onClose();
      } catch (error) {
        console.error("Error deleting pin:", error);
        toast.error("Failed to delete pin");
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Pin #{pinNumber} {initialData && `• ${formData.pin_type === 'snag' ? 'Snag' : 'Observation'}`}
          </DialogTitle>
          <p className="text-sm text-muted-foreground sr-only">
            {step === 'type' ? 'Select whether this is a snag or an observation' : 'Add details about this pin'}
          </p>
        </DialogHeader>

        {step === 'type' ? (
          <div className="space-y-4 py-4">
            <p className="text-center text-lg font-medium">What did you find?</p>
            <div className="grid grid-cols-2 gap-4">
              <Button
                type="button"
                size="lg"
                className="h-32 flex flex-col gap-2"
                variant="outline"
                onClick={() => handleTypeSelect('snag')}
              >
                <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
                  <span className="text-2xl">⚠️</span>
                </div>
                <div className="text-center">
                  <div className="font-bold text-lg">Snag</div>
                  <div className="text-xs text-muted-foreground">Issue that needs fixing</div>
                </div>
              </Button>
              <Button
                type="button"
                size="lg"
                className="h-32 flex flex-col gap-2"
                variant="outline"
                onClick={() => handleTypeSelect('observation')}
              >
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-2xl">👁️</span>
                </div>
                <div className="text-center">
                  <div className="font-bold text-lg">Observation</div>
                  <div className="text-xs text-muted-foreground">Note for reference</div>
                </div>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Type Selector - Always visible and prominent */}
            <div>
              <Label className="text-base font-semibold mb-3 block">Type</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  size="lg"
                  className="h-24 flex flex-col gap-2"
                  variant={formData.pin_type === 'snag' ? 'default' : 'outline'}
                  onClick={() => setFormData({ ...formData, pin_type: 'snag' })}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    formData.pin_type === 'snag' ? 'bg-white/20' : 'bg-destructive/20'
                  }`}>
                    <span className="text-xl">⚠️</span>
                  </div>
                  <span className="font-bold">Snag</span>
                  <span className="text-xs opacity-70">Issue to fix</span>
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="h-24 flex flex-col gap-2"
                  variant={formData.pin_type === 'observation' ? 'default' : 'outline'}
                  onClick={() => setFormData({ ...formData, pin_type: 'observation' })}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    formData.pin_type === 'observation' ? 'bg-white/20' : 'bg-primary/20'
                  }`}>
                    <span className="text-xl">👁️</span>
                  </div>
                  <span className="font-bold">Observation</span>
                  <span className="text-xs opacity-70">Note only</span>
                </Button>
              </div>
            </div>

            {/* Photo - Featured prominently */}
            <div className="border-2 border-dashed rounded-lg p-4">
              <Label className="text-base font-semibold">Photo {!photoPreview && "(Required)"}</Label>
              <div className="mt-3 space-y-2">
                {photoPreview ? (
                  <div className="relative">
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="w-full h-64 object-cover rounded-lg border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={handleRemovePhoto}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="lg"
                      variant="default"
                      className="h-20"
                      onClick={handlePhotoCapture}
                    >
                      <Camera className="w-6 h-6 mr-2" />
                      Take Photo
                    </Button>
                    <label>
                      <Button type="button" size="lg" variant="outline" className="w-full h-20" asChild>
                        <span>
                          <Upload className="w-6 h-6 mr-2" />
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
                )}
              </div>
            </div>

            {/* Title */}
            <div>
              <Label htmlFor="title" className="text-base">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="What's the issue?"
                className="text-base"
              />
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes" className="text-base">Details</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Add more information..."
                rows={3}
              />
            </div>

            {/* Snag-specific fields */}
            {formData.pin_type === 'snag' && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold text-sm text-muted-foreground">Snag Details</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Priority */}
                  <div>
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={formData.priority || ''}
                      onValueChange={(value) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">🟢 Low</SelectItem>
                        <SelectItem value="medium">🟡 Medium</SelectItem>
                        <SelectItem value="high">🟠 High</SelectItem>
                        <SelectItem value="critical">🔴 Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Due Date */}
                  <div>
                    <Label htmlFor="due_date">Due Date</Label>
                    <Input
                      id="due_date"
                      type="date"
                      value={formData.due_date || ''}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    />
                  </div>
                </div>

                {/* Assigned Contractor */}
                <div>
                  <Label htmlFor="contractor">Assigned To</Label>
                  <Select
                    value={formData.assigned_contractor || ''}
                    onValueChange={(value) => setFormData({ ...formData, assigned_contractor: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select contractor" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTRACTORS.map((contractor) => (
                        <SelectItem key={contractor} value={contractor}>
                          {contractor}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Status */}
            <div className="pt-4 border-t">
              <Label>Status</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant={formData.status === 'open' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setFormData({ ...formData, status: 'open' })}
                >
                  Open
                </Button>
                <Button
                  type="button"
                  variant={formData.status === 'resolved' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setFormData({ ...formData, status: 'resolved' })}
                >
                  ✓ Resolved
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'details' && (
          <DialogFooter className="gap-2">
            <div className="flex gap-2 mr-auto">
              {initialData && onMove && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onMove}
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Move Pin
                </Button>
              )}
              {initialData && onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              )}
            </div>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || (!photoPreview && !initialData?.photo_url)}>
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};