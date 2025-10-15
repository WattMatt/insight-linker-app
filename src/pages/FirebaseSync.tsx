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
  files: {
    images: number;
    documents: number;
    toMigrate: Array<{url: string; type: string; path: string}>;
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
      
      // Scan Firebase
      const firebaseData = await readFirebaseData("/clients");
      const firebaseEvents = await readFirebaseData("/scheduleEvents");
      const firebaseUsers = await readFirebaseData("/users");
      const firebaseConfig = await readFirebaseData("/app_config");
      
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
        .select('firebase_id');
      
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
        files: {
          images: imageUrls.length,
          documents: documentUrls.length,
          toMigrate: allFileUrls,
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

  const [migrationLogs, setMigrationLogs] = useState<Array<{
    timestamp: string;
    level: string;
    message: string;
  }>>([]);

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
      }[] = [];

      console.log("Starting storage scan...");

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
                      // Check for photos in multiple possible structures
                      const photos = inspData?.photos || 
                                    inspData?.Photos || 
                                    inspData?.images || 
                                    inspData?.Images;
                      
                      if (photos && typeof photos === 'object') {
                        Object.entries(photos).forEach(([photoId, photoData]: [string, any]) => {
                          const photoUrl = photoData?.url || 
                                         photoData?.imageUrl || 
                                         photoData?.downloadUrl ||
                                         photoData?.URL;
                          
                          if (photoUrl && typeof photoUrl === 'string' && photoUrl.includes('firebase')) {
                            console.log(`✓ Found inspection photo in ${subsectionFbId}: ${photoUrl}`);
                            imagesToMigrate.push({
                              url: photoUrl,
                              bucket: 'inspection-photos',
                              fileName: `${supabaseSubsection.id}/${inspFbId}-${photoId}-${Date.now()}.png`,
                              table: 'inspection_items',
                              id: supabaseSubsection.id,
                              column: 'image_url',
                              type: 'inspection_photo',
                            });
                          }
                        });
                      }
                    });
                  }

                  // Migrate subsection documents - check all possible structures
                  const documents = subsectionData.documents || 
                                   subsectionData.Documents || 
                                   subsectionData.files ||
                                   subsectionData.Files;
                  
                  if (documents && typeof documents === 'object') {
                    console.log(`Found ${Object.keys(documents).length} documents in subsection ${subsectionFbId}`);
                    
                    Object.entries(documents).forEach(([docFbId, docData]: [string, any]) => {
                      const docUrl = docData?.url || 
                                    docData?.fileUrl || 
                                    docData?.downloadUrl ||
                                    docData?.URL ||
                                    (typeof docData === 'string' ? docData : null);
                      
                      const fileName = docData?.name || 
                                      docData?.fileName || 
                                      docData?.file_name ||
                                      `document-${docFbId}`;
                      
                      if (docUrl && typeof docUrl === 'string' && docUrl.includes('firebase')) {
                        console.log(`✓ Found subsection document in ${subsectionFbId}: ${docUrl}`);
                        imagesToMigrate.push({
                          url: docUrl,
                          bucket: 'documents',
                          fileName: `subsections/${supabaseSubsection.id}/${fileName}-${Date.now()}.pdf`,
                          table: 'subsection_documents',
                          id: supabaseSubsection.id,
                          column: 'file_url',
                          type: 'subsection_document',
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
              console.log(`Found ${Object.keys(siteDocuments).length} documents for site ${site.firebase_id}`);
              
              Object.entries(siteDocuments).forEach(([docFbId, docData]: [string, any]) => {
                const docUrl = docData?.url || 
                              docData?.fileUrl || 
                              docData?.downloadUrl ||
                              docData?.URL ||
                              (typeof docData === 'string' ? docData : null);
                
                const fileName = docData?.name || 
                                docData?.fileName || 
                                docData?.file_name ||
                                `document-${docFbId}`;
                
                if (docUrl && typeof docUrl === 'string' && docUrl.includes('firebase')) {
                  console.log(`✓ Found site document for ${site.firebase_id}: ${docUrl}`);
                  imagesToMigrate.push({
                    url: docUrl,
                    bucket: 'documents',
                    fileName: `sites/${site.id}/${fileName}-${Date.now()}.pdf`,
                    table: 'site_documents',
                    id: site.id,
                    column: 'file_url',
                    type: 'site_document',
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
            
            // Update the appropriate table
            if (!file.table.startsWith('temp_')) {
              const updateData: any = { [file.column]: newUrl };
              await supabase
                .from(file.table as any)
                .update(updateData)
                .eq('id', file.id);
            } else {
              // Log for manual review - these need to be inserted into proper tables
              console.log(`Migrated ${file.type}: ${newUrl} for ${file.id}`);
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
                  Files
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Images:</span>
                    <Badge variant="secondary">{migrationStatus.files.images}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Documents:</span>
                    <Badge variant="secondary">{migrationStatus.files.documents}</Badge>
                  </div>
                  {migrationStatus.files.toMigrate.length > 0 && (
                    <Button 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={migrateStorageOnly}
                      disabled={migratingSection !== null || migrating}
                    >
                      {migratingSection === 'storage' ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Migrating...
                        </>
                      ) : (
                        'Migrate Storage Now'
                      )}
                    </Button>
                  )}
                  {migrationStatus.files.toMigrate.length === 0 && (
                    <p className="text-xs text-muted-foreground italic mt-2">
                      No Firebase files found
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {migrationStatus.clients.toMigrate.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Clients to Migrate</CardTitle>
                <CardDescription>
                  These clients will be migrated with all their sites, subsections, and files
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {migrationStatus.clients.toMigrate.map(clientId => (
                    <Badge key={clientId} variant="outline">{clientId}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
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
                      <li>Copy {migrationStatus.files.toMigrate.length} file(s) to Supabase Storage</li>
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
