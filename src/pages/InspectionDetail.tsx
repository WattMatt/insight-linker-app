import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Save, Camera, Upload, Trash2, ArrowLeft, Plus, Edit, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { ComprehensiveInspectionReport } from "@/components/ComprehensiveInspectionReport";
import { SiteDrawingReport } from "@/components/SiteDrawingReport";
import { InteractiveFloorPlan } from "@/components/InteractiveFloorPlan";
import { DynamicFieldManager } from "@/components/DynamicFieldManager";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCamera } from "@/hooks/useCamera";
import { useImageUpload } from "@/hooks/useImageUpload";
import { RobustImage } from "@/components/RobustImage";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { 
  generateInspectionImagePath, 
  generateTenantImagePath, 
  renameInspectionImages 
} from "@/lib/imageNaming";
import { InspectionSignatures } from "@/components/InspectionSignatures";


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

interface Tenant {
  id: string;
  shopNumber: string;
  shopName: string;
  breakerSize: string;
  breakerImage: string;
  ctSizeAndRatio: string;
  ctRatioImage: string;
  controlStatus48V?: string;
  meterSerialNumber?: string;
  meterImage?: string;
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
  quality_rating?: number;
  tenants?: Tenant[];
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
  const [searchParams] = useSearchParams();
  const previewSiteId = searchParams.get("preview");
  const isContractorPortal = !clientId && !siteId && !subsectionId;
  const { isNative, takePicture, selectImages } = useCamera();
  const { uploadImage, deleteImage, getPathFromUrl } = useImageUpload();
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
  const [renamingImages, setRenamingImages] = useState(false);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [snags, setSnags] = useState<any[]>([]);
  const [loadingSnags, setLoadingSnags] = useState(false);
  const [snagDialogOpen, setSnagDialogOpen] = useState(false);
  const [editingSnag, setEditingSnag] = useState<any>(null);
  const [newSnag, setNewSnag] = useState({
    title: '',
    description: '',
    notes: '',
    photos: [] as string[],
    risk_level: '',
    estimated_cost: ''
  });
  const [uploadingSnagPhotos, setUploadingSnagPhotos] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [newTenant, setNewTenant] = useState<Tenant>({
    id: '',
    shopNumber: '',
    shopName: '',
    breakerSize: '',
    breakerImage: '',
    ctSizeAndRatio: '',
    ctRatioImage: '',
    controlStatus48V: '',
    meterSerialNumber: '',
    meterImage: ''
  });
  const [uploadingTenantImages, setUploadingTenantImages] = useState<Set<string>>(new Set());
  const tenantImageInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  

  // Utility function to convert camelCase to Title Case with spaces
  const formatTabLabel = (text: string): string => {
    if (!text) return text;
    // Insert space before capital letters and capitalize first letter of each word
    return text
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  useEffect(() => {
    // Allow loading with just inspectionId (for contractor portal) or with full path
    if (inspectionId) {
      fetchInspectionData();
      fetchCompanyLogo();
      if (subsectionId) {
        fetchSnags();
      }
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

  const fetchSnags = async () => {
    if (!subsectionId) return;
    await fetchSnagsForSubsection(subsectionId);
  };

  const fetchSnagsForSubsection = async (subId: string) => {
    try {
      setLoadingSnags(true);
      const { data, error } = await supabase
        .from('snags')
        .select('*')
        .eq('subsection_id', subId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setSnags(data || []);
    } catch (error) {
      console.error("Error fetching snags:", error);
      toast.error("Failed to load snags");
    } finally {
      setLoadingSnags(false);
    }
  };

  const handleCreateSnag = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newSnag.title.trim()) {
      toast.error("Snag title is required");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const snagData: any = {
        subsection_id: subsectionId,
        title: newSnag.title,
        description: newSnag.description,
        notes: newSnag.notes,
        photos: newSnag.photos,
        risk_level: newSnag.risk_level || null,
        estimated_cost: newSnag.estimated_cost ? parseFloat(newSnag.estimated_cost) : null,
        status: 'Open',
        created_by: user?.id
      };
      
      const { error } = await supabase
        .from('snags')
        .insert(snagData);
      
      if (error) throw error;
      
      toast.success("Snag created successfully");
      setSnagDialogOpen(false);
      setNewSnag({ title: '', description: '', notes: '', photos: [], risk_level: '', estimated_cost: '' });
      fetchSnags();
    } catch (error) {
      console.error("Error creating snag:", error);
      toast.error("Failed to create snag");
    }
  };

  const handleEditSnag = (snag: any) => {
    setEditingSnag({
      ...snag,
      photos: snag.photos || []
    });
    setSnagDialogOpen(true);
  };

  const handleUpdateSnag = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingSnag?.title?.trim()) {
      toast.error("Please enter a title");
      return;
    }

    try {
      const { error } = await supabase
        .from('snags')
        .update({
          title: editingSnag.title,
          description: editingSnag.description || null,
          notes: editingSnag.notes || null,
          photos: editingSnag.photos.length > 0 ? editingSnag.photos : null,
          risk_level: editingSnag.risk_level || null,
          estimated_cost: editingSnag.estimated_cost ? parseFloat(editingSnag.estimated_cost) : null
        })
        .eq('id', editingSnag.id);
      
      if (error) throw error;
      
      toast.success("Snag updated successfully");
      setSnagDialogOpen(false);
      setEditingSnag(null);
      fetchSnags();
    } catch (error) {
      console.error("Error updating snag:", error);
      toast.error("Failed to update snag");
    }
  };

  const handleCloseSnagDialog = () => {
    setSnagDialogOpen(false);
    setEditingSnag(null);
    setNewSnag({ title: '', description: '', notes: '', photos: [], risk_level: '', estimated_cost: '' });
  };

  const handleToggleSnagStatus = async (snagId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Open' ? 'Closed' : 'Open';
    
    try {
      const { error } = await supabase
        .from('snags')
        .update({ status: newStatus })
        .eq('id', snagId);
      
      if (error) throw error;
      
      toast.success(`Snag ${newStatus.toLowerCase()} successfully`);
      fetchSnags();
    } catch (error) {
      console.error("Error updating snag status:", error);
      toast.error("Failed to update snag status");
    }
  };

  const handleDeleteSnag = async (snagId: string) => {
    if (!confirm("Are you sure you want to delete this snag?")) return;
    
    try {
      const { error } = await supabase
        .from('snags')
        .delete()
        .eq('id', snagId);
      
      if (error) throw error;
      
      toast.success("Snag deleted successfully");
      fetchSnags();
    } catch (error) {
      console.error("Error deleting snag:", error);
      toast.error("Failed to delete snag");
    }
  };

  const handleAddTenant = () => {
    setNewTenant({
      id: `tenant_${Date.now()}`,
      shopNumber: '',
      shopName: '',
      breakerSize: '',
      breakerImage: '',
      ctSizeAndRatio: '',
      ctRatioImage: '',
      controlStatus48V: '',
      meterSerialNumber: '',
      meterImage: ''
    });
    setTenantDialogOpen(true);
  };

  const handleSaveTenant = () => {
    if (!newTenant.shopNumber.trim() || !newTenant.shopName.trim()) {
      toast.error("Shop number and name are required");
      return;
    }

    if (newTenant.id && tenants.find(t => t.id === newTenant.id)) {
      // Update existing tenant
      setTenants(tenants.map(t => t.id === newTenant.id ? newTenant : t));
      toast.success("Tenant updated successfully");
    } else {
      // Add new tenant
      setTenants([...tenants, { ...newTenant, id: newTenant.id || `tenant_${Date.now()}` }]);
      toast.success("Tenant added successfully");
    }

    setTenantDialogOpen(false);
  };

  const handleEditTenant = (tenant: Tenant) => {
    setNewTenant(tenant);
    setTenantDialogOpen(true);
  };

  const handleDeleteTenant = (tenantId: string) => {
    if (!confirm("Are you sure you want to delete this tenant?")) return;
    setTenants(tenants.filter(t => t.id !== tenantId));
    toast.success("Tenant deleted successfully");
  };

  const handleTenantImageUpload = async (tenantId: string, field: 'breakerImage' | 'ctRatioImage' | 'meterImage', files: FileList | null) => {
    if (!files || files.length === 0) return;

    const uploadKey = `${tenantId}-${field}`;
    setUploadingTenantImages(prev => new Set(prev).add(uploadKey));

    try {
      const file = files[0];
      const fileExt = file.name.split('.').pop();
      
      // Generate descriptive file name with client/site/subsection info
      const filePath = generateTenantImagePath({
        clientName: siteData?.siteName || 'unknown-client',
        siteName: siteData?.siteName || 'unknown-site',
        subsectionName: subsectionData?.name || 'unknown-subsection',
        inspectionId: inspectionId!,
        tenantId,
        field,
        fileExtension: fileExt || 'jpg'
      });

      // Use the robust upload with retry logic
      const result = await uploadImage(file, 'inspection-photos', filePath);

      if (!result) {
        throw new Error('Failed to upload image');
      }

      console.log('Image uploaded successfully, URL:', result.url);

      const updatedTenants = tenants.map(t => 
        t.id === tenantId ? { ...t, [field]: result.url } : t
      );
      
      setTenants(updatedTenants);

      // Auto-save to database immediately
      if (inspection) {
        const jsonDataWithTenants = {
          ...inspection.jsonData,
          tenants: updatedTenants
        } as any;

        const { error: saveError } = await supabase
          .from('inspections')
          .update({
            json_data: jsonDataWithTenants,
            updated_at: new Date().toISOString()
          })
          .eq('id', inspectionId);

        if (saveError) {
          console.error("Error auto-saving tenant image:", saveError);
          toast.warning("Image uploaded but auto-save failed. Please click Save to persist changes.");
        } else {
          // Update local inspection state to keep in sync
          setInspection(prev => prev ? { ...prev, jsonData: jsonDataWithTenants } : null);
          toast.success("Image uploaded and saved successfully");
        }
      } else {
        toast.success("Image uploaded successfully");
      }
    } catch (error: any) {
      console.error("Error uploading tenant image:", error);
      
      // Check for JWT/authentication errors
      if (error?.message?.includes('JWT') || 
          error?.message?.includes('signature verification') ||
          error?.statusCode === '408' ||
          error?.error === 'InvalidJWT') {
        toast.error("Your session has expired. Please refresh the page and try again.");
        
        // Try to refresh the session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (!session || sessionError) {
          toast.error("Please log in again to continue.");
          setTimeout(() => {
            navigate('/auth');
          }, 2000);
        }
      } else {
        toast.error("Failed to upload image: " + (error?.message || "Unknown error"));
      }
    } finally {
      setUploadingTenantImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(uploadKey);
        return newSet;
      });
    }
  };

  const handleTenantFieldChange = (tenantId: string, field: keyof Tenant, value: string) => {
    setTenants(tenants.map(t => 
      t.id === tenantId ? { ...t, [field]: value } : t
    ));
  };

  const handleDeleteTenantImage = async (tenantId: string, field: 'breakerImage' | 'ctRatioImage' | 'meterImage') => {
    const tenant = tenants.find(t => t.id === tenantId);
    if (!tenant) return;

    const imageUrl = tenant[field];
    if (!imageUrl) return;

    if (!confirm('Are you sure you want to delete this image?')) return;

    try {
      // Extract path from URL
      const path = getPathFromUrl(imageUrl, 'inspection-photos');
      
      if (path) {
        // Delete from storage
        const success = await deleteImage('inspection-photos', path);
        if (!success) {
          throw new Error('Failed to delete image from storage');
        }
      }

      // Update state
      const updatedTenants = tenants.map(t => 
        t.id === tenantId ? { ...t, [field]: '' } : t
      );
      
      setTenants(updatedTenants);

      // Auto-save to database
      if (inspection) {
        const jsonDataWithTenants = {
          ...inspection.jsonData,
          tenants: updatedTenants
        } as any;

        const { error: saveError } = await supabase
          .from('inspections')
          .update({
            json_data: jsonDataWithTenants,
            updated_at: new Date().toISOString()
          })
          .eq('id', inspectionId);

        if (saveError) {
          console.error("Error auto-saving after image deletion:", saveError);
          toast.warning("Image deleted but auto-save failed. Please click Save to persist changes.");
        } else {
          setInspection(prev => prev ? { ...prev, jsonData: jsonDataWithTenants } : null);
          toast.success("Image deleted successfully");
        }
      } else {
        toast.success("Image deleted successfully");
      }
    } catch (error) {
      console.error("Error deleting tenant image:", error);
      toast.error("Failed to delete image");
    }
  };

  const handleSnagPhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    setUploadingSnagPhotos(true);
    try {
      const uploadedUrls: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        let file = files[i];
        
        // Convert HEIC if needed
        const inputFileName = file.name.toLowerCase();
        const isHEIC = file.type === 'image/heic' || file.type === 'image/heif' || 
                       (file.type === '' && (inputFileName.endsWith('.heic') || inputFileName.endsWith('.heif'))) ||
                       inputFileName.endsWith('.heic') || inputFileName.endsWith('.heif');
        
        if (isHEIC) {
          try {
            const heic2any = (await import('heic2any')).default;
            const convertedBlob = await heic2any({
              blob: file,
              toType: 'image/jpeg',
              quality: 0.9
            });
            const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            file = new File([blob], file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'), { type: 'image/jpeg' });
          } catch (conversionError) {
            console.error("Error converting HEIC:", conversionError);
            toast.error(`Failed to convert ${file.name}`);
            continue;
          }
        }
        
        const fileExt = file.name.split('.').pop();
        const timestamp = Date.now();
        const fileName = `${subsectionId}/snags/${timestamp}-${i + 1}.${fileExt}`;
        
        const { data, error } = await supabase.storage
          .from('inspection-photos')
          .upload(fileName, file);
        
        if (error) throw error;
        
        const { data: urlData } = supabase.storage
          .from('inspection-photos')
          .getPublicUrl(data.path);
        
        uploadedUrls.push(urlData.publicUrl);
      }
      
      if (editingSnag) {
        setEditingSnag(prev => ({ ...prev, photos: [...(prev?.photos || []), ...uploadedUrls] }));
      } else {
        setNewSnag(prev => ({ ...prev, photos: [...prev.photos, ...uploadedUrls] }));
      }
      toast.success(`${uploadedUrls.length} photo(s) uploaded`);
    } catch (error: any) {
      console.error("Error uploading snag photos:", error);
      
      // Check for JWT/authentication errors
      if (error?.message?.includes('JWT') || 
          error?.message?.includes('signature verification') ||
          error?.statusCode === '408' ||
          error?.error === 'InvalidJWT') {
        toast.error("Your session has expired. Please refresh the page and try again.");
        
        // Try to refresh the session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (!session || sessionError) {
          toast.error("Please log in again to continue.");
          setTimeout(() => {
            navigate('/auth');
          }, 2000);
        }
      } else {
        toast.error("Failed to upload photos");
      }
    } finally {
      setUploadingSnagPhotos(false);
    }
  };

  const fetchInspectionData = async () => {
    try {
      setLoading(true);

      // Fetch inspection
      const { data: inspData, error: inspError } = await supabase
        .from('inspections')
        .select(`
          *,
          sites (
            id,
            name,
            address,
            site_image_url,
            client_logo_url
          ),
          subsections (
            id,
            name
          )
        `)
        .eq('id', inspectionId)
        .maybeSingle();

      if (inspError || !inspData) {
        console.error("Error fetching inspection:", inspError);
        toast.error("Inspection not found");
        // Navigate based on available parameters
        if (isContractorPortal) {
          navigate(`/contractor${previewSiteId ? `?preview=${previewSiteId}` : ''}`);
        } else if (subsectionId) {
          navigate(`${(clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`)}/subsections/${subsectionId}`);
        } else {
          navigate('/contractor');
        }
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

      // All data is now normalized to use string keys (e.g., jsonData["sectionId"]["itemId"])
      const jsonData = inspData.json_data as any;

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
        quality_rating: inspData.quality_rating || undefined,
        tenants: jsonData?.tenants || [],
        jsonData: jsonData || {}
      };

      setInspection(mappedInspection);
      setTenants(jsonData?.tenants || []);
      
      // Set site and subsection data
      if (inspData.sites) {
        let siteImageUrl = inspData.sites.site_image_url;
        
        // Generate signed URL for site image if it exists (site-images bucket is private)
        if (siteImageUrl) {
          try {
            const urlParts = siteImageUrl.split('/site-images/');
            if (urlParts.length > 1) {
              const path = urlParts[1].split('?')[0];
              const { data: signedData } = await supabase.storage
                .from('site-images')
                .createSignedUrl(path, 3600);
              
              if (signedData?.signedUrl) {
                siteImageUrl = signedData.signedUrl;
              }
            }
          } catch (error) {
            console.error('Error generating signed URL for site image:', error);
          }
        }
        
        setSiteData({ 
          siteName: inspData.sites.name, 
          physicalAddress: inspData.sites.address,
          siteImageUrl,
          clientLogoUrl: inspData.sites.client_logo_url
        });
      }
      
      if (inspData.subsections) {
        setSubsectionData({ name: inspData.subsections.name });
        // Fetch snags for this subsection if not already provided in URL
        if (!subsectionId && inspData.subsection_id) {
          fetchSnagsForSubsection(inspData.subsection_id);
        }
      }

      // Set template if available
      if (templateData && templateData.sections) {
        // Convert template sections to ensure items are objects, not arrays
        const normalizedSections: any = {};
        
        if (Array.isArray(templateData.sections)) {
          // Template has sections as an array
          templateData.sections.forEach((section: any) => {
            const sectionKey = section.id || section.name?.toLowerCase().replace(/\s+/g, '_');
            const items: any = {};
            
            if (Array.isArray(section.items)) {
              // Convert items array to object with item.id as key
              section.items.forEach((item: any) => {
                const itemKey = item.id || item.name;
                items[itemKey] = {
                  ...item,
                  name: item.name || itemKey
                };
              });
            } else if (section.items && typeof section.items === 'object') {
              // Items is already an object
              Object.keys(section.items).forEach(itemKey => {
                items[itemKey] = {
                  ...section.items[itemKey],
                  name: section.items[itemKey].name || itemKey
                };
              });
            }
            
            normalizedSections[sectionKey] = {
              ...section,
              items
            };
          });
        } else {
          // Template has sections as an object
          Object.keys(templateData.sections).forEach(sectionKey => {
            const section = templateData.sections[sectionKey];
            const items: any = {};
            
            if (Array.isArray(section.items)) {
              // Convert items array to object
              section.items.forEach((item: any) => {
                const itemKey = item.id || item.name;
                items[itemKey] = {
                  ...item,
                  name: item.name || itemKey
                };
              });
            } else if (section.items && typeof section.items === 'object') {
              // Items is already an object
              Object.keys(section.items).forEach(itemKey => {
                items[itemKey] = {
                  ...section.items[itemKey],
                  name: section.items[itemKey].name || itemKey
                };
              });
            }
            
            normalizedSections[sectionKey] = {
              ...section,
              name: section.name || formatTabLabel(sectionKey), // Fallback to formatted key if name is missing
              items
            };
          });
        }
        
        setTemplate({
          name: templateData.name,
          sections: normalizedSections
        });
        
        // Set active tab - default to general for non-Site Drawing templates
        if (templateData.category === "Site Drawing") {
          const firstSection = Object.keys(templateData.sections as any)[0];
          setActiveTab(firstSection || 'general');
        } else {
          setActiveTab('general');
        }
      } else {
        // No template - create a basic structure from jsonData if it exists
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
          // Always default to general tab for non-Site Drawing templates
          setActiveTab('general');
        } else {
          console.warn("No template or inspection data found");
          setActiveTab('general');
        }
      }

      // Generate QR code with logo
      const url = `${window.location.origin.replace(/\/$/, '')}/public/subsections/${inspData.subsection_id || subsectionId}`;
      
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
      const totalFiles = files.length;
      let processedFiles = 0;

      for (let i = 0; i < files.length; i++) {
        let file = files[i];
        
        console.log(`Processing file ${i + 1}/${totalFiles}:`, file.name, 'Type:', file.type, 'Size:', file.size);
        
        // Convert HEIC/HEIF images to JPEG for cross-browser compatibility
        // Check both MIME type and file extension since iOS doesn't always set MIME type correctly
        const inputFileName = file.name.toLowerCase();
        const isHEIC = file.type === 'image/heic' || 
                       file.type === 'image/heif' || 
                       file.type === '' && (inputFileName.endsWith('.heic') || inputFileName.endsWith('.heif')) ||
                       inputFileName.endsWith('.heic') || 
                       inputFileName.endsWith('.heif');
        
        if (isHEIC) {
          console.log('HEIC/HEIF file detected, converting...');
          try {
            toast.info(`Converting ${file.name} to JPEG...`);
            const heic2any = (await import('heic2any')).default;
            const convertedBlob = await heic2any({
              blob: file,
              toType: 'image/jpeg',
              quality: 0.9
            });
            
            // heic2any can return Blob or Blob[], handle both cases
            const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            file = new File([blob], file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'), { type: 'image/jpeg' });
            console.log('HEIC conversion successful, new file:', file.name, file.type, 'Size:', file.size);
          } catch (conversionError) {
            console.error("Error converting HEIC image:", conversionError);
            toast.error(`Failed to convert ${file.name}. Please use JPG or PNG.`);
            continue;
          }
        }
        
        const fileExt = file.name.split('.').pop();
        
        // Generate descriptive file name with client/site/subsection info
        const fileName = generateInspectionImagePath({
          clientName: siteData?.siteName || 'unknown-client',
          siteName: siteData?.siteName || 'unknown-site',
          subsectionName: subsectionData?.name || 'unknown-subsection',
          inspectionId: inspectionId!,
          sectionKey,
          itemKey,
          index: i,
          fileExtension: fileExt || 'jpg'
        });

        console.log('Uploading to storage:', fileName);
        const { data, error } = await supabase.storage
          .from('inspection-photos')
          .upload(fileName, file);

        if (error) {
          console.error('Upload error:', error);
          throw error;
        }

        console.log('Upload successful:', data.path);
        const { data: urlData } = supabase.storage
          .from('inspection-photos')
          .getPublicUrl(data.path);

        uploadedUrls.push(urlData.publicUrl);
        processedFiles++;
      }

      if (uploadedUrls.length === 0) {
        toast.error("No images were uploaded successfully");
        return;
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
      console.log(`Upload complete: ${uploadedUrls.length}/${totalFiles} images uploaded`);
    } catch (error: any) {
      console.error("Error uploading images:", error);
      
      // Check for JWT/authentication errors
      if (error?.message?.includes('JWT') || 
          error?.message?.includes('signature verification') ||
          error?.statusCode === '408' ||
          error?.error === 'InvalidJWT') {
        toast.error("Your session has expired. Please refresh the page and try again.");
        
        // Try to refresh the session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (!session || sessionError) {
          toast.error("Please log in again to continue.");
          setTimeout(() => {
            navigate('/auth');
          }, 2000);
        }
      } else {
        toast.error("Failed to upload images: " + (error?.message || "Unknown error"));
      }
    } finally {
      setUploadingImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(uploadKey);
        return newSet;
      });
    }
  };

  // Handler for camera button that uses native camera on mobile
  const handleCameraCapture = async (sectionKey: string, itemKey: string) => {
    const uploadKey = `${sectionKey}-${itemKey}`;
    
    if (!isNative) {
      // On mobile web browsers, we need to set capture attribute dynamically
      const input = fileInputRefs.current[uploadKey];
      if (input) {
        // Allow multiple images on all platforms
        input.setAttribute('multiple', '');
        // Don't force camera mode - let browser/device handle it naturally
        input.removeAttribute('capture');
      }
      
      input?.click();
      return;
    }

    setUploadingImages(prev => new Set(prev).add(uploadKey));

    try {
      // Allow user to choose between camera and gallery
      const files = await selectImages();
      
      if (files.length === 0) {
        toast.info("No images selected");
        return;
      }

      // Create a FileList-like object
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      
      // Use the existing upload logic
      await handleImageUpload(sectionKey, itemKey, dataTransfer.files);
    } catch (error) {
      console.error("Error capturing image:", error);
      toast.error("Failed to capture image");
      setUploadingImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(uploadKey);
        return newSet;
      });
    }
  };

  // Handler for tenant image camera capture
  const handleTenantCameraCapture = async (tenantId: string, field: 'breakerImage' | 'ctRatioImage' | 'meterImage') => {
    const uploadKey = `${tenantId}-${field}`;
    const input = tenantImageInputRefs.current[uploadKey];
    
    if (!isNative) {
      if (input) {
        // Don't force camera mode - let browser/device handle it naturally
        input.removeAttribute('capture');
      }
      
      input?.click();
      return;
    }

    setUploadingTenantImages(prev => new Set(prev).add(uploadKey));

    try {
      const files = await selectImages();
      
      if (files.length === 0) {
        toast.info("No images selected");
        return;
      }

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(files[0]); // Only take first image for tenant
      
      await handleTenantImageUpload(tenantId, field, dataTransfer.files);
    } catch (error) {
      console.error("Error capturing tenant image:", error);
      toast.error("Failed to capture image");
      setUploadingTenantImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(uploadKey);
        return newSet;
      });
    }
  };

  // Handler for snag photo camera capture
  const handleSnagCameraCapture = async () => {
    const input = document.getElementById('snag-photo-upload') as HTMLInputElement;
    
    if (!isNative) {
      if (input) {
        // Allow multiple images
        input.setAttribute('multiple', '');
        // Don't force camera mode - let browser/device handle it naturally
        input.removeAttribute('capture');
      }
      
      input?.click();
      return;
    }

    setUploadingSnagPhotos(true);

    try {
      const files = await selectImages();
      
      if (files.length === 0) {
        toast.info("No images selected");
        return;
      }

      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      
      await handleSnagPhotoUpload(dataTransfer.files);
    } catch (error) {
      console.error("Error capturing snag photos:", error);
      toast.error("Failed to capture photos");
      setUploadingSnagPhotos(false);
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

  const handleRenameExistingImages = async () => {
    if (!inspection || !siteData || !subsectionData) {
      console.log('Missing required data for renaming images');
      return;
    }

    try {
      setRenamingImages(true);
      toast.info("Optimizing image names...");

      const result = await renameInspectionImages(
        inspectionId!,
        siteData.siteName || 'unknown-client',
        siteData.siteName || 'unknown-site',
        subsectionData.name || 'unknown-subsection',
        inspection.jsonData
      );

      if (result.renamedCount > 0) {
        // Update inspection with new URLs
        setInspection(prev => prev ? { ...prev, jsonData: result.updatedJsonData } : null);
        toast.success(`Optimized ${result.renamedCount} image name(s)`);
        
        if (result.failedCount > 0) {
          toast.warning(`${result.failedCount} image(s) could not be renamed`);
        }
      } else {
        console.log('No images needed renaming');
      }

      return result.updatedJsonData;
    } catch (error) {
      console.error("Error renaming images:", error);
      toast.error("Failed to optimize image names");
      return inspection.jsonData;
    } finally {
      setRenamingImages(false);
    }
  };

  const handleSave = async () => {
    if (!inspection) return;

    // Validate that if status is Complete, quality_rating must be set
    if (inspection.type === 'Completed' && !inspection.quality_rating) {
      toast.error("Cannot mark inspection as complete without setting a quality rating (1-5)");
      return;
    }

    try {
      setSaving(true);

      // Rename existing images to new descriptive format
      const updatedJsonData = await handleRenameExistingImages();

      // Include tenants in json_data
      const jsonDataWithTenants = {
        ...(updatedJsonData || inspection.jsonData),
        tenants: tenants
      } as any;

      // Update inspection
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
          quality_rating: inspection.quality_rating,
          json_data: jsonDataWithTenants,
          updated_at: new Date().toISOString()
        })
        .eq('id', inspectionId);

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
          <Label>Overall Quality Rating</Label>
          <Select
            value={inspection?.quality_rating?.toString() || ''}
            onValueChange={(value) => handleFieldChange('quality_rating', parseInt(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select quality rating (1-5)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 - Poor</SelectItem>
              <SelectItem value="2">2 - Below Average</SelectItem>
              <SelectItem value="3">3 - Average</SelectItem>
              <SelectItem value="4">4 - Good</SelectItem>
              <SelectItem value="5">5 - Excellent</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Rate the overall quality of this inspection from 1 (lowest) to 5 (highest). Required to mark inspection as complete.</p>
        </div>
        <div>
          <Label>Inspection Status</Label>
          <Select
            value={inspection?.type || 'Pending'}
            onValueChange={(value) => {
              // Validate quality rating if trying to mark as Complete
              if (value === 'Completed' && !inspection?.quality_rating) {
                toast.error("Please set a quality rating (1-5) before marking the inspection as complete");
                return;
              }
              handleFieldChange('type', value);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Cannot be marked as complete without setting a quality rating above.</p>
        </div>
        <div>
          <Label>QR Code</Label>
          <div className="mt-2">
            {qrCodeUrl && (
              <RobustImage src={qrCodeUrl} alt="QR Code" className="w-32 h-32 border rounded" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderImageGallery = (sectionKey: string) => {
    const imagesData = inspection?.jsonData?.[sectionKey] || {};
    const images: Array<{ url: string; name: string; id: string }> = [];
    
    // Extract images from object structure
    if (typeof imagesData === 'object' && !Array.isArray(imagesData)) {
      Object.entries(imagesData).forEach(([imgId, imgData]: [string, any]) => {
        // Handle photos array (current format)
        if (imgData && imgData.photos && Array.isArray(imgData.photos)) {
          imgData.photos.forEach((photoUrl: string, index: number) => {
            images.push({
              id: `${imgId}-${index}`,
              url: photoUrl,
              name: `${imgData.name || imgId} - Photo ${index + 1}`
            });
          });
        }
        // Handle legacy url/path format
        else if (imgData && (imgData.url || imgData.path)) {
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
          <CardTitle>{sectionKey.replace('Images', ' Images').replace('images', ' Images')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {images.length} image{images.length !== 1 ? 's' : ''} in this category
          </p>
        </CardHeader>
        <CardContent>
          {images.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {images.map((img) => (
                <div key={img.id} className="relative group cursor-pointer" onClick={() => setViewingImage(img.url)}>
                  <RobustImage
                    src={img.url}
                    alt={img.name}
                    className="w-full h-48 object-cover rounded border"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {img.name}
                  </div>
                </div>
              ))}
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
    
    // Get photos array
    const photos: string[] = itemData.photos || [];
    
    const uploadKey = `${sectionKey}-${itemKey}`;
    const isUploading = uploadingImages.has(uploadKey);

    // Use item.name if available, otherwise fall back to itemKey
    const displayName = item.name || itemKey;

    return (
      <div key={itemKey} className="border-b pb-6 mb-6 last:border-b-0">
        <h4 className="font-medium mb-4">{displayName}</h4>
        
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
                    <div 
                      key={index}
                      className="relative group cursor-pointer"
                      onClick={() => setViewingImage(photo)}
                    >
                      <RobustImage
                        src={photo}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-32 object-cover rounded border"
                      />
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteImage(sectionKey, itemKey, photo, index);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              
              <input
                ref={(el) => (fileInputRefs.current[uploadKey] = el)}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => handleImageUpload(sectionKey, itemKey, e.target.files)}
              />
              
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => handleCameraCapture(sectionKey, itemKey)}
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
            onClick={() => {
              if (isContractorPortal) {
                navigate(`/contractor${previewSiteId ? `?preview=${previewSiteId}` : ''}`);
              } else {
                navigate(`${(clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`)}/subsections/${subsectionId}`);
              }
            }}
          >
            {isContractorPortal ? 'Back to Portal' : 'Back to Subsection'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumbs 
        items={[
          { 
            label: "Sites", 
            href: isContractorPortal 
              ? `/contractor${previewSiteId ? `?preview=${previewSiteId}` : ''}` 
              : clientId 
                ? `/clients/${clientId}/sites` 
                : "/sites"
          },
          { 
            label: siteData?.siteName || 'Site', 
            href: isContractorPortal
              ? `/contractor/sites/${siteId}${previewSiteId ? `?preview=${previewSiteId}` : ''}`
              : clientId 
                ? `/clients/${clientId}/sites/${siteId}` 
                : `/sites/${siteId}`
          },
          { 
            label: subsectionData?.name || 'Subsection', 
            href: isContractorPortal
              ? `/contractor/sites/${siteId}/subsections/${subsectionId}${previewSiteId ? `?preview=${previewSiteId}` : ''}`
              : clientId 
                ? `/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}` 
                : `/sites/${siteId}/subsections/${subsectionId}`
          },
          { label: template?.name || 'Inspection' }
        ]}
      />
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {template?.name || 'Edit Inspection'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {inspection?.projectName || siteData?.siteName} • {subsectionData?.name}
            {inspection?.date && ` • ${format(new Date(inspection.date), 'MMM dd, yyyy')}`}
          </p>
        </div>
        <div className="flex gap-2">
          {templateCategory === "Site Drawing" ? (
            <SiteDrawingReport
              inspectionData={inspection}
              siteName={siteData?.siteName || 'Unknown Site'}
              subsectionName={subsectionData?.name || 'Unknown Subsection'}
              pdfUrl={(inspection?.jsonData as any)?.siteDrawingPdf || ''}
              pins={(inspection?.jsonData as any)?.siteDrawingPins || []}
              canvasData={(inspection?.jsonData as any)?.siteDrawingCanvas}
            />
          ) : (
            <ComprehensiveInspectionReport
              inspectionData={inspection}
              siteName={siteData?.siteName || 'Unknown Site'}
              subsectionName={subsectionData?.name || 'Unknown Subsection'}
              templateId={templateId}
              subsectionId={subsectionId}
              siteLogoUrl={siteData?.siteImageUrl || siteData?.clientLogoUrl || null}
              inspectionId={inspectionId}
              clientName={siteData?.siteName}
              snags={snags}
            />
          )}
          <Button 
            variant="outline" 
            onClick={() => navigate(`${(clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`)}/subsections/${subsectionId}`)}
          >
            <X className="mr-2 h-4 w-4" />
            Exit
          </Button>
          <Button onClick={handleSave} disabled={saving || renamingImages}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : renamingImages ? 'Optimizing...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
          {templateCategory !== "Site Drawing" && <TabsTrigger value="general">General Info</TabsTrigger>}
          {Object.entries(template.sections || {})
            .filter(([key, section]) => {
              // Skip sections without names, generalInfo and observations sections
              if (!section.name) return false;
              const lowerKey = key.toLowerCase();
              const lowerName = section.name?.toLowerCase() || '';
              return !lowerKey.includes('general') && !lowerName.includes('general') &&
                     !lowerKey.includes('observation') && !lowerName.includes('observation');
            })
            .map(([key, section]) => (
              <TabsTrigger key={key} value={key}>
                {formatTabLabel(section.name)}
              </TabsTrigger>
            ))}
          {templateCategory !== "Site Drawing" && !template?.name?.toLowerCase().includes("line shop") && <TabsTrigger value="tenants">Tenants</TabsTrigger>}
          {templateCategory !== "Site Drawing" && <TabsTrigger value="snag-list">Snag List</TabsTrigger>}
          {templateCategory !== "Site Drawing" && <TabsTrigger value="signatures">Sign-Off</TabsTrigger>}
        </TabsList>

        {templateCategory === "Site Drawing" ? (
          <TabsContent value={Object.keys(template.sections || {})[0] || "general"} className="space-y-4">
            {subsectionId && (
              <InteractiveFloorPlan
                subsectionId={subsectionId}
                projectName={inspection?.projectName || siteData?.siteName || "Site Drawing"}
                siteName={siteData?.siteName || ""}
                subsectionName={subsectionData?.name || "Drawing"}
              />
            )}
          </TabsContent>
        ) : (
          <>
            <TabsContent value="general" className="space-y-4">
              {renderGeneralInfo()}
            </TabsContent>

            {Object.entries(template.sections || {})
              .filter(([key, section]) => {
                // Skip sections without names, generalInfo and observations sections
                if (!section.name) return false;
                const lowerKey = key.toLowerCase();
                const lowerName = section.name?.toLowerCase() || '';
                return !lowerKey.includes('general') && !lowerName.includes('general') &&
                       !lowerKey.includes('observation') && !lowerName.includes('observation');
              })
              .map(([sectionKey, section]) => (
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

            <TabsContent value="tenants" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Tenant Information</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Manage tenant details for Electrical Main Board (EMB) Inspection
                      </p>
                    </div>
                    <Button onClick={handleAddTenant}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Tenant
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {tenants.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground mb-4">
                        No tenants added yet
                      </p>
                      <Button onClick={handleAddTenant} variant="outline">
                        <Plus className="mr-2 h-4 w-4" />
                        Add First Tenant
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {tenants.map((tenant) => (
                        <Card key={tenant.id}>
                          <CardContent className="pt-6 space-y-4">
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <h4 className="font-semibold text-lg">{tenant.shopName || 'New Tenant'}</h4>
                                <p className="text-sm text-muted-foreground">Shop Number: {tenant.shopNumber || 'Not set'}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteTenant(tenant.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                            
                            <div className="grid md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor={`shop-number-${tenant.id}`}>Shop Number *</Label>
                                <Input
                                  id={`shop-number-${tenant.id}`}
                                  value={tenant.shopNumber}
                                  onChange={(e) => handleTenantFieldChange(tenant.id, 'shopNumber', e.target.value)}
                                  placeholder="e.g., Shop 101"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`shop-name-${tenant.id}`}>Shop Name *</Label>
                                <Input
                                  id={`shop-name-${tenant.id}`}
                                  value={tenant.shopName}
                                  onChange={(e) => handleTenantFieldChange(tenant.id, 'shopName', e.target.value)}
                                  placeholder="e.g., Coffee Shop"
                                />
                              </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor={`breaker-size-${tenant.id}`}>Breaker Size</Label>
                                <Input
                                  id={`breaker-size-${tenant.id}`}
                                  value={tenant.breakerSize}
                                  onChange={(e) => handleTenantFieldChange(tenant.id, 'breakerSize', e.target.value)}
                                  placeholder="e.g., 63A"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`ct-size-${tenant.id}`}>CT Size and Ratio</Label>
                                <Input
                                  id={`ct-size-${tenant.id}`}
                                  value={tenant.ctSizeAndRatio}
                                  onChange={(e) => handleTenantFieldChange(tenant.id, 'ctSizeAndRatio', e.target.value)}
                                  placeholder="e.g., 100/5A"
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`control-status-48v-${tenant.id}`}>48V Control Status</Label>
                              <Select
                                value={tenant.controlStatus48V || ''}
                                onValueChange={(value) => handleTenantFieldChange(tenant.id, 'controlStatus48V', value)}
                              >
                                <SelectTrigger id={`control-status-48v-${tenant.id}`}>
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

                            <div className="grid md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Breaker Image</Label>
                                {tenant.breakerImage ? (
                                  <div className="relative group">
                                    <RobustImage
                                      src={tenant.breakerImage}
                                      alt="Breaker"
                                      className="w-full h-48 object-cover rounded border"
                                    />
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleDeleteTenantImage(tenant.id, 'breakerImage')}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50">
                                    <Camera className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                    <p className="text-xs text-gray-500">No breaker image</p>
                                  </div>
                                )}
                                <input
                                  ref={(el) => (tenantImageInputRefs.current[`${tenant.id}-breakerImage`] = el)}
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={(e) => handleTenantImageUpload(tenant.id, 'breakerImage', e.target.files)}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => handleTenantCameraCapture(tenant.id, 'breakerImage')}
                                  disabled={uploadingTenantImages.has(`${tenant.id}-breakerImage`)}
                                >
                                  {uploadingTenantImages.has(`${tenant.id}-breakerImage`) ? (
                                    <>Uploading...</>
                                  ) : (
                                    <>
                                      <Upload className="mr-2 h-4 w-4" />
                                      {tenant.breakerImage ? 'Replace Image' : 'Upload Image'}
                                    </>
                                  )}
                                </Button>
                              </div>

                              <div className="space-y-2">
                                <Label>CT Ratio Image</Label>
                                {tenant.ctRatioImage ? (
                                  <div className="relative group">
                                    <RobustImage
                                      src={tenant.ctRatioImage}
                                      alt="CT Ratio"
                                      className="w-full h-48 object-cover rounded border"
                                    />
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleDeleteTenantImage(tenant.id, 'ctRatioImage')}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50">
                                    <Camera className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                    <p className="text-xs text-gray-500">No CT ratio image</p>
                                  </div>
                                )}
                                <input
                                  ref={(el) => (tenantImageInputRefs.current[`${tenant.id}-ctRatioImage`] = el)}
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={(e) => handleTenantImageUpload(tenant.id, 'ctRatioImage', e.target.files)}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => handleTenantCameraCapture(tenant.id, 'ctRatioImage')}
                                  disabled={uploadingTenantImages.has(`${tenant.id}-ctRatioImage`)}
                                >
                                  {uploadingTenantImages.has(`${tenant.id}-ctRatioImage`) ? (
                                    <>Uploading...</>
                                  ) : (
                                    <>
                                      <Upload className="mr-2 h-4 w-4" />
                                      {tenant.ctRatioImage ? 'Replace Image' : 'Upload Image'}
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`meter-serial-${tenant.id}`}>Meter Serial Number</Label>
                              <Input
                                id={`meter-serial-${tenant.id}`}
                                value={tenant.meterSerialNumber || ''}
                                onChange={(e) => handleTenantFieldChange(tenant.id, 'meterSerialNumber', e.target.value)}
                                placeholder="Enter meter serial number"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Meter Image</Label>
                              {tenant.meterImage ? (
                                <div className="relative group">
                                  <RobustImage
                                    src={tenant.meterImage}
                                    alt="Meter"
                                    className="w-full h-48 object-cover rounded border"
                                  />
                                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => handleDeleteTenantImage(tenant.id, 'meterImage')}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50">
                                  <Camera className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                  <p className="text-xs text-gray-500">No meter image</p>
                                </div>
                              )}
                              <input
                                ref={(el) => (tenantImageInputRefs.current[`${tenant.id}-meterImage`] = el)}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => handleTenantImageUpload(tenant.id, 'meterImage', e.target.files)}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                onClick={() => handleTenantCameraCapture(tenant.id, 'meterImage')}
                                disabled={uploadingTenantImages.has(`${tenant.id}-meterImage`)}
                              >
                                {uploadingTenantImages.has(`${tenant.id}-meterImage`) ? (
                                  <>Uploading...</>
                                ) : (
                                  <>
                                    <Upload className="mr-2 h-4 w-4" />
                                    {tenant.meterImage ? 'Replace Image' : 'Upload Image'}
                                  </>
                                )}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="snag-list" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Snag List</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Track and manage issues identified during inspection
                      </p>
                    </div>
                    <Button onClick={() => setSnagDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Snag
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingSnags ? (
                    <div className="text-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
                      <p className="text-muted-foreground">Loading snags...</p>
                    </div>
                  ) : snags.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground mb-4">
                        No snags recorded for this inspection yet
                      </p>
                      <Button onClick={() => setSnagDialogOpen(true)} variant="outline">
                        <Plus className="mr-2 h-4 w-4" />
                        Add First Snag
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {snags.map((snag) => (
                        <Card key={snag.id} className={`${snag.status === 'Closed' ? 'opacity-60' : ''}`}>
                          <CardContent className="pt-6">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h4 className="font-semibold">{snag.title}</h4>
                                  <Badge variant={snag.status === 'Open' ? 'destructive' : 'secondary'}>
                                    {snag.status}
                                  </Badge>
                                  {snag.risk_level && (
                                    <Badge variant={
                                      snag.risk_level === 'Critical' ? 'destructive' :
                                      snag.risk_level === 'High' ? 'destructive' :
                                      snag.risk_level === 'Medium' ? 'default' : 
                                      'secondary'
                                    }>
                                      {snag.risk_level} Risk
                                    </Badge>
                                  )}
                                </div>
                                {snag.description && (
                                  <p className="text-sm text-muted-foreground mb-2">{snag.description}</p>
                                )}
                                {snag.notes && (
                                  <p className="text-sm text-muted-foreground mb-2">
                                    <strong>Notes:</strong> {snag.notes}
                                  </p>
                                )}
                                {snag.estimated_cost && (
                                  <p className="text-sm text-muted-foreground mb-2">
                                    <strong>Estimated Cost:</strong> R{parseFloat(snag.estimated_cost).toFixed(2)}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  Created: {format(new Date(snag.created_at), 'MMM dd, yyyy HH:mm')}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditSnag(snag)}
                                >
                                  <Edit className="h-4 w-4 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleToggleSnagStatus(snag.id, snag.status)}
                                >
                                  {snag.status === 'Open' ? 'Close' : 'Reopen'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteSnag(snag.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                            {snag.photos && Array.isArray(snag.photos) && snag.photos.length > 0 && (
                              <div className="grid grid-cols-4 gap-2 mt-3">
                                {snag.photos.map((photo: string, index: number) => (
                                  <div 
                                    key={index}
                                    className="cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => setViewingImage(photo)}
                                  >
                                    <RobustImage
                                      src={photo}
                                      alt={`Snag photo ${index + 1}`}
                                      className="w-full h-24 object-cover rounded border"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="signatures" className="space-y-4">
              {inspectionId && (
                <InspectionSignatures inspectionId={inspectionId} />
              )}
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Tenant Dialog */}
      <Dialog open={tenantDialogOpen} onOpenChange={setTenantDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{newTenant.id && tenants.find(t => t.id === newTenant.id) ? 'Edit Tenant' : 'Add New Tenant'}</DialogTitle>
            <DialogDescription>
              Enter tenant information for the Electrical Main Board (EMB)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shop-number">Shop Number *</Label>
                <Input
                  id="shop-number"
                  value={newTenant.shopNumber}
                  onChange={(e) => setNewTenant({ ...newTenant, shopNumber: e.target.value })}
                  placeholder="e.g., Shop 101"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shop-name">Shop Name *</Label>
                <Input
                  id="shop-name"
                  value={newTenant.shopName}
                  onChange={(e) => setNewTenant({ ...newTenant, shopName: e.target.value })}
                  placeholder="e.g., Coffee Shop"
                  required
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="breaker-size">Breaker Size</Label>
                <Input
                  id="breaker-size"
                  value={newTenant.breakerSize}
                  onChange={(e) => setNewTenant({ ...newTenant, breakerSize: e.target.value })}
                  placeholder="e.g., 63A"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ct-size">CT Size and Ratio</Label>
                <Input
                  id="ct-size"
                  value={newTenant.ctSizeAndRatio}
                  onChange={(e) => setNewTenant({ ...newTenant, ctSizeAndRatio: e.target.value })}
                  placeholder="e.g., 100/5A"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="breaker-image">Breaker (Image URL)</Label>
              <Input
                id="breaker-image"
                value={newTenant.breakerImage}
                onChange={(e) => setNewTenant({ ...newTenant, breakerImage: e.target.value })}
                placeholder="Paste image URL"
              />
              {newTenant.breakerImage && (
                <RobustImage
                  src={newTenant.breakerImage}
                  alt="Breaker preview"
                  className="mt-2 w-full h-48 object-cover rounded border"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ct-ratio-image">CT Ratio (Image URL)</Label>
              <Input
                id="ct-ratio-image"
                value={newTenant.ctRatioImage}
                onChange={(e) => setNewTenant({ ...newTenant, ctRatioImage: e.target.value })}
                placeholder="Paste image URL"
              />
              {newTenant.ctRatioImage && (
                <RobustImage
                  src={newTenant.ctRatioImage}
                  alt="CT Ratio preview"
                  className="mt-2 w-full h-48 object-cover rounded border"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="meter-serial">Meter Serial Number</Label>
              <Input
                id="meter-serial"
                value={newTenant.meterSerialNumber || ''}
                onChange={(e) => setNewTenant({ ...newTenant, meterSerialNumber: e.target.value })}
                placeholder="Enter meter serial number"
              />
            </div>

            <div className="space-y-2">
              <Label>Meter Image</Label>
              {newTenant.meterImage && (
                <div className="relative group">
                  <RobustImage
                    src={newTenant.meterImage}
                    alt="Meter preview"
                    className="w-full h-48 object-cover rounded border"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white"
                    onClick={() => setNewTenant({ ...newTenant, meterImage: '' })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                id="meter-image-upload"
                onChange={(e) => handleTenantImageUpload(newTenant.id, 'meterImage' as any, e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => document.getElementById('meter-image-upload')?.click()}
                disabled={uploadingTenantImages.has(`${newTenant.id}-meterImage`)}
              >
                <Camera className="mr-2 h-4 w-4" />
                {uploadingTenantImages.has(`${newTenant.id}-meterImage`) ? 'Uploading...' : 'Capture Meter Photo'}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTenantDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTenant}>
              {newTenant.id && tenants.find(t => t.id === newTenant.id) ? 'Update Tenant' : 'Add Tenant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Snag Creation/Edit Dialog */}
      <Dialog open={snagDialogOpen} onOpenChange={handleCloseSnagDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSnag ? 'Edit Snag' : 'Create New Snag'}</DialogTitle>
            <DialogDescription>
              {editingSnag ? 'Update the snag details' : 'Document an issue or defect found during this inspection'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={editingSnag ? handleUpdateSnag : handleCreateSnag}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="snag-title">Title *</Label>
                <Input
                  id="snag-title"
                  value={editingSnag ? editingSnag.title : newSnag.title}
                  onChange={(e) => editingSnag 
                    ? setEditingSnag({ ...editingSnag, title: e.target.value })
                    : setNewSnag({ ...newSnag, title: e.target.value })
                  }
                  placeholder="Brief description of the issue"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="snag-description">Description</Label>
                <Textarea
                  id="snag-description"
                  value={editingSnag ? (editingSnag.description || '') : newSnag.description}
                  onChange={(e) => editingSnag
                    ? setEditingSnag({ ...editingSnag, description: e.target.value })
                    : setNewSnag({ ...newSnag, description: e.target.value })
                  }
                  placeholder="Detailed description of the issue"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="snag-notes">Notes / Comments</Label>
                <Textarea
                  id="snag-notes"
                  value={editingSnag ? (editingSnag.notes || '') : newSnag.notes}
                  onChange={(e) => editingSnag
                    ? setEditingSnag({ ...editingSnag, notes: e.target.value })
                    : setNewSnag({ ...newSnag, notes: e.target.value })
                  }
                  placeholder="Additional notes or action items"
                  rows={3}
                />
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="snag-risk">Risk Level</Label>
                  <Select 
                    value={editingSnag ? (editingSnag.risk_level || '') : newSnag.risk_level} 
                    onValueChange={(value) => editingSnag
                      ? setEditingSnag({ ...editingSnag, risk_level: value })
                      : setNewSnag({ ...newSnag, risk_level: value })
                    }
                  >
                    <SelectTrigger id="snag-risk">
                      <SelectValue placeholder="Select risk level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="snag-cost">Estimated Cost (ZAR)</Label>
                  <Input
                    id="snag-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingSnag ? (editingSnag.estimated_cost || '') : newSnag.estimated_cost}
                    onChange={(e) => editingSnag
                      ? setEditingSnag({ ...editingSnag, estimated_cost: e.target.value })
                      : setNewSnag({ ...newSnag, estimated_cost: e.target.value })
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Photos</Label>
                {(editingSnag ? editingSnag.photos : newSnag.photos).length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {(editingSnag ? editingSnag.photos : newSnag.photos).map((photo: string, index: number) => (
                      <div 
                        key={index} 
                        className="relative group cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setViewingImage(photo)}
                      >
                        <RobustImage
                          src={photo}
                          alt={`Snag photo ${index + 1}`}
                          className="w-full h-24 object-cover rounded border"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute top-1 right-1 h-6 w-6 p-0 bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 z-10"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (editingSnag) {
                              setEditingSnag(prev => ({
                                ...prev,
                                photos: prev.photos.filter((_: string, i: number) => i !== index)
                              }));
                            } else {
                              setNewSnag(prev => ({
                                ...prev,
                                photos: prev.photos.filter((_, i) => i !== index)
                              }));
                            }
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  id="snag-photo-upload"
                  onChange={(e) => handleSnagPhotoUpload(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSnagCameraCapture()}
                  disabled={uploadingSnagPhotos}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  {uploadingSnagPhotos ? 'Uploading...' : 'Add Photos'}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSnagDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingSnag ? 'Update Snag' : 'Create Snag'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Full Screen Image Viewer */}
      <Dialog open={!!viewingImage} onOpenChange={() => setViewingImage(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0">
          <div className="relative w-full h-[95vh] flex items-center justify-center bg-black/95">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 text-white hover:bg-white/20 z-10"
              onClick={() => setViewingImage(null)}
            >
              <X className="h-6 w-6" />
            </Button>
            {viewingImage && (
              <RobustImage
                src={viewingImage}
                alt="Full size view"
                className="max-w-full max-h-full object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InspectionDetail;
