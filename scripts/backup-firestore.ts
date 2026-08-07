import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const projectId = process.env.VITE_FIREBASE_PROJECT_ID;

// Check if service account file exists, else use default init
const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');

if (!getApps().length) {
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount),
      projectId: projectId
    });
    console.log('[Backup] Initialized Firebase Admin SDK with serviceAccountKey.json');
  } else {
    initializeApp({
      projectId: projectId
    });
    console.log(`[Backup] Initialized Firebase Admin SDK for project ${projectId}`);
  }
}

const db = getFirestore();

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(process.cwd(), 'backups', `firestore-export-${timestamp}`);

fs.mkdirSync(backupDir, { recursive: true });

async function exportCollection(colName: string, subPath: string = '') {
  try {
    const colRef = db.collection(colName);
    const snap = await colRef.get();
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

  // 1. Export System Config Documents
  const systemDocsData: Record<string, any> = {};
  try {
    const snap = await db.collection('system').get();
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

