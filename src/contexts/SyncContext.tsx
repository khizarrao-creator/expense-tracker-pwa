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
    setIsSyncing(true);
    try {
      const lastSyncStr = localStorage.getItem(`lastSync_${user.uid}`) || new Date('2000-01-01').toISOString();
      await pullFromFirestore(user.uid, lastSyncStr);
      await pushToFirestore(user.uid);
      
      const now = new Date();
      localStorage.setItem(`lastSync_${user.uid}`, now.toISOString());
      setLastSynced(now);
      window.dispatchEvent(new CustomEvent('app-sync-complete'));
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const forceSync = async () => {
    if (!user || isSyncing) return;
    setIsSyncing(true);
    try {
      const epoch = new Date('2000-01-01').toISOString();
      await pushToFirestore(user.uid);
      await pullFromFirestore(user.uid, epoch);
      
      const now = new Date();
      localStorage.setItem(`lastSync_${user.uid}`, now.toISOString());
      setLastSynced(now);
      window.dispatchEvent(new CustomEvent('app-sync-complete'));
    } catch (error) {
      console.error('Force sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    performSync();
    window.addEventListener('online', performSync);
    const interval = setInterval(performSync, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('online', performSync);
      clearInterval(interval);
    };
  }, [user]);

  return (
    <SyncContext.Provider value={{ isSyncing, lastSynced, forceSync }}>
      {children}
    </SyncContext.Provider>
  );
};
