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
    if (firebaseData.sites || firebaseData.Sites) {
      onProgress?.('Migrating sites...');
      const sites = firebaseData.sites || firebaseData.Sites;
      
      for (const [siteId, siteData] of Object.entries(sites || {})) {
        try {
          const siteInsertData = {
            name: (siteData as any).name || (siteData as any).siteName || (siteData as any).Name || 'Unnamed Site',
            address: (siteData as any).address || (siteData as any).Address || null,
            site_type: (siteData as any).siteType || (siteData as any).site_type || (siteData as any).type || null,
            client_id: newClient.id,
            firebase_id: siteId,
            created_by: user.id,
            supply_authority: (siteData as any).supplyAuthority || (siteData as any).supply_authority || null,
            nominated_max_demand: (siteData as any).nominatedMaxDemand || (siteData as any).nominated_max_demand || null,
            consultant_name: (siteData as any).consultantName || (siteData as any).consultant_name || null,
            consultant_company: (siteData as any).consultantCompany || (siteData as any).consultant_company || null,
            consultant_contact: (siteData as any).consultantContact || (siteData as any).consultant_contact || null,
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
      
      // Check multiple possible field names for sites
      const sites = clientDataObj.sites || 
                   clientDataObj.Sites || 
                   clientDataObj.SITES ||
                   {};
      
      const sitesCount = typeof sites === 'object' && sites !== null 
        ? Object.keys(sites).length 
        : 0;
      
      console.log(`Client ${id}: Found ${sitesCount} sites`, Object.keys(sites));
      
      return {
        ...transformFirebaseClient(id, clientDataObj),
        _rawData: clientDataObj, // Keep raw data for migration
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
