import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

function stringToUuid(s: string): string {
  if (!s) return '00000000-0000-4000-8000-000000000000';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s;
  const h = crypto.createHash('md5').update(s).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}

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

      // Helper to process generic collection files
      const processUserCollection = async (subName: string, tableName: string, mapFn: (item: any) => any) => {
        const file = path.join(uDir, `users_${uid}_${subName}.json`);
        if (fs.existsSync(file)) {
          const items = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (items.length > 0) {
            console.log(`[User ${uid}] Migrating ${items.length} ${subName}...`);
            for (const item of items) {
              const payload = mapFn(item);
              if (payload) {
                await supabase.from(tableName).upsert(payload);
              }
            }
          }
        }
      };

      // Transactions
      await processUserCollection('transactions', 'user_transactions', t => ({
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
      }));

      // Accounts
      await processUserCollection('accounts', 'user_accounts', a => ({
        id: a.id || a._id,
        user_id: uid,
        name: a.name,
        type: a.type,
        initial_balance: a.initial_balance || 0,
        color: a.color || null,
        device_id: a.deviceId || null,
        created_at: a.created_at || new Date().toISOString(),
        updated_at: a.updated_at || new Date().toISOString()
      }));

      // Categories
      await processUserCollection('categories', 'user_categories', c => ({
        id: c.id || c._id,
        user_id: uid,
        name: c.name,
        type: c.type,
        icon: c.icon || '',
        parent_id: c.parent_id || null,
        device_id: c.deviceId || null,
        created_at: c.created_at || new Date().toISOString(),
        updated_at: c.updated_at || new Date().toISOString()
      }));

      // Goals
      await processUserCollection('goals', 'user_goals', g => ({
        id: g.id || g._id,
        user_id: uid,
        name: g.name,
        target_amount: g.target_amount || 0,
        category_id: g.category_id || null,
        deadline: g.deadline || null,
        linked_accounts: g.linked_accounts || null,
        device_id: g.deviceId || null,
        created_at: g.created_at || new Date().toISOString(),
        updated_at: g.updated_at || new Date().toISOString()
      }));

      // Investments
      await processUserCollection('investments', 'user_investments', i => ({
        id: i.id || i._id,
        user_id: uid,
        name: i.name || 'Unnamed Investment',
        type: i.type || 'Crypto',
        units: i.units || 0,
        average_buy_price: i.average_buy_price || 0,
        current_price: i.current_price || 0,
        device_id: i.deviceId || null,
        created_at: i.created_at || new Date().toISOString(),
        updated_at: i.updated_at || new Date().toISOString()
      }));

      // Reminders
      await processUserCollection('reminders', 'user_reminders', r => ({
        id: r.id || r._id,
        user_id: uid,
        title: r.title,
        amount: r.amount || null,
        due_date: r.due_date || null,
        frequency: r.frequency || null,
        category_id: r.category_id || null,
        status: r.status || 'pending',
        device_id: r.deviceId || null,
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || new Date().toISOString()
      }));

      // Tasks
      await processUserCollection('tasks', 'user_tasks', tk => ({
        id: tk.id || tk._id,
        user_id: uid,
        title: tk.title,
        description: tk.description || '',
        status: tk.status || 'pending',
        due_date: tk.due_date || null,
        priority: tk.priority || 'medium',
        category: tk.category || null,
        device_id: tk.deviceId || null,
        created_at: tk.created_at || new Date().toISOString(),
        updated_at: tk.updated_at || new Date().toISOString()
      }));

      // Loans
      await processUserCollection('loans', 'user_loans', l => ({
        id: l.id || l._id,
        user_id: uid,
        direction: l.direction,
        party_id: l.party_id,
        amount: l.amount,
        description: l.description || null,
        date: l.date,
        due_date: l.due_date || null,
        category: l.category || 'Personal',
        interest_rate: l.interest_rate || 0,
        interest_type: l.interest_type || 'none',
        status: l.status || 'open',
        account_id: l.account_id || null,
        loss_amount: l.loss_amount || 0,
        loss_remarks: l.loss_remarks || null,
        event_id: l.event_id || null,
        device_id: l.deviceId || null,
        created_at: l.created_at || new Date().toISOString(),
        updated_at: l.updated_at || new Date().toISOString()
      }));

      // Loan Parties
      await processUserCollection('loan_parties', 'user_loan_parties', lp => ({
        id: lp.id || lp._id,
        user_id: uid,
        name: lp.name,
        phone: lp.phone || null,
        email: lp.email || null,
        notes: lp.notes || null,
        device_id: lp.deviceId || null,
        created_at: lp.created_at || new Date().toISOString(),
        updated_at: lp.updated_at || new Date().toISOString()
      }));

      // Loan Repayments
      await processUserCollection('loan_repayments', 'user_loan_repayments', lr => ({
        id: lr.id || lr._id,
        user_id: uid,
        loan_id: lr.loan_id,
        amount: lr.amount,
        date: lr.date,
        notes: lr.notes || null,
        account_id: lr.account_id || null,
        device_id: lr.deviceId || null,
        created_at: lr.created_at || new Date().toISOString(),
        updated_at: lr.updated_at || new Date().toISOString()
      }));

      // Events
      await processUserCollection('events', 'user_events', ev => ({
        id: ev.id || ev._id,
        user_id: uid,
        name: ev.name,
        description: ev.description || null,
        date: ev.date,
        total_cost: ev.total_cost || 0,
        device_id: ev.deviceId || null,
        created_at: ev.created_at || new Date().toISOString(),
        updated_at: ev.updated_at || new Date().toISOString()
      }));

      // Vehicles
      await processUserCollection('vehicles', 'user_vehicles', v => ({
        id: v.id || v._id,
        user_id: uid,
        name: v.name,
        type: v.type,
        custom_type: v.custom_type || null,
        purchase_date: v.purchase_date || null,
        purchase_price: v.purchase_price || null,
        seller_info: v.seller_info || null,
        chassis_number: v.chassis_number || null,
        engine_number: v.engine_number || null,
        license_plate: v.license_plate || null,
        device_id: v.deviceId || null,
        created_at: v.created_at || new Date().toISOString(),
        updated_at: v.updated_at || new Date().toISOString()
      }));

      // Vehicle Expenses
      await processUserCollection('vehicle_expenses', 'user_vehicle_expenses', ve => ({
        id: ve.id || ve._id,
        user_id: uid,
        vehicle_id: ve.vehicle_id,
        expense_type: ve.expense_type,
        cost: ve.cost,
        date: ve.date,
        description: ve.description || null,
        attachment_url: ve.attachment_url || null,
        transaction_id: ve.transaction_id || null,
        device_id: ve.deviceId || null,
        created_at: ve.created_at || new Date().toISOString(),
        updated_at: ve.updated_at || new Date().toISOString()
      }));

      // Vehicle Reminders
      await processUserCollection('vehicle_reminders', 'user_vehicle_reminders', vr => ({
        id: vr.id || vr._id,
        user_id: uid,
        vehicle_id: vr.vehicle_id,
        service_type: vr.service_type,
        reminder_type: vr.reminder_type,
        target_date: vr.target_date || null,
        target_mileage: vr.target_mileage || null,
        status: vr.status || 'pending',
        device_id: vr.deviceId || null,
        created_at: vr.created_at || new Date().toISOString(),
        updated_at: vr.updated_at || new Date().toISOString()
      }));

      // Fuel Logs
      await processUserCollection('fuel_logs', 'user_fuel_logs', fl => ({
        id: fl.id || fl._id,
        user_id: uid,
        fuel_type: fl.fuel_type,
        price_per_liter: fl.price_per_liter || 0,
        total_cost: fl.total_cost || 0,
        liters: fl.liters || 0,
        date: fl.date,
        transaction_id: fl.transaction_id || null,
        vehicle_id: fl.vehicle_id || null,
        attachment_url: fl.attachment_url || null,
        device_id: fl.deviceId || null,
        created_at: fl.created_at || new Date().toISOString(),
        updated_at: fl.updated_at || new Date().toISOString()
      }));

      // Task Logs
      await processUserCollection('task_logs', 'user_task_logs', tl => ({
        id: tl.id || tl._id,
        user_id: uid,
        task_id: tl.task_id,
        type: tl.type,
        timestamp: tl.timestamp,
        notes: tl.notes || null,
        duration: tl.duration || 0,
        device_id: tl.deviceId || null,
        created_at: tl.created_at || new Date().toISOString(),
        updated_at: tl.updated_at || new Date().toISOString()
      }));

      // Config / Budgets
      await processUserCollection('config', 'user_config', cfg => ({
        key: cfg.key || cfg._id || cfg.id,
        user_id: uid,
        value: typeof cfg.value === 'object' ? JSON.stringify(cfg.value) : String(cfg.value || ''),
        device_id: cfg.deviceId || null,
        updated_at: cfg.updated_at || new Date().toISOString()
      }));
    }
  }

  // 3. Migrate Projects & Sub-items
  const projectsFile = path.join(backupDir, 'projects.json');
  if (fs.existsSync(projectsFile)) {
    const projects = JSON.parse(fs.readFileSync(projectsFile, 'utf8'));
    console.log(`Migrating ${projects.length} projects...`);
    for (const p of projects) {
      const projId = p._id || p.id;
      const projUuid = stringToUuid(projId);

      await supabase.from('projects').upsert({
        id: projUuid,
        name: p.name,
        description: p.description || p.whiteboardText || '',
        color: p.color || '#3B82F6',
        owner_id: p.ownerId || p.owner_id || p.createdBy || p.createdByUid
      });

      if (p.members && Array.isArray(p.members)) {
        for (const m of p.members) {
          await supabase.from('project_members').upsert({
            project_id: projUuid,
            user_id: m.id || m.userId,
            email: m.email || '',
            display_name: m.displayName || m.name || null,
            photo_url: m.photoURL || null,
            role: m.role || 'member'
          }, { onConflict: 'project_id,user_id' });
        }
      }

      // Migrate Project Subcollections (tasks, leads, grid)
      const subDir = path.join(backupDir, 'projects_sub', projId);
      if (fs.existsSync(subDir)) {
        // Tasks
        const tasksFile = path.join(subDir, `projects_${projId}_tasks.json`);
        if (fs.existsSync(tasksFile)) {
          const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
          for (const tk of tasks) {
            await supabase.from('project_tasks').upsert({
              id: stringToUuid(tk._id || tk.id),
              project_id: projUuid,
              title: tk.title,
              description: tk.description || '',
              status: tk.status || 'pending',
              priority: tk.priority || 'medium',
              assigned_to: tk.assignedTo || null,
              assigned_name: tk.assignedToName || null,
              due_date: tk.dueDate || null,
              created_by: tk.createdBy || p.createdBy || 'User'
            });
          }
        }

        // Leads
        const leadsFile = path.join(subDir, `projects_${projId}_leads.json`);
        if (fs.existsSync(leadsFile)) {
          const leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8'));
          for (const ld of leads) {
            await supabase.from('project_leads').upsert({
              id: stringToUuid(ld._id || ld.id),
              project_id: projUuid,
              title: ld.title,
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
        }

        // Grid
        const gridFile = path.join(subDir, `projects_${projId}_grid.json`);
        if (fs.existsSync(gridFile)) {
          const grids = JSON.parse(fs.readFileSync(gridFile, 'utf8'));
          for (const g of grids) {
            await supabase.from('grid_sheets').upsert({
              id: stringToUuid(g._id || g.id),
              project_id: projUuid,
              sheet_name: g.name || g.sheetName || 'Sheet 1',
              sheet_order: g.sheetOrder || 0,
              columns: g.columns || [],
              rows: g.rows || []
            });
          }
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
