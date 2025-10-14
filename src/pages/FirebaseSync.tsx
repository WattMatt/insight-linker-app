import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { readFirebaseData } from "@/lib/firebase";
import { supabase } from "@/integrations/supabase/client";
import { Database, Download, RefreshCw, Upload, FolderOpen } from "lucide-react";

const FirebaseSync = () => {
  const [firebasePath, setFirebasePath] = useState("/");
  const [jsonData, setJsonData] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Storage migration state
  const [storageUrl, setStorageUrl] = useState("");
  const [targetBucket, setTargetBucket] = useState("files");
  const [targetPath, setTargetPath] = useState("");
  const [buckets, setBuckets] = useState<string[]>([]);
  const [migratingStorage, setMigratingStorage] = useState(false);

  useEffect(() => {
    fetchBuckets();
  }, []);

  const fetchBuckets = async () => {
    try {
      const { data, error } = await supabase.storage.listBuckets();
      if (error) throw error;
      setBuckets(data.map(b => b.name));
    } catch (error) {
      console.error('Error fetching buckets:', error);
    }
  };

  const fetchFirebaseData = async () => {
    if (!firebasePath) {
      toast.error("Please enter a Firebase path");
      return;
    }

    setLoading(true);
    try {
      const data = await readFirebaseData(firebasePath);
      
      if (data) {
        const formatted = JSON.stringify(data, null, 2);
        setJsonData(formatted);
        toast.success("Data fetched successfully!");
      } else {
        toast.error("No data found at this path");
        setJsonData("");
      }
    } catch (error) {
      console.error("Error fetching Firebase data:", error);
      toast.error("Failed to fetch data from Firebase");
    } finally {
      setLoading(false);
    }
  };

  const migrateStorageFile = async () => {
    if (!storageUrl) {
      toast.error("Please enter a Firebase Storage URL");
      return;
    }

    setMigratingStorage(true);
    try {
      const { data, error } = await supabase.functions.invoke('migrate-storage', {
        body: {
          firebaseStorageUrl: storageUrl,
          targetBucket,
          targetPath: targetPath || undefined,
        }
      });

      if (error) throw error;

      if (data.success) {
        toast.success("File migrated successfully!");
        console.log('Migrated file:', data);
      } else {
        throw new Error(data.error || 'Migration failed');
      }
    } catch (error) {
      console.error("Error migrating storage:", error);
      toast.error(`Failed to migrate file: ${error.message}`);
    } finally {
      setMigratingStorage(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(jsonData);
    toast.success("Data copied to clipboard!");
  };

  const createBucket = async () => {
    const bucketName = prompt("Enter bucket name:");
    if (!bucketName) return;

    try {
      const { error } = await supabase.storage.createBucket(bucketName, {
        public: true,
      });

      if (error) throw error;
      toast.success(`Bucket '${bucketName}' created!`);
      fetchBuckets();
    } catch (error) {
      console.error('Error creating bucket:', error);
      toast.error(`Failed to create bucket: ${error.message}`);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Firebase Migration</h1>
        <p className="text-muted-foreground">
          Migrate data and files from Firebase to Supabase
        </p>
      </div>

      <Tabs defaultValue="database" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="database">Database Sync</TabsTrigger>
          <TabsTrigger value="storage">Storage Migration</TabsTrigger>
        </TabsList>

        <TabsContent value="database" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Fetch Database Data</CardTitle>
              <CardDescription>
                Read data from Firebase Realtime Database
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="path">Firebase Path</Label>
                <div className="flex gap-2">
                  <Input
                    id="path"
                    value={firebasePath}
                    onChange={(e) => setFirebasePath(e.target.value)}
                    placeholder="/clients or /clients/Fortress_Fund"
                  />
                  <Button onClick={fetchFirebaseData} disabled={loading}>
                    {loading ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Database className="mr-2 h-4 w-4" />
                        Fetch
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="data">Retrieved Data (JSON)</Label>
                <Textarea
                  id="data"
                  value={jsonData}
                  readOnly
                  placeholder="Data will appear here..."
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>

              {jsonData && (
                <Button variant="outline" onClick={copyToClipboard}>
                  <Download className="mr-2 h-4 w-4" />
                  Copy to Clipboard
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle>Common Paths</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 text-sm">
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => setFirebasePath("/clients")}
                >
                  <code>/clients</code> - All clients
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => setFirebasePath("/")}
                >
                  <code>/</code> - Root (all data)
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Migrate Storage Files</CardTitle>
              <CardDescription>
                Copy files from Firebase Storage to Supabase Storage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="storage-url">Firebase Storage URL</Label>
                <Input
                  id="storage-url"
                  value={storageUrl}
                  onChange={(e) => setStorageUrl(e.target.value)}
                  placeholder="https://firebasestorage.googleapis.com/v0/b/..."
                />
                <p className="text-xs text-muted-foreground">
                  Paste the full Firebase Storage download URL
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bucket">Target Supabase Bucket</Label>
                  <div className="flex gap-2">
                    <Select value={targetBucket} onValueChange={setTargetBucket}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {buckets.map((bucket) => (
                          <SelectItem key={bucket} value={bucket}>
                            {bucket}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" onClick={createBucket}>
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target-path">Target Path (optional)</Label>
                  <Input
                    id="target-path"
                    value={targetPath}
                    onChange={(e) => setTargetPath(e.target.value)}
                    placeholder="path/to/file.jpg"
                  />
                </div>
              </div>

              <Button 
                onClick={migrateStorageFile} 
                disabled={migratingStorage || !storageUrl}
                className="w-full"
              >
                {migratingStorage ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Migrating...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Migrate File
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle>Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. Get the Firebase Storage URL from your Firebase Console</p>
              <p>2. Select or create a Supabase Storage bucket</p>
              <p>3. Optionally specify a custom path in Supabase</p>
              <p>4. Click "Migrate File" to copy the file</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FirebaseSync;
