import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import localforage from 'localforage';
// @ts-ignore
import sqlWasm from 'sql.js/dist/sql-wasm.wasm?url';

let db: Database | null = null;
let SQL: SqlJsStatic | null = null;

const DB_STORE_NAME = 'expense-tracker-db';

export const initDB = async () => {
  if (db) return { db, SQL };
  
  SQL = await initSqlJs({
    locateFile: () => sqlWasm
  });

  const savedData = await localforage.getItem<Uint8Array>(DB_STORE_NAME);
  
  if (savedData) {
    db = new SQL.Database(savedData);
  } else {
    db = new SQL.Database();
  }
  
  await initializeSchema();
  await saveDB();
  
  return { db, SQL };
};

const saveDB = async () => {
  if (!db) return;
  const data = db.export();
  await localforage.setItem(DB_STORE_NAME, data);
};

const initializeSchema = async () => {
  if (!db) return;

  const schema = `
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT CHECK(type IN ('income', 'expense')),
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      payment_method TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_synced ON transactions(synced);
  `;
  
  db.run(schema);
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
