import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: 'aws-0-ap-south-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.mlowmkabqzhgxyqikvnk',
  password: process.env.SUPABASE_DB_PASSWORD || 'esupBzYMBO6ohIox',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
};

async function fixTypes() {
  const client = new Client(dbConfig);
  await client.connect();
  console.log('[SchemaFix] Connected directly to Supabase PostgreSQL...');

  const sql = `
    -- Alter UUID columns to TEXT for projects and project sub-tables
    ALTER TABLE IF EXISTS projects ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS projects ALTER COLUMN owner_id TYPE TEXT USING owner_id::text;

    ALTER TABLE IF EXISTS project_members ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS project_members ALTER COLUMN project_id TYPE TEXT USING project_id::text;
    ALTER TABLE IF EXISTS project_members ALTER COLUMN user_id TYPE TEXT USING user_id::text;

    ALTER TABLE IF EXISTS project_invites ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS project_invites ALTER COLUMN project_id TYPE TEXT USING project_id::text;

    ALTER TABLE IF EXISTS project_tasks ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS project_tasks ALTER COLUMN project_id TYPE TEXT USING project_id::text;

    ALTER TABLE IF EXISTS grid_sheets ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS grid_sheets ALTER COLUMN project_id TYPE TEXT USING project_id::text;

    ALTER TABLE IF EXISTS project_leads ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS project_leads ALTER COLUMN project_id TYPE TEXT USING project_id::text;

    ALTER TABLE IF EXISTS payment_requests ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS notifications ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS broadcast_notifications ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS admin_logs ALTER COLUMN id TYPE TEXT USING id::text;
  `;

  try {
    await client.query(sql);
    console.log('[SchemaFix] ✅ Successfully altered all UUID columns to TEXT across project & system tables!');
  } catch (err: any) {
    console.error('[SchemaFix] Error altering columns:', err.message);
  } finally {
    await client.end();
  }
}

fixTypes().catch(console.error);
