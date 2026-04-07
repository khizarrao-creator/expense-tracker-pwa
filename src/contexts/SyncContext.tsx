import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { syncManager } from '../db/SyncManager';

interface SyncContextType {
  isSyncing: boolean;
  isOnline: boolean;
  lastSynced: Date | null;
  forceSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType>({
  isSyncing: false,
  isOnline: navigator.onLine,
  lastSynced: null,
  forceSync: async () => {},
});

export const useSync = () => useContext(SyncContext);

export const SyncProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  useEffect(() => {
    syncManager.setUserId(user?.uid || null);

    const handleSyncStatus = (e: any) => {
      if (e.detail?.online !== undefined) setIsOnline(e.detail.online);
      if (e.detail?.syncing !== undefined) setIsSyncing(e.detail.syncing);
    };

    const handleSyncComplete = () => {
      setLastSynced(new Date());
      setIsSyncing(false);
    };

    window.addEventListener('sync-status-changed' as any, handleSyncStatus);
    window.addEventListener('app-sync-complete', handleSyncComplete);

    return () => {
      window.removeEventListener('sync-status-changed' as any, handleSyncStatus);
      window.removeEventListener('app-sync-complete', handleSyncComplete);
    };
  }, [user]);

  const forceSync = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      await syncManager.processQueue();
      setLastSynced(new Date());
    } catch (error) {
      console.error('Force sync failed:', error);
    }
  };

  return (
    <SyncContext.Provider value={{ isSyncing, isOnline, lastSynced, forceSync }}>
      {children}
    </SyncContext.Provider>
  );
};
