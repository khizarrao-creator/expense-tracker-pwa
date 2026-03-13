import { executeQuery, runWithBindings } from './sqlite';
import { v4 as uuidv4 } from 'uuid';

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
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  created_at: string;
}

export const addTransaction = async (
  type: 'income' | 'expense' | 'transfer',
  amount: number,
  category: string,
  description: string,
  date: string,
  payment_method: string = '',
  account_id: string | null = null,
  to_account_id: string | null = null
) => {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  await runWithBindings(
    `INSERT INTO transactions (id, type, amount, category, description, date, payment_method, account_id, to_account_id, created_at, updated_at, synced) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, type, amount, category, description, date, payment_method, account_id, to_account_id, now, now]
  );
  return id;
};

export const updateTransaction = async (
  id: string,
  data: Partial<Omit<Transaction, 'id' | 'created_at' | 'synced'>>
) => {
  const now = new Date().toISOString();
  const fields = Object.keys(data);
  const values = Object.values(data);
  
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  await runWithBindings(
    `UPDATE transactions SET ${setClause}, updated_at = ?, synced = 0 WHERE id = ?`,
    [...values, now, id]
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
    return acc + (curr.initial_balance || 0) + (curr.income || 0) - (curr.expense || 0);
  }, 0);
};

export const getMonthlyTrend = async (months: number = 6) => {
  return await runWithBindings(`
    SELECT 
      strftime('%Y-%m', date) as month,
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
    FROM transactions
    GROUP BY month
    ORDER BY month DESC
    LIMIT ?
  `, [months]);
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

export const deleteTransaction = async (id: string) => {
  // We should actually soft delete or just delete locally and handle sync later.
  // For simplicity, we hard delete locally. A full sync engine would record tombstones.
  await runWithBindings(`DELETE FROM transactions WHERE id = ?`, [id]);
};

// Categories
export const getCategories = async (type?: 'income' | 'expense'): Promise<Category[]> => {
  if (type) {
    return await runWithBindings(`SELECT * FROM categories WHERE type = ? ORDER BY name ASC`, [type]);
  }
  return await executeQuery(`SELECT * FROM categories ORDER BY name ASC`);
};

export const addCategory = async (name: string, type: 'income' | 'expense', icon: string = '') => {
  const id = uuidv4();
  await runWithBindings(
    `INSERT INTO categories (id, name, type, icon, created_at, synced) VALUES (?, ?, ?, ?, ?, 0)`,
    [id, name, type, icon, new Date().toISOString()]
  );
  return id;
};

export const deleteCategory = async (id: string) => {
  await runWithBindings(`DELETE FROM categories WHERE id = ?`, [id]);
};

// Accounts
export const getAccounts = async (): Promise<Account[]> => {
  return await executeQuery(`SELECT * FROM accounts ORDER BY name ASC`);
};

export const addAccount = async (name: string, type: string, initial_balance: number = 0) => {
  const id = uuidv4();
  await runWithBindings(
    `INSERT INTO accounts (id, name, type, initial_balance, created_at, synced) VALUES (?, ?, ?, ?, ?, 0)`,
    [id, name, type, initial_balance, new Date().toISOString()]
  );
  return id;
};

export const deleteAccount = async (id: string) => {
  await runWithBindings(`DELETE FROM accounts WHERE id = ?`, [id]);
};

export const updateAccount = async (id: string, data: Partial<Omit<Account, 'id' | 'created_at'>>) => {
  const fields = Object.keys(data);
  const values = Object.values(data);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  
  await runWithBindings(
    `UPDATE accounts SET ${setClause}, synced = 0 WHERE id = ?`,
    [...values, id]
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

