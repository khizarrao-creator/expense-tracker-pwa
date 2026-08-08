#!/usr/bin/env node
/**
 * import_converted_json.js
 *
 * Imports the converted Money Manager JSON backup (backups/Custom/ranadata_converted.json)
 * into Firestore for the target user (default: ranaibrahemwork@gmail.com).
 *
 * Usage:
 *   node scripts/import_converted_json.js <email> <password>
 * Or pass VITE_IMPORT_EMAIL and VITE_IMPORT_PASSWORD via env.
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

async function main() {
  const email = process.argv[2] || process.env.VITE_IMPORT_EMAIL || 'ranaibrahemwork@gmail.com';
  const password = process.argv[3] || process.env.VITE_IMPORT_PASSWORD;

  const jsonPath = path.join(process.cwd(), 'backups', 'Custom', 'ranadata_converted.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`Error: Converted JSON file not found at ${jsonPath}`);
    process.exit(1);
  }

  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  if (!password) {
    console.log('\n============================================================');
    console.log(`JSON Backup ready at: ${jsonPath}`);
    printSummary(jsonData);
    console.log('------------------------------------------------------------');
    console.log('To import directly via this script, provide account password:');
    console.log('  node scripts/import_converted_json.js <email> <password>');
    console.log('\nAlternatively, open the Web App Admin Portal:');
    console.log('  Go to Admin -> User Migration & Backup Tool -> Import JSON Backup');
    console.log(`  and select ${jsonPath} for ${email}`);
    console.log('============================================================\n');
    process.exit(0);
  }

  console.log(`Initializing Firebase for project: ${firebaseConfig.projectId}`);
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`Authenticating user: ${email}...`);
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  console.log(`✅ Authenticated! User UID: ${user.uid}`);

  console.log(`Starting Firestore import for ${email} (UID: ${user.uid})...`);
  let totalRecords = 0;

  const COLLECTION_MAP = {
    accounts: 'accounts',
    categories: 'categories',
    transactions: 'transactions'
  };

  const collections = jsonData.collections || {};

  for (const [key, items] of Object.entries(collections)) {
    const colName = COLLECTION_MAP[key] || key;
    if (!Array.isArray(items) || items.length === 0) continue;

    console.log(`Importing ${items.length} records into users/${user.uid}/${colName}...`);

    for (const item of items) {
      const docId = item.id;
      if (!docId) continue;

      const docRef = doc(db, 'users', user.uid, colName, docId);
      await setDoc(docRef, {
        ...item,
        userId: user.uid,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      totalRecords++;
    }
  }

  // Also update registered_users doc
  await setDoc(doc(db, 'registered_users', user.uid), {
    email: user.email,
    displayName: user.displayName || user.email,
    lastLogin: new Date().toISOString(),
    isPro: true,
    plan: 'pro'
  }, { merge: true });

  console.log(`\n🎉 Success! Restored ${totalRecords} records to Firestore for ${email}`);
}

function printSummary(jsonData) {
  const accounts = jsonData.collections?.accounts || [];
  const categories = jsonData.collections?.categories || [];
  const transactions = jsonData.collections?.transactions || [];

  console.log(`User Email: ${jsonData.userEmail}`);
  console.log(`Accounts: ${accounts.length}`);
  console.log(`Categories: ${categories.length}`);
  console.log(`Transactions: ${transactions.length}`);
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
