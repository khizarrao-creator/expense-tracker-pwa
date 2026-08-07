import pkg from 'pg';
const { Client } = pkg;

const hosts = [
  'aws-0-ap-south-1.pooler.supabase.com',
  'aws-0-eu-central-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'aws-0-ap-southeast-1.pooler.supabase.com'
];

async function check() {
  for (const h of hosts) {
    for (const port of [5432, 6543]) {
      for (const u of ['postgres.mlowmkabqzhgxyqikvnk', 'postgres']) {
        const client = new Client({
          host: h,
          port: port,
          user: u,
          password: 'esupBzYMBO6ohIox',
          database: 'postgres',
          ssl: { rejectUnauthorized: false, servername: 'db.mlowmkabqzhgxyqikvnk.supabase.co' },
          connectionTimeoutMillis: 5000
        });
        try {
          await client.connect();
          console.log(`SUCCESS CONNECTED: host=${h} port=${port} user=${u}`);
          await client.end();
          return;
        } catch (e: any) {
          console.log(`Failed host=${h} port=${port} user=${u}: ${e.message}`);
        }
      }
    }
  }
}

check();
