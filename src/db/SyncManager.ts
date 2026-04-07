import { db as firestore } from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot,
  getDocs,
  deleteDoc
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
    
    // Auto-heal corrupted "categorie_add" items from queue poisoning
    try { await runWithBindings(`UPDATE sync_queue SET type = 'category_add' WHERE type = 'categorie_add'`); } catch(e) {}

    // 0. Auto-repair: Find any items marked synced=0 that aren't in the queue
    await this.repairMissingSyncItems();
    
    // 1. Initial push of any pending items
    await this.processQueue();
    
    // 2. Setup Real-time Listeners
    this.setupListeners();
  }

  private async repairMissingSyncItems() {
    console.log('[SyncManager] Scanning for orphaned unsynced items...');
    const collections = ['transactions', 'accounts', 'categories', 'goals', 'investments', 'reminders', 'tasks'];
    
    for (const col of collections) {
      try {
        const unsynced = await executeQuery(`SELECT * FROM ${col} WHERE synced = 0`);
        for (const item of unsynced) {
          // Check if already in queue
          const inQueue = await executeQuery(`SELECT id FROM sync_queue WHERE payload LIKE ?`, [`%"id":"${item.id}"%`]);
          if (inQueue.length === 0) {
            console.log(`[SyncManager] Repairing: Adding ${col} ${item.id} to queue`);
            const type = col === 'goals' ? 'goal_add' : 
                         col === 'investments' ? 'investment_add' :
                         col === 'reminders' ? 'reminder_add' :
                         col === 'categories' ? 'category_add' :
                         col === 'tasks' ? 'task_add' :
                         col.slice(0, -1) + '_add';
            
            await runWithBindings(
              `INSERT INTO sync_queue (id, type, payload, timestamp, deviceId, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
              [uuidv4(), type, JSON.stringify(item), new Date().toISOString(), this.deviceId]
            );
          }
        }
      } catch (e) {
        console.error(`[SyncManager] Repair failed for ${col}:`, e);
      }
    }
  }

  private stopSync() {
    this.activeListeners.forEach(unsubscribe => unsubscribe());
    this.activeListeners = [];
  }

  private setupListeners() {
    if (!this.userId) return;
    this.stopSync();

    const collections = ['transactions', 'accounts', 'categories', 'goals', 'investments', 'reminders', 'tasks'];
    
    collections.forEach(colName => {
      const colRef = collection(firestore, `users/${this.userId}/${colName}`);
      const unsubscribe = onSnapshot(colRef, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          const data = change.doc.data();
          // Avoid feedback loops: if this change was made by THIS device,
          // skip both 'added' and 'modified' — we already have the latest local data.
          if (data.deviceId === this.deviceId && (change.type === 'added' || change.type === 'modified')) {
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
    } else if (collection === 'goals') {
      await runWithBindings(`
        INSERT OR REPLACE INTO goals (id, name, target_amount, category_id, deadline, linked_accounts, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id,
        data.name,
        data.target_amount,
        data.category_id ?? null,
        data.deadline ?? null,
        data.linked_accounts ?? null,
        data.created_at,
        data.updated_at,
        data.deviceId ?? null
      ]);
    } else if (collection === 'investments') {
      await runWithBindings(`
        INSERT OR REPLACE INTO investments (id, name, type, units, average_buy_price, current_price, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id,
        data.name,
        data.type,
        data.units ?? 0,
        data.average_buy_price ?? 0,
        data.current_price ?? 0,
        data.created_at,
        data.updated_at,
        data.deviceId ?? null
      ]);
    } else if (collection === 'reminders') {
      await runWithBindings(`
        INSERT OR REPLACE INTO reminders (id, title, amount, due_date, frequency, category_id, status, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id,
        data.title,
        data.amount,
        data.due_date,
        data.frequency,
        data.category_id ?? null,
        data.status ?? 'pending',
        data.created_at,
        data.updated_at,
        data.deviceId ?? null
      ]);
    } else if (collection === 'tasks') {
      await runWithBindings(`
        INSERT OR REPLACE INTO tasks (id, title, description, status, due_date, due_time, reminder_enabled, reminder_offset, reminder_sent, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id,
        data.title,
        data.description ?? '',
        data.status ?? 'pending',
        data.due_date ?? null,
        data.due_time ?? null,
        data.reminder_enabled ?? 0,
        data.reminder_offset ?? 5,
        data.reminder_sent ?? 0,
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
          
          if (op.type.endsWith('_delete')) {
            console.log(`[SyncManager] Delete operation completed for ${payload.id}`);
            window.dispatchEvent(new CustomEvent('app-sync-complete'));
            continue;
          }

          const tablePrefix = op.type.split('_')[0];
          let table = '';
          if (tablePrefix === 'goal') table = 'goals';
          else if (tablePrefix === 'investment') table = 'investments';
          else if (tablePrefix === 'reminder') table = 'reminders';
          else if (tablePrefix === 'category' || tablePrefix === 'categorie') table = 'categories';
          else table = tablePrefix + 's';

          if (['transactions', 'accounts', 'categories', 'goals', 'investments', 'reminders', 'tasks'].includes(table)) {
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
      } else if (type.startsWith('goal')) {
        docRef = doc(firestore, `users/${this.userId}/goals/${payload.id}`);
      } else if (type.startsWith('investment')) {
        docRef = doc(firestore, `users/${this.userId}/investments/${payload.id}`);
      } else if (type.startsWith('reminder')) {
        docRef = doc(firestore, `users/${this.userId}/reminders/${payload.id}`);
      } else if (type.startsWith('task')) {
        docRef = doc(firestore, `users/${this.userId}/tasks/${payload.id}`);
      } else if (type === 'settings') {
        docRef = doc(firestore, `users/${this.userId}/config/preferences`);
      } else {
        console.warn('[SyncManager] Unknown operation type:', type);
        return false;
      }

      if (type.endsWith('_delete')) {
        await deleteDoc(docRef);
      } else {
        await setDoc(docRef, { ...payload, syncedAt: new Date().toISOString() }, { merge: true });
      }
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
        if (type.endsWith('_delete')) {
          console.log(`[SyncManager] Direct delete push success for ${payload.id}`);
          window.dispatchEvent(new CustomEvent('app-sync-complete'));
          return;
        }

        const tablePrefix = type.split('_')[0];
        let table = '';
        if (tablePrefix === 'goal') table = 'goals';
        else if (tablePrefix === 'investment') table = 'investments';
        else if (tablePrefix === 'reminder') table = 'reminders';
        else if (tablePrefix === 'category' || tablePrefix === 'categorie') table = 'categories';
        else table = tablePrefix + 's';

        if (['transactions', 'accounts', 'categories', 'goals', 'investments', 'reminders', 'tasks'].includes(table)) {
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

  public async wipeRemoteData() {
    if (!this.userId) return;

    const collections = ['transactions', 'accounts', 'categories', 'goals', 'investments', 'reminders', 'tasks', 'config'];
    
    for (const colName of collections) {
      try {
        const colRef = collection(firestore, `users/${this.userId}/${colName}`);
        const snapshot = await getDocs(colRef);
        
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        console.log(`[SyncManager] Wiped collection: ${colName}`);
      } catch (error) {
        console.error(`[SyncManager] Failed to wipe collection ${colName}:`, error);
      }
    }
  }
}

export const syncManager = new SyncManager();
