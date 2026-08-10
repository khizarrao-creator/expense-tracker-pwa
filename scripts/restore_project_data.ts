import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config();

function stringToUuid(s: string): string {
  if (!s) return '00000000-0000-4000-8000-000000000000';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s;
  const h = crypto.createHash('md5').update(s).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}

// 1. Setup Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) are required in .env!');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Setup Firebase Admin Firestore Client
let db: FirebaseFirestore.Firestore | null = null;
const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
if (fs.existsSync(serviceAccountPath)) {
  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    initializeApp({ credential: cert(serviceAccount) });
  }
  db = getFirestore();
  console.log('✅ Firebase Admin SDK initialized successfully.');
} else {
  console.warn('⚠️ Warning: firebase-service-account.json not found in root. Firestore restore will use client REST API if available.');
}

const BACKUP_DIR = path.join(process.cwd(), 'backups', 'firestore-export-2026-08-03T09-42-57-375Z');
const PROJ_ID = 'JnJJUiPJu7nRpDJXliz5';
const PROJ_UUID = stringToUuid(PROJ_ID);

async function restore() {
  console.log(`\n==================================================`);
  printUtf8(`🚀 RESTORING PROJECT DATA FOR 'NEXT GEN' (${PROJ_ID})`);
  console.log(`==================================================\n`);

  // --- Step A: Read Backup JSON Files ---
  const projectsFile = path.join(BACKUP_DIR, 'projects.json');
  const gridFile = path.join(BACKUP_DIR, 'projects_sub', PROJ_ID, `projects_${PROJ_ID}_grid.json`);
  const leadsFile = path.join(BACKUP_DIR, 'projects_sub', PROJ_ID, `projects_${PROJ_ID}_leads.json`);
  const tasksFile = path.join(BACKUP_DIR, 'projects_sub', PROJ_ID, `projects_${PROJ_ID}_tasks.json`);

  let projectDoc: any = { id: PROJ_ID, name: 'NEXT GEN', description: 'Restored project', createdAt: new Date().toISOString() };
  if (fs.existsSync(projectsFile)) {
    const projects = JSON.parse(fs.readFileSync(projectsFile, 'utf8'));
    const found = projects.find((p: any) => p.id === PROJ_ID || p._id === PROJ_ID);
    if (found) projectDoc = found;
  }

  let gridDataDoc: any = null;
  if (fs.existsSync(gridFile)) {
    const raw = JSON.parse(fs.readFileSync(gridFile, 'utf8'));
    gridDataDoc = Array.isArray(raw) ? raw[0] : raw;
  }

  let leads: any[] = [];
  if (fs.existsSync(leadsFile)) {
    leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8'));
  }

  let tasks: any[] = [];
  if (fs.existsSync(tasksFile)) {
    tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
  }

  printUtf8(`📊 Backup Loaded: ${gridDataDoc?.sheets?.length || 0} Grid Sheets, ${leads.length} Leads, ${tasks.length} Tasks.`);

  // --- Step B: Restore to Firestore ---
  if (db) {
    printUtf8(`\n🔥 Restoring to FIRESTORE...`);
    // 1. Project doc
    await db.collection('projects').doc(PROJ_ID).set(projectDoc, { merge: true });
    printUtf8(`  ✅ Firestore: project '${PROJ_ID}' written.`);

    // 2. Grid document
    if (gridDataDoc) {
      await db.collection('projects').doc(PROJ_ID).collection('grid').doc('main').set(gridDataDoc, { merge: true });
      printUtf8(`  ✅ Firestore: 'projects/${PROJ_ID}/grid/main' written with ${gridDataDoc.sheets?.length || 0} sheets.`);
    }

    // 3. Leads
    for (const ld of leads) {
      const lid = ld.id || ld._id;
      if (lid) {
        await db.collection('projects').doc(PROJ_ID).collection('leads').doc(lid).set(ld, { merge: true });
      }
    }
    printUtf8(`  ✅ Firestore: ${leads.length} leads written.`);

    // 4. Tasks
    for (const tk of tasks) {
      const tid = tk.id || tk._id;
      if (tid) {
        await db.collection('projects').doc(PROJ_ID).collection('tasks').doc(tid).set(tk, { merge: true });
      }
    }
    printUtf8(`  ✅ Firestore: ${tasks.length} tasks written.`);
  }

  // --- Step C: Restore to Supabase ---
  printUtf8(`\n⚡ Restoring to SUPABASE...`);
  // 1. Project doc
  const { error: projErr } = await supabase.from('projects').upsert({
    id: PROJ_UUID,
    name: projectDoc.name || 'NEXT GEN',
    description: projectDoc.description || '',
    color: projectDoc.color || '#3B82F6',
    owner_id: projectDoc.ownerId || projectDoc.createdBy || '00000000-0000-4000-8000-000000000000'
  });
  if (projErr) console.error('  ❌ Supabase project error:', projErr);
  else printUtf8(`  ✅ Supabase: project '${PROJ_UUID}' written.`);

  // 2. Grid Sheets
  if (gridDataDoc && Array.isArray(gridDataDoc.sheets)) {
    for (let idx = 0; idx < gridDataDoc.sheets.length; idx++) {
      const s = gridDataDoc.sheets[idx];
      const sheetUuid = stringToUuid(`${PROJ_ID}_sheet_${s.id || s.name || idx}`);
      const { error: sheetErr } = await supabase.from('grid_sheets').upsert({
        id: sheetUuid,
        project_id: PROJ_UUID,
        sheet_name: s.name || `Sheet ${idx + 1}`,
        sheet_order: idx,
        columns: s.columns || s.headers || [],
        rows: s.rows || s.cells || s.data || []
      });
      if (sheetErr) console.error(`  ❌ Supabase sheet error (${s.name}):`, sheetErr);
      else printUtf8(`  ✅ Supabase: grid_sheet '${s.name}' (${(s.rows || []).length} rows) written.`);
    }
  }

  // 3. Leads
  for (const ld of leads) {
    const lid = stringToUuid(ld.id || ld._id);
    await supabase.from('project_leads').upsert({
      id: lid,
      project_id: PROJ_UUID,
      title: ld.title || 'Untitled Lead',
      client_name: ld.clientName || '',
      company: ld.company || '',
      email: ld.email || '',
      phone: ld.phone || '',
      value: ld.value || 0,
      currency: ld.currency || 'PKR',
      stage: ld.stage || 'new',
      assigned_to: ld.assignedTo || null,
      assigned_name: ld.assignedToName || null,
      notes: ld.notes || ''
    });
  }
  printUtf8(`  ✅ Supabase: ${leads.length} leads written.`);

  // 4. Tasks
  for (const tk of tasks) {
    const tid = stringToUuid(tk.id || tk._id);
    await supabase.from('project_tasks').upsert({
      id: tid,
      project_id: PROJ_UUID,
      title: tk.title || 'Untitled Task',
      description: tk.description || '',
      status: tk.status || 'pending',
      priority: tk.priority || 'medium',
      assigned_to: tk.assignedTo || null,
      assigned_name: tk.assignedToName || null,
      due_date: tk.dueDate || null,
      created_by: tk.createdBy || 'User'
    });
  }
  printUtf8(`  ✅ Supabase: ${tasks.length} tasks written.`);

  printUtf8(`\n🎉 RESTORATION COMPLETE! 100% Data Restored to both Firestore & Supabase.\n`);
}

function printUtf8(msg: string) {
  try {
    console.log(msg);
  } catch (e) {
    console.log(msg.replace(/[^\x00-\x7F]/g, ""));
  }
}

restore().catch(err => {
  console.error('Fatal restore error:', err);
  process.exit(1);
});
