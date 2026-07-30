import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) are required in .env!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function findLatestBackupDir(): Promise<string | null> {
  const backupParent = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupParent)) return null;

  const files = fs.readdirSync(backupParent)
    .filter(f => f.startsWith('firestore-export-'))
    .sort()
    .reverse();

  return files.length > 0 ? path.join(backupParent, files[0]) : null;
}

async function migrate() {
  const backupDir = await findLatestBackupDir();
  if (!backupDir) {
    console.error('No backup directory found in backups/firestore-export-*');
    process.exit(1);
  }

  console.log(`Starting migration from backup directory: ${backupDir}`);

  // 1. Migrate Users
  const usersFile = path.join(backupDir, 'registered_users.json');
  if (fs.existsSync(usersFile)) {
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    console.log(`Migrating ${users.length} users to Supabase 'users' table...`);
    for (const u of users) {
      await supabase.from('users').upsert({
        id: u._id,
        email: u.email || 'unknown@user.com',
        display_name: u.displayName || null,
        photo_url: u.photoURL || null,
        last_login: u.lastLogin ? new Date(u.lastLogin).toISOString() : null,
        last_ip: u.lastIP || null,
        is_pro: !!u.isPro,
        is_banned: !!u.isBanned,
        plan: u.plan || (u.isPro ? 'pro' : 'standard'),
        disabled_features: u.disabledFeatures || [],
        stats: u.stats || {}
      });
    }
  }

  // 2. Migrate Personal Collections for each User
  const usersSubDir = path.join(backupDir, 'users_sub');
  if (fs.existsSync(usersSubDir)) {
    const uids = fs.readdirSync(usersSubDir);
    for (const uid of uids) {
      const uDir = path.join(usersSubDir, uid);

      // Transactions
      const txFile = path.join(uDir, 'users_' + uid + '_transactions.json');
      if (fs.existsSync(txFile)) {
        const txs = JSON.parse(fs.readFileSync(txFile, 'utf8'));
        console.log(`[User ${uid}] Migrating ${txs.length} transactions...`);
        for (const t of txs) {
          await supabase.from('user_transactions').upsert({
            id: t.id || t._id,
            user_id: uid,
            type: t.type,
            amount: t.amount,
            category: t.category || null,
            subcategory: t.subcategory || null,
            description: t.description || null,
            date: t.date,
            payment_method: t.payment_method || '',
            account_id: t.account_id || null,
            to_account_id: t.to_account_id || null,
            event_id: t.event_id || null,
            device_id: t.deviceId || null,
            created_at: t.created_at || new Date().toISOString(),
            updated_at: t.updated_at || new Date().toISOString()
          });
        }
      }

      // Accounts
      const accFile = path.join(uDir, 'users_' + uid + '_accounts.json');
      if (fs.existsSync(accFile)) {
        const accs = JSON.parse(fs.readFileSync(accFile, 'utf8'));
        for (const a of accs) {
          await supabase.from('user_accounts').upsert({
            id: a.id || a._id,
            user_id: uid,
            name: a.name,
            type: a.type,
            initial_balance: a.initial_balance || 0,
            color: a.color || null,
            device_id: a.deviceId || null,
            created_at: a.created_at || new Date().toISOString(),
            updated_at: a.updated_at || new Date().toISOString()
          });
        }
      }

      // Categories
      const catFile = path.join(uDir, 'users_' + uid + '_categories.json');
      if (fs.existsSync(catFile)) {
        const cats = JSON.parse(fs.readFileSync(catFile, 'utf8'));
        for (const c of cats) {
          await supabase.from('user_categories').upsert({
            id: c.id || c._id,
            user_id: uid,
            name: c.name,
            type: c.type,
            icon: c.icon || '',
            parent_id: c.parent_id || null,
            device_id: c.deviceId || null,
            created_at: c.created_at || new Date().toISOString(),
            updated_at: c.updated_at || new Date().toISOString()
          });
        }
      }
    }
  }

  // 3. Migrate Projects & Sub-items
  const projectsFile = path.join(backupDir, 'projects.json');
  if (fs.existsSync(projectsFile)) {
    const projects = JSON.parse(fs.readFileSync(projectsFile, 'utf8'));
    console.log(`Migrating ${projects.length} projects...`);
    for (const p of projects) {
      await supabase.from('projects').upsert({
        id: p._id,
        name: p.name,
        description: p.description || '',
        color: p.color || '#3B82F6',
        owner_id: p.ownerId || p.owner_id
      });

      if (p.members && Array.isArray(p.members)) {
        for (const m of p.members) {
          await supabase.from('project_members').upsert({
            project_id: p._id,
            user_id: m.id || m.userId,
            email: m.email || '',
            display_name: m.displayName || m.name || null,
            photo_url: m.photoURL || null,
            role: m.role || 'member'
          }, { onConflict: 'project_id,user_id' });
        }
      }
    }
  }

  console.log('\n✅ Data migration to Supabase complete!');
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
