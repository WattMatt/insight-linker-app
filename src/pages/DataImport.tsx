import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const DataImport = () => {
  const [jsonInput, setJsonInput] = useState("");
  const [sqlOutput, setSqlOutput] = useState("");
  const [copied, setCopied] = useState(false);

  const transformToSQL = () => {
    try {
      const data = JSON.parse(jsonInput);
      const inspections = Object.entries(data);
      
      let sql = "-- Insert inspections from JSON data\n\n";
      
      inspections.forEach(([key, inspection]: [string, any]) => {
        // Parse siteId JSON to get siteName for lookup
        const siteName = inspection.siteName?.replace(/'/g, "''") || "";
        const title = inspection.title?.replace(/'/g, "''") || "";
        const description = inspection.notes?.replace(/'/g, "''") || "";
        const scheduledDate = inspection.scheduledDate || null;
        const endDate = inspection.endDate || null;
        const status = inspection.status || "Scheduled";
        const priority = inspection.priority || "Medium";
        
        // Build assigned_to array
        let assignedToSQL = "NULL";
        if (inspection.assignedTo && Array.isArray(inspection.assignedTo)) {
          const userIds = inspection.assignedTo.map((u: string) => `'${u}'`).join(", ");
          assignedToSQL = `ARRAY[${userIds}]`;
        }
        
        sql += `-- ${title}\n`;
        sql += `INSERT INTO public.inspections (
  title,
  description,
  inspection_date,
  end_date,
  status,
  priority,
  assigned_to,
  site_id
) VALUES (
  '${title}',
  '${description}',
  ${scheduledDate ? `'${scheduledDate}'` : "NULL"},
  ${endDate ? `'${endDate}'` : "NULL"},
  '${status}',
  '${priority}',
  ${assignedToSQL},
  (SELECT id FROM public.sites WHERE name = '${siteName}' LIMIT 1)
);\n\n`;
      });
      
      setSqlOutput(sql);
      toast.success("SQL generated successfully!");
    } catch (error) {
      toast.error("Invalid JSON format");
      console.error(error);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlOutput);
    setCopied(true);
    toast.success("SQL copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Data Import Transformer</h1>
        <p className="text-muted-foreground">
          Paste your JSON data below and convert it to SQL INSERT statements
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">JSON Input</h2>
          <Textarea
            placeholder='Paste your JSON data here...\n\nExample:\n{\n  "-OWIscEch1eZWQyClnRj": {\n    "title": "Audit",\n    "scheduledDate": "2025-07-21",\n    ...\n  }\n}'
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            className="min-h-[400px] font-mono text-sm"
          />
          <Button onClick={transformToSQL} className="mt-4 w-full">
            Transform to SQL
          </Button>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">SQL Output</h2>
            {sqlOutput && (
              <Button
                variant="outline"
                size="sm"
                onClick={copyToClipboard}
                className="gap-2"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy SQL
                  </>
                )}
              </Button>
            )}
          </div>
          <Textarea
            placeholder="SQL INSERT statements will appear here..."
            value={sqlOutput}
            readOnly
            className="min-h-[400px] font-mono text-sm"
          />
        </Card>
      </div>

      <Card className="p-6 bg-muted/50">
        <h3 className="font-semibold mb-2">Instructions:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
          <li>Paste your JSON data in the left panel</li>
          <li>Click "Transform to SQL" to generate INSERT statements</li>
          <li>Copy the SQL output and run it in your Supabase SQL Editor</li>
          <li>Make sure your sites exist in the database before running the SQL</li>
        </ol>
      </Card>
    </div>
  );
};

export default DataImport;
