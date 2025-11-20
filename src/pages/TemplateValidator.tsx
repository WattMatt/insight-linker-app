import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface TemplateIssue {
  template_id: string;
  template_name: string;
  issue_type: string;
  issue_description: string;
}

export default function TemplateValidator() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [issues, setIssues] = useState<TemplateIssue[]>([]);

  useEffect(() => {
    validateTemplates();
  }, []);

  const validateTemplates = async () => {
    try {
      setValidating(true);
      const { data, error } = await supabase.rpc('validate_inspection_templates');

      if (error) throw error;

      setIssues(data || []);
      
      if (!data || data.length === 0) {
        toast.success("All templates are valid!");
      } else {
        toast.warning(`Found ${data.length} issue(s) in templates`);
      }
    } catch (error) {
      console.error("Error validating templates:", error);
      toast.error("Failed to validate templates");
    } finally {
      setLoading(false);
      setValidating(false);
    }
  };

  const getIssueTypeBadge = (type: string) => {
    switch (type) {
      case "Structure":
        return <Badge variant="destructive">{type}</Badge>;
      case "Missing Name":
        return <Badge className="bg-orange-500">{type}</Badge>;
      case "Duplicate ID":
        return <Badge className="bg-yellow-500">{type}</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/inspection-templates")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Templates
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Template Validator</h1>
            <p className="text-muted-foreground">Check inspection templates for data integrity issues</p>
          </div>
        </div>
        <Button onClick={validateTemplates} disabled={validating}>
          <RefreshCw className={`h-4 w-4 mr-2 ${validating ? 'animate-spin' : ''}`} />
          {validating ? 'Validating...' : 'Re-validate'}
        </Button>
      </div>

      {issues.length === 0 ? (
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-600">
            All inspection templates are valid! No issues found.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Alert className="border-orange-500 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-600">
              Found {issues.length} issue(s) in your inspection templates. Review the details below.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Template Issues</CardTitle>
              <CardDescription>
                Issues detected in inspection template structure and data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template Name</TableHead>
                    <TableHead>Issue Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((issue, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{issue.template_name}</TableCell>
                      <TableCell>{getIssueTypeBadge(issue.issue_type)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {issue.issue_description}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/inspection-templates/edit/${issue.template_id}`)}
                        >
                          Edit Template
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>About Template Validation</CardTitle>
          <CardDescription>What this validator checks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium">Section Structure</p>
              <p className="text-sm text-muted-foreground">
                Ensures sections are properly formatted as arrays with all required fields
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium">Section Names</p>
              <p className="text-sm text-muted-foreground">
                Verifies that all sections have proper display names (prevents "0", "1", "2" tab issues)
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium">Duplicate IDs</p>
              <p className="text-sm text-muted-foreground">
                Detects duplicate section identifiers that could cause display issues
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}