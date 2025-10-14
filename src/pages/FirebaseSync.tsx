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
      
      if (!firebaseData) {
        toast.error("No data found in Firebase");
        return;
      }

      const firebaseClients = Object.keys(firebaseData);
      
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
      
      const migratedFirebaseIds = new Set(
        (supabaseClients || []).map(c => c.firebase_id).filter(Boolean)
      );
      
      const clientsToMigrate = firebaseClients.filter(
        clientId => !migratedFirebaseIds.has(clientId)
      );

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
      
      const totalClients = migrationStatus.clients.toMigrate.length;
      let completedClients = 0;

      // Import the migration function
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
      setMigrationComplete(true);
      toast.success("Migration complete! All data and files transferred to Supabase");
      
      // Re-scan to show updated status
      await scanComplete();
      
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
