import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Save, Camera, Upload, Trash2, ArrowLeft, Plus } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCamera } from "@/hooks/useCamera";

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
  const [snags, setSnags] = useState<any[]>([]);
  const [loadingSnags, setLoadingSnags] = useState(false);
  const [snagDialogOpen, setSnagDialogOpen] = useState(false);
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
    ctRatioImage: ''
  });
  const [uploadingTenantImages, setUploadingTenantImages] = useState<Set<string>>(new Set());
  const tenantImageInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

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
      
      // Check if inspectionId is a valid UUID (not a Firebase ID)
      const isValidUUID = inspectionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inspectionId);
      
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
      
      // Only add inspection_id if it's a valid UUID
      if (isValidUUID) {
        snagData.inspection_id = inspectionId;
      }
      
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
      ctRatioImage: ''
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

  const handleTenantImageUpload = async (tenantId: string, field: 'breakerImage' | 'ctRatioImage', files: FileList | null) => {
    if (!files || files.length === 0) return;

    const uploadKey = `${tenantId}-${field}`;
    setUploadingTenantImages(prev => new Set(prev).add(uploadKey));

    try {
      const file = files[0];
      const fileExt = file.name.split('.').pop();
      const timestamp = Date.now();
      const fileName = `${inspectionId}/tenants/${tenantId}/${field}/${timestamp}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('inspection-photos')
        .upload(fileName, file);

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('inspection-photos')
        .getPublicUrl(data.path);

      setTenants(tenants.map(t => 
        t.id === tenantId ? { ...t, [field]: urlData.publicUrl } : t
      ));

      toast.success("Image uploaded successfully");
    } catch (error) {
      console.error("Error uploading tenant image:", error);
      toast.error("Failed to upload image");
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

  const handleDeleteTenantImage = async (tenantId: string, field: 'breakerImage' | 'ctRatioImage') => {
    const tenant = tenants.find(t => t.id === tenantId);
    if (!tenant) return;

    const imageUrl = tenant[field];
    if (!imageUrl) return;

    if (!imageUrl.includes('supabase.co/storage')) {
      toast.error("Only Supabase images can be deleted");
      return;
    }

    try {
      const urlParts = imageUrl.split('/inspection-photos/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1].split('?')[0];
        await supabase.storage.from('inspection-photos').remove([filePath]);
      }

      setTenants(tenants.map(t => 
        t.id === tenantId ? { ...t, [field]: '' } : t
      ));

      toast.success("Image deleted successfully");
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
      
      setNewSnag(prev => ({ ...prev, photos: [...prev.photos, ...uploadedUrls] }));
      toast.success(`${uploadedUrls.length} photo(s) uploaded`);
    } catch (error) {
      console.error("Error uploading snag photos:", error);
      toast.error("Failed to upload photos");
    } finally {
      setUploadingSnagPhotos(false);
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
              address,
              site_image_url,
              client_logo_url
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
        quality_rating: inspData.quality_rating || undefined,
        tenants: (inspData.json_data as any)?.tenants || [],
        jsonData: (inspData.json_data as InspectionData['jsonData']) || {}
      };

      setInspection(mappedInspection);
      setTenants((inspData.json_data as any)?.tenants || []);
      
      // Set site and subsection data
      if (inspData.sites) {
        setSiteData({ 
          siteName: inspData.sites.name, 
          physicalAddress: inspData.sites.address,
          siteImageUrl: inspData.sites.site_image_url,
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
        setTemplate({
          name: templateData.name,
          sections: templateData.sections as any
        });
        
        // Set active tab - default to general for non-Site Drawing templates
        if (templateData.category === "Site Drawing") {
          const firstSection = Object.keys(templateData.sections as any)[0];
          setActiveTab(firstSection || 'general');
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
        const timestamp = Date.now();
        const fileName = `${inspectionId}/${sectionKey}/${itemKey}/${timestamp}-${i + 1}.${fileExt}`;

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
    } catch (error) {
      console.error("Error uploading images:", error);
      toast.error("Failed to upload images: " + (error as Error).message);
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
    if (!isNative) {
      // Fall back to file input on web
      const uploadKey = `${sectionKey}-${itemKey}`;
      fileInputRefs.current[uploadKey]?.click();
      return;
    }

    const uploadKey = `${sectionKey}-${itemKey}`;
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
  const handleTenantCameraCapture = async (tenantId: string, field: 'breakerImage' | 'ctRatioImage') => {
    if (!isNative) {
      tenantImageInputRefs.current[`${tenantId}-${field}`]?.click();
      return;
    }

    const uploadKey = `${tenantId}-${field}`;
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
    if (!isNative) {
      document.getElementById('snag-photo-upload')?.click();
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

    // Validate that if status is Complete, quality_rating must be set
    if (inspection.type === 'Completed' && !inspection.quality_rating) {
      toast.error("Cannot mark inspection as complete without setting a quality rating (1-5)");
      return;
    }

    try {
      setSaving(true);

      // Determine if inspectionId is a UUID or Firebase ID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inspectionId || '');
      
      // Include tenants in json_data
      const jsonDataWithTenants = {
        ...inspection.jsonData,
        tenants: tenants
      } as any;

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
          quality_rating: inspection.quality_rating,
          json_data: jsonDataWithTenants,
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              if (isContractorPortal) {
                // Navigate back to subsection detail if we have subsection_id from inspection data
                if (inspection?.jsonData && subsectionData?.id) {
                  navigate(`/contractor/subsections/${subsectionData.id}${previewSiteId ? `?preview=${previewSiteId}` : ''}`);
                } else {
                  navigate(`/contractor${previewSiteId ? `?preview=${previewSiteId}` : ''}`);
                }
              } else {
                navigate(`${(clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`)}/subsections/${subsectionId}`);
              }
            }}
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
            subsectionId={subsectionId}
            siteLogoUrl={siteData?.siteImageUrl || siteData?.clientLogoUrl || null}
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
            .filter(([key, section]) => {
              // Skip generalInfo and observations sections
              const lowerKey = key.toLowerCase();
              const lowerName = section.name?.toLowerCase() || '';
              return !lowerKey.includes('general') && !lowerName.includes('general') &&
                     !lowerKey.includes('observation') && !lowerName.includes('observation');
            })
            .map(([key, section]) => (
              <TabsTrigger key={key} value={key}>
                {section.name}
              </TabsTrigger>
            ))}
          {templateCategory !== "Site Drawing" && <TabsTrigger value="tenants">Tenants</TabsTrigger>}
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

            {Object.entries(template.sections || {})
              .filter(([key, section]) => {
                // Skip generalInfo and observations sections
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

                            <div className="grid md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Breaker Image</Label>
                                {tenant.breakerImage ? (
                                  <div className="relative group">
                                    <img
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
                                    <img
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
                                  <img
                                    key={index}
                                    src={photo}
                                    alt={`Snag photo ${index + 1}`}
                                    className="w-full h-24 object-cover rounded border"
                                  />
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
                <img
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
                <img
                  src={newTenant.ctRatioImage}
                  alt="CT Ratio preview"
                  className="mt-2 w-full h-48 object-cover rounded border"
                />
              )}
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

      {/* Snag Creation Dialog */}
      <Dialog open={snagDialogOpen} onOpenChange={setSnagDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Snag</DialogTitle>
            <DialogDescription>
              Document an issue or defect found during this inspection
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSnag}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="snag-title">Title *</Label>
                <Input
                  id="snag-title"
                  value={newSnag.title}
                  onChange={(e) => setNewSnag({ ...newSnag, title: e.target.value })}
                  placeholder="Brief description of the issue"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="snag-description">Description</Label>
                <Textarea
                  id="snag-description"
                  value={newSnag.description}
                  onChange={(e) => setNewSnag({ ...newSnag, description: e.target.value })}
                  placeholder="Detailed description of the issue"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="snag-notes">Notes / Comments</Label>
                <Textarea
                  id="snag-notes"
                  value={newSnag.notes}
                  onChange={(e) => setNewSnag({ ...newSnag, notes: e.target.value })}
                  placeholder="Additional notes or action items"
                  rows={3}
                />
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="snag-risk">Risk Level</Label>
                  <Select value={newSnag.risk_level} onValueChange={(value) => setNewSnag({ ...newSnag, risk_level: value })}>
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
                    value={newSnag.estimated_cost}
                    onChange={(e) => setNewSnag({ ...newSnag, estimated_cost: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Photos</Label>
                {newSnag.photos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {newSnag.photos.map((photo, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={photo}
                          alt={`Snag photo ${index + 1}`}
                          className="w-full h-24 object-cover rounded border"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute top-1 right-1 h-6 w-6 p-0 bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100"
                          onClick={() => setNewSnag(prev => ({
                            ...prev,
                            photos: prev.photos.filter((_, i) => i !== index)
                          }))}
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
                  multiple
                  capture="environment"
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
                Create Snag
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InspectionDetail;
