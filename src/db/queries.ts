import { executeQuery, runWithBindings } from './sqlite';
import { v4 as uuidv4 } from 'uuid';

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  date: string;
  payment_method: string;
  created_at: string;
  updated_at: string;
  synced: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  created_at: string;
}

export const addTransaction = async (
  type: 'income' | 'expense',
  amount: number,
  category: string,
  description: string,
  date: string,
  payment_method: string = ''
) => {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  await runWithBindings(
    `INSERT INTO transactions (id, type, amount, category, description, date, payment_method, created_at, updated_at, synced) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, type, amount, category, description, date, payment_method, now, now]
  );
  return id;
};

export const getTransactions = async (limit: number = 50, offset: number = 0): Promise<Transaction[]> => {
  return await runWithBindings(
    `SELECT * FROM transactions ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`,
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
export const getCategories = async (): Promise<Category[]> => {
  const categories = await executeQuery(`SELECT * FROM categories ORDER BY name ASC`);
  if (categories.length === 0) {
    // Seed default if empty
    const defaults = ['Food', 'Transport', 'Bills', 'Shopping', 'Entertainment', 'Health', 'Other'];
    for (const name of defaults) {
      await runWithBindings(
        `INSERT INTO categories (id, name, icon, created_at) VALUES (?, ?, ?, ?)`,
        [uuidv4(), name, '', new Date().toISOString()]
      );
    }
    return await executeQuery(`SELECT * FROM categories ORDER BY name ASC`);
  }
  return categories;
};

export const addCategory = async (name: string, icon: string = '') => {
  const id = uuidv4();
  await runWithBindings(
    `INSERT INTO categories (id, name, icon, created_at) VALUES (?, ?, ?, ?)`,
    [id, name, icon, new Date().toISOString()]
  );
  return id;
};
