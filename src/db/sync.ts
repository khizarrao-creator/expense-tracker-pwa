import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db as firestore } from '../firebase';
import { executeQuery, runWithBindings } from './sqlite';

export const pushToFirestore = async (userId: string) => {
  try {
    // Push unsynced transactions
    const unsyncedTransactions = await executeQuery(`SELECT * FROM transactions WHERE synced = 0`);
    
    for (const trx of unsyncedTransactions) {
      const docRef = doc(firestore, `users/${userId}/transactions/${trx.id}`);
      await setDoc(docRef, {
        id: trx.id,
        type: trx.type,
        amount: trx.amount,
        category: trx.category,
        description: trx.description,
        date: trx.date,
        payment_method: trx.payment_method,
        created_at: trx.created_at,
        updated_at: trx.updated_at
      });

      // Mark as synced locally
      await runWithBindings(`UPDATE transactions SET synced = 1 WHERE id = ?`, [trx.id]);
    }
  } catch (error) {
    console.error('Push to Firestore failed:', error);
  }
};

export const pullFromFirestore = async (userId: string, lastSyncTimestamp: string) => {
  try {
    const transactionsRef = collection(firestore, `users/${userId}/transactions`);
    const q = query(transactionsRef, where('updated_at', '>', lastSyncTimestamp));
    const querySnapshot = await getDocs(q);

    for (const docSnapshot of querySnapshot.docs) {
      const data = docSnapshot.data();
      
      // Last write wins check
      const localResult = await runWithBindings(`SELECT updated_at FROM transactions WHERE id = ?`, [data.id]);
      
      let shouldUpdate = true;
      if (localResult.length > 0) {
        const localDate = new Date(localResult[0].updated_at);
        const remoteDate = new Date(data.updated_at);
        if (localDate >= remoteDate) {
          shouldUpdate = false;
        }
      }

      if (shouldUpdate) {
        const queryStr = `
          INSERT OR REPLACE INTO transactions 
          (id, type, amount, category, description, date, payment_method, created_at, updated_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `;
        
        await runWithBindings(queryStr, [
          data.id, data.type, data.amount, data.category, data.description, 
          data.date, data.payment_method, data.created_at, data.updated_at
        ]);
      }
    }
  } catch (error) {
    console.error('Pull from Firestore failed:', error);
  }
};
