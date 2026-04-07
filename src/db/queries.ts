import { executeQuery, runWithBindings } from './sqlite';
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
  providedId?: string
) => {
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';
  
  const trxData = {
    id, type, amount, category, description: description ?? null, date, 
    payment_method: payment_method ?? '', account_id: account_id ?? null, 
    to_account_id: to_account_id ?? null, created_at: now, updated_at: now, deviceId
  };

  await syncManager.performOperation('transaction_add', trxData, () =>
    runWithBindings(
      `INSERT INTO transactions (id, type, amount, category, description, date, payment_method, account_id, to_account_id, created_at, updated_at, deviceId, synced) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, type, amount, category, description ?? null, date, payment_method ?? '', account_id ?? null, to_account_id ?? null, now, now, deviceId]
    )
  );
  return id;
};

const TRANSACTION_UPDATABLE_FIELDS = new Set([
  'type', 'amount', 'category', 'description', 'date',
  'payment_method', 'account_id', 'to_account_id', 'updated_at', 'deviceId'
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
      `UPDATE transactions SET ${setClause}, updated_at = ?, deviceId = ?, synced = 0 WHERE id = ?`,
      [...values, now, deviceId, id]
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
    SELECT category, SUM(amount) as total 
    FROM transactions 
    WHERE type = 'expense' AND date >= ? 
    GROUP BY category 
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
  amount: number;
  updated_at: string;
}

export const getBudgets = async (): Promise<Budget[]> => {
  return await executeQuery(`SELECT * FROM budgets ORDER BY category ASC`);
};

export const setBudget = async (category: string, amount: number) => {
  const now = new Date().toISOString();
  await executeQuery(
    `INSERT INTO budgets (category, amount, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(category) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`,
    [category, amount, now]
  );
};

export const deleteBudget = async (category: string) => {
  await executeQuery(`DELETE FROM budgets WHERE category = ?`, [category]);
};

export interface BudgetVsActualRow {
  category: string;
  spent: number;
  budget: number;
  pct: number;
}

export const getBudgetVsActual = async (year: string, month: string): Promise<BudgetVsActualRow[]> => {
  const likeStr = `${year}-${month.padStart(2, '0')}-%`;
  const rows = await runWithBindings(`
    SELECT 
      b.category,
      COALESCE(SUM(t.amount), 0) as spent,
      b.amount as budget
    FROM budgets b
    LEFT JOIN transactions t 
      ON t.category = b.category 
      AND t.type = 'expense' 
      AND t.date LIKE ?
    GROUP BY b.category
    ORDER BY b.category ASC
  `, [likeStr]);

  return rows.map((r: any) => ({
    category: r.category,
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
  await syncManager.performOperation('transaction_delete', { id }, () =>
    runWithBindings(`DELETE FROM transactions WHERE id = ?`, [id])
  );
};

// Categories
export const getCategories = async (type?: 'income' | 'expense'): Promise<Category[]> => {
  if (type) {
    return await runWithBindings(`SELECT * FROM categories WHERE type = ? ORDER BY name ASC`, [type]);
  }
  return await executeQuery(`SELECT * FROM categories ORDER BY name ASC`);
};

export const addCategory = async (name: string, type: 'income' | 'expense', icon: string = '', providedId?: string) => {
  if (!name || !name.trim()) throw new Error('Category name is required');
  const trimmedName = name.trim();
  const id = providedId || uuidv4();
  const now = new Date().toISOString();
  const deviceId = localStorage.getItem('deviceId') || 'unknown';
  
  const catData = { id, name: trimmedName, type, icon, created_at: now, updated_at: now, deviceId };

  await syncManager.performOperation('category_add', catData, () =>
    runWithBindings(
      `INSERT INTO categories (id, name, type, icon, created_at, updated_at, deviceId, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, trimmedName, type, icon ?? '', now, now, deviceId]
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
      SELECT category, SUM(amount) as total
      FROM transactions
      WHERE type = 'expense' AND date LIKE ?
      GROUP BY category
    ),
    prev_month AS (
      SELECT category, SUM(amount) as total
      FROM transactions
      WHERE type = 'expense' AND date LIKE ?
      GROUP BY category
    )
    SELECT 
      c.category, 
      c.total as current_total, 
      p.total as prev_total,
      CASE WHEN p.total > 0 THEN ((c.total - p.total) / p.total) * 100 ELSE 100 END as increase_pct
    FROM current_month c
    INNER JOIN prev_month p ON c.category = p.category
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
  const [transactions, accounts, categories, goals, investments, reminders, tasks] = await Promise.all([
    executeQuery(`SELECT * FROM transactions`),
    executeQuery(`SELECT * FROM accounts`),
    executeQuery(`SELECT * FROM categories`),
    executeQuery(`SELECT * FROM goals`),
    executeQuery(`SELECT * FROM investments`),
    executeQuery(`SELECT * FROM reminders`),
    executeQuery(`SELECT * FROM tasks`)
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
    tasks
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
        `INSERT OR REPLACE INTO transactions (id, type, amount, category, description, date, payment_method, account_id, to_account_id, created_at, updated_at, deviceId, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [t.id, t.type, t.amount, t.category, t.description, t.date, t.payment_method, t.account_id, t.to_account_id, t.created_at, t.updated_at, t.deviceId]
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
