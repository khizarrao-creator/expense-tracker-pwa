import React, { useState, useEffect } from 'react';
import { userMigrationSyncManager, type UserSyncProgress } from '../services/UserMigrationSyncManager';
import { RefreshCw, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';

export const SyncProgressBar: React.FC = () => {
  const [progress, setProgress] = useState<UserSyncProgress>(userMigrationSyncManager.getProgress());

  useEffect(() => {
    const unsubscribe = userMigrationSyncManager.subscribe(newProgress => {
      setProgress(newProgress);
    });

    const handleCustomEvent = (e: any) => {
      if (e.detail) {
        setProgress(e.detail);
      }
    };
    window.addEventListener('user-migration-progress', handleCustomEvent);

    return () => {
      unsubscribe();
      window.removeEventListener('user-migration-progress', handleCustomEvent);
    };
  }, []);

  if (!progress.isSyncing && progress.status !== 'completed' && progress.status !== 'failed') {
    return null;
  }

  return (
    <div className="w-full bg-card border-b border-border text-foreground px-4 py-3 shadow-sm transition-all duration-300 z-50">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left Status Info */}
        <div className="flex items-center gap-3">
          {progress.status === 'syncing' && (
            <div className="p-2 bg-primary/10 rounded-xl border border-primary/20">
              <RefreshCw className="w-4 h-4 text-primary animate-spin" />
            </div>
          )}
          {progress.status === 'completed' && (
            <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
          )}
          {progress.status === 'failed' && (
            <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {progress.status === 'syncing' ? 'User Data Sync' : progress.status === 'completed' ? 'Sync Completed' : 'Sync Failed'}
              </span>
              {progress.targetUserEmail && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-muted text-foreground font-mono">
                  {progress.targetUserEmail}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-foreground">
              {progress.currentCollection || 'Processing records...'}
            </p>
          </div>
        </div>

        {/* Right Progress Bar & Percentage */}
        <div className="w-full md:w-80 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-primary" /> Reconciling Records
            </span>
            <span className="text-foreground font-mono">{progress.progressPercent}%</span>
          </div>
          <div className="w-full bg-muted h-2 rounded-full overflow-hidden border border-border">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                progress.status === 'completed'
                  ? 'bg-emerald-500'
                  : progress.status === 'failed'
                  ? 'bg-rose-500'
                  : 'bg-primary'
              }`}
              style={{ width: `${Math.max(4, progress.progressPercent)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
