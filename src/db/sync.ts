import { collection, doc, setDoc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db as firestore } from '../firebase';
import { executeQuery, runWithBindings } from './sqlite';

export const pushToFirestore = async (userId: string) => {
  try {
    // 1. Push unsynced transactions
    const unsyncedTransactions = await executeQuery(`SELECT * FROM transactions WHERE synced = 0`);
    for (const trx of unsyncedTransactions) {
      const docRef = doc(firestore, `users/${userId}/transactions/${trx.id}`);
      // Send all fields except 'synced' itself
      const { synced, ...dataToSync } = trx;
      await setDoc(docRef, { ...dataToSync, updated_at: trx.updated_at || new Date().toISOString() });
      await runWithBindings(`UPDATE transactions SET synced = 1 WHERE id = ?`, [trx.id]);
    }

    // 2. Push unsynced accounts
    const unsyncedAccounts = await executeQuery(`SELECT * FROM accounts WHERE synced = 0`);
    for (const acc of unsyncedAccounts) {
      const docRef = doc(firestore, `users/${userId}/accounts/${acc.id}`);
      const { synced, ...dataToSync } = acc;
      await setDoc(docRef, { ...dataToSync });
      await runWithBindings(`UPDATE accounts SET synced = 1 WHERE id = ?`, [acc.id]);
    }

    // 3. Push unsynced categories
    const unsyncedCategories = await executeQuery(`SELECT * FROM categories WHERE synced = 0`);
    for (const cat of unsyncedCategories) {
      const docRef = doc(firestore, `users/${userId}/categories/${cat.id}`);
      const { synced, ...dataToSync } = cat;
      await setDoc(docRef, { ...dataToSync });
      await runWithBindings(`UPDATE categories SET synced = 1 WHERE id = ?`, [cat.id]);
    }

    // 4. Push Settings (Currency, Theme)
    const settingsDoc = doc(firestore, `users/${userId}/config/preferences`);
    await setDoc(settingsDoc, {
      currency: localStorage.getItem('currency') || 'PKR',
      theme: localStorage.getItem('theme') || 'system',
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Push to Firestore failed:', error);
  }
};

export const pullFromFirestore = async (userId: string, lastSyncTimestamp: string) => {
  try {
    // 1. Pull Transactions
    const trxRef = collection(firestore, `users/${userId}/transactions`);
    const qTrx = query(trxRef, where('updated_at', '>', lastSyncTimestamp));
    const trxSnapshot = await getDocs(qTrx);

    for (const docSnapshot of trxSnapshot.docs) {
      const data = docSnapshot.data();
      await runWithBindings(`
        INSERT OR REPLACE INTO transactions 
        (id, type, amount, category, description, date, payment_method, account_id, to_account_id, created_at, updated_at, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [data.id, data.type, data.amount, data.category, data.description, data.date, data.payment_method, data.account_id, data.to_account_id, data.created_at, data.updated_at]);
    }

    // 2. Pull All Accounts (Small dataset, usually safe to pull all)
    const accSnapshot = await getDocs(collection(firestore, `users/${userId}/accounts`));
    for (const docSnapshot of accSnapshot.docs) {
      const data = docSnapshot.data();
      await runWithBindings(`
        INSERT OR REPLACE INTO accounts (id, name, type, initial_balance, color, created_at, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [data.id, data.name, data.type, data.initial_balance, data.color, data.created_at, 1]);
    }

    // 3. Pull All Categories
    const catSnapshot = await getDocs(collection(firestore, `users/${userId}/categories`));
    for (const docSnapshot of catSnapshot.docs) {
      const data = docSnapshot.data();
      await runWithBindings(`
        INSERT OR REPLACE INTO categories (id, name, type, icon, created_at, synced)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [data.id, data.name, data.type, data.icon, data.created_at, 1]);
    }

    // 4. Pull Settings
    const settingsRef = doc(firestore, `users/${userId}/config/preferences`);
    const settingsSnap = await getDoc(settingsRef);
    if (settingsSnap.exists()) {
      const settings = settingsSnap.data();
      if (settings.currency) localStorage.setItem('currency', settings.currency);
      if (settings.theme) localStorage.setItem('theme', settings.theme);
    }
  } catch (error) {
    console.error('Pull from Firestore failed:', error);
  }
};
