import { supabase } from "@/integrations/supabase/client";
import { readFirebaseData } from "./firebase";

export interface FirebaseClient {
  [key: string]: any;
}

export interface MigrationResult {
  success: boolean;
  clientId?: string;
  sitesCount?: number;
  subsectionsCount?: number;
  inspectionsCount?: number;
  documentsCount?: number;
  error?: string;
}

export interface MigrationProgress {
  currentEntity: string;
  percentage: number;
  itemsMigrated: number;
  totalItems: number;
  errors: string[];
}

/**
 * Transform Firebase client data to Supabase format
 */
export const transformFirebaseClient = (firebaseId: string, fbData: Record<string, any>) => {
  // Try multiple field name variations for the client name
  const name = fbData.name || 
               fbData.clientName || 
               fbData.Name || 
               fbData.client_name ||
               fbData.ClientName ||
               fbData.company_name ||
               fbData.companyName ||
               fbData.CompanyName ||
               firebaseId; // Use Firebase ID as last resort
  
  return {
    id: firebaseId, // Temporary, will be replaced by Supabase UUID
    firebaseId,
    name: name,
    contact_person: fbData.contactPerson || fbData.contact_person || fbData.ContactPerson || null,
    email: fbData.email || fbData.Email || fbData.contactEmail || null,
    phone: fbData.phone || fbData.Phone || fbData.phoneNumber || null,
    logo_url: fbData.logoUrl || fbData.logo_url || fbData.LogoUrl || null,
    company_name: fbData.companyName || fbData.company_name || fbData.CompanyName || fbData.name || null,
    primary_contact_email: fbData.primaryContactEmail || fbData.primary_contact_email || fbData.PrimaryContactEmail || null,
    created_at: fbData.createdAt || fbData.created_at || new Date().toISOString(),
    source: 'firebase' as const,
  };
};

/**
 * Check if a client has already been migrated
 */
export const isClientMigrated = async (firebaseId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('id')
      .eq('firebase_id', firebaseId)
      .maybeSingle();

    return !error && !!data;
  } catch {
    return false;
  }
};

/**
 * Migrate a single client with all nested data (sites, subsections, inspections, documents)
 */
export const migrateClientToSupabase = async (
  firebaseId: string,
  firebaseData: Record<string, any>,
  onProgress?: (message: string) => void
): Promise<MigrationResult> => {
  try {
    onProgress?.(`Starting migration for client: ${firebaseData.name || firebaseId}`);

    // Check if already migrated
    if (await isClientMigrated(firebaseId)) {
      return {
        success: false,
        error: 'Client already migrated',
      };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        success: false,
        error: 'User not authenticated',
      };
    }

    // Step 1: Migrate Client
    onProgress?.('Migrating client...');
    const clientData = transformFirebaseClient(firebaseId, firebaseData);
    const { id, firebaseId: fbId, source, ...clientInsertData } = clientData;

    const { data: newClient, error: clientError } = await supabase
      .from('clients')
      .insert([{
        ...clientInsertData,
        firebase_id: firebaseId,
        created_by: user.id,
      }])
      .select()
      .single();

    if (clientError || !newClient) {
      console.error('Client migration error:', clientError);
      return {
        success: false,
        error: `Failed to migrate client: ${clientError?.message}`,
      };
    }

    let sitesCount = 0;
    let subsectionsCount = 0;
    let inspectionsCount = 0;
    let documentsCount = 0;

    // Step 2: Migrate Sites
    // Sites can be under a 'sites' key OR as direct children of the client object
    const sitesData = firebaseData.sites || firebaseData.Sites;
    let sitesToMigrate: Record<string, any> = {};
    
    if (sitesData) {
      // Sites are under a 'sites' key
      sitesToMigrate = sitesData;
    } else {
      // Sites are direct children - filter out client-level properties
      const clientLevelProps = ['name', 'clientName', 'Name', 'email', 'Email', 'phone', 'Phone', 
        'logo', 'logoUrl', 'logo_url', 'LogoUrl', 'created', 'createdAt', 'created_at', 
        'updated', 'updatedAt', 'updated_at', 'contactPerson', 'contact_person', 
        'companyName', 'company_name', 'primaryContactEmail', 'primary_contact_email'];
      
      Object.keys(firebaseData).forEach(key => {
        const isClientProp = clientLevelProps.some(prop => 
          key.toLowerCase() === prop.toLowerCase()
        );
        const value = firebaseData[key];
        
        // If it's not a client-level property and it's an object with nested data, it's likely a site
        if (!isClientProp && typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
          sitesToMigrate[key] = value;
        }
      });
    }
    
    if (Object.keys(sitesToMigrate).length > 0) {
      onProgress?.('Migrating sites...');
      
      for (const [siteId, siteData] of Object.entries(sitesToMigrate)) {
        try {
          // Migrate images from Firebase Storage to Supabase Storage
          let migratedSiteImageUrl = null;
          let migratedClientLogoUrl = null;
          
          const firebaseSiteImageUrl = (siteData as any).siteImageUrl || (siteData as any).site_image_url;
          const firebaseClientLogoUrl = (siteData as any).clientLogoUrl || (siteData as any).client_logo_url;
          
          // Migrate site image if it exists
          if (firebaseSiteImageUrl && firebaseSiteImageUrl.startsWith('http')) {
            try {
              const fileName = `site-${siteId}-${Date.now()}.jpg`;
              const { data: imageData, error: imageError } = await supabase.functions.invoke('migrate-images', {
                body: {
                  imageUrl: firebaseSiteImageUrl,
                  bucket: 'site-images',
                  fileName,
                },
              });
              
              if (!imageError && imageData?.success) {
                migratedSiteImageUrl = imageData.newUrl;
                console.log(`Migrated site image: ${firebaseSiteImageUrl} -> ${migratedSiteImageUrl}`);
              } else {
                console.warn(`Failed to migrate site image: ${firebaseSiteImageUrl}`, imageError);
              }
            } catch (error) {
              console.warn('Error migrating site image:', error);
            }
          }
          
          // Migrate client logo if it exists
          if (firebaseClientLogoUrl && firebaseClientLogoUrl.startsWith('http')) {
            try {
              const fileName = `client-logo-${siteId}-${Date.now()}.jpg`;
              const { data: logoData, error: logoError } = await supabase.functions.invoke('migrate-images', {
                body: {
                  imageUrl: firebaseClientLogoUrl,
                  bucket: 'client-logos',
                  fileName,
                },
              });
              
              if (!logoError && logoData?.success) {
                migratedClientLogoUrl = logoData.newUrl;
                console.log(`Migrated client logo: ${firebaseClientLogoUrl} -> ${migratedClientLogoUrl}`);
              } else {
                console.warn(`Failed to migrate client logo: ${firebaseClientLogoUrl}`, logoError);
              }
            } catch (error) {
              console.warn('Error migrating client logo:', error);
            }
          }

          const siteInsertData = {
            name: (siteData as any).name || (siteData as any).siteName || (siteData as any).Name || siteId,
            address: (siteData as any).address || (siteData as any).physicalAddress || (siteData as any).Address || null,
            site_type: (siteData as any).siteType || (siteData as any).site_type || (siteData as any).type || null,
            client_id: newClient.id,
            firebase_id: siteId,
            created_by: user.id,
            supply_authority: (siteData as any).supplyAuthority || (siteData as any).supply_authority || null,
            nominated_max_demand: (siteData as any).nominatedMaxDemand || (siteData as any).nominated_max_demand || null,
            consultant_name: (siteData as any).consultantName || (siteData as any).consultant_name || null,
            consultant_company: (siteData as any).consultantCompany || (siteData as any).consultant_company || null,
            consultant_contact: (siteData as any).consultantContact || (siteData as any).consultant_contact || null,
            site_image_url: migratedSiteImageUrl || firebaseSiteImageUrl,
            client_logo_url: migratedClientLogoUrl || firebaseClientLogoUrl,
          };

          const { data: newSite, error: siteError } = await supabase
            .from('sites')
            .insert([siteInsertData])
            .select()
            .single();

          if (!siteError && newSite) {
            sitesCount++;

            // Step 3: Migrate Subsections for this site
            const subsections = (siteData as any).subsections || (siteData as any).Subsections;
            if (subsections) {
              onProgress?.(`Migrating subsections for site: ${siteInsertData.name}`);
              
              for (const [subsectionId, subsectionData] of Object.entries(subsections || {})) {
                try {
                  const subsectionInsertData = {
                    name: (subsectionData as any).name || (subsectionData as any).subsectionName || (subsectionData as any).Name || 'Unnamed Subsection',
                    description: (subsectionData as any).description || (subsectionData as any).Description || null,
                    category: (subsectionData as any).category || (subsectionData as any).Category || null,
                    site_id: newSite.id,
                    firebase_id: subsectionId,
                    tenant_name: (subsectionData as any).tenantName || (subsectionData as any).tenant_name || null,
                    meter_serial_number: (subsectionData as any).meterSerialNumber || (subsectionData as any).meter_serial_number || null,
                    ct_ratio: (subsectionData as any).ctRatio || (subsectionData as any).ct_ratio || null,
                    coc_number: (subsectionData as any).cocNumber || (subsectionData as any).coc_number || null,
                    coc_type: (subsectionData as any).cocType || (subsectionData as any).coc_type || null,
                    coc_status: (subsectionData as any).cocStatus || (subsectionData as any).coc_status || 'Missing',
                    metering_status: (subsectionData as any).meteringStatus || (subsectionData as any).metering_status || 'Missing',
                    is_compliant: (subsectionData as any).isCompliant ?? (subsectionData as any).is_compliant ?? true,
                    is_coc_required: (subsectionData as any).isCocRequired ?? (subsectionData as any).is_coc_required ?? true,
                  };

                  const { data: newSubsection, error: subsectionError } = await supabase
                    .from('subsections')
                    .insert([subsectionInsertData])
                    .select()
                    .single();

                  if (!subsectionError && newSubsection) {
                    subsectionsCount++;

                    // Step 4: Migrate Documents for subsection
                    const documents = (subsectionData as any).documents || (subsectionData as any).Documents;
                    if (documents) {
                      for (const [docId, docData] of Object.entries(documents || {})) {
                        try {
                          // First, check if we need a category
                          let categoryId = null;
                          const categoryName = (docData as any).category || (docData as any).Category || 'General';
                          
                          // Try to find or create category
                          const { data: existingCategory } = await supabase
                            .from('document_categories')
                            .select('id')
                            .eq('subsection_id', newSubsection.id)
                            .eq('name', categoryName)
                            .maybeSingle();

                          if (existingCategory) {
                            categoryId = existingCategory.id;
                          } else {
                            const { data: newCategory } = await supabase
                              .from('document_categories')
                              .insert([{
                                name: categoryName,
                                subsection_id: newSubsection.id,
                                order_index: 0,
                              }])
                              .select()
                              .single();
                            
                            if (newCategory) {
                              categoryId = newCategory.id;
                            }
                          }

                          if (categoryId) {
                            const docInsertData = {
                              file_name: (docData as any).fileName || (docData as any).file_name || (docData as any).name || 'Unnamed Document',
                              file_url: (docData as any).fileUrl || (docData as any).file_url || (docData as any).url || '',
                              file_size: (docData as any).fileSize || (docData as any).file_size || null,
                              subsection_id: newSubsection.id,
                              category_id: categoryId,
                              uploaded_by: user.id,
                            };

                            await supabase.from('subsection_documents').insert([docInsertData]);
                            documentsCount++;
                          }
                        } catch (docError) {
                          console.error('Document migration error:', docError);
                        }
                      }
                    }
                  }
                } catch (subsectionError) {
                  console.error('Subsection migration error:', subsectionError);
                }
              }
            }

            // Step 5: Migrate Inspections for this site
            const inspections = (siteData as any).inspections || (siteData as any).Inspections;
            if (inspections) {
              onProgress?.(`Migrating inspections for site: ${siteInsertData.name}`);
              
              for (const [inspectionId, inspectionData] of Object.entries(inspections || {})) {
                try {
                  const inspectionInsertData = {
                    title: (inspectionData as any).title || (inspectionData as any).Title || 'Unnamed Inspection',
                    description: (inspectionData as any).description || (inspectionData as any).Description || null,
                    status: (inspectionData as any).status || (inspectionData as any).Status || 'Pending',
                    priority: (inspectionData as any).priority || (inspectionData as any).Priority || 'Medium',
                    site_id: newSite.id,
                    firebase_id: inspectionId,
                    inspection_date: (inspectionData as any).inspectionDate || (inspectionData as any).inspection_date || null,
                    end_date: (inspectionData as any).endDate || (inspectionData as any).end_date || null,
                    project_name: (inspectionData as any).projectName || (inspectionData as any).project_name || null,
                    shop_number: (inspectionData as any).shopNumber || (inspectionData as any).shop_number || null,
                    shop_name: (inspectionData as any).shopName || (inspectionData as any).shop_name || null,
                    inspector_name: (inspectionData as any).inspectorName || (inspectionData as any).inspector_name || null,
                    client_rep: (inspectionData as any).clientRep || (inspectionData as any).client_rep || null,
                    consultant: (inspectionData as any).consultant || (inspectionData as any).Consultant || null,
                    contractor: (inspectionData as any).contractor || (inspectionData as any).Contractor || null,
                    testing_party: (inspectionData as any).testingParty || (inspectionData as any).testing_party || null,
                    location: (inspectionData as any).location || (inspectionData as any).Location || null,
                  };

                  await supabase.from('inspections').insert([inspectionInsertData]);
                  inspectionsCount++;
                } catch (inspectionError) {
                  console.error('Inspection migration error:', inspectionError);
                }
              }
            }
          }
        } catch (siteError) {
          console.error('Site migration error:', siteError);
        }
      }
    }

    onProgress?.('Migration completed successfully!');

    return {
      success: true,
      clientId: newClient.id,
      sitesCount,
      subsectionsCount,
      inspectionsCount,
      documentsCount,
    };
  } catch (error) {
    console.error('Migration error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Fetch all clients from Firebase
 */
export const fetchFirebaseClients = async (): Promise<Array<ReturnType<typeof transformFirebaseClient> & { _rawData: Record<string, any>; sitesCount: number }>> => {
  try {
    const data = await readFirebaseData('/clients') as Record<string, any> | null;
    if (!data) {
      console.log('No Firebase clients data found');
      return [];
    }

    console.log('Firebase clients data:', Object.keys(data));

    // Transform Firebase object to array
    return Object.entries(data).map(([id, clientData]) => {
      const clientDataObj = clientData as Record<string, any>;
      
      // Use the EXACT same logic as ClientSites page to count sites
      const allKeys = Object.keys(clientDataObj);
      
      // Filter to find site keys - exclude known client-level properties
      const siteKeys = allKeys.filter(key => 
        !['name', 'clientName', 'Name', 'email', 'phone', 'logo', 'logoUrl', 'created', 'updated'].some(excludeKey => 
          key.toLowerCase().includes(excludeKey.toLowerCase())
        ) && 
        key.length > 3 &&
        typeof clientDataObj[key] === 'object' && 
        clientDataObj[key] !== null
      );
      
      const sitesCount = siteKeys.length;
      
      console.log(`Client "${id}":`, {
        totalKeys: allKeys.length,
        siteKeys: siteKeys,
        sitesCount: sitesCount
      });
      
      return {
        ...transformFirebaseClient(id, clientDataObj),
        _rawData: clientDataObj,
        sitesCount,
      };
    });
  } catch (error) {
    console.error('Error fetching Firebase clients:', error);
    return [];
  }
};

/**
 * Bulk migrate all Firebase clients
 */
export const migrateAllFromFirebase = async (
  onProgress?: (progress: MigrationProgress) => void
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const firebaseClients = await fetchFirebaseClients();
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (let i = 0; i < firebaseClients.length; i++) {
    const client = firebaseClients[i];
    const percentage = Math.round(((i + 1) / firebaseClients.length) * 100);

    onProgress?.(
{
      currentEntity: client.name,
      percentage,
      itemsMigrated: i + 1,
      totalItems: firebaseClients.length,
      errors: results.errors,
    });

    const result = await migrateClientToSupabase(
      client.firebaseId,
      client._rawData,
      (message) => console.log(message)
    );

    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push(`${client.name}: ${result.error}`);
    }
  }

  return results;
};

/**
 * Migrate app settings from Firebase to Supabase
 */
export const migrateAppSettings = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const firebaseConfig = await readFirebaseData('/app_config') as Record<string, any> | null;
    
    if (!firebaseConfig) {
      return { success: false, error: 'No Firebase config found' };
    }

    // Check if settings already exist
    const { data: existingSettings } = await supabase
      .from('settings')
      .select('id')
      .maybeSingle();

    const settingsData = {
      company_name: firebaseConfig.company_name || firebaseConfig.companyName || 'Watson Mattheus',
      company_logo_url: firebaseConfig.company_logo_url || firebaseConfig.companyLogoUrl || null,
      login_hero_image_url: firebaseConfig.login_hero_image_url || firebaseConfig.loginHeroImageUrl || null,
      primary_color: firebaseConfig.primary_color || firebaseConfig.primaryColor || '#3B82F6',
      google_drive_connected: firebaseConfig.google_drive_connected ?? firebaseConfig.googleDriveConnected ?? false,
    };

    if (existingSettings) {
      // Update existing settings
      const { error } = await supabase
        .from('settings')
        .update(settingsData)
        .eq('id', existingSettings.id);

      if (error) {
        return { success: false, error: error.message };
      }
    } else {
      // Insert new settings
      const { error } = await supabase
        .from('settings')
        .insert([settingsData]);

      if (error) {
        return { success: false, error: error.message };
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Settings migration error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Migrate users from Firebase to pending invites table (without sending invites)
 */
export const migrateUsers = async (
  users: Array<{id: string; email: string; name: string}>
): Promise<{ success: boolean; migratedCount: number; skipped: number; error?: string }> => {
  try {
    let migratedCount = 0;
    let skipped = 0;

    for (const user of users) {
      try {
        if (!user.email) {
          console.warn(`Skipping user ${user.id}: No email`);
          skipped++;
          continue;
        }

        // Check if already in pending invites or has profile
        const { data: existingPending } = await supabase
          .from('pending_user_invites')
          .select('id')
          .eq('email', user.email)
          .maybeSingle();

        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', user.email)
          .maybeSingle();

        if (existingPending || existingProfile) {
          console.log(`User already exists: ${user.email}`);
          skipped++;
          continue;
        }

        // Add to pending invites table
        const { error } = await supabase
          .from('pending_user_invites')
          .insert([{
            firebase_id: user.id,
            email: user.email,
            full_name: user.name || ''
          }]);

        if (!error) {
          migratedCount++;
          console.log(`Added pending invite for: ${user.email}`);
        } else {
          console.error('Pending invite creation error:', error);
          skipped++;
        }
      } catch (error) {
        console.error('Error migrating user:', user.id, error);
        skipped++;
      }
    }

    return {
      success: true,
      migratedCount,
      skipped,
    };
  } catch (error) {
    console.error('Users migration error:', error);
    return {
      success: false,
      migratedCount: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Send invite to a specific user email
 */
export const sendUserInvite = async (email: string, fullName: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          full_name: fullName,
        },
        redirectTo: `${window.location.origin}/`
      }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    // Update pending invite status
    await supabase
      .from('pending_user_invites')
      .update({ invited_at: new Date().toISOString() })
      .eq('email', email);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Migrate calendar events from Firebase to Supabase
 */
export const migrateCalendarEvents = async (): Promise<{ success: boolean; migratedCount: number; skipped: number; error?: string }> => {
  try {
    const firebaseEvents = await readFirebaseData('/scheduleEvents') as Record<string, any> | null;
    
    if (!firebaseEvents) {
      return { success: true, migratedCount: 0, skipped: 0 };
    }

    let migratedCount = 0;
    let skipped = 0;

    for (const [eventId, eventData] of Object.entries(firebaseEvents)) {
      try {
        // Extract and validate start_date (REQUIRED field)
        const startDate = (eventData as any).startDate || (eventData as any).start_date || (eventData as any).date;
        
        // Skip events without a valid start date since it's required
        if (!startDate) {
          console.warn(`Skipping event ${eventId}: No start date found`);
          skipped++;
          continue;
        }

        const eventInsertData = {
          title: (eventData as any).title || (eventData as any).name || 'Unnamed Event',
          site_name: (eventData as any).siteName || (eventData as any).site_name || (eventData as any).site || 'Unknown Site',
          start_date: startDate,
          end_date: (eventData as any).endDate || (eventData as any).end_date || startDate, // Default to start_date if no end_date
          status: (eventData as any).status || (eventData as any).Status || 'Scheduled',
          event_type: (eventData as any).eventType || (eventData as any).event_type || (eventData as any).type || null,
          priority: (eventData as any).priority || (eventData as any).Priority || 'High',
        };

        const { error } = await supabase
          .from('calendar_events')
          .insert([eventInsertData]);

        if (!error) {
          migratedCount++;
        } else {
          console.error('Calendar event migration error:', error);
          skipped++;
        }
      } catch (error) {
        console.error('Error migrating event:', eventId, error);
        skipped++;
      }
    }

    return {
      success: true,
      migratedCount,
      skipped,
    };
  } catch (error) {
    console.error('Calendar events migration error:', error);
    return {
      success: false,
      migratedCount: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
