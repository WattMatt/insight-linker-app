import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { readFirebaseData } from "@/lib/firebase";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, AlertCircle, FileText, Image as ImageIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

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

  const executeCompleteMigration = async () => {
    if (!migrationStatus) return;
    
    setMigrating(true);
    try {
      const { user } = (await supabase.auth.getUser()).data;
      if (!user) {
        toast.error("You must be logged in to migrate data");
        return;
      }

      toast.info("Starting complete migration with file transfer...");
      
      // Migrate settings if needed
      if (migrationStatus.settings.needsUpdate) {
        toast.info("Migrating app settings...");
        const { migrateAppSettings } = await import("@/lib/migration");
        await migrateAppSettings();
        toast.success("Settings migrated");
      }

      // Migrate clients if any
      if (migrationStatus.clients.toMigrate.length > 0) {
        await migrateClients();
      }

      // Migrate users if any
      if (migrationStatus.users.toMigrate.length > 0) {
        toast.info("Migrating users...");
        const { migrateUsers } = await import("@/lib/migration");
        const usersToMigrate = migrationStatus.users.toMigrate.map(u => ({
          id: u.id,
          email: u.email,
          name: u.name
        }));
        await migrateUsers(usersToMigrate);
        toast.success(`Migrated ${usersToMigrate.length} users`);
      }

      // Migrate calendar events if any
      if (migrationStatus.calendarEvents.toMigrate > 0) {
        toast.info("Migrating calendar events...");
        const { migrateCalendarEvents } = await import("@/lib/migration");
        const eventsResult = await migrateCalendarEvents();
        
        if (eventsResult.migratedCount > 0) {
          const message = eventsResult.skipped > 0 
            ? `Migrated ${eventsResult.migratedCount} calendar events (${eventsResult.skipped} skipped)`
            : `Migrated ${eventsResult.migratedCount} calendar events`;
          toast.success(message);
        }
      }

      setMigrationProgress(null);
      setMigrationComplete(true);
      
      // Refresh counts to show updated data
      toast.info("Refreshing counts...");
      await scanComplete();
      
      toast.success("Migration complete! All data and files transferred to Supabase");
      
    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.message || "Failed to complete migration");
    } finally {
      setMigrating(false);
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
                  <p className="text-xs text-muted-foreground italic mt-2">
                    Migrated with Clients
                  </p>
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
                  onClick={executeCompleteMigration} 
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
                    "Execute Complete Migration"
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
