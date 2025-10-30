import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const { isOnline, queueSize, isSyncing, processQueue } = useOfflineSync();

  if (isOnline && queueSize === 0) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-4 py-2 shadow-lg backdrop-blur-sm transition-all',
        isOnline ? 'bg-background/95 border-border' : 'bg-destructive/95 border-destructive text-destructive-foreground'
      )}
    >
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium">
            {isSyncing ? 'Syncing...' : `${queueSize} queued`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={processQueue}
            disabled={isSyncing}
            className="h-6 px-2"
          >
            <RefreshCw className={cn('h-3 w-3', isSyncing && 'animate-spin')} />
          </Button>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span className="text-sm font-medium">Offline Mode</span>
          {queueSize > 0 && (
            <span className="text-xs bg-background/20 px-2 py-0.5 rounded">
              {queueSize} pending
            </span>
          )}
        </>
      )}
    </div>
  );
}
