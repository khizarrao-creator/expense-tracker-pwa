import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

if (!firebaseConfig.apiKey) {
  console.error('Error: VITE_FIREBASE_API_KEY missing in .env file!');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(process.cwd(), 'backups', `firestore-export-${timestamp}`);

fs.mkdirSync(backupDir, { recursive: true });

async function exportCollection(colName: string, subPath: string = '') {
  try {
    const colRef = collection(db, colName);
    const snap = await getDocs(colRef);
    const docs = snap.docs.map(doc => ({
      _id: doc.id,
      ...doc.data()
    }));

    const targetDir = subPath ? path.join(backupDir, subPath) : backupDir;
    fs.mkdirSync(targetDir, { recursive: true });

    const filePath = path.join(targetDir, `${colName.replace(/\//g, '_')}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
    console.log(`[Backup] Exported ${docs.length} docs from ${colName} -> ${filePath}`);
    return docs;
  } catch (err: any) {
    console.warn(`[Backup] Failed to export collection ${colName}:`, err.message);
    return [];
  }
}

async function runBackup() {
  console.log(`Starting Firestore Backup into: ${backupDir}`);

  // Attempt login with admin email if provided or try direct fetch
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'khizarraoworks@gmail.com';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminPassword) {
    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      console.log(`[Backup] Authenticated as ${adminEmail}`);
    } catch (e: any) {
      console.warn(`[Backup] Firebase auth login skipped/failed: ${e.message}`);
    }
  }

  // 1. Export System Config Documents
  const systemDocsData: Record<string, any> = {};
  try {
    const snap = await getDocs(collection(db, 'system'));
    snap.docs.forEach(doc => {
      systemDocsData[doc.id] = doc.data();
    });
    fs.writeFileSync(path.join(backupDir, 'system_config.json'), JSON.stringify(systemDocsData, null, 2));
    console.log(`[Backup] Exported system configuration docs -> system_config.json`);
  } catch (e: any) {
    console.warn(`[Backup] Failed to export system config:`, e.message);
  }

  // 2. Export Top-Level Collections
  const users = await exportCollection('registered_users');
  const projects = await exportCollection('projects');
  await exportCollection('project_invites');
  await exportCollection('payment_requests');
  await exportCollection('broadcast_notifications');

  // 3. Export Project Subcollections (tasks, leads, grid)
  for (const proj of projects) {
    const projId = proj._id;
    await exportCollection(`projects/${projId}/tasks`, path.join('projects_sub', projId));
    await exportCollection(`projects/${projId}/leads`, path.join('projects_sub', projId));
    await exportCollection(`projects/${projId}/grid`, path.join('projects_sub', projId));
  }

  // 4. Export User Subcollections
  const USER_SUBCOLLECTIONS = [
    'transactions', 'accounts', 'categories', 'goals',
    'investments', 'reminders', 'tasks', 'task_logs',
    'loan_parties', 'loans', 'loan_repayments', 'events',
    'fuel_logs', 'config', 'vehicles', 'vehicle_expenses',
    'vehicle_reminders', 'notifications', 'ai_sessions'
  ];

  for (const u of users) {
    const uid = u._id;
    for (const sub of USER_SUBCOLLECTIONS) {
      await exportCollection(`users/${uid}/${sub}`, path.join('users_sub', uid));
    }
  }

  console.log(`\n✅ Backup complete! Data stored in: ${backupDir}`);
}

runBackup().catch(err => {
  console.error('Backup script error:', err);
  process.exit(1);
});
