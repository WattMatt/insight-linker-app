import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { readFirebaseData } from "@/lib/firebase";
import { Database, Download, RefreshCw } from "lucide-react";

const FirebaseSync = () => {
  const [firebasePath, setFirebasePath] = useState("/");
  const [jsonData, setJsonData] = useState("");
  const [loading, setLoading] = useState(false);

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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(jsonData);
    toast.success("Data copied to clipboard!");
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Firebase Sync</h1>
        <p className="text-muted-foreground">
          Connect to Firebase Realtime Database and import data
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Firebase Configuration</CardTitle>
          <CardDescription>
            ⚠️ Update the Firebase config in <code>src/lib/firebase.ts</code> with your actual credentials
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground mb-2">Database URL:</p>
            <code className="text-sm">https://firestudio-rebuild-default-rtdb.firebaseio.com</code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fetch Data</CardTitle>
          <CardDescription>
            Enter a path to read data from your Firebase Realtime Database
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
              className="min-h-[400px] font-mono text-sm"
            />
          </div>

          {jsonData && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={copyToClipboard}>
                <Download className="mr-2 h-4 w-4" />
                Copy to Clipboard
              </Button>
            </div>
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
    </div>
  );
};

export default FirebaseSync;
