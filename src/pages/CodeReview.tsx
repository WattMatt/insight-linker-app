import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Code, 
  Shield, 
  Zap, 
  GitBranch, 
  FileCheck, 
  Loader2, 
  CheckCircle2,
  FileCode,
  Copy,
  Download,
  FolderTree,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  Sparkles,
  ClipboardCopy,
  Search
} from "lucide-react";

type ReviewType = 'full' | 'security' | 'performance' | 'architecture' | 'sans-compliance';

interface ReviewResult {
  review: string;
  developmentPrompt: string | null;
  qualityScore: number | null;
  reviewType: string;
  filesReviewed: string[];
  timestamp: string;
}

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
}

// Project file structure - key files for review
const projectFiles: FileTreeNode[] = [
  {
    name: 'src',
    path: 'src',
    type: 'folder',
    children: [
      {
        name: 'components',
        path: 'src/components',
        type: 'folder',
        children: [
          { name: 'AppSidebar.tsx', path: 'src/components/AppSidebar.tsx', type: 'file' },
          { name: 'COCValidationReport.tsx', path: 'src/components/COCValidationReport.tsx', type: 'file' },
          { name: 'ComplianceDashboard.tsx', path: 'src/components/ComplianceDashboard.tsx', type: 'file' },
          { name: 'FloorPlanViewer.tsx', path: 'src/components/FloorPlanViewer.tsx', type: 'file' },
          { name: 'InteractiveFloorPlan.tsx', path: 'src/components/InteractiveFloorPlan.tsx', type: 'file' },
          { name: 'SiteSummaryReport.tsx', path: 'src/components/SiteSummaryReport.tsx', type: 'file' },
          { name: 'ProtectedRoute.tsx', path: 'src/components/ProtectedRoute.tsx', type: 'file' },
          { name: 'OfflineIndicator.tsx', path: 'src/components/OfflineIndicator.tsx', type: 'file' },
        ]
      },
      {
        name: 'hooks',
        path: 'src/hooks',
        type: 'folder',
        children: [
          { name: 'useOfflineSync.ts', path: 'src/hooks/useOfflineSync.ts', type: 'file' },
          { name: 'useOfflineSubsections.ts', path: 'src/hooks/useOfflineSubsections.ts', type: 'file' },
          { name: 'useUserRole.tsx', path: 'src/hooks/useUserRole.tsx', type: 'file' },
          { name: 'useImageUpload.ts', path: 'src/hooks/useImageUpload.ts', type: 'file' },
          { name: 'useContractorSites.tsx', path: 'src/hooks/useContractorSites.tsx', type: 'file' },
        ]
      },
      {
        name: 'lib',
        path: 'src/lib',
        type: 'folder',
        children: [
          { name: 'offlineDB.ts', path: 'src/lib/offlineDB.ts', type: 'file' },
          { name: 'pdfUtils.ts', path: 'src/lib/pdfUtils.ts', type: 'file' },
          { name: 'cocValidationPdfGenerator.ts', path: 'src/lib/cocValidationPdfGenerator.ts', type: 'file' },
          { name: 'imageUrlResolver.ts', path: 'src/lib/imageUrlResolver.ts', type: 'file' },
        ]
      },
      {
        name: 'pages',
        path: 'src/pages',
        type: 'folder',
        children: [
          { name: 'Dashboard.tsx', path: 'src/pages/Dashboard.tsx', type: 'file' },
          { name: 'SiteDetail.tsx', path: 'src/pages/SiteDetail.tsx', type: 'file' },
          { name: 'SubsectionDetail.tsx', path: 'src/pages/SubsectionDetail.tsx', type: 'file' },
          { name: 'Auth.tsx', path: 'src/pages/Auth.tsx', type: 'file' },
          { name: 'Settings.tsx', path: 'src/pages/Settings.tsx', type: 'file' },
          { name: 'COCDocumentation.tsx', path: 'src/pages/COCDocumentation.tsx', type: 'file' },
        ]
      },
      { name: 'App.tsx', path: 'src/App.tsx', type: 'file' },
    ]
  },
  {
    name: 'supabase/functions',
    path: 'supabase/functions',
    type: 'folder',
    children: [
      { name: 'validate-coc/index.ts', path: 'supabase/functions/validate-coc/index.ts', type: 'file' },
      { name: 'extract-coc/index.ts', path: 'supabase/functions/extract-coc/index.ts', type: 'file' },
      { name: 'send-email/index.ts', path: 'supabase/functions/send-email/index.ts', type: 'file' },
      { name: 'invite-user/index.ts', path: 'supabase/functions/invite-user/index.ts', type: 'file' },
    ]
  }
];

const reviewTypes: { value: ReviewType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'full', label: 'Full Review', icon: <Code className="h-4 w-4" />, description: 'Comprehensive code quality, architecture, security, and performance review' },
  { value: 'security', label: 'Security Audit', icon: <Shield className="h-4 w-4" />, description: 'Focus on vulnerabilities, authentication, and data protection' },
  { value: 'performance', label: 'Performance', icon: <Zap className="h-4 w-4" />, description: 'Rendering optimization, memory usage, and efficiency' },
  { value: 'architecture', label: 'Architecture', icon: <GitBranch className="h-4 w-4" />, description: 'Code organization, design patterns, and scalability' },
  { value: 'sans-compliance', label: 'SANS Compliance', icon: <FileCheck className="h-4 w-4" />, description: 'Electrical COC validation per SANS 10142-1 standards' },
];

const focusAreaOptions = [
  'TypeScript type safety',
  'React hooks best practices',
  'Error handling',
  'Accessibility (a11y)',
  'API integration patterns',
  'State management',
  'Testing coverage',
  'Documentation quality',
  'Supabase integration',
  'Edge function design',
  'Offline-first patterns',
  'RLS security policies',
];

// File content fetcher using view tool simulation (will be populated dynamically)
const getFileContent = async (path: string): Promise<string> => {
  // This would normally fetch from GitHub API or similar
  // For now, we'll create a summary of what we know about key files
  const fileDescriptions: Record<string, string> = {
    'src/App.tsx': `// Main application component with React Router setup
// Contains lazy-loaded routes and authentication flow
// Uses Tanstack Query for data fetching`,
    'src/hooks/useOfflineSync.ts': `// Offline synchronization hook
// Manages IndexedDB caching for offline-first functionality
// Handles queue management for pending operations`,
    'src/lib/offlineDB.ts': `// IndexedDB wrapper for offline storage
// Stores sites, subsections, documents, inspections
// Implements CRUD operations with sync support`,
  };
  
  return fileDescriptions[path] || `// Content for ${path}\n// File selected for review`;
};

export default function CodeReview() {
  const [isLoading, setIsLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewType, setReviewType] = useState<ReviewType>('full');
  const [selectedFocusAreas, setSelectedFocusAreas] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('files');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src', 'src/components', 'src/hooks', 'src/lib', 'src/pages']));

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const toggleFileSelection = (path: string) => {
    setSelectedFiles(prev => 
      prev.includes(path) 
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
  };

  const selectAllInFolder = (node: FileTreeNode) => {
    const allFiles: string[] = [];
    const collectFiles = (n: FileTreeNode) => {
      if (n.type === 'file') {
        allFiles.push(n.path);
      } else if (n.children) {
        n.children.forEach(collectFiles);
      }
    };
    collectFiles(node);
    
    const allSelected = allFiles.every(f => selectedFiles.includes(f));
    if (allSelected) {
      setSelectedFiles(prev => prev.filter(f => !allFiles.includes(f)));
    } else {
      setSelectedFiles(prev => [...new Set([...prev, ...allFiles])]);
    }
  };

  const toggleFocusArea = (area: string) => {
    setSelectedFocusAreas(prev => 
      prev.includes(area) 
        ? prev.filter(a => a !== area)
        : [...prev, area]
    );
  };

  const runReview = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Please select at least one file to review");
      return;
    }

    setIsLoading(true);
    setReviewResult(null);

    try {
      // Build code files array with content
      const codeFiles = await Promise.all(
        selectedFiles.map(async (path) => ({
          path,
          content: await getFileContent(path)
        }))
      );

      const { data, error } = await supabase.functions.invoke("offline-review", {
        body: { 
          codeFiles,
          reviewType,
          focusAreas: selectedFocusAreas
        },
      });

      if (error) {
        console.error("Edge function error:", error);
        if (error.message?.includes("429")) {
          toast.error("Rate limit exceeded. Please try again in a few minutes.");
        } else if (error.message?.includes("402")) {
          toast.error("Usage limit reached. Please add credits in workspace settings.");
        } else {
          toast.error("Failed to generate review: " + error.message);
        }
        return;
      }

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setReviewResult(data);
      setActiveTab('results');
      toast.success("Code review completed!");
    } catch (error) {
      console.error("Review error:", error);
      toast.error("An error occurred while generating the review.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyDevPrompt = () => {
    if (reviewResult?.developmentPrompt) {
      navigator.clipboard.writeText(reviewResult.developmentPrompt);
      toast.success("Development prompt copied to clipboard!");
    }
  };

  const copyReview = () => {
    if (reviewResult?.review) {
      navigator.clipboard.writeText(reviewResult.review);
      toast.success("Review copied to clipboard");
    }
  };

  const downloadReview = () => {
    if (reviewResult?.review) {
      const content = reviewResult.developmentPrompt 
        ? `${reviewResult.review}\n\n---\n\n## Development Prompt\n\n${reviewResult.developmentPrompt}`
        : reviewResult.review;
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `code-review-${reviewResult.reviewType}-${new Date().toISOString().split('T')[0]}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Review downloaded");
    }
  };

  const renderFileTree = (nodes: FileTreeNode[], depth = 0) => {
    const filteredNodes = searchQuery 
      ? nodes.filter(n => 
          n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (n.children && n.children.some(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())))
        )
      : nodes;

    return filteredNodes.map(node => {
      if (node.type === 'folder') {
        const isExpanded = expandedFolders.has(node.path) || searchQuery.length > 0;
        const childFiles = node.children?.filter(c => c.type === 'file') || [];
        const allChildrenSelected = childFiles.length > 0 && childFiles.every(c => selectedFiles.includes(c.path));
        const someChildrenSelected = childFiles.some(c => selectedFiles.includes(c.path));

        return (
          <Collapsible key={node.path} open={isExpanded}>
            <div className="flex items-center gap-1 py-1 hover:bg-muted/50 rounded px-1" style={{ paddingLeft: depth * 16 }}>
              <CollapsibleTrigger onClick={() => toggleFolder(node.path)} className="p-1">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <Checkbox 
                checked={allChildrenSelected}
                className={someChildrenSelected && !allChildrenSelected ? "data-[state=checked]:bg-primary/50" : ""}
                onCheckedChange={() => selectAllInFolder(node)}
              />
              <Folder className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{node.name}</span>
              {childFiles.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {childFiles.filter(c => selectedFiles.includes(c.path)).length}/{childFiles.length}
                </Badge>
              )}
            </div>
            <CollapsibleContent>
              {node.children && renderFileTree(node.children, depth + 1)}
            </CollapsibleContent>
          </Collapsible>
        );
      }

      return (
        <div 
          key={node.path}
          className="flex items-center gap-2 py-1.5 hover:bg-muted/50 rounded px-2 cursor-pointer"
          style={{ paddingLeft: depth * 16 + 28 }}
          onClick={() => toggleFileSelection(node.path)}
        >
          <Checkbox 
            checked={selectedFiles.includes(node.path)}
            onCheckedChange={() => toggleFileSelection(node.path)}
          />
          <File className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{node.name}</span>
        </div>
      );
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-8 w-8 text-primary" />
          AI Code Review
        </h1>
        <p className="text-muted-foreground mt-2">
          Select files from your project, run a comprehensive review, and get an actionable development prompt
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="files" className="gap-2">
            <FolderTree className="h-4 w-4" />
            Select Files
            {selectedFiles.length > 0 && (
              <Badge variant="secondary" className="ml-1">{selectedFiles.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="options" className="gap-2">
            <FileCheck className="h-4 w-4" />
            Options
          </TabsTrigger>
          <TabsTrigger value="results" className="gap-2" disabled={!reviewResult}>
            <CheckCircle2 className="h-4 w-4" />
            Results
            {reviewResult?.qualityScore && (
              <Badge variant="secondary" className="ml-1">
                {reviewResult.qualityScore}/10
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FolderTree className="h-5 w-5" />
                Project Files
              </CardTitle>
              <CardDescription>Select the files you want to include in the code review</CardDescription>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] border rounded-lg p-2">
                {renderFileTree(projectFiles)}
              </ScrollArea>
              
              {selectedFiles.length > 0 && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <h4 className="font-medium text-sm mb-2">Selected Files ({selectedFiles.length})</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedFiles.map(file => (
                      <Badge 
                        key={file} 
                        variant="outline" 
                        className="cursor-pointer hover:bg-destructive/10"
                        onClick={() => toggleFileSelection(file)}
                      >
                        {file.split('/').pop()}
                        <span className="ml-1 text-muted-foreground">×</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Button
            onClick={() => setActiveTab('options')}
            disabled={selectedFiles.length === 0}
            className="w-full"
          >
            Continue to Options
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </TabsContent>

        <TabsContent value="options" className="space-y-6">
          {/* Review Type Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Review Type</CardTitle>
              <CardDescription>Select the type of analysis you need</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {reviewTypes.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setReviewType(type.value)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      reviewType === type.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {type.icon}
                      <span className="font-medium">{type.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Focus Areas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Focus Areas (Optional)</CardTitle>
              <CardDescription>Select specific areas for deeper analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {focusAreaOptions.map((area) => (
                  <button
                    key={area}
                    onClick={() => toggleFocusArea(area)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      selectedFocusAreas.includes(area)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Run Review Button */}
          <Button
            onClick={runReview}
            disabled={isLoading || selectedFiles.length === 0}
            size="lg"
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Analyzing {selectedFiles.length} file(s)...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" />
                Run {reviewTypes.find(t => t.value === reviewType)?.label} on {selectedFiles.length} file(s)
              </>
            )}
          </Button>

          {isLoading && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Analysis in Progress</AlertTitle>
              <AlertDescription>
                The AI is reviewing your code. This may take 30-60 seconds depending on the number of files.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {reviewResult && (
            <>
              {/* Development Prompt Card - Most Important */}
              {reviewResult.developmentPrompt && (
                <Card className="border-primary bg-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-primary">
                      <ClipboardCopy className="h-5 w-5" />
                      Development Prompt
                    </CardTitle>
                    <CardDescription>
                      Copy this prompt into Lovable or your AI development platform
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="relative">
                      <ScrollArea className="h-[200px] border rounded-lg bg-background p-4">
                        <pre className="text-sm whitespace-pre-wrap font-mono">
                          {reviewResult.developmentPrompt}
                        </pre>
                      </ScrollArea>
                      <Button 
                        onClick={copyDevPrompt}
                        size="lg"
                        className="w-full mt-4"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Development Prompt
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Summary Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        Review Complete
                        <Badge variant="outline">
                          {reviewTypes.find(t => t.value === reviewResult.reviewType)?.label}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        {reviewResult.filesReviewed.length} file(s) analyzed at {new Date(reviewResult.timestamp).toLocaleString()}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={copyReview}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy All
                      </Button>
                      <Button variant="outline" size="sm" onClick={downloadReview}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {reviewResult.qualityScore !== null && (
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium">Quality Score:</span>
                      <Progress value={reviewResult.qualityScore * 10} className="flex-1 h-3" />
                      <span className={`font-bold text-lg ${
                        reviewResult.qualityScore >= 7 ? 'text-green-600' :
                        reviewResult.qualityScore >= 5 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {reviewResult.qualityScore}/10
                      </span>
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* Review Content */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Full Review</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-3 text-foreground">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-xl font-semibold mt-5 mb-2 text-foreground border-b pb-2">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-lg font-medium mt-4 mb-2 text-foreground">{children}</h3>,
                          ul: ({ children }) => <ul className="list-disc pl-6 my-2 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-6 my-2 space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="text-muted-foreground">{children}</li>,
                          p: ({ children }) => <p className="my-2 text-muted-foreground leading-relaxed">{children}</p>,
                          code: ({ className, children }) => {
                            const isInline = !className;
                            return isInline ? (
                              <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                            ) : (
                              <code className={`${className} block bg-muted p-4 rounded-lg text-sm font-mono overflow-x-auto`}>{children}</code>
                            );
                          },
                          pre: ({ children }) => <pre className="bg-muted p-4 rounded-lg overflow-x-auto my-4">{children}</pre>,
                          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-4 border-primary pl-4 my-4 italic text-muted-foreground">
                              {children}
                            </blockquote>
                          ),
                        }}
                      >
                        {reviewResult.review}
                      </ReactMarkdown>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Run Another Review */}
              <Button variant="outline" onClick={() => setActiveTab('files')} className="w-full">
                <Code className="h-4 w-4 mr-2" />
                Run Another Review
              </Button>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
