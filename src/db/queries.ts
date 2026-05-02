import { executeQuery, runWithBindings, vacuumDB } from './sqlite';
import { v4 as uuidv4 } from 'uuid';
import { syncManager } from './SyncManager';

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  description: string;
  date: string;
  payment_method: string;
  account_id: string | null;
  to_account_id: string | null;
  created_at: string;
  updated_at: string;
  synced: number;
  subcategory: string | null;
  event_id: string | null;
}

export interface Account {
  id: string;
  name: string;
  type: string;
  initial_balance: number;
  color: string;
  created_at: string;
  updated_at: string;
  deviceId: string | null;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  icon: string;
  created_at: string;
  updated_at: string;
  deviceId: string | null;
  parent_id: string | null;
}

export interface FuelLog {
  id: string;
  fuel_type: string;
  price_per_liter: number;
  total_cost: number;
  liters: number;
  date: string;
  transaction_id: string | null;
  created_at: string;
  updated_at: string;
  synced: number;
}

export const addToSyncQueue = async (type: string, payload: any) => {
  const id = uuidv4();
  const timestamp = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  await runWithBindings(
    `INSERT INTO sync_queue (id, type, payload, timestamp, deviceId, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
    [id, type, JSON.stringify(payload), timestamp, deviceId]
  );
  return id;
};

export const addTransaction = async (
  type: 'income' | 'expense' | 'transfer',
  amount: number,
  category: string,
  description: string,
  date: string,
  payment_method: string = '',
  account_id: string | null = null,
  to_account_id: string | null = null,
  subcategory: string | null = null,
  providedId?: string,
  event_id: string | null = null
) => {
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const trxData = {
    id, type, amount, category, description: description ?? null, date,
    payment_method: payment_method ?? '', account_id: account_id ?? null,
    to_account_id: to_account_id ?? null, created_at: now, updated_at: now, deviceId,
    subcategory: subcategory ?? null, event_id: event_id ?? null
  };

  await syncManager.performOperation('transaction_add', trxData, () =>
    runWithBindings(
      `INSERT INTO transactions (id, type, amount, category, description, date, payment_method, account_id, to_account_id, created_at, updated_at, deviceId, synced, subcategory, event_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, type, amount, category, description ?? null, date, payment_method ?? '', account_id ?? null, to_account_id ?? null, now, now, deviceId, subcategory ?? null, event_id ?? null]
    )
  );
  return id;
};

const TRANSACTION_UPDATABLE_FIELDS = new Set([
  'type', 'amount', 'category', 'description', 'date',
  'payment_method', 'account_id', 'to_account_id', 'updated_at', 'deviceId', 'subcategory'
]);

export const updateTransaction = async (
  id: string,
  data: Partial<Omit<Transaction, 'id' | 'created_at' | 'synced'>>
) => {
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const sanitizedData: any = {};
  Object.keys(data).forEach(key => {
    if (TRANSACTION_UPDATABLE_FIELDS.has(key)) {
      sanitizedData[key] = (data as any)[key] ?? null;
    }
  });

  const trxData = { id, ...sanitizedData, updated_at: now, deviceId };

  const fields = Object.keys(sanitizedData);
  const values = Object.values(sanitizedData);
  const setClause = fields.map(f => `${f} = ?`).join(', ');

  await syncManager.performOperation('transaction_update', trxData, () =>
    runWithBindings(
      `UPDATE transactions SET ${setClause}, updated_at = ?, deviceId = ?, synced = 0, subcategory = COALESCE(?, subcategory) WHERE id = ?`,
      [...values, now, deviceId, data.subcategory ?? null, id]
    )
  );
};

export const getTransaction = async (id: string): Promise<Transaction | null> => {
  const results = await runWithBindings(`SELECT * FROM transactions WHERE id = ?`, [id]);
  return results[0] || null;
};

export const getTransactions = async (limit: number = 50, offset: number = 0): Promise<(Transaction & { account_name?: string, to_account_name?: string })[]> => {
  return await runWithBindings(
    `SELECT t.*, a.name as account_name, b.name as to_account_name
     FROM transactions t 
     LEFT JOIN accounts a ON t.account_id = a.id 
     LEFT JOIN accounts b ON t.to_account_id = b.id
     ORDER BY t.date DESC, t.created_at DESC 
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
};

export const getTransactionsByMonth = async (yearUrl: string, monthUrl: string): Promise<Transaction[]> => {
  const likeStr = `${yearUrl}-${monthUrl.padStart(2, '0')}-%`;
  return await runWithBindings(
    `SELECT * FROM transactions WHERE date LIKE ? ORDER BY date DESC`,
    [likeStr]
  );
};

export const getSummary = async () => {
  const rows = await executeQuery(`
    SELECT type, SUM(amount) as total 
    FROM transactions 
    GROUP BY type
  `);

  let income = 0;
  let expense = 0;

  rows.forEach((row: any) => {
    if (row.type === 'income') income = row.total;
    if (row.type === 'expense') expense = row.total;
  });

  return {
    income,
    expense,
    balance: income - expense
  };
};

export const getNetWorth = async () => {
  const accountSummaries = await getSummaryByAccount();
  return accountSummaries.reduce((acc: number, curr: any) => {
    return acc
      + (curr.initial_balance || 0)
      + (curr.income || 0)
      - (curr.expense || 0)
      + (curr.transfer_in || 0)
      - (curr.transfer_out || 0);
  }, 0);
};


export const getPaymentMethodStats = async () => {
  return await executeQuery(`
    SELECT payment_method, SUM(amount) as total
    FROM transactions
    WHERE type = 'expense'
    GROUP BY payment_method
    ORDER BY total DESC
  `);
};

export const getExpensesByCategory = async (year: string, month: string) => {
  const likeStr = `${year}-${month.padStart(2, '0')}-%`;
  return await runWithBindings(`
    SELECT category, SUM(amount) as total 
    FROM transactions 
    WHERE type = 'expense' AND date LIKE ? 
    GROUP BY category 
    ORDER BY total DESC
  `, [likeStr]);
};

export type ChartPeriod = 'day' | 'week' | 'month';

const getPeriodDateFilter = (period: ChartPeriod): string => {
  const now = new Date();
  if (period === 'day') {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (period === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 6);
    const y = weekAgo.getFullYear();
    const m = String(weekAgo.getMonth() + 1).padStart(2, '0');
    const d = String(weekAgo.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // month
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
};

export const getExpensesByCategoryByPeriod = async (period: ChartPeriod) => {
  const fromDate = getPeriodDateFilter(period);
  return await runWithBindings(`
    SELECT category, subcategory, SUM(amount) as total 
    FROM transactions 
    WHERE type = 'expense' AND date >= ? 
    GROUP BY category, subcategory 
    ORDER BY total DESC
  `, [fromDate]);
};

export const getPaymentMethodStatsByPeriod = async (period: ChartPeriod) => {
  const fromDate = getPeriodDateFilter(period);
  return await runWithBindings(`
    SELECT payment_method, SUM(amount) as total
    FROM transactions
    WHERE type = 'expense' AND date >= ?
    GROUP BY payment_method
    ORDER BY total DESC
  `, [fromDate]);
};

// --- Budgets ---

export interface Budget {
  category: string;
  subcategory: string | null;
  amount: number;
  updated_at: string;
}

export const getBudgets = async (): Promise<Budget[]> => {
  return await executeQuery(`SELECT * FROM budgets ORDER BY category ASC, subcategory ASC`);
};

export const setBudget = async (category: string, amount: number, subcategory: string | null = null) => {
  const now = new Date().toISOString();
  const subcat = subcategory || '';
  await runWithBindings(
    `INSERT OR REPLACE INTO budgets (category, subcategory, amount, updated_at) VALUES (?, ?, ?, ?)`,
    [category, subcat, amount, now]
  );
};

export const deleteBudget = async (category: string, subcategory: string | null = null) => {
  const subcat = subcategory || '';
  await runWithBindings(`DELETE FROM budgets WHERE category = ? AND subcategory = ?`, [category, subcat]);
};

export interface BudgetVsActualRow {
  category: string;
  subcategory: string | null;
  spent: number;
  budget: number;
  pct: number;
}

export const getBudgetVsActual = async (year: string, month: string): Promise<BudgetVsActualRow[]> => {
  const likeStr = `${year}-${month.padStart(2, '0')}-%`;
  const rows = await runWithBindings(`
    SELECT 
      b.category,
      b.subcategory,
      b.amount as budget,
      (
        SELECT COALESCE(SUM(amount), 0) 
        FROM transactions 
        WHERE category = b.category 
          AND (b.subcategory = '' OR subcategory = b.subcategory)
          AND type = 'expense' 
          AND date LIKE ?
      ) as spent
    FROM budgets b
    ORDER BY b.category ASC, b.subcategory ASC
  `, [likeStr]);

  return rows.map((r: any) => ({
    category: r.category,
    subcategory: r.subcategory,
    spent: r.spent,
    budget: r.budget,
    pct: r.budget > 0 ? (r.spent / r.budget) * 100 : 0,
  }));
};

export interface DailySpend {
  date: string;
  total: number;
}

export const getDailySpendingForMonth = async (year: string, month: string): Promise<DailySpend[]> => {
  const likeStr = `${year}-${month.padStart(2, '0')}-%`;
  return await runWithBindings(`
    SELECT date, SUM(amount) as total
    FROM transactions
    WHERE type = 'expense' AND date LIKE ?
    GROUP BY date
    ORDER BY date ASC
  `, [likeStr]);
};

export const deleteTransaction = async (id: string) => {
  // Check for linked fuel log
  const fuelLog = await getFuelLogByTransactionId(id);
  if (fuelLog) {
    await deleteFuelLog(fuelLog.id);
  }

  await syncManager.performOperation('transaction_delete', { id }, () =>
    runWithBindings(`DELETE FROM transactions WHERE id = ?`, [id])
  );
};

// Categories
export const getCategories = async (type?: 'income' | 'expense', parent_id: string | null | 'all' = null): Promise<Category[]> => {
  let query = `SELECT * FROM categories`;
  const params: any[] = [];
  const clauses: string[] = [];

  if (type) {
    clauses.push(`type = ?`);
    params.push(type);
  }

  if (parent_id !== 'all') {
    if (parent_id) {
      clauses.push(`parent_id = ?`);
      params.push(parent_id);
    } else {
      clauses.push(`parent_id IS NULL`);
    }
  }

  if (clauses.length > 0) {
    query += ` WHERE ` + clauses.join(` AND `);
  }

  query += ` ORDER BY name ASC`;
  return await runWithBindings(query, params);
};

export const addCategory = async (name: string, type: 'income' | 'expense', icon: string = '', parent_id: string | null = null, providedId?: string) => {
  if (!name || !name.trim()) throw new Error('Category name is required');
  const trimmedName = name.trim();
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const catData = { id, name: trimmedName, type, icon, created_at: now, updated_at: now, deviceId, parent_id };

  await syncManager.performOperation('category_add', catData, () =>
    runWithBindings(
      `INSERT INTO categories (id, name, type, icon, created_at, updated_at, deviceId, synced, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, trimmedName, type, icon ?? '', now, now, deviceId, parent_id]
    )
  );
  return id;
};

export const deleteCategory = async (id: string) => {
  await syncManager.performOperation('category_delete', { id }, () =>
    runWithBindings(`DELETE FROM categories WHERE id = ?`, [id])
  );
};

// Accounts
export const getAccounts = async (): Promise<Account[]> => {
  return await executeQuery(`SELECT * FROM accounts ORDER BY name ASC`);
};

export const addAccount = async (name: string, type: string, initial_balance: number = 0, color: string | null = null, providedId?: string) => {
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const accData = {
    id,
    name,
    type,
    initial_balance: Number(initial_balance || 0),
    color,
    created_at: now,
    updated_at: now,
    deviceId
  };

  await syncManager.performOperation('account_add', accData, () =>
    runWithBindings(
      `INSERT INTO accounts (id, name, type, initial_balance, color, created_at, updated_at, deviceId, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, name, type, Number(initial_balance || 0), color ?? null, now, now, deviceId]
    )
  );
  return id;
};

export const deleteAccount = async (id: string) => {
  await syncManager.performOperation('account_delete', { id }, () =>
    runWithBindings(`DELETE FROM accounts WHERE id = ?`, [id])
  );
};

const ACCOUNT_UPDATABLE_FIELDS = new Set([
  'name', 'type', 'initial_balance', 'color', 'updated_at', 'deviceId'
]);

export const updateAccount = async (id: string, data: Partial<Omit<Account, 'id' | 'created_at'>>) => {
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const sanitizedData: any = {};
  Object.keys(data).forEach(key => {
    if (ACCOUNT_UPDATABLE_FIELDS.has(key)) {
      sanitizedData[key] = (data as any)[key] ?? null;
    }
  });

  const accData = { id, ...sanitizedData, updated_at: now, deviceId };

  const fields = Object.keys(sanitizedData);
  const values = Object.values(sanitizedData);
  const setClause = fields.map(f => `${f} = ?`).join(', ');

  await syncManager.performOperation('account_update', accData, () =>
    runWithBindings(
      `UPDATE accounts SET ${setClause}, updated_at = ?, deviceId = ?, synced = 0 WHERE id = ?`,
      [...values, now, deviceId, id]
    )
  );
};

export const getSummaryByAccount = async () => {
  return await executeQuery(`
    SELECT 
      a.id, 
      a.name, 
      a.initial_balance,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'income' AND account_id = a.id) as income,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'expense' AND account_id = a.id) as expense,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'transfer' AND account_id = a.id) as transfer_out,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'transfer' AND to_account_id = a.id) as transfer_in
    FROM accounts a
  `);
};

// --- Financial Intelligence ---

export const getMonthlyComparison = async () => {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-%`;

  const prevDate = new Date();
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-%`;

  const results = await runWithBindings(`
    SELECT 
      SUM(CASE WHEN date LIKE ? AND type = 'income' THEN amount ELSE 0 END) as current_income,
      SUM(CASE WHEN date LIKE ? AND type = 'expense' THEN amount ELSE 0 END) as current_expense,
      SUM(CASE WHEN date LIKE ? AND type = 'income' THEN amount ELSE 0 END) as prev_income,
      SUM(CASE WHEN date LIKE ? AND type = 'expense' THEN amount ELSE 0 END) as prev_expense
    FROM transactions
  `, [currentMonth, currentMonth, prevMonth, prevMonth]);

  return results[0] || { current_income: 0, current_expense: 0, prev_income: 0, prev_expense: 0 };
};

export const getBurnRate = async () => {
  const results = await executeQuery(`
    SELECT SUM(amount) / 30.0 as daily_burn
    FROM transactions
    WHERE type = 'expense' AND date >= date('now', '-30 days')
  `);
  return results[0]?.daily_burn || 0;
};

export const getCategorySpikes = async () => {
  // Simple logic: Compare current month to previous month per category
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-%`;
  const prevDate = new Date();
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-%`;

  return await runWithBindings(`
    WITH current_month AS (
      SELECT category, subcategory, SUM(amount) as total
      FROM transactions
      WHERE type = 'expense' AND date LIKE ?
      GROUP BY category, subcategory
    ),
    prev_month AS (
      SELECT category, subcategory, SUM(amount) as total
      FROM transactions
      WHERE type = 'expense' AND date LIKE ?
      GROUP BY category, subcategory
    )
    SELECT 
      c.category, 
      c.subcategory,
      c.total as current_total, 
      p.total as prev_total,
      CASE WHEN p.total > 0 THEN ((c.total - p.total) / p.total) * 100 ELSE 100 END as increase_pct
    FROM current_month c
    INNER JOIN prev_month p ON c.category = p.category AND (c.subcategory IS p.subcategory)
    WHERE p.total > 0 AND increase_pct > 20
    ORDER BY increase_pct DESC
    LIMIT 5
  `, [currentMonthStr, prevMonthStr]);
};

// --- Savings Goals ---

export interface Goal {
  id: string;
  name: string;
  target_amount: number;
  category_id: string | null;
  deadline: string | null;
  linked_accounts: string | null;
  created_at: string;
  updated_at: string;
  synced: number;
}

export const getGoals = async (): Promise<Goal[]> => {
  return await executeQuery(`SELECT * FROM goals ORDER BY created_at DESC`);
};

export const addGoal = async (
  name: string,
  target_amount: number,
  category_id: string | null = null,
  deadline: string | null = null,
  linked_accounts: string | null = null,
  providedId?: string
) => {
  if (!name || !name.trim()) throw new Error('Goal name is required');
  if (typeof target_amount !== 'number' || target_amount <= 0) throw new Error('Target amount must be a positive number');
  const trimmedName = name.trim();
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const goalData = { id, name: trimmedName, target_amount, category_id, deadline, linked_accounts, created_at: now, updated_at: now, deviceId };

  await syncManager.performOperation('goal_add', goalData, () =>
    runWithBindings(
      `INSERT INTO goals (id, name, target_amount, category_id, deadline, linked_accounts, created_at, updated_at, deviceId, synced) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, trimmedName, target_amount, category_id, deadline, linked_accounts, now, now, deviceId]
    )
  );
  return id;
};

const GOAL_UPDATABLE_FIELDS = new Set([
  'name', 'target_amount', 'category_id', 'deadline', 'linked_accounts', 'updated_at', 'deviceId'
]);

export const updateGoal = async (id: string, data: Partial<Omit<Goal, 'id' | 'created_at' | 'synced'>>) => {
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const sanitizedData: any = {};
  Object.keys(data).forEach(key => {
    if (GOAL_UPDATABLE_FIELDS.has(key)) {
      sanitizedData[key] = (data as any)[key] ?? null;
    }
  });

  const fields = Object.keys(sanitizedData);
  const values = Object.values(sanitizedData);
  const setClause = fields.map(f => `${f} = ?`).join(', ');

  const goalData = { id, ...sanitizedData, updated_at: now, deviceId };

  await syncManager.performOperation('goal_update', goalData, () =>
    runWithBindings(
      `UPDATE goals SET ${setClause}, updated_at = ?, deviceId = ?, synced = 0 WHERE id = ?`,
      [...values, now, deviceId, id]
    )
  );
};

export const deleteGoal = async (id: string) => {
  await syncManager.performOperation('goal_delete', { id }, () =>
    runWithBindings(`DELETE FROM goals WHERE id = ?`, [id])
  );
};

// --- Data Portability ---

export const exportAllData = async () => {
  const [transactions, accounts, categories, goals, investments, reminders, tasks, loan_parties, loans, loan_repayments, events, fuel_logs] = await Promise.all([
    executeQuery(`SELECT * FROM transactions`),
    executeQuery(`SELECT * FROM accounts`),
    executeQuery(`SELECT * FROM categories`),
    executeQuery(`SELECT * FROM goals`),
    executeQuery(`SELECT * FROM investments`),
    executeQuery(`SELECT * FROM reminders`),
    executeQuery(`SELECT * FROM tasks`),
    executeQuery(`SELECT * FROM loan_parties`),
    executeQuery(`SELECT * FROM loans`),
    executeQuery(`SELECT * FROM loan_repayments`),
    executeQuery(`SELECT * FROM events`),
    executeQuery(`SELECT * FROM fuel_logs`)
  ]);

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    transactions,
    accounts,
    categories,
    goals,
    investments,
    reminders,
    tasks,
    loan_parties,
    loans,
    loan_repayments,
    events,
    fuel_logs
  };
};

export const clearAllData = async () => {
  await executeQuery(`DELETE FROM transactions`);
  await executeQuery(`DELETE FROM accounts`);
  await executeQuery(`DELETE FROM categories`);
  await executeQuery(`DELETE FROM goals`);
  await executeQuery(`DELETE FROM investments`);
  await executeQuery(`DELETE FROM reminders`);
  await executeQuery(`DELETE FROM tasks`);
  await executeQuery(`DELETE FROM loan_parties`);
  await executeQuery(`DELETE FROM loans`);
  await executeQuery(`DELETE FROM loan_repayments`);
  await executeQuery(`DELETE FROM events`);
  await executeQuery(`DELETE FROM fuel_logs`);
  await executeQuery(`DELETE FROM sync_queue`);
  // Clear migration flags so they re-run correctly after a fresh wipe.
  // deviceId, currency, and theme are intentionally preserved.
  localStorage.removeItem('re_synced_v6');
};

export const importAllData = async (data: any) => {
  if (!data || typeof data !== 'object') throw new Error('Invalid data format');

  const { transactions, accounts, categories, goals } = data;

  if (accounts) {
    for (const acc of accounts) {
      await runWithBindings(
        `INSERT OR REPLACE INTO accounts (id, name, type, initial_balance, color, created_at, updated_at, deviceId, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [acc.id, acc.name, acc.type, acc.initial_balance, acc.color, acc.created_at, acc.updated_at, acc.deviceId]
      );
      // Queue for sync
      await addToSyncQueue('account_add', { ...acc, initial_balance: Number(acc.initial_balance || 0) });
    }
  }

  if (categories) {
    for (const cat of categories) {
      await runWithBindings(
        `INSERT OR REPLACE INTO categories (id, name, type, icon, created_at, updated_at, deviceId, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [cat.id, cat.name, cat.type, cat.icon, cat.created_at, cat.updated_at, cat.deviceId]
      );
      await addToSyncQueue('category_add', cat);
    }
  }

  if (transactions) {
    for (const t of transactions) {
      await runWithBindings(
        `INSERT OR REPLACE INTO transactions (id, type, amount, category, description, date, payment_method, account_id, to_account_id, created_at, updated_at, deviceId, synced, subcategory, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [t.id, t.type, t.amount, t.category, t.description, t.date, t.payment_method, t.account_id, t.to_account_id, t.created_at, t.updated_at, t.deviceId, t.subcategory ?? null, t.event_id ?? null]
      );
      await addToSyncQueue('transaction_add', t);
    }
  }

  if (goals) {
    for (const g of goals) {
      await runWithBindings(
        `INSERT OR REPLACE INTO goals (id, name, target_amount, category_id, deadline, linked_accounts, created_at, updated_at, deviceId, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [g.id, g.name, g.target_amount, g.category_id, g.deadline, g.linked_accounts ?? null, g.created_at, g.updated_at, g.deviceId]
      );
      await addToSyncQueue('goal_add', g);
    }
  }

  if (data.investments) {
    for (const inv of data.investments) {
      await runWithBindings(
        `INSERT OR REPLACE INTO investments (id, name, type, units, average_buy_price, current_price, created_at, updated_at, deviceId, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [inv.id, inv.name, inv.type, inv.units, inv.average_buy_price, inv.current_price, inv.created_at, inv.updated_at, inv.deviceId]
      );
      // Queue for sync
      await addToSyncQueue('investment_add', inv);
    }
  }

  if (data.reminders) {
    for (const rem of data.reminders) {
      await runWithBindings(
        `INSERT OR REPLACE INTO reminders (id, title, amount, due_date, frequency, category_id, status, created_at, updated_at, deviceId, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [rem.id, rem.title, rem.amount, rem.due_date, rem.frequency, rem.category_id, rem.status, rem.created_at, rem.updated_at, rem.deviceId]
      );
      // Queue for sync
      await addToSyncQueue('reminder_add', rem);
    }
  }

  if (data.tasks) {
    for (const t of data.tasks) {
      await runWithBindings(
        `INSERT OR REPLACE INTO tasks (id, title, description, status, due_date, due_time, reminder_enabled, reminder_offset, reminder_sent, created_at, updated_at, deviceId, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [t.id, t.title, t.description, t.status, t.due_date, t.due_time ?? null, t.reminder_enabled ?? 0, t.reminder_offset ?? 5, t.reminder_sent ?? 0, t.created_at, t.updated_at, t.deviceId]
      );
      await addToSyncQueue('task_add', t);
    }
  }

  if (data.loan_parties) {
    for (const p of data.loan_parties) {
      await runWithBindings(
        `INSERT OR REPLACE INTO loan_parties (id, name, phone, email, notes, created_at, updated_at, deviceId, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [p.id, p.name, p.phone, p.email, p.notes, p.created_at, p.updated_at, p.deviceId]
      );
      await addToSyncQueue('loan_party_add', p);
    }
  }

  if (data.loans) {
    for (const l of data.loans) {
      await runWithBindings(
        `INSERT OR REPLACE INTO loans (id, direction, party_id, amount, description, date, due_date, category, interest_rate, interest_type, status, account_id, created_at, updated_at, deviceId, synced, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [l.id, l.direction, l.party_id, l.amount, l.description, l.date, l.due_date, l.category, l.interest_rate, l.interest_type, l.status, l.account_id, l.created_at, l.updated_at, l.deviceId, l.event_id ?? null]
      );
      await addToSyncQueue('loan_add', l);
    }
  }

  if (data.loan_repayments) {
    for (const r of data.loan_repayments) {
      await runWithBindings(
        `INSERT OR REPLACE INTO loan_repayments (id, loan_id, amount, date, notes, account_id, created_at, updated_at, deviceId, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [r.id, r.loan_id, r.amount, r.date, r.notes, r.account_id, r.created_at, r.updated_at, r.deviceId]
      );
      await addToSyncQueue('loan_repayment_add', r);
    }
  }

  if (data.events) {
    for (const e of data.events) {
      await runWithBindings(
        `INSERT OR REPLACE INTO events (id, name, description, date, total_cost, created_at, updated_at, deviceId, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [e.id, e.name, e.description, e.date, e.total_cost ?? 0, e.created_at, e.updated_at, e.deviceId]
      );
      await addToSyncQueue('event_add', e);
    }
  }

  if (data.fuel_logs) {
    for (const f of data.fuel_logs) {
      await runWithBindings(
        `INSERT OR REPLACE INTO fuel_logs (id, fuel_type, price_per_liter, total_cost, liters, date, transaction_id, created_at, updated_at, deviceId, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [f.id, f.fuel_type, f.price_per_liter, f.total_cost, f.liters, f.date, f.transaction_id ?? null, f.created_at, f.updated_at, f.deviceId]
      );
      await addToSyncQueue('fuel_log_add', f);
    }
  }
};
// --- Investments ---

export interface Investment {
  id: string;
  name: string;
  type: string;
  units: number;
  average_buy_price: number;
  current_price: number;
  created_at: string;
  updated_at: string;
  synced: number;
}

export const getInvestments = async (): Promise<Investment[]> => {
  return await executeQuery(`SELECT * FROM investments ORDER BY created_at DESC`);
};

// --- Fuel Tracking ---

export const getFuelLogs = async (): Promise<FuelLog[]> => {
  return await executeQuery(`SELECT * FROM fuel_logs ORDER BY date DESC, created_at DESC`);
};

export const getFuelLogByTransactionId = async (transactionId: string): Promise<FuelLog | null> => {
  const results = await runWithBindings(`SELECT * FROM fuel_logs WHERE transaction_id = ?`, [transactionId]);
  return results[0] || null;
};

export const addFuelLog = async (
  fuel_type: string,
  price_per_liter: number,
  total_cost: number,
  liters: number,
  date: string,
  providedId?: string,
  transaction_id: string | null = null
) => {
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const fuelData = { id, fuel_type, price_per_liter, total_cost, liters, date, transaction_id, created_at: now, updated_at: now, deviceId };

  await syncManager.performOperation('fuel_log_add', fuelData, () =>
    runWithBindings(
      `INSERT INTO fuel_logs (id, fuel_type, price_per_liter, total_cost, liters, date, transaction_id, created_at, updated_at, deviceId, synced) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, fuel_type, price_per_liter, total_cost, liters, date, transaction_id, now, now, deviceId]
    )
  );
  return id;
};

export const deleteFuelLog = async (id: string) => {
  await syncManager.performOperation('fuel_log_delete', { id }, () =>
    runWithBindings(`DELETE FROM fuel_logs WHERE id = ?`, [id])
  );
};

export const addInvestment = async (
  name: string,
  type: string,
  units: number,
  average_buy_price: number,
  current_price: number,
  providedId?: string
) => {
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const invData = { id, name, type, units, average_buy_price, current_price, created_at: now, updated_at: now, deviceId };

  await syncManager.performOperation('investment_add', invData, () =>
    runWithBindings(
      `INSERT INTO investments (id, name, type, units, average_buy_price, current_price, created_at, updated_at, deviceId, synced) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, name, type, units, average_buy_price, current_price, now, now, deviceId]
    )
  );
  return id;
};

const INVESTMENT_UPDATABLE_FIELDS = new Set([
  'name', 'type', 'units', 'average_buy_price', 'current_price', 'updated_at', 'deviceId'
]);

export const updateInvestment = async (id: string, data: Partial<Omit<Investment, 'id' | 'created_at' | 'synced'>>) => {
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const sanitizedData: any = {};
  Object.keys(data).forEach(key => {
    if (INVESTMENT_UPDATABLE_FIELDS.has(key)) {
      sanitizedData[key] = (data as any)[key] ?? null;
    }
  });

  const fields = Object.keys(sanitizedData);
  const values = Object.values(sanitizedData);
  const setClause = fields.map(f => `${f} = ?`).join(', ');

  const updateData = { id, ...sanitizedData, updated_at: now, deviceId };

  await syncManager.performOperation('investment_update', updateData, () =>
    runWithBindings(
      `UPDATE investments SET ${setClause}, updated_at = ?, deviceId = ?, synced = 0 WHERE id = ?`,
      [...values, now, deviceId, id]
    )
  );
};

export const deleteInvestment = async (id: string) => {
  await syncManager.performOperation('investment_delete', { id }, () =>
    runWithBindings(`DELETE FROM investments WHERE id = ?`, [id])
  );
};

export const calculatePortfolioValue = async () => {
  const results = await executeQuery(`SELECT SUM(units * current_price) as total_value FROM investments`);
  return results[0]?.total_value || 0;
};

export const getInvestmentProfitLoss = async () => {
  const results = await executeQuery(`
    SELECT 
      SUM(units * current_price) as current_total,
      SUM(units * average_buy_price) as cost_basis
    FROM investments
  `);
  const { current_total, cost_basis } = results[0] || { current_total: 0, cost_basis: 0 };
  return {
    profit_loss: current_total - cost_basis,
    profit_loss_pct: cost_basis > 0 ? ((current_total - cost_basis) / cost_basis) * 100 : 0
  };
};
// --- Reminders ---

export interface Reminder {
  id: string;
  title: string;
  amount: number;
  due_date: string;
  frequency: string;
  category_id: string;
  status: 'pending' | 'paid';
  created_at: string;
  updated_at: string;
  synced: number;
}

export const getReminders = async (): Promise<Reminder[]> => {
  return await executeQuery(`SELECT * FROM reminders ORDER BY due_date ASC`);
};

export const addReminder = async (
  title: string,
  amount: number,
  due_date: string,
  frequency: string,
  category_id: string,
  providedId?: string
) => {
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const reminderData = { id, title, amount, due_date, frequency, category_id, status: 'pending', created_at: now, updated_at: now, deviceId };

  await syncManager.performOperation('reminder_add', reminderData, () =>
    runWithBindings(
      `INSERT INTO reminders (id, title, amount, due_date, frequency, category_id, status, created_at, updated_at, deviceId, synced) 
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 0)`,
      [id, title, amount, due_date, frequency, category_id, now, now, deviceId]
    )
  );
  return id;
};

export const deleteReminder = async (id: string) => {
  await syncManager.performOperation('reminder_delete', { id }, () =>
    runWithBindings(`DELETE FROM reminders WHERE id = ?`, [id])
  );
};

export const markReminderAsPaid = async (reminder: Reminder, accountId: string) => {
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';
  const trxId = uuidv4();

  const trxData = {
    id: trxId,
    type: 'expense',
    amount: reminder.amount,
    category: reminder.category_id,
    description: `Paid: ${reminder.title}`,
    date: reminder.due_date,
    payment_method: '',
    account_id: accountId,
    created_at: now,
    updated_at: now,
    deviceId
  };

  // 1. Create the transaction (synced)
  await syncManager.performOperation('transaction_add', trxData, () =>
    runWithBindings(
      `INSERT INTO transactions (id, type, amount, category, description, date, payment_method, account_id, created_at, updated_at, deviceId, synced) 
       VALUES (?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [trxId, trxData.amount, trxData.category, trxData.description, trxData.date, trxData.payment_method, trxData.account_id, now, now, deviceId]
    )
  );

  // 2. Update reminder status (synced)
  const updatedReminder = { ...reminder, status: 'paid', updated_at: now, deviceId };
  await syncManager.performOperation('reminder_update', updatedReminder, () =>
    runWithBindings(
      `UPDATE reminders SET status = 'paid', updated_at = ?, deviceId = ?, synced = 0 WHERE id = ?`,
      [now, deviceId, reminder.id]
    )
  );
};

// --- Tasks ---

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  due_date: string | null;
  due_time: string | null;
  reminder_enabled: number;
  reminder_offset: number;
  reminder_sent: number;
  created_at: string;
  updated_at: string;
  synced: number;
}

export const getTasks = async (): Promise<Task[]> => {
  return await executeQuery(`SELECT * FROM tasks ORDER BY created_at DESC`);
};

export const addTask = async (
  title: string,
  description: string,
  status: 'pending' | 'in_progress' | 'completed' = 'pending',
  due_date: string | null = null,
  due_time: string | null = null,
  reminder_enabled: number = 0,
  reminder_offset: number = 5,
  providedId?: string
) => {
  if (!title || !title.trim()) throw new Error('Task title is required');
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const taskData = { id, title: title.trim(), description: description ?? '', status, due_date, due_time, reminder_enabled, reminder_offset, reminder_sent: 0, created_at: now, updated_at: now, deviceId };

  await syncManager.performOperation('task_add', taskData, () =>
    runWithBindings(
      `INSERT INTO tasks (id, title, description, status, due_date, due_time, reminder_enabled, reminder_offset, reminder_sent, created_at, updated_at, deviceId, synced) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0)`,
      [id, title.trim(), description ?? '', status, due_date, due_time, reminder_enabled, reminder_offset, now, now, deviceId]
    )
  );
  return id;
};

const TASK_UPDATABLE_FIELDS = new Set([
  'title', 'description', 'status', 'due_date', 'due_time', 'reminder_enabled', 'reminder_offset', 'reminder_sent', 'updated_at', 'deviceId'
]);

export const updateTask = async (id: string, data: Partial<Omit<Task, 'id' | 'created_at' | 'synced'>>) => {
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const sanitizedData: any = {};
  Object.keys(data).forEach(key => {
    if (TASK_UPDATABLE_FIELDS.has(key)) {
      sanitizedData[key] = (data as any)[key] ?? null;
    }
  });

  const fields = Object.keys(sanitizedData);
  const values = Object.values(sanitizedData);
  const setClause = fields.map(f => `${f} = ?`).join(', ');

  const taskData = { id, ...sanitizedData, updated_at: now, deviceId };

  await syncManager.performOperation('task_update', taskData, () =>
    runWithBindings(
      `UPDATE tasks SET ${setClause}, updated_at = ?, deviceId = ?, synced = 0 WHERE id = ?`,
      [...values, now, deviceId, id]
    )
  );
};

export const deleteTask = async (id: string) => {
  await syncManager.performOperation('task_delete', { id }, () =>
    runWithBindings(`DELETE FROM tasks WHERE id = ?`, [id])
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LOAN MANAGEMENT MODULE
// ─────────────────────────────────────────────────────────────────────────────

export interface LoanParty {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deviceId: string | null;
}

export interface Loan {
  id: string;
  direction: 'given' | 'taken';
  party_id: string;
  amount: number;
  description: string | null;
  date: string;
  due_date: string | null;
  category: string;
  interest_rate: number;
  interest_type: 'none' | 'simple' | 'compound';
  status: 'open' | 'closed' | 'partial' | 'loss';
  account_id: string | null;
  loss_amount: number;
  loss_remarks: string | null;
  created_at: string;
  updated_at: string;
  deviceId: string | null;
  event_id: string | null;
  // computed joins
  party_name?: string;
  account_name?: string;
  total_repaid?: number;
  remaining_balance?: number;
}

export interface LoanRepayment {
  id: string;
  loan_id: string;
  amount: number;
  date: string;
  notes: string | null;
  account_id: string | null;
  created_at: string;
  updated_at: string;
  deviceId: string | null;
  // computed
  account_name?: string;
}

// ── Loan Parties ─────────────────────────────────────────────────────────────

export const getLoanParties = async (): Promise<LoanParty[]> => {
  return await executeQuery(`SELECT * FROM loan_parties ORDER BY name ASC`);
};

export const addLoanParty = async (
  name: string,
  phone: string | null = null,
  email: string | null = null,
  notes: string | null = null,
  providedId?: string
) => {
  if (!name?.trim()) throw new Error('Party name is required');
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';
  const partyData = { id, name: name.trim(), phone, email, notes, created_at: now, updated_at: now, deviceId };

  await syncManager.performOperation('loan_party_add', partyData, () =>
    runWithBindings(
      `INSERT INTO loan_parties (id, name, phone, email, notes, created_at, updated_at, deviceId, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, name.trim(), phone, email, notes, now, now, deviceId]
    )
  );
  return id;
};

export const updateLoanParty = async (id: string, data: Partial<Omit<LoanParty, 'id' | 'created_at'>>) => {
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';
  const allowed = new Set(['name', 'phone', 'email', 'notes']);
  const sanitized: any = {};
  Object.keys(data).forEach(k => { if (allowed.has(k)) sanitized[k] = (data as any)[k] ?? null; });
  const setClause = Object.keys(sanitized).map(f => `${f} = ?`).join(', ');

  const updateData = { id, ...sanitized, updated_at: now, deviceId };

  await syncManager.performOperation('loan_party_update', updateData, () =>
    runWithBindings(
      `UPDATE loan_parties SET ${setClause}, updated_at = ?, deviceId = ?, synced = 0 WHERE id = ?`,
      [...Object.values(sanitized), now, deviceId, id]
    )
  );
};

export const deleteLoanParty = async (id: string) => {
  await syncManager.performOperation('loan_party_delete', { id }, () =>
    runWithBindings(`DELETE FROM loan_parties WHERE id = ?`, [id])
  );
};

// ── Loans ─────────────────────────────────────────────────────────────────────

const LOAN_SELECT = `
  SELECT
    l.*,
    p.name   AS party_name,
    a.name   AS account_name,
    COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id), 0) AS total_repaid,
    l.amount - COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id), 0) - COALESCE(l.loss_amount, 0) AS remaining_balance
  FROM loans l
  JOIN loan_parties p ON l.party_id = p.id
  LEFT JOIN accounts a ON l.account_id = a.id
`;

export const getLoans = async (filters?: {
  direction?: 'given' | 'taken';
  status?: 'open' | 'closed' | 'partial' | 'loss' | 'all';
  party_id?: string;
  from_date?: string;
  to_date?: string;
}): Promise<Loan[]> => {
  const clauses: string[] = [];
  const params: any[] = [];

  if (filters?.direction) { clauses.push(`l.direction = ?`); params.push(filters.direction); }
  if (filters?.status && filters.status !== 'all') { clauses.push(`l.status = ?`); params.push(filters.status); }
  if (filters?.party_id) { clauses.push(`l.party_id = ?`); params.push(filters.party_id); }
  if (filters?.from_date) { clauses.push(`l.date >= ?`); params.push(filters.from_date); }
  if (filters?.to_date) { clauses.push(`l.date <= ?`); params.push(filters.to_date); }

  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  return await runWithBindings(`${LOAN_SELECT}${where} ORDER BY l.date DESC, l.created_at DESC`, params);
};

export const getLoan = async (id: string): Promise<Loan | null> => {
  const results = await runWithBindings(`${LOAN_SELECT} WHERE l.id = ?`, [id]);
  return results[0] || null;
};

export const addLoan = async (
  direction: 'given' | 'taken',
  party_id: string,
  amount: number,
  date: string,
  description: string | null = null,
  due_date: string | null = null,
  category: string = 'Personal',
  interest_rate: number = 0,
  interest_type: 'none' | 'simple' | 'compound' = 'none',
  account_id: string | null = null,
  providedId?: string
) => {
  if (amount <= 0) throw new Error('Amount must be positive');
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  // Perform lookups outside the sync operation for better reliability
  let partyName = 'Counterparty';
  if (account_id) {
    const parties = await getLoanParties();
    const party = parties.find(p => p.id === party_id);
    if (party) partyName = party.name;
  }

  const loanData = {
    id, direction, party_id, amount, description, date, due_date, category,
    interest_rate, interest_type, status: 'open', account_id, created_at: now, updated_at: now, deviceId
  };

  await syncManager.performOperation('loan_add', loanData, async () => {
    await runWithBindings(
      `INSERT INTO loans (id, direction, party_id, amount, description, date, due_date, category,
        interest_rate, interest_type, status, account_id, created_at, updated_at, deviceId, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, 0)`,
      [id, direction, party_id, amount, description, date, due_date, category,
        interest_rate, interest_type, account_id, now, now, deviceId]
    );

    // Create a corresponding ledger transaction
    if (account_id) {
      const trxType = direction === 'given' ? 'expense' : 'income';
      const trxDesc = `${direction === 'given' ? 'Loan Given' : 'Loan Taken'}: ${partyName}${description ? ` - ${description}` : ''}`;

      await addTransaction(
        trxType,
        amount,
        'Loan',
        trxDesc,
        date,
        '',
        account_id,
        null,
        category,
        `trx_loan_${id}`
      );
    }
  });
  return id;
};

export const updateLoan = async (id: string, data: Partial<Omit<Loan, 'id' | 'created_at' | 'party_name' | 'account_name' | 'total_repaid' | 'remaining_balance'>>) => {
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';
  const allowed = new Set(['direction', 'party_id', 'amount', 'description', 'date', 'due_date',
    'category', 'interest_rate', 'interest_type', 'status', 'account_id', 'loss_amount', 'loss_remarks']);
  const sanitized: any = {};
  Object.keys(data).forEach(k => { if (allowed.has(k)) sanitized[k] = (data as any)[k] ?? null; });
  const setClause = Object.keys(sanitized).map(f => `${f} = ?`).join(', ');

  const updateData = { id, ...sanitized, updated_at: now, deviceId };

  await syncManager.performOperation('loan_update', updateData, () =>
    runWithBindings(
      `UPDATE loans SET ${setClause}, updated_at = ?, deviceId = ?, synced = 0 WHERE id = ?`,
      [...Object.values(sanitized), now, deviceId, id]
    )
  );
};

export const deleteLoan = async (id: string) => {
  await syncManager.performOperation('loan_delete', { id }, async () => {
    // 1. Delete associated repayments
    await runWithBindings(`DELETE FROM loan_repayments WHERE loan_id = ?`, [id]);
    // 2. Delete the loan itself
    await runWithBindings(`DELETE FROM loans WHERE id = ?`, [id]);
    // 3. Delete associated transaction
    await deleteTransaction(`trx_loan_${id}`);
    // 4. Delete associated repayment transactions (best effort based on ID pattern)
    // In a production app, we'd query for all linked IDs, but here we use a deterministic pattern
    const repayments = await runWithBindings(`SELECT id FROM loan_repayments WHERE loan_id = ?`, [id]);
    for (const rep of repayments) {
      await deleteTransaction(`trx_rep_${rep.id}`);
    }
  });
};

/** Recompute & persist loan status after any repayment change */
export const recalcLoanStatus = async (loanId: string) => {
  const results = await runWithBindings(
    `SELECT l.amount,
            COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id), 0) AS total_repaid
     FROM loans l WHERE l.id = ?`,
    [loanId]
  );
  if (!results.length) return;
  const { amount, total_repaid } = results[0] as any;
  const remaining = amount - total_repaid;
  let status: 'open' | 'closed' | 'partial' | 'loss';
  if (remaining <= 0) status = 'closed';
  else if (total_repaid > 0) status = 'partial';
  else status = 'open';

  // Keep loss status if already set, unless more was repaid than the original amount? 
  // Actually, if it's 'loss', we only change it if remaining balance is 0 or less.
  const existing = await executeQuery(`SELECT status, loss_amount FROM loans WHERE id = ?`, [loanId]);
  if (existing[0]?.status === 'loss' && remaining > 0) {
    status = 'loss';
  }

  const now = new Date().toISOString();
  await runWithBindings(`UPDATE loans SET status = ?, updated_at = ?, synced = 0 WHERE id = ?`, [status, now, loanId]);
};

export const markLoanAsLoss = async (loanId: string, lossAmount: number, remarks: string) => {
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const loan = await getLoan(loanId);
  if (!loan) throw new Error('Loan not found');

  const updateData = {
    id: loanId,
    status: 'loss' as const,
    loss_amount: lossAmount,
    loss_remarks: remarks,
    updated_at: now,
    deviceId
  };

  await syncManager.performOperation('loan_update', updateData, async () => {
    await runWithBindings(
      `UPDATE loans SET status = 'loss', loss_amount = ?, loss_remarks = ?, updated_at = ?, deviceId = ?, synced = 0 WHERE id = ?`,
      [lossAmount, remarks, now, deviceId, loanId]
    );

    // Optionally create a transaction for the loss record
    // We create a transaction with 0 amount but with the loss info in description
    // to "adjust it in transactions" as requested.
    // Or maybe we create a transaction that "completes" the loan?
    // Actually, creating a transaction of type 'expense' for the loss amount might be what's wanted
    // BUT the original loan was already an expense.
    // So we just create a note transaction.

    await addTransaction(
      loan.direction === 'given' ? 'expense' : 'income',
      0, // Zero amount so it doesn't affect balance twice
      'Loan Loss',
      `Loan Loss Marked: ${loan.party_name} - ${remarks} (Lost: ${lossAmount})`,
      now.split('T')[0],
      '',
      loan.account_id,
      null,
      loan.category,
      `trx_loan_loss_${loanId}_${Date.now()}`,
      loan.event_id || null
    );
  });
};

// ── Loan Repayments ──────────────────────────────────────────────────────────

export const getLoanRepayments = async (loanId: string): Promise<LoanRepayment[]> => {
  return await runWithBindings(
    `SELECT r.*, a.name AS account_name
     FROM loan_repayments r
     LEFT JOIN accounts a ON r.account_id = a.id
     WHERE r.loan_id = ?
     ORDER BY r.date DESC, r.created_at DESC`,
    [loanId]
  );
};

export const addLoanRepayment = async (
  loan_id: string,
  amount: number,
  date: string,
  notes: string | null = null,
  account_id: string | null = null,
  providedId?: string
) => {
  if (amount <= 0) throw new Error('Amount must be positive');
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  // Pre-fetch loan details for the transaction description
  const loan = await getLoan(loan_id);
  const pName = loan?.party_name || 'Counterparty';
  const lCat = loan?.category || 'Loan Repayment';
  const lDir = loan?.direction || 'given';

  const repaymentData = { id, loan_id, amount, date, notes, account_id, created_at: now, updated_at: now, deviceId };

  await syncManager.performOperation('loan_repayment_add', repaymentData, async () => {
    await runWithBindings(
      `INSERT INTO loan_repayments (id, loan_id, amount, date, notes, account_id, created_at, updated_at, deviceId, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, loan_id, amount, date, notes, account_id, now, now, deviceId]
    );

    // Create ledger entry for repayment
    if (account_id) {
      // If loan was GIVEN (Asset), receiving money is INCOME
      // If loan was TAKEN (Liability), paying money is EXPENSE
      const trxType = lDir === 'given' ? 'income' : 'expense';
      const trxDesc = `Loan Repayment: ${pName}${notes ? ` - ${notes}` : ''}`;

      await addTransaction(
        trxType,
        amount,
        'Loan Repayment',
        trxDesc,
        date,
        '',
        account_id,
        null,
        lCat,
        `trx_rep_${id}`
      );
    }
  });
  await recalcLoanStatus(loan_id);
  return id;
};

export const deleteLoanRepayment = async (id: string, loanId: string) => {
  await syncManager.performOperation('loan_repayment_delete', { id, loanId }, async () => {
    await runWithBindings(`DELETE FROM loan_repayments WHERE id = ?`, [id]);
    await deleteTransaction(`trx_rep_${id}`);
    await recalcLoanStatus(loanId);
  });
};

// ── Loan Reports ─────────────────────────────────────────────────────────────

export const getLoanSummary = async () => {
  const rows = await executeQuery(`
    SELECT
      direction,
      SUM(amount) AS total_amount,
      SUM(COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id), 0)) AS total_repaid
    FROM loans l
    WHERE l.status NOT IN ('closed', 'loss')
    GROUP BY direction
  `);

  let totalReceivable = 0;
  let totalPayable = 0;
  rows.forEach((r: any) => {
    const remaining = r.total_amount - r.total_repaid;
    if (r.direction === 'given') totalReceivable = remaining;
    else totalPayable = remaining;
  });

  return { totalReceivable, totalPayable };
};

export const getLoansByParty = async (): Promise<Array<{
  party_id: string; party_name: string; direction: string;
  total_amount: number; total_repaid: number; remaining: number; loan_count: number;
}>> => {
  return await executeQuery(`
    SELECT
      p.id   AS party_id,
      p.name AS party_name,
      l.direction,
      SUM(l.amount) AS total_amount,
      SUM(COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id), 0)) AS total_repaid,
      SUM(l.amount) - SUM(COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id), 0)) - SUM(COALESCE(l.loss_amount, 0)) AS remaining,
      COUNT(l.id) AS loan_count
    FROM loans l
    JOIN loan_parties p ON l.party_id = p.id
    WHERE l.status NOT IN ('closed', 'loss')
    GROUP BY p.id, l.direction
    ORDER BY remaining DESC
  `);
};

export const getOverdueLoans = async (): Promise<Loan[]> => {
  const today = new Date().toISOString().split('T')[0];
  return await runWithBindings(
    `${LOAN_SELECT} WHERE l.due_date IS NOT NULL AND l.due_date < ? AND l.status NOT IN ('closed', 'loss')
     ORDER BY l.due_date ASC`,
    [today]
  );
};

export const calculateLoanInterest = (
  principal: number,
  annualRate: number,
  startDate: string,
  type: 'none' | 'simple' | 'compound'
): number => {
  if (!annualRate || type === 'none') return 0;
  const start = new Date(startDate);
  const now = new Date();
  const years = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (years <= 0) return 0;
  if (type === 'simple') return principal * (annualRate / 100) * years;
  // compound annually
  return principal * (Math.pow(1 + annualRate / 100, years) - 1);
};

// --- Events ---

export interface Event {
  id: string;
  name: string;
  description: string;
  date: string;
  total_cost: number;
  created_at: string;
  updated_at: string;
  deviceId: string | null;
  synced: number;
}

export const getEvents = async (): Promise<(Event & { total_linked_volume: number, item_count: number })[]> => {
  const results = await executeQuery(`
    SELECT e.*, 
           (SELECT COUNT(*) FROM transactions WHERE event_id = e.id) + 
           (SELECT COUNT(*) FROM loans WHERE event_id = e.id) as item_count,
           COALESCE((SELECT SUM(amount) FROM transactions WHERE event_id = e.id AND type != 'income'), 0) +
           COALESCE((SELECT SUM(amount) FROM loans WHERE event_id = e.id AND direction = 'given'), 0) as total_linked_volume
    FROM events e 
    ORDER BY e.date DESC, e.created_at DESC
  `);
  return results;
};

export const addEvent = async (name: string, description: string, date: string, total_cost: number = 0, providedId?: string) => {
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const eventData = { id, name, description, date, total_cost, created_at: now, updated_at: now, deviceId };

  await syncManager.performOperation('event_add', eventData, () =>
    runWithBindings(
      `INSERT INTO events (id, name, description, date, total_cost, created_at, updated_at, deviceId, synced) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, name, description, date, total_cost, now, now, deviceId]
    )
  );
  return id;
};

export const updateEvent = async (id: string, data: Partial<Omit<Event, 'id' | 'created_at' | 'synced'>>) => {
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';

  const updatableFields = ['name', 'description', 'date', 'total_cost'];
  const sanitizedData: any = {};
  updatableFields.forEach(f => {
    if (f in data) sanitizedData[f] = (data as any)[f];
  });

  const fields = Object.keys(sanitizedData);
  const values = Object.values(sanitizedData);
  const setClause = fields.map(f => `${f} = ?`).join(', ');

  const eventData = { id, ...sanitizedData, updated_at: now, deviceId };

  await syncManager.performOperation('event_update', eventData, () =>
    runWithBindings(
      `UPDATE events SET ${setClause}, updated_at = ?, deviceId = ?, synced = 0 WHERE id = ?`,
      [...values, now, deviceId, id]
    )
  );
};

export const deleteEvent = async (id: string) => {
  // First unlink items
  await runWithBindings(`UPDATE transactions SET event_id = NULL WHERE event_id = ?`, [id]);
  await runWithBindings(`UPDATE loans SET event_id = NULL WHERE event_id = ?`, [id]);

  await syncManager.performOperation('event_delete', { id }, () =>
    runWithBindings(`DELETE FROM events WHERE id = ?`, [id])
  );
};

export const getEventDetails = async (eventId: string) => {
  const event = (await runWithBindings(`SELECT * FROM events WHERE id = ?`, [eventId]))[0];
  if (!event) return null;

  const transactions = await runWithBindings(
    `SELECT t.*, a.name as account_name, b.name as to_account_name
     FROM transactions t 
     LEFT JOIN accounts a ON t.account_id = a.id 
     LEFT JOIN accounts b ON t.to_account_id = b.id
     WHERE t.event_id = ?`,
    [eventId]
  );

  const loans = await runWithBindings(
    `SELECT l.*, p.name as party_name, a.name as account_name
     FROM loans l
     JOIN loan_parties p ON l.party_id = p.id
     LEFT JOIN accounts a ON l.account_id = a.id
     WHERE l.event_id = ?`,
    [eventId]
  );

  const loanIds = loans.map((l: any) => l.id);
  let repayments: any[] = [];
  if (loanIds.length > 0) {
    const placeholders = loanIds.map(() => '?').join(',');
    repayments = await runWithBindings(
      `SELECT r.*, l.description as loan_desc, p.name as party_name, a.name as account_name
       FROM loan_repayments r
       JOIN loans l ON r.loan_id = l.id
       JOIN loan_parties p ON l.party_id = p.id
       LEFT JOIN accounts a ON r.account_id = a.id
       WHERE r.loan_id IN (${placeholders})
       ORDER BY r.date DESC`,
      loanIds
    );
  }

  return {
    ...event,
    transactions,
    loans,
    repayments
  };
};

export const linkItemsToEvent = async (eventId: string, transactionIds: string[], loanIds: string[]) => {
  const now = new Date().toISOString();
  await runWithBindings(`UPDATE transactions SET event_id = NULL, synced = 0, updated_at = ? WHERE event_id = ?`, [now, eventId]);
  await runWithBindings(`UPDATE loans SET event_id = NULL, synced = 0, updated_at = ? WHERE event_id = ?`, [now, eventId]);
  if (transactionIds.length > 0) {
    const placeholders = transactionIds.map(() => '?').join(',');
    await runWithBindings(
      `UPDATE transactions SET event_id = ?, synced = 0, updated_at = ? WHERE id IN (${placeholders})`,
      [eventId, now, ...transactionIds]
    );
  }

  if (loanIds.length > 0) {
    const placeholders = loanIds.map(() => '?').join(',');
    await runWithBindings(
      `UPDATE loans SET event_id = ?, synced = 0, updated_at = ? WHERE id IN (${placeholders})`,
      [eventId, now, ...loanIds]
    );
  }
};

export const getConfig = async (key: string): Promise<string | null> => {
  const results = await executeQuery(`SELECT value FROM config WHERE key = ?`, [key]);
  return results[0]?.value || null;
};

export const setConfig = async (key: string, value: string) => {
  const now = new Date().toISOString();
  await syncManager.performOperation('config_update', { key, value }, () =>
    runWithBindings(
      `INSERT OR REPLACE INTO config (key, value, updated_at, synced) VALUES (?, ?, ?, 0)`,
      [key, value, now]
    )
  );
};

export { vacuumDB };