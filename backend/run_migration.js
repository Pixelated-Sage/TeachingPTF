require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

async function run() {
  const files = [
    'schema.sql',
    'migration_indexes.sql',
    'migration_upsert_constraints.sql',
    'migration_neon_fix.sql',
    'migration_submissions_fix.sql',
  ];

  for (const file of files) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) { console.log(`SKIP: ${file} not found`); continue; }
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`\n Running ${file}...`);
    try {
      await pool.query(sql);
      console.log(`OK: ${file} applied successfully.`);
    } catch (err) {
      console.error(`ERROR in ${file}:`, err.message);
    }
  }

  await pool.end();
  console.log('\nAll done!');
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
