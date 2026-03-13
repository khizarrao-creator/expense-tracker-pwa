import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { pushToFirestore, pullFromFirestore } from '../db/sync';

interface SyncContextType {
  isSyncing: boolean;
  lastSynced: Date | null;
  forceSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType>({
  isSyncing: false,
  lastSynced: null,
  forceSync: async () => {},
});

export const useSync = () => useContext(SyncContext);

export const SyncProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const performSync = async () => {
    if (!user || isSyncing || !navigator.onLine) return;

    try {
      setIsSyncing(true);
      const lastSyncStr = localStorage.getItem(`lastSync_${user.uid}`) || new Date('2000-01-01').toISOString();
      
      // Pull first, then push
      await pullFromFirestore(user.uid, lastSyncStr);
      await pushToFirestore(user.uid);
      
      const now = new Date();
      localStorage.setItem(`lastSync_${user.uid}`, now.toISOString());
      setLastSynced(now);
      
      // Dispatch event to notify other contexts (like Currency/Theme)
      window.dispatchEvent(new CustomEvent('app-sync-complete'));
    } catch (error) {
      console.error('Sync process failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    // Sync on initial load/auth change
    performSync();

    // Sync when coming online
    const handleOnline = () => performSync();
    window.addEventListener('online', handleOnline);

    // Periodic sync (every 5 minutes)
    const interval = setInterval(() => {
      performSync();
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
    };
  }, [user]);

  return (
    <SyncContext.Provider value={{ isSyncing, lastSynced, forceSync: performSync }}>
      {children}
    </SyncContext.Provider>
  );
};
