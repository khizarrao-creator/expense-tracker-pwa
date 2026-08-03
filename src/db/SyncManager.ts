import { supabase, isSupabaseConfigured } from '../supabase';
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

const COLLECTION_TO_TABLE_MAP: Record<string, string> = {
  transactions: 'user_transactions',
  accounts: 'user_accounts',
  categories: 'user_categories',
  goals: 'user_goals',
  investments: 'user_investments',
  reminders: 'user_reminders',
  tasks: 'user_tasks',
  task_logs: 'user_task_logs',
  loan_parties: 'user_loan_parties',
  loans: 'user_loans',
  loan_repayments: 'user_loan_repayments',
  events: 'user_events',
  fuel_logs: 'user_fuel_logs',
  config: 'user_config',
  vehicles: 'user_vehicles',
  vehicle_expenses: 'user_vehicle_expenses',
  vehicle_reminders: 'user_vehicle_reminders',
};

class SyncManager {
  private userId: string | null = null;
  private deviceId: string;
  private isOnline: boolean = navigator.onLine;
  private isProcessingQueue: boolean = false;
  private realtimeChannel: any = null;
  private watchdogInterval: any = null;

  constructor() {
    this.deviceId = localStorage.getItem('deviceId') || uuidv4();
    localStorage.setItem('deviceId', this.deviceId);

    window.addEventListener('online', () => this.handleConnectivityChange(true));
    window.addEventListener('offline', () => this.handleConnectivityChange(false));

    this.startWatchdog();
  }

  private startWatchdog() {
    if (this.watchdogInterval) return;
    this.watchdogInterval = setInterval(() => {
      if (this.isOnline && this.userId) {
        this.processQueue();
      }
    }, 30000);
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

  private async repairMissingSyncItems() {
    console.log('[SyncManager] Scanning for orphaned unsynced items...');
    const collections = Object.keys(COLLECTION_TO_TABLE_MAP);

    for (const col of collections) {
      try {
        const unsynced = await executeQuery(`SELECT * FROM ${col} WHERE synced = 0`);
        for (const item of unsynced) {
          const recordId = col === 'config' ? item.key : item.id;
          const idMatchPattern = col === 'config' ? `%"key":"${recordId}"%` : `%"id":"${recordId}"%`;
          
          const inQueue = await executeQuery(`SELECT id FROM sync_queue WHERE payload LIKE ?`, [idMatchPattern]);
          if (inQueue.length === 0) {
            console.log(`[SyncManager] Repairing: Adding ${col} ${recordId} to queue`);
            const type = col === 'goals' ? 'goal_add' :
              col === 'investments' ? 'investment_add' :
                col === 'reminders' ? 'reminder_add' :
                  col === 'categories' ? 'category_add' :
                    col === 'tasks' ? 'task_add' :
                      col === 'task_logs' ? 'task_log_add' :
                        col === 'loan_parties' ? 'loan_party_add' :
                        col === 'loan_repayments' ? 'loan_repayment_add' :
                          col === 'loans' ? 'loan_add' :
                            col === 'events' ? 'event_add' :
                              col === 'fuel_logs' ? 'fuel_log_add' :
                                col === 'vehicles' ? 'vehicle_add' :
                                  col === 'vehicle_expenses' ? 'vehicle_expense_add' :
                                    col === 'vehicle_reminders' ? 'vehicle_reminder_add' :
                                      col === 'config' ? 'config_update' :
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
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  private setupListeners() {
    if (!this.userId || !isSupabaseConfigured) return;
    this.stopSync();

    const channelName = `sync-user-${this.userId}`;
    this.realtimeChannel = supabase.channel(channelName);

    Object.entries(COLLECTION_TO_TABLE_MAP).forEach(([colName, tableName]) => {
      this.realtimeChannel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: `user_id=eq.${this.userId}`,
        },
        async (payload: any) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            await this.updateLocalCache(colName, payload.new);
          } else if (payload.eventType === 'DELETE') {
            const id = colName === 'config' ? payload.old?.key : payload.old?.id;
            if (id) {
              await this.removeFromLocalCache(colName, id);
            }
          }
          window.dispatchEvent(new CustomEvent('app-sync-complete'));
        }
      );
    });

    this.realtimeChannel.subscribe();
  }

  public async startSync() {
    if (!this.userId) return;

    try {
      await runWithBindings(`UPDATE sync_queue SET type = REPLACE(type, 'categorie_', 'category_') WHERE type LIKE 'categorie_%'`);
      await runWithBindings(`UPDATE sync_queue SET type = 'config_update' WHERE type = 'confi_add'`);
    } catch (e) { }

    await this.pullInitialDataForUser(this.userId);
    await this.repairMissingSyncItems();
    await this.reconcileWithServer();
    await this.processQueue();
    this.setupListeners();
  }

  public async pullInitialDataForUser(userId?: string) {
    const targetUid = userId || this.userId;
    if (!targetUid || !isSupabaseConfigured) return;

    console.log(`[SyncManager] Pulling cloud data cache for user: ${targetUid}...`);

    for (const [colName, tableName] of Object.entries(COLLECTION_TO_TABLE_MAP)) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .eq('user_id', targetUid);

        if (error || !data) continue;

        if (data.length > 0) {
          console.log(`[SyncManager] Caching ${data.length} ${colName} for user ${targetUid}`);
          for (const row of data) {
            await this.updateLocalCache(colName, row);
          }
        }
      } catch (err) {
        console.warn(`[SyncManager] Failed to pull ${colName} for ${targetUid}:`, err);
      }
    }

    console.log(`[SyncManager] Pull complete for user: ${targetUid}`);
    window.dispatchEvent(new CustomEvent('app-sync-complete'));
  }

  private async reconcileWithServer() {
    if (!this.userId || !isSupabaseConfigured) return;
    console.log('[SyncManager] Starting server reconciliation with Supabase...');

    for (const [colName, tableName] of Object.entries(COLLECTION_TO_TABLE_MAP)) {
      try {
        const idCol = colName === 'config' ? 'key' : 'id';
        const { data, error } = await supabase
          .from(tableName)
          .select(idCol)
          .eq('user_id', this.userId);

        if (error) throw error;

        const serverIds = new Set((data || []).map((item: any) => item[idCol]));
        const localItems = await executeQuery(`SELECT ${idCol} as id FROM ${colName} WHERE synced = 1`);
        const orphanedIds = localItems.filter(item => !serverIds.has(item.id)).map(item => item.id);

        if (orphanedIds.length > 0) {
          console.log(`[SyncManager] Found ${orphanedIds.length} orphaned items in ${colName}. Purging...`);
          for (const id of orphanedIds) {
            await runWithBindings(`DELETE FROM ${colName} WHERE ${idCol} = ?`, [id]);
          }
        }
      } catch (error) {
        console.error(`[SyncManager] Reconciliation failed for ${colName}:`, error);
      }
    }
    console.log('[SyncManager] Reconciliation complete.');
  }

  private async updateLocalCache(collection: string, data: any) {
    const idCol = collection === 'config' ? 'key' : 'id';
    const recordId = collection === 'config' ? data.key : data.id;
    const existing = await executeQuery(`SELECT updated_at FROM ${collection} WHERE ${idCol} = ?`, [recordId]);

    if (existing.length > 0 && existing[0].updated_at && data.updated_at) {
      const localUpdatedAt = new Date(existing[0].updated_at).getTime();
      const remoteUpdatedAt = new Date(data.updated_at).getTime();

      if (remoteUpdatedAt <= localUpdatedAt) {
        return;
      }
    }

    if (collection === 'transactions') {
      await runWithBindings(`
        INSERT OR REPLACE INTO transactions 
        (id, type, amount, category, description, date, payment_method, account_id, to_account_id, created_at, updated_at, deviceId, synced, subcategory, event_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
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
        data.device_id ?? data.deviceId ?? null,
        data.subcategory ?? null,
        data.event_id ?? null
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
        data.device_id ?? data.deviceId ?? null
      ]);
    } else if (collection === 'categories') {
      await runWithBindings(`
        INSERT OR REPLACE INTO categories (id, name, type, icon, created_at, updated_at, deviceId, synced, parent_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      `, [
        data.id,
        data.name,
        data.type,
        data.icon ?? '',
        data.created_at,
        data.updated_at,
        data.device_id ?? data.deviceId ?? null,
        data.parent_id ?? null
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
        data.device_id ?? data.deviceId ?? null
      ]);
    } else if (collection === 'investments') {
      await runWithBindings(`
        INSERT OR REPLACE INTO investments (id, name, type, units, average_buy_price, current_price, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id,
        data.name ?? 'Unnamed Investment',
        data.type ?? 'Crypto',
        data.units ?? 0,
        data.average_buy_price ?? 0,
        data.current_price ?? 0,
        data.created_at ?? new Date().toISOString(),
        data.updated_at ?? new Date().toISOString(),
        data.device_id ?? data.deviceId ?? null
      ]);
    } else if (collection === 'reminders') {
      await runWithBindings(`
        INSERT OR REPLACE INTO reminders (id, title, amount, due_date, frequency, category_id, status, created_at, updated_at, deviceId, synced, whatsapp_phone, whatsapp_name, whatsapp_date, whatsapp_time, whatsapp_sent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
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
        data.device_id ?? data.deviceId ?? null,
        data.whatsapp_phone ?? null,
        data.whatsapp_name ?? null,
        data.whatsapp_date ?? null,
        data.whatsapp_time ?? null,
        data.whatsapp_sent ?? 0
      ]);
    } else if (collection === 'tasks') {
      await runWithBindings(`
        INSERT OR REPLACE INTO tasks (id, title, description, status, due_date, due_time, reminder_enabled, reminder_offset, reminder_sent, priority, category, created_at, updated_at, deviceId, synced, time_spent, last_started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
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
        data.priority ?? 'medium',
        data.category ?? null,
        data.created_at,
        data.updated_at,
        data.device_id ?? data.deviceId ?? null,
        data.time_spent ?? 0,
        data.last_started_at ?? null
      ]);
    } else if (collection === 'task_logs') {
      await runWithBindings(`
        INSERT OR REPLACE INTO task_logs (id, task_id, type, timestamp, notes, duration, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id,
        data.task_id,
        data.type,
        data.timestamp,
        data.notes ?? null,
        data.duration ?? 0,
        data.created_at || data.timestamp,
        data.updated_at || data.timestamp,
        data.device_id ?? data.deviceId ?? null
      ]);
    } else if (collection === 'loan_parties') {
      await runWithBindings(`
        INSERT OR REPLACE INTO loan_parties (id, name, phone, email, notes, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id,
        data.name,
        data.phone ?? null,
        data.email ?? null,
        data.notes ?? null,
        data.created_at,
        data.updated_at,
        data.device_id ?? data.deviceId ?? null
      ]);
    } else if (collection === 'loans') {
      await runWithBindings(`
        INSERT OR REPLACE INTO loans (id, direction, party_id, amount, description, date, due_date, category, interest_rate, interest_type, status, account_id, loss_amount, loss_remarks, created_at, updated_at, deviceId, synced, event_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `, [
        data.id,
        data.direction,
        data.party_id,
        data.amount,
        data.description ?? null,
        data.date,
        data.due_date ?? null,
        data.category ?? 'Personal',
        data.interest_rate ?? 0,
        data.interest_type ?? 'none',
        data.status ?? 'open',
        data.account_id ?? null,
        data.loss_amount ?? 0,
        data.loss_remarks ?? null,
        data.created_at,
        data.updated_at,
        data.device_id ?? data.deviceId ?? null,
        data.event_id ?? null
      ]);
    } else if (collection === 'loan_repayments') {
      await runWithBindings(`
        INSERT OR REPLACE INTO loan_repayments (id, loan_id, amount, date, notes, account_id, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id,
        data.loan_id,
        data.amount,
        data.date,
        data.notes ?? null,
        data.account_id ?? null,
        data.created_at,
        data.updated_at,
        data.device_id ?? data.deviceId ?? null
      ]);
    } else if (collection === 'events') {
      await runWithBindings(`
        INSERT OR REPLACE INTO events (id, name, description, date, total_cost, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id,
        data.name,
        data.description ?? null,
        data.date,
        data.total_cost ?? 0,
        data.created_at,
        data.updated_at,
        data.device_id ?? data.deviceId ?? null
      ]);
    } else if (collection === 'fuel_logs') {
      await runWithBindings(`
        INSERT OR REPLACE INTO fuel_logs (id, fuel_type, price_per_liter, total_cost, liters, date, transaction_id, vehicle_id, created_at, updated_at, deviceId, synced, attachment_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `, [
        data.id,
        data.fuel_type,
        data.price_per_liter,
        data.total_cost,
        data.liters,
        data.date,
        data.transaction_id ?? null,
        data.vehicle_id ?? null,
        data.created_at,
        data.updated_at,
        data.device_id ?? data.deviceId ?? null,
        data.attachment_url ?? null
      ]);
    } else if (collection === 'vehicles') {
      await runWithBindings(`
        INSERT OR REPLACE INTO vehicles (
          id, name, type, custom_type, created_at, updated_at, deviceId, synced,
          purchase_date, purchase_price, seller_info, chassis_number, engine_number, license_plate,
          reg_book_url, insurance_url, license_url, photos_url, service_records_url
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.id,
        data.name,
        data.type,
        data.custom_type ?? null,
        data.created_at,
        data.updated_at,
        data.device_id ?? data.deviceId ?? null,
        data.purchase_date ?? null,
        data.purchase_price ?? null,
        data.seller_info ?? null,
        data.chassis_number ?? null,
        data.engine_number ?? null,
        data.license_plate ?? null,
        data.reg_book_url ?? null,
        data.insurance_url ?? null,
        data.license_url ?? null,
        data.photos_url ?? null,
        data.service_records_url ?? null
      ]);
    } else if (collection === 'vehicle_expenses') {
      await runWithBindings(`
        INSERT OR REPLACE INTO vehicle_expenses (id, vehicle_id, expense_type, cost, date, description, attachment_url, transaction_id, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id,
        data.vehicle_id,
        data.expense_type,
        data.cost,
        data.date,
        data.description ?? null,
        data.attachment_url ?? null,
        data.transaction_id ?? null,
        data.created_at,
        data.updated_at,
        data.device_id ?? data.deviceId ?? null
      ]);
    } else if (collection === 'vehicle_reminders') {
      await runWithBindings(`
        INSERT OR REPLACE INTO vehicle_reminders (id, vehicle_id, service_type, reminder_type, target_date, target_mileage, status, created_at, updated_at, deviceId, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        data.id,
        data.vehicle_id,
        data.service_type,
        data.reminder_type,
        data.target_date ?? null,
        data.target_mileage ?? null,
        data.status ?? 'pending',
        data.created_at,
        data.updated_at,
        data.device_id ?? data.deviceId ?? null
      ]);
    } else if (collection === 'config') {
      await runWithBindings(`
        INSERT OR REPLACE INTO config (key, value, updated_at, synced)
        VALUES (?, ?, ?, 1)
      `, [
        data.key,
        data.value,
        data.updated_at
      ]);

      if (data.key.startsWith('budget_')) {
        try {
          const budget = JSON.parse(data.value);
          await runWithBindings(
            `INSERT OR REPLACE INTO budgets (category, subcategory, amount, updated_at) VALUES (?, ?, ?, ?)`,
            [budget.category, budget.subcategory || '', budget.amount, budget.updated_at]
          );
        } catch (e) { console.error('Failed to parse budget config', e); }
      }
    }
  }

  private async removeFromLocalCache(collection: string, id: string) {
    if (collection === 'config') {
      if (id.startsWith('budget_')) {
        const parts = id.split('_');
        if (parts.length >= 3) {
          const category = parts[1];
          const subcategory = parts.slice(2).join('_');
          await runWithBindings(`DELETE FROM budgets WHERE category = ? AND subcategory = ?`, [category, subcategory]);
        }
      }
      await runWithBindings(`DELETE FROM config WHERE key = ?`, [id]);
    } else {
      await runWithBindings(`DELETE FROM ${collection} WHERE id = ?`, [id]);
    }
  }

  public async processQueue() {
    if (this.isProcessingQueue || !this.isOnline || !this.userId) return;

    this.isProcessingQueue = true;
    window.dispatchEvent(new CustomEvent('sync-status-changed', { detail: { syncing: true } }));

    try {
      const ops = await executeQuery(`SELECT * FROM sync_queue WHERE status IN ('pending', 'failed') ORDER BY timestamp ASC LIMIT 50`);

      for (const op of ops) {
        const payload = JSON.parse(op.payload);
        const success = await this.pushToSupabase(op.type, payload);

        if (success) {
          await runWithBindings(`DELETE FROM sync_queue WHERE id = ?`, [op.id]);

          if (op.type.endsWith('_delete')) {
            window.dispatchEvent(new CustomEvent('app-sync-complete'));
            continue;
          }

          const tablePrefix = op.type.split('_')[0];
          let table = '';
          if (op.type.startsWith('task_log')) table = 'task_logs';
          else if (op.type.startsWith('vehicle_expense')) table = 'vehicle_expenses';
          else if (op.type.startsWith('vehicle_reminder')) table = 'vehicle_reminders';
          else if (tablePrefix === 'goal') table = 'goals';
          else if (tablePrefix === 'config') table = 'config';
          else if (tablePrefix === 'investment') table = 'investments';
          else if (tablePrefix === 'reminder') table = 'reminders';
          else if (tablePrefix === 'category' || tablePrefix === 'categorie') table = 'categories';
          else if (tablePrefix === 'loan' && op.type.includes('_party')) table = 'loan_parties';
          else if (tablePrefix === 'loan' && op.type.includes('_repayment')) table = 'loan_repayments';
          else if (tablePrefix === 'event') table = 'events';
          else if (tablePrefix === 'fuel') table = 'fuel_logs';
          else if (tablePrefix === 'vehicle') table = 'vehicles';
          else table = tablePrefix + 's';

          if (Object.keys(COLLECTION_TO_TABLE_MAP).includes(table)) {
            const idCol = table === 'config' ? 'key' : 'id';
            const recordId = table === 'config' ? payload.key : payload.id;
            await runWithBindings(`UPDATE ${table} SET synced = 1 WHERE ${idCol} = ?`, [recordId]);
            window.dispatchEvent(new CustomEvent('app-sync-complete'));
          }
        } else {
          await runWithBindings(`UPDATE sync_queue SET status = 'failed' WHERE id = ?`, [op.id]);
        }
      }
      window.dispatchEvent(new CustomEvent('app-sync-complete'));
    } catch (error) {
      console.error('[SyncManager] Queue processing ERROR:', error);
    } finally {
      this.isProcessingQueue = false;
      window.dispatchEvent(new CustomEvent('sync-status-changed', { detail: { syncing: false } }));
    }
  }

  private async pushToSupabase(type: string, payload: any): Promise<boolean> {
    if (!this.userId || !isSupabaseConfigured) return false;

    let colName = '';
    if (type.startsWith('transaction')) colName = 'transactions';
    else if (type.startsWith('account')) colName = 'accounts';
    else if (type.startsWith('category')) colName = 'categories';
    else if (type.startsWith('goal')) colName = 'goals';
    else if (type.startsWith('investment')) colName = 'investments';
    else if (type.startsWith('reminder')) colName = 'reminders';
    else if (type.startsWith('task_log')) colName = 'task_logs';
    else if (type.startsWith('task')) colName = 'tasks';
    else if (type.startsWith('loan_party')) colName = 'loan_parties';
    else if (type.startsWith('loan_repayment')) colName = 'loan_repayments';
    else if (type.startsWith('loan')) colName = 'loans';
    else if (type.startsWith('event')) colName = 'events';
    else if (type.startsWith('fuel_log')) colName = 'fuel_logs';
    else if (type.startsWith('vehicle_expense')) colName = 'vehicle_expenses';
    else if (type.startsWith('vehicle_reminder')) colName = 'vehicle_reminders';
    else if (type.startsWith('vehicle')) colName = 'vehicles';
    else if (type === 'config_update') colName = 'config';

    const tableName = COLLECTION_TO_TABLE_MAP[colName];
    if (!tableName) return false;

    try {
      await this.ensureUserRecordExists();

      if (type.endsWith('_delete')) {
        const idCol = colName === 'config' ? 'key' : 'id';
        const recordId = colName === 'config' ? payload.key : payload.id;
        const { error } = await supabase.from(tableName).delete().eq(idCol, recordId).eq('user_id', this.userId);
        if (error) throw error;
      } else {
        const cleanPayload = this.sanitizePostgresPayload(payload);

        const { error } = await supabase.from(tableName).upsert(cleanPayload);
        if (error) throw error;
      }
      return true;
    } catch (error: any) {
      console.error(`[SyncManager] Supabase push failed for ${type}:`, error);
      return false;
    }
  }

  private async ensureUserRecordExists(): Promise<void> {
    if (!this.userId || !isSupabaseConfigured) return;
    try {
      const { data } = await supabase.from('users').select('id').eq('id', this.userId).maybeSingle();
      if (!data) {
        const userObj = {
          id: this.userId,
          email: localStorage.getItem('userEmail') || `${this.userId}@user.app`,
          display_name: localStorage.getItem('userName') || 'User',
          is_pro: false,
          plan: 'standard',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        const { error } = await supabase.from('users').upsert(userObj, { onConflict: 'id' });
        if (error && error.code === '23503') {
          // Missing plan in plans table - seed default plan and retry
          await supabase.from('plans').upsert({
            id: 'standard',
            name: 'Standard',
            price: 0,
            currency: 'PKR',
            billing_cycle: 'forever',
            features: ['transactions', 'accounts', 'categories', 'dashboard', 'goals', 'reminders', 'calculator', 'converter', 'tasks', 'loans', 'events', 'fuel', 'reports', 'subscriptions', 'projects'],
            limits: { aiCallsPerDay: 0, maxTransactions: 10000, maxUploadsPerDay: 0 },
            badge_icon: 'shield',
            badge_color: '#6B7280',
            display_order: 1
          }, { onConflict: 'id' });
          await supabase.from('users').upsert(userObj, { onConflict: 'id' });
        }
      }
    } catch (e) {
      console.warn('[SyncManager] ensureUserRecordExists warning:', e);
    }
  }

  private sanitizePostgresPayload(rawPayload: any): any {
    if (!rawPayload || typeof rawPayload !== 'object') return {};

    const clean: any = {};
    for (const [key, value] of Object.entries(rawPayload)) {
      if (key === 'synced' || key === 'deviceId') continue;

      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      clean[snakeKey] = value;
    }

    clean.user_id = this.userId;
    clean.device_id = rawPayload.deviceId || rawPayload.device_id || this.deviceId;
    clean.synced_at = new Date().toISOString();

    return clean;
  }

  public async performOperation(type: string, payload: any, localAction: () => Promise<any>) {
    const isSimulating = localStorage.getItem('simulated_user_id') !== null;
    const isReadOnly = localStorage.getItem('simulated_read_only') !== 'false';

    if (isSimulating && isReadOnly) {
      try {
        const { toast } = await import('sonner');
        toast.warning('🔒 Read-Only Safeguard Active: Edits/deletions are disabled during simulation mode. Toggle Read-Only OFF in the top bar to allow edits.');
      } catch (e) { }
      return;
    }

    await localAction();

    if (this.isOnline && this.userId && isSupabaseConfigured) {
      const success = await this.pushToSupabase(type, payload);
      if (success) {
        if (type.endsWith('_delete')) {
          window.dispatchEvent(new CustomEvent('app-sync-complete'));
          return;
        }

        const tablePrefix = type.split('_')[0];
        let table = '';
        if (type.startsWith('task_log')) table = 'task_logs';
        else if (type.startsWith('vehicle_expense')) table = 'vehicle_expenses';
        else if (type.startsWith('vehicle_reminder')) table = 'vehicle_reminders';
        else if (tablePrefix === 'goal') table = 'goals';
        else if (tablePrefix === 'investment') table = 'investments';
        else if (tablePrefix === 'reminder') table = 'reminders';
        else if (tablePrefix === 'category' || tablePrefix === 'categorie') table = 'categories';
        else if (tablePrefix === 'loan' && type.includes('_party')) table = 'loan_parties';
        else if (tablePrefix === 'loan' && type.includes('_repayment')) table = 'loan_repayments';
        else if (tablePrefix === 'event') table = 'events';
        else if (tablePrefix === 'fuel') table = 'fuel_logs';
        else if (tablePrefix === 'vehicle') table = 'vehicles';
        else table = tablePrefix + 's';

        if (Object.keys(COLLECTION_TO_TABLE_MAP).includes(table)) {
          await runWithBindings(`UPDATE ${table} SET synced = 1 WHERE id = ?`, [payload.id]);
        }
        window.dispatchEvent(new CustomEvent('app-sync-complete'));
        return;
      }
    }

    const deviceId = this.deviceId;
    const timestamp = new Date().toISOString();
    await runWithBindings(
      `INSERT INTO sync_queue (id, type, payload, timestamp, deviceId, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [uuidv4(), type, JSON.stringify(payload), timestamp, deviceId]
    );
  }

  public async wipeRemoteData() {
    if (!this.userId || !isSupabaseConfigured) return;

    for (const tableName of Object.values(COLLECTION_TO_TABLE_MAP)) {
      try {
        await supabase.from(tableName).delete().eq('user_id', this.userId);
      } catch (error) {
        console.error(`[SyncManager] Failed to wipe table ${tableName}:`, error);
      }
    }
  }
}

export const syncManager = new SyncManager();
