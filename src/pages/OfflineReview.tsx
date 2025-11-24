import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileCode, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

export default function OfflineReview() {
  const [isLoading, setIsLoading] = useState(false);
  const [review, setReview] = useState<string | null>(null);

  const offlineFiles = [
    { path: "src/hooks/useOfflineSync.ts", key: "useOfflineSync" },
    { path: "src/hooks/useOfflineInspections.ts", key: "useOfflineInspections" },
    { path: "src/hooks/useOfflineSubsections.ts", key: "useOfflineSubsections" },
    { path: "src/hooks/useOfflineFloorPlanAnnotations.ts", key: "useOfflineFloorPlanAnnotations" },
    { path: "src/lib/offlineDB.ts", key: "offlineDB" },
    { path: "src/lib/offlineDBExtensions.ts", key: "offlineDBExtensions" },
    { path: "src/lib/offlineFloorPlanDB.ts", key: "offlineFloorPlanDB" },
  ];

  const runReview = async () => {
    setIsLoading(true);
    setReview(null);

    try {
      // Fetch all offline-related files
      const fileContents = await Promise.all(
        offlineFiles.map(async (file) => {
          try {
            const response = await fetch(`/${file.path}`);
            const content = await response.text();
            return { path: file.path, content };
          } catch (error) {
            console.error(`Failed to fetch ${file.path}:`, error);
            return { path: file.path, content: "// File could not be loaded" };
          }
        })
      );

      // Call edge function
      const { data, error } = await supabase.functions.invoke("offline-review", {
        body: { codeFiles: fileContents },
      });

      if (error) {
        if (error.message?.includes("429")) {
          toast.error("Rate limit exceeded. Please try again in a few minutes.");
        } else if (error.message?.includes("402")) {
          toast.error("Please add credits to your Lovable AI workspace to continue.");
        } else {
          toast.error("Failed to generate review: " + error.message);
        }
        return;
      }

      setReview(data.review);
      toast.success("Review completed successfully!");
    } catch (error) {
      console.error("Review error:", error);
      toast.error("An error occurred while generating the review.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Offline Functionality Review</h1>
        <p className="text-muted-foreground">
          AI-powered comprehensive code review using Gemini 3 Pro
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            Files to Review
          </CardTitle>
          <CardDescription>
            The following offline functionality files will be analyzed:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {offlineFiles.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm font-mono"
              >
                <FileCode className="h-4 w-4 text-muted-foreground" />
                {file.path}
              </div>
            ))}
          </div>

          <Button
            onClick={runReview}
            disabled={isLoading}
            className="w-full mt-6"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Analyzing with Gemini 3 Pro...
              </>
            ) : (
              <>
                <FileCode className="h-4 w-4 mr-2" />
                Run AI Code Review
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {review && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Review Results
            </CardTitle>
            <CardDescription>
              Comprehensive analysis by Gemini 3 Pro
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-2xl font-bold mb-4 mt-6 flex items-center gap-2">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-xl font-semibold mb-3 mt-5 flex items-center gap-2">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-lg font-medium mb-2 mt-4">{children}</h3>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-6 space-y-2 my-4">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-6 space-y-2 my-4">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-foreground">{children}</li>
                  ),
                  code: ({ node, className, children, ...props }) => {
                    const inline = !className;
                    return inline ? (
                      <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className="block bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono" {...props}>
                        {children}
                      </code>
                    );
                  },
                  strong: ({ children }) => (
                    <strong className="font-semibold text-foreground">{children}</strong>
                  ),
                  p: ({ children }) => (
                    <p className="mb-4 text-foreground leading-relaxed">{children}</p>
                  ),
                }}
              >
                {review}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
