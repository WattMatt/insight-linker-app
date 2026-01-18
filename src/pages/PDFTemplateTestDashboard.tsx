/**
 * PDF Template Gateway Test Dashboard
 * 
 * Interactive testing interface for validating the PDF template system.
 * Tests parameter flow, section rendering, and WYSIWYG consistency.
 */

import React, { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Play, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  ChevronDown,
  ChevronRight,
  RefreshCw,
  FileText,
  Database,
  Layers,
  Palette,
  Settings2,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { runPDFTemplateTests, TestResult, TestSuiteResult } from "@/lib/pdfTemplateTestRunner";
import { fetchPDFTemplate, TemplateReportType } from "@/hooks/usePDFTemplateGateway";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const REPORT_TYPES: { value: TemplateReportType; label: string }[] = [
  { value: 'site_summary', label: 'Site Summary' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'floor_plan', label: 'Floor Plan' },
  { value: 'asset_verification', label: 'Asset Verification' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'coc_validation', label: 'COC Validation' },
];

const StatusIcon: React.FC<{ status: TestResult['status'] }> = ({ status }) => {
  switch (status) {
    case 'pass':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'fail':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'skipped':
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
};

const StatusBadge: React.FC<{ status: TestResult['status'] }> = ({ status }) => {
  const variants: Record<TestResult['status'], string> = {
    pass: 'bg-green-100 text-green-800 border-green-200',
    fail: 'bg-red-100 text-red-800 border-red-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    skipped: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  return (
    <Badge variant="outline" className={cn('font-medium', variants[status])}>
      {status.toUpperCase()}
    </Badge>
  );
};

const TestResultItem: React.FC<{ result: TestResult }> = ({ result }) => {
  const [isOpen, setIsOpen] = useState(result.status === 'fail');

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg border transition-colors",
          result.status === 'fail' ? 'bg-red-50 border-red-200' : 
          result.status === 'warning' ? 'bg-yellow-50 border-yellow-200' :
          result.status === 'pass' ? 'bg-green-50 border-green-200' :
          'bg-gray-50 border-gray-200'
        )}>
          <div className="flex items-center gap-3">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <StatusIcon status={result.status} />
            <span className="font-medium text-sm">{result.name}</span>
          </div>
          <div className="flex items-center gap-3">
            {result.duration && (
              <span className="text-xs text-muted-foreground">
                {result.duration.toFixed(1)}ms
              </span>
            )}
            <StatusBadge status={result.status} />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm space-y-2">
          <p className="text-muted-foreground">{result.message}</p>
          {result.details && (
            <pre className="bg-background p-2 rounded border text-xs overflow-auto max-h-40">
              {JSON.stringify(result.details, null, 2)}
            </pre>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const SummaryCard: React.FC<{ 
  icon: React.ReactNode; 
  label: string; 
  value: number; 
  color: string;
}> = ({ icon, label, value, color }) => (
  <Card className={cn("border-2", color)}>
    <CardContent className="p-4 flex items-center gap-3">
      {icon}
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </CardContent>
  </Card>
);

const TemplateInspector: React.FC<{ reportType: TemplateReportType }> = ({ reportType }) => {
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchPDFTemplate(reportType);
      setTemplate(result);
    } catch (error) {
      console.error('Failed to fetch template:', error);
    } finally {
      setLoading(false);
    }
  }, [reportType]);

  React.useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!template) {
    return <p className="text-muted-foreground">No template loaded</p>;
  }

  return (
    <div className="space-y-6">
      {/* Customization */}
      <div>
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Customization
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="p-2 bg-muted rounded">
            <span className="text-muted-foreground">Cover Title:</span>
            <p className="font-medium">{template.customization.coverTitle || 'Not set'}</p>
          </div>
          <div className="p-2 bg-muted rounded">
            <span className="text-muted-foreground">Accent Color:</span>
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded border" 
                style={{ backgroundColor: template.accentColors.primary }}
              />
              <p className="font-medium">{template.customization.accentColor}</p>
            </div>
          </div>
          <div className="p-2 bg-muted rounded">
            <span className="text-muted-foreground">Page Numbers:</span>
            <p className="font-medium">{template.customization.includePageNumbers ? 'Yes' : 'No'}</p>
          </div>
          <div className="p-2 bg-muted rounded">
            <span className="text-muted-foreground">Include Date:</span>
            <p className="font-medium">{template.customization.includeDate ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div>
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Sections ({template.sections.length})
        </h3>
        <div className="space-y-2">
          {template.sections
            .sort((a: any, b: any) => a.order - b.order)
            .map((section: any) => (
              <div 
                key={section.id}
                className={cn(
                  "p-2 rounded border flex items-center justify-between text-sm",
                  section.enabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200 opacity-60'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6">#{section.order}</span>
                  <span className="font-medium">{section.title || section.id}</span>
                  <Badge variant="outline" className="text-xs">{section.type}</Badge>
                </div>
                <Badge variant={section.enabled ? 'default' : 'secondary'}>
                  {section.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            ))}
        </div>
      </div>

      {/* Color Palette */}
      <div>
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4" />
          Color Palette
        </h3>
        <div className="flex gap-2">
          {Object.entries(template.accentColors).map(([key, value]) => (
            <div key={key} className="flex flex-col items-center">
              <div 
                className="w-12 h-12 rounded border shadow-sm" 
                style={{ backgroundColor: key === 'rgb' ? `rgb(${value})` : value as string }}
              />
              <span className="text-xs mt-1">{key}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function PDFTemplateTestDashboard() {
  const [results, setResults] = useState<TestSuiteResult | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<TemplateReportType>('site_summary');

  const runTests = async () => {
    setRunning(true);
    try {
      const result = await runPDFTemplateTests(selectedReportType);
      setResults(result);
    } catch (error) {
      console.error('Test run failed:', error);
    } finally {
      setRunning(false);
    }
  };

  const groupedTests = results?.tests.reduce((acc, test) => {
    const category = test.id.split('-')[0];
    if (!acc[category]) acc[category] = [];
    acc[category].push(test);
    return acc;
  }, {} as Record<string, TestResult[]>) || {};

  const categoryLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    gateway: { label: 'Template Gateway', icon: <Database className="h-4 w-4" /> },
    spec: { label: 'Spec Consistency', icon: <FileText className="h-4 w-4" /> },
    render: { label: 'Section Rendering', icon: <Layers className="h-4 w-4" /> },
    metrics: { label: 'Metrics Calculation', icon: <BarChart3 className="h-4 w-4" /> },
    param: { label: 'Parameter Flow', icon: <Settings2 className="h-4 w-4" /> },
    db: { label: 'Database Integration', icon: <Database className="h-4 w-4" /> },
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">PDF Template Gateway Test Dashboard</h1>
          <p className="text-muted-foreground">
            Comprehensive testing for the PDF template system
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select 
            value={selectedReportType} 
            onValueChange={(v) => setSelectedReportType(v as TemplateReportType)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_TYPES.map(rt => (
                <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={runTests} disabled={running}>
            {running ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Tests
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="tests">
        <TabsList>
          <TabsTrigger value="tests">Test Results</TabsTrigger>
          <TabsTrigger value="inspector">Template Inspector</TabsTrigger>
        </TabsList>

        <TabsContent value="tests" className="space-y-6">
          {/* Summary Cards */}
          {results && (
            <div className="grid grid-cols-4 gap-4">
              <SummaryCard 
                icon={<CheckCircle className="h-6 w-6 text-green-500" />}
                label="Passed"
                value={results.passed}
                color="border-green-200"
              />
              <SummaryCard 
                icon={<XCircle className="h-6 w-6 text-red-500" />}
                label="Failed"
                value={results.failed}
                color="border-red-200"
              />
              <SummaryCard 
                icon={<AlertTriangle className="h-6 w-6 text-yellow-500" />}
                label="Warnings"
                value={results.warnings}
                color="border-yellow-200"
              />
              <SummaryCard 
                icon={<Clock className="h-6 w-6 text-gray-400" />}
                label="Skipped"
                value={results.skipped}
                color="border-gray-200"
              />
            </div>
          )}

          {/* Test Results by Category */}
          {results ? (
            <div className="grid gap-4">
              {Object.entries(groupedTests).map(([category, tests]) => {
                const { label, icon } = categoryLabels[category] || { label: category, icon: null };
                const passed = tests.filter(t => t.status === 'pass').length;
                const failed = tests.filter(t => t.status === 'fail').length;

                return (
                  <Card key={category}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {icon}
                          {label}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-green-50">
                            {passed} passed
                          </Badge>
                          {failed > 0 && (
                            <Badge variant="outline" className="bg-red-50">
                              {failed} failed
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="max-h-80">
                        <div className="space-y-2">
                          {tests.map(test => (
                            <TestResultItem key={test.id} result={test} />
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Click "Run Tests" to execute the test suite
                </p>
              </CardContent>
            </Card>
          )}

          {/* Timing Info */}
          {results && (
            <Card>
              <CardContent className="py-3">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Suite: {results.suiteName}
                  </span>
                  <span>
                    Duration: {(results.completedAt.getTime() - results.startedAt.getTime())}ms
                  </span>
                  <span>
                    Completed: {results.completedAt.toLocaleTimeString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="inspector">
          <Card>
            <CardHeader>
              <CardTitle>Template Configuration</CardTitle>
              <CardDescription>
                Inspect the current template configuration for {selectedReportType}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TemplateInspector reportType={selectedReportType} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
