-- ============================================================================
-- THE LEDGER — Complete Supabase PostgreSQL Schema
-- Run this script in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. SYSTEM & CONFIGURATION TABLES
-- ----------------------------------------------------------------------------

-- Global Application Configuration
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscription Plans
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'PKR',
  billing_cycle TEXT DEFAULT 'monthly',
  features TEXT[] DEFAULT '{}',
  limits JSONB DEFAULT '{"aiCallsPerDay": 0, "maxTransactions": 10000}',
  badge_icon TEXT,
  badge_color TEXT,
  display_order INT DEFAULT 0
);

-- Seed default plans
INSERT INTO plans (id, name, price, currency, billing_cycle, features, limits, badge_icon, badge_color, display_order)
VALUES 
  ('standard', 'Standard', 0, 'PKR', 'forever', ARRAY['transactions', 'accounts', 'categories', 'dashboard', 'goals', 'reminders', 'calculator', 'converter', 'tasks', 'loans', 'events', 'fuel', 'reports', 'subscriptions', 'projects'], '{"aiCallsPerDay": 0, "maxTransactions": 10000, "maxUploadsPerDay": 0}'::jsonb, 'shield', '#6B7280', 1),
  ('pro', 'Pro', 600, 'PKR', 'monthly', ARRAY['transactions', 'accounts', 'categories', 'dashboard', 'goals', 'reminders', 'calculator', 'converter', 'tasks', 'loans', 'events', 'fuel', 'reports', 'subscriptions', 'ai-chat', 'projects'], '{"aiCallsPerDay": 50, "maxTransactions": 50000, "maxUploadsPerDay": 10}'::jsonb, 'zap', '#3B82F6', 2),
  ('max', 'Max', 1000, 'PKR', 'monthly', ARRAY['transactions', 'accounts', 'categories', 'dashboard', 'goals', 'reminders', 'calculator', 'converter', 'tasks', 'loans', 'events', 'fuel', 'reports', 'subscriptions', 'ai-chat', 'whatsapp', 'investments', 'projects'], '{"aiCallsPerDay": 150, "maxTransactions": -1, "maxUploadsPerDay": 30}'::jsonb, 'crown', '#F59E0B', 3)
ON CONFLICT (id) DO NOTHING;


-- Payment Receiving Accounts (Admin manual payment methods)
CREATE TABLE IF NOT EXISTS payment_accounts (
  id TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  holder_name TEXT,
  account_number TEXT,
  iban TEXT,
  qr_code_url TEXT,
  instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- 2. USER PROFILES, NOTIFICATIONS & ADMIN LOGS
-- ----------------------------------------------------------------------------

-- User Profiles
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- Firebase Auth UID
  email TEXT NOT NULL,
  display_name TEXT,
  photo_url TEXT,
  last_login TIMESTAMPTZ,
  last_ip TEXT,
  is_pro BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  plan TEXT DEFAULT 'standard' REFERENCES plans(id),
  plan_expires_at TIMESTAMPTZ,
  plan_assigned_by TEXT,
  disabled_features TEXT[] DEFAULT '{}',
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-user Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Global Broadcast Notifications
CREATE TABLE IF NOT EXISTS broadcast_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Admin Audit Logs
CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  admin TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. PERSONAL FINANCE TABLES (SyncManager Engine)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_transactions (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount NUMERIC(12,2) NOT NULL,
  to_amount NUMERIC(12,2),
  exchange_rate NUMERIC(12,6),
  transfer_fee NUMERIC(12,2) DEFAULT 0,
  category TEXT,
  subcategory TEXT,
  description TEXT,
  date TEXT NOT NULL,
  payment_method TEXT DEFAULT '',
  account_id TEXT,
  to_account_id TEXT,
  event_id TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_accounts (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  initial_balance NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'PKR',
  color TEXT,
  is_default BOOLEAN DEFAULT false,
  display_order INT DEFAULT 0,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_categories (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('income', 'expense')),
  icon TEXT DEFAULT '',
  color TEXT,
  parent_id TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_goals (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount NUMERIC(12,2),
  category_id TEXT,
  deadline TEXT,
  linked_accounts TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_investments (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT DEFAULT 'Unnamed Investment',
  type TEXT DEFAULT 'Crypto',
  units NUMERIC(18,8) DEFAULT 0,
  average_buy_price NUMERIC(18,8) DEFAULT 0,
  trade_avg_buy_price NUMERIC(18,8) DEFAULT 0,
  current_price NUMERIC(18,8) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  buy_exchange_rate NUMERIC(12,6) DEFAULT 1,
  current_exchange_rate NUMERIC(12,6) DEFAULT 1,
  funding_account_id TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_reminders (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(12,2),
  due_date TEXT,
  frequency TEXT,
  category_id TEXT,
  status TEXT DEFAULT 'pending',
  whatsapp_phone TEXT,
  whatsapp_name TEXT,
  whatsapp_date TEXT,
  whatsapp_time TEXT,
  whatsapp_sent INT DEFAULT 0,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_tasks (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  due_date TEXT,
  due_time TEXT,
  reminder_enabled INT DEFAULT 0,
  reminder_offset INT DEFAULT 5,
  reminder_sent INT DEFAULT 0,
  priority TEXT DEFAULT 'medium',
  category TEXT,
  time_spent INT DEFAULT 0,
  last_started_at TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_task_logs (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  notes TEXT,
  duration INT DEFAULT 0,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_loan_parties (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_loans (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('given', 'taken')),
  party_id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  due_date TEXT,
  category TEXT DEFAULT 'Personal',
  interest_rate NUMERIC(5,2) DEFAULT 0,
  interest_type TEXT DEFAULT 'none',
  status TEXT DEFAULT 'open',
  account_id TEXT,
  loss_amount NUMERIC(12,2) DEFAULT 0,
  loss_remarks TEXT,
  event_id TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_loan_repayments (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loan_id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  account_id TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_events (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  total_cost NUMERIC(12,2) DEFAULT 0,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_fuel_logs (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fuel_type TEXT,
  price_per_liter NUMERIC(8,2),
  total_cost NUMERIC(10,2),
  liters NUMERIC(8,2),
  date TEXT NOT NULL,
  transaction_id TEXT,
  vehicle_id TEXT,
  attachment_url TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_config (
  key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value TEXT,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (key, user_id)
);

CREATE TABLE IF NOT EXISTS user_vehicles (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  custom_type TEXT,
  purchase_date TEXT,
  purchase_price NUMERIC(12,2),
  seller_info TEXT,
  chassis_number TEXT,
  engine_number TEXT,
  license_plate TEXT,
  reg_book_url TEXT,
  insurance_url TEXT,
  license_url TEXT,
  photos_url TEXT,
  service_records_url TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_vehicle_expenses (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL,
  expense_type TEXT,
  cost NUMERIC(10,2),
  date TEXT NOT NULL,
  description TEXT,
  attachment_url TEXT,
  transaction_id TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_vehicle_reminders (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL,
  service_type TEXT,
  reminder_type TEXT,
  target_date TEXT,
  target_mileage NUMERIC(10,1),
  status TEXT DEFAULT 'pending',
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

-- ----------------------------------------------------------------------------
-- 4. COLLABORATIVE PROJECTS MODULE
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#3B82F6',
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  photo_url TEXT,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'team_lead', 'line_manager')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_invites (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT,
  invited_email TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  invited_by_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS project_tasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'done')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  assigned_to TEXT,
  assigned_name TEXT,
  due_date TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grid_sheets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sheet_name TEXT NOT NULL DEFAULT 'Sheet 1',
  sheet_order INT DEFAULT 0,
  columns JSONB DEFAULT '[]',
  rows JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_leads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  client_name TEXT DEFAULT '',
  company TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  value NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'PKR',
  stage TEXT DEFAULT 'new' CHECK (stage IN ('new','contacted','qualified','proposal','won','lost')),
  assigned_to TEXT,
  assigned_name TEXT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. PAYMENT REQUESTS & AI SESSIONS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id),
  selected_plan TEXT NOT NULL,
  payment_method TEXT DEFAULT 'Manual',
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'PKR',
  transaction_id TEXT NOT NULL,
  screenshot_url TEXT,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  user_coords JSONB,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_sessions (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ----------------------------------------------------------------------------
-- 6. INDEXES & PERFORMANCE OPTIMIZATION
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_user_transactions_user ON user_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_transactions_date ON user_transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_user_accounts_user ON user_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_categories_user ON user_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_leads_project ON project_leads(project_id);
CREATE INDEX IF NOT EXISTS idx_grid_sheets_project ON grid_sheets(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_user ON payment_requests(user_id);

-- ----------------------------------------------------------------------------
-- 7. SUPABASE REALTIME PUBLICATION
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE 
  users, notifications, broadcast_notifications, app_config, plans,
  user_transactions, user_accounts, user_categories, user_goals,
  user_investments, user_reminders, user_tasks, user_task_logs,
  user_loan_parties, user_loans, user_loan_repayments, user_events,
  user_fuel_logs, user_config, user_vehicles, user_vehicle_expenses,
  user_vehicle_reminders,
  projects, project_members, project_invites, project_tasks,
  grid_sheets, project_leads, payment_requests;

-- ----------------------------------------------------------------------------
-- 8. SCHEMA PATCH & RLS PERMISSIONS FOR CLIENT ACCESS
-- ----------------------------------------------------------------------------

-- Add missing columns to existing user_accounts table
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS balance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'PKR';
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

-- Add missing columns to existing user_categories table
ALTER TABLE user_categories ADD COLUMN IF NOT EXISTS color TEXT;

-- Add missing columns to existing user_transactions table
ALTER TABLE user_transactions ADD COLUMN IF NOT EXISTS to_amount NUMERIC(12,2);
ALTER TABLE user_transactions ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(12,6);
ALTER TABLE user_transactions ADD COLUMN IF NOT EXISTS transfer_fee NUMERIC(12,2) DEFAULT 0;

-- Add missing columns to existing user_investments table
ALTER TABLE user_investments ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE user_investments ADD COLUMN IF NOT EXISTS buy_exchange_rate NUMERIC(12,6) DEFAULT 1;
ALTER TABLE user_investments ADD COLUMN IF NOT EXISTS current_exchange_rate NUMERIC(12,6) DEFAULT 1;
ALTER TABLE user_investments ADD COLUMN IF NOT EXISTS trade_avg_buy_price NUMERIC(18,8) DEFAULT 0;
ALTER TABLE user_investments ADD COLUMN IF NOT EXISTS funding_account_id TEXT;

-- Disable Row Level Security (RLS) across tables for Firebase-authenticated clients
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_goals DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_investments DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_reminders DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_task_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_loan_parties DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_loans DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_loan_repayments DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_fuel_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_vehicles DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_vehicle_expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_vehicle_reminders DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_invites DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE grid_sheets DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs DISABLE ROW LEVEL SECURITY;
