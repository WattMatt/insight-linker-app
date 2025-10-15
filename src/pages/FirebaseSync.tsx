import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { readFirebaseData } from "@/lib/firebase";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, AlertCircle, FileText, Image as ImageIcon, Database } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { MeticulousMigration } from "@/lib/meticulousMigration";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MigrationSelector } from "@/components/MigrationSelector";

interface MigrationStatus {
  clients: {
    firebase: number;
    supabase: number;
    toMigrate: string[];
  };
  sites: {
    firebase: number;
    supabase: number;
  };
  subsections: {
    firebase: number;
    supabase: number;
  };
  users: {
    firebase: number;
    supabase: number;
    toMigrate: Array<{id: string; email: string; name: string}>;
  };
  calendarEvents: {
    firebase: number;
    supabase: number;
    toMigrate: number;
  };
  settings: {
    hasFirebaseConfig: boolean;
    hasSupabaseConfig: boolean;
    needsUpdate: boolean;
  };
  storage: {
    clientLogos: {
      firebase: number;
      supabase: number;
    };
    siteImages: {
      firebase: number;
      supabase: number;
    };
    siteDocuments: {
      firebase: number;
      supabase: number;
    };
    subsectionDocuments: {
      firebase: number;
      supabase: number;
    };
    inspectionPhotos: {
      firebase: number;
      supabase: number;
    };
  };
}

interface MigrationProgress {
  stage: string;
  current: number;
  total: number;
  percentage: number;
  currentItem: string;
}

const FirebaseSync = () => {
  const [scanning, setScanning] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migratingSection, setMigratingSection] = useState<string | null>(null);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [migrationComplete, setMigrationComplete] = useState(false);
  const [storageMigrationStats, setStorageMigrationStats] = useState({
    total: 0,
    migrated: 0,
    failed: 0,
  });
  const [migrationLogs, setMigrationLogs] = useState<Array<{
    timestamp: string;
    level: 'info' | 'success' | 'warning' | 'error';
    message: string;
  }>>([]);
  const [migrationPreview, setMigrationPreview] = useState<{
    templates: Array<{id: string; name: string; category: string}>;
    subsectionMatches: Array<{subsection: string; template: string | null; category: string}>;
    documentCategories: Set<string>;
    inspectionTypes: Set<string>;
  } | null>(null);

  const extractFileUrls = (obj: any, urls: Array<{url: string; type: string; path: string}> = [], path: string = ''): Array<{url: string; type: string; path: string}> => {
    if (!obj || typeof obj !== 'object') return urls;

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (typeof value === 'string') {
        // Check if it's a Firebase Storage URL or any URL pointing to an image/document
        if (value.startsWith('http') && (
          value.includes('firebasestorage.googleapis.com') ||
          value.includes('firebase') ||
          /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx)(\?|$)/i.test(value)
        )) {
          const type = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(value) ? 'image' : 'document';
          urls.push({ url: value, type, path: currentPath });
        }
      } else if (typeof value === 'object') {
        extractFileUrls(value, urls, currentPath);
      }
    }
    
    return urls;
  };

  const scanComplete = async () => {
    setScanning(true);
    try {
      toast.info("Scanning Firebase and Supabase...");
      
      // Fetch inspection templates for preview
      const { data: templates } = await supabase
        .from('inspection_templates')
        .select('id, name, category');
      
      // Scan Firebase
      const firebaseData = await readFirebaseData("/clients");
      const firebaseEvents = await readFirebaseData("/scheduleEvents");
      const firebaseUsers = await readFirebaseData("/users");
      const firebaseConfig = await readFirebaseData("/app_config");
      
      // Analyze migration data for preview
      const documentCategories = new Set<string>();
      const inspectionTypes = new Set<string>();
      const subsectionMatches: Array<{subsection: string; template: string | null; category: string}> = [];
      
      if (firebaseData) {
        for (const [clientId, clientData] of Object.entries(firebaseData)) {
          if (typeof clientData === 'object' && clientData !== null) {
            for (const [siteKey, siteData] of Object.entries(clientData as Record<string, any>)) {
              // Skip client-level properties
              if (['name', 'clientName', 'email', 'phone', 'logo', 'logoUrl'].some(prop => 
                siteKey.toLowerCase().includes(prop.toLowerCase()))) continue;
              
              if (typeof siteData === 'object' && siteData !== null) {
                const siteObj = siteData as Record<string, any>;
                // Check for documents
                const docs = siteObj.documents || siteObj.Documents || siteObj.files || siteObj.Files;
                if (docs && typeof docs === 'object') {
                  Object.keys(docs).forEach(catKey => documentCategories.add(catKey));
                }
                
                // Check subsections
                const subsections = siteObj.subsections;
                if (subsections && typeof subsections === 'object') {
                  for (const [subId, subData] of Object.entries(subsections as Record<string, any>)) {
                    const subObj = subData as Record<string, any>;
                    const category = subObj?.category || subObj?.Category;
                    const inspType = subObj?.inspectionType || subObj?.inspection_type;
                    
                    // Check inspections for templateId (primary source)
                    let detectedTemplateId: string | null = null;
                    const inspections = subObj?.inspections || subObj?.Inspections;
                    if (inspections && typeof inspections === 'object') {
                      for (const [inspId, inspData] of Object.entries(inspections as Record<string, any>)) {
                        const inspObj = inspData as Record<string, any>;
                        const templateId = inspObj?.templateId || inspObj?.template_id || inspObj?.TemplateId;
                        if (templateId) {
                          detectedTemplateId = templateId;
                          inspectionTypes.add(templateId);
                          break;
                        }
                      }
                    }
                    
                    if (inspType && !detectedTemplateId) inspectionTypes.add(inspType);
                    
                    // Find matching template - prefer templateId from inspections
                    const searchTerm = detectedTemplateId || inspType || category;
                    const matchedTemplate = searchTerm && templates ? 
                      templates.find(t => 
                        t.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        t.name?.toLowerCase().includes(searchTerm.toLowerCase())
                      ) : 
                      null;
                    
                    subsectionMatches.push({
                      subsection: subObj?.name || subObj?.Name || subId,
                      template: matchedTemplate?.name || null,
                      category: detectedTemplateId || category || 'Unknown'
                    });
                  }
                }
              }
            }
          }
        }
      }
      
      setMigrationPreview({
        templates: templates || [],
        subsectionMatches: subsectionMatches.slice(0, 10), // Show first 10 for preview
        documentCategories,
        inspectionTypes
      });
      
      if (!firebaseData) {
        toast.error("No data found in Firebase");
        return;
      }

      const firebaseClients = Object.keys(firebaseData);
      const firebaseEventsCount = firebaseEvents ? Object.keys(firebaseEvents).length : 0;
      const firebaseUsersData = firebaseUsers ? Object.entries(firebaseUsers).map(([id, data]: [string, any]) => ({
        id,
        email: data.email || data.Email || '',
        name: data.name || data.displayName || data.Name || data.full_name || ''
      })) : [];
      const hasFirebaseConfig = !!firebaseConfig;
      
      // Extract all file URLs from Firebase
      const allFileUrls = extractFileUrls(firebaseData);
      const imageUrls = allFileUrls.filter(f => f.type === 'image');
      const documentUrls = allFileUrls.filter(f => f.type === 'document');
      
      // Count Firebase entities
      let firebaseSitesCount = 0;
      let firebaseSubsectionsCount = 0;
      
      for (const [clientId, clientData] of Object.entries(firebaseData)) {
        if (typeof clientData === 'object' && clientData !== null) {
          // Count sites (direct children that are not client properties)
          const clientLevelProps = ['name', 'clientName', 'email', 'phone', 'logo', 'logoUrl'];
          const siteKeys = Object.keys(clientData).filter(key => 
            !clientLevelProps.some(prop => key.toLowerCase().includes(prop.toLowerCase()))
          );
          firebaseSitesCount += siteKeys.length;
          
          // Count subsections
          for (const siteKey of siteKeys) {
            const siteData = (clientData as any)[siteKey];
            if (siteData?.subsections) {
              firebaseSubsectionsCount += Object.keys(siteData.subsections).length;
            }
          }
        }
      }

      // Scan Supabase
      const { data: supabaseClients } = await supabase
        .from('clients')
        .select('firebase_id, logo_url');
      
      const { data: supabaseSites } = await supabase
        .from('sites')
        .select('firebase_id, site_image_url');
      
      const { data: supabaseSiteDocuments } = await supabase
        .from('site_documents')
        .select('id');
      
      const { data: supabaseSubsectionDocuments } = await supabase
        .from('subsection_documents')
        .select('id');
      
      const { data: supabaseInspectionItems } = await supabase
        .from('inspection_items')
        .select('id')
        .not('image_url', 'is', null);
      
      const { count: sitesCount } = await supabase
        .from('sites')
        .select('*', { count: 'exact', head: true });
      
      const { count: subsectionsCount } = await supabase
        .from('subsections')
        .select('*', { count: 'exact', head: true });
      
      const { data: supabaseProfiles } = await supabase
        .from('profiles')
        .select('email');
      
      const { data: pendingInvites } = await supabase
        .from('pending_user_invites')
        .select('email');
      
      const { data: supabaseSettings, count: settingsCount } = await supabase
        .from('settings')
        .select('*', { count: 'exact' })
        .maybeSingle();
      
      const { count: calendarEventsCount } = await supabase
        .from('calendar_events')
        .select('*', { count: 'exact', head: true });
      
      // Count storage items from Firebase
      let fbClientLogos = 0;
      let fbSiteImages = 0;
      let fbSiteDocuments = 0;
      let fbSubsectionDocuments = 0;
      let fbInspectionPhotos = 0;
      
      for (const [clientId, clientData] of Object.entries(firebaseData)) {
        if (typeof clientData === 'object' && clientData !== null) {
          const clientObj = clientData as Record<string, any>;
          
          // Count client logos
          if (clientObj.logoUrl || clientObj.logo_url || clientObj.LogoUrl) {
            fbClientLogos++;
          }
          
          for (const [siteKey, siteData] of Object.entries(clientObj)) {
            if (['name', 'clientName', 'email', 'phone', 'logo', 'logoUrl'].some(prop => 
              siteKey.toLowerCase().includes(prop.toLowerCase()))) continue;
            
            if (typeof siteData === 'object' && siteData !== null) {
              const siteObj = siteData as Record<string, any>;
              
              // Count site images
              if (siteObj.siteImageUrl || siteObj.site_image_url || siteObj.imageUrl) {
                fbSiteImages++;
              }
              
              // Count site documents
              const docs = siteObj.documents || siteObj.Documents || siteObj.files || siteObj.Files;
              if (docs && typeof docs === 'object') {
                for (const [categoryKey, categoryData] of Object.entries(docs)) {
                  if (typeof categoryData === 'object' && categoryData !== null) {
                    fbSiteDocuments += Object.keys(categoryData).length;
                  }
                }
              }
              
              // Count subsection documents and inspection photos
              const subsections = siteObj.subsections;
              if (subsections && typeof subsections === 'object') {
                for (const [subId, subData] of Object.entries(subsections as Record<string, any>)) {
                  const subObj = subData as Record<string, any>;
                  
                  // Count subsection documents
                  const subDocs = subObj.documents || subObj.Documents || subObj.files || subObj.Files;
                  if (subDocs && typeof subDocs === 'object') {
                    for (const [catKey, catData] of Object.entries(subDocs)) {
                      if (typeof catData === 'object' && catData !== null) {
                        fbSubsectionDocuments += Object.keys(catData).length;
                      }
                    }
                  }
                  
                  // Count inspection photos
                  const inspections = subObj.inspections || subObj.Inspections;
                  if (inspections && typeof inspections === 'object') {
                    for (const [inspId, inspData] of Object.entries(inspections as Record<string, any>)) {
                      const inspObj = inspData as Record<string, any>;
                      
                      // Count photos in jsonData or other fields
                      const jsonData = inspObj.jsonData;
                      if (jsonData && typeof jsonData === 'object') {
                        const countPhotos = (obj: any): number => {
                          let count = 0;
                          if (obj && typeof obj === 'object') {
                            for (const [key, value] of Object.entries(obj)) {
                              if (key === 'images' && typeof value === 'object') {
                                count += Object.keys(value).length;
                              } else if (typeof value === 'object') {
                                count += countPhotos(value);
                              }
                            }
                          }
                          return count;
                        };
                        fbInspectionPhotos += countPhotos(jsonData);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      const migratedFirebaseIds = new Set(
        (supabaseClients || []).map(c => c.firebase_id).filter(Boolean)
      );
      
      const clientsToMigrate = firebaseClients.filter(
        clientId => !migratedFirebaseIds.has(clientId)
      );

      // Combine profiles and pending invites for user count
      const totalSupabaseUsers = (supabaseProfiles?.length || 0) + (pendingInvites?.length || 0);
      
      const migratedEmails = new Set([
        ...(supabaseProfiles || []).map(p => p.email?.toLowerCase()).filter(Boolean),
        ...(pendingInvites || []).map(p => p.email?.toLowerCase()).filter(Boolean)
      ]);
      
      const usersToMigrate = firebaseUsersData.filter(
        user => user.email && !migratedEmails.has(user.email.toLowerCase())
      );

      const eventsToMigrate = Math.max(0, firebaseEventsCount - (calendarEventsCount || 0));
      
      const hasSupabaseConfig = !!supabaseSettings;
      const needsSettingsUpdate = hasFirebaseConfig && (!hasSupabaseConfig || !supabaseSettings?.company_name);

      const status: MigrationStatus = {
        clients: {
          firebase: firebaseClients.length,
          supabase: supabaseClients?.length || 0,
          toMigrate: clientsToMigrate,
        },
        sites: {
          firebase: firebaseSitesCount,
          supabase: sitesCount || 0,
        },
        subsections: {
          firebase: firebaseSubsectionsCount,
          supabase: subsectionsCount || 0,
        },
        users: {
          firebase: firebaseUsersData.length,
          supabase: totalSupabaseUsers,
          toMigrate: usersToMigrate,
        },
        calendarEvents: {
          firebase: firebaseEventsCount,
          supabase: calendarEventsCount || 0,
          toMigrate: eventsToMigrate,
        },
        settings: {
          hasFirebaseConfig,
          hasSupabaseConfig,
          needsUpdate: needsSettingsUpdate,
        },
        storage: {
          clientLogos: {
            firebase: fbClientLogos,
            supabase: supabaseClients?.filter(c => c.logo_url).length || 0,
          },
          siteImages: {
            firebase: fbSiteImages,
            supabase: supabaseSites?.filter(s => s.site_image_url).length || 0,
          },
          siteDocuments: {
            firebase: fbSiteDocuments,
            supabase: supabaseSiteDocuments?.length || 0,
          },
          subsectionDocuments: {
            firebase: fbSubsectionDocuments,
            supabase: supabaseSubsectionDocuments?.length || 0,
          },
          inspectionPhotos: {
            firebase: fbInspectionPhotos,
            supabase: supabaseInspectionItems?.length || 0,
          },
        },
      };

      setMigrationStatus(status);
      
      toast.success(`Scan complete! Found ${clientsToMigrate.length} clients to migrate`);
      
    } catch (error: any) {
      console.error("Error scanning:", error);
      toast.error(error.message || "Failed to scan");
    } finally {
      setScanning(false);
    }
  };

  const migrateSettings = async () => {
    if (!migrationStatus) return;
    
    setMigratingSection('settings');
    try {
      toast.info("Migrating app settings...");

      const { migrateAppSettings } = await import("@/lib/migration");
      const result = await migrateAppSettings();
      
      if (result.success) {
        toast.success("App settings migrated successfully!");
      } else {
        toast.error(result.error || "Failed to migrate settings");
      }
      
      setTimeout(async () => {
        await scanComplete();
      }, 500);
      
    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.message || "Failed to migrate settings");
    } finally {
      setMigratingSection(null);
    }
  };

  const migrateClients = async () => {
    if (!migrationStatus) return;
    
    setMigratingSection('clients');
    try {
      const { user } = (await supabase.auth.getUser()).data;
      if (!user) {
        toast.error("You must be logged in to migrate data");
        return;
      }

      toast.info("Migrating clients with all associated data...");
      
      const totalClients = migrationStatus.clients.toMigrate.length;
      let completedClients = 0;

      const { migrateClientToSupabase } = await import("@/lib/migration");

      for (const clientId of migrationStatus.clients.toMigrate) {
        setMigrationProgress({
          stage: 'Migrating clients',
          current: completedClients + 1,
          total: totalClients,
          percentage: Math.round(((completedClients + 1) / totalClients) * 100),
          currentItem: clientId,
        });

        await migrateClientToSupabase(
          clientId,
          (message) => {
            console.log(message);
            setMigrationProgress(prev => prev ? { ...prev, currentItem: message } : null);
          }
        );

        completedClients++;
      }

      setMigrationProgress(null);
      toast.success(`Successfully migrated ${completedClients} client(s) with all associated sites and subsections`);
      
      // Give a moment for the toast to show, then refresh
      setTimeout(async () => {
        await scanComplete();
      }, 500);
      
    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.message || "Failed to migrate clients");
    } finally {
      setMigratingSection(null);
    }
  };

  const migrateUsers = async () => {
    if (!migrationStatus) return;
    
    setMigratingSection('users');
    try {
      toast.info("Migrating user profiles...");

      const { migrateUsers: migrateUsersFn } = await import("@/lib/migration");
      const result = await migrateUsersFn(migrationStatus.users.toMigrate);
      
      if (result.migratedCount > 0) {
        const message = result.skipped > 0
          ? `Created ${result.migratedCount} profiles (${result.skipped} skipped). You can send invites from the Users page.`
          : `Created ${result.migratedCount} profiles. You can send invites from the Users page.`;
        toast.success(message);
      } else if (result.skipped > 0) {
        toast.info(`All ${result.skipped} users already have profiles`);
      } else {
        toast.info("No users to migrate");
      }
      
      setTimeout(async () => {
        await scanComplete();
      }, 500);
      
    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.message || "Failed to migrate users");
    } finally {
      setMigratingSection(null);
    }
  };

  const migrateCalendarEventsOnly = async () => {
    if (!migrationStatus) return;
    
    setMigratingSection('calendar');
    try {
      toast.info("Migrating calendar events...");

      const { migrateCalendarEvents } = await import("@/lib/migration");
      const eventsResult = await migrateCalendarEvents();
      
      if (eventsResult.migratedCount > 0) {
        const message = eventsResult.skipped > 0 
          ? `Migrated ${eventsResult.migratedCount} calendar events (${eventsResult.skipped} skipped due to missing dates)`
          : `Migrated ${eventsResult.migratedCount} calendar events`;
        toast.success(message);
      } else if (eventsResult.skipped > 0) {
        toast.warning(`All ${eventsResult.skipped} events were skipped due to missing start dates`);
      } else {
        toast.info("No events to migrate");
      }
      
      // Give a moment for the toast to show, then refresh
      setTimeout(async () => {
        await scanComplete();
      }, 500);
      
    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.message || "Failed to migrate calendar events");
    } finally {
      setMigratingSection(null);
    }
  };

  const executeMeticulousMigration = async () => {
    setMigrating(true);
    setMigrationLogs([]);
    
    try {
      toast.info("Starting meticulous client-by-client migration...");
      
      const migration = new MeticulousMigration((log) => {
        setMigrationLogs(prev => [...prev, log]);
        
        // Show important logs as toasts
        if (log.level === 'error') {
          console.error(log.message, log.data);
        } else if (log.level === 'success' && log.message.includes('created')) {
          // Only toast for major milestones
        }
      });

      const result = await migration.migrateAll();
      
      if (result.success) {
        const stats = migration.getStats();
        toast.success(
          `Migration complete! Clients: ${stats.clients.migrated}/${stats.clients.total}, ` +
          `Sites: ${stats.sites.migrated}/${stats.sites.total}, ` +
          `Subsections: ${stats.subsections.migrated}/${stats.subsections.total}, ` +
          `Images: ${stats.images.migrated}/${stats.images.total}, ` +
          `Documents: ${stats.documents.migrated}/${stats.documents.total}`
        );
        setMigrationComplete(true);
        
        // Refresh scan
        setTimeout(() => scanComplete(), 1000);
      } else {
        toast.error(`Migration failed: ${result.error}`);
      }
      
    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.message || "Failed to complete migration");
    } finally {
      setMigrating(false);
    }
  };

  const migrateSiteDocuments = async () => {
    if (!migrationStatus) return;
    
    setMigratingSection('site_documents');
    try {
      toast.info("Migrating all site documents...");

      // Fetch all clients with firebase_id
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, firebase_id, name')
        .not('firebase_id', 'is', null);

      if (clientsError) throw clientsError;
      if (!clients || clients.length === 0) {
        toast.info("No clients with Firebase ID found");
        return;
      }

      let totalMigrated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      for (const client of clients) {
        // Fetch all sites for this client with firebase_id
        const { data: sites, error: sitesError } = await supabase
          .from('sites')
          .select('id, firebase_id, name')
          .eq('client_id', client.id)
          .not('firebase_id', 'is', null);

        if (sitesError || !sites) continue;

        for (const site of sites) {
          setMigrationProgress({
            stage: 'Migrating site documents',
            current: totalMigrated + totalSkipped + totalErrors,
            total: clients.length * 10, // rough estimate
            percentage: 0,
            currentItem: `${client.name} - ${site.name}`,
          });

          try {
            // Fetch Firebase documents using correct path
            const fbSiteData = await readFirebaseData(`clients/${client.firebase_id}/${site.firebase_id}`);
            if (!fbSiteData) continue;

            const siteDocuments = fbSiteData.documents || fbSiteData.Documents || fbSiteData.files || fbSiteData.Files;
            if (!siteDocuments || typeof siteDocuments !== 'object') continue;

            // Iterate through categories and documents
            for (const [categoryName, categoryDocs] of Object.entries(siteDocuments)) {
              if (!categoryDocs || typeof categoryDocs !== 'object') continue;

              for (const [docKey, docData] of Object.entries(categoryDocs as Record<string, any>)) {
                if (!docData || typeof docData !== 'object' || !(docData as any).url) continue;

                const fbDoc = docData as { url: string; name?: string };

                // Check if already migrated
                const { data: existing } = await supabase
                  .from('site_documents')
                  .select('id')
                  .eq('site_id', site.id)
                  .eq('file_url', fbDoc.url)
                  .maybeSingle();

                if (existing) {
                  totalSkipped++;
                  continue;
                }

                // Migrate the file
                const { data: migrateData, error: migrateError } = await supabase.functions.invoke(
                  'migrate-storage',
                  {
                    body: {
                      firebaseStorageUrl: fbDoc.url,
                      targetBucket: 'documents',
                      targetPath: `sites/${site.id}/${categoryName}/${fbDoc.name || docKey}`
                    }
                  }
                );

                if (migrateError || !migrateData?.publicUrl) {
                  console.error("Failed to migrate file:", migrateError);
                  totalErrors++;
                  continue;
                }

                // Create record in site_documents
                const { error: insertError } = await supabase
                  .from('site_documents')
                  .insert({
                    site_id: site.id,
                    file_name: fbDoc.name || docKey,
                    file_url: migrateData.publicUrl,
                    category: categoryName,
                  });

                if (insertError) {
                  console.error("Failed to insert document record:", insertError);
                  totalErrors++;
                } else {
                  totalMigrated++;
                }
              }
            }
          } catch (error) {
            console.error(`Error migrating documents for site ${site.name}:`, error);
            totalErrors++;
          }
        }
      }

      setMigrationProgress(null);
      toast.success(`Migrated ${totalMigrated} site documents (${totalSkipped} skipped, ${totalErrors} errors)`);
      
      setTimeout(async () => {
        await scanComplete();
      }, 500);
      
    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.message || "Failed to migrate site documents");
    } finally {
      setMigratingSection(null);
    }
  };

  const migrateSubsectionDocuments = async () => {
    if (!migrationStatus) return;
    
    setMigratingSection('subsection_documents');
    try {
      toast.info("Migrating all subsection documents...");

      // Fetch all clients with firebase_id
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, firebase_id, name')
        .not('firebase_id', 'is', null);

      if (clientsError) throw clientsError;
      if (!clients || clients.length === 0) {
        toast.info("No clients with Firebase ID found");
        return;
      }

      let totalMigrated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      for (const client of clients) {
        // Fetch all sites for this client with firebase_id
        const { data: sites, error: sitesError } = await supabase
          .from('sites')
          .select('id, firebase_id, name')
          .eq('client_id', client.id)
          .not('firebase_id', 'is', null);

        if (sitesError || !sites) continue;

        for (const site of sites) {
          // Fetch all subsections for this site with firebase_id
          const { data: subsections, error: subsectionsError } = await supabase
            .from('subsections')
            .select('id, firebase_id, name')
            .eq('site_id', site.id)
            .not('firebase_id', 'is', null);

          if (subsectionsError || !subsections) continue;

          for (const subsection of subsections) {
            setMigrationProgress({
              stage: 'Migrating subsection documents',
              current: totalMigrated + totalSkipped + totalErrors,
              total: clients.length * 20, // rough estimate
              percentage: 0,
              currentItem: `${client.name} - ${site.name} - ${subsection.name}`,
            });

            try {
              // Fetch Firebase documents using correct path
              const fbSubsectionPath = `clients/${client.firebase_id}/${site.firebase_id}/subsections/${subsection.firebase_id}`;
              const fbSubsectionData = await readFirebaseData(fbSubsectionPath);
              if (!fbSubsectionData) continue;

              const subsectionDocuments = fbSubsectionData.documents || fbSubsectionData.Documents || fbSubsectionData.files || fbSubsectionData.Files;
              if (!subsectionDocuments || typeof subsectionDocuments !== 'object') continue;

              // Iterate through categories and documents
              for (const [categoryName, categoryDocs] of Object.entries(subsectionDocuments)) {
                if (!categoryDocs || typeof categoryDocs !== 'object') continue;

                // Get or create document category
                let categoryId: string;
                const { data: existingCategory } = await supabase
                  .from('document_categories')
                  .select('id')
                  .eq('subsection_id', subsection.id)
                  .eq('name', categoryName)
                  .maybeSingle();

                if (existingCategory) {
                  categoryId = existingCategory.id;
                } else {
                  const { data: newCategory, error: categoryError } = await supabase
                    .from('document_categories')
                    .insert({ subsection_id: subsection.id, name: categoryName })
                    .select('id')
                    .single();

                  if (categoryError) {
                    console.error("Failed to create category:", categoryError);
                    continue;
                  }
                  categoryId = newCategory.id;
                }

                for (const [docKey, docData] of Object.entries(categoryDocs as Record<string, any>)) {
                  if (!docData || typeof docData !== 'object' || !(docData as any).url) continue;

                  const fbDoc = docData as { url: string; name?: string };
                  const fileName = fbDoc.name || docKey;

                  // Check if already migrated
                  const { data: existing } = await supabase
                    .from('subsection_documents')
                    .select('id')
                    .eq('subsection_id', subsection.id)
                    .eq('file_name', fileName)
                    .maybeSingle();

                  if (existing) {
                    totalSkipped++;
                    continue;
                  }

                  // Migrate the file using the correct Firebase path structure
                  const { data: migrateData, error: migrateError } = await supabase.functions.invoke(
                    'migrate-storage',
                    {
                      body: {
                        firebaseStorageUrl: fbDoc.url,
                        targetBucket: 'documents',
                        targetPath: `subsections/${subsection.id}/${fileName}`
                      }
                    }
                  );

                  if (migrateError || !migrateData?.publicUrl) {
                    console.error("Failed to migrate file:", fileName, migrateError);
                    totalErrors++;
                    continue;
                  }

                  // Create record in subsection_documents
                  const { error: insertError } = await supabase
                    .from('subsection_documents')
                    .insert({
                      subsection_id: subsection.id,
                      category_id: categoryId,
                      file_name: fileName,
                      file_url: migrateData.publicUrl,
                    });

                  if (insertError) {
                    console.error("Failed to insert document record:", insertError);
                    totalErrors++;
                  } else {
                    totalMigrated++;
                  }
                }
              }
            } catch (error) {
              console.error(`Error migrating documents for subsection ${subsection.name}:`, error);
              totalErrors++;
            }
          }
        }
      }

      setMigrationProgress(null);
      toast.success(`Migrated ${totalMigrated} subsection documents (${totalSkipped} skipped, ${totalErrors} errors)`);
      
      setTimeout(async () => {
        await scanComplete();
      }, 500);
      
    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.message || "Failed to migrate subsection documents");
    } finally {
      setMigratingSection(null);
    }
  };

  const migrateInspections = async () => {
    if (!migrationStatus) return;
    
    setMigratingSection('inspections');
    try {
      toast.info("Migrating all inspections...");

      // Fetch all clients with firebase_id
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, firebase_id, name')
        .not('firebase_id', 'is', null);

      if (clientsError) throw clientsError;
      if (!clients || clients.length === 0) {
        toast.info("No clients with Firebase ID found");
        return;
      }

      let totalMigrated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      for (const client of clients) {
        // Fetch all sites for this client with firebase_id
        const { data: sites, error: sitesError } = await supabase
          .from('sites')
          .select('id, firebase_id, name')
          .eq('client_id', client.id)
          .not('firebase_id', 'is', null);

        if (sitesError || !sites) continue;

        for (const site of sites) {
          // Fetch all subsections for this site with firebase_id
          const { data: subsections, error: subsectionsError } = await supabase
            .from('subsections')
            .select('id, firebase_id, name')
            .eq('site_id', site.id)
            .not('firebase_id', 'is', null);

          if (subsectionsError || !subsections) continue;

          for (const subsection of subsections) {
            setMigrationProgress({
              stage: 'Migrating inspections',
              current: totalMigrated + totalSkipped + totalErrors,
              total: clients.length * 20,
              percentage: 0,
              currentItem: `${client.name} - ${site.name} - ${subsection.name}`,
            });

            try {
              // Fetch Firebase inspections using correct path
              const fbInspectionsPath = `clients/${client.firebase_id}/${site.firebase_id}/subsections/${subsection.firebase_id}/inspections`;
              const fbInspections = await readFirebaseData(fbInspectionsPath);
              if (!fbInspections || typeof fbInspections !== 'object') continue;

              for (const [inspectionKey, inspectionData] of Object.entries(fbInspections)) {
                if (!inspectionData || typeof inspectionData !== 'object') continue;

                const inspection: any = inspectionData;

                // Check if already migrated by firebase_id
                const { data: existing } = await supabase
                  .from('inspections')
                  .select('id')
                  .eq('firebase_id', inspectionKey)
                  .maybeSingle();

                if (existing) {
                  totalSkipped++;
                  continue;
                }

                // Find or create template
                let templateId: string | null = null;
                if (inspection.type || inspection.templateName) {
                  const templateName = inspection.templateName || inspection.type;
                  const { data: template } = await supabase
                    .from('inspection_templates')
                    .select('id')
                    .ilike('name', `%${templateName}%`)
                    .maybeSingle();

                  if (template) {
                    templateId = template.id;
                  }
                }

                // Insert inspection into Supabase
                const { error: insertError } = await supabase
                  .from('inspections')
                  .insert({
                    firebase_id: inspectionKey,
                    site_id: site.id,
                    subsection_id: subsection.id,
                    title: inspection.projectName || inspection.title || 'Imported Inspection',
                    description: inspection.shopName || inspection.description || null,
                    inspection_date: inspection.date || inspection.inspectionDate || new Date().toISOString().split('T')[0],
                    status: inspection.type || inspection.status || 'Pending',
                    template_id: templateId,
                    project_name: inspection.projectName || null,
                    shop_number: inspection.shopNumber || null,
                    shop_name: inspection.shopName || null,
                    inspector_name: inspection.inspectorName || null,
                    client_rep: inspection.clientRep || null,
                    consultant: inspection.consultant || null,
                    contractor: inspection.contractor || null,
                    testing_party: inspection.testingParty || null,
                    location: inspection.location || null,
                    json_data: inspection.sections || inspection.jsonData || {},
                  });

                if (insertError) {
                  console.error("Failed to insert inspection:", insertError);
                  totalErrors++;
                } else {
                  totalMigrated++;
                }
              }
            } catch (error) {
              console.error(`Error migrating inspections for subsection ${subsection.name}:`, error);
              totalErrors++;
            }
          }
        }
      }

      setMigrationProgress(null);
      toast.success(`Migrated ${totalMigrated} inspections (${totalSkipped} skipped, ${totalErrors} errors)`);
      
      setTimeout(async () => {
        await scanComplete();
      }, 500);
      
    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.message || "Failed to migrate inspections");
    } finally {
      setMigratingSection(null);
    }
  };

  const migrateStorageOnly = async () => {
    setMigratingSection('storage');
    setStorageMigrationStats({ total: 0, migrated: 0, failed: 0 });

    try {
      toast.info("Reading Firebase data for all files and images...");

      // Get all data from Supabase
      const { data: supabaseSites } = await supabase.from("sites").select("id, firebase_id, client_id");
      const { data: supabaseClients } = await supabase.from("clients").select("id, firebase_id, logo_url");
      const { data: supabaseSubsections } = await supabase.from("subsections").select("id, firebase_id, site_id");
      
      // Read Firebase data to get actual image URLs
      const firebaseData = await readFirebaseData("/clients");
      if (!firebaseData) {
        toast.error("No Firebase data found");
        return;
      }

      const imagesToMigrate: {
        url: string;
        bucket: string;
        fileName: string;
        table: string;
        id: string;
        column: string;
        type?: string;
        metadata?: any;
      }[] = [];

      console.log("Starting storage scan...");

      // Get existing files to prevent duplicates
      const { data: existingClientLogos } = await supabase
        .from('clients')
        .select('id, firebase_id, logo_url')
        .not('logo_url', 'is', null);
      
      const { data: existingSiteImages } = await supabase
        .from('sites')
        .select('id, firebase_id, site_image_url')
        .not('site_image_url', 'is', null);
      
      const { data: existingSiteDocs } = await supabase
        .from('site_documents')
        .select('site_id, file_url');
      
      const { data: existingSubsectionDocs } = await supabase
        .from('subsection_documents')
        .select('subsection_id, file_url');
      
      // Create sets for quick lookup
      const migratedLogoUrls = new Set(existingClientLogos?.map(c => c.logo_url?.split('/').pop()) || []);
      const migratedSiteImageUrls = new Set(existingSiteImages?.map(s => s.site_image_url?.split('/').pop()) || []);
      const migratedSiteDocUrls = new Set(existingSiteDocs?.map(d => d.file_url?.split('/').pop()) || []);
      const migratedSubDocUrls = new Set(existingSubsectionDocs?.map(d => d.file_url?.split('/').pop()) || []);

      // Collect client logos from Firebase
      supabaseClients?.forEach(client => {
        if (client.firebase_id && !client.logo_url) {
          const fbClientData = firebaseData[client.firebase_id];
          const logoUrl = fbClientData?.logoUrl || fbClientData?.logo_url || fbClientData?.LogoUrl;
          
          if (logoUrl && logoUrl.includes('firebase')) {
            imagesToMigrate.push({
              url: logoUrl,
              bucket: 'client-logos',
              fileName: `${client.id}/logo-${Date.now()}.png`,
              table: 'clients',
              id: client.id,
              column: 'logo_url',
            });
          }
        }
      });

      // Collect site images from Firebase
      supabaseSites?.forEach(site => {
        if (site.firebase_id) {
          // Find the client this site belongs to
          const client = supabaseClients?.find(c => c.id === site.client_id);
          if (!client?.firebase_id) return;
          
          const fbClientData = firebaseData[client.firebase_id];
          if (!fbClientData) return;

          // Look for site data in Firebase - check multiple possible locations
          let siteData = null;
          
          // Try sites object first
          if (fbClientData.sites && fbClientData.sites[site.firebase_id]) {
            siteData = fbClientData.sites[site.firebase_id];
          } else if (fbClientData.Sites && fbClientData.Sites[site.firebase_id]) {
            siteData = fbClientData.Sites[site.firebase_id];
          } else if (fbClientData[site.firebase_id]) {
            // Site might be a direct child
            siteData = fbClientData[site.firebase_id];
          }

          if (siteData) {
            console.log(`Scanning site ${site.firebase_id}:`, {
              hasImage: !!(siteData.siteImageUrl || siteData.site_image_url || siteData.imageUrl || siteData.image),
              hasLogo: !!(siteData.clientLogoUrl || siteData.client_logo_url),
              hasSubsections: !!(siteData.subsections || siteData.Subsections),
              hasDocuments: !!(siteData.documents || siteData.Documents),
              keys: Object.keys(siteData)
            });
            
            // Check for site image - try all possible field names
            const siteImageUrl = siteData.siteImageUrl || 
                                siteData.site_image_url || 
                                siteData.imageUrl || 
                                siteData.image ||
                                siteData.siteImage ||
                                siteData.Image;
            
            if (siteImageUrl && typeof siteImageUrl === 'string' && siteImageUrl.includes('firebase')) {
              console.log(`✓ Found site image for ${site.firebase_id}: ${siteImageUrl}`);
              imagesToMigrate.push({
                url: siteImageUrl,
                bucket: 'site-images',
                fileName: `${site.id}/site-image-${Date.now()}.png`,
                table: 'sites',
                id: site.id,
                column: 'site_image_url',
                type: 'site_image',
              });
            }

            // Check for client logo at site level
            const clientLogoUrl = siteData.clientLogoUrl || 
                                 siteData.client_logo_url || 
                                 siteData.clientLogo ||
                                 siteData.logo;
            
            if (clientLogoUrl && typeof clientLogoUrl === 'string' && clientLogoUrl.includes('firebase')) {
              console.log(`✓ Found client logo for ${site.firebase_id}: ${clientLogoUrl}`);
              imagesToMigrate.push({
                url: clientLogoUrl,
                bucket: 'client-logos',
                fileName: `${site.id}/logo-${Date.now()}.png`,
                table: 'sites',
                id: site.id,
                column: 'client_logo_url',
                type: 'client_logo',
              });
            }

            // Check for subsections with images and documents
            const subsections = siteData.subsections || siteData.Subsections;
            if (subsections && typeof subsections === 'object') {
              console.log(`Scanning ${Object.keys(subsections).length} subsections for ${site.firebase_id}`);
              
              Object.entries(subsections).forEach(([subsectionFbId, subsectionData]: [string, any]) => {
                // Find matching Supabase subsection
                const supabaseSubsection = supabaseSubsections?.find(
                  sub => sub.firebase_id === subsectionFbId && sub.site_id === site.id
                );

                if (supabaseSubsection && subsectionData) {
                  // Migrate inspection photos - check all possible structures
                  const inspections = subsectionData.inspections || 
                                     subsectionData.Inspections || 
                                     subsectionData.inspection ||
                                     subsectionData.Inspection;
                  
                  if (inspections && typeof inspections === 'object') {
                    Object.entries(inspections).forEach(([inspFbId, inspData]: [string, any]) => {
                      // Check for photos in jsonData structure (new format)
                      const jsonData = inspData?.jsonData;
                      if (jsonData && typeof jsonData === 'object') {
                        Object.entries(jsonData).forEach(([sectionKey, sectionData]: [string, any]) => {
                          if (sectionData && typeof sectionData === 'object') {
                            Object.entries(sectionData).forEach(([itemKey, itemData]: [string, any]) => {
                              const photos = itemData?.photos;
                              if (Array.isArray(photos)) {
                                photos.forEach((photoUrl: string, photoIdx: number) => {
                                  if (photoUrl && photoUrl.includes('firebase')) {
                                    console.log(`✓ Found inspection photo in ${subsectionFbId}/${inspFbId}/${sectionKey}/${itemKey}`);
                                     imagesToMigrate.push({
                                       url: photoUrl,
                                       bucket: 'inspection-photos',
                                       fileName: `${supabaseSubsection.id}/${inspFbId}/${sectionKey}-${itemKey}-${photoIdx}.jpg`,
                                       table: 'temp_inspection_photos',
                                       id: `${supabaseSubsection.id}/${inspFbId}/${sectionKey}/${itemKey}`,
                                       column: 'photo_url',
                                       type: 'inspection_photo',
                                       metadata: { inspectionFbId: inspFbId, sectionKey, itemKey, index: photoIdx }
                                     });
                                  }
                                });
                              }
                            });
                          }
                        });
                      }
                      
                      // Also check old photos structure for backwards compatibility
                      const photos = inspData?.photos || inspData?.Photos || inspData?.images || inspData?.Images;
                      
                      if (photos && typeof photos === 'object') {
                        Object.entries(photos).forEach(([photoId, photoData]: [string, any]) => {
                          const photoUrl = photoData?.url || 
                                         photoData?.imageUrl || 
                                         photoData?.downloadUrl ||
                                         photoData?.URL;
                          
                          if (photoUrl && typeof photoUrl === 'string' && photoUrl.includes('firebase')) {
                            console.log(`✓ Found legacy inspection photo in ${subsectionFbId}: ${photoUrl}`);
                            imagesToMigrate.push({
                               url: photoUrl,
                               bucket: 'inspection-photos',
                               fileName: `${supabaseSubsection.id}/${inspFbId}-${photoId}.png`,
                               table: 'temp_inspection_photos',
                               id: `${supabaseSubsection.id}/${inspFbId}`,
                               column: 'image_url',
                               type: 'inspection_photo',
                               metadata: { inspectionFbId: inspFbId }
                             });
                          }
                        });
                      }
                    });
                  }

                  // Migrate subsection documents
                  const documents = subsectionData.documents || 
                                   subsectionData.Documents || 
                                   subsectionData.files ||
                                   subsectionData.Files;
                  
                  if (documents && typeof documents === 'object') {
                    console.log(`Found ${Object.keys(documents).length} document categories in subsection ${subsectionFbId}`);
                    
                    Object.entries(documents).forEach(([categoryName, categoryDocs]: [string, any]) => {
                      if (categoryDocs && typeof categoryDocs === 'object') {
                        Object.entries(categoryDocs).forEach(([docFbId, docData]: [string, any]) => {
                          const docUrl = docData?.url || 
                                        docData?.fileUrl || 
                                        docData?.downloadUrl ||
                                        docData?.URL ||
                                        (typeof docData === 'string' ? docData : null);
                          
                          const fileName = docData?.name || 
                                          docData?.fileName || 
                                          docData?.file_name ||
                                          docFbId;
                          
                          // Extract clean filename
                          const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
                          
                          // Skip if already migrated
                          if (migratedSubDocUrls.has(cleanFileName)) {
                            console.log(`Skipping already migrated subsection doc: ${cleanFileName}`);
                            return;
                          }
                          
                          if (docUrl && typeof docUrl === 'string' && docUrl.includes('firebase')) {
                            console.log(`✓ Found subsection document in ${subsectionFbId}/${categoryName}: ${docUrl}`);
                            imagesToMigrate.push({
                              url: docUrl,
                              bucket: 'documents',
                              fileName: `subsections/${supabaseSubsection.id}/${cleanFileName}`,
                              table: 'subsection_documents',
                              id: supabaseSubsection.id,
                              column: 'file_url',
                              type: 'subsection_document',
                              metadata: { categoryName, originalFileName: fileName }
                            });
                          }
                        });
                      }
                    });
                  }
                }
              });
            }

            // Check for site-level documents
            const siteDocuments = siteData.documents || 
                                 siteData.Documents || 
                                 siteData.files ||
                                 siteData.Files;
            
            if (siteDocuments && typeof siteDocuments === 'object') {
              console.log(`Found ${Object.keys(siteDocuments).length} document categories for site ${site.firebase_id}`);
              
              Object.entries(siteDocuments).forEach(([categoryName, categoryDocs]: [string, any]) => {
                if (categoryDocs && typeof categoryDocs === 'object') {
                  Object.entries(categoryDocs).forEach(([docFbId, docData]: [string, any]) => {
                    const docUrl = docData?.url || 
                                  docData?.fileUrl || 
                                  docData?.downloadUrl ||
                                  docData?.URL ||
                                  (typeof docData === 'string' ? docData : null);
                    
                    const fileName = docData?.name || 
                                    docData?.fileName || 
                                    docData?.file_name ||
                                    docFbId;
                    
                    // Extract clean filename
                    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
                    
                    // Skip if already migrated
                    if (migratedSiteDocUrls.has(cleanFileName)) {
                      console.log(`Skipping already migrated site doc: ${cleanFileName}`);
                      return;
                    }
                    
                    if (docUrl && typeof docUrl === 'string' && docUrl.includes('firebase')) {
                      console.log(`✓ Found site document for ${site.firebase_id}/${categoryName}: ${docUrl}`);
                      imagesToMigrate.push({
                        url: docUrl,
                        bucket: 'documents',
                        fileName: `sites/${site.id}/${cleanFileName}`,
                        table: 'site_documents',
                        id: site.id,
                        column: 'file_url',
                        type: 'site_document',
                        metadata: { categoryName, originalFileName: fileName }
                      });
                    }
                  });
                }
              });
            }
          }
        }
      });

      console.log(`\n=== Migration Summary ===`);
      console.log(`Total files found: ${imagesToMigrate.length}`);
      console.log(`- Site images: ${imagesToMigrate.filter(f => f.type === 'site_image').length}`);
      console.log(`- Client logos: ${imagesToMigrate.filter(f => f.type === 'client_logo').length}`);
      console.log(`- Inspection photos: ${imagesToMigrate.filter(f => f.type === 'inspection_photo').length}`);
      console.log(`- Site documents: ${imagesToMigrate.filter(f => f.type === 'site_document').length}`);
      console.log(`- Subsection documents: ${imagesToMigrate.filter(f => f.type === 'subsection_document').length}`);

      setStorageMigrationStats(prev => ({ ...prev, total: imagesToMigrate.length }));

      if (imagesToMigrate.length === 0) {
        toast.info("No Firebase storage URLs found to migrate");
        setMigratingSection(null);
        return;
      }

      toast.info(`Found ${imagesToMigrate.length} files to migrate`);

      // Migrate files
      for (let i = 0; i < imagesToMigrate.length; i++) {
        const file = imagesToMigrate[i];
        try {
          setMigrationProgress({
            stage: `Migrating ${file.type || 'file'}`,
            current: i + 1,
            total: imagesToMigrate.length,
            percentage: Math.round(((i + 1) / imagesToMigrate.length) * 100),
            currentItem: file.fileName,
          });

          // Choose appropriate edge function based on file type
          const isImage = file.bucket === 'site-images' || file.bucket === 'client-logos' || file.bucket === 'inspection-photos';
          const functionName = isImage ? 'migrate-images' : 'migrate-storage';

          const { data, error } = await supabase.functions.invoke(functionName, {
            body: isImage ? {
              imageUrl: file.url,
              bucket: file.bucket,
              fileName: file.fileName,
            } : {
              firebaseStorageUrl: file.url,
              targetBucket: file.bucket,
              targetPath: file.fileName,
            },
          });

          if (error) throw error;

          if (data?.success) {
            const newUrl = data.newUrl || data.publicUrl;
            
            // Handle different file types appropriately
            if (file.type === 'site_document') {
              // Insert document record directly
              await supabase
                .from('site_documents')
                .insert({
                  site_id: file.id,
                  category: file.metadata?.categoryName || 'General',
                  file_name: file.metadata?.originalFileName || file.fileName,
                  file_url: newUrl
                });
              
            } else if (file.type === 'subsection_document') {
              const categoryName = file.metadata?.categoryName || 'General';
              
              // Get or create document category for this subsection
              let { data: category } = await supabase
                .from('document_categories')
                .select('id')
                .eq('subsection_id', file.id)
                .eq('name', categoryName)
                .maybeSingle();
              
              if (!category) {
                const { data: newCategory } = await supabase
                  .from('document_categories')
                  .insert({ subsection_id: file.id, name: categoryName, order_index: 0 })
                  .select('id')
                  .single();
                category = newCategory;
              }
              
              // Insert document record
              if (category) {
                await supabase
                  .from('subsection_documents')
                  .insert({
                    subsection_id: file.id,
                    category_id: category.id,
                    file_name: file.metadata?.originalFileName || file.fileName,
                    file_url: newUrl
                  });
              }
              
            } else if (file.type === 'inspection_photo') {
              // Update inspection json_data with new photo URL
              const { inspectionFbId, sectionKey, itemKey } = file.metadata || {};
              
              if (inspectionFbId && sectionKey && itemKey) {
                // Find the inspection by firebase_id
                const { data: inspection } = await supabase
                  .from('inspections')
                  .select('id, json_data')
                  .eq('firebase_id', inspectionFbId)
                  .maybeSingle();
                
                if (inspection) {
                  const jsonData = (inspection.json_data as any) || {};
                  const sectionData = jsonData[sectionKey] || {};
                  const itemData = sectionData[itemKey] || {};
                  const photos = itemData.photos || [];
                  
                  // Replace old Firebase URL with new Supabase URL
                  const updatedPhotos = photos.map((url: string) =>
                    url === file.url ? newUrl : url
                  );
                  
                  // If photo wasn't in array, add it
                  if (!photos.includes(file.url)) {
                    updatedPhotos.push(newUrl);
                  }
                  
                  // Update json_data
                  const updatedJsonData = {
                    ...jsonData,
                    [sectionKey]: {
                      ...sectionData,
                      [itemKey]: {
                        ...itemData,
                        photos: updatedPhotos
                      }
                    }
                  };
                  
                  await supabase
                    .from('inspections')
                    .update({ json_data: updatedJsonData })
                    .eq('id', inspection.id);
                  
                  console.log(`Updated inspection ${inspectionFbId} photo: ${newUrl}`);
                }
              }
              
            } else {
              // For site images and client logos - update the main table
              if (!file.table.startsWith('temp_')) {
                await supabase
                  .from(file.table as any)
                  .update({ [file.column]: newUrl })
                  .eq('id', file.id);
              }
            }

            setStorageMigrationStats(prev => ({ ...prev, migrated: prev.migrated + 1 }));
          } else {
            throw new Error(data?.error || 'Migration failed');
          }
        } catch (err) {
          console.error(`Failed to migrate ${file.fileName}:`, err);
          setStorageMigrationStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        }
      }

      setMigrationProgress(null);
      const finalStats = storageMigrationStats;
      toast.success(`Storage migration complete! Migrated: ${finalStats.migrated + imagesToMigrate.length - finalStats.failed}, Failed: ${finalStats.failed}`);
      
      // Refresh scan
      await scanComplete();
    } catch (error) {
      console.error("Storage migration error:", error);
      toast.error("Failed to migrate storage");
    } finally {
      setMigratingSection(null);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Firebase to Supabase Migration</h1>
        <p className="text-muted-foreground mt-2">
          Complete migration tool with file transfer from Firebase to Supabase
        </p>
      </div>

      {!migrationStatus ? (
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Scan Migration Status</CardTitle>
            <CardDescription>
              Analyze what's in Firebase vs. Supabase and identify what needs migration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={scanComplete} 
              disabled={scanning}
              size="lg"
              className="w-full"
            >
              {scanning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                "Scan Migration Status"
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Scan complete! Review the status below and migrate missing data.
            </AlertDescription>
          </Alert>

          {migrationPreview && (
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Migration Preview
                </CardTitle>
                <CardDescription>
                  Here's what will happen during migration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Inspection Templates ({migrationPreview.templates.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {migrationPreview.templates.map(t => (
                      <Badge key={t.id} variant="secondary" className="justify-start">
                        {t.name} ({t.category})
                      </Badge>
                    ))}
                  </div>
                </div>

                {migrationPreview.subsectionMatches.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-blue-500" />
                      Template Linkage Preview (showing first 10)
                    </h4>
                    <div className="space-y-1 text-xs">
                      {migrationPreview.subsectionMatches.map((match, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded bg-muted/50">
                          <span className="font-medium">{match.subsection}</span>
                          {match.template ? (
                            <Badge variant="default" className="text-xs">→ {match.template}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">No template match</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {migrationPreview.documentCategories.size > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-purple-500" />
                      Document Categories ({migrationPreview.documentCategories.size})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(migrationPreview.documentCategories).map(cat => (
                        <Badge key={cat} variant="outline">{cat}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {migrationPreview.inspectionTypes.size > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-orange-500" />
                      Inspection Types Detected ({migrationPreview.inspectionTypes.size})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(migrationPreview.inspectionTypes).map(type => (
                        <Badge key={type} variant="secondary">{type}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>How migration works:</strong> Click "Migrate Clients & Sites" to transfer clients along with all their nested sites, subsections, and files. Calendar events, users, and settings can be migrated separately.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Clients</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Firebase:</span>
                    <Badge variant="secondary">{migrationStatus.clients.firebase}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Supabase:</span>
                    <Badge variant="default">{migrationStatus.clients.supabase}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">To Migrate:</span>
                    <Badge variant="destructive">{migrationStatus.clients.toMigrate.length}</Badge>
                  </div>
                   {migrationStatus.clients.toMigrate.length > 0 && (
                    <Button 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={migrateClients}
                      disabled={migratingSection !== null || migrating}
                    >
                      {migratingSection === 'clients' ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Migrating...
                        </>
                      ) : (
                        'Migrate Clients & Sites'
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Sites</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Firebase:</span>
                    <Badge variant="secondary">{migrationStatus.sites.firebase}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Supabase:</span>
                    <Badge variant="default">{migrationStatus.sites.supabase}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground italic mt-2">
                    Migrated with Clients
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Subsections</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Firebase:</span>
                    <Badge variant="secondary">{migrationStatus.subsections.firebase}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Supabase:</span>
                    <Badge variant="default">{migrationStatus.subsections.supabase}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground italic mt-2">
                    Migrated with Clients
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Firebase:</span>
                    <Badge variant="secondary">{migrationStatus.users.firebase}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Supabase:</span>
                    <Badge variant="default">{migrationStatus.users.supabase}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">To Migrate:</span>
                    <Badge variant="destructive">{migrationStatus.users.toMigrate.length}</Badge>
                  </div>
                  {migrationStatus.users.toMigrate.length > 0 && (
                    <Button 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={migrateUsers}
                      disabled={migratingSection !== null || migrating}
                    >
                      {migratingSection === 'users' ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Migrating...
                        </>
                      ) : (
                        'Create Profiles'
                      )}
                    </Button>
                  )}
                  {migrationStatus.users.supabase > 0 && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="w-full mt-1"
                      onClick={() => window.location.href = '/users'}
                    >
                      View & Invite
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Calendar Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Firebase:</span>
                    <Badge variant="secondary">{migrationStatus.calendarEvents.firebase}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Supabase:</span>
                    <Badge variant="default">{migrationStatus.calendarEvents.supabase}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">To Migrate:</span>
                    <Badge variant="destructive">{migrationStatus.calendarEvents.toMigrate}</Badge>
                  </div>
                  {migrationStatus.calendarEvents.toMigrate > 0 && (
                    <Button 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={migrateCalendarEventsOnly}
                      disabled={migratingSection !== null || migrating}
                    >
                      {migratingSection === 'calendar' ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Migrating...
                        </>
                      ) : (
                        'Migrate Events'
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">App Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Firebase:</span>
                    <Badge variant={migrationStatus.settings.hasFirebaseConfig ? "secondary" : "outline"}>
                      {migrationStatus.settings.hasFirebaseConfig ? 'Found' : 'None'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Supabase:</span>
                    <Badge variant={migrationStatus.settings.hasSupabaseConfig ? "default" : "outline"}>
                      {migrationStatus.settings.hasSupabaseConfig ? 'Configured' : 'Empty'}
                    </Badge>
                  </div>
                  {migrationStatus.settings.needsUpdate && (
                    <Button 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={migrateSettings}
                      disabled={migratingSection !== null || migrating}
                    >
                      {migratingSection === 'settings' ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Migrating...
                        </>
                      ) : (
                        'Migrate Settings'
                      )}
                    </Button>
                  )}
                  {!migrationStatus.settings.needsUpdate && migrationStatus.settings.hasSupabaseConfig && (
                    <p className="text-xs text-muted-foreground italic mt-2">
                      Already configured
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Client Logos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Firebase:</span>
                    <Badge variant="secondary">{migrationStatus.storage.clientLogos.firebase}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Supabase:</span>
                    <Badge variant="default">{migrationStatus.storage.clientLogos.supabase}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground italic mt-2">
                    Migrated with Clients
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Site Images
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Firebase:</span>
                    <Badge variant="secondary">{migrationStatus.storage.siteImages.firebase}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Supabase:</span>
                    <Badge variant="default">{migrationStatus.storage.siteImages.supabase}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground italic mt-2">
                    Migrated with Sites
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Site Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Firebase:</span>
                    <Badge variant="secondary">{migrationStatus.storage.siteDocuments.firebase}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Supabase:</span>
                    <Badge variant="default">{migrationStatus.storage.siteDocuments.supabase}</Badge>
                  </div>
                  {migrationStatus.storage.siteDocuments.firebase > migrationStatus.storage.siteDocuments.supabase && (
                    <Button 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={migrateSiteDocuments}
                      disabled={migratingSection !== null || migrating}
                    >
                      {migratingSection === 'site_documents' ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Migrating...
                        </>
                      ) : (
                        'Migrate All Site Docs'
                      )}
                    </Button>
                  )}
                  {migrationStatus.storage.siteDocuments.firebase === migrationStatus.storage.siteDocuments.supabase && (
                    <p className="text-xs text-muted-foreground italic mt-2">
                      All migrated
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Subsection Docs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Firebase:</span>
                    <Badge variant="secondary">{migrationStatus.storage.subsectionDocuments.firebase}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Supabase:</span>
                    <Badge variant="default">{migrationStatus.storage.subsectionDocuments.supabase}</Badge>
                  </div>
                  {migrationStatus.storage.subsectionDocuments.firebase > migrationStatus.storage.subsectionDocuments.supabase ? (
                    <Button 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={migrateSubsectionDocuments}
                      disabled={migratingSection !== null || migrating}
                    >
                      {migratingSection === 'subsection_documents' ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Migrating...
                        </>
                      ) : (
                        'Migrate All Subsection Docs'
                      )}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground italic mt-2">
                      All migrated
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Inspections
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Migration:</span>
                    <Badge variant="secondary">Available</Badge>
                  </div>
                  <Button 
                    size="sm" 
                    className="w-full mt-2"
                    onClick={migrateInspections}
                    disabled={migratingSection !== null || migrating}
                  >
                    {migratingSection === 'inspections' ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Migrating...
                      </>
                    ) : (
                      'Migrate All Inspections'
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground italic mt-2">
                    Migrates inspections from Firebase to Supabase
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Inspection Photos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Firebase:</span>
                    <Badge variant="secondary">{migrationStatus.storage.inspectionPhotos.firebase}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Supabase:</span>
                    <Badge variant="default">{migrationStatus.storage.inspectionPhotos.supabase}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground italic mt-2">
                    Migrated with Inspections
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {migrationStatus.clients.toMigrate.length > 0 && (
            <>
              <MigrationSelector 
                onMigrate={async (selections) => {
                  setMigrating(true);
                  setMigrationLogs([]);
                  try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) throw new Error('Not authenticated');

                    const migration = new MeticulousMigration((log) => {
                      console.log(`[${log.level}]`, log.message, log.data || '');
                      setMigrationLogs(prev => [...prev, {
                        timestamp: log.timestamp,
                        level: log.level,
                        message: log.message
                      }]);
                    });

                    // For now, migrate all selected clients with their full hierarchy
                    const firebaseData = await readFirebaseData("/clients");
                    if (!firebaseData) throw new Error('No Firebase data');

                    for (const clientId of selections.clientIds) {
                      const clientData = firebaseData[clientId];
                      if (clientData) {
                        setMigrationLogs(prev => [...prev, {
                          timestamp: new Date().toISOString(),
                          level: 'info',
                          message: `Starting migration for client: ${clientId}`
                        }]);
                        await migration.migrateClient(clientId, clientData, user.id);
                      }
                    }

                    toast.success("Migration completed!");
                    await scanComplete();
                  } catch (error: any) {
                    toast.error(`Migration failed: ${error.message}`);
                    setMigrationLogs(prev => [...prev, {
                      timestamp: new Date().toISOString(),
                      level: 'error',
                      message: `Migration failed: ${error.message}`
                    }]);
                  } finally {
                    setMigrating(false);
                  }
                }}
              />
              
              {migrationLogs.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Migration Logs</CardTitle>
                    <CardDescription>Real-time migration progress</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] w-full rounded border p-4">
                      <div className="space-y-1 font-mono text-xs">
                        {migrationLogs.map((log, idx) => (
                          <div 
                            key={idx} 
                            className={`${
                              log.level === 'error' ? 'text-red-500' :
                              log.level === 'success' ? 'text-green-500' :
                              log.level === 'warning' ? 'text-yellow-500' :
                              'text-muted-foreground'
                            }`}
                          >
                            [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {migrationProgress && (
            <Card>
              <CardHeader>
                <CardTitle>Migration Progress</CardTitle>
                <CardDescription>{migrationProgress.stage}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{migrationProgress.percentage}%</span>
                  </div>
                  <Progress value={migrationProgress.percentage} />
                  <p className="text-sm text-muted-foreground">
                    {migrationProgress.current} of {migrationProgress.total}: {migrationProgress.currentItem}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {!migrationComplete && migrationStatus.clients.toMigrate.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Step 2: Execute Complete Migration</CardTitle>
                <CardDescription>
                  This will migrate all clients, sites, subsections, and transfer all files to Supabase Storage
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>This will:</strong>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Create {migrationStatus.clients.toMigrate.length} client(s) in Supabase</li>
                      <li>Migrate all associated sites and subsections</li>
                      <li>Migrate {migrationStatus.calendarEvents.toMigrate} calendar event(s)</li>
                      <li>Copy all storage files (client logos, site images/documents, subsection docs, inspection photos)</li>
                      <li>Update all URLs to point to Supabase</li>
                    </ul>
                  </AlertDescription>
                </Alert>
                
                <Button 
                  onClick={executeMeticulousMigration} 
                  disabled={migrating}
                  size="lg"
                  className="w-full"
                >
                  {migrating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Migrating...
                    </>
                  ) : (
                    <>
                      <Database className="mr-2 h-4 w-4" />
                      Execute Meticulous Migration
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : migrationComplete || migrationStatus.clients.toMigrate.length === 0 ? (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Migration complete!</strong> All data and files have been transferred to Supabase.
                You can now safely remove Firebase dependencies.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={scanComplete}
              disabled={scanning}
            >
              {scanning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                "Refresh Status"
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default FirebaseSync;
