import * as React from 'react';
import { Wifi, WifiOff, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnlineStatus, useOfflineStats } from '@/hooks/use-offline-storage';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Offline status indicator with sync controls
 * Shows connection status and offline queue count
 */
export function OfflineStatusIndicator() {
  const { isOnline, isSyncing, syncNow } = useOnlineStatus();
  const stats = useOfflineStats();

  const handleSyncClick = async () => {
    if (!isOnline || isSyncing) return;
    await syncNow();
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        {/* Connection Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              data-testid="offline-indicator"
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                isOnline
                  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
              )}
            >
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Offline</span>
                </>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isOnline ? 'Connected to server' : 'No internet connection'}</p>
            {!isOnline && stats.unsyncedCount > 0 && (
              <p className="text-xs mt-1">
                {stats.unsyncedCount} measurement{stats.unsyncedCount !== 1 ? 's' : ''} will sync when online
              </p>
            )}
          </TooltipContent>
        </Tooltip>

        {/* Offline Queue Count */}
        {stats.unsyncedCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                data-testid="offline-queue-count"
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
              >
                <CloudOff className="h-3.5 w-3.5" />
                <span>{stats.unsyncedCount} queued</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{stats.unsyncedCount} measurement{stats.unsyncedCount !== 1 ? 's' : ''} pending sync</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Sync Button */}
        {(stats.unsyncedCount > 0 || isSyncing) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="sync-now-button"
                variant="ghost"
                size="sm"
                onClick={handleSyncClick}
                disabled={!isOnline || isSyncing}
                className="h-7 px-2"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="syncing-indicator" />
                    <span className="ml-1.5 text-xs hidden sm:inline">Syncing...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="h-3.5 w-3.5" />
                    <span className="ml-1.5 text-xs hidden sm:inline">Sync</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isSyncing ? 'Syncing measurements...' : 'Sync now'}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Sync Status */}
        {isSyncing && (
          <div
            data-testid="sync-status"
            className="text-xs text-muted-foreground hidden md:inline"
          >
            Syncing...
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
