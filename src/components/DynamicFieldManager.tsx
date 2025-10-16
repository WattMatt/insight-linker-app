import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

  const handleImageUpload = async (fieldId: string, file: File) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    setUploadingImages(prev => new Set(prev).add(fieldId));

    try {
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = `${inspectionId}/${sectionKey}/${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from("inspection-photos")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("inspection-photos")
        .getPublicUrl(filePath);

      const updatedFields = fields.map(f => {
        if (f.id === fieldId) {
          return {
            ...f,
            images: [...(f.images || []), { url: publicUrl, name: file.name }]
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
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach(file => handleImageUpload(field.id, file));
                  }}
                  className="hidden"
                  id={`image-upload-${field.id}`}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById(`image-upload-${field.id}`)?.click()}
                  disabled={uploadingImages.has(field.id)}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {uploadingImages.has(field.id) ? "Uploading..." : "Upload Images"}
                </Button>

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
