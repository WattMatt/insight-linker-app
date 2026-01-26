import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageIcon, Loader2, PlayCircle, CheckCircle2, AlertCircle, HardDrive } from "lucide-react";

interface ProcessedFile {
  path: string;
  originalSize: number;
  compressedSize?: number;
  status: 'compressed' | 'skipped' | 'error' | 'already_compressed';
  error?: string;
}

interface BatchResult {
  success: boolean;
  processed: number;
  compressed: number;
  skipped: number;
  errors: number;
  totalSavings: number;
  files: ProcessedFile[];
  continuationToken?: string;
}

export function ImageCompressionManager() {
  const [isRunning, setIsRunning] = useState(false);
  const [isDryRun, setIsDryRun] = useState(true);
  const [maxWidth, setMaxWidth] = useState(800);
  const [quality, setQuality] = useState(70);
  const [minSizeKB, setMinSizeKB] = useState(150);
  const [limit, setLimit] = useState(50);
  const [result, setResult] = useState<BatchResult | null>(null);

  const runBatchCompression = async () => {
    setIsRunning(true);
    setResult(null);

    try {
      toast.info(isDryRun ? "Running dry run analysis..." : "Starting batch compression...");

      const { data, error } = await supabase.functions.invoke('batch-compress-images', {
        body: {
          bucket: 'inspection-photos',
          maxWidth,
          quality,
          minSizeKB,
          dryRun: isDryRun,
          limit,
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      setResult(data as BatchResult);

      if (isDryRun) {
        toast.success(`Analysis complete: ${data.processed} files evaluated`);
      } else {
        toast.success(`Compression complete: ${data.compressed} files compressed, saved ${formatBytes(data.totalSavings)}`);
      }

    } catch (err) {
      console.error('Batch compression error:', err);
      toast.error(`Compression failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsRunning(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'compressed':
        return <Badge className="bg-primary/10 text-primary">Compressed</Badge>;
      case 'skipped':
        return <Badge variant="outline">Skipped</Badge>;
      case 'already_compressed':
        return <Badge variant="secondary">Already Done</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Image Compression Manager
        </CardTitle>
        <CardDescription>
          Compress existing images in storage to improve PDF generation performance and reduce storage costs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Settings */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="maxWidth">Max Width (px)</Label>
            <Input
              id="maxWidth"
              type="number"
              value={maxWidth}
              onChange={(e) => setMaxWidth(Number(e.target.value))}
              min={200}
              max={1920}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quality">Quality (%)</Label>
            <Input
              id="quality"
              type="number"
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              min={30}
              max={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minSizeKB">Min Size (KB)</Label>
            <Input
              id="minSizeKB"
              type="number"
              value={minSizeKB}
              onChange={(e) => setMinSizeKB(Number(e.target.value))}
              min={10}
              max={5000}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="limit">Batch Limit</Label>
            <Input
              id="limit"
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              min={1}
              max={200}
            />
          </div>
        </div>

        {/* Dry Run Toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
          <div>
            <Label htmlFor="dryRun" className="font-medium">Dry Run Mode</Label>
            <p className="text-sm text-muted-foreground">
              {isDryRun 
                ? "Preview what would be compressed without making changes" 
                : "Actually compress and replace images in storage"}
            </p>
          </div>
          <Switch
            id="dryRun"
            checked={isDryRun}
            onCheckedChange={setIsDryRun}
          />
        </div>

        {/* Action Button */}
        <Button 
          onClick={runBatchCompression} 
          disabled={isRunning}
          className="w-full"
          variant={isDryRun ? "outline" : "default"}
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isDryRun ? "Analyzing..." : "Compressing..."}
            </>
          ) : (
            <>
              <PlayCircle className="mr-2 h-4 w-4" />
              {isDryRun ? "Run Analysis" : "Start Compression"}
            </>
          )}
        </Button>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{result.processed}</div>
                <div className="text-xs text-muted-foreground">Processed</div>
              </div>
              <div className="p-3 bg-primary/10 rounded-lg text-center">
                <div className="text-2xl font-bold text-primary">{result.compressed}</div>
                <div className="text-xs text-muted-foreground">Compressed</div>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{result.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
              <div className="p-3 bg-destructive/10 rounded-lg text-center">
                <div className="text-2xl font-bold text-destructive">{result.errors}</div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
              <div className="p-3 bg-accent rounded-lg text-center">
                <div className="text-2xl font-bold text-accent-foreground">{formatBytes(result.totalSavings)}</div>
                <div className="text-xs text-muted-foreground">Saved</div>
              </div>
            </div>

            {/* File List */}
            {result.files.length > 0 && (
              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {result.files.map((file, idx) => (
                  <div key={idx} className="p-2 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {file.status === 'compressed' && <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />}
                      {file.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />}
                      {(file.status === 'skipped' || file.status === 'already_compressed') && <HardDrive className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                      <span className="truncate">{file.path.split('/').pop()}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-muted-foreground text-xs">
                        {formatBytes(file.originalSize)}
                        {file.compressedSize && ` → ${formatBytes(file.compressedSize)}`}
                      </span>
                      {getStatusBadge(file.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {result.continuationToken && (
              <p className="text-sm text-muted-foreground text-center">
                More files available. Run again to continue processing.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
