import { supabase } from "@/integrations/supabase/client";
import { readFirebaseData } from "./firebase";

interface MigrationLog {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  data?: any;
}

interface MigrationStats {
  clients: { total: number; migrated: number; failed: number };
  sites: { total: number; migrated: number; failed: number };
  subsections: { total: number; migrated: number; failed: number };
  images: { total: number; migrated: number; failed: number };
  documents: { total: number; migrated: number; failed: number };
  inspections: { total: number; migrated: number; failed: number };
}

export class MeticulousMigration {
  private logs: MigrationLog[] = [];
  private stats: MigrationStats = {
    clients: { total: 0, migrated: 0, failed: 0 },
    sites: { total: 0, migrated: 0, failed: 0 },
    subsections: { total: 0, migrated: 0, failed: 0 },
    images: { total: 0, migrated: 0, failed: 0 },
    documents: { total: 0, migrated: 0, failed: 0 },
    inspections: { total: 0, migrated: 0, failed: 0 },
  };
  
  private onProgress?: (log: MigrationLog) => void;
  
  constructor(onProgress?: (log: MigrationLog) => void) {
    this.onProgress = onProgress;
  }

  private log(level: MigrationLog['level'], message: string, data?: any) {
    const log: MigrationLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };
    this.logs.push(log);
    console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    this.onProgress?.(log);
  }

  async migrateAll() {
    try {
      this.log('info', '=== STARTING METICULOUS MIGRATION ===');
      
      // Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('User not authenticated');
      }
      this.log('success', `Authenticated as: ${user.email}`);

      // Read all Firebase data
      this.log('info', 'Reading Firebase RTDB data...');
      const firebaseData = await readFirebaseData("/clients");
      if (!firebaseData) {
        throw new Error('No Firebase data found');
      }
      
      const clientIds = Object.keys(firebaseData);
      this.stats.clients.total = clientIds.length;
      this.log('success', `Found ${clientIds.length} clients in Firebase`);

      // Process each client one by one
      for (let clientIndex = 0; clientIndex < clientIds.length; clientIndex++) {
        const clientId = clientIds[clientIndex];
        const clientData = firebaseData[clientId];
        
        this.log('info', `\n${'='.repeat(80)}`);
        this.log('info', `CLIENT ${clientIndex + 1}/${clientIds.length}: ${clientId}`);
        this.log('info', `${'='.repeat(80)}`);
        
        await this.migrateClient(clientId, clientData, user.id);
      }

      this.log('success', '\n=== MIGRATION COMPLETE ===');
      this.logFinalStats();
      
      return {
        success: true,
        logs: this.logs,
        stats: this.stats,
      };
      
    } catch (error: any) {
      this.log('error', `Migration failed: ${error.message}`, error);
      return {
        success: false,
        error: error.message,
        logs: this.logs,
        stats: this.stats,
      };
    }
  }

  private async migrateClient(firebaseId: string, fbData: any, userId: string) {
    try {
      // Log all client fields
      this.log('info', 'Client Firebase fields:', Object.keys(fbData));
      
      // Check if already migrated
      const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .eq('firebase_id', firebaseId)
        .maybeSingle();
      
      if (existing) {
        this.log('warning', `Client ${firebaseId} already exists, skipping`);
        this.stats.clients.failed++;
        return null;
      }

      // Extract client logo
      const logoUrl = fbData.logoUrl || fbData.logo_url || fbData.LogoUrl || fbData.logo;
      let migratedLogoUrl = logoUrl;
      
      if (logoUrl && logoUrl.includes('firebase')) {
        this.log('info', `Migrating client logo: ${logoUrl}`);
        this.stats.images.total++;
        
        try {
          const { data: imageData, error } = await supabase.functions.invoke('migrate-images', {
            body: {
              imageUrl: logoUrl,
              bucket: 'client-logos',
              fileName: `${firebaseId}/logo-${Date.now()}.png`,
            },
          });
          
          if (!error && imageData?.success) {
            migratedLogoUrl = imageData.newUrl;
            this.stats.images.migrated++;
            this.log('success', `✓ Logo migrated: ${migratedLogoUrl}`);
          } else {
            this.stats.images.failed++;
            this.log('error', `✗ Logo migration failed: ${error?.message}`);
          }
        } catch (err: any) {
          this.stats.images.failed++;
          this.log('error', `✗ Logo migration error: ${err.message}`);
        }
      }

      // Create client
      const clientInsertData = {
        name: fbData.name || fbData.clientName || fbData.Name || firebaseId,
        contact_person: fbData.contactPerson || fbData.contact_person || null,
        email: fbData.email || fbData.Email || null,
        phone: fbData.phone || fbData.Phone || null,
        logo_url: migratedLogoUrl,
        company_name: fbData.companyName || fbData.company_name || fbData.name || null,
        firebase_id: firebaseId,
        created_by: userId,
      };

      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert([clientInsertData])
        .select()
        .single();

      if (clientError || !newClient) {
        this.stats.clients.failed++;
        this.log('error', `✗ Failed to create client: ${clientError?.message}`);
        return null;
      }

      this.stats.clients.migrated++;
      this.log('success', `✓ Client created: ${newClient.id}`);

      // Find sites - check multiple possible locations
      let sitesToMigrate: Record<string, any> = {};
      
      if (fbData.sites || fbData.Sites) {
        sitesToMigrate = fbData.sites || fbData.Sites;
      } else {
        // Sites might be direct children
        const clientLevelProps = ['name', 'clientName', 'Name', 'email', 'Email', 'phone', 'Phone', 
          'logo', 'logoUrl', 'logo_url', 'LogoUrl', 'created', 'createdAt', 'created_at'];
        
        Object.keys(fbData).forEach(key => {
          const isClientProp = clientLevelProps.some(prop => 
            key.toLowerCase() === prop.toLowerCase()
          );
          const value = fbData[key];
          
          if (!isClientProp && typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
            sitesToMigrate[key] = value;
          }
        });
      }

      const siteIds = Object.keys(sitesToMigrate);
      this.stats.sites.total += siteIds.length;
      this.log('info', `Found ${siteIds.length} sites for client`);

      // Migrate each site
      for (let siteIndex = 0; siteIndex < siteIds.length; siteIndex++) {
        const siteId = siteIds[siteIndex];
        const siteData = sitesToMigrate[siteId];
        
        this.log('info', `\n  SITE ${siteIndex + 1}/${siteIds.length}: ${siteId}`);
        await this.migrateSite(siteId, siteData, newClient.id, userId);
      }

      return newClient;
      
    } catch (error: any) {
      this.stats.clients.failed++;
      this.log('error', `Client migration error: ${error.message}`, error);
      return null;
    }
  }

  private async migrateSite(firebaseId: string, fbData: any, clientId: string, userId: string) {
    try {
      // Log all site fields
      this.log('info', '  Site Firebase fields:', Object.keys(fbData));
      
      // Extract and migrate site image
      const siteImageUrl = fbData.siteImageUrl || fbData.site_image_url || fbData.imageUrl || fbData.image;
      let migratedSiteImageUrl = siteImageUrl;
      
      if (siteImageUrl && siteImageUrl.includes('firebase')) {
        this.log('info', `  Migrating site image: ${siteImageUrl}`);
        this.stats.images.total++;
        
        try {
          const { data: imageData, error } = await supabase.functions.invoke('migrate-images', {
            body: {
              imageUrl: siteImageUrl,
              bucket: 'site-images',
              fileName: `${firebaseId}/site-${Date.now()}.png`,
            },
          });
          
          if (!error && imageData?.success) {
            migratedSiteImageUrl = imageData.newUrl;
            this.stats.images.migrated++;
            this.log('success', `  ✓ Site image migrated: ${migratedSiteImageUrl}`);
          } else {
            this.stats.images.failed++;
            this.log('error', `  ✗ Site image migration failed`);
          }
        } catch (err: any) {
          this.stats.images.failed++;
          this.log('error', `  ✗ Site image error: ${err.message}`);
        }
      }

      // Extract and migrate client logo at site level
      const clientLogoUrl = fbData.clientLogoUrl || fbData.client_logo_url;
      let migratedClientLogoUrl = clientLogoUrl;
      
      if (clientLogoUrl && clientLogoUrl.includes('firebase')) {
        this.log('info', `  Migrating client logo: ${clientLogoUrl}`);
        this.stats.images.total++;
        
        try {
          const { data: imageData, error } = await supabase.functions.invoke('migrate-images', {
            body: {
              imageUrl: clientLogoUrl,
              bucket: 'client-logos',
              fileName: `${firebaseId}/logo-${Date.now()}.png`,
            },
          });
          
          if (!error && imageData?.success) {
            migratedClientLogoUrl = imageData.newUrl;
            this.stats.images.migrated++;
            this.log('success', `  ✓ Client logo migrated: ${migratedClientLogoUrl}`);
          } else {
            this.stats.images.failed++;
          }
        } catch (err) {
          this.stats.images.failed++;
        }
      }

      // Create site
      const siteInsertData = {
        name: fbData.name || fbData.siteName || fbData.Name || firebaseId,
        address: fbData.address || fbData.physicalAddress || fbData.Address || null,
        site_type: fbData.siteType || fbData.site_type || fbData.type || null,
        client_id: clientId,
        firebase_id: firebaseId,
        created_by: userId,
        supply_authority: fbData.supplyAuthority || fbData.supply_authority || null,
        nominated_max_demand: fbData.nominatedMaxDemand || fbData.nominated_max_demand || null,
        consultant_name: fbData.consultantName || fbData.consultant_name || null,
        consultant_company: fbData.consultantCompany || fbData.consultant_company || null,
        consultant_contact: fbData.consultantContact || fbData.consultant_contact || null,
        site_image_url: migratedSiteImageUrl,
        client_logo_url: migratedClientLogoUrl,
      };

      const { data: newSite, error: siteError } = await supabase
        .from('sites')
        .insert([siteInsertData])
        .select()
        .single();

      if (siteError || !newSite) {
        this.stats.sites.failed++;
        this.log('error', `  ✗ Failed to create site: ${siteError?.message}`);
        return null;
      }

      this.stats.sites.migrated++;
      this.log('success', `  ✓ Site created: ${newSite.id}`);

      // Migrate site documents
      const siteDocuments = fbData.documents || fbData.Documents || fbData.files || fbData.Files;
      if (siteDocuments && typeof siteDocuments === 'object') {
        const docIds = Object.keys(siteDocuments);
        this.log('info', `  Found ${docIds.length} site documents`);
        
        for (const docId of docIds) {
          await this.migrateSiteDocument(docId, siteDocuments[docId], newSite.id, userId);
        }
      }

      // Find and migrate subsections
      const subsections = fbData.subsections || fbData.Subsections;
      if (subsections && typeof subsections === 'object') {
        const subsectionIds = Object.keys(subsections);
        this.stats.subsections.total += subsectionIds.length;
        this.log('info', `  Found ${subsectionIds.length} subsections`);

        for (let subIndex = 0; subIndex < subsectionIds.length; subIndex++) {
          const subsectionId = subsectionIds[subIndex];
          const subsectionData = subsections[subsectionId];
          
          this.log('info', `\n    SUBSECTION ${subIndex + 1}/${subsectionIds.length}: ${subsectionId}`);
          await this.migrateSubsection(subsectionId, subsectionData, newSite.id, userId);
        }
      }

      return newSite;
      
    } catch (error: any) {
      this.stats.sites.failed++;
      this.log('error', `  Site migration error: ${error.message}`);
      return null;
    }
  }

  private async migrateSiteDocument(firebaseId: string, fbData: any, siteId: string, userId: string) {
    try {
      const docUrl = fbData?.url || fbData?.fileUrl || fbData?.downloadUrl || fbData?.URL ||
                     (typeof fbData === 'string' ? fbData : null);
      const fileName = fbData?.name || fbData?.fileName || fbData?.file_name || `document-${firebaseId}`;
      
      if (!docUrl) {
        this.log('warning', `    ⊘ No URL for site document: ${firebaseId}`);
        return;
      }

      let migratedDocUrl = docUrl;
      this.stats.documents.total++;
      
      if (docUrl.includes('firebase')) {
        this.log('info', `    Migrating site document: ${fileName}`);
        
        try {
          const { data, error } = await supabase.functions.invoke('migrate-storage', {
            body: {
              firebaseStorageUrl: docUrl,
              targetBucket: 'documents',
              targetPath: `sites/${siteId}/${fileName}`,
            },
          });
          
          if (!error && data?.success) {
            migratedDocUrl = data.publicUrl;
            this.stats.documents.migrated++;
            this.log('success', `    ✓ Site document migrated`);
          } else {
            this.stats.documents.failed++;
            this.log('error', `    ✗ Site document migration failed`);
          }
        } catch (err: any) {
          this.stats.documents.failed++;
          this.log('error', `    ✗ Site document error: ${err.message}`);
        }
      }

      // Insert site document record
      await supabase.from('site_documents').insert([{
        site_id: siteId,
        file_name: fileName,
        file_url: migratedDocUrl,
        category: fbData?.category || fbData?.Category || 'General',
      }]);
      
    } catch (error: any) {
      this.stats.documents.failed++;
      this.log('error', `    Site document error: ${error.message}`);
    }
  }

  private async migrateSubsection(firebaseId: string, fbData: any, siteId: string, userId: string) {
    try {
      // Log all subsection fields
      this.log('info', '    Subsection Firebase fields:', Object.keys(fbData));
      
      // Create subsection
      const subsectionInsertData = {
        name: fbData.name || fbData.subsectionName || fbData.Name || firebaseId,
        description: fbData.description || fbData.Description || null,
        category: fbData.category || fbData.Category || null,
        site_id: siteId,
        firebase_id: firebaseId,
        tenant_name: fbData.tenantName || fbData.tenant_name || null,
        meter_serial_number: fbData.meterSerialNumber || fbData.meter_serial_number || null,
        ct_ratio: fbData.ctRatio || fbData.ct_ratio || null,
        coc_number: fbData.cocNumber || fbData.coc_number || null,
        coc_type: fbData.cocType || fbData.coc_type || null,
        coc_status: fbData.cocStatus || fbData.coc_status || 'Missing',
        metering_status: fbData.meteringStatus || fbData.metering_status || 'Missing',
        is_compliant: fbData.isCompliant ?? fbData.is_compliant ?? true,
        is_coc_required: fbData.isCocRequired ?? fbData.is_coc_required ?? true,
      };

      const { data: newSubsection, error: subsectionError } = await supabase
        .from('subsections')
        .insert([subsectionInsertData])
        .select()
        .single();

      if (subsectionError || !newSubsection) {
        this.stats.subsections.failed++;
        this.log('error', `    ✗ Failed to create subsection: ${subsectionError?.message}`);
        return null;
      }

      this.stats.subsections.migrated++;
      this.log('success', `    ✓ Subsection created: ${newSubsection.id}`);

      // Migrate subsection documents
      const documents = fbData.documents || fbData.Documents || fbData.files || fbData.Files;
      if (documents && typeof documents === 'object') {
        const docIds = Object.keys(documents);
        this.log('info', `    Found ${docIds.length} subsection documents`);
        
        for (const docId of docIds) {
          await this.migrateSubsectionDocument(docId, documents[docId], newSubsection.id, userId);
        }
      }

      // Migrate inspections and photos
      const inspections = fbData.inspections || fbData.Inspections || fbData.inspection || fbData.Inspection;
      if (inspections && typeof inspections === 'object') {
        const inspectionIds = Object.keys(inspections);
        this.log('info', `    Found ${inspectionIds.length} inspections`);
        
        for (const inspId of inspectionIds) {
          await this.migrateInspection(inspId, inspections[inspId], newSubsection.id, userId);
        }
      }

      return newSubsection;
      
    } catch (error: any) {
      this.stats.subsections.failed++;
      this.log('error', `    Subsection migration error: ${error.message}`);
      return null;
    }
  }

  private async migrateSubsectionDocument(firebaseId: string, fbData: any, subsectionId: string, userId: string) {
    try {
      const docUrl = fbData?.url || fbData?.fileUrl || fbData?.downloadUrl || fbData?.URL ||
                     (typeof fbData === 'string' ? fbData : null);
      const fileName = fbData?.name || fbData?.fileName || fbData?.file_name || `document-${firebaseId}`;
      const category = fbData?.category || fbData?.Category || 'General';
      
      if (!docUrl) {
        this.log('warning', `      ⊘ No URL for subsection document: ${firebaseId}`);
        return;
      }

      let migratedDocUrl = docUrl;
      this.stats.documents.total++;
      
      if (docUrl.includes('firebase')) {
        this.log('info', `      Migrating subsection document: ${fileName}`);
        
        try {
          const { data, error } = await supabase.functions.invoke('migrate-storage', {
            body: {
              firebaseStorageUrl: docUrl,
              targetBucket: 'documents',
              targetPath: `subsections/${subsectionId}/${fileName}`,
            },
          });
          
          if (!error && data?.success) {
            migratedDocUrl = data.publicUrl;
            this.stats.documents.migrated++;
            this.log('success', `      ✓ Subsection document migrated`);
          } else {
            this.stats.documents.failed++;
            this.log('error', `      ✗ Subsection document migration failed`);
          }
        } catch (err: any) {
          this.stats.documents.failed++;
          this.log('error', `      ✗ Subsection document error: ${err.message}`);
        }
      }

      // Find or create category
      let categoryId = null;
      const { data: existingCategory } = await supabase
        .from('document_categories')
        .select('id')
        .eq('subsection_id', subsectionId)
        .eq('name', category)
        .maybeSingle();

      if (existingCategory) {
        categoryId = existingCategory.id;
      } else {
        const { data: newCategory } = await supabase
          .from('document_categories')
          .insert([{
            name: category,
            subsection_id: subsectionId,
            order_index: 0,
          }])
          .select()
          .single();
        
        if (newCategory) {
          categoryId = newCategory.id;
        }
      }

      if (categoryId) {
        await supabase.from('subsection_documents').insert([{
          subsection_id: subsectionId,
          category_id: categoryId,
          file_name: fileName,
          file_url: migratedDocUrl,
          file_size: fbData?.fileSize || fbData?.file_size || null,
          uploaded_by: userId,
        }]);
      }
      
    } catch (error: any) {
      this.stats.documents.failed++;
      this.log('error', `      Subsection document error: ${error.message}`);
    }
  }

  private async migrateInspection(firebaseId: string, fbData: any, subsectionId: string, userId: string) {
    try {
      this.stats.inspections.total++;
      
      // Migrate inspection photos
      const photos = fbData?.photos || fbData?.Photos || fbData?.images || fbData?.Images;
      if (photos && typeof photos === 'object') {
        const photoIds = Object.keys(photos);
        this.log('info', `      Found ${photoIds.length} inspection photos`);
        
        for (const photoId of photoIds) {
          await this.migrateInspectionPhoto(photoId, photos[photoId], subsectionId);
        }
      }
      
      this.stats.inspections.migrated++;
      this.log('success', `      ✓ Inspection processed: ${firebaseId}`);
      
    } catch (error: any) {
      this.stats.inspections.failed++;
      this.log('error', `      Inspection error: ${error.message}`);
    }
  }

  private async migrateInspectionPhoto(firebaseId: string, fbData: any, subsectionId: string) {
    try {
      const photoUrl = fbData?.url || fbData?.imageUrl || fbData?.downloadUrl || fbData?.URL;
      
      if (!photoUrl) {
        this.log('warning', `        ⊘ No URL for inspection photo: ${firebaseId}`);
        return;
      }

      let migratedPhotoUrl = photoUrl;
      this.stats.images.total++;
      
      if (photoUrl.includes('firebase')) {
        this.log('info', `        Migrating inspection photo`);
        
        try {
          const { data, error } = await supabase.functions.invoke('migrate-images', {
            body: {
              imageUrl: photoUrl,
              bucket: 'inspection-photos',
              fileName: `${subsectionId}/${firebaseId}-${Date.now()}.png`,
            },
          });
          
          if (!error && data?.success) {
            migratedPhotoUrl = data.newUrl;
            this.stats.images.migrated++;
            this.log('success', `        ✓ Inspection photo migrated`);
          } else {
            this.stats.images.failed++;
            this.log('error', `        ✗ Inspection photo migration failed`);
          }
        } catch (err: any) {
          this.stats.images.failed++;
          this.log('error', `        ✗ Inspection photo error: ${err.message}`);
        }
      }
      
      // Note: We're not creating inspection_items here as we don't have full inspection context
      // These photos will need to be linked to inspection records separately
      
    } catch (error: any) {
      this.stats.images.failed++;
      this.log('error', `        Inspection photo error: ${error.message}`);
    }
  }

  private logFinalStats() {
    this.log('info', '\n=== FINAL STATISTICS ===');
    this.log('info', `Clients: ${this.stats.clients.migrated}/${this.stats.clients.total} (${this.stats.clients.failed} failed)`);
    this.log('info', `Sites: ${this.stats.sites.migrated}/${this.stats.sites.total} (${this.stats.sites.failed} failed)`);
    this.log('info', `Subsections: ${this.stats.subsections.migrated}/${this.stats.subsections.total} (${this.stats.subsections.failed} failed)`);
    this.log('info', `Images: ${this.stats.images.migrated}/${this.stats.images.total} (${this.stats.images.failed} failed)`);
    this.log('info', `Documents: ${this.stats.documents.migrated}/${this.stats.documents.total} (${this.stats.documents.failed} failed)`);
    this.log('info', `Inspections: ${this.stats.inspections.migrated}/${this.stats.inspections.total} (${this.stats.inspections.failed} failed)`);
  }

  getLogs() {
    return this.logs;
  }

  getStats() {
    return this.stats;
  }
}
