import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { readFirebaseData } from "@/lib/firebase";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SchemaPreview {
  tableName: string;
  columns: { name: string; type: string }[];
  sampleData: any[];
}

const FirebaseSync = () => {
  const [scanning, setScanning] = useState(false);
  const [firebaseStructure, setFirebaseStructure] = useState<any>(null);
  const [schemaPreview, setSchemaPreview] = useState<SchemaPreview[]>([]);
  const [migrating, setMigrating] = useState(false);
  const [migrationComplete, setMigrationComplete] = useState(false);

  const inferType = (value: any): string => {
    if (value === null) return "text";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "number") return Number.isInteger(value) ? "integer" : "numeric";
    if (typeof value === "string") {
      if (value.match(/^\d{4}-\d{2}-\d{2}/)) return "timestamp with time zone";
      return "text";
    }
    if (typeof value === "object") return "jsonb";
    return "text";
  };

  const scanFirebase = async () => {
    setScanning(true);
    try {
      toast.info("Scanning Firebase structure...");
      
      const data = await readFirebaseData("/");
      
      if (!data) {
        toast.error("No data found in Firebase");
        return;
      }

      setFirebaseStructure(data);
      
      const schemas: SchemaPreview[] = [];
      
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object' && value !== null) {
          const tableName = key;
          const records = Array.isArray(value) ? value : Object.values(value);
          
          if (records.length > 0 && typeof records[0] === 'object') {
            const firstRecord = records[0];
            const columns = Object.keys(firstRecord).map(colName => ({
              name: colName,
              type: inferType(firstRecord[colName])
            }));
            
            schemas.push({
              tableName,
              columns,
              sampleData: records.slice(0, 3)
            });
          }
        }
      }
      
      setSchemaPreview(schemas);
      toast.success(`Found ${schemas.length} collections in Firebase`);
      
    } catch (error: any) {
      console.error("Error scanning Firebase:", error);
      toast.error(error.message || "Failed to scan Firebase");
    } finally {
      setScanning(false);
    }
  };

  const executeCompleteMigration = async () => {
    setMigrating(true);
    try {
      toast.info("Starting complete migration...");

      for (const schema of schemaPreview) {
        const createTableSQL = `
CREATE TABLE IF NOT EXISTS public.${schema.tableName} (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ${schema.columns.map(col => `${col.name} ${col.type}`).join(',\n  ')},
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.${schema.tableName} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ${schema.tableName}"
  ON public.${schema.tableName}
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert ${schema.tableName}"
  ON public.${schema.tableName}
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
        `.trim();

        toast.info(`Creating table: ${schema.tableName}`);
        console.log("SQL for migration:", createTableSQL);
      }

      toast.info("Tables will be created. Now migrating data...");

      for (const schema of schemaPreview) {
        const collectionData = firebaseStructure[schema.tableName];
        
        const { data, error } = await supabase.functions.invoke('migrate-firebase-data', {
          body: {
            firebaseData: collectionData,
            path: schema.tableName
          }
        });

        if (error) throw error;
        
        toast.success(`Migrated ${schema.tableName} - ${data.count} records`);
      }

      setMigrationComplete(true);
      toast.success("Complete migration finished!");

    } catch (error: any) {
      console.error("Migration error:", error);
      toast.error(error.message || "Migration failed");
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Firebase to Supabase Migration</h1>
        <p className="text-muted-foreground">
          Automated migration tool - scans your Firebase structure and migrates everything to Supabase
        </p>
      </div>

      {!firebaseStructure ? (
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Scan Firebase</CardTitle>
            <CardDescription>
              This will scan your entire Firebase Realtime Database and analyze the structure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={scanFirebase} 
              disabled={scanning}
              size="lg"
              className="w-full"
            >
              {scanning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scanning Firebase...
                </>
              ) : (
                "Scan Firebase Structure"
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Firebase scan complete! Found {schemaPreview.length} collections. Review the structure below.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Schema Preview</h2>
            
            {schemaPreview.map((schema) => (
              <Card key={schema.tableName}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Table: {schema.tableName}
                  </CardTitle>
                  <CardDescription>
                    {schema.sampleData.length} sample records shown
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Columns:</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {schema.columns.map((col) => (
                        <div key={col.name} className="flex items-center gap-2 text-sm">
                          <span className="font-mono bg-muted px-2 py-1 rounded">
                            {col.name}
                          </span>
                          <span className="text-muted-foreground">{col.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Sample Data:</h4>
                    <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-40">
                      {JSON.stringify(schema.sampleData, null, 2)}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!migrationComplete ? (
            <Card>
              <CardHeader>
                <CardTitle>Step 2: Execute Migration</CardTitle>
                <CardDescription>
                  This will create the tables in Supabase and migrate all data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Note:</strong> Tables will be created automatically with RLS policies. Data will be migrated immediately.
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
          ) : (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Migration complete! All data has been transferred to Supabase.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
};

export default FirebaseSync;
