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
import { ComprehensiveInspectionReport } from "@/components/ComprehensiveInspectionReport";
import { SiteDrawingReport } from "@/components/SiteDrawingReport";
import { SiteDrawingInspection } from "@/components/SiteDrawingInspection";
import { DynamicFieldManager } from "@/components/DynamicFieldManager";
import { Badge } from "@/components/ui/badge";

interface InspectionTemplate {
  name: string;
  sections: {
    [key: string]: {
      name: string;
      isImageGallery?: boolean;
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
        images?: {
          [imageId: string]: {
            id?: string;
            url?: string;
            name?: string;
            path?: string;
            size?: number;
          };
        };
      };
    };
  };
}

const InspectionDetail = () => {
  const { clientId, siteId, subsectionId, inspectionId } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<InspectionTemplate | null>(null);
  const [templateCategory, setTemplateCategory] = useState<string>("");
  const [inspection, setInspection] = useState<InspectionData | null>(null);
  const [siteData, setSiteData] = useState<any>(null);
  const [subsectionData, setSubsectionData] = useState<any>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [activeTab, setActiveTab] = useState("");
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const [uploadingImages, setUploadingImages] = useState<Set<string>>(new Set());
  const [migratingImages, setMigratingImages] = useState<Set<string>>(new Set());
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  useEffect(() => {
    if (clientId && siteId && subsectionId && inspectionId) {
      fetchInspectionData();
      fetchCompanyLogo();
    }
  }, [clientId, siteId, subsectionId, inspectionId]);

  const fetchCompanyLogo = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('company_logo_url')
        .maybeSingle();
      
      if (error) throw error;
      
      if (data?.company_logo_url) {
        setCompanyLogo(data.company_logo_url);
      }
    } catch (error) {
      console.error("Error fetching company logo:", error);
    }
  };

  const fetchInspectionData = async () => {
    try {
      setLoading(true);

      // Determine if inspectionId is a UUID or Firebase ID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inspectionId || '');
      
      // Fetch inspection - use appropriate column based on ID format
      let inspData, inspError;
      
      if (isUUID) {
        // Query by UUID
        const result = await supabase
          .from('inspections')
          .select(`
            *,
            sites (
              id,
              name,
              address
            ),
            subsections (
              id,
              name
            )
          `)
          .eq('id', inspectionId)
          .maybeSingle();
        inspData = result.data;
        inspError = result.error;
      } else {
        // Query by firebase_id
        const result = await supabase
          .from('inspections')
          .select(`
            *,
            sites (
              id,
              name,
              address
            ),
            subsections (
              id,
              name
            )
          `)
          .eq('firebase_id', inspectionId)
          .maybeSingle();
        inspData = result.data;
        inspError = result.error;
      }

      if (inspError || !inspData) {
        console.error("Error fetching inspection:", inspError);
        toast.error("Inspection not found");
        navigate(`${(clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`)}/subsections/${subsectionId}`);
        return;
      }

      // Fetch template separately if template_id exists
      let templateData = null;
      if (inspData.template_id) {
        const { data: template, error: templateError } = await supabase
          .from('inspection_templates')
          .select('*')
          .eq('id', inspData.template_id)
          .maybeSingle();

        if (template && !templateError) {
          templateData = template;
          setTemplateId(inspData.template_id); // Store template ID
          setTemplateCategory(template.category || ""); // Store template category
        }
      }

      // Map inspection data
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
      
      // Set site and subsection data
      if (inspData.sites) {
        setSiteData({ 
          siteName: inspData.sites.name, 
          physicalAddress: inspData.sites.address 
        });
      }
      
      if (inspData.subsections) {
        setSubsectionData({ name: inspData.subsections.name });
      }

      // Set template if available
      if (templateData && templateData.sections) {
        setTemplate({
          name: templateData.name,
          sections: templateData.sections as any
        });
        
        // Set first section as active tab
        const firstSection = Object.keys(templateData.sections as any)[0];
        if (firstSection) {
          setActiveTab(firstSection);
        } else {
          setActiveTab('general');
        }
      } else {
        // No template - create a basic structure from json_data if it exists
        if (mappedInspection.jsonData && Object.keys(mappedInspection.jsonData).length > 0) {
          const sections: any = {};
          const imageCategories = ['General', 'DB', 'Earthing', 'LV', 'HV', 'Generator', 'Relay', 'Signage'];
          
          Object.keys(mappedInspection.jsonData).forEach(sectionKey => {
            // Check if this is an image category (imagesGeneral, imagesDB, etc.)
            const isImageCategory = imageCategories.some(cat => sectionKey === `images${cat}`);
            
            if (isImageCategory) {
              // Create a special section for image categories
              const categoryName = sectionKey.replace('images', '');
              sections[sectionKey] = {
                name: `${categoryName} Images`,
                items: {},
                isImageGallery: true
              };
            } else if (typeof mappedInspection.jsonData![sectionKey] === 'object' && 
                       !Array.isArray(mappedInspection.jsonData![sectionKey])) {
              // Regular section with items
              sections[sectionKey] = {
                name: sectionKey,
                items: {}
              };
              const sectionData = mappedInspection.jsonData![sectionKey];
              if (sectionData && typeof sectionData === 'object') {
                Object.keys(sectionData).forEach(itemKey => {
                  sections[sectionKey].items[itemKey] = {
                    name: itemKey,
                    type: 'inspection'
                  };
                });
              }
            }
          });
          
          setTemplate({
            name: 'Inspection Template',
            sections
          });
          const firstSection = Object.keys(sections)[0];
          if (firstSection) {
            setActiveTab(firstSection);
          } else {
            setActiveTab('general');
          }
        } else {
          console.warn("No template or inspection data found");
          setActiveTab('general');
        }
      }

      // Generate QR code with logo
      const url = `${window.location.origin}/public/subsections/${inspData.subsection_id || subsectionId}`;
      
      const canvas = document.createElement('canvas');
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      
      await QRCode.toCanvas(canvas, url, {
        width: size,
        margin: 2,
        errorCorrectionLevel: 'H'
      });
      
      if (companyLogo) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          img.onload = () => {
            const logoWidth = size * 0.24 * 1.5; // Rectangular, wider than tall
            const logoHeight = size * 0.24;
            const x = (size - logoWidth) / 2;
            const y = (size - logoHeight) / 2;
            const padding = logoHeight * 0.1; // 10% of logo height
            
            // Draw white rectangular background for logo
            ctx.fillStyle = 'white';
            ctx.fillRect(
              x - padding, 
              y - padding, 
              logoWidth + (padding * 2), 
              logoHeight + (padding * 2)
            );
            
            ctx.drawImage(img, x, y, logoWidth, logoHeight);
            setQrCodeUrl(canvas.toDataURL());
          };
          
          img.onerror = () => {
            setQrCodeUrl(canvas.toDataURL());
          };
          
          img.src = companyLogo;
        } else {
          setQrCodeUrl(canvas.toDataURL());
        }
      } else {
        setQrCodeUrl(canvas.toDataURL());
      }
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
        let file = files[i];
        
        // Convert HEIC/HEIF images to JPEG for cross-browser compatibility
        if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
          try {
            const heic2any = (await import('heic2any')).default;
            const convertedBlob = await heic2any({
              blob: file,
              toType: 'image/jpeg',
              quality: 0.9
            });
            
            // heic2any can return Blob or Blob[], handle both cases
            const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            file = new File([blob], file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'), { type: 'image/jpeg' });
          } catch (conversionError) {
            console.error("Error converting HEIC image:", conversionError);
            toast.error("Failed to convert HEIC image. Please use JPG or PNG.");
            continue;
          }
        }
        
        const fileExt = file.name.split('.').pop();
        const timestamp = Date.now();
        const fileName = `${inspectionId}/${sectionKey}/${itemKey}/${timestamp}-${i + 1}.${fileExt}`;

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

  const handleMigrateImage = async (sectionKey: string, itemKey: string, firebaseUrl: string, index: number) => {
    const migrateKey = `${sectionKey}-${itemKey}-${index}`;
    setMigratingImages(prev => new Set(prev).add(migrateKey));

    try {
      // Download image from Firebase
      const response = await fetch(firebaseUrl);
      const blob = await response.blob();
      
      // Create a file from the blob
      const fileExt = firebaseUrl.split('.').pop()?.split('?')[0] || 'jpg';
      const fileName = `${inspectionId}/${sectionKey}/${itemKey}/${Date.now()}.${fileExt}`;
      
      // Upload to Supabase
      const { data, error } = await supabase.storage
        .from('inspection-photos')
        .upload(fileName, blob);

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('inspection-photos')
        .getPublicUrl(data.path);

      // Replace Firebase URL with Supabase URL
      setInspection(prev => {
        if (!prev) return null;

        const jsonData = prev.jsonData || {};
        const sectionData = jsonData[sectionKey] || {};
        const itemData = sectionData[itemKey] || {};
        const photos = itemData.photos || [];
        const updatedPhotos = [...photos];
        updatedPhotos[index] = urlData.publicUrl;

        return {
          ...prev,
          jsonData: {
            ...jsonData,
            [sectionKey]: {
              ...sectionData,
              [itemKey]: {
                ...itemData,
                photos: updatedPhotos
              }
            }
          }
        };
      });

      toast.success("Image migrated successfully");
    } catch (error) {
      console.error("Error migrating image:", error);
      toast.error("Failed to migrate image");
    } finally {
      setMigratingImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(migrateKey);
        return newSet;
      });
    }
  };

  const handleDeleteImage = async (sectionKey: string, itemKey: string, photoUrl: string, index: number) => {
    // Only allow deletion of Supabase images
    if (!photoUrl.includes('supabase.co/storage')) {
      toast.error("Firebase images cannot be deleted. Please migrate to Supabase first.");
      return;
    }

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

      // Determine if inspectionId is a UUID or Firebase ID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inspectionId || '');
      
      // Update inspection - use appropriate column based on ID format
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
          status: inspection.type,
          json_data: inspection.jsonData,
          updated_at: new Date().toISOString()
        })
        .eq(isUUID ? 'id' : 'firebase_id', inspectionId);

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

  const renderImageGallery = (sectionKey: string) => {
    const imagesData = inspection?.jsonData?.[sectionKey] || {};
    const images: Array<{ url: string; name: string; id: string }> = [];
    
    // Extract images from Firebase structure
    if (typeof imagesData === 'object' && !Array.isArray(imagesData)) {
      Object.entries(imagesData).forEach(([imgId, imgData]: [string, any]) => {
        if (imgData && (imgData.url || imgData.path)) {
          images.push({
            id: imgId,
            url: imgData.url || imgData.path,
            name: imgData.name || imgData.fileName || imgId
          });
        }
      });
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>{sectionKey.replace('images', '')} Images</CardTitle>
          <p className="text-sm text-muted-foreground">
            {images.length} image{images.length !== 1 ? 's' : ''} in this category
          </p>
        </CardHeader>
        <CardContent>
          {images.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {images.map((img, index) => {
                const isFirebaseUrl = img.url.includes('firebasestorage.googleapis.com');
                const migrateKey = `${sectionKey}-${img.id}`;
                const isMigrating = migratingImages.has(migrateKey);
                
                return (
                  <div key={img.id} className="relative group">
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-48 object-cover rounded border"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {img.name}
                    </div>
                    {/* Firebase migration button hidden from UI */}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No images in this category</p>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderInspectionItem = (sectionKey: string, itemKey: string, item: any) => {
    const itemData = inspection?.jsonData?.[sectionKey]?.[itemKey] || {};
    
    // Handle both Firebase structure (images as objects) and Supabase structure (photos as array)
    let photos: string[] = [];
    if (itemData.photos && Array.isArray(itemData.photos)) {
      photos = itemData.photos;
    } else if (itemData.images && typeof itemData.images === 'object') {
      // Firebase structure: images is an object with image IDs as keys
      photos = Object.values(itemData.images).map((img: any) => img?.url).filter(Boolean);
    }
    
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
                  {photos.map((photo: string, index: number) => {
                    const isFirebaseUrl = photo.includes('firebasestorage.googleapis.com');
                    const isSupabaseImage = photo.includes('supabase.co/storage');
                    const migrateKey = `${sectionKey}-${itemKey}-${index}`;
                    const isMigrating = migratingImages.has(migrateKey);
                    
                    return (
                      <div key={index} className="relative group">
                        <img
                          src={photo}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-32 object-cover rounded border"
                        />
                        {isFirebaseUrl && (
                          <Badge variant="secondary" className="absolute top-1 left-1 text-xs">
                            Legacy
                          </Badge>
                        )}
                        {isSupabaseImage && (
                          <Button
                            size="icon"
                            variant="destructive"
                            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteImage(sectionKey, itemKey, photo, index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
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

  if (!inspection) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Inspection not found</p>
          <Button 
            className="mt-4" 
            onClick={() => navigate(`${(clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`)}/subsections/${subsectionId}`)}
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
            onClick={() => navigate(`${(clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`)}/subsections/${subsectionId}`)}
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
          <ComprehensiveInspectionReport
            inspectionData={inspection}
            siteName={siteData?.siteName || 'Unknown Site'}
            subsectionName={subsectionData?.name || 'Unknown Subsection'}
            templateId={templateId}
          />
          <Button 
            variant="outline" 
            onClick={() => navigate(`${(clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`)}/subsections/${subsectionId}`)}
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
          {templateCategory !== "Site Drawing" && <TabsTrigger value="general">General Info</TabsTrigger>}
          {Object.entries(template.sections || {})
            .filter(([key]) => key !== 'generalInfo') // Skip if template has its own generalInfo section
            .map(([key, section]) => (
              <TabsTrigger key={key} value={key}>
                {section.name}
              </TabsTrigger>
            ))}
          {templateCategory !== "Site Drawing" && <TabsTrigger value="snag-list">Snag List</TabsTrigger>}
        </TabsList>

        {templateCategory === "Site Drawing" ? (
          <TabsContent value={Object.keys(template.sections || {})[0] || "general"} className="space-y-4">
            <SiteDrawingInspection
              inspectionId={inspectionId!}
              initialPdfUrl={(inspection?.jsonData as any)?.siteDrawingPdf}
              initialPins={(inspection?.jsonData as any)?.siteDrawingPins || []}
              onDataChange={(pdfUrl, pins) => {
                setInspection(prev => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    jsonData: {
                      ...prev.jsonData,
                      siteDrawingPdf: pdfUrl,
                      siteDrawingPins: pins
                    } as any
                  };
                });
              }}
            />
          </TabsContent>
        ) : (
          <>
            <TabsContent value="general" className="space-y-4">
              {renderGeneralInfo()}
            </TabsContent>

            {Object.entries(template.sections || {}).map(([sectionKey, section]) => (
              <TabsContent key={sectionKey} value={sectionKey} className="space-y-4">
                {section.isImageGallery ? (
                  renderImageGallery(sectionKey)
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>{section.name}</CardTitle>
                      {templateCategory === "Progress" && (
                        <p className="text-sm text-muted-foreground">
                          Add custom fields and images for this progress report section
                        </p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {Object.entries(section.items || {}).map(([itemKey, item]) =>
                        renderInspectionItem(sectionKey, itemKey, item)
                      )}
                      
                      {templateCategory === "Progress" && (
                        <div className="mt-6 pt-6 border-t">
                          <DynamicFieldManager
                            inspectionId={inspectionId!}
                            sectionKey={sectionKey}
                            initialFields={(inspection?.jsonData?.[`${sectionKey}_customFields`] as any) || []}
                            onFieldsChange={(fields) => {
                              setInspection(prev => {
                                if (!prev) return null;
                                return {
                                  ...prev,
                                  jsonData: {
                                    ...prev.jsonData,
                                    [`${sectionKey}_customFields`]: fields as any
                                  }
                                };
                              });
                            }}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
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
          </>
        )}
      </Tabs>
    </div>
  );
};

export default InspectionDetail;
