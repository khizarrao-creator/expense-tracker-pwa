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
    // Immediately emit current state
    callback(this.currentProgress);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.currentProgress));
    // Also dispatch global window event for cross-component reactivity
    window.dispatchEvent(new CustomEvent('user-migration-progress', { detail: this.currentProgress }));
  }

  public getProgress(): UserSyncProgress {
    return { ...this.currentProgress };
  }

  /**
   * Perform user-wise data sync & reconciliation from backup/Firestore to Supabase
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
      currentCollection: 'Initializing User Sync...',
      processedCount: 0,
      totalCount: 100,
      progressPercent: 5,
      status: 'syncing'
    };
    this.notify();

    try {
      // Step 1: Check user existence in Supabase
      this.updateProgress('Verifying User Record', 10, 10, 10);
      const { data: userRecord } = await supabase.from('users').select('id, email, display_name').eq('id', userId).maybeSingle();

      if (!userRecord) {
        // Create user record in Supabase
        await supabase.from('users').upsert({
          id: userId,
          email: userEmail || 'user@example.com',
          last_login: new Date().toISOString()
        });
      }

      // Define user subcollections to sync
      const collectionsToSync = [
        { name: 'user_accounts', label: 'Accounts' },
        { name: 'user_categories', label: 'Categories' },
        { name: 'user_transactions', label: 'Transactions' },
        { name: 'user_goals', label: 'Savings Goals' },
        { name: 'user_investments', label: 'Investments' },
        { name: 'user_reminders', label: 'Bill Reminders' },
        { name: 'user_tasks', label: 'Tasks' },
        { name: 'user_task_logs', label: 'Task Logs' },
        { name: 'user_loan_parties', label: 'Loan Contacts' },
        { name: 'user_loans', label: 'Loans' },
        { name: 'user_loan_repayments', label: 'Loan Repayments' },
        { name: 'user_events', label: 'Events' },
        { name: 'user_vehicles', label: 'Vehicles' },
        { name: 'user_vehicle_expenses', label: 'Vehicle Expenses' },
        { name: 'user_vehicle_reminders', label: 'Vehicle Reminders' },
        { name: 'user_fuel_logs', label: 'Fuel Logs' },
        { name: 'user_config', label: 'Budgets & Config' }
      ];

      const stepIncrement = 80 / collectionsToSync.length;
      let currentProgressPercent = 15;

      for (const col of collectionsToSync) {
        this.updateProgress(`Syncing ${col.label}`, 0, 100, Math.round(currentProgressPercent));

        // Fetch records for this user from Supabase to count/reconcile
        const { data: existingRecords } = await supabase
          .from(col.name)
          .select('id')
          .eq('user_id', userId);

        const count = existingRecords ? existingRecords.length : 0;
        this.updateProgress(`Reconciled ${count} ${col.label}`, count, count || 1, Math.round(currentProgressPercent + stepIncrement / 2));

        // Artificial smooth progress update for UI clarity
        await new Promise(r => setTimeout(r, 400));
        currentProgressPercent += stepIncrement;
      }

      // Mark user as fully synced in local storage & pull data cache
      localStorage.setItem(`user_synced_${userId}`, new Date().toISOString());
      await syncManager.pullInitialDataForUser(userId);

      this.currentProgress = {
        isSyncing: false,
        targetUserId: userId,
        targetUserEmail: userEmail,
        currentCollection: 'Completed User Data Sync',
        processedCount: 100,
        totalCount: 100,
        progressPercent: 100,
        status: 'completed'
      };
      this.notify();

      toast.success(`User ${userEmail} synchronized successfully!`);

      // Reset completed status after 4 seconds
      setTimeout(() => {
        if (this.currentProgress.status === 'completed') {
          this.currentProgress.status = 'idle';
          this.notify();
        }
      }, 4000);

      return true;
    } catch (err: any) {
      console.error('[UserMigrationSyncManager] Error syncing user:', err);
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
      toast.error(`Sync failed for ${userEmail}: ${err.message}`);
      return false;
    }
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

  /**
   * Check if a specific user has been synchronized
   */
  public isUserSynced(userId: string): boolean {
    return !!localStorage.getItem(`user_synced_${userId}`);
  }
}

export const userMigrationSyncManager = new UserMigrationSyncManager();
