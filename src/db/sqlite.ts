import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import localforage from 'localforage';
import { toast } from 'sonner';
// @ts-ignore
import sqlWasm from 'sql.js/dist/sql-wasm.wasm?url';

let db: Database | null = null;
let SQL: SqlJsStatic | null = null;

const DB_STORE_NAME = 'expense-tracker-db';

export const initDB = async () => {
  if (db) return { db, SQL };

  try {
    SQL = await initSqlJs({
      locateFile: () => sqlWasm
    });

    let savedData: Uint8Array | null = null;
    try {
      savedData = await localforage.getItem<Uint8Array>(DB_STORE_NAME);
    } catch (e) {
      console.error('[SQLite] Failed to load from storage:', e);
      toast.error('Database load failed: Storage is full or inaccessible.', { id: 'db-load-error' });
    }

    if (savedData) {
      db = new SQL.Database(savedData);
    } else {
      db = new SQL.Database();
    }

    await initializeSchema();
    await saveDB();

    return { db, SQL };
  } catch (error) {
    console.error('[SQLite] Critical init error:', error);
    toast.error('Failed to initialize database. Please check your browser storage space.', { id: 'db-critical-error' });
    throw error;
  }
};

const saveDB = async () => {
  if (!db) return;
  try {
    const data = db.export();
    const sizeMB = (data.length / (1024 * 1024)).toFixed(2);
    console.log(`[SQLite] Saving database (${sizeMB} MB)...`);
    await localforage.setItem(DB_STORE_NAME, data);
  } catch (e: any) {
    console.error('[SQLite] Storage error:', e);
    if (e.name === 'QuotaExceededError' || e.message?.includes('full disk')) {
      toast.error('Storage Full! Your data is not being saved locally. Please free up disk space or clear browser data.', { 
        id: 'storage-quota-error',
        duration: 10000 
      });
    } else {
      toast.error(`Save Failed: ${e.message || 'Unknown error'}. Try optimizing from Settings.`, { id: 'storage-save-error' });
    }
  }
};

export const vacuumDB = async () => {
  if (!db) return;
  try {
    db.run('VACUUM');
    await saveDB();
    toast.success('Database optimized successfully');
  } catch (e) {
    console.error('[SQLite] Vacuum failed:', e);
  }
};

const initializeSchema = async () => {
  if (!db) return;

  // 1. Create tables with basic columns first (for new users)
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      initial_balance REAL DEFAULT 0,
      color TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deviceId TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')) DEFAULT 'expense',
      icon TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deviceId TEXT,
      synced INTEGER DEFAULT 0,
      parent_id TEXT,
      FOREIGN KEY (parent_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT CHECK(type IN ('income', 'expense', 'transfer')),
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      payment_method TEXT,
      account_id TEXT,
      to_account_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deviceId TEXT,
      synced INTEGER DEFAULT 0,
      subcategory TEXT,
      event_id TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (to_account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      deviceId TEXT NOT NULL,
      status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      category_id TEXT,
      deadline TEXT,
      linked_accounts TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deviceId TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS investments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- Gold, Stock, Crypto, Cash
      units REAL DEFAULT 0,
      average_buy_price REAL DEFAULT 0,
      current_price REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deviceId TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      due_date TEXT NOT NULL,
      frequency TEXT NOT NULL, -- One-time, Monthly, Yearly
      category_id TEXT,
      status TEXT DEFAULT 'pending', -- pending, paid
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deviceId TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS budgets (
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (category, subcategory)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      due_time TEXT,
      reminder_enabled INTEGER DEFAULT 0,
      reminder_offset INTEGER DEFAULT 5,
      reminder_sent INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deviceId TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS loan_parties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deviceId TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL CHECK(direction IN ('given','taken')),
      party_id TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      due_date TEXT,
      category TEXT DEFAULT 'Personal',
      interest_rate REAL DEFAULT 0,
      interest_type TEXT DEFAULT 'none' CHECK(interest_type IN ('none','simple','compound')),
      status TEXT DEFAULT 'open' CHECK(status IN ('open','closed','partial','loss')),
      account_id TEXT,
      loss_amount REAL DEFAULT 0,
      loss_remarks TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deviceId TEXT,
      synced INTEGER DEFAULT 0,
      event_id TEXT,
      FOREIGN KEY (party_id) REFERENCES loan_parties(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      total_cost REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deviceId TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS loan_repayments (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      account_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deviceId TEXT,
      synced INTEGER DEFAULT 0,
      FOREIGN KEY (loan_id) REFERENCES loans(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS fuel_logs (
      id TEXT PRIMARY KEY,
      fuel_type TEXT NOT NULL,
      price_per_liter REAL NOT NULL,
      total_cost REAL NOT NULL,
      liters REAL NOT NULL,
      date TEXT NOT NULL,
      transaction_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deviceId TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );
  `);

  // 2. Robust Migrations (Add missing columns one by one for existing users)
  const migrations = [
    "ALTER TABLE goals ADD COLUMN linked_accounts TEXT;",
    "ALTER TABLE tasks ADD COLUMN due_time TEXT;",
    "ALTER TABLE tasks ADD COLUMN reminder_enabled INTEGER DEFAULT 0;",
    "ALTER TABLE tasks ADD COLUMN reminder_offset INTEGER DEFAULT 5;",
    "ALTER TABLE tasks ADD COLUMN reminder_sent INTEGER DEFAULT 0;",
    "ALTER TABLE transactions ADD COLUMN deviceId TEXT;",
    "ALTER TABLE accounts ADD COLUMN updated_at TEXT;",
    "ALTER TABLE accounts ADD COLUMN deviceId TEXT;",
    "ALTER TABLE categories ADD COLUMN updated_at TEXT;",
    "ALTER TABLE categories ADD COLUMN deviceId TEXT;",

    // Previous columns just in case
    "ALTER TABLE transactions ADD COLUMN type TEXT CHECK(type IN ('income', 'expense', 'transfer'));",
    "ALTER TABLE transactions ADD COLUMN description TEXT;",
    "ALTER TABLE transactions ADD COLUMN payment_method TEXT;",
    "ALTER TABLE transactions ADD COLUMN account_id TEXT;",
    "ALTER TABLE transactions ADD COLUMN to_account_id TEXT;",
    "ALTER TABLE transactions ADD COLUMN updated_at TEXT;",
    "ALTER TABLE transactions ADD COLUMN synced INTEGER DEFAULT 0;",

    "ALTER TABLE accounts ADD COLUMN synced INTEGER DEFAULT 0;",
    "ALTER TABLE accounts ADD COLUMN type TEXT;",
    "ALTER TABLE accounts ADD COLUMN initial_balance REAL DEFAULT 0;",
    "ALTER TABLE accounts ADD COLUMN color TEXT;",

    "ALTER TABLE categories ADD COLUMN type TEXT CHECK(type IN ('income', 'expense')) DEFAULT 'expense';",
    "ALTER TABLE categories ADD COLUMN icon TEXT;",
    "ALTER TABLE categories ADD COLUMN synced INTEGER DEFAULT 0;",
    "ALTER TABLE budgets ADD COLUMN subcategory TEXT;",
    "UPDATE budgets SET subcategory = '' WHERE subcategory IS NULL;",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_unique ON budgets(category, COALESCE(subcategory, ''))",

    // Loan module migrations
    "ALTER TABLE loan_parties ADD COLUMN phone TEXT;",
    "ALTER TABLE loan_parties ADD COLUMN email TEXT;",
    "ALTER TABLE loans ADD COLUMN interest_rate REAL DEFAULT 0;",
    "ALTER TABLE loans ADD COLUMN interest_type TEXT DEFAULT 'none';",
    "ALTER TABLE loans ADD COLUMN category TEXT DEFAULT 'Personal';",
    "ALTER TABLE transactions ADD COLUMN subcategory TEXT;",
    "ALTER TABLE events ADD COLUMN total_cost REAL DEFAULT 0",
    "ALTER TABLE loans ADD COLUMN loss_amount REAL DEFAULT 0;",
    "ALTER TABLE loans ADD COLUMN loss_remarks TEXT;",
    "CREATE TABLE IF NOT EXISTS fuel_logs (id TEXT PRIMARY KEY, fuel_type TEXT NOT NULL, price_per_liter REAL NOT NULL, total_cost REAL NOT NULL, liters REAL NOT NULL, date TEXT NOT NULL, transaction_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deviceId TEXT, synced INTEGER DEFAULT 0);",
    "ALTER TABLE fuel_logs ADD COLUMN transaction_id TEXT;",
    "CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL, synced INTEGER DEFAULT 0);"
  ];

  const addColumn = (table: string, column: string, type: string) => {
    try {
      db!.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (e) { }
  };

  addColumn('transactions', 'event_id', 'TEXT');
  addColumn('loans', 'event_id', 'TEXT');
  addColumn('events', 'total_cost', 'REAL DEFAULT 0');

  for (const m of migrations) {
    try {
      db.run(m);
    } catch (e) {
      // console.log(`[Migration] Skipped or failed: ${m.substring(0, 30)}...`); 
    }
  }

  // 3. Create missing indexes
  const indexQueries = [
    "CREATE INDEX IF NOT EXISTS idx_accounts_synced ON accounts(synced);",
    "CREATE INDEX IF NOT EXISTS idx_categories_synced ON categories(synced);",
    "CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);",
    "CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);",
    "CREATE INDEX IF NOT EXISTS idx_transactions_synced ON transactions(synced);",
    "CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);",
    "CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);",
    "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique_name ON categories(name, type, COALESCE(parent_id, 'root'));",
    "CREATE INDEX IF NOT EXISTS idx_loans_party ON loans(party_id);",
    "CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);",
    "CREATE INDEX IF NOT EXISTS idx_loans_direction ON loans(direction);",
    "CREATE INDEX IF NOT EXISTS idx_loan_repayments_loan ON loan_repayments(loan_id);"
  ];

  for (const idx of indexQueries) {
    try { db.run(idx); } catch (e) { /* Index likely exists */ }
  }

  // 4. Force a one-time re-sync if needed (skipped if already re-synced v6)
  const hasReSynced = localStorage.getItem('re_synced_v6');
  if (!hasReSynced) {
    try {
      const now = new Date().toISOString();
      db.run("UPDATE transactions SET updated_at = ? WHERE updated_at IS NULL;", [now]);
      db.run("UPDATE accounts SET updated_at = ? WHERE updated_at IS NULL;", [now]);
      db.run("UPDATE categories SET updated_at = ? WHERE updated_at IS NULL;", [now]);
      localStorage.setItem('re_synced_v6', 'true');
    } catch (e) { }
  }

  // 5. Robust Migration: Update 'type' CHECK constraint to include 'transfer'
  const tableInfo = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'")[0];
  const currentSql = tableInfo ? (tableInfo.values[0][0] as string) : "";

  if (currentSql && !currentSql.includes("'transfer'")) {
    console.log("Migrating transactions table to support 'transfer' type...");
    db.run(`
      BEGIN TRANSACTION;
      CREATE TABLE transactions_new (
        id TEXT PRIMARY KEY,
        type TEXT CHECK(type IN ('income', 'expense', 'transfer')),
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        date TEXT NOT NULL,
        payment_method TEXT,
        account_id TEXT,
        to_account_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deviceId TEXT,
        synced INTEGER DEFAULT 0,
        subcategory TEXT,
        event_id TEXT
      );
      INSERT INTO transactions_new (id, type, amount, category, description, date, payment_method, account_id, to_account_id, created_at, updated_at, deviceId, synced, subcategory, event_id)
      SELECT id, type, amount, category, description, date, payment_method, account_id, to_account_id, created_at, COALESCE(updated_at, created_at), deviceId, 0, subcategory, NULL FROM transactions;
      DROP TABLE transactions;
      ALTER TABLE transactions_new RENAME TO transactions;
      COMMIT;
    `);
  }

  // 6. Robust Migration: Update 'status' CHECK constraint in loans to include 'loss'
  const loanTableInfo = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='loans'")[0];
  const loanCurrentSql = loanTableInfo ? (loanTableInfo.values[0][0] as string) : "";

  if (loanCurrentSql && !loanCurrentSql.includes("'loss'")) {
    console.log("Migrating loans table to support 'loss' status...");
    db.run(`
      BEGIN TRANSACTION;
      CREATE TABLE loans_new (
        id TEXT PRIMARY KEY,
        direction TEXT NOT NULL CHECK(direction IN ('given','taken')),
        party_id TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        date TEXT NOT NULL,
        due_date TEXT,
        category TEXT DEFAULT 'Personal',
        interest_rate REAL DEFAULT 0,
        interest_type TEXT DEFAULT 'none' CHECK(interest_type IN ('none','simple','compound')),
        status TEXT DEFAULT 'open' CHECK(status IN ('open','closed','partial','loss')),
        account_id TEXT,
        loss_amount REAL DEFAULT 0,
        loss_remarks TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deviceId TEXT,
        synced INTEGER DEFAULT 0,
        event_id TEXT,
        FOREIGN KEY (party_id) REFERENCES loan_parties(id),
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      );
      INSERT INTO loans_new (id, direction, party_id, amount, description, date, due_date, category, interest_rate, interest_type, status, account_id, loss_amount, loss_remarks, created_at, updated_at, deviceId, synced, event_id)
      SELECT id, direction, party_id, amount, description, date, due_date, category, interest_rate, interest_type, status, account_id, COALESCE(loss_amount, 0), loss_remarks, created_at, updated_at, deviceId, 0, event_id FROM loans;
      DROP TABLE loans;
      ALTER TABLE loans_new RENAME TO loans;
      COMMIT;
    `);
  }

  // Now create index for account_id since we ensure it exists
  db.run("CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);");
  db.run("CREATE INDEX IF NOT EXISTS idx_loans_account ON loans(account_id);");

  // Seed default accounts if empty
  const accountsCount = db.exec("SELECT COUNT(*) as count FROM accounts")[0].values[0][0];
  if (accountsCount === 0) {
    const now = new Date().toISOString();
    const defaultAccounts = [
      { id: 'cash-id', name: 'Cash', type: 'wallet' },
      { id: 'bank-id', name: 'Bank Account', type: 'bank' },
      { id: 'savings-id', name: 'Savings', type: 'bank' },
      { id: 'credit-id', name: 'Credit Card', type: 'credit' },
    ];

    for (const acc of defaultAccounts) {
      db.run(
        "INSERT INTO accounts (id, name, type, initial_balance, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
        [acc.id, acc.name, acc.type, now, now]
      );
    }
  }

  // Migration: Add type to categories if it doesn't exist
  try {
    db.run("ALTER TABLE categories ADD COLUMN type TEXT CHECK(type IN ('income', 'expense')) DEFAULT 'expense';");
    db.run("CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);");
  } catch (e) { }

  // Seed default categories if empty
  const catsCount = db.exec("SELECT COUNT(*) as count FROM categories")[0].values[0][0];
  if (catsCount === 0) {
    const now = new Date().toISOString();
    const expenseDefaults = ['Food', 'Transport', 'Bills', 'Shopping', 'Entertainment', 'Health', 'Other'];
    const incomeDefaults = ['Salary', 'Business', 'Bonus', 'Gift', 'Investment', 'Other'];

    for (const name of expenseDefaults) {
      // Use deterministic IDs for default categories to avoid duplication on re-login
      const id = `default-expense-${name.toLowerCase().replace(/\s+/g, '-')}`;
      db.run(
        "INSERT OR IGNORE INTO categories (id, name, type, icon, created_at, updated_at) VALUES (?, ?, 'expense', ?, ?, ?)",
        [id, name, '', now, now]
      );
    }
    for (const name of incomeDefaults) {
      const id = `default-income-${name.toLowerCase().replace(/\s+/g, '-')}`;
      db.run(
        "INSERT OR IGNORE INTO categories (id, name, type, icon, created_at, updated_at) VALUES (?, ?, 'income', ?, ?, ?)",
        [id, name, '', now, now]
      );
    }
  }

  // Cleanup duplicates if any exist (e.g., from older versions or sync edge cases)
  db.run(`
    DELETE FROM categories 
    WHERE id NOT IN (
      SELECT MIN(id) 
      FROM categories 
      GROUP BY name, type, COALESCE(parent_id, 'root')
    )
  `);
};

export const executeQuery = async (query: string, params: any[] = []) => {
  if (!db) await initDB();

  const results: any[] = [];
  const stmt = db!.prepare(query, params);

  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }

  stmt.free();

  // If the query was a mutation, save the DB
  const isMutation = query.trim().toUpperCase().match(/^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/);
  if (isMutation) {
    await saveDB();
  }

  return results;
};

// Simplified bindings mapping since sql.js prepare does this too
export const runWithBindings = executeQuery;

export const clearDB = async () => {
  if (db) {
    db.close();
    db = null;
  }
  await localforage.removeItem(DB_STORE_NAME);
  // Clear any cached flags
  localStorage.removeItem('re_synced_v6');
  console.log('[SQLite] Database cleared from local storage.');
};
