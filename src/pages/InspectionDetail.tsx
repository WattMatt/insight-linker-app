import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Save, Camera, Upload, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import QRCode from "qrcode";
// Firebase imports removed - now using Supabase
import { supabase } from "@/integrations/supabase/client";

interface InspectionTemplate {
  name: string;
  sections: {
    [key: string]: {
      name: string;
      items: {
        [key: string]: {
          name: string;
          type?: string;
        };
      };
    };
  };
}

interface InspectionData {
  type: string;
  date: string;
  projectName?: string;
  shopNumber?: string;
  shopName?: string;
  inspectorName?: string;
  clientRep?: string;
  consultant?: string;
  contractor?: string;
  testingParty?: string;
  location?: string;
  jsonData?: {
    [sectionKey: string]: {
      [itemKey: string]: {
        status?: string;
        notes?: string;
        photos?: string[];
      };
    };
  };
}

const InspectionDetail = () => {
  const { clientId, siteId, subsectionId, inspectionId } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<InspectionTemplate | null>(null);
  const [inspection, setInspection] = useState<InspectionData | null>(null);
  const [siteData, setSiteData] = useState<any>(null);
  const [subsectionData, setSubsectionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [activeTab, setActiveTab] = useState("");
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const [uploadingImages, setUploadingImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (clientId && siteId && subsectionId && inspectionId) {
      fetchInspectionData();
    }
  }, [clientId, siteId, subsectionId, inspectionId]);

  const fetchInspectionData = async () => {
    try {
      setLoading(true);

      // Fetch inspection from Supabase - try firebase_id first, then UUID
      let inspData, inspError;
      
      // First try with firebase_id
      const { data: fbData, error: fbError } = await supabase
        .from('inspections')
        .select(`
          *,
          inspection_templates!template_id (
            id,
            name,
            sections
          ),
          sites!inner (
            id,
            name,
            address,
            client_id
          ),
          subsections!inner (
            id,
            name
          )
        `)
        .eq('firebase_id', inspectionId)
        .maybeSingle();
      
      // If not found by firebase_id, try by UUID
      if (!fbData) {
        const { data: uuidData, error: uuidError } = await supabase
          .from('inspections')
          .select(`
            *,
            inspection_templates!template_id (
              id,
              name,
              sections
            ),
            sites!inner (
              id,
              name,
              address,
              client_id
            ),
            subsections!inner (
              id,
              name
            )
          `)
          .eq('id', inspectionId)
          .maybeSingle();
        
        inspData = uuidData;
        inspError = uuidError;
      } else {
        inspData = fbData;
        inspError = fbError;
      }

      if (inspError || !inspData) {
        console.error("Error fetching inspection from Supabase:", inspError);
        toast.error("Inspection not found");
        navigate(`/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}`);
        return;
      }

      // Map Supabase data to inspection format
      const mappedInspection: InspectionData = {
        type: inspData.status || '',
        date: inspData.inspection_date || '',
        projectName: inspData.project_name || '',
        shopNumber: inspData.shop_number || '',
        shopName: inspData.shop_name || '',
        inspectorName: inspData.inspector_name || '',
        clientRep: inspData.client_rep || '',
        consultant: inspData.consultant || '',
        contractor: inspData.contractor || '',
        testingParty: inspData.testing_party || '',
        location: inspData.location || '',
        jsonData: (inspData.json_data as InspectionData['jsonData']) || {}
      };

      setInspection(mappedInspection);
      setSiteData({ siteName: inspData.sites.name, physicalAddress: inspData.sites.address });
      setSubsectionData({ name: inspData.subsections.name });

      // Fetch template from the joined data
      if (inspData.inspection_templates && inspData.inspection_templates.sections) {
        const templateData = inspData.inspection_templates;
        setTemplate({
          name: templateData.name,
          sections: templateData.sections as any
        });
        
        // Set first section as active tab
        const firstSection = Object.keys(templateData.sections as any)[0];
        if (firstSection) {
          setActiveTab(firstSection);
        }
      } else {
        console.warn("No template found for inspection");
        toast.error("Inspection template not found");
      }

      // Generate QR code
      const url = `${window.location.origin}/public/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}`;
      const qrDataUrl = await QRCode.toDataURL(url, { width: 200, margin: 2 });
      setQrCodeUrl(qrDataUrl);
    } catch (error) {
      console.error("Error fetching inspection data:", error);
      toast.error("Failed to load inspection data");
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field: string, value: any) => {
    setInspection(prev => prev ? { ...prev, [field]: value } : null);
  };

  const handleItemChange = (sectionKey: string, itemKey: string, field: 'status' | 'notes', value: string) => {
    setInspection(prev => {
      if (!prev) return null;
      
      const jsonData = prev.jsonData || {};
      const sectionData = jsonData[sectionKey] || {};
      const itemData = sectionData[itemKey] || {};

      return {
        ...prev,
        jsonData: {
          ...jsonData,
          [sectionKey]: {
            ...sectionData,
            [itemKey]: {
              ...itemData,
              [field]: value
            }
          }
        }
      };
    });
  };

  const handleImageUpload = async (sectionKey: string, itemKey: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const uploadKey = `${sectionKey}-${itemKey}`;
    setUploadingImages(prev => new Set(prev).add(uploadKey));

    try {
      const uploadedUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${inspectionId}/${sectionKey}/${itemKey}/${Date.now()}-${i}.${fileExt}`;

        const { data, error } = await supabase.storage
          .from('inspection-photos')
          .upload(fileName, file);

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from('inspection-photos')
          .getPublicUrl(data.path);

        uploadedUrls.push(urlData.publicUrl);
      }

      // Add uploaded URLs to inspection data
      setInspection(prev => {
        if (!prev) return null;

        const jsonData = prev.jsonData || {};
        const sectionData = jsonData[sectionKey] || {};
        const itemData = sectionData[itemKey] || {};
        const existingPhotos = itemData.photos || [];

        return {
          ...prev,
          jsonData: {
            ...jsonData,
            [sectionKey]: {
              ...sectionData,
              [itemKey]: {
                ...itemData,
                photos: [...existingPhotos, ...uploadedUrls]
              }
            }
          }
        };
      });

      toast.success(`${uploadedUrls.length} image(s) uploaded successfully`);
    } catch (error) {
      console.error("Error uploading images:", error);
      toast.error("Failed to upload images");
    } finally {
      setUploadingImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(uploadKey);
        return newSet;
      });
    }
  };

  const handleDeleteImage = async (sectionKey: string, itemKey: string, photoUrl: string, index: number) => {
    try {
      // Extract file path from URL
      const urlParts = photoUrl.split('/inspection-photos/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1].split('?')[0];
        await supabase.storage.from('inspection-photos').remove([filePath]);
      }

      // Remove from inspection data
      setInspection(prev => {
        if (!prev) return null;

        const jsonData = prev.jsonData || {};
        const sectionData = jsonData[sectionKey] || {};
        const itemData = sectionData[itemKey] || {};
        const photos = itemData.photos || [];

        return {
          ...prev,
          jsonData: {
            ...jsonData,
            [sectionKey]: {
              ...sectionData,
              [itemKey]: {
                ...itemData,
                photos: photos.filter((_, i) => i !== index)
              }
            }
          }
        };
      });

      toast.success("Image deleted successfully");
    } catch (error) {
      console.error("Error deleting image:", error);
      toast.error("Failed to delete image");
    }
  };

  const handleSave = async () => {
    if (!inspection) return;

    try {
      setSaving(true);

      // Update Supabase inspection using firebase_id
      const { error } = await supabase
        .from('inspections')
        .update({
          project_name: inspection.projectName,
          shop_number: inspection.shopNumber,
          shop_name: inspection.shopName,
          inspection_date: inspection.date,
          inspector_name: inspection.inspectorName,
          client_rep: inspection.clientRep,
          consultant: inspection.consultant,
          contractor: inspection.contractor,
          testing_party: inspection.testingParty,
          location: inspection.location,
          json_data: inspection.jsonData,
          updated_at: new Date().toISOString()
        })
        .eq('firebase_id', inspectionId);

      if (error) throw error;

      toast.success("Inspection saved successfully");
    } catch (error) {
      console.error("Error saving inspection:", error);
      toast.error("Failed to save inspection");
    } finally {
      setSaving(false);
    }
  };

  const renderGeneralInfo = () => (
    <Card>
      <CardHeader>
        <CardTitle>General Information</CardTitle>
        <p className="text-sm text-muted-foreground">Basic details about this inspection.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Project Name</Label>
            <Input
              value={inspection?.projectName || siteData?.siteName || ''}
              onChange={(e) => handleFieldChange('projectName', e.target.value)}
            />
          </div>
          <div>
            <Label>Shop Number</Label>
            <Input
              value={inspection?.shopNumber || subsectionData?.name || ''}
              onChange={(e) => handleFieldChange('shopNumber', e.target.value)}
            />
          </div>
          <div>
            <Label>Shop Name</Label>
            <Input
              value={inspection?.shopName || ''}
              onChange={(e) => handleFieldChange('shopName', e.target.value)}
            />
          </div>
          <div>
            <Label>Inspection Date</Label>
            <Input
              type="date"
              value={inspection?.date ? format(new Date(inspection.date), 'yyyy-MM-dd') : ''}
              onChange={(e) => handleFieldChange('date', e.target.value)}
            />
          </div>
          <div>
            <Label>Inspector Name</Label>
            <Input
              value={inspection?.inspectorName || ''}
              onChange={(e) => handleFieldChange('inspectorName', e.target.value)}
            />
          </div>
          <div>
            <Label>Client Rep</Label>
            <Input
              value={inspection?.clientRep || ''}
              onChange={(e) => handleFieldChange('clientRep', e.target.value)}
            />
          </div>
          <div>
            <Label>Consultant</Label>
            <Input
              value={inspection?.consultant || ''}
              onChange={(e) => handleFieldChange('consultant', e.target.value)}
            />
          </div>
          <div>
            <Label>Contractor</Label>
            <Input
              value={inspection?.contractor || ''}
              onChange={(e) => handleFieldChange('contractor', e.target.value)}
            />
          </div>
          <div>
            <Label>Testing Party</Label>
            <Input
              value={inspection?.testingParty || ''}
              onChange={(e) => handleFieldChange('testingParty', e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Location</Label>
          <Input
            value={inspection?.location || siteData?.physicalAddress || ''}
            onChange={(e) => handleFieldChange('location', e.target.value)}
          />
        </div>
        <div>
          <Label>QR Code</Label>
          <div className="mt-2">
            {qrCodeUrl && (
              <img src={qrCodeUrl} alt="QR Code" className="w-32 h-32 border rounded" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderInspectionItem = (sectionKey: string, itemKey: string, item: any) => {
    const itemData = inspection?.jsonData?.[sectionKey]?.[itemKey] || {};
    const photos = itemData.photos || [];
    const uploadKey = `${sectionKey}-${itemKey}`;
    const isUploading = uploadingImages.has(uploadKey);

    return (
      <div key={itemKey} className="border-b pb-6 mb-6 last:border-b-0">
        <h4 className="font-medium mb-4">{itemKey}. {item.name}</h4>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label>Status</Label>
              <Select
                value={itemData.status || ''}
                onValueChange={(value) => handleItemChange(sectionKey, itemKey, 'status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pass">Pass</SelectItem>
                  <SelectItem value="Fail">Fail</SelectItem>
                  <SelectItem value="N/A">N/A</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes / Observations</Label>
              <Textarea
                value={itemData.notes || ''}
                onChange={(e) => handleItemChange(sectionKey, itemKey, 'notes', e.target.value)}
                rows={4}
                placeholder="Enter notes or observations..."
              />
            </div>
          </div>

          <div>
            <Label>Photos</Label>
            <div className="mt-2 space-y-3">
              {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {photos.map((photo: string, index: number) => (
                    <div key={index} className="relative group">
                      <img
                        src={photo}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-32 object-cover rounded border"
                      />
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteImage(sectionKey, itemKey, photo, index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              
              <input
                ref={(el) => (fileInputRefs.current[uploadKey] = el)}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                onChange={(e) => handleImageUpload(sectionKey, itemKey, e.target.files)}
              />
              
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRefs.current[uploadKey]?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>Uploading...</>
                ) : (
                  <>
                    <Camera className="mr-2 h-4 w-4" />
                    Add Image
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading inspection...</p>
        </div>
      </div>
    );
  }

  if (!inspection || !template) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Inspection or template not found</p>
          <Button 
            className="mt-4" 
            onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}`)}
          >
            Back to Subsection
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Edit Inspection</h1>
            <p className="text-sm text-muted-foreground">
              Site: {siteData?.siteName || 'Unknown'} | Subsection: {subsectionData?.name || 'Unknown'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}`)}
          >
            <X className="mr-2 h-4 w-4" />
            Exit
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
          <TabsTrigger value="general">General Info</TabsTrigger>
          {Object.entries(template.sections || {}).map(([key, section]) => (
            <TabsTrigger key={key} value={key}>
              {section.name}
            </TabsTrigger>
          ))}
          <TabsTrigger value="snag-list">Snag List</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          {renderGeneralInfo()}
        </TabsContent>

        {Object.entries(template.sections || {}).map(([sectionKey, section]) => (
          <TabsContent key={sectionKey} value={sectionKey} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{section.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.entries(section.items || {}).map(([itemKey, item]) =>
                  renderInspectionItem(sectionKey, itemKey, item)
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        <TabsContent value="snag-list" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Snag List</CardTitle>
              <p className="text-sm text-muted-foreground">
                Items marked as "Fail" or issues identified during inspection
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Snag list functionality coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default InspectionDetail;
