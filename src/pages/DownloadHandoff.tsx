import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { deleteDownloadRequest, getDownloadRequest, type StoredDownloadHandoffRequest } from '@/lib/downloadHandoff';
import { Download, Loader2 } from 'lucide-react';

const MAX_POLL_ATTEMPTS = 600;
const POLL_INTERVAL_MS = 1000;

function buildDirectDownloadUrl(url: string, fileName: string): string {
  const downloadUrl = new URL(url, window.location.origin);
  downloadUrl.searchParams.set('download', fileName);
  return downloadUrl.toString();
}

function triggerTopLevelBlobDownload(blobUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function DownloadHandoff() {
  const { requestId } = useParams();
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<StoredDownloadHandoffRequest | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    if (!requestId) {
      setError('Missing download request.');
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const pollForRequest = async () => {
      while (!cancelled && attempts < MAX_POLL_ATTEMPTS) {
        const pendingRequest = await getDownloadRequest(requestId);

        if (pendingRequest && pendingRequest.status === 'ready') {
          setRequest(pendingRequest);
          return;
        }

        if (pendingRequest && pendingRequest.status === 'pending') {
          // Entry exists but payload not yet ready — keep waiting
        }

        attempts += 1;
        await new Promise(resolve => window.setTimeout(resolve, POLL_INTERVAL_MS));
      }

      if (!cancelled) {
        setError('The report generation timed out. Please close this tab and try again.');
      }
    };

    void pollForRequest();

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  useEffect(() => {
    if (!request?.blob) {
      setBlobUrl(null);
      return;
    }

    const nextBlobUrl = URL.createObjectURL(request.blob);
    setBlobUrl(nextBlobUrl);

    return () => {
      URL.revokeObjectURL(nextBlobUrl);
    };
  }, [request]);

  useEffect(() => {
    if (!request || autoStartedRef.current) {
      return;
    }

    if (request.url) {
      autoStartedRef.current = true;
      void deleteDownloadRequest(request.id);
      window.location.replace(buildDirectDownloadUrl(request.url, request.fileName));
      return;
    }

    if (!blobUrl) {
      return;
    }

    autoStartedRef.current = true;
    triggerTopLevelBlobDownload(blobUrl, request.fileName);
    void deleteDownloadRequest(request.id);
  }, [blobUrl, request]);

  const handleRetryDownload = useCallback(() => {
    if (!request) {
      return;
    }

    if (request.url) {
      window.location.assign(buildDirectDownloadUrl(request.url, request.fileName));
      return;
    }

    if (blobUrl) {
      triggerTopLevelBlobDownload(blobUrl, request.fileName);
    }
  }, [blobUrl, request]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Preparing your report download</CardTitle>
            <CardDescription>
              {request?.fileName ?? 'Please wait while the browser receives the PDF.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : request ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  If your PDF did not download automatically, use the button below.
                </p>
                <Button onClick={handleRetryDownload} className="w-full gap-2">
                  <Download className="h-4 w-4" />
                  Download PDF again
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for the file payload...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}