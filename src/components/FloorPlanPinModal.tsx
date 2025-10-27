import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Camera, Trash2, Save } from "lucide-react";
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
  initialData,
  pinNumber,
}: FloorPlanPinModalProps) => {
  const { takePicture } = useCamera();
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
      setPhotoFile(null);
      setPhotoPreview(null);
    }
  }, [initialData, isOpen]);

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
    if (!formData.title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    setIsSaving(true);
    try {
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
            {initialData ? `Edit Item #${pinNumber}` : `New Item #${pinNumber}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type Toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={formData.pin_type === 'snag' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setFormData({ ...formData, pin_type: 'snag' })}
            >
              Snag
            </Button>
            <Button
              type="button"
              variant={formData.pin_type === 'observation' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setFormData({ ...formData, pin_type: 'observation' })}
            >
              Observation
            </Button>
          </div>

          {/* Photo */}
          <div>
            <Label>Photo</Label>
            <div className="mt-2 space-y-2">
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
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={handlePhotoCapture}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Take Photo
                  </Button>
                  <label className="flex-1">
                    <Button type="button" variant="outline" className="w-full" asChild>
                      <span>Upload File</span>
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
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Brief description"
            />
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Detailed description..."
              rows={4}
            />
          </div>

          {/* Snag-specific fields */}
          {formData.pin_type === 'snag' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                {/* Priority */}
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority || ''}
                    onValueChange={(value) => setFormData({ ...formData, priority: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
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
                <Label htmlFor="contractor">Assigned Contractor</Label>
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
            </>
          )}

          {/* Status */}
          <div>
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
                Resolved
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {initialData && onDelete && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              className="mr-auto"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};