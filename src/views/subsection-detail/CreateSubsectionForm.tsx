import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { SUBSECTION_CATEGORIES, getCategoryIcon } from "@/lib/subsectionCategories";
import type { EditFormData } from "./types";

interface CreateSubsectionFormProps {
  editFormData: EditFormData;
  setEditFormData: React.Dispatch<React.SetStateAction<EditFormData>>;
  saving: boolean;
  clientId: string | undefined;
  siteId: string | undefined;
  handleCreateSubsection: () => void;
  navigate: (path: string) => void;
}

export function CreateSubsectionForm({
  editFormData,
  setEditFormData,
  saving,
  clientId,
  siteId,
  handleCreateSubsection,
  navigate,
}: CreateSubsectionFormProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => {
          const basePath = clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`;
          navigate(basePath);
        }}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create New Subsection</h1>
          <p className="text-sm text-muted-foreground">Add a new subsection or tenant to this site</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subsection Details</CardTitle>
          <CardDescription>Enter the details for the new subsection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Subsection Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Main Board, Tenant A"
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant_name">Tenant/Unit Name</Label>
            <Input
              id="tenant_name"
              placeholder="e.g., Shop 123, Office Floor 2"
              value={editFormData.tenant_name}
              onChange={(e) => setEditFormData({ ...editFormData, tenant_name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select
              value={editFormData.category}
              onValueChange={(value) => setEditFormData({ ...editFormData, category: value })}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {SUBSECTION_CATEGORIES.map((cat) => {
                  const Icon = getCategoryIcon(cat.value);
                  return (
                    <SelectItem key={cat.value} value={cat.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {cat.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="is_coc_required"
              checked={editFormData.is_coc_required}
              onChange={(e) => setEditFormData({ ...editFormData, is_coc_required: e.target.checked })}
              className="rounded border-gray-300"
            />
            <Label htmlFor="is_coc_required" className="font-normal cursor-pointer">
              Certificate of Compliance (COC) Required
            </Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleCreateSubsection}
              disabled={saving}
              className="flex-1"
            >
              {saving ? "Creating..." : "Create Subsection"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const basePath = clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`;
                navigate(basePath);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
