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
      // Clean the input - remove any trailing commas and fix common JSON issues
      let cleanedInput = jsonInput.trim();
      
      const data = JSON.parse(cleanedInput);
      const inspections = Object.entries(data);
      
      if (inspections.length === 0) {
        toast.error("No inspection data found in JSON");
        return;
      }
      
      let sql = "-- Insert inspections from JSON data\n";
      sql += "-- IMPORTANT: Make sure all sites exist in the database first!\n";
      sql += "-- You can verify by running: SELECT name FROM public.sites;\n\n";
      
      // Collect unique site names for validation message
      const uniqueSites = new Set<string>();
      
      inspections.forEach(([key, inspection]: [string, any]) => {
        const siteName = inspection.siteName?.replace(/'/g, "''") || "";
        const title = inspection.title?.replace(/'/g, "''") || "";
        const description = inspection.notes?.replace(/'/g, "''") || "";
        const scheduledDate = inspection.scheduledDate || null;
        const endDate = inspection.endDate || null;
        const status = inspection.status || "Scheduled";
        const priority = inspection.priority || "Medium";
        
        if (siteName) {
          uniqueSites.add(siteName);
        }
        
        // Build assigned_to array
        let assignedToSQL = "NULL";
        if (inspection.assignedTo && Array.isArray(inspection.assignedTo)) {
          const userIds = inspection.assignedTo.map((u: string) => `'${u}'`).join(", ");
          assignedToSQL = `ARRAY[${userIds}]`;
        }
        
        sql += `-- ${title}\n`;
        sql += `INSERT INTO public.inspections (\n`;
        sql += `  title,\n`;
        sql += `  description,\n`;
        sql += `  inspection_date,\n`;
        sql += `  end_date,\n`;
        sql += `  status,\n`;
        sql += `  priority,\n`;
        sql += `  assigned_to,\n`;
        sql += `  site_id\n`;
        sql += `) VALUES (\n`;
        sql += `  '${title}',\n`;
        sql += `  '${description}',\n`;
        sql += `  ${scheduledDate ? `'${scheduledDate}'` : "NULL"},\n`;
        sql += `  ${endDate ? `'${endDate}'` : "NULL"},\n`;
        sql += `  '${status}',\n`;
        sql += `  '${priority}',\n`;
        sql += `  ${assignedToSQL},\n`;
        sql += `  (SELECT id FROM public.sites WHERE name = '${siteName}' LIMIT 1)\n`;
        sql += `);\n\n`;
      });
      
      // Add validation query at the end
      sql += "\n-- VALIDATION: Check if any inserts failed due to missing sites\n";
      sql += "-- Run this query to see which sites are missing:\n";
      sql += "/*\n";
      uniqueSites.forEach(siteName => {
        sql += `SELECT '${siteName}' as expected_site, EXISTS(SELECT 1 FROM public.sites WHERE name = '${siteName}') as exists\n`;
        sql += "UNION ALL\n";
      });
      sql = sql.replace(/UNION ALL\n$/, ";\n");
      sql += "*/\n";
      
      setSqlOutput(sql);
      toast.success(`Generated SQL for ${inspections.length} inspections. Check that all ${uniqueSites.size} sites exist!`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Invalid JSON format";
      toast.error(`JSON parsing failed: ${errorMessage}`);
      console.error("JSON Parse Error:", error);
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
        <h3 className="font-semibold mb-2">⚠️ Important Instructions:</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>Paste your JSON data in the left panel</li>
          <li>Click "Transform to SQL" to generate INSERT statements</li>
          <li className="font-semibold text-orange-600">
            CRITICAL: Make sure all sites referenced in the inspections exist in your database first!
            <br/>
            <span className="text-xs">The error you're seeing means the site lookup is returning NULL because those sites don't exist.</span>
          </li>
          <li>Run the complete-import.sql script first to create all sites, OR create sites manually</li>
          <li>Copy the generated SQL and run it in your Supabase SQL Editor</li>
        </ol>
      </Card>
    </div>
  );
};

export default DataImport;
