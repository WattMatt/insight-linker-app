import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WifiOff, RefreshCw, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OfflineSubsectionEnhancementsProps {
  isOnline: boolean;
  offlineDocumentCount?: number;
  offlineFloorPlanCount?: number;
  onSyncClick?: () => void;
  isSyncing?: boolean;
}

export function OfflineSubsectionEnhancements({
  isOnline,
  offlineDocumentCount = 0,
  offlineFloorPlanCount = 0,
  onSyncClick,
  isSyncing = false,
}: OfflineSubsectionEnhancementsProps) {
  if (isOnline && offlineDocumentCount === 0 && offlineFloorPlanCount === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {!isOnline && (
        <Alert className="bg-orange-500/10 border-orange-500/20">
          <WifiOff className="h-4 w-4 text-orange-500" />
          <AlertDescription className="text-orange-500">
            <div className="flex items-center justify-between">
              <span>
                You're offline. Changes will be saved locally and synced when connection is restored.
              </span>
              <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                Offline Mode
              </Badge>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {isOnline && (offlineDocumentCount > 0 || offlineFloorPlanCount > 0) && (
        <Alert className="bg-blue-500/10 border-blue-500/20">
          <Database className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-blue-500">
            <div className="flex items-center justify-between">
              <span>
                {offlineDocumentCount} document(s) and {offlineFloorPlanCount} floor plan(s) pending sync
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={onSyncClick}
                disabled={isSyncing}
                className="h-8 border-blue-500/20 hover:bg-blue-500/10"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

interface OfflineDocumentBadgeProps {
  isOffline: boolean;
}

export function OfflineDocumentBadge({ isOffline }: OfflineDocumentBadgeProps) {
  if (!isOffline) return null;

  return (
    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs ml-2">
      <Database className="h-3 w-3 mr-1" />
      Offline
    </Badge>
  );
}
