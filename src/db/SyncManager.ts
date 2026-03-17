import { db as firestore } from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot
} from 'firebase/firestore';
import { executeQuery, runWithBindings } from './sqlite';
import { v4 as uuidv4 } from 'uuid';

export interface SyncOperation {
  id: string;
  type: string;
  payload: any;
  timestamp: string;
  deviceId: string;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
}

class SyncManager {
  private userId: string | null = null;
  private deviceId: string;
  private isOnline: boolean = navigator.onLine;
  private isProcessingQueue: boolean = false;
  private activeListeners: (() => void)[] = [];
  private watchdogInterval: any = null;

  constructor() {
    this.deviceId = localStorage.getItem('deviceId') || uuidv4();
    localStorage.setItem('deviceId', this.deviceId);

    window.addEventListener('online', () => this.handleConnectivityChange(true));
    window.addEventListener('offline', () => this.handleConnectivityChange(false));

    // Start a watchdog to catch any missed sync opportunities
    this.startWatchdog();
  }

  private startWatchdog() {
    if (this.watchdogInterval) return;
    this.watchdogInterval = setInterval(() => {
      if (this.isOnline && this.userId) {
        this.processQueue();
      }
    }, 30000); // Check every 30 seconds
  }

  public setUserId(userId: string | null) {
    this.userId = userId;
    if (userId) {
      this.startSync();
      this.startWatchdog();
    } else {
      this.stopSync();
      if (this.watchdogInterval) {
        clearInterval(this.watchdogInterval);
        this.watchdogInterval = null;
      }
    }
  }

  private handleConnectivityChange(online: boolean) {
    this.isOnline = online;
    if (online && this.userId) {
      this.processQueue();
    }
    window.dispatchEvent(new CustomEvent('sync-status-changed', { detail: { online } }));
  }

  private async startSync() {
    if (!this.userId) return;
    
    // 1. Initial push of any pending items
    await this.processQueue();
    
    // 2. Setup Real-time Listeners
    this.setupListeners();
  }

  private stopSync() {
    this.activeListeners.forEach(unsubscribe => unsubscribe());
    this.activeListeners = [];
  }

  private setupListeners() {
    if (!this.userId) return;
    this.stopSync();

    const collections = ['transactions', 'accounts', 'categories'];
    
    collections.forEach(colName => {
      const colRef = collection(firestore, `users/${this.userId}/${colName}`);
      const unsubscribe = onSnapshot(colRef, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          const data = change.doc.data();
          // Avoid feedback loops: if this change was made by THIS device, don't overwrite local DB
          if (data.deviceId === this.deviceId && change.type === 'added') {
            return; 
          }
          
          if (change.type === 'added' || change.type === 'modified') {
            await this.updateLocalCache(colName, data);
          } else if (change.type === 'removed') {
            await this.removeFromLocalCache(colName, change.doc.id);
          }
        });
        window.dispatchEvent(new CustomEvent('app-sync-complete'));
      });
      this.activeListeners.push(unsubscribe);
    });
  }

  private async updateLocalCache(collection: string, data: any) {
    if (collection === 'transactions') {
      await runWithBindings(`
        INSERT OR REPLACE INTO transactions 
        (id, type, amount, category, description, date, payment_method, account_id, to_account_id, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id, 
        data.type, 
        data.amount, 
        data.category, 
        data.description ?? null, 
        data.date, 
        data.payment_method ?? '', 
        data.account_id ?? null, 
        data.to_account_id ?? null, 
        data.created_at, 
        data.updated_at, 
        data.deviceId ?? null
      ]);
    } else if (collection === 'accounts') {
      await runWithBindings(`
        INSERT OR REPLACE INTO accounts (id, name, type, initial_balance, color, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id, 
        data.name, 
        data.type, 
        data.initial_balance ?? 0, 
        data.color ?? null, 
        data.created_at, 
        data.updated_at, 
        data.deviceId ?? null
      ]);
    } else if (collection === 'categories') {
      await runWithBindings(`
        INSERT OR REPLACE INTO categories (id, name, type, icon, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id, 
        data.name, 
        data.type, 
        data.icon ?? '', 
        data.created_at, 
        data.updated_at, 
        data.deviceId ?? null
      ]);
    }
  }

  private async removeFromLocalCache(collection: string, id: string) {
    await runWithBindings(`DELETE FROM ${collection} WHERE id = ?`, [id]);
  }

  public async processQueue() {
    if (this.isProcessingQueue || !this.isOnline || !this.userId) {
      console.log('[SyncManager] Skip processQueue:', { processing: this.isProcessingQueue, online: this.isOnline, userId: this.userId });
      return;
    }
    
    this.isProcessingQueue = true;
    console.log('[SyncManager] Starting processQueue...');
    window.dispatchEvent(new CustomEvent('sync-status-changed', { detail: { syncing: true } }));

    try {
      const ops = await executeQuery(`SELECT * FROM sync_queue WHERE status IN ('pending', 'failed') ORDER BY timestamp ASC LIMIT 50`);
      console.log(`[SyncManager] Found ${ops.length} items to sync`);
      
      for (const op of ops) {
        const payload = JSON.parse(op.payload);
        console.log(`[SyncManager] Syncing ${op.type} (ID: ${payload.id})...`);
        const success = await this.pushToFirestore(op.type, payload);
        
        if (success) {
          console.log(`[SyncManager] Successfully pushed ${payload.id}`);
          await runWithBindings(`DELETE FROM sync_queue WHERE id = ?`, [op.id]);
          
          const table = op.type.split('_')[0] + 's';
          if (['transactions', 'accounts', 'categories'].includes(table)) {
            console.log(`[SyncManager] Updating ${table} local record ${payload.id} to synced=1`);
            await runWithBindings(`UPDATE ${table} SET synced = 1 WHERE id = ?`, [payload.id]);
            // Verify and notify UI
            window.dispatchEvent(new CustomEvent('app-sync-complete'));
          }
        } else {
          console.warn(`[SyncManager] Push FAILED for ${payload.id}`);
          await runWithBindings(`UPDATE sync_queue SET status = 'failed' WHERE id = ?`, [op.id]);
          break; 
        }
      }
      window.dispatchEvent(new CustomEvent('app-sync-complete'));
    } catch (error) {
      console.error('[SyncManager] Queue processing ERROR:', error);
    } finally {
      this.isProcessingQueue = false;
      console.log('[SyncManager] processQueue finished');
      window.dispatchEvent(new CustomEvent('sync-status-changed', { detail: { syncing: false } }));
    }
  }

  private async pushToFirestore(type: string, payload: any): Promise<boolean> {
    if (!this.userId) {
      console.warn('[SyncManager] pushToFirestore: No userId');
      return false;
    }
    
    try {
      let docRef;
      if (type.startsWith('transaction')) {
        docRef = doc(firestore, `users/${this.userId}/transactions/${payload.id}`);
      } else if (type.startsWith('account')) {
        docRef = doc(firestore, `users/${this.userId}/accounts/${payload.id}`);
      } else if (type.startsWith('category')) {
        docRef = doc(firestore, `users/${this.userId}/categories/${payload.id}`);
      } else if (type === 'settings') {
        docRef = doc(firestore, `users/${this.userId}/config/preferences`);
      } else {
        console.warn('[SyncManager] Unknown operation type:', type);
        return false;
      }

      await setDoc(docRef, { ...payload, syncedAt: new Date().toISOString() }, { merge: true });
      return true;
    } catch (error) {
      console.error(`[SyncManager] Firestore push failed for ${type}:`, error);
      return false;
    }
  }

  public async performOperation(type: string, payload: any, localAction: () => Promise<any>) {
    console.log(`[SyncManager] performOperation: ${type}`, payload);
    await localAction();

    if (this.isOnline && this.userId) {
      const success = await this.pushToFirestore(type, payload);
      if (success) {
        const table = type.split('_')[0] + 's';
        if (['transactions', 'accounts', 'categories'].includes(table)) {
          console.log(`[SyncManager] Direct push success. Updating ${table} local record ${payload.id} to synced=1`);
          await runWithBindings(`UPDATE ${table} SET synced = 1 WHERE id = ?`, [payload.id]);
        }
        window.dispatchEvent(new CustomEvent('app-sync-complete'));
        return;
      } else {
        console.warn(`[SyncManager] Direct push failed, adding to queue: ${payload.id}`);
      }
    }

    const deviceId = this.deviceId;
    const timestamp = new Date().toISOString();
    console.log(`[SyncManager] Queueing operation for ${payload.id}`);
    await runWithBindings(
      `INSERT INTO sync_queue (id, type, payload, timestamp, deviceId, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [uuidv4(), type, JSON.stringify(payload), timestamp, deviceId]
    );
  }
}

export const syncManager = new SyncManager();
