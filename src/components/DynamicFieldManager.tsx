import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Upload, X, Camera } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCamera } from "@/hooks/useCamera";

interface DynamicField {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "image";
  value: string;
  images?: Array<{ url: string; name: string }>;
}

interface DynamicFieldManagerProps {
  inspectionId: string;
  sectionKey: string;
  initialFields?: DynamicField[];
  onFieldsChange?: (fields: DynamicField[]) => void;
}

export const DynamicFieldManager = ({
  inspectionId,
  sectionKey,
  initialFields = [],
  onFieldsChange,
}: DynamicFieldManagerProps) => {
  const [fields, setFields] = useState<DynamicField[]>(initialFields);
  const [newFieldOpen, setNewFieldOpen] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<DynamicField["type"]>("text");
  const [uploadingImages, setUploadingImages] = useState<Set<string>>(new Set());
  const { isNative, selectImages } = useCamera();

  const addField = () => {
    if (!newFieldLabel.trim()) {
      toast.error("Please enter a field label");
      return;
    }

    const newField: DynamicField = {
      id: `field_${Date.now()}`,
      label: newFieldLabel,
      type: newFieldType,
      value: "",
      images: newFieldType === "image" ? [] : undefined,
    };

    const updatedFields = [...fields, newField];
    setFields(updatedFields);
    onFieldsChange?.(updatedFields);
    
    setNewFieldLabel("");
    setNewFieldType("text");
    setNewFieldOpen(false);
    toast.success("Field added");
  };

  const updateFieldValue = (fieldId: string, value: string) => {
    const updatedFields = fields.map(f =>
      f.id === fieldId ? { ...f, value } : f
    );
    setFields(updatedFields);
    onFieldsChange?.(updatedFields);
  };

  const deleteField = (fieldId: string) => {
    const updatedFields = fields.filter(f => f.id !== fieldId);
    setFields(updatedFields);
    onFieldsChange?.(updatedFields);
    toast.success("Field removed");
  };

  /**
   * Compresses an image using Canvas API before upload
   * Target: ~50-100KB output for efficient PDF generation
   */
  const compressImageForUpload = async (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve(file);
        return;
      }

      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        
        const MAX_WIDTH = 800;
        const QUALITY = 0.7;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              console.log(`Image compressed: ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB`);
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          QUALITY
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };

      img.src = url;
    });
  };

  const handleImageUpload = async (fieldId: string, file: File) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    setUploadingImages(prev => new Set(prev).add(fieldId));

    try {
      let processedFile = file;
      
      // Convert HEIC/HEIF images to JPEG for cross-browser compatibility
      if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
        try {
          const heic2any = (await import('heic2any')).default;
          const convertedBlob = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.9
          });
          
          const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
          processedFile = new File([blob], file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'), { type: 'image/jpeg' });
        } catch (conversionError) {
          console.error("Error converting HEIC image:", conversionError);
          toast.error("Failed to convert HEIC image. Please use JPG or PNG.");
          return;
        }
      }
      
      // Compress image before upload for optimized storage and PDF generation
      const compressedBlob = await compressImageForUpload(processedFile);
      const finalFileName = processedFile.name.replace(/\.[^.]+$/, '.jpg');
      const finalFile = new File([compressedBlob], finalFileName, { type: 'image/jpeg' });
      
      const fileName = `${Date.now()}-${finalFile.name}`;
      const filePath = `${inspectionId}/${sectionKey}/${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from("inspection-photos")
        .upload(filePath, finalFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("inspection-photos")
        .getPublicUrl(filePath);

      const updatedFields = fields.map(f => {
        if (f.id === fieldId) {
          return {
            ...f,
            images: [...(f.images || []), { url: publicUrl, name: processedFile.name }]
          };
        }
        return f;
      });

      setFields(updatedFields);
      onFieldsChange?.(updatedFields);
      toast.success("Image uploaded");
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Failed to upload image");
    } finally {
      setUploadingImages(prev => {
        const next = new Set(prev);
        next.delete(fieldId);
        return next;
      });
    }
  };

  const removeImage = (fieldId: string, imageUrl: string) => {
    const updatedFields = fields.map(f => {
      if (f.id === fieldId && f.images) {
        return {
          ...f,
          images: f.images.filter(img => img.url !== imageUrl)
        };
      }
      return f;
    });
    setFields(updatedFields);
    onFieldsChange?.(updatedFields);
  };

  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const handleTakePhoto = async (fieldId: string) => {
    // For native apps, use Capacitor camera directly
    if (isNative) {
      setUploadingImages(prev => new Set(prev).add(fieldId));
      try {
        const files = await selectImages();
        
        if (files.length === 0) {
          toast.info("No images selected");
          return;
        }

        for (const file of files) {
          await handleImageUpload(fieldId, file);
        }
      } catch (error) {
        console.error("Error capturing images:", error);
        toast.error("Failed to capture images");
        setUploadingImages(prev => {
          const next = new Set(prev);
          next.delete(fieldId);
          return next;
        });
      }
      return;
    }

    // For web browsers, trigger the file input with camera capture
    const input = document.getElementById(`camera-capture-${fieldId}`) as HTMLInputElement;
    if (!input) return;
    input.click();
  };

  const handleAddPhotos = async (fieldId: string) => {
    // For native apps, use Capacitor camera/gallery
    if (isNative) {
      setUploadingImages(prev => new Set(prev).add(fieldId));
      try {
        const files = await selectImages();
        
        if (files.length === 0) {
          toast.info("No images selected");
          return;
        }

        for (const file of files) {
          await handleImageUpload(fieldId, file);
        }
      } catch (error) {
        console.error("Error selecting images:", error);
        toast.error("Failed to select images");
        setUploadingImages(prev => {
          const next = new Set(prev);
          next.delete(fieldId);
          return next;
        });
      }
      return;
    }

    // For web browsers, trigger the file input for gallery selection
    const input = document.getElementById(`image-upload-${fieldId}`) as HTMLInputElement;
    if (!input) return;
    input.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold">Custom Fields</h4>
        <Dialog open={newFieldOpen} onOpenChange={setNewFieldOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Field
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Custom Field</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Field Label</Label>
                <Input
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  placeholder="e.g., Foundation Status, Equipment Serial #"
                />
              </div>
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select value={newFieldType} onValueChange={(v: any) => setNewFieldType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text Input</SelectItem>
                    <SelectItem value="textarea">Text Area</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="image">Image Upload</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addField} className="w-full">
                Add Field
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {fields.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No custom fields yet. Click "Add Field" to create one.
          </CardContent>
        </Card>
      )}

      {fields.map((field) => (
        <Card key={field.id}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-3">
              <Label className="font-semibold">{field.label}</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteField(field.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            {field.type === "text" && (
              <Input
                value={field.value}
                onChange={(e) => updateFieldValue(field.id, e.target.value)}
                placeholder={`Enter ${field.label.toLowerCase()}`}
              />
            )}

            {field.type === "textarea" && (
              <Textarea
                value={field.value}
                onChange={(e) => updateFieldValue(field.id, e.target.value)}
                placeholder={`Enter ${field.label.toLowerCase()}`}
                rows={3}
              />
            )}

            {field.type === "number" && (
              <Input
                type="number"
                value={field.value}
                onChange={(e) => updateFieldValue(field.id, e.target.value)}
                placeholder={`Enter ${field.label.toLowerCase()}`}
              />
            )}

            {field.type === "image" && (
              <div className="space-y-3">
                {/* Hidden input for camera capture - use image/* only for best camera compatibility */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    files.forEach(file => handleImageUpload(field.id, file));
                    e.target.value = '';
                  }}
                  className="hidden"
                  id={`camera-capture-${field.id}`}
                />
                {/* Hidden input for gallery selection */}
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    files.forEach(file => handleImageUpload(field.id, file));
                    e.target.value = '';
                  }}
                  className="hidden"
                  id={`image-upload-${field.id}`}
                />
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  {/* Take Photo button - prominent on mobile */}
                  {isMobileDevice && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleTakePhoto(field.id)}
                      disabled={uploadingImages.has(field.id)}
                      className="w-full sm:w-auto"
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      {uploadingImages.has(field.id) ? "Uploading..." : "Take Photo"}
                    </Button>
                  )}
                  {/* Add Photos button - for gallery/file selection */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddPhotos(field.id)}
                    disabled={uploadingImages.has(field.id)}
                    className="w-full sm:w-auto"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {uploadingImages.has(field.id) ? "Uploading..." : "Add Photos"}
                  </Button>
                </div>

                {field.images && field.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {field.images.map((image, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={image.url}
                          alt={image.name}
                          className="w-full h-24 object-cover rounded"
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeImage(field.id, image.url)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
