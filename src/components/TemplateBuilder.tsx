import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, GripVertical, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TemplateItem {
  id: string;
  name: string;
  type: "text" | "textarea" | "number" | "image" | "document" | "checkbox" | "select";
  required: boolean;
  options?: string[];
}

interface TemplateSection {
  id: string;
  name: string;
  order_index: number;
  items: TemplateItem[];
}

interface Tenant {
  id: string;
  shopNumber: string;
  shopName: string;
  breakerSize: string;
  breakerImage: string;
  ctSizeAndRatio: string;
  ctRatioImage: string;
}

interface TemplateBuilderProps {
  templateId?: string;
  initialData?: {
    name: string;
    category: string;
    description: string;
    sections: TemplateSection[];
    tenants?: Tenant[];
  };
  onSave?: () => void;
}

const TEMPLATE_CATEGORIES = [
  "General",
  "Medium Voltage",
  "Low Voltage",
  "Generator",
  "Solar",
  "Progress",
  "Site Drawing",
];

const FIELD_TYPES = [
  { value: "text", label: "Text Input" },
  { value: "textarea", label: "Text Area" },
  { value: "number", label: "Number" },
  { value: "image", label: "Image Upload" },
  { value: "document", label: "Document Upload" },
  { value: "checkbox", label: "Checkbox (Pass/Fail)" },
  { value: "select", label: "Dropdown Select" },
];

export const TemplateBuilder = ({ templateId, initialData, onSave }: TemplateBuilderProps) => {
  const [templateName, setTemplateName] = useState(initialData?.name || "");
  const [category, setCategory] = useState(initialData?.category || "General");
  const [description, setDescription] = useState(initialData?.description || "");
  const [sections, setSections] = useState<TemplateSection[]>(initialData?.sections || []);
  const [tenants, setTenants] = useState<Tenant[]>(initialData?.tenants || []);
  const [saving, setSaving] = useState(false);

  const addSection = () => {
    const newSection: TemplateSection = {
      id: `section_${Date.now()}`,
      name: "New Section",
      order_index: sections.length,
      items: [],
    };
    setSections([...sections, newSection]);
  };

  const updateSection = (sectionId: string, updates: Partial<TemplateSection>) => {
    setSections(sections.map(s => s.id === sectionId ? { ...s, ...updates } : s));
  };

  const deleteSection = (sectionId: string) => {
    if (!confirm("Are you sure you want to delete this section? This action cannot be undone.")) {
      return;
    }
    setSections(sections.filter(s => s.id !== sectionId));
  };

  const addItem = (sectionId: string) => {
    const newItem: TemplateItem = {
      id: `item_${Date.now()}`,
      name: "New Field",
      type: "text",
      required: false,
    };
    
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return { ...s, items: [...s.items, newItem] };
      }
      return s;
    }));
  };

  const updateItem = (sectionId: string, itemId: string, updates: Partial<TemplateItem>) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          items: s.items.map(i => i.id === itemId ? { ...i, ...updates } : i)
        };
      }
      return s;
    }));
  };

  const deleteItem = (sectionId: string, itemId: string) => {
    if (!confirm("Are you sure you want to delete this field? This action cannot be undone.")) {
      return;
    }
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return { ...s, items: s.items.filter(i => i.id !== itemId) };
      }
      return s;
    }));
  };

  const addTenant = () => {
    const newTenant: Tenant = {
      id: `tenant_${Date.now()}`,
      shopNumber: "",
      shopName: "",
      breakerSize: "",
      breakerImage: "",
      ctSizeAndRatio: "",
      ctRatioImage: "",
    };
    setTenants([...tenants, newTenant]);
  };

  const updateTenant = (tenantId: string, updates: Partial<Tenant>) => {
    setTenants(tenants.map(t => t.id === tenantId ? { ...t, ...updates } : t));
  };

  const deleteTenant = (tenantId: string) => {
    if (!confirm("Are you sure you want to delete this tenant? This action cannot be undone.")) {
      return;
    }
    setTenants(tenants.filter(t => t.id !== tenantId));
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    setSaving(true);
    try {
      const templateData = {
        name: templateName,
        category,
        description,
        sections: sections as any,  // Save as array
        tenants: ((templateName.toLowerCase().includes("main board") || templateName.toLowerCase().includes("shop board")) && tenants.length > 0) ? tenants as any : undefined,
        sections_count: sections.length,
        pages_count: sections.length + 1, // +1 for cover page
        updated_at: new Date().toISOString(),
      };

      if (templateId) {
        // Update existing template
        const { error } = await supabase
          .from("inspection_templates")
          .update(templateData)
          .eq("id", templateId);

        if (error) throw error;
        toast.success("Template updated successfully");
      } else {
        // Create new template
        const { error } = await supabase
          .from("inspection_templates")
          .insert(templateData);

        if (error) throw error;
        toast.success("Template created successfully");
      }

      onSave?.();
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Template Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name *</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g., Progress Report - Building Phase 1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this template..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="structure" className="w-full">
        <TabsList className={`grid w-full max-w-md ${(templateName.toLowerCase().includes("main board") || templateName.toLowerCase().includes("shop board")) ? "grid-cols-2" : "grid-cols-1"}`}>
          <TabsTrigger value="structure">Template Structure</TabsTrigger>
          {(templateName.toLowerCase().includes("main board") || templateName.toLowerCase().includes("shop board")) && <TabsTrigger value="tenants">Tenants</TabsTrigger>}
        </TabsList>

        <TabsContent value="structure" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Sections & Fields</h3>
            <Button onClick={addSection} variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Section
            </Button>
          </div>

          {sections.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No sections yet. Click "Add Section" to create your first section.
              </CardContent>
            </Card>
          )}

          {sections.map((section, sectionIdx) => (
        <Card key={section.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <GripVertical className="h-5 w-5 text-muted-foreground cursor-move" />
              <Input
                value={section.name}
                onChange={(e) => updateSection(section.id, { name: e.target.value })}
                className="font-semibold"
                placeholder="Section name"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteSection(section.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {section.items.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3 border rounded-lg bg-muted/50">
                <GripVertical className="h-4 w-4 text-muted-foreground mt-2 cursor-move" />
                
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Field Name</Label>
                    <Input
                      value={item.name}
                      onChange={(e) => updateItem(section.id, item.id, { name: e.target.value })}
                      placeholder="Field name"
                      className="h-9"
                    />
                  </div>
                  
                  <div>
                    <Label className="text-xs">Field Type</Label>
                    <Select
                      value={item.type}
                      onValueChange={(value: any) => updateItem(section.id, item.id, { type: value })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {item.type === "select" && (
                    <div className="col-span-2">
                      <Label className="text-xs">Options (comma-separated)</Label>
                      <Input
                        value={item.options?.join(", ") || ""}
                        onChange={(e) => updateItem(section.id, item.id, { 
                          options: e.target.value.split(",").map(o => o.trim()).filter(Boolean)
                        })}
                        placeholder="Option 1, Option 2, Option 3"
                        className="h-9"
                      />
                    </div>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteItem(section.id, item.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}

            <Button
              onClick={() => addItem(section.id)}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Field to {section.name}
            </Button>
          </CardContent>
        </Card>
          ))}
        </TabsContent>

        {(templateName.toLowerCase().includes("main board") || templateName.toLowerCase().includes("shop board")) && (
          <TabsContent value="tenants" className="space-y-6 mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Tenant Information</h3>
              <Button onClick={addTenant} variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Tenant
              </Button>
            </div>

          {tenants.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No tenants yet. Click "Add Tenant" to create your first tenant entry.
              </CardContent>
            </Card>
          )}

          {tenants.map((tenant) => (
            <Card key={tenant.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {tenant.shopName || tenant.shopNumber || "New Tenant"}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteTenant(tenant.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Shop Number</Label>
                    <Input
                      value={tenant.shopNumber}
                      onChange={(e) => updateTenant(tenant.id, { shopNumber: e.target.value })}
                      placeholder="e.g., Shop 101"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Shop Name</Label>
                    <Input
                      value={tenant.shopName}
                      onChange={(e) => updateTenant(tenant.id, { shopName: e.target.value })}
                      placeholder="e.g., Coffee Shop"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Breaker Size</Label>
                    <Input
                      value={tenant.breakerSize}
                      onChange={(e) => updateTenant(tenant.id, { breakerSize: e.target.value })}
                      placeholder="e.g., 63A"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Breaker (Image URL)</Label>
                    <Input
                      value={tenant.breakerImage}
                      onChange={(e) => updateTenant(tenant.id, { breakerImage: e.target.value })}
                      placeholder="Image URL or upload path"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>CT Size and Ratio</Label>
                    <Input
                      value={tenant.ctSizeAndRatio}
                      onChange={(e) => updateTenant(tenant.id, { ctSizeAndRatio: e.target.value })}
                      placeholder="e.g., 100/5A"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CT Ratio (Image URL)</Label>
                    <Input
                      value={tenant.ctRatioImage}
                      onChange={(e) => updateTenant(tenant.id, { ctRatioImage: e.target.value })}
                      placeholder="Image URL or upload path"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          </TabsContent>
        )}
      </Tabs>

      <div className="flex justify-end gap-3 pt-6 border-t">
        <Button onClick={saveTemplate} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : templateId ? "Update Template" : "Create Template"}
        </Button>
      </div>
    </div>
  );
};
