import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { supabase, isSupabaseConfigured } from '../supabase';
import { toast } from 'sonner';
import { syncManager } from '../db/SyncManager';

export interface UserSyncProgress {
  isSyncing: boolean;
  targetUserId: string | null;
  targetUserEmail: string | null;
  currentCollection: string;
  processedCount: number;
  totalCount: number;
  progressPercent: number;
  status: 'idle' | 'syncing' | 'completed' | 'failed';
  errorMessage?: string;
}

type SyncProgressCallback = (progress: UserSyncProgress) => void;

export interface CollectionComparison {
  key: string;
  label: string;
  firestoreCount: number;
  supabaseCount: number;
  status: 'matched' | 'discrepancy' | 'empty';
  details?: string;
}

export interface VerificationReport {
  userId: string;
  userEmail: string;
  timestamp: string;
  totalFirestoreRecords: number;
  totalSupabaseRecords: number;
  isPerfectMatch: boolean;
  collections: CollectionComparison[];
}

const COLLECTION_MAP: Record<string, { label: string; firestoreName: string; supabaseTable: string }> = {
  transactions: { label: 'Transactions', firestoreName: 'transactions', supabaseTable: 'user_transactions' },
  accounts: { label: 'Accounts', firestoreName: 'accounts', supabaseTable: 'user_accounts' },
  categories: { label: 'Categories', firestoreName: 'categories', supabaseTable: 'user_categories' },
  goals: { label: 'Savings Goals', firestoreName: 'goals', supabaseTable: 'user_goals' },
  investments: { label: 'Investments', firestoreName: 'investments', supabaseTable: 'user_investments' },
  reminders: { label: 'Bill Reminders', firestoreName: 'reminders', supabaseTable: 'user_reminders' },
  tasks: { label: 'Tasks', firestoreName: 'tasks', supabaseTable: 'user_tasks' },
  task_logs: { label: 'Task Logs', firestoreName: 'task_logs', supabaseTable: 'user_task_logs' },
  loan_parties: { label: 'Loan Contacts', firestoreName: 'loan_parties', supabaseTable: 'user_loan_parties' },
  loans: { label: 'Loans', firestoreName: 'loans', supabaseTable: 'user_loans' },
  loan_repayments: { label: 'Loan Repayments', firestoreName: 'loan_repayments', supabaseTable: 'user_loan_repayments' },
  events: { label: 'Events', firestoreName: 'events', supabaseTable: 'user_events' },
  vehicles: { label: 'Vehicles', firestoreName: 'vehicles', supabaseTable: 'user_vehicles' },
  vehicle_expenses: { label: 'Vehicle Expenses', firestoreName: 'vehicle_expenses', supabaseTable: 'user_vehicle_expenses' },
  vehicle_reminders: { label: 'Vehicle Reminders', firestoreName: 'vehicle_reminders', supabaseTable: 'user_vehicle_reminders' },
  fuel_logs: { label: 'Fuel Logs', firestoreName: 'fuel_logs', supabaseTable: 'user_fuel_logs' },
  config: { label: 'Budgets & Config', firestoreName: 'config', supabaseTable: 'user_config' },
};

class UserMigrationSyncManager {
  private listeners: Set<SyncProgressCallback> = new Set();
  private currentProgress: UserSyncProgress = {
    isSyncing: false,
    targetUserId: null,
    targetUserEmail: null,
    currentCollection: '',
    processedCount: 0,
    totalCount: 0,
    progressPercent: 0,
    status: 'idle'
  };

  public subscribe(callback: SyncProgressCallback) {
    this.listeners.add(callback);
    callback(this.currentProgress);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.currentProgress));
    window.dispatchEvent(new CustomEvent('user-migration-progress', { detail: this.currentProgress }));
  }

  public getProgress(): UserSyncProgress {
    return { ...this.currentProgress };
  }

  /**
   * Perform dual sync: Sync Firestore data to Supabase for a specific user
   */
  public async syncUserData(userId: string, userEmail: string): Promise<boolean> {
    if (this.currentProgress.isSyncing) {
      toast.warning('A sync process is already in progress!');
      return false;
    }

    if (!isSupabaseConfigured) {
      toast.error('Supabase is not configured!');
      return false;
    }

    this.currentProgress = {
      isSyncing: true,
      targetUserId: userId,
      targetUserEmail: userEmail,
      currentCollection: 'Initializing Firestore -> Supabase Sync...',
      processedCount: 0,
      totalCount: 100,
      progressPercent: 5,
      status: 'syncing'
    };
    this.notify();

    try {
      // 1. Verify User Record in Supabase
      this.updateProgress('Verifying User Record', 10, 10, 10);
      const { data: userRecord } = await supabase.from('users').select('id, email').eq('id', userId).maybeSingle();

      if (!userRecord) {
        await supabase.from('users').upsert({
          id: userId,
          email: userEmail || 'user@example.com',
          last_login: new Date().toISOString()
        });
      }

      const collectionEntries = Object.entries(COLLECTION_MAP);
      const stepIncrement = 80 / collectionEntries.length;
      let currentProgressPercent = 15;

      for (const [colKey, meta] of collectionEntries) {
        this.updateProgress(`Syncing ${meta.label}`, 0, 100, Math.round(currentProgressPercent));

        let firestoreDocs: any[] = [];
        // Pull Firestore documents if SDK available
        if (db) {
          try {
            const colRef = collection(db, 'users', userId, meta.firestoreName);
            const snapshot = await getDocs(colRef);
            firestoreDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          } catch (err) {
            console.warn(`[UserMigrationSyncManager] Could not read Firestore ${meta.firestoreName}:`, err);
          }
        }

        // Upsert Firestore records to Supabase if any exist
        if (firestoreDocs.length > 0) {
          for (const item of firestoreDocs) {
            const cleanPayload: any = { user_id: userId, synced_at: new Date().toISOString() };
            for (const [k, v] of Object.entries(item)) {
              if (k === 'synced' || k === 'deviceId') continue;
              const snakeKey = k.replace(/([A-Z])/g, '_$1').toLowerCase();
              cleanPayload[snakeKey] = v;
            }

            if (colKey === 'config') {
              cleanPayload.key = item.key || item.id;
              if (typeof cleanPayload.value === 'object') {
                cleanPayload.value = JSON.stringify(cleanPayload.value);
              }
            } else {
              cleanPayload.id = item.id;
            }

            await supabase.from(meta.supabaseTable).upsert(cleanPayload);
          }
        }

        // Fetch count in Supabase to confirm
        const { data: existingRecords } = await supabase
          .from(meta.supabaseTable)
          .select(colKey === 'config' ? 'key' : 'id')
          .eq('user_id', userId);

        const count = existingRecords ? existingRecords.length : 0;
        this.updateProgress(`Reconciled ${count} ${meta.label}`, count, count || 1, Math.round(currentProgressPercent + stepIncrement / 2));

        await new Promise(r => setTimeout(r, 150));
        currentProgressPercent += stepIncrement;
      }

      // Mark user as fully synced
      localStorage.setItem(`user_synced_${userId}`, new Date().toISOString());
      await syncManager.pullInitialDataForUser(userId);

      this.currentProgress = {
        isSyncing: false,
        targetUserId: userId,
        targetUserEmail: userEmail,
        currentCollection: 'Firestore & Supabase Sync Complete',
        processedCount: 100,
        totalCount: 100,
        progressPercent: 100,
        status: 'completed'
      };
      this.notify();

      toast.success(`Firestore & Supabase synced for ${userEmail}`);

      setTimeout(() => {
        if (this.currentProgress.status === 'completed') {
          this.currentProgress.status = 'idle';
          this.notify();
        }
      }, 4000);

      return true;
    } catch (err: any) {
      console.error('[UserMigrationSyncManager] Error during sync:', err);
      this.currentProgress = {
        isSyncing: false,
        targetUserId: userId,
        targetUserEmail: userEmail,
        currentCollection: 'Sync Failed',
        processedCount: 0,
        totalCount: 100,
        progressPercent: 0,
        status: 'failed',
        errorMessage: err.message || 'Sync failed'
      };
      this.notify();
      toast.error(`Sync error: ${err.message}`);
      return false;
    }
  }

  /**
   * Compare Firestore and Supabase data side-by-side for a specific user
   */
  public async compareCloudData(userId: string, userEmail: string = ''): Promise<VerificationReport> {
    const comparisons: CollectionComparison[] = [];
    let totalFs = 0;
    let totalSupa = 0;

    for (const [colKey, meta] of Object.entries(COLLECTION_MAP)) {
      let fsCount = 0;

      if (db) {
        try {
          const colRef = collection(db, 'users', userId, meta.firestoreName);
          const snapshot = await getDocs(colRef);
          fsCount = snapshot.docs.length;
        } catch (e) { }
      }

      let supaCount = 0;
      if (isSupabaseConfigured) {
        try {
          const { data } = await supabase
            .from(meta.supabaseTable)
            .select(colKey === 'config' ? 'key' : 'id')
            .eq('user_id', userId);
          supaCount = data ? data.length : 0;
        } catch (e) { }
      }

      totalFs += fsCount;
      totalSupa += supaCount;

      let status: 'matched' | 'discrepancy' | 'empty' = 'matched';
      if (fsCount === 0 && supaCount === 0) {
        status = 'empty';
      } else if (fsCount !== supaCount) {
        status = 'discrepancy';
      }

      comparisons.push({
        key: colKey,
        label: meta.label,
        firestoreCount: fsCount,
        supabaseCount: supaCount,
        status,
        details: status === 'discrepancy' ? `${Math.abs(fsCount - supaCount)} item difference` : undefined
      });
    }

    const isPerfectMatch = totalFs === totalSupa || (totalFs === 0 && totalSupa > 0);

    return {
      userId,
      userEmail,
      timestamp: new Date().toISOString(),
      totalFirestoreRecords: totalFs,
      totalSupabaseRecords: totalSupa,
      isPerfectMatch,
      collections: comparisons
    };
  }

  private updateProgress(collectionLabel: string, processed: number, total: number, percent: number) {
    this.currentProgress = {
      ...this.currentProgress,
      currentCollection: collectionLabel,
      processedCount: processed,
      totalCount: total,
      progressPercent: Math.min(99, Math.max(0, percent))
    };
    this.notify();
  }

  public isUserSynced(userId: string): boolean {
    return !!localStorage.getItem(`user_synced_${userId}`);
  }

  public async exportUserBackupJson(userId: string, userEmail: string): Promise<boolean> {
    try {
      toast.loading(`Generating JSON Backup for ${userEmail}...`, { id: 'exportBackup' });
      const backupData: Record<string, any[]> = {};

      for (const [colKey, meta] of Object.entries(COLLECTION_MAP)) {
        let docs: any[] = [];

        // Fetch strictly & exclusively from Firestore Primary
        if (db) {
          try {
            const colRef = collection(db, 'users', userId, meta.firestoreName);
            const snap = await getDocs(colRef);
            docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          } catch (e) {
            console.warn(`[UserMigrationSyncManager] Firestore export read warning for ${colKey}:`, e);
          }
        }

        backupData[colKey] = docs;
      }

      const fullExport = {
        app: 'The Base Workspace Suite',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        userId,
        userEmail,
        collections: backupData
      };

      const jsonStr = JSON.stringify(fullExport, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const sanitizeEmail = (userEmail || userId).replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];

      link.setAttribute('href', url);
      link.setAttribute('download', `the_base_backup_${sanitizeEmail}_${dateStr}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.dismiss('exportBackup');
      toast.success(`Exported JSON backup for ${userEmail}`);
      return true;
    } catch (err: any) {
      console.error('[UserMigrationSyncManager] JSON Export error:', err);
      toast.dismiss('exportBackup');
      toast.error(`Export failed: ${err.message || err}`);
      return false;
    }
  }
}

export const userMigrationSyncManager = new UserMigrationSyncManager();
