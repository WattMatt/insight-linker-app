import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Code, 
  Shield, 
  Zap, 
  GitBranch, 
  FileCheck, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  FileCode,
  Copy,
  Download,
  Plus,
  X
} from "lucide-react";

type ReviewType = 'full' | 'security' | 'performance' | 'architecture' | 'sans-compliance';

interface ReviewResult {
  review: string;
  qualityScore: number | null;
  reviewType: string;
  filesReviewed: string[];
  timestamp: string;
}

interface CodeFile {
  path: string;
  content: string;
}

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
];

export default function CodeReview() {
  const [isLoading, setIsLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewType, setReviewType] = useState<ReviewType>('full');
  const [selectedFocusAreas, setSelectedFocusAreas] = useState<string[]>([]);
  const [codeFiles, setCodeFiles] = useState<CodeFile[]>([{ path: '', content: '' }]);
  const [activeTab, setActiveTab] = useState('input');

  const addCodeFile = () => {
    setCodeFiles([...codeFiles, { path: '', content: '' }]);
  };

  const removeCodeFile = (index: number) => {
    if (codeFiles.length > 1) {
      setCodeFiles(codeFiles.filter((_, i) => i !== index));
    }
  };

  const updateCodeFile = (index: number, field: 'path' | 'content', value: string) => {
    const updated = [...codeFiles];
    updated[index][field] = value;
    setCodeFiles(updated);
  };

  const toggleFocusArea = (area: string) => {
    setSelectedFocusAreas(prev => 
      prev.includes(area) 
        ? prev.filter(a => a !== area)
        : [...prev, area]
    );
  };

  const runReview = async () => {
    const validFiles = codeFiles.filter(f => f.content.trim());
    if (validFiles.length === 0) {
      toast.error("Please add at least one code file to review");
      return;
    }

    // Auto-generate paths for files without them
    const filesWithPaths = validFiles.map((f, i) => ({
      path: f.path.trim() || `file-${i + 1}.ts`,
      content: f.content
    }));

    setIsLoading(true);
    setReviewResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("abacus-code-review", {
        body: { 
          codeFiles: filesWithPaths,
          reviewType,
          focusAreas: selectedFocusAreas
        },
      });

      if (error) {
        console.error("Edge function error:", error);
        if (error.message?.includes("401")) {
          toast.error("Invalid API key. Please check your Abacus AI configuration.");
        } else if (error.message?.includes("429")) {
          toast.error("Rate limit exceeded. Please try again in a few minutes.");
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
      toast.success("Code review completed successfully!");
    } catch (error) {
      console.error("Review error:", error);
      toast.error("An error occurred while generating the review.");
    } finally {
      setIsLoading(false);
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
      const blob = new Blob([reviewResult.review], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `code-review-${reviewResult.reviewType}-${new Date().toISOString().split('T')[0]}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Review downloaded");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Code Review</h1>
        <p className="text-muted-foreground mt-2">
          Powered by Abacus AI - Get comprehensive code analysis and recommendations
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="input" className="gap-2">
            <FileCode className="h-4 w-4" />
            Code Input
          </TabsTrigger>
          <TabsTrigger value="results" className="gap-2" disabled={!reviewResult}>
            <CheckCircle2 className="h-4 w-4" />
            Results
            {reviewResult?.qualityScore && (
              <Badge variant="secondary" className="ml-2">
                {reviewResult.qualityScore}/10
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="input" className="space-y-6">
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

          {/* Code Files */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Code Files</CardTitle>
                  <CardDescription>Paste the code you want reviewed</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={addCodeFile}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add File
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {codeFiles.map((file, index) => (
                <div key={index} className="space-y-2 p-4 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label htmlFor={`path-${index}`} className="text-sm text-muted-foreground">
                        File Path (optional)
                      </Label>
                      <input
                        id={`path-${index}`}
                        type="text"
                        placeholder="src/components/MyComponent.tsx"
                        value={file.path}
                        onChange={(e) => updateCodeFile(index, 'path', e.target.value)}
                        className="w-full mt-1 px-3 py-1.5 text-sm border rounded-md bg-background"
                      />
                    </div>
                    {codeFiles.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCodeFile(index)}
                        className="mt-5"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Textarea
                    placeholder="Paste your code here..."
                    value={file.content}
                    onChange={(e) => updateCodeFile(index, 'content', e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Run Review Button */}
          <Button
            onClick={runReview}
            disabled={isLoading || !codeFiles.some(f => f.content.trim())}
            size="lg"
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Analyzing Code...
              </>
            ) : (
              <>
                <Code className="h-5 w-5 mr-2" />
                Run {reviewTypes.find(t => t.value === reviewType)?.label}
              </>
            )}
          </Button>

          {isLoading && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Analysis in Progress</AlertTitle>
              <AlertDescription>
                The AI is reviewing your code. This may take 30-60 seconds depending on complexity.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {reviewResult && (
            <>
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
                        Copy
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
                <CardContent className="pt-6">
                  <ScrollArea className="h-[600px] pr-4">
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
              <Button variant="outline" onClick={() => setActiveTab('input')} className="w-full">
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
