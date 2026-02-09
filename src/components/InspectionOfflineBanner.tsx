import { useState, useEffect } from 'react';
import { WifiOff, Cloud, CloudOff, RefreshCw, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';

interface InspectionOfflineBannerProps {
  isOnline: boolean;
  isCached: boolean;
  hasPendingChanges: boolean;
  lastSyncTime: Date | null;
  pendingImageCount?: number;
  onSyncNow?: () => void;
  isSyncing?: boolean;
}

export function InspectionOfflineBanner({
  isOnline,
  isCached,
  hasPendingChanges,
  lastSyncTime,
  pendingImageCount = 0,
  onSyncNow,
  isSyncing = false
}: InspectionOfflineBannerProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show banner when offline or has pending changes
    setIsVisible(!isOnline || hasPendingChanges || pendingImageCount > 0);
  }, [isOnline, hasPendingChanges, pendingImageCount]);

  if (!isVisible && isCached && isOnline) {
    // Just show a subtle "Available Offline" indicator
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1 text-xs bg-accent text-accent-foreground">
                <Cloud className="h-3 w-3" />
                Available Offline
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>This inspection is cached and available offline</p>
              {lastSyncTime && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last synced: {format(lastSyncTime, 'MMM d, HH:mm')}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  // Determine the variant styles
  const getVariantStyles = () => {
    if (!isOnline) {
      return 'bg-destructive/10 border border-destructive/20 text-destructive';
    }
    if (hasPendingChanges) {
      return 'bg-primary/10 border border-primary/20 text-primary';
    }
    return 'bg-muted border border-border text-muted-foreground';
  };

  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-2 rounded-lg text-sm ${getVariantStyles()}`}>
      <div className="flex items-center gap-3">
        {!isOnline ? (
          <>
            <WifiOff className="h-4 w-4" />
            <span className="font-medium">Offline Mode</span>
            {isCached && (
              <Badge variant="outline" className="text-xs bg-accent text-accent-foreground">
                <CheckCircle className="h-3 w-3 mr-1" />
                Cached
              </Badge>
            )}
          </>
        ) : hasPendingChanges ? (
          <>
            <CloudOff className="h-4 w-4" />
            <span className="font-medium">Unsaved Changes</span>
          </>
        ) : (
          <>
            <Cloud className="h-4 w-4" />
            <span className="font-medium">Online</span>
          </>
        )}

        {pendingImageCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {pendingImageCount} image{pendingImageCount > 1 ? 's' : ''} pending
          </Badge>
        )}

        {lastSyncTime && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Last synced: {format(lastSyncTime, 'HH:mm')}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isOnline && hasPendingChanges && onSyncNow && (
          <Button 
            size="sm" 
            variant="outline"
            onClick={onSyncNow}
            disabled={isSyncing}
            className="h-7 text-xs"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 mr-1" />
                Sync Now
              </>
            )}
          </Button>
        )}

        {!isOnline && (
          <span className="text-xs">
            Changes will sync when connected
          </span>
        )}
      </div>
    </div>
  );
}
